import { createHash, randomUUID } from 'crypto';
import type { Database } from 'sqlite';
import { normalizeTransactionType, transactionTypeLabel, type TransactionType } from '../utils/transactionType';
import { isValidDateOnly } from '../utils/validation';
import { isCreditAccountType } from '../utils/accountType';
import { validateAndAllocatePlanMatch, type ImportKind, type PlanMatchSelection } from './statementImportMatching';
import { linkImportedTransfer, removeTransferLinkForTransaction, type ImportedTransactionKind, StatementTransferError } from './statementTransfer';
import { removeAllocationsForActual } from './planAllocations';

export const BANK_STATEMENT_SOURCE = 'CSV bankowy';
export const CREDIT_CARD_STATEMENT_SOURCE = 'CSV karty kredytowej';
const MAX_IMPORT_ROWS = 5000;
const MAX_SOURCE_KEY_LENGTH = 20_000;

export interface ImportedTransactionInput {
  sourceKey?: unknown;
  name?: unknown;
  amount?: unknown;
  date?: unknown;
  occurredAt?: unknown;
  category?: unknown;
  currency?: unknown;
  transactionType?: unknown;
  customTypeId?: unknown;
  excludeFromAnalysis?: unknown;
  resolution?: unknown;
  planMatch?: unknown;
  planMatches?: unknown;
  existingTransactionId?: unknown;
  transferTarget?: unknown;
  bankStatus?: unknown;
  transferSuggested?: unknown;
}

type ImportedBankStatus = 'completed' | 'pending' | 'cancelled';

interface NormalizedImportedTransaction {
  sourceKey: string;
  name: string;
  amount: number;
  date: string;
  occurredAt: string;
  category: string;
  currency: 'PLN';
  transactionType: TransactionType | null;
  customTypeId: number | null;
  excludeFromAnalysis: boolean;
  resolution: 'new' | 'transfer' | 'plan' | 'existing';
  planMatches: PlanMatchSelection[];
  existingTransactionId: number | null;
  transferTarget: { kind: ImportedTransactionKind; transactionId: number } | null;
  bankStatus: ImportedBankStatus;
}

export interface StatementImportResult {
  importedExpenses: number;
  importedIncomes: number;
  duplicates: number;
  matchedPlans: number;
  reconciledExisting: number;
  linkedTransfers: number;
  refreshedTransactions: number;
}

export class StatementImportValidationError extends Error {}

export function statementSourceForAccountType(accountType: unknown): typeof BANK_STATEMENT_SOURCE | typeof CREDIT_CARD_STATEMENT_SOURCE {
  return isCreditAccountType(accountType) ? CREDIT_CARD_STATEMENT_SOURCE : BANK_STATEMENT_SOURCE;
}

function normalizeOccurredAt(value: unknown, date: string): string {
  if (value === undefined || value === null || value === '') return `${date} 12:00:00`;
  if (typeof value !== 'string') throw new StatementImportValidationError('Nieprawidłowy czas wykonania transakcji.');
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match || match[1] !== date) throw new StatementImportValidationError('Nieprawidłowy czas wykonania transakcji.');
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4] ?? '0');
  if (hour > 23 || minute > 59 || second > 59) throw new StatementImportValidationError('Nieprawidłowy czas wykonania transakcji.');
  return `${date} ${match[2]}:${match[3]}:${String(second).padStart(2, '0')}`;
}

function normalizeTransaction(item: ImportedTransactionInput): NormalizedImportedTransaction {
  const amount = Number(item.amount);
  const name = (typeof item.name === 'string' ? item.name.trim().slice(0, 240) : '') || 'Operacja bankowa';
  const date = typeof item.date === 'string' ? item.date.trim() : '';
  const category = typeof item.category === 'string' && item.category.trim() ? item.category.trim().slice(0, 80) : 'Inne';
  const currency = typeof item.currency === 'string' ? item.currency.trim().toUpperCase() : 'PLN';
  const sourceKey = typeof item.sourceKey === 'string' ? item.sourceKey : '';
  const transactionType = normalizeTransactionType(item.transactionType);
  const customTypeId = item.customTypeId == null || item.customTypeId === '' ? null : Number(item.customTypeId);
  const resolution = ['new', 'transfer', 'plan', 'existing'].includes(String(item.resolution))
    ? String(item.resolution) as NormalizedImportedTransaction['resolution']
    : 'new';
  const rawPlanMatches = Array.isArray(item.planMatches) ? item.planMatches : item.planMatch ? [item.planMatch] : [];
  const planMatches = resolution === 'plan' ? rawPlanMatches.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const match = raw as Record<string, unknown>;
    return [{ source: match.source as PlanMatchSelection['source'], planId: Number(match.planId), occurrenceDate: match.occurrenceDate == null ? null : String(match.occurrenceDate), amount: match.amount === undefined ? undefined : Number(match.amount) }];
  }) : [];
  const existingTransactionId = resolution === 'existing' ? Number(item.existingTransactionId) : null;
  const rawTransferTarget = item.transferTarget && typeof item.transferTarget === 'object'
    ? item.transferTarget as Record<string, unknown>
    : null;
  const transferTarget = resolution === 'transfer' && rawTransferTarget
    ? { kind: rawTransferTarget.kind as ImportedTransactionKind, transactionId: Number(rawTransferTarget.transactionId) }
    : null;
  const bankStatus = ['completed', 'pending', 'cancelled'].includes(String(item.bankStatus))
    ? String(item.bankStatus) as ImportedBankStatus
    : 'completed';

  if (!Number.isFinite(amount) || amount === 0 || !isValidDateOnly(date) || !sourceKey || sourceKey.length > MAX_SOURCE_KEY_LENGTH) {
    throw new StatementImportValidationError('Jedna z transakcji ma nieprawidłową kwotę, datę lub identyfikator.');
  }
  if (currency !== 'PLN') {
    throw new StatementImportValidationError('Import obsługuje wyłącznie transakcje w PLN.');
  }
  if (transactionType === undefined) {
    throw new StatementImportValidationError('Jedna z transakcji ma nieprawidłowy typ.');
  }
  if (customTypeId !== null && !Number.isInteger(customTypeId)) throw new StatementImportValidationError('Nieprawidłowa etykieta.');
  if (resolution === 'plan' && (!planMatches.length || planMatches.some((match) => !['one_time', 'recurring'].includes(match.source) || !Number.isInteger(match.planId) || match.planId <= 0 || (match.amount !== undefined && (!Number.isFinite(match.amount) || Number(match.amount) <= 0))))) {
    throw new StatementImportValidationError('Nieprawidłowe dopasowanie do planu.');
  }
  if (resolution === 'existing' && (!Number.isInteger(existingTransactionId) || Number(existingTransactionId) <= 0)) {
    throw new StatementImportValidationError('Nieprawidłowe dopasowanie do istniejącej operacji.');
  }
  if (resolution === 'transfer' && (!transferTarget || !['income', 'expense'].includes(transferTarget.kind) || !Number.isInteger(transferTarget.transactionId) || transferTarget.transactionId <= 0)) {
    throw new StatementImportValidationError('Potwierdzenie transferu wymaga wskazania jego drugiej strony.');
  }
  if (bankStatus !== 'completed' && resolution !== 'new') {
    throw new StatementImportValidationError('Operację oczekującą lub anulowaną można wyłącznie zapisać bez rozliczania planu i transferu.');
  }

  return {
    sourceKey,
    name,
    amount: Math.round(amount * 100) / 100,
    date,
    occurredAt: normalizeOccurredAt(item.occurredAt, date),
    category,
    currency: 'PLN',
    transactionType, customTypeId,
    excludeFromAnalysis: item.excludeFromAnalysis === true,
    resolution,
    planMatches,
    existingTransactionId,
    transferTarget,
    bankStatus,
  };
}

export function normalizeImportTransactions(value: unknown): NormalizedImportedTransaction[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_IMPORT_ROWS) {
    throw new StatementImportValidationError('Nieprawidłowe dane importu lub liczba transakcji.');
  }
  return value.map((item) => normalizeTransaction(item as ImportedTransactionInput));
}

export function importFingerprint(accountId: number, sourceKey: string): string {
  return createHash('sha256')
    .update(JSON.stringify([accountId, BANK_STATEMENT_SOURCE, sourceKey]))
    .digest('hex');
}

export async function findImportedSourceKeys(db: Database, accountId: number, sourceKeys: string[], sourceStatuses: Record<string, unknown> = {}): Promise<string[]> {
  const uniqueKeys = [...new Set(sourceKeys.filter((key) => typeof key === 'string' && key && key.length <= MAX_SOURCE_KEY_LENGTH))];
  if (uniqueKeys.length === 0 || uniqueKeys.length > MAX_IMPORT_ROWS) return [];
  const fingerprintsByKey = new Map(uniqueKeys.map((key) => [key, importFingerprint(accountId, key)]));
  const existingStatuses = new Map<string, string>();
  const fingerprints = [...fingerprintsByKey.values()];

  for (let offset = 0; offset < fingerprints.length; offset += 400) {
    const chunk = fingerprints.slice(offset, offset + 400);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = await db.all<{ import_fingerprint: string; import_status: string | null }[]>(
      `SELECT import_fingerprint, import_status FROM wydatki WHERE import_fingerprint IN (${placeholders})
       UNION ALL
       SELECT import_fingerprint, import_status FROM przychody WHERE import_fingerprint IN (${placeholders})`,
      [...chunk, ...chunk],
    );
    rows.forEach((row) => existingStatuses.set(row.import_fingerprint, row.import_status ?? 'completed'));
  }

  return uniqueKeys.filter((key) => {
    const existingStatus = existingStatuses.get(fingerprintsByKey.get(key)!);
    const requestedStatus = ['completed', 'pending', 'cancelled'].includes(String(sourceStatuses[key])) ? String(sourceStatuses[key]) : 'completed';
    return existingStatus === requestedStatus;
  });
}

type PotentialOverlapReason = 'same-transaction' | 'own-transfer';

export interface PotentialStatementOverlap {
  sourceKey: string;
  accountName: string;
  reason: PotentialOverlapReason;
  transactionId: number;
  kind: ImportedTransactionKind;
  transactionName: string;
  transactionDate: string;
  transactionAmount: number;
}

interface OverlapCandidate {
  sourceKey: string;
  name: string;
  amount: number;
  date: string;
  transactionType: TransactionType | null;
  transferSuggested: boolean;
}

function normalizedName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pl-PL')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function overlapCandidates(value: unknown): OverlapCandidate[] {
  if (!Array.isArray(value) || value.length > MAX_IMPORT_ROWS) return [];
  return value.flatMap((raw) => {
    const item = raw as ImportedTransactionInput;
    const sourceKey = typeof item.sourceKey === 'string' ? item.sourceKey : '';
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const amount = Number(item.amount);
    const date = typeof item.date === 'string' ? item.date.trim() : '';
    const transactionType = normalizeTransactionType(item.transactionType);
    if (!sourceKey || sourceKey.length > MAX_SOURCE_KEY_LENGTH || !name || !Number.isFinite(amount) || amount === 0 || !isValidDateOnly(date) || transactionType === undefined) return [];
    return [{ sourceKey, name, amount: Math.round(amount * 100) / 100, date, transactionType, transferSuggested: item.transferSuggested === true }];
  });
}

function daysBetween(left: string, right: string): number {
  return Math.abs(Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`)) / 86_400_000;
}

export async function findPotentialStatementOverlaps(
  db: Database,
  accountId: number,
  value: unknown,
  transferDateTolerance = 3,
  detectTransferSuggestions = true,
): Promise<PotentialStatementOverlap[]> {
  const candidates = overlapCandidates(value);
  if (!candidates.length) return [];
  const dates = candidates.map((candidate) => candidate.date).sort();
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];
  const currentAccount = await db.get<{ typ_depozytu: string }>('SELECT typ_depozytu FROM konta WHERE id = ?', accountId);
  const currentIsCreditCard = isCreditAccountType(currentAccount?.typ_depozytu);
  const rows = await db.all<Array<{ id: number; account_id: number; account_name: string; account_type: string; kind: 'expense' | 'income'; name: string; amount: number; date: string; transaction_type: TransactionType | null }>>(
    `SELECT w.id, k.id AS account_id, k.nazwa AS account_name, k.typ_depozytu AS account_type, 'expense' AS kind, w.nazwa AS name, w.kwota AS amount, w.data_dodania AS date, w.transaction_type
      FROM wydatki w JOIN konta k ON k.id = w.account_id
      WHERE w.account_id <> ? AND w.import_fingerprint IS NOT NULL
        AND COALESCE(w.zrealizowany, 0) IN (1, '1', 'true')
        AND COALESCE(w.import_status, 'completed') = 'completed'
        AND NOT EXISTS (SELECT 1 FROM statement_cross_transaction_links linked
          WHERE (linked.left_kind = 'expense' AND linked.left_transaction_id = w.id)
             OR (linked.right_kind = 'expense' AND linked.right_transaction_id = w.id))
        AND date(w.data_dodania) BETWEEN date(?, '-' || ? || ' days') AND date(?, '+' || ? || ' days')
     UNION ALL
     SELECT p.id, k.id AS account_id, k.nazwa AS account_name, k.typ_depozytu AS account_type, 'income' AS kind, p.nazwa AS name, p.kwota AS amount, p.data_dodania AS date, p.transaction_type
      FROM przychody p JOIN konta k ON k.id = p.account_id
      WHERE p.account_id <> ? AND p.import_fingerprint IS NOT NULL
        AND COALESCE(p.zrealizowany, 0) IN (1, '1', 'true')
        AND COALESCE(p.import_status, 'completed') = 'completed'
        AND NOT EXISTS (SELECT 1 FROM statement_cross_transaction_links linked
          WHERE (linked.left_kind = 'income' AND linked.left_transaction_id = p.id)
             OR (linked.right_kind = 'income' AND linked.right_transaction_id = p.id))
        AND date(p.data_dodania) BETWEEN date(?, '-' || ? || ' days') AND date(?, '+' || ? || ' days')`,
    [accountId, minDate, transferDateTolerance, maxDate, transferDateTolerance, accountId, minDate, transferDateTolerance, maxDate, transferDateTolerance],
  );
  return candidates.flatMap<PotentialStatementOverlap>((candidate) => {
    const kind = candidate.amount < 0 ? 'expense' : 'income';
    const amountInCents = Math.round(Math.abs(candidate.amount) * 100);
    const name = normalizedName(candidate.name);
    const isCardRepaymentPair = (row: typeof rows[number], distance: number) => detectTransferSuggestions
      && row.kind === kind
      && (currentIsCreditCard || isCreditAccountType(row.account_type))
      && (candidate.transactionType === 'card_repayment' || row.transaction_type === 'card_repayment')
      && distance <= transferDateTolerance;
    const amountMatches = rows.filter((row) => {
      if (Math.round(Math.abs(Number(row.amount)) * 100) !== amountInCents) return false;
      const distance = daysBetween(candidate.date, String(row.date).slice(0, 10));
      return (row.kind === kind && distance <= 1 && name.length >= 3 && normalizedName(row.name) === name)
        || isCardRepaymentPair(row, distance)
        || (detectTransferSuggestions && row.kind !== kind && distance <= transferDateTolerance);
    });
    const sameTransaction = amountMatches.find((row) => {
      if (row.kind !== kind) return false;
      const distance = daysBetween(candidate.date, String(row.date).slice(0, 10));
      return !isCardRepaymentPair(row, distance);
    });
    if (sameTransaction) return [{ sourceKey: candidate.sourceKey, accountName: sameTransaction.account_name, reason: 'same-transaction' as const, transactionId: sameTransaction.id, kind: sameTransaction.kind, transactionName: sameTransaction.name, transactionDate: String(sameTransaction.date).slice(0, 10), transactionAmount: Math.abs(Number(sameTransaction.amount)) }];
    return amountMatches
      .filter((row) => {
        if (row.kind !== kind) return true;
        const distance = daysBetween(candidate.date, String(row.date).slice(0, 10));
        return isCardRepaymentPair(row, distance);
      })
      .map((row) => ({ sourceKey: candidate.sourceKey, accountName: row.account_name, reason: 'own-transfer' as const, transactionId: row.id, kind: row.kind, transactionName: row.name, transactionDate: String(row.date).slice(0, 10), transactionAmount: Math.abs(Number(row.amount)) }));
  });
}

export async function importStatementTransactions(
  db: Database,
  accountId: number,
  accountName: string,
  value: unknown,
  source: typeof BANK_STATEMENT_SOURCE | typeof CREDIT_CARD_STATEMENT_SOURCE = BANK_STATEMENT_SOURCE,
): Promise<StatementImportResult> {
  const transactions = normalizeImportTransactions(value);
  let transactionStarted = false;
  try {
    await db.exec('BEGIN IMMEDIATE');
    transactionStarted = true;
    let importedExpenses = 0;
    let importedIncomes = 0;
    let duplicates = 0;
    let matchedPlans = 0;
    let reconciledExisting = 0;
    let linkedTransfers = 0;
    let refreshedTransactions = 0;
    const batchId = randomUUID();
    const importedTransactions: Array<Record<string, unknown>> = [];
    const activeCustomTypes = await db.all<Array<{ id: number; name: string }>>('SELECT id, name FROM custom_transaction_types WHERE active = 1');
    const activeCustomTypeIds = new Set(activeCustomTypes.map((row) => Number(row.id)));
    const activeCustomTypeNames = new Map(activeCustomTypes.map((row) => [Number(row.id), String(row.name)] as const));

    for (const item of transactions) {
      const fingerprint = importFingerprint(accountId, item.sourceKey);
      const table = item.amount < 0 ? 'wydatki' : 'przychody';
      const actualKind: ImportKind = item.amount < 0 ? 'expense' : 'income';
      const importedIncomeCertainty = item.bankStatus === 'completed' ? 'guaranteed' : 'expected';
      if (item.customTypeId !== null && !activeCustomTypeIds.has(item.customTypeId)) {
        throw new StatementImportValidationError('Nieprawidłowa etykieta importowanej operacji.');
      }
      const description = `Import z ${source} · PLN · konto: ${accountName}`;
      const existingImported = await db.get<{ id: number; import_status: string | null; excluded_from_analysis: unknown }>(
        `SELECT id, import_status, excluded_from_analysis FROM ${table} WHERE import_fingerprint = ? AND account_id = ?`,
        [fingerprint, accountId],
      );
      let transactionId: number | null = null;
      if (existingImported) {
        const previousStatus = existingImported.import_status ?? 'completed';
        if (previousStatus === item.bankStatus) {
          duplicates += 1;
          continue;
        }
        let previouslyExcluded = Number(existingImported.excluded_from_analysis) === 1;
        if (previousStatus === 'completed' && item.bankStatus !== 'completed') {
          await removeTransferLinkForTransaction(db, actualKind, existingImported.id);
          const restored = await db.get<{ excluded_from_analysis: unknown }>(`SELECT excluded_from_analysis FROM ${table} WHERE id = ?`, existingImported.id);
          previouslyExcluded = Number(restored?.excluded_from_analysis) === 1;
        }
        const preserveManualExclusion = previousStatus !== 'cancelled' && previouslyExcluded;
        const nextExcluded = item.bankStatus === 'cancelled' || item.excludeFromAnalysis || preserveManualExclusion;
        await db.run(
          `UPDATE ${table}
              SET nazwa = ?, kwota = ?, kategoria = ?, data_dodania = ?, opis = ?,
                  zrealizowany = ?, import_status = ?, imported_at = datetime('now', 'localtime'),
                  transaction_type = ?, custom_type_id = COALESCE(?, custom_type_id), excluded_from_analysis = ?${actualKind === 'income' ? ', pewnosc = ?' : ''}
            WHERE id = ?`,
          [item.name, Math.abs(item.amount), item.category, item.date, description,
            item.bankStatus === 'completed' ? 1 : 0, item.bankStatus, item.transactionType, item.customTypeId,
            nextExcluded ? 1 : 0,
            ...(actualKind === 'income' ? [importedIncomeCertainty] : []),
            existingImported.id],
        );
        refreshedTransactions += 1;
        transactionId = existingImported.id;
        if (item.bankStatus !== 'completed') {
          await removeAllocationsForActual(db, actualKind, transactionId);
          continue;
        }
      }
      if (item.resolution === 'existing') {
        const existing = await db.get<{ id: number; kwota: number; data_dodania: string; account_id: number | null; import_fingerprint: string | null }>(
          `SELECT id, kwota, data_dodania, account_id, import_fingerprint FROM ${table} WHERE id = ? AND COALESCE(zrealizowany, 0) IN (1, '1', 'true')`,
          item.existingTransactionId,
        );
        if (!existing || Number(existing.account_id) !== accountId || Math.abs(Number(existing.kwota) - Math.abs(item.amount)) >= 0.005 || daysBetween(String(existing.data_dodania).slice(0, 10), item.date) > 31) {
          throw new StatementImportValidationError('Wybrana istniejąca operacja nie pasuje już do importu.');
        }
        if (existing.import_fingerprint && existing.import_fingerprint !== fingerprint) {
          throw new StatementImportValidationError('Wybrana operacja jest już powiązana z innym wierszem importu.');
        }
        try {
          await db.run(
            `UPDATE ${table} SET import_fingerprint = ?, imported_at = datetime('now', 'localtime') WHERE id = ?`,
            [fingerprint, existing.id],
          );
        } catch (error) {
          if (error instanceof Error && /unique/i.test(error.message)) { duplicates += 1; continue; }
          throw error;
        }
        reconciledExisting += 1;
        continue;
      }
      if (transactionId === null) {
        const result = await db.run(
          `INSERT OR IGNORE INTO ${table}
           (nazwa, kwota, kategoria, data_dodania, opis, zrealizowany, account_id, import_fingerprint, import_source, imported_at, transaction_type, custom_type_id, excluded_from_analysis, import_status${actualKind === 'income' ? ', pewnosc' : ''})
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), ?, ?, ?, ?${actualKind === 'income' ? ', ?' : ''})`,
          [item.name, Math.abs(item.amount), item.category, item.date, description, item.bankStatus === 'completed' ? 1 : 0, accountId, fingerprint, source, item.transactionType, item.customTypeId, item.bankStatus === 'cancelled' || item.excludeFromAnalysis ? 1 : 0, item.bankStatus,
            ...(actualKind === 'income' ? [importedIncomeCertainty] : [])],
        );
        if (result.changes === 0) {
          duplicates += 1;
          continue;
        }
        transactionId = Number(result.lastID);
        if (item.amount < 0) importedExpenses += 1;
        else importedIncomes += 1;
      }
      if (item.resolution === 'plan') {
        const requestedTotal = item.planMatches.reduce((sum, match) => sum + Number(match.amount ?? 0), 0);
        if (item.planMatches.length > 1 && requestedTotal > Math.abs(item.amount) + 0.005) {
          throw new StatementImportValidationError('Suma powiązań nie może przekraczać kwoty importowanej operacji.');
        }
        const uniqueTargets = new Set(item.planMatches.map((match) => `${match.source}:${match.planId}:${match.occurrenceDate ?? ''}`));
        if (uniqueTargets.size !== item.planMatches.length) throw new StatementImportValidationError('Ta sama planowana operacja została wskazana więcej niż raz.');
        let unallocated = Math.abs(item.amount);
        for (const match of item.planMatches) {
          if (unallocated <= 0) throw new StatementImportValidationError('Suma powiązań przekracza kwotę importowanej operacji.');
          let allocated: number;

try {
  allocated = await validateAndAllocatePlanMatch(
    db,
    actualKind,
    transactionId,
    unallocated,
    match,
  );
} catch (error) {
  throw new StatementImportValidationError(
    error instanceof Error
      ? error.message
      : "Nie udało się rozliczyć wybranej planowanej operacji.",
  );
}
          unallocated = Math.round((unallocated - allocated) * 100) / 100;
          matchedPlans += 1;
        }
      }
      if (item.resolution === 'transfer' && item.transferTarget) {
        try {
          await linkImportedTransfer(db, actualKind, transactionId, item.transferTarget.kind, item.transferTarget.transactionId);
          linkedTransfers += 1;
        } catch (error) {
          if (error instanceof StatementTransferError) throw new StatementImportValidationError(error.message);
          throw error;
        }
      }
      const directionLabel = item.amount < 0 ? 'Wydatek' : 'Przychód';
      const typeLabel = transactionTypeLabel(item.transactionType);
      const importedDetail = { transaction_id: transactionId, kind: item.amount < 0 ? 'expense' : 'income', name: item.name, amount: Math.abs(item.amount), date: item.occurredAt.replace(' ', 'T'), custom_type_name: item.customTypeId === null ? null : activeCustomTypeNames.get(item.customTypeId) ?? null, category: item.category, transaction_type: item.transactionType, import_status: item.bankStatus, excluded_from_analysis: item.resolution === 'transfer' || item.excludeFromAnalysis };
      importedTransactions.push(importedDetail);
      await db.run(
        `INSERT INTO app_activity_log
         (user_id, timestamp, action_type, entity_type, entity_id, old_data, new_data, metadata, comment)
         VALUES (?, ?, ?, 'konta', ?, NULL, NULL, ?, ?)`,
        ['local', item.occurredAt, item.amount < 0 ? 'IMPORT_EXPENSE' : 'IMPORT_INCOME', accountId,
          JSON.stringify({ source, import_batch_id: batchId, currency: 'PLN', ...importedDetail }),
          `IMPORT · ${directionLabel}: „${item.name}” · ${Math.abs(item.amount).toFixed(2)} PLN · ${typeLabel} · konto: ${accountName}.`],
      );
    }

    await db.run(
      `INSERT INTO app_activity_log
       (user_id, timestamp, action_type, entity_type, entity_id, old_data, new_data, metadata, comment)
       VALUES (?, datetime('now', 'localtime'), ?, ?, ?, NULL, NULL, ?, ?)`,
      ['local', 'IMPORT_BANK_STATEMENT', 'konta', accountId,
        JSON.stringify({ source, batch_id: batchId, account_name: accountName, count: transactions.length, imported_expenses: importedExpenses, imported_incomes: importedIncomes, duplicates, transactions: importedTransactions }),
        `Zaimportowano wyciąg ${source}: ${importedExpenses} wydatków i ${importedIncomes} przychodów; pominięto ${duplicates} duplikatów.`],
    );
    await db.exec('COMMIT');
    transactionStarted = false;
    return { importedExpenses, importedIncomes, duplicates, matchedPlans, reconciledExisting, linkedTransfers, refreshedTransactions };
  } catch (error) {
    if (transactionStarted) await db.exec('ROLLBACK').catch(() => undefined);
    throw error;
  }
}
