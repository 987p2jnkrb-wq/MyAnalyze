import express from 'express';
import { dbPromise } from '../db';
import {
  findImportedSourceKeys,
  findPotentialStatementOverlaps,
  importStatementTransactions,
  statementSourceForAccountType,
  StatementImportValidationError,
} from '../services/statementImport';
import { normalizeTransactionType, transactionTypeLabel, type TransactionType } from '../utils/transactionType';
import { isValidDateOnly } from '../utils/validation';
import { canLinkToCreditProduct, isCreditAccountType, isSupportedAccountType } from '../utils/accountType';
import { AccountBalanceError, applyAccountBalanceDelta, setAccountBalanceAbsolute } from '../services/accountBalance';
import { analyzeImportMatches } from '../services/statementImportMatching';
import { linkImportedTransfer, setImportedTransactionAnalysis, StatementTransferError, unlinkImportedTransfer, type ImportedTransactionKind } from '../services/statementTransfer';
import { extractStatementPdf } from '../services/statementPdf';

const router = express.Router();

class AccountValidationError extends Error {}

function technicalProvider(value: unknown): string | null {
  const provider = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return /^[a-z0-9][a-z0-9_-]{1,39}$/.test(provider) ? provider : null;
}

function importedTransactionKind(value: unknown): ImportedTransactionKind | null {
  return value === 'income' ? 'income' : value === 'expense' ? 'expense' : null;
}

router.post('/:id/extract-statement-pdf', express.raw({ type: ['application/pdf', 'application/octet-stream'], limit: '10mb' }), async (req, res) => {
  const accountId = Number(req.params.id);
  if (!Number.isInteger(accountId) || accountId <= 0) return res.status(400).json({ error: 'Nieprawidłowe konto.' });
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Nie przesłano pliku PDF.' });
  try {
    const db = await dbPromise;
    if (!await db.get('SELECT id FROM konta WHERE id = ?', accountId)) return res.status(404).json({ error: 'Nie znaleziono konta.' });
    res.json(await extractStatementPdf(req.body));
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/PDF|warstwy tekstowej/i.test(message)) return res.status(400).json({ error: message });
    console.error('POST /api/konta/:id/extract-statement-pdf error:', error);
    res.status(500).json({ error: 'Nie udało się odczytać dokumentu PDF.' });
  }
});

router.get('/import-identifiers', async (req, res) => {
  const provider = technicalProvider(req.query.provider);
  const identifier = typeof req.query.external_identifier === 'string' ? req.query.external_identifier.trim() : '';
  const instrumentType = req.query.instrument_type === 'credit_card' ? 'credit_card' : ['account', 'debit_card'].includes(String(req.query.instrument_type)) ? 'account' : null;
  if (!provider || !identifier || !instrumentType) return res.status(400).json({ error: 'Nieprawidłowy identyfikator instrumentu.' });
  const db = await dbPromise;
  const rows = await db.all(`SELECT mapping.*, account.nazwa AS account_name, account.institution_name
    FROM account_import_identifiers mapping JOIN konta account ON account.id = mapping.account_id
    WHERE mapping.provider = ? AND mapping.external_identifier = ? AND mapping.instrument_type = ?`, provider, identifier, instrumentType);
  res.json(rows);
});

router.post('/import-identifiers', async (req, res) => {
  const accountId = Number(req.body?.account_id);
  const provider = technicalProvider(req.body?.provider);
  const identifier = typeof req.body?.external_identifier === 'string' ? req.body.external_identifier.trim() : '';
  const instrumentType = req.body?.instrument_type === 'credit_card' ? 'credit_card' : ['account', 'debit_card'].includes(String(req.body?.instrument_type)) ? 'account' : null;
  const label = typeof req.body?.label === 'string' && req.body.label.trim() ? req.body.label.trim().slice(0, 80) : null;
  if (!Number.isInteger(accountId) || accountId <= 0 || !provider || !identifier || !instrumentType) return res.status(400).json({ error: 'Nieprawidłowe mapowanie instrumentu.' });
  const db = await dbPromise;
  if (!await db.get('SELECT id FROM konta WHERE id = ?', accountId)) return res.status(404).json({ error: 'Nie znaleziono konta.' });
  await db.run(`INSERT INTO account_import_identifiers (account_id, provider, external_identifier, instrument_type, label)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(account_id, provider, external_identifier, instrument_type) DO UPDATE SET label = excluded.label`, accountId, provider, identifier, instrumentType, label);
  res.status(204).send();
});

async function validatedRepaymentAccountId(
  db: Awaited<typeof dbPromise>,
  accountId: number | null,
  accountType: string,
  value: unknown,
): Promise<number | null> {
  if (!isCreditAccountType(accountType)) return null;
  if (value === null || value === undefined || value === '') return null;
  const repaymentAccountId = Number(value);
  if (!Number.isInteger(repaymentAccountId) || repaymentAccountId <= 0) {
    throw new AccountValidationError('Nieprawidłowe konto spłacające kartę.');
  }
  if (accountId === repaymentAccountId) {
    throw new AccountValidationError('Karta nie może spłacać samej siebie.');
  }
  const repaymentAccount = await db.get<{ typ_depozytu: string }>('SELECT typ_depozytu FROM konta WHERE id = ?', repaymentAccountId);
  if (!repaymentAccount) throw new AccountValidationError('Nie znaleziono konta spłacającego kartę.');
  if (!canLinkToCreditProduct(repaymentAccount.typ_depozytu)) {
    throw new AccountValidationError('Kontem spłacającym kartę musi być zwykłe konto lub gotówka, nie wirtualny portfel.');
  }
  return repaymentAccountId;
}

// Get all accounts
router.get('/', async (req, res) => {
  try {
    const db = await dbPromise;
    const result = await db.all(`
      SELECT konta.*, repayment_account.nazwa AS repayment_account_name, card_plan.limit_kredytowy,
             COALESCE(installment_plans.total_debt, 0) AS installment_plan_debt
      FROM konta
      LEFT JOIN konta AS repayment_account ON repayment_account.id = konta.repayment_account_id
      LEFT JOIN debt_plans AS card_plan ON card_plan.account_id = konta.id
        AND lower(trim(card_plan.typ)) IN ('karta', 'karta kredytowa')
      LEFT JOIN (
        SELECT linked_card_account_id, SUM(CAST(zadluzenie AS REAL)) AS total_debt
        FROM debt_plans
        WHERE lower(trim(typ)) = 'plan ratalny' AND linked_card_account_id IS NOT NULL AND COALESCE(active, 1) = 1
        GROUP BY linked_card_account_id
      ) AS installment_plans ON installment_plans.linked_card_account_id = konta.id
      ORDER BY konta.id
    `);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Błąd pobierania kont' });
  }
});

router.get('/import-settings', async (_req, res) => {
  try {
    const db = await dbPromise;
    res.json(await db.get('SELECT * FROM statement_import_settings WHERE id = 1'));
  } catch {
    res.status(500).json({ error: 'Nie udało się pobrać ustawień importu.' });
  }
});

router.put('/import-settings', async (req, res) => {
  const detect = req.body?.detectTransferSuggestions;
  const autoSelect = req.body?.autoSelectPlanMatch;
  const tolerance = Number(req.body?.transferDateTolerance);
  if (typeof detect !== 'boolean' || typeof autoSelect !== 'boolean' || !Number.isInteger(tolerance) || tolerance < 0 || tolerance > 7) {
    return res.status(400).json({ error: 'Nieprawidłowe ustawienia importu.' });
  }
  try {
    const db = await dbPromise;
    await db.run(
      `UPDATE statement_import_settings
       SET detect_transfer_suggestions = ?, transfer_date_tolerance = ?, auto_select_plan_match = ?, updated_at = datetime('now', 'localtime')
       WHERE id = 1`,
      [detect ? 1 : 0, tolerance, autoSelect ? 1 : 0],
    );
    res.json(await db.get('SELECT * FROM statement_import_settings WHERE id = 1'));
  } catch {
    res.status(500).json({ error: 'Nie udało się zapisać ustawień importu.' });
  }
});

// Update an account
router.put('/:id', async (req, res) => {
  const { nazwa, saldo_dostepne, saldo_wlasciwe, typ_depozytu, repayment_account_id } = req.body;
  const institutionName = typeof req.body.institution_name === 'string' && req.body.institution_name.trim() ? req.body.institution_name.trim().slice(0, 80) : null;
  try {
    const id = Number(req.params.id);
    const available = Number(saldo_dostepne);
    const requestedActual = Number(saldo_wlasciwe);
    if (!Number.isInteger(id) || id <= 0 || typeof nazwa !== 'string' || !nazwa.trim() || !Number.isFinite(available) || !Number.isFinite(requestedActual) || !isSupportedAccountType(typ_depozytu)) {
      return res.status(400).json({ error: 'Nieprawidłowe dane konta.' });
    }
    const db = await dbPromise;
    const existingAccount = await db.get<{ typ_depozytu: string; active: unknown }>('SELECT typ_depozytu, active FROM konta WHERE id = ?', id);
    if (!existingAccount) return res.status(404).json({ error: 'Nie znaleziono konta.' });
    if (isCreditAccountType(existingAccount.typ_depozytu) !== isCreditAccountType(typ_depozytu)) {
      return res.status(409).json({ error: 'Nie można zmieniać zwykłego konta w kartę kredytową ani karty kredytowej w zwykłe konto.' });
    }
    const repaymentAccountId = await validatedRepaymentAccountId(db, id, typ_depozytu, repayment_account_id);
    const active = req.body?.active === undefined ? Number(existingAccount.active ?? 1) : req.body.active === true || Number(req.body.active) === 1 ? 1 : req.body.active === false || Number(req.body.active) === 0 ? 0 : null;
    if (active === null) return res.status(400).json({ error: 'Nieprawidłowy status konta.' });
    await db.exec('BEGIN IMMEDIATE');
    try {
      const result = await db.run('UPDATE konta SET nazwa=?, typ_depozytu=?, repayment_account_id=?, institution_name=?, active=? WHERE id=?', nazwa.trim(), typ_depozytu, repaymentAccountId, institutionName, active, id);
      if (result.changes === 0) {
        await db.exec('ROLLBACK');
        return res.status(404).json({ error: 'Nie znaleziono konta.' });
      }
      await setAccountBalanceAbsolute(db, id, available, requestedActual);
      if (isCreditAccountType(typ_depozytu)) {
        await db.run("UPDATE debt_plans SET active = ?, updated_at = date('now') WHERE account_id = ? AND lower(trim(typ)) IN ('karta', 'karta kredytowa')", active, id);
      }
      const newAccount = await db.get('SELECT * FROM konta WHERE id=?', id);
      await db.exec('COMMIT');
      res.json({ success: true, account: newAccount });
    } catch (error) {
      await db.exec('ROLLBACK').catch(() => undefined);
      throw error;
    }
  } catch (err) {
    if (err instanceof AccountValidationError || err instanceof AccountBalanceError) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: 'Błąd aktualizacji konta' });
  }
});

// Add a new account
router.post('/', async (req, res) => {
  const { nazwa, saldo_dostepne, saldo_wlasciwe, typ_depozytu, repayment_account_id } = req.body;
  const institutionName = typeof req.body.institution_name === 'string' && req.body.institution_name.trim() ? req.body.institution_name.trim().slice(0, 80) : null;
  try {
    const available = Number(saldo_dostepne);
    const actual = Number(saldo_wlasciwe);
    if (typeof nazwa !== 'string' || !nazwa.trim() || !Number.isFinite(available) || !Number.isFinite(actual) || !isSupportedAccountType(typ_depozytu)) {
      return res.status(400).json({ error: 'Nieprawidłowe dane konta.' });
    }
    const db = await dbPromise;
    const repaymentAccountId = await validatedRepaymentAccountId(db, null, typ_depozytu, repayment_account_id);
    const active = req.body?.active === undefined ? 1 : req.body.active === true || Number(req.body.active) === 1 ? 1 : req.body.active === false || Number(req.body.active) === 0 ? 0 : null;
    if (active === null) return res.status(400).json({ error: 'Nieprawidłowy status konta.' });
    const result = await db.run(
      'INSERT INTO konta (nazwa, saldo_dostepne, saldo_wlasciwe, typ_depozytu, repayment_account_id, institution_name, active) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [nazwa.trim(), available, actual, typ_depozytu, repaymentAccountId, institutionName, active]
    );
    // Pobierz nowo dodane konto na podstawie lastID
    const newAccount = await db.get('SELECT * FROM konta WHERE id = ?', result.lastID);
    res.json(newAccount);
  } catch (err) {
    if (err instanceof AccountValidationError) return res.status(400).json({ error: err.message });
    console.error('POST /api/konta error:', err);
    res.status(500).json({ error: 'Błąd dodawania konta', details: (err && typeof err === 'object' && 'message' in err) ? (err as any).message : String(err) });
  }
});

router.post('/:id/import-transactions/check-duplicates', async (req, res) => {
  const accountId = Number(req.params.id);
  const sourceKeys = Array.isArray(req.body?.sourceKeys) ? req.body.sourceKeys : [];
  if (!Number.isInteger(accountId) || accountId <= 0 || sourceKeys.length > 5000) {
    return res.status(400).json({ error: 'Nieprawidłowe dane sprawdzania duplikatów.' });
  }
  try {
    const db = await dbPromise;
    const account = await db.get<{ id: number }>('SELECT id FROM konta WHERE id = ?', accountId);
    if (!account) return res.status(404).json({ error: 'Nie znaleziono konta.' });
    const settings = await db.get<{ detect_transfer_suggestions: unknown; transfer_date_tolerance: unknown }>('SELECT detect_transfer_suggestions, transfer_date_tolerance FROM statement_import_settings WHERE id = 1');
    const detectTransfers = settings == null || settings.detect_transfer_suggestions === 1 || settings.detect_transfer_suggestions === '1';
    const transferTolerance = Math.min(7, Math.max(0, Number(settings?.transfer_date_tolerance ?? 3)));
    const sourceStatuses = Object.fromEntries(
      (Array.isArray(req.body?.transactions) ? req.body.transactions : [])
        .filter((item: unknown): item is { sourceKey: string; bankStatus?: unknown } => Boolean(item && typeof item === 'object' && typeof (item as { sourceKey?: unknown }).sourceKey === 'string'))
        .map((item: { sourceKey: string; bankStatus?: unknown }) => [item.sourceKey, item.bankStatus]),
    );
    const [duplicateSourceKeys, possibleOverlaps, matchAnalysis] = await Promise.all([
      findImportedSourceKeys(db, accountId, sourceKeys, sourceStatuses),
      findPotentialStatementOverlaps(db, accountId, req.body?.transactions, transferTolerance, detectTransfers),
      analyzeImportMatches(db, accountId, req.body?.transactions),
    ]);
    res.json({ duplicateSourceKeys, possibleOverlaps, matchAnalysis });
  } catch (err) {
    console.error('POST /api/konta/:id/import-transactions/check-duplicates error:', err);
    res.status(500).json({ error: 'Nie udało się sprawdzić duplikatów.' });
  }
});

router.patch('/import-transactions/:kind/:transactionId/analysis', async (req, res) => {
  const kind = req.params.kind === 'income' ? 'income' : req.params.kind === 'expense' ? 'expense' : null;
  const transactionId = Number(req.params.transactionId);
  if (!kind || !Number.isInteger(transactionId) || transactionId <= 0 || typeof req.body?.excluded !== 'boolean') {
    return res.status(400).json({ error: 'Nieprawidłowe dane operacji.' });
  }
  let transactionStarted = false;
  try {
    const db = await dbPromise;
    await db.exec('BEGIN IMMEDIATE');
    transactionStarted = true;
    await setImportedTransactionAnalysis(db, kind, transactionId, req.body.excluded);
    await db.exec('COMMIT');
    transactionStarted = false;
    res.json({ success: true });
  } catch (error) {
    const db = await dbPromise;
    if (transactionStarted) await db.exec('ROLLBACK').catch(() => undefined);
    if (error instanceof StatementTransferError) return res.status(409).json({ error: error.message });
    res.status(500).json({ error: 'Nie udało się zmienić udziału operacji w analizach.' });
  }
});

router.post('/import-transfers', async (req, res) => {
  const kind = importedTransactionKind(req.body?.kind);
  const counterpartKind = importedTransactionKind(req.body?.counterpartKind);
  const transactionId = Number(req.body?.transactionId);
  const counterpartId = Number(req.body?.counterpartId);
  if (!kind || !counterpartKind || !Number.isInteger(transactionId) || transactionId <= 0 || !Number.isInteger(counterpartId) || counterpartId <= 0) return res.status(400).json({ error: 'Nieprawidłowe dane powiązania transferu.' });
  let transactionStarted = false;
  try {
    const db = await dbPromise;
    await db.exec('BEGIN IMMEDIATE');
    transactionStarted = true;
    const linkId = await linkImportedTransfer(db, kind, transactionId, counterpartKind, counterpartId, { manual: true });
    await db.exec('COMMIT');
    transactionStarted = false;
    res.status(201).json({ id: linkId });
  } catch (error) {
    const db = await dbPromise;
    if (transactionStarted) await db.exec('ROLLBACK').catch(() => undefined);
    if (error instanceof StatementTransferError) return res.status(409).json({ error: error.message });
    res.status(500).json({ error: 'Nie udało się powiązać transferu.' });
  }
});

router.patch('/import-transfers/:linkId', async (req, res) => {
  const linkId = Number(req.params.linkId);
  const kind = importedTransactionKind(req.body?.kind);
  const counterpartKind = importedTransactionKind(req.body?.counterpartKind);
  const transactionId = Number(req.body?.transactionId);
  const counterpartId = Number(req.body?.counterpartId);
  if (!Number.isInteger(linkId) || linkId <= 0 || !kind || !counterpartKind || !Number.isInteger(transactionId) || transactionId <= 0 || !Number.isInteger(counterpartId) || counterpartId <= 0) return res.status(400).json({ error: 'Nieprawidłowe dane powiązania transferu.' });
  let transactionStarted = false;
  try {
    const db = await dbPromise;
    await db.exec('BEGIN IMMEDIATE');
    transactionStarted = true;
    await unlinkImportedTransfer(db, linkId);
    const newLinkId = await linkImportedTransfer(db, kind, transactionId, counterpartKind, counterpartId, { manual: true });
    await db.exec('COMMIT');
    transactionStarted = false;
    res.json({ id: newLinkId });
  } catch (error) {
    const db = await dbPromise;
    if (transactionStarted) await db.exec('ROLLBACK').catch(() => undefined);
    if (error instanceof StatementTransferError) return res.status(409).json({ error: error.message });
    res.status(500).json({ error: 'Nie udało się zmienić powiązania transferu.' });
  }
});

router.delete('/import-transfers/:linkId', async (req, res) => {
  const linkId = Number(req.params.linkId);
  if (!Number.isInteger(linkId) || linkId <= 0) return res.status(400).json({ error: 'Nieprawidłowe powiązanie transferu.' });
  let transactionStarted = false;
  try {
    const db = await dbPromise;
    await db.exec('BEGIN IMMEDIATE');
    transactionStarted = true;
    await unlinkImportedTransfer(db, linkId);
    await db.exec('COMMIT');
    transactionStarted = false;
    res.status(204).send();
  } catch (error) {
    const db = await dbPromise;
    if (transactionStarted) await db.exec('ROLLBACK').catch(() => undefined);
    if (error instanceof StatementTransferError) return res.status(404).json({ error: error.message });
    res.status(500).json({ error: 'Nie udało się usunąć powiązania transferu.' });
  }
});

// Import historii bankowej. Wpisy są już wykonane, ale nie zmieniają salda konta,
// ponieważ saldo bankowe uwzględnia je przed eksportem wyciągu.
router.post('/:id/import-transactions', async (req, res) => {
  const accountId = Number(req.params.id);
  if (!Number.isInteger(accountId) || accountId <= 0) {
    return res.status(400).json({ error: 'Nieprawidłowe dane importu.' });
  }
  try {
    const db = await dbPromise;
    const account = await db.get<{ id: number; nazwa: string; typ_depozytu: string }>('SELECT id, nazwa, typ_depozytu FROM konta WHERE id = ?', accountId);
    if (!account) return res.status(404).json({ error: 'Nie znaleziono konta.' });
    const defaultSource = statementSourceForAccountType(account.typ_depozytu);
    const requestedSource = typeof req.body?.source === 'string' ? req.body.source.trim().slice(0, 80) : '';
    const source = /^(?:CSV|PDF)\b/i.test(requestedSource) ? requestedSource : defaultSource;
    const result = await importStatementTransactions(db, accountId, account.nazwa, req.body?.transactions, source);
    res.json(result);
  } catch (err) {
    if (err instanceof StatementImportValidationError) {
      return res.status(400).json({ error: err.message });
    }
    console.error('POST /api/konta/:id/import-transactions error:', err);
    res.status(500).json({ error: 'Nie udało się zaimportować wyciągu.' });
  }
});

const incomeTransactionTypes = new Set<TransactionType>(['transfer_in', 'top_up', 'loan_disbursement', 'refund', 'other']);
const expenseTransactionTypes = new Set<TransactionType>(['card_payment', 'transfer_out', 'cash_withdrawal', 'direct_debit', 'fee', 'loan_repayment', 'card_repayment', 'other']);

// Szybka zmiana salda tworzy od razu zrealizowany przychód lub wydatek.
router.post('/:id/adjustment', async (req, res) => {
  const accountId = Number(req.params.id);
  const direction = req.body?.direction === 'income' ? 'income' : req.body?.direction === 'expense' ? 'expense' : null;
  const amount = Math.round(Number(req.body?.amount) * 100) / 100;
  const title = String(req.body?.title ?? '').trim();
  const date = String(req.body?.date ?? '').slice(0, 10);
  const normalizedType = normalizeTransactionType(req.body?.transaction_type);
  if (!Number.isInteger(accountId) || accountId <= 0 || !direction || !Number.isFinite(amount) || amount <= 0 || !title || !isValidDateOnly(date)) {
    return res.status(400).json({ error: 'Uzupełnij tytuł, dodatnią kwotę i prawidłową datę.' });
  }
  if (normalizedType === undefined || normalizedType === null || !(direction === 'income' ? incomeTransactionTypes : expenseTransactionTypes).has(normalizedType)) {
    return res.status(400).json({ error: 'Wybierz typ transakcji odpowiedni dla kierunku operacji.' });
  }
  const db = await dbPromise;
  let transactionStarted = false;
  try {
    await db.exec('BEGIN IMMEDIATE');
    transactionStarted = true;
    const signedAmount = direction === 'income' ? amount : -amount;
    const oldAccount = await db.get('SELECT * FROM konta WHERE id = ?', accountId);
    if (!oldAccount) throw new AccountValidationError('Nie znaleziono konta.');
    try { await applyAccountBalanceDelta(db, accountId, signedAmount, { rejectCreditOverpayment: true }); }
    catch (error) { if (error instanceof AccountBalanceError) throw new AccountValidationError(error.message); throw error; }
    const table = direction === 'income' ? 'przychody' : 'wydatki';
    const transaction = await db.run(
      `INSERT INTO ${table} (nazwa, kwota, kategoria, data_dodania, zrealizowany, opis, account_id, transaction_type, excluded_from_analysis)
       VALUES (?, ?, 'Inne', ?, 1, NULL, ?, ?, 0)`,
      [title, amount, date, accountId, normalizedType],
    );
    const newAccount = await db.get('SELECT * FROM konta WHERE id = ?', accountId);
    const formattedAmount = amount.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    await db.run(
      `INSERT INTO app_activity_log (user_id, timestamp, action_type, entity_type, entity_id, old_data, new_data, metadata, comment)
       VALUES ('local', datetime('now', 'localtime'), ?, 'konta', ?, ?, ?, ?, ?)`,
      [
        direction === 'income' ? 'QUICK_TOP_UP' : 'QUICK_CHARGE', accountId,
        JSON.stringify(oldAccount), JSON.stringify(newAccount),
        JSON.stringify({ transaction_id: transaction.lastID, transaction_kind: direction, transaction_type: normalizedType, date }),
        `${direction === 'income' ? 'Zasilenie' : 'Obciążenie'} „${title}” ${formattedAmount} zł (${transactionTypeLabel(normalizedType)}).`,
      ],
    );
    await db.exec('COMMIT');
    transactionStarted = false;
    res.status(201).json({ account: newAccount, transaction_id: transaction.lastID, kind: direction });
  } catch (err) {
    if (transactionStarted) await db.exec('ROLLBACK').catch(() => undefined);
    if (err instanceof AccountValidationError) return res.status(400).json({ error: err.message });
    console.error('POST /api/konta/:id/adjustment error:', err);
    res.status(500).json({ error: 'Nie udało się zaksięgować operacji.' });
  }
});

// Delete an account
router.delete('/:id', async (req, res) => {
  let transactionStarted = false;
  try {
    const db = await dbPromise;
    const linkedInstallmentPlan = await db.get<{ id: number; produkt: string }>(
      "SELECT id, produkt FROM debt_plans WHERE linked_card_account_id = ? AND lower(trim(typ)) = 'plan ratalny' LIMIT 1",
      req.params.id,
    );
    if (linkedInstallmentPlan) return res.status(409).json({ error: `Najpierw usuń plan ratalny „${linkedInstallmentPlan.produkt}” powiązany z tą kartą.` });
    await db.exec('BEGIN IMMEDIATE');
    transactionStarted = true;
    await db.run('UPDATE konta SET repayment_account_id = NULL WHERE repayment_account_id = ?', req.params.id);
    await db.run('UPDATE debt_plans SET linked_card_account_id = NULL WHERE linked_card_account_id = ?', req.params.id);
    await db.run('UPDATE financial_goals SET account_id = NULL, include_account_balance = 0 WHERE account_id = ?', req.params.id);
    const deleteResult = await db.run('DELETE FROM konta WHERE id = ?', req.params.id);
    if (!deleteResult.changes) {
      await db.exec('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({ error: 'Nie znaleziono konta.' });
    }
    await db.exec('COMMIT');
    transactionStarted = false;
    res.json({ success: true });
  } catch (err) {
    if (transactionStarted) {
      const db = await dbPromise;
      await db.exec('ROLLBACK').catch(() => undefined);
    }
    res.status(500).json({ error: 'Błąd usuwania konta' });
  }
});

// Transfer funds between accounts
router.post('/transfer', async (req, res) => {
  let db: Awaited<typeof dbPromise> | null = null;
  let transactionStarted = false;
  try {
    const { fromId, toId, amount, userId, expenseInfo, incomeInfo, comment, metadata } = req.body;
    const sourceAccountId = Number(fromId);
    const targetAccountId = Number(toId);
    const transferAmount = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
    if (!Number.isInteger(sourceAccountId) || sourceAccountId <= 0
      || !Number.isInteger(targetAccountId) || targetAccountId <= 0
      || sourceAccountId === targetAccountId
      || !Number.isFinite(transferAmount) || transferAmount <= 0) {
      return res.status(400).json({ error: 'Nieprawidłowe dane przelewu.' });
    }
    db = await dbPromise;
    await db.exec('BEGIN IMMEDIATE');
    transactionStarted = true;
    const fromResult = await db.get('SELECT * FROM konta WHERE id = ?', sourceAccountId);
    const toResult = await db.get('SELECT * FROM konta WHERE id = ?', targetAccountId);
    if (!fromResult || !toResult) throw new AccountBalanceError('Nie znaleziono konta.');
    const oldFrom = { ...fromResult };
    const oldTo = { ...toResult };
    await applyAccountBalanceDelta(db, sourceAccountId, -transferAmount);
    await applyAccountBalanceDelta(db, targetAccountId, transferAmount);
    const newFromResult = await db.get('SELECT * FROM konta WHERE id = ?', sourceAccountId);
    const newToResult = await db.get('SELECT * FROM konta WHERE id = ?', targetAccountId);
    // Log activity for both accounts (source and target)
    const fromAccountName = fromResult.nazwa;
    const toAccountName = toResult.nazwa;
    const transferAmountStr = transferAmount.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
    // Komentarze
    const commentOut = comment || `Przelew wychodzący na konto ${toAccountName} ${transferAmountStr} został zrealizowany`;
    const commentIn = `Przelew przychodzący ${transferAmountStr} z konta ${fromAccountName} został zaksięgowany`;
    // Loguj z pełnymi nazwami kont w metadata (dla obu logów)
    const nowIso = new Date().toISOString();
    const logMetadata = JSON.stringify({
      target_account_id: targetAccountId,
      target_account_name: toAccountName,
      source_account_id: sourceAccountId,
      source_account_name: fromAccountName,
      amount: transferAmount,
      date: nowIso
    });
    await db.run(
      `INSERT INTO app_activity_log (user_id, action_type, entity_type, entity_id, old_data, new_data, metadata, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId || null, 'TRANSFER_OUT', 'konta', sourceAccountId, JSON.stringify(oldFrom), JSON.stringify(newFromResult), logMetadata, commentOut]
    );
    await db.run(
      `INSERT INTO app_activity_log (user_id, action_type, entity_type, entity_id, old_data, new_data, metadata, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId || null, 'TRANSFER_IN', 'konta', targetAccountId, JSON.stringify(oldTo), JSON.stringify(newToResult), logMetadata, commentIn]
    );
    // Dodaj wpisy o realizacji wydatku/przychodu jeśli przesłano expenseInfo/incomeInfo
    if (expenseInfo && expenseInfo.nazwa && expenseInfo.kwota) {
      const expKwotaStr = Number(expenseInfo.kwota).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
      const expComment = `Wydatek ${expenseInfo.nazwa} w kwocie ${expKwotaStr} został zrealizowany`;
      await db.run(
        `INSERT INTO app_activity_log (user_id, action_type, entity_type, entity_id, old_data, new_data, metadata, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId || null, 'EXPENSE_REALIZED', 'konta', sourceAccountId, null, JSON.stringify({ nazwa: expenseInfo.nazwa, kwota: expenseInfo.kwota }), JSON.stringify({ expense_id: expenseInfo.id }), expComment]
      );
    }
    if (incomeInfo && incomeInfo.nazwa && incomeInfo.kwota) {
      const incKwotaStr = Number(incomeInfo.kwota).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
      const incComment = `Przychód ${incomeInfo.nazwa} w kwocie ${incKwotaStr} został zrealizowany`;
      await db.run(
        `INSERT INTO app_activity_log (user_id, action_type, entity_type, entity_id, old_data, new_data, metadata, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId || null, 'INCOME_REALIZED', 'konta', targetAccountId, null, JSON.stringify({ nazwa: incomeInfo.nazwa, kwota: incomeInfo.kwota }), JSON.stringify({ income_id: incomeInfo.id }), incComment]
      );
    }
    // Usunięto zbędny wpis 'Przelew' – historia będzie zawierać tylko TRANSFER_OUT i TRANSFER_IN
    await db.exec('COMMIT');
    transactionStarted = false;
    res.json({ success: true });
  } catch (err) {
    if (transactionStarted && db) await db.exec('ROLLBACK').catch(() => undefined);
    if (err instanceof AccountBalanceError) return res.status(400).json({ error: err.message });
    console.error('POST /api/konta/transfer error:', err);
    res.status(500).json({ error: 'Błąd przelewu.', details: (err && typeof err === 'object' && 'message' in err) ? (err as any).message : String(err) });
  }
});

export default router;
