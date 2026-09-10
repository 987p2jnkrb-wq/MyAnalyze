import type { RecurringModel } from "../../context/useRecurringResource";
import { calculateDebt, calculateEffectiveCreditCardDebt, normalizeCreditProductType, optionalNumber } from "./creditProductModel";

export const DEBT_PLAN_TYPES = ["Dług", "Raty", "Kredyt", "Kredyt hipoteczny", "Karta kredytowa", "Plan ratalny", "Inne"] as const;
export type DebtPlanType = typeof DEBT_PLAN_TYPES[number];

export interface DebtPlan {
  id: number;
  produkt: string;
  typ: DebtPlanType;
  zadluzenie: number;
  kapital: number | null;
  rata_miesieczna: number | null;
  ilosc_rat: number | null;
  wolny_limit: number | null;
  limit_kredytowy: number | null;
  recurring_expense_id: number | null;
  loan_id: number | null;
  account_id: number | null;
  linked_card_account_id: number | null;
  linked_card_name: string | null;
  one_time_fee: number;
  repayment_account_id: number | null;
  repayment_account_name: string | null;
  recurring_expense_name: string | null;
  data_od: string | null;
  data_do: string | null;
  dzien_miesiaca: number | null;
  rrso: number | null;
  oprocentowanie: number | null;
  prowizja: number | null;
  ubezpieczenie: number | null;
  data_dodania: string | null;
  updated_at: string;
  active: boolean;
}

export type DebtPlanDraft = Omit<DebtPlan, "id" | "kapital" | "linked_card_name" | "repayment_account_name" | "recurring_expense_name" | "data_od" | "data_do" | "dzien_miesiaca" | "data_dodania" | "updated_at" | "loan_id" | "account_id"> & { kwota_kapitalu?: number | null };
export interface DebtPlanPayload extends DebtPlanDraft {
  data_od?: string;
  data_do?: string | null;
  dzien_miesiaca?: number;
  recurring_expense_mode?: "keep" | "none" | "create" | "link";
}

export function effectiveMonthlyInstallment(plan: DebtPlan, recurringExpenses: RecurringModel[]): number {
  const linked = recurringExpenses.find((expense) => expense.id === plan.recurring_expense_id);
  return linked ? Number(linked.kwota || 0) : Number(plan.rata_miesieczna || 0);
}

export function effectiveDebtPlanCapital(plan: DebtPlan): number | null {
  return normalizeCreditProductType(plan.typ) === "Kredyt hipoteczny" ? plan.kapital : Number(plan.zadluzenie || 0);
}

export function buildDebtPlanTotals(plans: DebtPlan[], recurringExpenses: RecurringModel[]) {
  return plans.reduce((totals, plan) => ({
    debt: totals.debt + effectiveDebtPlanDebt(plan, plans),
    monthlyInstallment: totals.monthlyInstallment + effectiveMonthlyInstallment(plan, recurringExpenses),
    availableLimit: totals.availableLimit + Number(plan.wolny_limit || 0),
    creditLimit: totals.creditLimit + Number(plan.limit_kredytowy || 0),
  }), { debt: 0, monthlyInstallment: 0, availableLimit: 0, creditLimit: 0 });
}

export function effectiveDebtPlanDebt(plan: DebtPlan, plans: DebtPlan[]): number {
  return calculateEffectiveCreditCardDebt(plan.typ, plan.zadluzenie, plan.account_id, plans.map((item) => ({
    type: item.typ,
    linkedCardAccountId: item.linked_card_account_id,
    debt: item.zadluzenie,
  })));
}

export function normalizeDebtPlan(item: Partial<DebtPlan>): DebtPlan {
  return {
    id: Number(item.id),
    produkt: String(item.produkt ?? ""),
    typ: String(item.typ) === "Karta" ? "Karta kredytowa" : DEBT_PLAN_TYPES.includes(item.typ as DebtPlanType) ? item.typ as DebtPlanType : normalizeCreditProductType(item.typ),
    zadluzenie: calculateDebt(item.typ, Number(item.zadluzenie || 0), optionalNumber(item.rata_miesieczna), optionalNumber(item.ilosc_rat)),
    kapital: optionalNumber(item.kapital),
    rata_miesieczna: optionalNumber(item.rata_miesieczna),
    ilosc_rat: optionalNumber(item.ilosc_rat),
    wolny_limit: optionalNumber(item.wolny_limit),
    limit_kredytowy: optionalNumber(item.limit_kredytowy),
    recurring_expense_id: optionalNumber(item.recurring_expense_id),
    loan_id: optionalNumber(item.loan_id),
    account_id: optionalNumber(item.account_id),
    linked_card_account_id: optionalNumber(item.linked_card_account_id),
    linked_card_name: item.linked_card_name ? String(item.linked_card_name) : null,
    one_time_fee: Number(item.one_time_fee || 0),
    repayment_account_id: optionalNumber(item.repayment_account_id),
    repayment_account_name: item.repayment_account_name ? String(item.repayment_account_name) : null,
    recurring_expense_name: item.recurring_expense_name ? String(item.recurring_expense_name) : null,
    data_od: item.data_od ? String(item.data_od).slice(0, 10) : null,
    data_do: item.data_do ? String(item.data_do).slice(0, 10) : null,
    dzien_miesiaca: optionalNumber(item.dzien_miesiaca),
    rrso: optionalNumber(item.rrso),
    oprocentowanie: optionalNumber(item.oprocentowanie),
    prowizja: optionalNumber(item.prowizja),
    ubezpieczenie: optionalNumber(item.ubezpieczenie),
    data_dodania: item.data_dodania ? String(item.data_dodania).slice(0, 10) : null,
    updated_at: String(item.updated_at ?? ""),
    active: item.active === undefined || item.active === null ? true : item.active === true || Number(item.active) === 1,
  };
}
