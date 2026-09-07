import type { Database } from 'sqlite';
import { isValidDateOnly } from '../utils/validation';
import { addPlanAllocation, allocatedToPlan } from './planAllocations';

export type ImportKind = 'income' | 'expense';
export type PlanSource = 'one_time' | 'recurring';

export interface ImportAnalysisInput {
  sourceKey?: unknown;
  name?: unknown;
  amount?: unknown;
  date?: unknown;
}

export interface PlanMatchCandidate {
  kind: ImportKind;
  source: PlanSource;
  planId: number;
  occurrenceDate: string | null;
  name: string;
  amount: number;
  remainingAmount: number;
  date: string;
  recommended: boolean;
}

export interface ExistingMatchCandidate {
  kind: ImportKind;
  transactionId: number;
  name: string;
  amount: number;
  date: string;
  recommended: boolean;
}

export interface ImportMatchAnalysis {
  sourceKey: string;
  planCandidates: PlanMatchCandidate[];
  existingCandidates: ExistingMatchCandidate[];
}

export interface PlanMatchSelection {
  source: PlanSource;
  planId: number;
  occurrenceDate?: string | null;
  amount?: number;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function dateDistance(left: string, right: string): number {
  return Math.abs(Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`)) / 86_400_000;
}

function normalizedMatchName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function nameTokens(value: string): string[] {
  const ignored = new Set(['payment', 'transfer', 'przelew', 'from', 'to', 'pln', 'eur', 'usd', 'gbp']);
  return normalizedMatchName(value).split(' ').filter((token) => token.length >= 3 && !ignored.has(token));
}

function namesMatch(left: string, right: string): boolean {
  const leftTokens = nameTokens(left);
  const rightTokens = new Set(nameTokens(right));
  return leftTokens.some((token) => rightTokens.has(token));
}

function occurrenceDate(year: number, month: number, day: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(Math.max(1, day), lastDay)).padStart(2, '0')}`;
}

function normalizedInputs(value: unknown): Array<{ sourceKey: string; kind: ImportKind; name: string; amount: number; date: string }> {
  if (!Array.isArray(value) || value.length > 5000) return [];
  return value.flatMap((raw) => {
    const item = raw as ImportAnalysisInput;
    const sourceKey = typeof item.sourceKey === 'string' ? item.sourceKey : '';
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const signedAmount = Number(item.amount);
    const date = typeof item.date === 'string' ? item.date.slice(0, 10) : '';
    if (!sourceKey || !name || !Number.isFinite(signedAmount) || signedAmount === 0 || !isValidDateOnly(date)) return [];
    return [{ sourceKey, kind: signedAmount < 0 ? 'expense' as const : 'income' as const, name, amount: roundMoney(Math.abs(signedAmount)), date }];
  });
}

async function targetAllocated(db: Database, kind: ImportKind, source: PlanSource, planId: number, occurrence: string | null): Promise<number> {
  return allocatedToPlan(db, kind, source, planId, occurrence);
}

async function allocatedTotals(db: Database, kind: ImportKind, source: PlanSource, planIds: number[]): Promise<Map<string, number>> {
  const ids = [...new Set(planIds.filter((id) => Number.isInteger(id)))];
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.all<Array<{ plan_id: number; occurrence_date: string | null; total: number | null }>>(
    `SELECT plan_id, occurrence_date, SUM(allocated_amount) AS total
       FROM transaction_plan_allocations
      WHERE actual_kind = ? AND plan_source = ? AND plan_id IN (${placeholders})
      GROUP BY plan_id, occurrence_date`,
    [kind, source, ...ids],
  );
  return new Map(rows.map((row) => [`${row.plan_id}:${row.occurrence_date ?? ''}`, roundMoney(Number(row.total ?? 0))]));
}

async function planCandidates(db: Database, accountId: number, input: ReturnType<typeof normalizedInputs>[number]): Promise<PlanMatchCandidate[]> {
  const table = input.kind === 'income' ? 'przychody' : 'wydatki';
  const recurringTable = input.kind === 'income' ? 'przychody_stale' : 'wydatki_stale';
  const queueTable = input.kind === 'income' ? 'recurring_income_queue' : 'recurring_expense_queue';
  const queueRuleId = input.kind === 'income' ? 'recurring_income_id' : 'recurring_expense_id';
  const queueExclusion = input.kind === 'income'
    ? `AND NOT EXISTS (SELECT 1 FROM recurring_income_queue q WHERE q.income_id = ${table}.id AND q.status = 'scheduled')`
    : `AND NOT EXISTS (SELECT 1 FROM recurring_expense_queue q WHERE q.expense_id = ${table}.id AND q.status = 'scheduled')`;
  const oneTimeRows = await db.all<Array<{ id: number; nazwa: string; kwota: number; data_dodania: string }>>(
    `SELECT id, nazwa, kwota, data_dodania FROM ${table}
      WHERE COALESCE(zrealizowany, 0) NOT IN (1, '1', 'true')
        AND import_fingerprint IS NULL
        AND COALESCE(excluded_from_analysis, 0) NOT IN (1, '1', 'true')
        AND (account_id IS NULL OR account_id = ?)
        ${queueExclusion}
        AND date(data_dodania) BETWEEN date(?, '-31 days') AND date(?, '+31 days')`,
    [accountId, input.date, input.date],
  );
  const [year, month] = input.date.split('-').map(Number);
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = occurrenceDate(year, month, 31);
  const recurringRows = await db.all<Array<{ id: number; nazwa: string; kwota: number; dzien_miesiaca: number }>>(
    `SELECT id, nazwa, kwota, dzien_miesiaca FROM ${recurringTable}
      WHERE date(data_od) <= date(?) AND (data_do IS NULL OR data_do = '' OR date(data_do) >= date(?))`,
    [monthEnd, monthStart],
  );
  const recurringOverrides = new Set((await db.all<Array<{ rule_id: number; occurrence_date: string }>>(
    `SELECT ${queueRuleId} AS rule_id, occurrence_date FROM ${queueTable}
      WHERE status IN ('dismissed', 'customized') AND date(occurrence_date) BETWEEN date(?) AND date(?)`,
    [monthStart, monthEnd],
  )).map((row) => `${row.rule_id}:${String(row.occurrence_date).slice(0, 10)}`));
  const [oneTimeAllocations, recurringAllocations] = await Promise.all([
    allocatedTotals(db, input.kind, 'one_time', oneTimeRows.map((row) => row.id)),
    allocatedTotals(db, input.kind, 'recurring', recurringRows.map((row) => row.id)),
  ]);

  const candidates: PlanMatchCandidate[] = [];
  for (const row of oneTimeRows) {
    const planned = roundMoney(Number(row.kwota));
    const allocated = oneTimeAllocations.get(`${row.id}:`) ?? 0;
    const remaining = roundMoney(Math.max(0, planned - allocated));
    if (remaining <= 0) continue;
    candidates.push({ kind: input.kind, source: 'one_time', planId: row.id, occurrenceDate: null, name: row.nazwa, amount: planned, remainingAmount: remaining, date: String(row.data_dodania).slice(0, 10), recommended: false });
  }
  for (const row of recurringRows) {
    const occurrence = occurrenceDate(year, month, Number(row.dzien_miesiaca));
    if (recurringOverrides.has(`${row.id}:${occurrence}`)) continue;
    const planned = roundMoney(Number(row.kwota));
    const allocated = recurringAllocations.get(`${row.id}:${occurrence}`) ?? 0;
    const remaining = roundMoney(Math.max(0, planned - allocated));
    if (remaining <= 0) continue;
    candidates.push({ kind: input.kind, source: 'recurring', planId: row.id, occurrenceDate: occurrence, name: row.nazwa, amount: planned, remainingAmount: remaining, date: occurrence, recommended: false });
  }

  candidates.sort((left, right) => {
    const leftAmount = Math.abs(left.remainingAmount - input.amount);
    const rightAmount = Math.abs(right.remainingAmount - input.amount);
    return leftAmount - rightAmount || dateDistance(left.date, input.date) - dateDistance(right.date, input.date);
  });
  const best = candidates[0];
  const second = candidates[1];
  const clear = !!best
    && dateDistance(best.date, input.date) <= 7
    && (input.amount <= best.remainingAmount || Math.abs(input.amount - best.remainingAmount) <= 0.01)
    && namesMatch(best.name, input.name)
    && (!second || Math.abs(best.remainingAmount - input.amount) + dateDistance(best.date, input.date) < Math.abs(second.remainingAmount - input.amount) + dateDistance(second.date, input.date));
  return candidates.slice(0, 20).map((candidate, index) => ({ ...candidate, recommended: clear && index === 0 }));
}

async function existingCandidates(db: Database, accountId: number, input: ReturnType<typeof normalizedInputs>[number]): Promise<ExistingMatchCandidate[]> {
  const table = input.kind === 'income' ? 'przychody' : 'wydatki';
  const rows = await db.all<Array<{ id: number; nazwa: string; kwota: number; data_dodania: string }>>(
    `SELECT id, nazwa, kwota, data_dodania FROM ${table}
      WHERE account_id = ? AND COALESCE(zrealizowany, 0) IN (1, '1', 'true')
        AND import_fingerprint IS NULL
        AND ABS(CAST(kwota AS REAL) - ?) < 0.005
        AND date(data_dodania) BETWEEN date(?, '-31 days') AND date(?, '+31 days')
      ORDER BY ABS(julianday(data_dodania) - julianday(?)), id DESC LIMIT 20`,
    [accountId, input.amount, input.date, input.date, input.date],
  );
  const closeRows = rows.filter((row) => dateDistance(String(row.data_dodania).slice(0, 10), input.date) <= 2);
  const matchingCloseRows = closeRows.filter((row) => namesMatch(row.nazwa, input.name));
  const recommendedId = matchingCloseRows.length === 1 ? matchingCloseRows[0].id : null;
  return rows.map((row) => ({ kind: input.kind, transactionId: row.id, name: row.nazwa, amount: roundMoney(Number(row.kwota)), date: String(row.data_dodania).slice(0, 10), recommended: row.id === recommendedId }));
}

export async function analyzeImportMatches(db: Database, accountId: number, value: unknown): Promise<ImportMatchAnalysis[]> {
  const inputs = normalizedInputs(value);
  return Promise.all(inputs.map(async (input) => ({
    sourceKey: input.sourceKey,
    planCandidates: await planCandidates(db, accountId, input),
    existingCandidates: await existingCandidates(db, accountId, input),
  })));
}

export async function validateAndAllocatePlanMatch(
  db: Database,
  actualKind: ImportKind,
  actualId: number,
  actualAmount: number,
  selection: PlanMatchSelection,
): Promise<number> {
  if (!Number.isInteger(selection.planId) || selection.planId <= 0 || !['one_time', 'recurring'].includes(selection.source)) {
    throw new Error('Nieprawidłowe dopasowanie planu.');
  }
  const table = selection.source === 'recurring'
    ? (actualKind === 'income' ? 'przychody_stale' : 'wydatki_stale')
    : (actualKind === 'income' ? 'przychody' : 'wydatki');
  const target = await db.get<{ kwota: number }>(`SELECT kwota FROM ${table} WHERE id = ?`, selection.planId);
  if (!target) throw new Error('Wybrana planowana operacja już nie istnieje.');
  const occurrence = selection.source === 'recurring' ? String(selection.occurrenceDate ?? '').slice(0, 10) : null;
  if (selection.source === 'recurring' && !isValidDateOnly(occurrence)) throw new Error('Nieprawidłowy miesiąc wpisu stałego.');
  const allocated = await targetAllocated(db, actualKind, selection.source, selection.planId, occurrence);
  const remaining = roundMoney(Math.max(0, Number(target.kwota) - allocated));
  if (remaining <= 0) throw new Error('Planowana operacja jest już w całości rozliczona.');
  const requested = selection.amount === undefined ? actualAmount : roundMoney(Number(selection.amount));
  if (!Number.isFinite(requested) || requested <= 0) throw new Error('Kwota powiązania musi być większa od zera.');
  const allocation = roundMoney(Math.min(requested, actualAmount, remaining));
  await addPlanAllocation(db, { actualKind, actualId, planSource: selection.source, planId: selection.planId, occurrenceDate: occurrence, allocatedAmount: allocation });
  return allocation;
}
