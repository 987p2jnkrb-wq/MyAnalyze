import { buildDebtPlanTotals, effectiveDebtPlanCapital, effectiveDebtPlanDebt, effectiveMonthlyInstallment, type DebtPlan } from "./debtPlanModel";

const plans: DebtPlan[] = [
  { id: 1, produkt: "Jola", typ: "Dług", zadluzenie: 16300, kapital: null, rata_miesieczna: 100, ilosc_rat: 163, wolny_limit: null, limit_kredytowy: null, recurring_expense_id: 5, loan_id: null, account_id: null, linked_card_account_id: null, linked_card_name: null, one_time_fee: 0, repayment_account_id: null, repayment_account_name: null, recurring_expense_name: "Jola", data_od: null, data_do: null, dzien_miesiaca: null, rrso: null, oprocentowanie: null, prowizja: null, ubezpieczenie: null, data_dodania: null, updated_at: "2026-08-23", active: true },
  { id: 2, produkt: "Karta", typ: "Karta kredytowa", zadluzenie: 1693.45, kapital: 1200, rata_miesieczna: null, ilosc_rat: null, wolny_limit: 160, limit_kredytowy: 3000, recurring_expense_id: null, loan_id: 4, account_id: 2, linked_card_account_id: null, linked_card_name: null, one_time_fee: 0, repayment_account_id: null, repayment_account_name: null, recurring_expense_name: null, data_od: null, data_do: null, dzien_miesiaca: null, rrso: null, oprocentowanie: null, prowizja: null, ubezpieczenie: null, data_dodania: null, updated_at: "2026-08-23", active: true },
];
const expenses = [{ id: 5, nazwa: "Jola", kwota: 125, kategoria: "Kredyt", data_od: "2026-08-01", data_do: null, dzien_miesiaca: 10 }];

describe("manager debt plan", () => {
  it("uses the current amount of the linked recurring credit expense", () => {
    expect(effectiveMonthlyInstallment(plans[0], expenses)).toBe(125);
  });

  it("calculates debt, installments and card limits independently", () => {
    expect(buildDebtPlanTotals(plans, expenses)).toEqual({ debt: 17993.45, monthlyInstallment: 125, availableLimit: 160, creditLimit: 3000 });
  });

  it("uses calculated debt as capital except for a mortgage sourced from Credits", () => {
    expect(effectiveDebtPlanCapital({ ...plans[0], typ: "Kredyt", zadluzenie: 920, rata_miesieczna: 40, ilosc_rat: 23 })).toBe(920);
    expect(effectiveDebtPlanCapital({ ...plans[0], typ: "Kredyt hipoteczny", zadluzenie: 999999, kapital: 480000 })).toBe(480000);
  });

  it("does not count an installment plan twice inside the credit-card debt", () => {
    const installmentPlan: DebtPlan = { ...plans[0], id: 3, produkt: "Plan", typ: "Plan ratalny", zadluzenie: 1019.12, rata_miesieczna: 127.39, ilosc_rat: 8, recurring_expense_id: null, linked_card_account_id: 2, linked_card_name: "Karta", one_time_fee: 19.99 };
    expect(effectiveDebtPlanDebt(plans[1], [...plans, installmentPlan])).toBe(674.33);
    expect(buildDebtPlanTotals([...plans, installmentPlan], expenses).debt).toBe(17993.45);
  });
});
