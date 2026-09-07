import type { TransactionModel } from "../../context/useTransactionResource";
import { isActualTransaction } from "./transactionSemantics";
import type { RecurringModel } from "../../context/useRecurringResource";
import { roundMoney } from "../../utils/validation";
import { aggregateFinancialRange, type FinancialAmountEntry } from "./financialRangeAggregation";
import { collectPlannedOperations } from "./financeSummary";

export interface MonthLabelResult {
  id: string;
  label: string;
  income: number;
  expenses: number;
  net: number;
  remainingIncome: number;
  remainingExpenses: number;
  forecast: number;
}

export function monthLabelKey(customTypeId: number | null | undefined, label: string): string {
  return customTypeId != null ? `label:${customTypeId}` : customTypeId === undefined ? `legacy:${label}` : "unlabelled";
}

export interface MonthCategorySummary {
  category: string;
  planned: number;
  actual: number;
  remaining: number;
  guaranteed: number;
  expected: number;
  potential: number;
}

export interface MonthSummary {
  plannedIncome: number;
  plannedGuaranteedIncome: number;
  plannedPotentialIncome: number;
  actualIncome: number;
  plannedExpenses: number;
  actualExpenses: number;
  plannedBalance: number;
  actualBalance: number;
  incomeCategories: MonthCategorySummary[];
  expenseCategories: MonthCategorySummary[];
  labelResults: MonthLabelResult[];
  remainingIncome: number;
  remainingExpenses: number;
  forecastBalance: number;
  outstandingOperations: ReturnType<typeof collectPlannedOperations>;
}

export interface MonthlyActualSummary {
  month: string;
  allIncome: number;
  allExpenses: number;
  income: number;
  expenses: number;
  net: number;
}

interface MonthViewInput {
  month: string;
  incomes: TransactionModel[];
  expenses: TransactionModel[];
  recurringIncomes: RecurringModel[];
  recurringExpenses: RecurringModel[];
  allocationIncomes?: TransactionModel[];
  allocationExpenses?: TransactionModel[];
}

function monthRange(month: string): { start: Date; end: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return { start: new Date(0), end: new Date(0) };
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (!Number.isInteger(year) || monthNumber < 1 || monthNumber > 12) return { start: new Date(0), end: new Date(0) };
  return { start: new Date(year, monthNumber - 1, 1), end: new Date(year, monthNumber, 0) };
}

function buildCategorySummary(
  plannedEntries: FinancialAmountEntry[],
  actualEntries: FinancialAmountEntry[],
  income = false,
): MonthCategorySummary[] {
  const categories = new Map<string, { planned: number; actual: number; guaranteed: number; expected: number; potential: number }>();
  const add = (category: string, field: "planned" | "actual", amount: number, certainty?: FinancialAmountEntry["certainty"]) => {
    const key = category || "Bez etykiety";
    const current = categories.get(key) ?? { planned: 0, actual: 0, guaranteed: 0, expected: 0, potential: 0 };
    current[field] += Number(amount || 0);
    if (field === "planned" && income) current[certainty ?? "expected"] += Number(amount || 0);
    categories.set(key, current);
  };
  plannedEntries.forEach((row) => add(row.category, "planned", row.amount, row.certainty));
  actualEntries.forEach((row) => add(row.category, "actual", row.amount));
  return Array.from(categories, ([category, values]) => ({
    category,
    planned: roundMoney(income ? values.guaranteed + values.expected : values.planned),
    actual: roundMoney(values.actual),
    remaining: roundMoney((income ? values.guaranteed + values.expected : values.planned) - values.actual),
    guaranteed: roundMoney(values.guaranteed),
    expected: roundMoney(values.expected),
    potential: roundMoney(values.potential),
  })).sort((left, right) => right.planned - left.planned || left.category.localeCompare(right.category, "pl"));
}

function sumIncomeByCertainty(entries: FinancialAmountEntry[], certainties: FinancialAmountEntry["certainty"][]): number {
  return roundMoney(entries.filter((entry) => certainties.includes(entry.certainty ?? "expected")).reduce((sum, entry) => sum + Number(entry.amount || 0), 0));
}

export function currentMonthValue(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(month: string, offset: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return currentMonthValue();
  const date = new Date(Number(match[1]), Number(match[2]) - 1 + offset, 1);
  return currentMonthValue(date);
}

export function formatMonthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  const label = date.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
  return label.charAt(0).toLocaleUpperCase("pl-PL") + label.slice(1);
}

export function buildMonthlyActualHistory(incomes: TransactionModel[], expenses: TransactionModel[]): MonthlyActualSummary[] {
  const months = new Map<string, { allIncome: number; allExpenses: number; income: number; expenses: number }>();
  const add = (transaction: TransactionModel, field: "income" | "expenses") => {
    if (!transaction.zrealizowany) return;
    const month = transaction.addedAt.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    const current = months.get(month) ?? { allIncome: 0, allExpenses: 0, income: 0, expenses: 0 };
    const amount = Number(transaction.amount || 0);
    if (field === "income") current.allIncome += amount;
    else current.allExpenses += amount;
    if (isActualTransaction(transaction)) current[field] += amount;
    months.set(month, current);
  };
  incomes.forEach((transaction) => add(transaction, "income"));
  expenses.forEach((transaction) => add(transaction, "expenses"));
  return Array.from(months, ([month, values]) => ({
    month,
    allIncome: roundMoney(values.allIncome),
    allExpenses: roundMoney(values.allExpenses),
    income: roundMoney(values.income),
    expenses: roundMoney(values.expenses),
    net: roundMoney(values.income - values.expenses),
  })).sort((left, right) => right.month.localeCompare(left.month));
}

export function buildMonthSummary({ month, incomes, expenses, recurringIncomes, recurringExpenses, allocationIncomes, allocationExpenses }: MonthViewInput): MonthSummary {
  const aggregation = aggregateFinancialRange({ range: monthRange(month), incomes, expenses, recurringIncomes, recurringExpenses });
  const plannedGuaranteedIncome = sumIncomeByCertainty(aggregation.plannedIncomeEntries, ["guaranteed"]);
  const plannedIncome = sumIncomeByCertainty(aggregation.plannedIncomeEntries, ["guaranteed", "expected"]);
  const plannedPotentialIncome = sumIncomeByCertainty(aggregation.plannedIncomeEntries, ["guaranteed", "expected", "potential"]);
  const outstanding = collectPlannedOperations({ range: monthRange(month), incomes, expenses, recurringIncomes, recurringExpenses, allocationIncomes, allocationExpenses })
    .filter((row) => row.kind !== "income" || row.certainty !== "potential");
  const labels = new Map<string, MonthLabelResult>();
  const add = (customTypeId: number | null | undefined, label: string, field: "income" | "expenses" | "remainingIncome" | "remainingExpenses", amount: number) => {
    const id = monthLabelKey(customTypeId, label);
    const row = labels.get(id) ?? { id, label, income: 0, expenses: 0, net: 0, remainingIncome: 0, remainingExpenses: 0, forecast: 0 };
    row[field] = roundMoney(row[field] + amount);
    labels.set(id, row);
  };
  const addActual = (rows: TransactionModel[], field: "income" | "expenses") => rows.filter((row) => isActualTransaction(row) && row.addedAt.slice(0, 7) === month).forEach((row) => {
    const label = row.customTypeName?.trim() || (row.customTypeId === undefined ? row.category : "") || "Bez etykiety";
    add(row.customTypeId, label, field, Number(row.amount || 0));
  });
  addActual(incomes, "income");
  addActual(expenses, "expenses");
  outstanding.forEach((row) => add(row.customTypeId, row.label, row.kind === "income" ? "remainingIncome" : "remainingExpenses", row.amount));
  const labelResults = [...labels.values()].map((row) => ({ ...row, net: roundMoney(row.income - row.expenses), forecast: roundMoney(row.income - row.expenses + row.remainingIncome - row.remainingExpenses) }));
  const remainingIncome = roundMoney(labelResults.reduce((sum, row) => sum + row.remainingIncome, 0));
  const remainingExpenses = roundMoney(labelResults.reduce((sum, row) => sum + row.remainingExpenses, 0));

  return {
    plannedIncome,
    plannedGuaranteedIncome,
    plannedPotentialIncome,
    actualIncome: aggregation.actualIncome,
    plannedExpenses: aggregation.plannedExpenses,
    actualExpenses: aggregation.actualExpenses,
    plannedBalance: roundMoney(plannedIncome - aggregation.plannedExpenses),
    actualBalance: roundMoney(aggregation.actualIncome - aggregation.actualExpenses),
    incomeCategories: buildCategorySummary(aggregation.plannedIncomeEntries, aggregation.actualIncomeEntries, true),
    expenseCategories: buildCategorySummary(aggregation.plannedExpenseEntries, aggregation.actualExpenseEntries),
    labelResults,
    remainingIncome,
    remainingExpenses,
    forecastBalance: roundMoney(aggregation.actualIncome - aggregation.actualExpenses + remainingIncome - remainingExpenses),
    outstandingOperations: outstanding,
  };
}
