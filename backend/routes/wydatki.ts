import { Router } from "express";
import { dbPromise } from "../db";
import { dbBoolean } from "../utils/dbBoolean";
import { normalizeTransactionType } from "../utils/transactionType";
import { normalizeTransactionPayload } from "../utils/financePayload";
import { isInputValidationError } from "../utils/validation";
import { realizeExpenseWithIncome, realizeTransaction, TransactionRealizationError } from "../services/transactionRealization";
import { bulkUpdateTransactionClassification, deleteTransaction, moveImportedTransactionsToAccount, TransactionServiceError, validateCustomTransactionType } from "../services/transactions";
import { customizeGeneratedExpense, dismissGeneratedExpense, ensureRecurringExpenseQueue } from "../services/recurringExpenseQueue";

const router = Router();

// GET: wszystkie wydatki
router.get("/", async (req, res) => {
  try {
    const db = await dbPromise;
    await ensureRecurringExpenseQueue(db);
    const result = await db.all(`SELECT w.*, custom_type.name AS custom_type_name,
      (SELECT COALESCE(SUM(a.allocated_amount), 0) FROM transaction_plan_allocations a
       WHERE a.actual_kind = 'expense' AND a.plan_source = 'one_time' AND a.plan_id = w.id AND COALESCE(a.occurrence_date, '') = '') AS allocated_to_plan,
      CASE WHEN recurring_queue.id IS NULL THEN 0 ELSE 1 END AS generated_from_recurring,
      recurring_queue.recurring_expense_id,
      recurring_queue.status AS recurring_queue_status,
      transfer_link.id AS transfer_link_id,
      CASE WHEN transfer_link.left_kind = 'expense' AND transfer_link.left_transaction_id = w.id THEN transfer_link.right_kind ELSE transfer_link.left_kind END AS transfer_counterpart_kind,
      CASE WHEN transfer_link.left_kind = 'expense' AND transfer_link.left_transaction_id = w.id THEN transfer_link.right_transaction_id ELSE transfer_link.left_transaction_id END AS transfer_counterpart_id,
      COALESCE(transfer_counterpart_expense.nazwa, transfer_counterpart_income.nazwa) AS transfer_counterpart_name,
      (SELECT json_group_array(json_object(
        'source', m.plan_source, 'planId', m.plan_id,
        'occurrenceDate', NULLIF(m.occurrence_date, ''), 'allocatedAmount', m.allocated_amount
      )) FROM transaction_plan_allocations m WHERE m.actual_kind = 'expense' AND m.actual_id = w.id) AS plan_allocations
      FROM wydatki w
      LEFT JOIN custom_transaction_types custom_type ON custom_type.id = w.custom_type_id
      LEFT JOIN recurring_expense_queue recurring_queue ON recurring_queue.expense_id = w.id
      LEFT JOIN statement_cross_transaction_links transfer_link
        ON (transfer_link.left_kind = 'expense' AND transfer_link.left_transaction_id = w.id)
        OR (transfer_link.right_kind = 'expense' AND transfer_link.right_transaction_id = w.id)
      LEFT JOIN wydatki transfer_counterpart_expense
        ON transfer_counterpart_expense.id = CASE WHEN transfer_link.left_kind = 'expense' AND transfer_link.left_transaction_id = w.id THEN CASE WHEN transfer_link.right_kind = 'expense' THEN transfer_link.right_transaction_id END ELSE CASE WHEN transfer_link.left_kind = 'expense' THEN transfer_link.left_transaction_id END END
      LEFT JOIN przychody transfer_counterpart_income
        ON transfer_counterpart_income.id = CASE WHEN transfer_link.left_kind = 'expense' AND transfer_link.left_transaction_id = w.id THEN CASE WHEN transfer_link.right_kind = 'income' THEN transfer_link.right_transaction_id END ELSE CASE WHEN transfer_link.left_kind = 'income' THEN transfer_link.left_transaction_id END END
      ORDER BY w.data_dodania DESC`);
    // Ensure zrealizowany is boolean in responses
    let normalizedRows = result;
    if (Array.isArray(result)) {
      normalizedRows = result.map(row => ({ ...row, zrealizowany: dbBoolean(row.zrealizowany) }));
    }
    res.json(normalizedRows);
  } catch (err) {
    res.status(500).json({ error: "Błąd serwera przy pobieraniu wydatków." });
  }
});

router.patch("/bulk-classification", async (req, res) => {
  const ids: number[] = Array.isArray(req.body?.ids) ? [...new Set<number>(req.body.ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id)))].slice(0, 5000) : [];
  const category = typeof req.body?.category === "string" && req.body.category.trim() ? req.body.category.trim().slice(0, 80) : undefined;
  const customTypeId = req.body?.custom_type_id === null ? null : Number(req.body?.custom_type_id);
  if (!ids.length || (category === undefined && req.body?.custom_type_id === undefined) || (req.body?.custom_type_id !== undefined && customTypeId !== null && !Number.isInteger(customTypeId))) return res.status(400).json({ error: "Nieprawidłowa zmiana zbiorcza." });
  const db = await dbPromise;
  try { await bulkUpdateTransactionClassification(db, "expense", ids, { category, customTypeId: req.body?.custom_type_id === undefined ? undefined : customTypeId }); const result = await db.get<{ count: number }>("SELECT changes() AS count"); res.json({ updated: Number(result?.count ?? 0) }); }
  catch (error) { if (error instanceof TransactionServiceError) return res.status(400).json({ error: error.message }); throw error; }
});


router.patch("/bulk-account", async (req, res) => {
  const ids: number[] = Array.isArray(req.body?.ids)
    ? [...new Set<number>(req.body.ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0))].slice(0, 5000)
    : [];
  const accountId = Number(req.body?.account_id);
  if (!ids.length || !Number.isInteger(accountId) || accountId <= 0) return res.status(400).json({ error: "Nieprawidłowa korekta konta." });
  const db = await dbPromise;
  try {
    await db.exec("BEGIN IMMEDIATE");
    await moveImportedTransactionsToAccount(db, "expense", ids, accountId);
    await db.exec("COMMIT");
    res.json({ updated: ids.length });
  } catch (error) {
    await db.exec("ROLLBACK").catch(() => undefined);
    if (error instanceof TransactionServiceError) return res.status(409).json({ error: error.message });
    console.error("Błąd korekty konta zaimportowanych transakcji:", error);
    res.status(500).json({ error: "Nie udało się zmienić konta transakcji." });
  }
});

// POST: dodaj wydatek
router.post("/", async (req, res) => {
  try {
    const { nazwa, kwota, kategoria, data_dodania, opis, transaction_type, custom_type_id } = normalizeTransactionPayload(req.body);
    const normalizedTransactionType = normalizeTransactionType(transaction_type);
    if (normalizedTransactionType === undefined) return res.status(400).json({ error: "Nieprawidłowy typ transakcji." });
    const db = await dbPromise;
    await validateCustomTransactionType(db, custom_type_id);
    const result = await db.run("INSERT INTO wydatki (nazwa, kwota, kategoria, data_dodania, opis, transaction_type, custom_type_id) VALUES (?, ?, ?, ?, ?, ?, ?)", nazwa, kwota, kategoria, data_dodania, opis, normalizedTransactionType, custom_type_id);
    // Ensure zrealizowany is boolean in response
    res.json({ ...{ id: result.lastID, nazwa, kwota, kategoria, data_dodania, opis, transaction_type: normalizedTransactionType, custom_type_id }, zrealizowany: false });
  } catch (err) {
    if (isInputValidationError(err) || err instanceof TransactionServiceError) return res.status(400).json({ error: err.message });
    console.error("Szczegóły błędu SQL:", err);
    res.status(500).json({ error: "Błąd serwera przy dodawaniu wydatku." });
  }
});

// PUT: edytuj wydatek
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { nazwa, kwota, kategoria, data_dodania, opis, zrealizowany, transaction_type, custom_type_id } = normalizeTransactionPayload(req.body);
    const normalizedTransactionType = normalizeTransactionType(transaction_type);
    if (normalizedTransactionType === undefined) return res.status(400).json({ error: "Nieprawidłowy typ transakcji." });
    const db = await dbPromise;
    await validateCustomTransactionType(db, custom_type_id);
    const existing = await db.get("SELECT zrealizowany FROM wydatki WHERE id = ?", id);
    if (!existing) return res.status(404).json({ error: "Nie znaleziono wydatku o podanym ID." });
    if (dbBoolean(existing.zrealizowany)) return res.status(409).json({ error: "Zrealizowanego wydatku nie można edytować." });
    await customizeGeneratedExpense(db, id);
    const result = await db.run("UPDATE wydatki SET nazwa = ?, kwota = ?, kategoria = ?, data_dodania = ?, opis = ?, zrealizowany = ?, transaction_type = ?, custom_type_id = ? WHERE id = ?", nazwa, kwota, kategoria, data_dodania, opis, dbBoolean(zrealizowany) ? 1 : 0, normalizedTransactionType, custom_type_id, id);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Nie znaleziono wydatku o podanym ID." });
    }
    const updated = await db.get("SELECT * FROM wydatki WHERE id = ?", id);
    // Ensure zrealizowany is boolean in response
    res.json({ ...updated, zrealizowany: dbBoolean(updated.zrealizowany) });
  } catch (err) {
    if (isInputValidationError(err) || err instanceof TransactionServiceError) return res.status(400).json({ error: err.message });
    console.error('[Wydatki] PUT /:id error:', err);
    res.status(500).json({ error: "Błąd serwera przy edycji wydatku." });
  }
});

// PATCH: realize expense (mark as realized and log to app_activity_log)
router.patch('/realize/:id', async (req, res) => {
  try {
    res.json(await realizeTransaction({ kind: "expense", transactionId: req.params.id, accountId: req.body.account_id, amount: req.body.amount, userId: req.body.user_id }));
  } catch (err) {
    if (err instanceof TransactionRealizationError || isInputValidationError(err)) return res.status(err instanceof TransactionRealizationError ? err.status : 400).json({ error: err.message });
    console.error('[Wydatki] PATCH /realize/:id error:', err);
    res.status(500).json({ error: 'Błąd realizacji wydatku.' });
  }
});

// PATCH: rozlicz wydatek zaplanowanym przychodem, w całości lub częściowo.
router.patch('/realize-with-income/:id', async (req, res) => {
  try {
    res.json(await realizeExpenseWithIncome({ expenseId: req.params.id, incomeId: req.body.income_id, amount: req.body.amount, userId: req.body.user_id }));
  } catch (err) {
    if (err instanceof TransactionRealizationError || isInputValidationError(err)) return res.status(err instanceof TransactionRealizationError ? err.status : 400).json({ error: err.message });
    console.error('[Wydatki] PATCH /realize-with-income/:id error:', err);
    res.status(500).json({ error: 'Błąd realizacji wydatku przychodem.' });
  }
});

// DELETE: usuń wydatek
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const db = await dbPromise;
    await db.exec("BEGIN");
    try {
      const existing = await db.get("SELECT id FROM wydatki WHERE id = ?", id);
      if (!existing) {
        await db.exec("ROLLBACK");
        return res.status(404).json({ error: "Nie znaleziono wydatku o podanym ID." });
      }
      await dismissGeneratedExpense(db, id);
      await deleteTransaction(db, "expense", Number(id));
      await db.exec("COMMIT");
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Błąd serwera przy usuwaniu wydatku." });
  }
});

export default router;
