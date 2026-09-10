import { Router } from "express";
import { dbPromise } from "../db";
import { InputValidationError, isInputValidationError, validatedNumber } from "../utils/validation";

const router = Router();
const NEW_FUNDS_KINDS = new Set(["debt", "goal", "account", "buffer"]);

function normalizeNewFundsStrategy(body: Record<string, unknown>) {
  const items = Array.isArray(body.items) ? body.items : null;
  if (!items || items.length === 0) throw new InputValidationError("Dodaj co najmniej jedną pozycję strategii.");
  if (items.length > 20) throw new InputValidationError("Strategia może zawierać maksymalnie 20 pozycji.");
  let bufferCount = 0;
  const normalized = items.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputValidationError(`Pozycja ${index + 1} strategii jest nieprawidłowa.`);
    const row = value as Record<string, unknown>;
    const kind = String(row.kind ?? "").trim();
    if (!NEW_FUNDS_KINDS.has(kind)) throw new InputValidationError(`Pozycja ${index + 1} ma nieprawidłowy typ.`);
    const share = validatedNumber(row.share, `Udział pozycji ${index + 1}`, { required: true, min: 1, max: 100, integer: true }) as number;
    let targetId: number | null = null;
    if (kind === "buffer") {
      bufferCount += 1;
      if (bufferCount > 1) throw new InputValidationError("Poduszkę finansową można dodać do strategii tylko raz.");
    } else {
      targetId = validatedNumber(row.targetId, `Cel pozycji ${index + 1}`, { required: true, min: 1, integer: true }) as number;
    }
    return { id: String(row.id ?? `${kind}-${targetId ?? "buffer"}-${index + 1}`), kind, targetId, share };
  });
  const total = normalized.reduce((sum, item) => sum + item.share, 0);
  if (total !== 100) throw new InputValidationError(`Suma udziałów strategii musi wynosić 100% (obecnie ${total}%).`);
  const uniqueTargets = new Set<string>();
  for (const item of normalized) {
    const key = `${item.kind}:${item.targetId ?? "buffer"}`;
    if (uniqueTargets.has(key)) throw new InputValidationError("Ta sama pozycja nie może występować w strategii więcej niż raz.");
    uniqueTargets.add(key);
  }
  return { version: 1, items: normalized };
}

function normalizeSettings(body: Record<string, unknown>) {
  const financialFloor = validatedNumber(body.financialFloor ?? body.financial_floor, "Finansowa podłoga", { required: true, min: 0, money: true }) as number;
  const dailyLivingBudget = validatedNumber(body.dailyLivingBudget ?? body.daily_living_budget ?? 0, "Budżet bieżący / dzień", { required: true, min: 0, money: true }) as number;
  const paydayCycleStartDay = validatedNumber(body.paydayCycleStartDay ?? body.payday_cycle_start_day ?? 10, "Dzień rozpoczęcia okresu", { required: true, min: 1, max: 31, integer: true }) as number;
  const thresholds = [1, 2, 3].map((index) => validatedNumber(body[`threshold${index}`] ?? body[`prog_${index}`], `Próg ${index}`, { required: true, min: 0.01, money: true }) as number);
  if (thresholds[0] < financialFloor) throw new InputValidationError("Próg 1 nie może być niższy niż finansowa podłoga.");
  if (thresholds[1] <= thresholds[0]) throw new InputValidationError("Próg 2 musi być wyższy niż Próg 1.");
  if (thresholds[2] <= thresholds[1]) throw new InputValidationError("Próg 3 musi być wyższy niż Próg 2.");
  const allocations = [1, 2, 3].map((index) => validatedNumber(body[`allocation${index}`] ?? body[`alokacja_${index}`], `Alokacja ${index}`, { required: true, min: 0, max: 100, integer: true }) as number);
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

router.put("/1/planning", async (req, res) => {
  try {
    const settings = normalizeSettings(req.body?.settings ?? {});
    const strategy = normalizeNewFundsStrategy(req.body?.strategy ?? {});
    const db = await dbPromise;
    await db.run(
      `UPDATE financial_goal_settings
          SET financial_floor = ?, daily_living_budget = ?, payday_cycle_start_day = ?,
              prog_1 = ?, prog_2 = ?, prog_3 = ?, alokacja_1 = ?, alokacja_2 = ?, alokacja_3 = ?,
              new_funds_strategy = ?, updated_at = datetime('now', 'localtime')
        WHERE id = 1`,
      [
        settings.financialFloor,
        settings.dailyLivingBudget,
        settings.paydayCycleStartDay,
        ...settings.thresholds,
        ...settings.allocations,
        JSON.stringify(strategy),
      ],
    );
    res.json(await db.get("SELECT * FROM financial_goal_settings WHERE id = 1"));
  } catch (error) {
    if (isInputValidationError(error)) return res.status(400).json({ error: error.message });
    res.status(500).json({ error: "Nie udało się zapisać ustawień planowania." });
  }
});

export default router;
