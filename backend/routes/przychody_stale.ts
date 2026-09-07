import { Router } from "express";
import { dbPromise } from "../db";
import { syncRecurringIncomeById } from "../services/recurringIncomeQueue";
import { realizeRecurringEntry, RecurringRealizationError } from "../services/recurringRealization";
import { isInputValidationError } from "../utils/validation";
import { createRecurringEntry, deleteRecurringEntry, getRecurringEntries, RecurringEntryError, updateRecurringEntry } from "../services/recurringEntries";

const router = Router();

// POST: dodaj nowy przychód stały
router.post("/", async (req, res) => {
  try {
    const db = await dbPromise;
    await db.exec("BEGIN");
    try {
      const result = await createRecurringEntry(db, "income", req.body);
      await syncRecurringIncomeById(db, result.id);
      await db.exec("COMMIT");
      res.status(201).json(result.row);
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  } catch (err) {
    if (err instanceof RecurringEntryError) return res.status(404).json({ error: err.message });
    if (isInputValidationError(err)) return res.status(400).json({ error: err.message });
    console.error("Błąd przy dodawaniu przychodu stałego:", err);
    res.status(500).json({ error: "Błąd serwera przy dodawaniu przychodu stałego.", details: err instanceof Error ? err.message : String(err) });
  }
});

// GET: wszystkie przychody stałe
router.get("/", async (req, res) => {
  try {
    const db = await dbPromise;
    const rows = await getRecurringEntries(db, "income");
    const overrides = await db.all<{ recurring_income_id: number; occurrence_date: string; status: string }[]>(
      `SELECT recurring_income_id, occurrence_date, status
       FROM recurring_income_queue
       WHERE status IN ('dismissed', 'customized')`,
    );
    res.json(rows.map((row) => ({
      ...row,
      occurrence_overrides: overrides
        .filter((override) => Number(override.recurring_income_id) === Number(row.id))
        .map((override) => ({ date: override.occurrence_date, status: override.status })),
    })));
  } catch (err) {
    console.error("Błąd przy pobieraniu przychodów stałych:", err);
    res.status(500).json({ error: "Błąd serwera przy pobieraniu przychodów stałych.", details: err instanceof Error ? err.message : String(err) });
  }
});

// GET: suma przychodów stałych
router.get("/suma", async (req, res) => {
  try {
    const db = await dbPromise;
    const stmt = await db.prepare("SELECT SUM(kwota) as suma FROM przychody_stale");
    const result = await stmt.get();
    stmt.finalize();
    res.json({ total: result.suma || 0 });
  } catch (err) {
    console.error("Błąd przy pobieraniu sumy przychodów stałych:", err);
    res.status(500).json({ error: "Błąd serwera przy pobieraniu sumy przychodów stałych.", details: err instanceof Error ? err.message : String(err) });
  }
});

// PUT: edytuj przychód stały
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const db = await dbPromise;
    await db.exec("BEGIN");
    try {
      await updateRecurringEntry(db, "income", id, req.body);
      await syncRecurringIncomeById(db, id);
      const updated = await db.get("SELECT * FROM przychody_stale WHERE id = ?", id);
      await db.exec("COMMIT");
      res.json(updated);
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  } catch (err) {
    if (err instanceof RecurringEntryError) return res.status(404).json({ error: err.message });
    if (isInputValidationError(err)) return res.status(400).json({ error: err.message });
    console.error("Błąd serwera przy edycji przychodu stałego:", err);
    res.status(500).json({ error: "Błąd serwera przy edycji przychodu stałego.", details: err instanceof Error ? err.message : String(err) });
  }
});

// DELETE: usuń przychód stały po id
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const db = await dbPromise;
    await db.exec("BEGIN");
    try {
      if (!await deleteRecurringEntry(db, "income", id)) throw new RecurringEntryError("Nie znaleziono wpisu stałego o podanym ID.");
      await db.exec("COMMIT");
      res.status(204).send();
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  } catch (err) {
    if (err instanceof RecurringEntryError) return res.status(404).json({ error: err.message });
    console.error("Błąd przy usuwaniu przychodu stałego:", err);
    res.status(500).json({ error: "Błąd serwera przy usuwaniu przychodu stałego.", details: err instanceof Error ? err.message : String(err) });
  }
});

// PATCH: realize one dated occurrence of a recurring income.
router.patch('/realize/:id', async (req, res) => {
  try {
    res.json(await realizeRecurringEntry({ kind: "income", recurringId: req.params.id, accountId: req.body.account_id, userId: req.body.user_id, occurrenceDate: req.body.occurrence_date }));
  } catch (err) {
    if (err instanceof RecurringRealizationError || isInputValidationError(err)) {
      return res.status(err instanceof RecurringRealizationError ? err.status : 400).json({ error: err.message });
    }
    console.error("Błąd przy realizacji przychodu stałego:", err);
    res.status(500).json({ error: "Błąd serwera przy realizacji przychodu stałego.", details: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
