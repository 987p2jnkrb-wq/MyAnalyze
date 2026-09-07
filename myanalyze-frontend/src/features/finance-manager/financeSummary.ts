import type { Account } from "../../types/account";
import type { TransactionModel } from "../../context/useTransactionResource";
import type { RecurringModel } from "../../context/useRecurringResource";
import { displayedActualBalance } from "../../utils/accountModel";
import { localDateKey, roundMoney } from "../../utils/validation";
import { aggregateFinancialRange, isDateInFinancialRange, parseFinancialDate, recurringOccurrences } from "./financialRangeAggregation";
import { isOutstandingStandalonePlan, outstandingStandalonePlanAmount } from "./transactionSemantics";

export const PAYDAY_DAY = 10;

export interface FinanceSummaryValues {
  actualFunds: number;
  recurringIncome: number;
  recurringExpenses: number;
  additionalIncome: number;
  additionalExpenses: number;
  availableWithCredit: number;
  dailyBudget: number;
  daysUntilPayday: number;
  nextPayday: Date;
}

export interface PayPeriod {
  start: Date;
  end: Date;
}

export interface HistoricalPeriodSummary {
  period: PayPeriod;
  plannedIncome: number;
  plannedExpenses: number;
  plannedBalance: number;
  actualIncome: number;
  actualExpenses: number;
  actualBalance: number;
  realizedTransactions: number;
}

export interface PeriodSummaryValues {
  period: PayPeriod;
  selectedDate: Date;
  currentActual: number;
  currentAvailable: number;
  periodIncome: number;
  periodExpenses: number;
  incomeUntilSelectedDate: number;
  expensesUntilSelectedDate: number;
  actualAtSelectedDate: number;
  actualDailyBudget: number;
  availableAtSelectedDate: number;
  availableDailyBudget: number;
  daysToSelectedDate: number;
  remainingDaysInPeriod: number;
  dailyLivingBudget: number;
  dailyLivingReserve: number;
  actualAfterLivingReserveAtSelectedDate: number;
  actualAfterLivingReserveDailyBudget: number;
  plannedActualAtSelectedDate: number;
  safeDailyBudget: number;
}

export interface UpcomingOperation {
  id: string;
  kind: "income" | "expense";
  name: string;
  amount: number;
  source: "one-time" | "recurring";
  certainty?: TransactionModel["certainty"];
}

export interface UpcomingOperationDay {
  date: Date;
  operations: UpcomingOperation[];
  income: number;
  expenses: number;
  balanceAfterDay: number;
  belowFinancialFloor: boolean;
}

export type DailyBudgetAssessmentStatus = "unconfigured" | "insufficient" | "tight" | "comfortable";

export interface DailyBudgetAssessment {
  status: DailyBudgetAssessmentStatus;
  ratio: number | null;
  label: string;
}

interface DatedPlannedOperation extends UpcomingOperation {
  date: Date;
  customTypeId?: number | null;
  label: string;
}

function planAllocationMap(incomes: TransactionModel[], expenses: TransactionModel[]): Map<string, number> {
  const result = new Map<string, number>();
  const collect = (rows: TransactionModel[], kind: UpcomingOperation["kind"]) => rows.forEach((row) => {
    const matches = row.planMatches ?? [];
    matches.forEach((match) => {
      const occurrence = match.source === "recurring" ? match.occurrenceDate ?? "" : "";
      const key = `${kind}:${match.source}:${match.planId}:${occurrence}`;
      result.set(key, roundMoney((result.get(key) ?? 0) + match.allocatedAmount));
    });
  });
  collect(incomes, "income");
  collect(expenses, "expense");
  return result;
}

export function assessDailyBudget(safeDailyBudget: number, dailyLivingBudget: number): DailyBudgetAssessment {
  const plan = Math.max(0, Number(dailyLivingBudget) || 0);
  if (plan === 0) return { status: "unconfigured", ratio: null, label: "Brak ustawionego planu" };
  const ratio = roundMoney(Math.max(0, Number(safeDailyBudget) || 0) / plan);
  if (ratio < 1) return { status: "insufficient", ratio, label: "Niewystarczająco" };
  if (ratio < 1.5) return { status: "tight", ratio, label: "Na styk" };
  return { status: "comfortable", ratio, label: "Komfortowo" };
}

function localDateOnly(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function cycleStartInMonth(year: number, month: number, paydayDay: number): Date {
  const monthStart = new Date(year, month, 1);
  const lastDay = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  return new Date(monthStart.getFullYear(), monthStart.getMonth(), Math.min(Math.max(1, paydayDay), lastDay));
}

export function getNextPayday(now: Date, paydayDay = PAYDAY_DAY): Date {
  const today = localDateOnly(now);
  const thisMonth = cycleStartInMonth(today.getFullYear(), today.getMonth(), paydayDay);
  return today < thisMonth ? thisMonth : cycleStartInMonth(today.getFullYear(), today.getMonth() + 1, paydayDay);
}

export function calendarDaysBetween(from: Date, to: Date): number {
  const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.max(1, Math.round((toUtc - fromUtc) / 86_400_000));
}

export function calendarDaysInclusive(from: Date, to: Date): number {
  const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.max(1, Math.round((toUtc - fromUtc) / 86_400_000) + 1);
}

export function getPayPeriod(now: Date, paydayDay = PAYDAY_DAY): PayPeriod {
  const today = localDateOnly(now);
  const thisMonthStart = cycleStartInMonth(today.getFullYear(), today.getMonth(), paydayDay);
  const start = today >= thisMonthStart ? thisMonthStart : cycleStartInMonth(today.getFullYear(), today.getMonth() - 1, paydayDay);
  const nextStart = cycleStartInMonth(start.getFullYear(), start.getMonth() + 1, paydayDay);
  const end = new Date(nextStart);
  end.setDate(end.getDate() - 1);
  return { start, end };
}

export function shiftPayPeriod(period: PayPeriod, offset: number, paydayDay = PAYDAY_DAY): PayPeriod {
  const start = cycleStartInMonth(period.start.getFullYear(), period.start.getMonth() + offset, paydayDay);
  const nextStart = cycleStartInMonth(start.getFullYear(), start.getMonth() + 1, paydayDay);
  const end = new Date(nextStart);
  end.setDate(end.getDate() - 1);
  return { start, end };
}

export function buildHistoricalPeriodSummary({
  period,
  recurringExpenses,
  recurringIncomes,
  incomes,
  expenses,
}: {
  period: PayPeriod;
  recurringExpenses: RecurringModel[];
  recurringIncomes: RecurringModel[];
  incomes: TransactionModel[];
  expenses: TransactionModel[];
}): HistoricalPeriodSummary {
  const aggregation = aggregateFinancialRange({ range: period, incomes, expenses, recurringIncomes, recurringExpenses });
  return {
    period,
    plannedIncome: aggregation.plannedIncome,
    plannedExpenses: aggregation.plannedExpenses,
    plannedBalance: roundMoney(aggregation.plannedIncome - aggregation.plannedExpenses),
    actualIncome: aggregation.actualIncome,
    actualExpenses: aggregation.actualExpenses,
    actualBalance: roundMoney(aggregation.actualIncome - aggregation.actualExpenses),
    realizedTransactions: aggregation.realizedTransactions,
  };
}

export function collectPlannedOperations({
  recurringExpenses,
  recurringIncomes,
  incomes,
  expenses,
  range,
  allocationIncomes = incomes,
  allocationExpenses = expenses,
}: {
  recurringExpenses: RecurringModel[];
  recurringIncomes: RecurringModel[];
  incomes: TransactionModel[];
  expenses: TransactionModel[];
  range: PayPeriod;
  allocationIncomes?: TransactionModel[];
  allocationExpenses?: TransactionModel[];
}): DatedPlannedOperation[] {
  const allocations = planAllocationMap(allocationIncomes, allocationExpenses);
  const oneTime = (rows: TransactionModel[], kind: UpcomingOperation["kind"]): DatedPlannedOperation[] => rows.flatMap((row) => {
    const date = parseFinancialDate(row.addedAt);
    if (!isOutstandingStandalonePlan(row) || !date || !isDateInFinancialRange(date, range)) return [];
    const amount = roundMoney(Math.max(0, Number(row.amount || 0) - Math.max(Number(row.allocatedToPlan ?? 0), allocations.get(`${kind}:one_time:${row.id}:`) ?? 0)));
    if (amount <= 0) return [];
    return [{
      id: `${kind}-${row.id}`,
      kind,
      name: row.name,
      customTypeId: row.customTypeId,
      label: row.customTypeName?.trim() || (row.customTypeId === undefined ? row.category : "") || "Bez etykiety",
      amount,
      source: "one-time" as const,
      certainty: row.certainty,
      date,
    }];
  });
  const recurring = (rows: RecurringModel[], kind: UpcomingOperation["kind"]): DatedPlannedOperation[] => rows.flatMap((row) => recurringOccurrences(row, range).flatMap((date) => {
    const amount = roundMoney(Math.max(0, Number(row.kwota || 0) - (allocations.get(`${kind}:recurring:${row.id}:${localDateKey(date)}`) ?? 0)));
    return amount <= 0 ? [] : [{
      id: `${kind}-recurring-${row.id}-${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`,
      kind,
      name: row.nazwa,
      customTypeId: row.custom_type_id,
      label: row.custom_type_name?.trim() || (row.custom_type_id === undefined ? row.kategoria : "") || "Bez etykiety",
      amount,
      source: "recurring" as const,
      certainty: "guaranteed" as const,
      date,
    }];
  }));

  return [
    ...oneTime(incomes, "income"),
    ...oneTime(expenses, "expense"),
    ...recurring(recurringIncomes, "income"),
    ...recurring(recurringExpenses, "expense"),
  ];
}

export function buildUpcomingOperationDays({
  accounts,
  recurringExpenses,
  recurringIncomes,
  incomes,
  expenses,
  endDate,
  now = new Date(),
  dailyLivingBudget = 0,
  financialFloor = 0,
}: {
  accounts: Account[];
  recurringExpenses: RecurringModel[];
  recurringIncomes: RecurringModel[];
  incomes: TransactionModel[];
  expenses: TransactionModel[];
  endDate: Date;
  now?: Date;
  dailyLivingBudget?: number;
  financialFloor?: number;
}): UpcomingOperationDay[] {
  const today = localDateOnly(now);
  const rangeEnd = localDateOnly(endDate);
  if (rangeEnd < today) return [];
  const operations = collectPlannedOperations({ recurringExpenses, recurringIncomes, incomes, expenses, range: { start: today, end: rangeEnd } });
  const grouped = new Map<number, DatedPlannedOperation[]>();
  operations.forEach((operation) => {
    const key = operation.date.getTime();
    grouped.set(key, [...(grouped.get(key) ?? []), operation]);
  });

  let balance = accounts.reduce((sum, account) => sum + displayedActualBalance(account), 0);
  let reservedDays = 0;
  const dailyBudget = Math.max(0, Number(dailyLivingBudget) || 0);
  const floor = Math.max(0, Number(financialFloor) || 0);
  return [...grouped.entries()].sort(([left], [right]) => left - right).map(([dateTime, dayOperations]) => {
    const date = new Date(dateTime);
    const daysThroughDate = calendarDaysInclusive(today, date);
    const newlyReservedDays = Math.max(0, daysThroughDate - reservedDays);
    reservedDays = daysThroughDate;
    const income = dayOperations.filter((item) => item.kind === "income").reduce((sum, item) => sum + item.amount, 0);
    const dayExpenses = dayOperations.filter((item) => item.kind === "expense").reduce((sum, item) => sum + item.amount, 0);
    balance = roundMoney(balance - newlyReservedDays * dailyBudget + income - dayExpenses);
    return {
      date,
      operations: dayOperations.map(({ date: _date, ...operation }) => operation),
      income: roundMoney(income),
      expenses: roundMoney(dayExpenses),
      balanceAfterDay: balance,
      belowFinancialFloor: balance < floor,
    };
  });
}

export function buildPeriodSummary({
  accounts,
  recurringExpenses,
  recurringIncomes,
  incomes,
  expenses,
  now = new Date(),
  selectedDate,
  dailyLivingBudget = 0,
  financialFloor = 0,
  paydayCycleStartDay = PAYDAY_DAY,
}: {
  accounts: Account[];
  recurringExpenses: RecurringModel[];
  recurringIncomes: RecurringModel[];
  incomes: TransactionModel[];
  expenses: TransactionModel[];
  now?: Date;
  selectedDate?: Date;
  dailyLivingBudget?: number;
  financialFloor?: number;
  paydayCycleStartDay?: number;
}): PeriodSummaryValues {
  const today = localDateOnly(now);
  const period = getPayPeriod(today, paydayCycleStartDay);
  const requestedDate = localDateOnly(selectedDate ?? period.end);
  const effectiveDate = new Date(Math.min(period.end.getTime(), Math.max(today.getTime(), requestedDate.getTime())));
  const currentActual = accounts.reduce((sum, account) => sum + displayedActualBalance(account), 0);
  const currentAvailable = accounts.reduce((sum, account) => sum + Number(account.saldo_dostepne || 0), 0);
  const fullPeriod = aggregateFinancialRange({ range: period, incomes, expenses, recurringIncomes, recurringExpenses });
  const plannedOperations = collectPlannedOperations({ recurringExpenses, recurringIncomes, incomes, expenses, range: period });
  const totalOperations = (kind: UpcomingOperation["kind"], end = period.end, futureOnly = false) => plannedOperations.reduce((sum, operation) => (
    operation.kind === kind && operation.date <= end && (!futureOnly || operation.date >= today) ? sum + operation.amount : sum
  ), 0);
  const periodIncome = fullPeriod.plannedIncome;
  const periodExpenses = fullPeriod.plannedExpenses;
  const incomeUntilSelectedDate = totalOperations("income", effectiveDate, true);
  const expensesUntilSelectedDate = totalOperations("expense", effectiveDate, true);
  const actualAtSelectedDate = currentActual + incomeUntilSelectedDate - expensesUntilSelectedDate;
  const availableAtSelectedDate = currentAvailable + incomeUntilSelectedDate - expensesUntilSelectedDate;
  const daysToSelectedDate = calendarDaysInclusive(today, effectiveDate);
  const remainingDaysInPeriod = calendarDaysInclusive(today, period.end);
  const normalizedDailyLivingBudget = Math.max(0, Number(dailyLivingBudget) || 0);
  const dailyLivingReserve = roundMoney(normalizedDailyLivingBudget * remainingDaysInPeriod);
  const actualAfterLivingReserveAtSelectedDate = roundMoney(actualAtSelectedDate - dailyLivingReserve);
  const actualAfterLivingReserveDailyBudget = roundMoney(actualAfterLivingReserveAtSelectedDate / daysToSelectedDate);
  const plannedActualAtSelectedDate = roundMoney(actualAtSelectedDate - normalizedDailyLivingBudget * daysToSelectedDate);
  const incomeUntilPeriodEnd = totalOperations("income", period.end, true);
  const expensesUntilPeriodEnd = totalOperations("expense", period.end, true);
  const actualAtPeriodEnd = currentActual + incomeUntilPeriodEnd - expensesUntilPeriodEnd;
  const safeDailyBudget = roundMoney(Math.max(0, (actualAtPeriodEnd - Math.max(0, Number(financialFloor) || 0)) / remainingDaysInPeriod));
  return {
    period,
    selectedDate: effectiveDate,
    currentActual,
    currentAvailable,
    periodIncome,
    periodExpenses,
    incomeUntilSelectedDate,
    expensesUntilSelectedDate,
    actualAtSelectedDate,
    actualDailyBudget: actualAtSelectedDate / daysToSelectedDate,
    availableAtSelectedDate,
    availableDailyBudget: availableAtSelectedDate / daysToSelectedDate,
    daysToSelectedDate,
    remainingDaysInPeriod,
    dailyLivingBudget: normalizedDailyLivingBudget,
    dailyLivingReserve,
    actualAfterLivingReserveAtSelectedDate,
    actualAfterLivingReserveDailyBudget,
    plannedActualAtSelectedDate,
    safeDailyBudget,
  };
}

export function buildFinanceSummary({
  accounts,
  recurringExpenses,
  recurringIncomes,
  incomes,
  expenses,
  now = new Date(),
  paydayCycleStartDay = PAYDAY_DAY,
}: {
  accounts: Account[];
  recurringExpenses: RecurringModel[];
  recurringIncomes: RecurringModel[];
  incomes: TransactionModel[];
  expenses: TransactionModel[];
  now?: Date;
  paydayCycleStartDay?: number;
}): FinanceSummaryValues {
  const nextPayday = getNextPayday(now, paydayCycleStartDay);
  const daysUntilPayday = calendarDaysBetween(now, nextPayday);
  const actualFunds = accounts.reduce((sum, account) => sum + displayedActualBalance(account), 0);
  const availableWithCredit = accounts.reduce((sum, account) => sum + Number(account.saldo_dostepne || 0), 0);
  const recurringExpenseTotal = recurringExpenses.reduce((sum, expense) => sum + Number(expense.kwota || 0), 0);
  const recurringIncomeTotal = recurringIncomes.reduce((sum, income) => sum + Number(income.kwota || 0), 0);
  const additionalIncome = incomes.reduce((sum, income) => sum + outstandingStandalonePlanAmount(income), 0);
  const additionalExpenses = expenses.reduce((sum, expense) => sum + outstandingStandalonePlanAmount(expense), 0);

  return {
    actualFunds,
    recurringIncome: recurringIncomeTotal,
    recurringExpenses: recurringExpenseTotal,
    additionalIncome,
    additionalExpenses,
    availableWithCredit,
    dailyBudget: availableWithCredit / daysUntilPayday,
    daysUntilPayday,
    nextPayday,
  };
}
