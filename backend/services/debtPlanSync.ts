import { dbPromise } from "../db";
import { calculateDebt, syncLoanFromDebtPlan } from "./creditProduct";

type AppDatabase = Awaited<typeof dbPromise>;

/**
 * Synchronizuje WYŁĄCZNIE zobowiązanie już jawnie powiązane z wpisem stałym.
 * Etykieta/kategoria wpisu nie jest semantyką finansową i nie tworzy zobowiązania.
 */
export async function syncDebtPlanFromRecurringExpense(db: AppDatabase, expenseId: number | string): Promise<void> {
  const expense = await db.get<{ id: number; nazwa: string; kwota: unknown }>(
    "SELECT id, nazwa, kwota FROM wydatki_stale WHERE id = ?",
    expenseId,
  );
  const linked = await db.get<{ id: number; typ: string; zadluzenie: unknown; ilosc_rat: unknown }>(
    "SELECT id, typ, zadluzenie, ilosc_rat FROM debt_plans WHERE recurring_expense_id = ?",
    expenseId,
  );

  if (!linked) return;

  if (!expense) {
    // Ręczne usunięcie wpisu stałego nie usuwa zobowiązania. Po prostu odłącza ratę.
    await db.run("UPDATE debt_plans SET recurring_expense_id = NULL, updated_at = date('now') WHERE id = ?", linked.id);
    await syncLoanFromDebtPlan(db, linked.id);
    return;
  }

  const debt = calculateDebt(
    linked.typ,
    Number(linked.zadluzenie),
    Number(expense.kwota),
    linked.ilosc_rat === null ? null : Number(linked.ilosc_rat),
  );
  await db.run(
    "UPDATE debt_plans SET produkt = ?, rata_miesieczna = ?, zadluzenie = ?, updated_at = date('now') WHERE id = ?",
    [expense.nazwa, Number(expense.kwota), debt, linked.id],
  );
  await syncLoanFromDebtPlan(db, linked.id);
}
