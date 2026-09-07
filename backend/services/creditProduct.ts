import { dbPromise } from "../db";
import { reconcileRecurringCreditExpense, type RecurringExpenseSelection } from "./recurringCreditExpense";
import { deleteRecurringEntry } from "./recurringEntries";

type AppDatabase = Awaited<typeof dbPromise>;

// Keep in sync with myanalyze-frontend/src/features/finance-manager/creditProductModel.ts.
export const CREDIT_PRODUCT_TYPES = ["Kredyt", "Kredyt hipoteczny", "Karta kredytowa", "Plan ratalny"] as const;
export type CreditProductType = typeof CREDIT_PRODUCT_TYPES[number];

export function normalizeCreditProductType(value: unknown): CreditProductType {
  const normalized = String(value ?? "").trim().toLocaleLowerCase("pl-PL");
  if (normalized === "kredyt hipoteczny" || normalized === "hipoteka") return "Kredyt hipoteczny";
  if (normalized === "karta" || normalized === "karta kredytowa") return "Karta kredytowa";
  if (normalized === "plan ratalny") return "Plan ratalny";
  return "Kredyt";
}

export function isCreditCardType(value: unknown): boolean {
  return normalizeCreditProductType(value) === "Karta kredytowa";
}

export function isInstallmentPlanType(value: unknown): boolean {
  return normalizeCreditProductType(value) === "Plan ratalny";
}

export function usesCalculatedDebt(value: unknown): boolean {
  const type = String(value ?? "").trim().toLocaleLowerCase("pl-PL");
  return type === "kredyt" || type === "plan ratalny";
}

export function calculateDebt(type: unknown, manualDebt: number, installment: number | null, installmentCount: number | null): number {
  if (usesCalculatedDebt(type) && (!Number.isFinite(manualDebt) || manualDebt <= 0) && installment !== null && installmentCount !== null) {
    return Math.round(installment * installmentCount * 100) / 100;
  }
  return manualDebt;
}

type LoanForSync = {
  id: number;
  nazwa: string;
  typ: string | null;
  ilosc_rat: unknown;
  kwota_calkowita: unknown;
  kwota_raty: unknown;
  data_rozpoczecia: string | null;
  data_do: string | null;
  dzien_splaty: unknown;
  prowizja: unknown;
};

export async function syncDebtPlanFromLoan(db: AppDatabase, loanId: number | string, selection: RecurringExpenseSelection = { mode: "keep" }): Promise<void> {
  const loan = await db.get<LoanForSync>(
    "SELECT id, nazwa, typ, ilosc_rat, kwota_calkowita, kwota_raty, data_rozpoczecia, data_do, dzien_splaty, prowizja FROM loans WHERE id = ?",
    loanId,
  );
  let linked = await db.get<{ id: number; zadluzenie: unknown; recurring_expense_id: number | null; account_id: number | null; loan_id: number | null }>("SELECT id, zadluzenie, recurring_expense_id, account_id, loan_id FROM debt_plans WHERE loan_id = ?", loanId);
  if (!loan) {
    if (linked?.recurring_expense_id !== null && linked?.recurring_expense_id !== undefined) {
      await deleteRecurringEntry(db, "expense", linked.recurring_expense_id);
    }
    if (linked) await db.run("DELETE FROM debt_plans WHERE id = ?", linked.id);
    return;
  }

  if (!linked && selection.mode === "link" && selection.expenseId) {
    const expensePlan = await db.get<{ id: number; zadluzenie: unknown; recurring_expense_id: number | null; account_id: number | null; loan_id: number | null }>(
      "SELECT id, zadluzenie, recurring_expense_id, account_id, loan_id FROM debt_plans WHERE recurring_expense_id = ?",
      selection.expenseId,
    );
    if (expensePlan?.loan_id) throw new Error("Ten stały wydatek jest już powiązany z innym kredytem.");
    if (expensePlan?.account_id) throw new Error("Ten stały wydatek jest już powiązany z produktem konta.");
    if (expensePlan) {
      await db.run("UPDATE debt_plans SET loan_id = ? WHERE id = ?", loan.id, expensePlan.id);
      linked = { ...expensePlan, loan_id: loan.id };
    }
  }

  const type = normalizeCreditProductType(loan.typ);
  const installmentCount = Number.isFinite(Number(loan.ilosc_rat)) ? Number(loan.ilosc_rat) : null;
  const installment = Number.isFinite(Number(loan.kwota_raty)) ? Number(loan.kwota_raty) : null;
  const manualDebt = Number.isFinite(Number(loan.kwota_calkowita)) ? Number(loan.kwota_calkowita) : 0;
  const debt = calculateDebt(type, manualDebt, installment, installmentCount);
  const expenseData = {
    name: loan.nazwa, installment, startDate: loan.data_rozpoczecia, endDate: loan.data_do,
    paymentDay: Number.isFinite(Number(loan.dzien_splaty)) ? Number(loan.dzien_splaty) : null,
  };

  if (linked) {
    const recurringExpenseId = await reconcileRecurringCreditExpense(db, linked.recurring_expense_id, selection, expenseData, linked.id);
    await db.run(
      `UPDATE debt_plans SET produkt = ?, typ = ?, zadluzenie = ?, rata_miesieczna = ?, ilosc_rat = ?,
       wolny_limit = CASE WHEN ? = 'Karta kredytowa' THEN wolny_limit ELSE NULL END,
       limit_kredytowy = CASE WHEN ? = 'Karta kredytowa' THEN limit_kredytowy ELSE NULL END,
       one_time_fee = CASE WHEN ? = 'Plan ratalny' THEN ? ELSE 0 END, recurring_expense_id = ?,
       updated_at = date('now') WHERE id = ?`,
      [loan.nazwa, type, debt, installment, installmentCount, type, type, type, Number(loan.prowizja || 0), recurringExpenseId, linked.id],
    );
    if (linked.account_id !== null) await syncAccountFromDebtPlan(db, linked.id);
    return;
  }

  const recurringExpenseId = await reconcileRecurringCreditExpense(db, null, selection, expenseData);
  await db.run(
    `INSERT INTO debt_plans
     (produkt, typ, zadluzenie, rata_miesieczna, ilosc_rat, wolny_limit, limit_kredytowy, recurring_expense_id, loan_id, one_time_fee, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, date('now'))`,
    [loan.nazwa, type, debt, installment, installmentCount, recurringExpenseId, loan.id, isInstallmentPlanType(type) ? Number(loan.prowizja || 0) : 0],
  );
}

export async function syncLoanFromDebtPlan(db: AppDatabase, debtPlanId: number | string, createIfMissing = false): Promise<void> {
  const plan = await db.get<{
    id: number; loan_id: number | null; produkt: string; typ: string; zadluzenie: unknown;
    rata_miesieczna: unknown; ilosc_rat: unknown; recurring_expense_id: number | null;
    data_od: string | null; data_do: string | null; dzien_miesiaca: unknown; one_time_fee: unknown;
  }>(
    `SELECT d.id, d.loan_id, d.produkt, d.typ, d.zadluzenie, d.rata_miesieczna, d.ilosc_rat, d.recurring_expense_id, d.one_time_fee,
     COALESCE(w.data_od, d.start_date) AS data_od, w.data_do, w.dzien_miesiaca
     FROM debt_plans d
     LEFT JOIN wydatki_stale w ON w.id = d.recurring_expense_id
     WHERE d.id = ?`,
    debtPlanId,
  );
  if (!plan) return;
  const type = normalizeCreditProductType(plan.typ);
  if (!plan.loan_id) {
    if (!createIfMissing) return;
    const result = await db.run(
      `INSERT INTO loans
       (nazwa, typ, data_rozpoczecia, data_do, ilosc_rat, kwota_kapitalu, kwota_calkowita, kwota_raty,
        rrso, dzien_splaty, oprocentowanie, prowizja, ubezpieczenie, data_dodania)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, date('now', 'localtime'))`,
      [plan.produkt, type, plan.data_od, plan.data_do, plan.ilosc_rat, Number(plan.zadluzenie), plan.rata_miesieczna, isInstallmentPlanType(type) ? 0 : null, plan.dzien_miesiaca, isInstallmentPlanType(type) ? 0 : null, isInstallmentPlanType(type) ? Number(plan.one_time_fee || 0) : null],
    );
    await db.run("UPDATE debt_plans SET loan_id = ? WHERE id = ?", result.lastID, plan.id);
    return;
  }
  if (plan.recurring_expense_id !== null) {
    await db.run(
      `UPDATE loans SET nazwa = ?, typ = ?, kwota_calkowita = ?, kwota_raty = ?, ilosc_rat = ?,
       data_rozpoczecia = ?, data_do = ?, dzien_splaty = ?, rrso = ?, oprocentowanie = ?, prowizja = ?
       WHERE id = ?`,
      [plan.produkt, type, Number(plan.zadluzenie), plan.rata_miesieczna, plan.ilosc_rat, plan.data_od, plan.data_do, plan.dzien_miesiaca, isInstallmentPlanType(type) ? 0 : null, isInstallmentPlanType(type) ? 0 : null, isInstallmentPlanType(type) ? Number(plan.one_time_fee || 0) : null, plan.loan_id],
    );
  } else {
    await db.run(
      "UPDATE loans SET nazwa = ?, typ = ?, kwota_calkowita = ?, kwota_raty = ?, ilosc_rat = ?, data_rozpoczecia = ?, rrso = ?, oprocentowanie = ?, prowizja = ? WHERE id = ?",
      [plan.produkt, type, Number(plan.zadluzenie), plan.rata_miesieczna, plan.ilosc_rat, plan.data_od, isInstallmentPlanType(type) ? 0 : null, isInstallmentPlanType(type) ? 0 : null, isInstallmentPlanType(type) ? Number(plan.one_time_fee || 0) : null, plan.loan_id],
    );
  }
}

export async function syncAccountFromDebtPlan(db: AppDatabase, debtPlanId: number | string): Promise<void> {
  const plan = await db.get<{
    id: number; account_id: number | null; produkt: string; typ: string; zadluzenie: unknown;
    wolny_limit: unknown; limit_kredytowy: unknown; active: unknown;
  }>("SELECT id, account_id, produkt, typ, zadluzenie, wolny_limit, limit_kredytowy, active FROM debt_plans WHERE id = ?", debtPlanId);
  if (!plan || !isCreditCardType(plan.typ)) return;
  if (plan.account_id !== null) await db.run("UPDATE konta SET active = ? WHERE id = ?", [Number(plan.active ?? 1) === 0 ? 0 : 1, plan.account_id]);
  // Brak obu limitów oznacza świadomie nieuzupełnione dane; nie zamieniamy ich przez synchronizację na zera.
  if (plan.wolny_limit === null && plan.limit_kredytowy === null) return;
  const debt = Math.max(0, Number(plan.zadluzenie) || 0);
  const available = plan.wolny_limit === null ? Math.max(0, (Number(plan.limit_kredytowy) || debt) - debt) : Number(plan.wolny_limit);
  const limit = plan.limit_kredytowy === null ? available + debt : Number(plan.limit_kredytowy);
  const actual = Math.round((available - limit) * 100) / 100;
  let accountId = plan.account_id;
  if (accountId === null) {
    const matchingAccounts = await db.all<{ id: number }[]>(
      "SELECT id FROM konta WHERE lower(trim(nazwa)) = lower(trim(?)) AND lower(typ_depozytu) LIKE '%kredyt%' ORDER BY id LIMIT 2",
      plan.produkt,
    );
    if (matchingAccounts.length === 1) {
      accountId = matchingAccounts[0].id;
    } else if (matchingAccounts.length === 0) {
      const created = await db.run(
        "INSERT INTO konta (nazwa, saldo_dostepne, saldo_wlasciwe, typ_depozytu) VALUES (?, ?, ?, 'karta_kredytowa')",
        [plan.produkt, available, actual],
      );
      accountId = Number(created.lastID);
      // Trigger konta tworzy własny wpis; zachowujemy pierwotne Zobowiązanie i usuwamy techniczny duplikat.
      await db.run("DELETE FROM debt_plans WHERE account_id = ? AND id <> ?", accountId, plan.id);
    }
    if (accountId !== null) await db.run("UPDATE debt_plans SET account_id = ? WHERE id = ?", accountId, plan.id);
  }
  if (accountId === null) return;
  await db.run(
    "UPDATE konta SET nazwa = ?, saldo_dostepne = ?, saldo_wlasciwe = ?, typ_depozytu = 'karta_kredytowa', active = ? WHERE id = ?",
    [plan.produkt, available, actual, Number(plan.active ?? 1) === 0 ? 0 : 1, accountId],
  );
}
