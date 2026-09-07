import { Router } from "express";
import { dbPromise } from "../db";
import { syncDebtPlanFromRecurringExpense } from "../services/debtPlanSync";
import { realizeRecurringEntry, RecurringRealizationError } from "../services/recurringRealization";
import { isInputValidationError } from "../utils/validation";
import { syncRecurringExpenseById } from "../services/recurringExpenseQueue";
import { createRecurringEntry, deleteRecurringEntry, getRecurringEntries, RecurringEntryError, updateRecurringEntry } from "../services/recurringEntries";

const router = Router();

// POST: dodaj nowy wydatek stały
router.post("/", async (req, res) => {
  try {
    const db = await dbPromise;
    await db.exec("BEGIN");
    try {
      const result = await createRecurringEntry(db, "expense", req.body);
      await syncDebtPlanFromRecurringExpense(db, result.id);
      await syncRecurringExpenseById(db, result.id);
      await db.exec("COMMIT");
      res.status(201).json(result.row);
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  } catch (err) {
    if (err instanceof RecurringEntryError) return res.status(404).json({ error: err.message });
    if (isInputValidationError(err)) return res.status(400).json({ error: err.message });
    console.error("Błąd przy dodawaniu wydatku stałego:", err);
    res.status(500).json({ error: "Błąd serwera przy dodawaniu wydatku stałego.", details: err instanceof Error ? err.message : String(err) });
  }
});

// GET: wszystkie wydatki stałe
router.get("/", async (req, res) => {
  try {
    const db = await dbPromise;
    const rows = await getRecurringEntries(db, "expense");
    const overrides = await db.all<{ recurring_expense_id: number; occurrence_date: string; status: string }[]>(
      `SELECT recurring_expense_id, occurrence_date, status FROM recurring_expense_queue WHERE status IN ('dismissed', 'customized')`,
    );
    res.json(rows.map((row) => ({
      ...row,
      occurrence_overrides: overrides.filter((override) => Number(override.recurring_expense_id) === Number(row.id)).map((override) => ({ date: override.occurrence_date, status: override.status })),
    })));
  } catch (err) {
    console.error("Błąd przy pobieraniu wydatków stałych:", err);
    res.status(500).json({ error: "Błąd serwera przy pobieraniu wydatków stałych.", details: err instanceof Error ? err.message : String(err) });
  }
});

// GET: suma wydatków stałych
router.get("/suma", async (req, res) => {
  try {
    const db = await dbPromise;
    const stmt = await db.prepare("SELECT SUM(kwota) as suma FROM wydatki_stale");
    const result = await stmt.get();
    stmt.finalize();
    res.json({ total: result.suma || 0 });
  } catch (err) {
    console.error("Błąd przy pobieraniu sumy wydatków stałych:", err);
    res.status(500).json({ error: "Błąd serwera przy pobieraniu sumy wydatków stałych.", details: err instanceof Error ? err.message : String(err) });
  }
});

// PUT: edytuj wydatek stały
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (req.body.zrealizowany !== undefined) {
      return res.status(400).json({ error: "Nie można edytować pola 'zrealizowany' przez PUT. Użyj PATCH /realize/:id.", details: "Proszę sprawdzić dokumentację API." });
    }
    const db = await dbPromise;
    await db.exec("BEGIN");
    try {
      await updateRecurringEntry(db, "expense", id, req.body);
      await syncDebtPlanFromRecurringExpense(db, id);
      await syncRecurringExpenseById(db, id);
      const updated = await db.get("SELECT * FROM wydatki_stale WHERE id = ?", id);
      await db.exec("COMMIT");
      res.json(updated);
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  } catch (err) {
    if (err instanceof RecurringEntryError) return res.status(404).json({ error: err.message });
    if (isInputValidationError(err)) return res.status(400).json({ error: err.message });
    console.error("Błąd serwera przy edycji wydatku stałego:", err);
    res.status(500).json({ error: "Błąd serwera przy edycji wydatku stałego.", details: err instanceof Error ? err.message : String(err) });
  }
});

// DELETE: usuń wydatek stały po id
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const db = await dbPromise;
    await db.exec("BEGIN");
    try {
      if (!await deleteRecurringEntry(db, "expense", id)) throw new RecurringEntryError("Nie znaleziono wpisu stałego o podanym ID.");
      await syncDebtPlanFromRecurringExpense(db, id);
      await db.exec("COMMIT");
      res.status(204).send();
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  } catch (err) {
    if (err instanceof RecurringEntryError) return res.status(404).json({ error: err.message });
    console.error("Błąd przy usuwaniu wydatku stałego:", err);
    res.status(500).json({ error: "Błąd serwera przy usuwaniu wydatku stałego.", details: err instanceof Error ? err.message : String(err) });
  }
});

// PATCH: realize one dated occurrence of a recurring expense.
router.patch('/realize/:id', async (req, res) => {
  try {
    res.json(await realizeRecurringEntry({ kind: "expense", recurringId: req.params.id, accountId: req.body.account_id, userId: req.body.user_id, occurrenceDate: req.body.occurrence_date }));
  } catch (err) {
    if (err instanceof RecurringRealizationError || isInputValidationError(err)) {
      return res.status(err instanceof RecurringRealizationError ? err.status : 400).json({ error: err.message });
    }
    console.error('[WydatkiStale] PATCH /realize/:id error:', err);
    res.status(500).json({ error: 'Błąd realizacji wydatku stałego.' });
  }
});

export default router;
