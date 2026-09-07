import { Router } from "express";
import { dbPromise } from "../db";
import { InputValidationError, isInputValidationError, validatedNumber } from "../utils/validation";

const router = Router();

function normalizeSettings(body: Record<string, unknown>) {
  const financialFloor = validatedNumber(body.financialFloor ?? body.financial_floor, "Finansowa podłoga", { required: true, min: 0, money: true }) as number;
  const dailyLivingBudget = validatedNumber(body.dailyLivingBudget ?? body.daily_living_budget ?? 0, "Budżet bieżący / dzień", { required: true, min: 0, money: true }) as number;
  const paydayCycleStartDay = validatedNumber(body.paydayCycleStartDay ?? body.payday_cycle_start_day ?? 10, "Dzień rozpoczęcia okresu", { required: true, min: 1, max: 31, integer: true }) as number;
  const thresholds = [1, 2, 3].map((index) => validatedNumber(body[`threshold${index}`] ?? body[`prog_${index}`], `Próg ${index}`, { required: true, min: 0.01, money: true }) as number);
  if (thresholds[0] < financialFloor) throw new InputValidationError("Próg 1 nie może być niższy niż finansowa podłoga.");
  if (thresholds[1] <= thresholds[0]) throw new InputValidationError("Próg 2 musi być wyższy niż Próg 1.");
  if (thresholds[2] <= thresholds[1]) throw new InputValidationError("Próg 3 musi być wyższy niż Próg 2.");
  const allocations = [1, 2, 3].map((index) => validatedNumber(body[`allocation${index}`] ?? body[`alokacja_${index}`], `Alokacja ${index}`, { required: true, min: 0, max: 100 }) as number);
  return { financialFloor, dailyLivingBudget, paydayCycleStartDay, thresholds, allocations };
}

router.get("/", async (_req, res) => {
  try {
    const db = await dbPromise;
    res.json(await db.get("SELECT * FROM financial_goal_settings WHERE id = 1"));
  } catch {
    res.status(500).json({ error: "Nie udało się pobrać ustawień planowania." });
  }
});

router.put("/1", async (req, res) => {
  try {
    const data = normalizeSettings(req.body);
    const db = await dbPromise;
    await db.run(
      `UPDATE financial_goal_settings SET financial_floor = ?, daily_living_budget = ?, payday_cycle_start_day = ?, prog_1 = ?, prog_2 = ?, prog_3 = ?, alokacja_1 = ?, alokacja_2 = ?, alokacja_3 = ?, updated_at = datetime('now', 'localtime') WHERE id = 1`,
      [data.financialFloor, data.dailyLivingBudget, data.paydayCycleStartDay, ...data.thresholds, ...data.allocations],
    );
    res.json(await db.get("SELECT * FROM financial_goal_settings WHERE id = 1"));
  } catch (error) {
    if (isInputValidationError(error)) return res.status(400).json({ error: error.message });
    res.status(500).json({ error: "Nie udało się zapisać ustawień planowania." });
  }
});

export default router;
