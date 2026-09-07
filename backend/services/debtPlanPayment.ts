import type { Database } from "sqlite";
import { isCreditCardType, syncAccountFromDebtPlan, syncLoanFromDebtPlan } from "./creditProduct";
import { deleteRecurringEntry } from "./recurringEntries";

export async function applyDebtPlanPayment(db: Database, input: { debtPlanId: number; amount: number; paymentDate: string }): Promise<{ debtBefore: number; debtAfter: number; amount: number }> {
  const plan = await db.get<{ id: number; typ: string; zadluzenie: unknown; rata_miesieczna: unknown; ilosc_rat: unknown; recurring_expense_id: number | null }>(
    "SELECT id, typ, zadluzenie, rata_miesieczna, ilosc_rat, recurring_expense_id FROM debt_plans WHERE id = ?",
    input.debtPlanId,
  );
  const debtBefore = Number(plan?.zadluzenie);
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!plan || !Number.isFinite(debtBefore) || debtBefore <= 0 || !Number.isFinite(amount) || amount <= 0 || amount > debtBefore) throw new Error("Nieprawidłowa kwota spłaty zobowiązania.");
  const installment = Number(plan.rata_miesieczna);
  const debtAfter = Math.max(0, Math.round((debtBefore - amount) * 100) / 100);
  let installmentsAfter = Math.max(0, Number(plan.ilosc_rat || 0) - 1);
  if (debtAfter > 0 && installmentsAfter === 0 && Number.isFinite(installment) && installment > 0) installmentsAfter = Math.ceil(debtAfter / installment);
  await db.run(
    "UPDATE debt_plans SET zadluzenie = ?, ilosc_rat = ?, rata_miesieczna = ?, recurring_expense_id = ?, updated_at = ? WHERE id = ?",
    [debtAfter, installmentsAfter, debtAfter === 0 ? null : installment, debtAfter === 0 ? null : plan.recurring_expense_id, input.paymentDate, input.debtPlanId],
  );
  if (debtAfter === 0 && plan.recurring_expense_id !== null) await deleteRecurringEntry(db, "expense", plan.recurring_expense_id);
  if (isCreditCardType(plan.typ)) await syncAccountFromDebtPlan(db, input.debtPlanId);
  await syncLoanFromDebtPlan(db, input.debtPlanId);
  return { debtBefore, debtAfter, amount };
}
