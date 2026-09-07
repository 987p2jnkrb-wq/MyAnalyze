import { Router } from "express";
import { dbPromise } from "../db";
import { InputValidationError, isInputValidationError, isValidDateOnly, requiredText, validatedNumber } from "../utils/validation";
import { isCreditAccountType } from "../utils/accountType";

const router = Router();
const GOAL_TYPES = new Set(["emergency_fund", "purchase", "travel", "car", "renovation", "down_payment", "debt_repayment", "custom"]);
const PRIORITIES = new Set(["low", "normal", "high"]);
const STATUSES = new Set(["active", "paused", "completed"]);

function enumValue(value: unknown, allowed: Set<string>, label: string): string {
  const normalized = String(value ?? "").trim();
  if (!allowed.has(normalized)) throw new InputValidationError(`${label} ma nieprawidłową wartość.`);
  return normalized;
}

async function normalizeGoal(body: Record<string, unknown>) {
  const targetAmount = validatedNumber(body.targetAmount ?? body.kwota_docelowa, "Kwota docelowa", { required: true, min: 0.01, money: true }) as number;
  const allocatedAmount = validatedNumber(body.allocatedAmount ?? body.kwota_przypisana ?? 0, "Kwota przypisana", { required: true, min: 0, money: true }) as number;
  if (allocatedAmount > targetAmount) throw new InputValidationError("Kwota przypisana nie może przekraczać kwoty docelowej.");
  const rawDueDate = body.dueDate ?? body.termin;
  const dueDate = rawDueDate === null || rawDueDate === undefined || rawDueDate === "" ? null : String(rawDueDate).slice(0, 10);
  if (dueDate && !isValidDateOnly(dueDate)) throw new InputValidationError("Termin celu jest nieprawidłowy.");
  const rawAccountId = body.accountId ?? body.account_id;
  const accountId = rawAccountId === null || rawAccountId === undefined || rawAccountId === "" ? null : Number(rawAccountId);
  if (accountId !== null && (!Number.isInteger(accountId) || accountId <= 0)) throw new InputValidationError("Wybierz prawidłowy depozyt celu.");
  if (accountId !== null) {
    const db = await dbPromise;
    const account = await db.get<{ typ_depozytu: string }>("SELECT typ_depozytu FROM konta WHERE id = ?", accountId);
    if (!account) throw new InputValidationError("Nie znaleziono wybranego depozytu.");
    if (isCreditAccountType(account.typ_depozytu)) throw new InputValidationError("Karta kredytowa nie może przechowywać środków celu.");
  }
  const noteValue = body.note ?? body.notatka;
  const rawIncludeAccountBalance = body.includeAccountBalance ?? body.include_account_balance ?? false;
  if (![true, false, 0, 1].includes(rawIncludeAccountBalance as boolean | number)) throw new InputValidationError("Ustawienie salda depozytu ma nieprawidłową wartość.");
  const includeAccountBalance = accountId !== null && (rawIncludeAccountBalance === true || rawIncludeAccountBalance === 1);
  return {
    name: requiredText(body.name ?? body.nazwa, "Nazwa celu"),
    type: enumValue(body.type ?? body.typ ?? "custom", GOAL_TYPES, "Typ celu"),
    targetAmount,
    allocatedAmount,
    dueDate,
    priority: enumValue(body.priority ?? body.priorytet ?? "normal", PRIORITIES, "Priorytet"),
    status: enumValue(body.status ?? "active", STATUSES, "Status"),
    accountId, includeAccountBalance,
    note: noteValue === null || noteValue === undefined || String(noteValue).trim() === "" ? null : String(noteValue).trim(),
  };
}

router.get("/", async (_req, res) => {
  try {
    const db = await dbPromise;
    res.json(await db.all(`SELECT g.*, k.nazwa AS account_name FROM financial_goals g LEFT JOIN konta k ON k.id = g.account_id ORDER BY CASE g.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, CASE g.priorytet WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, g.termin IS NULL, g.termin, g.id`));
  } catch (error) {
    res.status(500).json({ error: "Nie udało się pobrać celów.", details: error instanceof Error ? error.message : String(error) });
  }
});

router.post("/", async (req, res) => {
  try {
    const data = await normalizeGoal(req.body);
    const db = await dbPromise;
    const result = await db.run(
      `INSERT INTO financial_goals (nazwa, typ, kwota_docelowa, kwota_przypisana, termin, priorytet, status, account_id, include_account_balance, notatka)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.name, data.type, data.targetAmount, data.allocatedAmount, data.dueDate, data.priority, data.status, data.accountId, data.includeAccountBalance ? 1 : 0, data.note],
    );
    res.status(201).json(await db.get("SELECT * FROM financial_goals WHERE id = ?", result.lastID));
  } catch (error) {
    if (isInputValidationError(error)) return res.status(400).json({ error: error.message });
    res.status(500).json({ error: "Nie udało się dodać celu." });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Nieprawidłowy identyfikator celu." });
    const data = await normalizeGoal(req.body);
    const db = await dbPromise;
    const result = await db.run(
      `UPDATE financial_goals SET nazwa = ?, typ = ?, kwota_docelowa = ?, kwota_przypisana = ?, termin = ?, priorytet = ?, status = ?, account_id = ?, include_account_balance = ?, notatka = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`,
      [data.name, data.type, data.targetAmount, data.allocatedAmount, data.dueDate, data.priority, data.status, data.accountId, data.includeAccountBalance ? 1 : 0, data.note, id],
    );
    if (!result.changes) return res.status(404).json({ error: "Nie znaleziono celu." });
    res.json(await db.get("SELECT * FROM financial_goals WHERE id = ?", id));
  } catch (error) {
    if (isInputValidationError(error)) return res.status(400).json({ error: error.message });
    res.status(500).json({ error: "Nie udało się zapisać celu." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const db = await dbPromise;
    const result = await db.run("DELETE FROM financial_goals WHERE id = ?", req.params.id);
    if (!result.changes) return res.status(404).json({ error: "Nie znaleziono celu." });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Nie udało się usunąć celu." });
  }
});

export default router;
