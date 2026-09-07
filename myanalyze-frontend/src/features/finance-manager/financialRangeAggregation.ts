import type { RecurringModel } from "../../context/useRecurringResource";
import { isActualTransaction, isIncludedInAnalysis, isManualPlanEntry } from "./transactionSemantics";
import type { TransactionModel } from "../../context/useTransactionResource";
import type { IncomeCertainty } from "../../types/incomeCertainty";
import { isValidDateOnly, roundMoney } from "../../utils/validation";

export interface FinancialDateRange {
  start: Date;
  end: Date;
}

export interface FinancialAmountEntry {
  category: string;
  amount: number;
  certainty?: IncomeCertainty;
}

export interface FinancialRangeAggregation {
  plannedIncome: number;
  plannedExpenses: number;
  actualIncome: number;
  actualExpenses: number;
  plannedIncomeEntries: FinancialAmountEntry[];
  plannedExpenseEntries: FinancialAmountEntry[];
  actualIncomeEntries: FinancialAmountEntry[];
  actualExpenseEntries: FinancialAmountEntry[];
  realizedTransactions: number;
}

function localDateOnly(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function parseFinancialDate(value: string): Date | null {
  const dateOnly = value.slice(0, 10);
  if (!isValidDateOnly(dateOnly)) return null;
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function isDateInFinancialRange(date: Date, range: FinancialDateRange): boolean {
  const time = localDateOnly(date).getTime();
  return time >= localDateOnly(range.start).getTime() && time <= localDateOnly(range.end).getTime();
}

export function recurringOccurrences(entry: RecurringModel, range: FinancialDateRange): Date[] {
  const activeFrom = parseFinancialDate(entry.data_od);
  const activeTo = entry.data_do ? parseFinancialDate(entry.data_do) : null;
  if (!activeFrom) return [];
  const overriddenDates = new Set((entry.occurrenceOverrides ?? []).map((override) => override.date.slice(0, 10)));
  const result: Date[] = [];
  for (let cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1); cursor <= range.end; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
    const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const occurrence = new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(Math.max(1, entry.dzien_miesiaca), lastDay));
    const occurrenceKey = `${occurrence.getFullYear()}-${String(occurrence.getMonth() + 1).padStart(2, "0")}-${String(occurrence.getDate()).padStart(2, "0")}`;
    if (!overriddenDates.has(occurrenceKey) && isDateInFinancialRange(occurrence, range) && occurrence >= activeFrom && (!activeTo || occurrence <= activeTo)) result.push(occurrence);
  }
  return result;
}


function transactionClassificationLabel(row: TransactionModel): string {
  const label = row.customTypeName?.trim();
  if (label) return label;
  // Compatibility for older tests/callers created before customTypeId existed. Runtime API normalizes it to null.
  if (row.customTypeId === undefined && row.category?.trim()) return row.category.trim();
  return "Bez etykiety";
}

function recurringClassificationLabel(row: RecurringModel): string {
  const label = row.custom_type_name?.trim();
  if (label) return label;
  // Same compatibility rule as for one-time transactions.
  if (row.custom_type_id === undefined && row.kategoria?.trim()) return row.kategoria.trim();
  return "Bez etykiety";
}

function sum(entries: FinancialAmountEntry[]): number {
  return roundMoney(entries.reduce((total, entry) => total + Number(entry.amount || 0), 0));
}

export function aggregateFinancialRange({ range, incomes, expenses, recurringIncomes, recurringExpenses }: {
  range: FinancialDateRange;
  incomes: TransactionModel[];
  expenses: TransactionModel[];
  recurringIncomes: RecurringModel[];
  recurringExpenses: RecurringModel[];
}): FinancialRangeAggregation {
  const transactionsInRange = (rows: TransactionModel[]) => rows.filter((row) => {
    const date = parseFinancialDate(row.addedAt);
    return isIncludedInAnalysis(row) && date !== null && isDateInFinancialRange(date, range);
  });
  const incomeRows = transactionsInRange(incomes);
  const expenseRows = transactionsInRange(expenses);
  const manualPlan = (rows: TransactionModel[], income = false): FinancialAmountEntry[] => rows
    .filter(isManualPlanEntry)
    .map((row) => ({ category: transactionClassificationLabel(row), amount: Number(row.amount || 0), ...(income ? { certainty: row.certainty ?? "expected" } : {}) }));
  const recurringPlan = (rows: RecurringModel[], income = false): FinancialAmountEntry[] => rows.flatMap((row) => recurringOccurrences(row, range)
    .map(() => ({ category: recurringClassificationLabel(row), amount: Number(row.kwota || 0), ...(income ? { certainty: "guaranteed" as const } : {}) })));
  const actual = (rows: TransactionModel[]): FinancialAmountEntry[] => rows.filter(isActualTransaction)
    .map((row) => ({ category: transactionClassificationLabel(row), amount: Number(row.amount || 0) }));
  const plannedIncomeEntries = [...manualPlan(incomeRows, true), ...recurringPlan(recurringIncomes, true)];
  const plannedExpenseEntries = [...manualPlan(expenseRows), ...recurringPlan(recurringExpenses)];
  const actualIncomeEntries = actual(incomeRows);
  const actualExpenseEntries = actual(expenseRows);
  return {
    plannedIncome: sum(plannedIncomeEntries),
    plannedExpenses: sum(plannedExpenseEntries),
    actualIncome: sum(actualIncomeEntries),
    actualExpenses: sum(actualExpenseEntries),
    plannedIncomeEntries,
    plannedExpenseEntries,
    actualIncomeEntries,
    actualExpenseEntries,
    realizedTransactions: actualIncomeEntries.length + actualExpenseEntries.length,
  };
}
