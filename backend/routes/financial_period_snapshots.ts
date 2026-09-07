import { Router } from "express";
import { dbPromise } from "../db";
import { InputValidationError, isInputValidationError, requiredDateOnly, validatedNumber } from "../utils/validation";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const db = await dbPromise;
    res.json(await db.all("SELECT * FROM financial_period_snapshots ORDER BY period_end DESC, id DESC"));
  } catch {
    res.status(500).json({ error: "Nie udało się pobrać historii okresów." });
  }
});

router.post("/", async (req, res) => {
  try {
    const periodStart = requiredDateOnly(req.body.periodStart ?? req.body.period_start, "Początek okresu");
    const periodEnd = requiredDateOnly(req.body.periodEnd ?? req.body.period_end, "Koniec okresu");
    if (periodEnd < periodStart) throw new InputValidationError("Koniec okresu nie może być wcześniejszy niż jego początek.");
    const realLiquidity = validatedNumber(req.body.realLiquidity ?? req.body.real_liquidity, "Realna płynność", { required: true, money: true }) as number;
    const financialFloor = validatedNumber(req.body.financialFloor ?? req.body.financial_floor, "Finansowa podłoga", { required: true, min: 0, money: true }) as number;
    const consumerDebt = validatedNumber(req.body.consumerDebt ?? req.body.consumer_debt, "Dług konsumencki", { required: true, min: 0, money: true }) as number;
    const mortgageDebt = validatedNumber(req.body.mortgageDebt ?? req.body.mortgage_debt, "Dług hipoteczny", { required: true, min: 0, money: true }) as number;
    const goalsAllocated = validatedNumber(req.body.goalsAllocated ?? req.body.goals_allocated, "Środki w celach", { required: true, min: 0, money: true }) as number;
    const db = await dbPromise;
    await db.run(
      `INSERT INTO financial_period_snapshots (period_start, period_end, real_liquidity, financial_floor, consumer_debt, mortgage_debt, goals_allocated)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(period_start, period_end) DO UPDATE SET
         real_liquidity = excluded.real_liquidity,
         financial_floor = excluded.financial_floor,
         consumer_debt = excluded.consumer_debt,
         mortgage_debt = excluded.mortgage_debt,
         goals_allocated = excluded.goals_allocated,
         captured_at = datetime('now', 'localtime')`,
      [periodStart, periodEnd, realLiquidity, financialFloor, consumerDebt, mortgageDebt, goalsAllocated],
    );
    res.json(await db.get("SELECT * FROM financial_period_snapshots WHERE period_start = ? AND period_end = ?", periodStart, periodEnd));
  } catch (error) {
    if (isInputValidationError(error)) return res.status(400).json({ error: error.message });
    res.status(500).json({ error: "Nie udało się zapisać podsumowania okresu." });
  }
});

export default router;
