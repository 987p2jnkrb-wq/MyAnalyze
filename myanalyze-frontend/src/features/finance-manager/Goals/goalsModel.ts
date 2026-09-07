import type { Account } from "../../../types/account";
import type { TransactionModel } from "../../../context/useTransactionResource";
import { isOutstandingStandalonePlan, outstandingStandalonePlanAmount } from "../transactionSemantics";
import type { RecurringModel } from "../../../context/useRecurringResource";
import { isCreditAccount, isVirtualWallet } from "../../../utils/accountModel";
import { isValidDateOnly, localDateKey, roundMoney, validateMoneyRange, validateNonNegativeMoney, validatePositiveMoney } from "../../../utils/validation";
import { assessDailyBudget, buildFinanceSummary, buildPeriodSummary, getPayPeriod, type FinanceSummaryValues } from "../financeSummary";

export const GOAL_TYPES = ["emergency_fund", "purchase", "travel", "car", "renovation", "down_payment", "debt_repayment", "custom"] as const;
export type GoalType = typeof GOAL_TYPES[number];
export type GoalPriority = "low" | "normal" | "high";
export type GoalStatus = "active" | "paused" | "completed";

export interface FinancialGoal {
  id: number;
  name: string;
  type: GoalType;
  targetAmount: number;
  allocatedAmount: number;
  dueDate: string | null;
  priority: GoalPriority;
  status: GoalStatus;
  accountId: number | null;
  includeAccountBalance: boolean;
  accountName: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export type FinancialGoalDraft = Omit<FinancialGoal, "id" | "accountName" | "createdAt" | "updatedAt">;

export interface GoalSettings {
  financialFloor: number;
  dailyLivingBudget: number;
  paydayCycleStartDay: number;
  thresholds: [number, number, number];
  allocations: [number, number, number];
}

export const DEFAULT_GOAL_SETTINGS: GoalSettings = {
  financialFloor: 1000,
  dailyLivingBudget: 0,
  paydayCycleStartDay: 10,
  thresholds: [1000, 3000, 5000],
  allocations: [100, 70, 50],
};

export interface LiquidityBreakdown {
  operational: number;
  virtualWallets: number;
  total: number;
}

export interface GoalProjection {
  liquidity: LiquidityBreakdown;
  minimumConservativeLiquidity: number;
  minimumExpectedLiquidityAfterReserve: number;
  conservativeEnd: number;
  expectedEnd: number;
  potentialEnd: number;
  periodIncome: number;
  periodExpenses: number;
  safeSurplus: number;
  dailyLivingReserve: number;
  safeDailyBudget: number;
  conservativeMonthlyCapacity: number;
}

export interface GoalMetric {
  progress: number;
  remaining: number;
  monthlyRequired: number | null;
  feasibility: "comfortable" | "demanding" | "difficult" | "unknown";
}

export interface BufferStatus {
  achievedCount: number;
  achievedThreshold: number | null;
  nextThreshold: number | null;
  missingToNext: number;
  complete: boolean;
}

export interface GoalDebt {
  id: number;
  name?: string;
  type: string;
  debt: number;
  installment: number;
  apr: number | null;
  interest: number | null;
}

export interface GoalRecommendation {
  id: string;
  priority: number;
  tone: "danger" | "warning" | "info" | "success";
  title: string;
  message: string;
  amount?: number;
}

export interface ProposedGoal {
  id: string;
  title: string;
  reason: string;
  draft: FinancialGoalDraft;
}

export function proposedGoalAlreadyExists(proposal: ProposedGoal, goals: FinancialGoal[]): boolean {
  const proposalName = proposal.draft.name.trim().toLocaleLowerCase("pl-PL");
  const proposalAmount = Math.round(Number(proposal.draft.targetAmount) * 100);
  return goals.some((goal) => goal.name.trim().toLocaleLowerCase("pl-PL") === proposalName
    && Math.round(Number(goal.targetAmount) * 100) === proposalAmount);
}

export interface AllocationLine {
  kind: "floor" | "living" | "buffer" | "goal" | "debt" | "mortgage" | "account" | "unassigned";
  label: string;
  amount: number;
  goalId?: number;
  debtId?: number;
  accountId?: number;
  strategyShare?: number;
  effectiveShare?: number;
  note?: string;
}

export type NewFundsStrategyKind = "debt" | "goal" | "account" | "buffer";

export interface NewFundsStrategyItem {
  id: string;
  kind: NewFundsStrategyKind;
  targetId: number | null;
  share: number;
}

export interface NewFundsStrategy {
  version: 1;
  items: NewFundsStrategyItem[];
}

export interface BufferAllocationRule {
  threshold: number | null;
  allocation: number;
  complete: boolean;
}

export interface DebtFinancingCost {
  rate: number;
  source: "RRSO" | "oprocentowanie" | "koszt";
}

function localDate(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, days: number): Date {
  const result = localDate(value);
  result.setDate(result.getDate() + days);
  return result;
}

function plannedIncome(rows: TransactionModel[], certainties: TransactionModel["certainty"][]): TransactionModel[] {
  return rows.filter((row) => isOutstandingStandalonePlan(row) && certainties.includes(row.certainty ?? "expected"));
}

export function normalizeFinancialGoal(value: Record<string, unknown>): FinancialGoal {
  return {
    id: Number(value.id),
    name: String(value.nazwa ?? value.name ?? ""),
    type: GOAL_TYPES.includes(value.typ as GoalType) ? value.typ as GoalType : "custom",
    targetAmount: Number(value.kwota_docelowa ?? value.targetAmount ?? 0),
    allocatedAmount: Number(value.kwota_przypisana ?? value.allocatedAmount ?? 0),
    dueDate: value.termin ? String(value.termin).slice(0, 10) : null,
    priority: (["low", "normal", "high"].includes(String(value.priorytet ?? value.priority)) ? String(value.priorytet ?? value.priority) : "normal") as GoalPriority,
    status: (["active", "paused", "completed"].includes(String(value.status)) ? String(value.status) : "active") as GoalStatus,
    accountId: value.account_id == null ? null : Number(value.account_id),
    includeAccountBalance: value.include_account_balance === true || Number(value.include_account_balance) === 1,
    accountName: value.account_name == null ? null : String(value.account_name),
    note: value.notatka == null ? null : String(value.notatka),
    createdAt: String(value.created_at ?? ""),
    updatedAt: String(value.updated_at ?? ""),
  };
}

export function normalizeGoalSettings(value: Record<string, unknown> | null | undefined): GoalSettings {
  if (!value) return DEFAULT_GOAL_SETTINGS;
  const settings: GoalSettings = {
    financialFloor: Number(value.financial_floor ?? DEFAULT_GOAL_SETTINGS.financialFloor),
    dailyLivingBudget: Number(value.daily_living_budget ?? DEFAULT_GOAL_SETTINGS.dailyLivingBudget),
    paydayCycleStartDay: Number(value.payday_cycle_start_day ?? DEFAULT_GOAL_SETTINGS.paydayCycleStartDay),
    thresholds: [Number(value.prog_1), Number(value.prog_2), Number(value.prog_3)],
    allocations: [Math.round(Number(value.alokacja_1)), Math.round(Number(value.alokacja_2)), Math.round(Number(value.alokacja_3))],
  };
  return Number.isFinite(settings.financialFloor)
    && Number.isFinite(settings.dailyLivingBudget)
    && Number.isInteger(settings.paydayCycleStartDay) && settings.paydayCycleStartDay >= 1 && settings.paydayCycleStartDay <= 31
    && settings.thresholds.every(Number.isFinite)
    && settings.allocations.every((value) => Number.isFinite(value) && Number.isInteger(value))
    ? settings
    : DEFAULT_GOAL_SETTINGS;
}

export function goalPayload(goal: FinancialGoalDraft) {
  return {
    name: goal.name.trim(), type: goal.type, targetAmount: goal.targetAmount, allocatedAmount: goal.allocatedAmount,
    dueDate: goal.dueDate || null, priority: goal.priority, status: goal.status,
    accountId: goal.accountId, includeAccountBalance: goal.accountId !== null && goal.includeAccountBalance, note: goal.note?.trim() || null,
  };
}

export function validateFinancialGoal(goal: FinancialGoalDraft | FinancialGoal): string | null {
  if (!goal.name.trim()) return "Podaj nazwę celu.";
  const targetError = validatePositiveMoney(goal.targetAmount, "Kwota docelowa");
  if (targetError) return targetError;
  const allocatedError = validateNonNegativeMoney(goal.allocatedAmount, "Kwota przypisana");
  if (allocatedError) return allocatedError;
  if (goal.allocatedAmount > goal.targetAmount) return "Kwota przypisana nie może przekraczać kwoty docelowej.";
  if (goal.dueDate && !isValidDateOnly(goal.dueDate)) return "Termin celu jest nieprawidłowy.";
  if (!GOAL_TYPES.includes(goal.type)) return "Typ celu ma nieprawidłową wartość.";
  if (!(["low", "normal", "high"] as const).includes(goal.priority)) return "Priorytet ma nieprawidłową wartość.";
  if (!(["active", "paused", "completed"] as const).includes(goal.status)) return "Status ma nieprawidłową wartość.";
  return null;
}

export function validateGoalSettings(settings: GoalSettings): string | null {
  const floorError = validateMoneyRange(settings.financialFloor, "Finansowa podłoga");
  if (floorError) return floorError;
  const dailyBudgetError = validateMoneyRange(settings.dailyLivingBudget, "Budżet bieżący / dzień");
  if (dailyBudgetError) return dailyBudgetError;
  if (!Number.isInteger(settings.paydayCycleStartDay) || settings.paydayCycleStartDay < 1 || settings.paydayCycleStartDay > 31) return "Dzień rozpoczęcia okresu musi mieścić się między 1 a 31.";
  for (let index = 0; index < settings.thresholds.length; index += 1) {
    const thresholdError = validateMoneyRange(settings.thresholds[index], `Próg ${index + 1}`, 0.01);
    if (thresholdError) return thresholdError;
  }
  if (settings.thresholds[0] < settings.financialFloor) return "Próg 1 nie może być niższy niż finansowa podłoga.";
  if (settings.thresholds[1] <= settings.thresholds[0]) return "Próg 2 musi być wyższy niż Próg 1.";
  if (settings.thresholds[2] <= settings.thresholds[1]) return "Próg 3 musi być wyższy niż Próg 2.";
  if (settings.allocations.some((value) => !Number.isInteger(value) || value < 0 || value > 100)) return "Alokacje muszą być pełnymi procentami między 0 a 100%.";
  return null;
}

export function goalSettingsPayload(settings: GoalSettings) {
  return {
    financialFloor: settings.financialFloor, dailyLivingBudget: settings.dailyLivingBudget, paydayCycleStartDay: settings.paydayCycleStartDay,
    threshold1: settings.thresholds[0], threshold2: settings.thresholds[1], threshold3: settings.thresholds[2],
    allocation1: Math.round(settings.allocations[0]), allocation2: Math.round(settings.allocations[1]), allocation3: Math.round(settings.allocations[2]),
  };
}

export function normalizeNewFundsStrategy(value: unknown): NewFundsStrategy | null {
  let parsed = value;
  if (typeof parsed === "string") {
    if (!parsed.trim()) return null;
    try { parsed = JSON.parse(parsed) as unknown; }
    catch { return null; }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const candidate = parsed as { version?: unknown; items?: unknown };
  if (!Array.isArray(candidate.items) || candidate.items.length === 0) return null;
  const allowedKinds: NewFundsStrategyKind[] = ["debt", "goal", "account", "buffer"];
  const items: NewFundsStrategyItem[] = [];
  for (const [index, raw] of candidate.items.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const row = raw as Record<string, unknown>;
    const kind = String(row.kind ?? "") as NewFundsStrategyKind;
    const share = Math.round(Number(row.share));
    const targetId: number | null = kind === "buffer" ? null : Number(row.targetId);
    if (!allowedKinds.includes(kind) || !Number.isInteger(share) || share <= 0 || share > 100) return null;
    if (kind !== "buffer") {
      if (targetId === null || !Number.isInteger(targetId) || targetId <= 0) return null;
    }
    items.push({ id: String(row.id ?? `${kind}-${targetId ?? "buffer"}-${index + 1}`), kind, targetId, share });
  }
  const normalizedTotal = items.reduce((sum, item) => sum + item.share, 0);
  if (normalizedTotal !== 100) {
    const difference = 100 - normalizedTotal;
    const last = items[items.length - 1];
    const adjusted = last.share + difference;
    if (!Number.isInteger(adjusted) || adjusted <= 0 || adjusted > 100) return null;
    items[items.length - 1] = { ...last, share: adjusted };
  }
  const uniqueTargets = new Set(items.map((item) => `${item.kind}:${item.targetId ?? "buffer"}`));
  if (uniqueTargets.size !== items.length) return null;
  return { version: 1, items };
}

export function newFundsStrategyPayload(strategy: NewFundsStrategy) {
  return { items: strategy.items.map((item) => ({ id: item.id, kind: item.kind, targetId: item.targetId, share: Math.round(item.share) })) };
}

export function buildLiquidityBreakdown(accounts: Account[]): LiquidityBreakdown {
  return accounts.reduce<LiquidityBreakdown>((result, account) => {
    if (isCreditAccount(account)) return result;
    const amount = Number(account.saldo_wlasciwe || 0);
    if (!Number.isFinite(amount)) return result;
    if (isVirtualWallet(account)) result.virtualWallets += amount;
    else result.operational += amount;
    result.total += amount;
    result.operational = roundMoney(result.operational);
    result.virtualWallets = roundMoney(result.virtualWallets);
    result.total = roundMoney(result.total);
    return result;
  }, { operational: 0, virtualWallets: 0, total: 0 });
}

export function applyGoalAccountBalances(goals: FinancialGoal[], accounts: Account[]): FinancialGoal[] {
  const balances = new Map(accounts.map((account) => [account.id, Math.max(0, Number(account.saldo_wlasciwe || 0))]));
  return goals.map((goal) => goal.includeAccountBalance && goal.accountId !== null && balances.has(goal.accountId)
    ? { ...goal, allocatedAmount: balances.get(goal.accountId) as number }
    : goal);
}

export function buildGoalProjection(input: {
  accounts: Account[];
  recurringExpenses: RecurringModel[];
  recurringIncomes: RecurringModel[];
  incomes: TransactionModel[];
  expenses: TransactionModel[];
  settings: GoalSettings;
  now?: Date;
}): GoalProjection {
  const now = localDate(input.now ?? new Date());
  const liquidAccounts = input.accounts.filter((account) => !isCreditAccount(account));
  const period = getPayPeriod(now, input.settings.paydayCycleStartDay);
  const guaranteedIncomes = plannedIncome(input.incomes, ["guaranteed"]);
  const expectedIncomes = plannedIncome(input.incomes, ["expected"]);
  const potentialIncomes = plannedIncome(input.incomes, ["potential"]);
  // Zrealizowane importy nie są ponownie liczone jako wpływy. Przenoszą jednak
  // informację, jaka część planu została już wykonana i ma zniknąć z prognozy.
  const matchedActualIncomes = input.incomes.filter((income) => (income.planMatches ?? []).length > 0);
  const summaryFor = (selectedDate: Date, incomes: TransactionModel[]) => buildPeriodSummary({
    accounts: liquidAccounts, recurringExpenses: input.recurringExpenses, recurringIncomes: input.recurringIncomes,
    incomes: [...incomes, ...matchedActualIncomes], expenses: input.expenses, now, selectedDate, dailyLivingBudget: input.settings.dailyLivingBudget, financialFloor: input.settings.financialFloor, paydayCycleStartDay: input.settings.paydayCycleStartDay,
  });
  let minimum = buildLiquidityBreakdown(liquidAccounts).total;
  let minimumExpectedAfterReserve = minimum;
  for (let cursor = now; cursor <= period.end; cursor = addDays(cursor, 1)) {
    minimum = Math.min(minimum, summaryFor(cursor, guaranteedIncomes).plannedActualAtSelectedDate);
    minimumExpectedAfterReserve = Math.min(minimumExpectedAfterReserve, summaryFor(cursor, [...guaranteedIncomes, ...expectedIncomes]).actualAfterLivingReserveAtSelectedDate);
  }
  const conservative = summaryFor(period.end, guaranteedIncomes);
  const expected = summaryFor(period.end, [...guaranteedIncomes, ...expectedIncomes]);
  const potential = summaryFor(period.end, [...guaranteedIncomes, ...expectedIncomes, ...potentialIncomes]);
  return {
    liquidity: buildLiquidityBreakdown(liquidAccounts),
    minimumConservativeLiquidity: roundMoney(minimum),
    minimumExpectedLiquidityAfterReserve: roundMoney(minimumExpectedAfterReserve),
    conservativeEnd: roundMoney(conservative.plannedActualAtSelectedDate),
    expectedEnd: roundMoney(expected.plannedActualAtSelectedDate),
    potentialEnd: roundMoney(potential.plannedActualAtSelectedDate),
    periodIncome: roundMoney(expected.periodIncome),
    periodExpenses: roundMoney(expected.periodExpenses),
    safeSurplus: roundMoney(Math.max(0, minimum - input.settings.financialFloor)),
    dailyLivingReserve: conservative.dailyLivingReserve,
    safeDailyBudget: conservative.safeDailyBudget,
    conservativeMonthlyCapacity: roundMoney(Math.max(0, conservative.periodIncome - conservative.periodExpenses - conservative.dailyLivingReserve)),
  };
}

export function buildGoalMetric(goal: FinancialGoal, monthlyCapacity: number, now = new Date()): GoalMetric {
  const remaining = roundMoney(Math.max(0, goal.targetAmount - goal.allocatedAmount));
  const progress = goal.targetAmount > 0 ? Math.min(100, roundMoney(goal.allocatedAmount / goal.targetAmount * 100)) : 0;
  if (remaining === 0) return { progress, remaining, monthlyRequired: 0, feasibility: "comfortable" };
  if (!goal.dueDate) return { progress, remaining, monthlyRequired: null, feasibility: "unknown" };
  const due = new Date(`${goal.dueDate}T12:00:00`);
  if (Number.isNaN(due.getTime())) return { progress, remaining, monthlyRequired: null, feasibility: "unknown" };
  const days = Math.max(1, Math.ceil((localDate(due).getTime() - localDate(now).getTime()) / 86_400_000));
  const months = Math.max(1, days / 30.4375);
  const monthlyRequired = roundMoney(remaining / months);
  const feasibility = monthlyCapacity <= 0 ? "difficult" : monthlyRequired <= monthlyCapacity * 0.5 ? "comfortable" : monthlyRequired <= monthlyCapacity ? "demanding" : "difficult";
  return { progress, remaining, monthlyRequired, feasibility };
}

export function buildBufferStatus(liquidity: number, settings: GoalSettings): BufferStatus {
  const achievedCount = settings.thresholds.filter((threshold) => liquidity >= threshold).length;
  const achievedThreshold = achievedCount > 0 ? settings.thresholds[achievedCount - 1] : null;
  const nextThreshold = settings.thresholds[achievedCount] ?? null;
  return {
    achievedCount,
    achievedThreshold,
    nextThreshold,
    missingToNext: nextThreshold === null ? 0 : roundMoney(Math.max(0, nextThreshold - liquidity)),
    complete: achievedCount === settings.thresholds.length,
  };
}

export function buildGoalRecommendations(input: {
  projection: GoalProjection;
  settings: GoalSettings;
  goals: FinancialGoal[];
  debts: GoalDebt[];
  now?: Date;
}): GoalRecommendation[] {
  const recommendations: GoalRecommendation[] = [];
  const liquidity = input.projection.liquidity.total;
  const forecastGap = roundMoney(Math.max(0, -input.projection.minimumExpectedLiquidityAfterReserve));
  const periodDeficit = roundMoney(Math.max(0, input.projection.periodExpenses - input.projection.periodIncome));
  if (forecastGap > 0) {
    const deficitMessage = periodDeficit > 0 ? " Wydatki okresu również przewyższają wpływy." : "";
    return [{
      id: "cashflow-negative",
      priority: 200,
      tone: "danger",
      title: "Najpierw zabezpiecz płynność",
      message: `Prognoza rzeczywistych środków po rezerwie na codzienne wydatki spada poniżej zera.${deficitMessage} Sprawdź, które wydatki można zmniejszyć lub przełożyć, albo uzupełnij środki. Prognozowany brak:`,
      amount: forecastGap,
    }];
  }
  if (liquidity < input.settings.financialFloor) {
    recommendations.push({ id: "floor", priority: 120, tone: "danger", title: "Odbuduj finansową podłogę", message: "Do ustawionego poziomu bezpieczeństwa brakuje jeszcze środków.", amount: roundMoney(input.settings.financialFloor - liquidity) });
  }
  if (periodDeficit > 0) {
    recommendations.push({ id: "period-deficit", priority: 110, tone: "warning", title: "Bilans okresu wymaga uwagi", message: "Planowane wydatki przewyższają wpływy. Sprawdź wydatki przed przeznaczaniem środków na nowe cele. Różnica:", amount: periodDeficit });
  }
  const dailyBudgetAssessment = assessDailyBudget(input.projection.safeDailyBudget, input.settings.dailyLivingBudget);
  if (dailyBudgetAssessment.status === "insufficient") {
    recommendations.push({ id: "daily-budget-insufficient", priority: 115, tone: "danger", title: "Budżet bieżący zagrożony", message: "Obecna prognoza nie zapewnia ustawionego budżetu dziennego. W pierwszej kolejności zabezpiecz bieżącą płynność." });
  } else if (dailyBudgetAssessment.status === "tight") {
    recommendations.push({ id: "daily-budget-tight", priority: 75, tone: "warning", title: "Mały margines bieżący", message: "Budżet dzienny jest zabezpieczony, ale bez większego zapasu. Ostrożnie z przeznaczaniem środków na nowe cele." });
  }
  if (liquidity >= input.settings.financialFloor) {
    const candidates = input.debts
      .filter((debt) => debt.debt > 0 && !debt.type.toLocaleLowerCase("pl-PL").includes("hipotec") && Math.max(debt.apr ?? 0, debt.interest ?? 0) > 0)
      .sort((left, right) => Math.max(right.apr ?? 0, right.interest ?? 0) - Math.max(left.apr ?? 0, left.interest ?? 0));
    const first = candidates[0];
    const firstRate = first ? Math.max(first.apr ?? 0, first.interest ?? 0) : 0;
    const secondRate = candidates[1] ? Math.max(candidates[1].apr ?? 0, candidates[1].interest ?? 0) : 0;
    if (first && (firstRate >= 10 || firstRate - secondRate >= 5)) recommendations.push({ id: `debt-${first.id}`, priority: 90, tone: "warning", title: "Sprawdź koszt zobowiązania", message: `Najwyższa znana stopa kosztu krótkoterminowego zobowiązania wynosi ${firstRate.toFixed(2)}%. Rekomendacja nie uwzględnia automatycznej nadpłaty.` });
  }
  const goalNeedingAttention = periodDeficit > 0 ? undefined : input.goals
    .filter((goal) => goal.status === "active")
    .map((goal) => ({ goal, metric: buildGoalMetric(goal, input.projection.conservativeMonthlyCapacity, input.now) }))
    .filter(({ metric }) => metric.feasibility === "difficult" || metric.feasibility === "demanding")
    .sort((left, right) => {
      const feasibilityOrder = { difficult: 0, demanding: 1, comfortable: 2, unknown: 3 } as const;
      return feasibilityOrder[left.metric.feasibility] - feasibilityOrder[right.metric.feasibility]
        || (left.goal.dueDate ?? "9999").localeCompare(right.goal.dueDate ?? "9999");
    })[0];
  if (goalNeedingAttention) {
    const difficult = goalNeedingAttention.metric.feasibility === "difficult";
    recommendations.push({
      id: `goal-${goalNeedingAttention.goal.id}`,
      priority: difficult ? 80 : 70,
      tone: difficult ? "warning" : "info",
      title: difficult ? `Sprawdź tempo celu „${goalNeedingAttention.goal.name}”` : `Pilnuj tempa celu „${goalNeedingAttention.goal.name}”`,
      message: difficult
        ? "Wymagane tempo przekracza obecną konserwatywną nadwyżkę miesięczną. Termin lub kwotę można skorygować ręcznie."
        : "Cel jest wykonalny, ale wymaga przeznaczania na niego znacznej części obecnej nadwyżki miesięcznej.",
    });
  }
  return recommendations.sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id)).slice(0, 3);
}

export function buildProposedGoals(expenses: TransactionModel[], realLiquidity: number, safeSurplus: number, now = new Date()): ProposedGoal[] {
  const today = localDateKey(localDate(now));
  const horizon = localDateKey(addDays(now, 60));
  const minimumLargeAmount = Math.max(500, realLiquidity * 0.25, safeSurplus);
  return expenses
    // Customized occurrences remain plans, but recurring bills are not goal suggestions.
    .filter((expense) => !expense.generatedFromRecurring)
    .filter((expense) => isOutstandingStandalonePlan(expense) && expense.addedAt.slice(0, 10) >= today && expense.addedAt.slice(0, 10) <= horizon && outstandingStandalonePlanAmount(expense) >= minimumLargeAmount)
    .sort((left, right) => left.addedAt.localeCompare(right.addedAt) || outstandingStandalonePlanAmount(right) - outstandingStandalonePlanAmount(left))
    .slice(0, 3)
    .map((expense) => ({
      id: `expense-${expense.id}`,
      title: expense.name,
      reason: "Duży zaplanowany wydatek w ciągu najbliższych 60 dni.",
      draft: { name: expense.name, type: "purchase", targetAmount: outstandingStandalonePlanAmount(expense), allocatedAmount: 0, dueDate: expense.addedAt.slice(0, 10), priority: "high", status: "active", accountId: null, includeAccountBalance: false, note: `Cel zaproponowany na podstawie zaplanowanego wydatku${expense.customTypeName ? ` z etykietą ${expense.customTypeName}` : " bez etykiety"}.` },
    }));
}

export function getDebtFinancingCost(debt: GoalDebt): DebtFinancingCost | null {
  if (debt.apr !== null && Number.isFinite(debt.apr) && debt.apr >= 0) return { rate: debt.apr, source: "RRSO" };
  if (debt.interest !== null && Number.isFinite(debt.interest) && debt.interest >= 0) return { rate: debt.interest, source: "oprocentowanie" };
  if (["dług", "dlug", "raty"].includes(debt.type.trim().toLocaleLowerCase("pl-PL"))) return { rate: 0, source: "koszt" };
  return null;
}

function isMortgageDebt(debt: GoalDebt): boolean {
  return debt.type.toLocaleLowerCase("pl-PL").includes("hipotec");
}

function isCreditCardDebt(debt: GoalDebt): boolean {
  return debt.type.toLocaleLowerCase("pl-PL").includes("karta kredytowa");
}

export function getBufferAllocationRule(realLiquidity: number, settings: GoalSettings): BufferAllocationRule {
  const liquidity = roundMoney(Math.max(0, realLiquidity));
  for (let index = 0; index < settings.thresholds.length; index += 1) {
    if (liquidity < settings.thresholds[index]) {
      return { threshold: settings.thresholds[index], allocation: settings.allocations[index], complete: false };
    }
  }
  return { threshold: null, allocation: 0, complete: true };
}

function prioritizedGoals(goals: FinancialGoal[]): FinancialGoal[] {
  const priorityOrder: Record<GoalPriority, number> = { high: 0, normal: 1, low: 2 };
  return goals
    .filter((goal) => goal.status === "active" && goal.allocatedAmount < goal.targetAmount)
    .sort((left, right) => priorityOrder[left.priority] - priorityOrder[right.priority] || (left.dueDate ?? "9999").localeCompare(right.dueDate ?? "9999") || left.id - right.id);
}

function prioritizedDebts(debts: GoalDebt[]): GoalDebt[] {
  return debts
    .filter((debt) => debt.debt > 0)
    .sort((left, right) => {
      const leftCost = getDebtFinancingCost(left)?.rate ?? -1;
      const rightCost = getDebtFinancingCost(right)?.rate ?? -1;
      const leftCard = isCreditCardDebt(left) ? 1 : 0;
      const rightCard = isCreditCardDebt(right) ? 1 : 0;
      const leftMortgage = isMortgageDebt(left) ? 1 : 0;
      const rightMortgage = isMortgageDebt(right) ? 1 : 0;
      return leftMortgage - rightMortgage || rightCard - leftCard || rightCost - leftCost || left.id - right.id;
    });
}

export function buildSuggestedNewFundsStrategy(
  realLiquidity: number,
  settings: GoalSettings,
  goals: FinancialGoal[],
  debts: GoalDebt[],
  accounts: Account[],
): NewFundsStrategy {
  const items: NewFundsStrategyItem[] = [];
  const debtsSorted = prioritizedDebts(debts);
  const goalsSorted = prioritizedGoals(goals);
  const savingsAccounts = accounts.filter((account) => account.active !== false && !isCreditAccount(account));
  const bufferRule = getBufferAllocationRule(realLiquidity, settings);
  const linkedEmergencyAccountId = goalsSorted.find((goal) => goal.type === "emergency_fund" && goal.accountId != null)?.accountId ?? null;
  const fallbackAccount = savingsAccounts.find((account) => account.id === linkedEmergencyAccountId) ?? savingsAccounts[0] ?? null;

  if (debtsSorted[0]) items.push({ id: `debt-${debtsSorted[0].id}`, kind: "debt", targetId: debtsSorted[0].id, share: 50 });
  if (!bufferRule.complete) items.push({ id: "buffer", kind: "buffer", targetId: null, share: items.length ? 30 : 60 });
  if (goalsSorted[0]) items.push({ id: `goal-${goalsSorted[0].id}`, kind: "goal", targetId: goalsSorted[0].id, share: items.length ? 20 : 60 });
  else if (fallbackAccount) items.push({ id: `account-${fallbackAccount.id}`, kind: "account", targetId: fallbackAccount.id, share: items.length ? 20 : 60 });

  if (!items.length && fallbackAccount) items.push({ id: `account-${fallbackAccount.id}`, kind: "account", targetId: fallbackAccount.id, share: 100 });
  if (!items.length) return { version: 1, items: [] };
  const currentTotal = items.reduce((sum, item) => sum + item.share, 0);
  if (currentTotal !== 100) items[items.length - 1] = { ...items[items.length - 1], share: Math.round(items[items.length - 1].share + (100 - currentTotal)) };
  return { version: 1, items };
}

export function validateNewFundsStrategy(strategy: NewFundsStrategy, goals: FinancialGoal[], debts: GoalDebt[], accounts: Account[]): string | null {
  if (!strategy.items.length) return "Dodaj co najmniej jedną pozycję strategii.";
  const total = strategy.items.reduce((sum, item) => sum + Number(item.share || 0), 0);
  if (total !== 100) return `Suma udziałów musi wynosić 100% (obecnie ${Math.round(total)}%).`;
  const seen = new Set<string>();
  for (const item of strategy.items) {
    if (!Number.isInteger(item.share) || item.share <= 0 || item.share > 100) return "Każdy udział musi być pełnym procentem większym od 0% i nie większym niż 100%.";
    const key = `${item.kind}:${item.targetId ?? "buffer"}`;
    if (seen.has(key)) return "Ta sama pozycja nie może występować w strategii więcej niż raz.";
    seen.add(key);
    if (item.kind === "buffer") continue;
    if (!Number.isInteger(item.targetId) || Number(item.targetId) <= 0) return "Wybierz cel dla każdej pozycji strategii.";
    if (item.kind === "goal" && !goals.some((goal) => goal.id === item.targetId && goal.status === "active" && goal.allocatedAmount < goal.targetAmount)) return "Jeden z wybranych celów nie jest już aktywny.";
    if (item.kind === "debt" && !debts.some((debt) => debt.id === item.targetId && debt.debt > 0)) return "Jedno z wybranych zobowiązań nie jest już aktywne.";
    if (item.kind === "account" && !accounts.some((account) => account.id === item.targetId && account.active !== false && !isCreditAccount(account))) return "Jeden z wybranych depozytów nie jest już dostępny.";
  }
  return null;
}

export function allocateNewFundsWithStrategy(
  amount: number,
  realLiquidity: number,
  settings: GoalSettings,
  goals: FinancialGoal[],
  debts: GoalDebt[],
  accounts: Account[],
  strategy: NewFundsStrategy,
  dailyLivingReserve = 0,
): AllocationLine[] {
  let remaining = roundMoney(Math.max(0, amount));
  let liquidity = roundMoney(realLiquidity);
  const result: AllocationLine[] = [];
  const add = (line: AllocationLine) => { if (line.amount > 0) result.push({ ...line, amount: roundMoney(line.amount) }); };
  const floorGap = Math.max(0, roundMoney(settings.financialFloor - liquidity));
  const floorAmount = Math.min(remaining, floorGap);
  add({ kind: "floor", label: "Uzupełnienie finansowej podłogi", amount: floorAmount, effectiveShare: amount > 0 ? roundMoney(floorAmount / amount * 100) : 0, note: "Najpierw kalkulator zabezpiecza finansową podłogę." });
  remaining = roundMoney(remaining - floorAmount); liquidity = roundMoney(liquidity + floorAmount);
  const livingReserveGap = Math.max(0, roundMoney(settings.financialFloor + Math.max(0, dailyLivingReserve) - liquidity));
  const livingReserveAmount = Math.min(remaining, livingReserveGap);
  add({ kind: "living", label: "Rezerwa na codzienne wydatki do kolejnej wypłaty", amount: livingReserveAmount, effectiveShare: amount > 0 ? roundMoney(livingReserveAmount / amount * 100) : 0, note: "Ta część jest liczona przed strategią procentową." });
  remaining = roundMoney(remaining - livingReserveAmount); liquidity = roundMoney(liquidity + livingReserveAmount);
  if (remaining <= 0) return result;

  const strategyBase = remaining;
  let bucketRemaining = strategyBase;
  let unassigned = 0;
  strategy.items.forEach((item, index) => {
    const bucketAmount = index === strategy.items.length - 1
      ? bucketRemaining
      : Math.min(bucketRemaining, roundMoney(strategyBase * item.share / 100));
    bucketRemaining = roundMoney(bucketRemaining - bucketAmount);
    if (bucketAmount <= 0) return;
    if (item.kind === "buffer") {
      const rule = getBufferAllocationRule(liquidity, settings);
      if (rule.complete || rule.threshold === null || rule.allocation <= 0) {
        unassigned = roundMoney(unassigned + bucketAmount);
        return;
      }
      const desired = roundMoney(bucketAmount * rule.allocation / 100);
      const bufferAmount = Math.min(desired, Math.max(0, roundMoney(rule.threshold - liquidity)));
      const effectiveShare = amount > 0 ? roundMoney(bufferAmount / amount * 100) : 0;
      add({ kind: "buffer", label: `Poduszka do progu ${rule.threshold.toFixed(2)}`, amount: bufferAmount, strategyShare: item.share, effectiveShare, note: `${Math.round(item.share)}% strategii × ${Math.round(rule.allocation)}% alokacji aktywnego progu.` });
      liquidity = roundMoney(liquidity + bufferAmount);
      unassigned = roundMoney(unassigned + bucketAmount - bufferAmount);
      return;
    }
    if (item.kind === "debt") {
      const debt = debts.find((candidate) => candidate.id === item.targetId && candidate.debt > 0);
      if (!debt) { unassigned = roundMoney(unassigned + bucketAmount); return; }
      const allocated = Math.min(bucketAmount, roundMoney(debt.debt));
      add({ kind: "debt", label: debt.name?.trim() || debt.type, amount: allocated, debtId: debt.id, strategyShare: item.share, effectiveShare: amount > 0 ? roundMoney(allocated / amount * 100) : 0 });
      unassigned = roundMoney(unassigned + bucketAmount - allocated);
      return;
    }
    if (item.kind === "goal") {
      const goal = goals.find((candidate) => candidate.id === item.targetId && candidate.status === "active" && candidate.allocatedAmount < candidate.targetAmount);
      if (!goal) { unassigned = roundMoney(unassigned + bucketAmount); return; }
      const allocated = Math.min(bucketAmount, roundMoney(goal.targetAmount - goal.allocatedAmount));
      add({ kind: "goal", label: goal.name, amount: allocated, goalId: goal.id, strategyShare: item.share, effectiveShare: amount > 0 ? roundMoney(allocated / amount * 100) : 0 });
      unassigned = roundMoney(unassigned + bucketAmount - allocated);
      return;
    }
    const account = accounts.find((candidate) => candidate.id === item.targetId && candidate.active !== false && !isCreditAccount(candidate));
    if (!account) { unassigned = roundMoney(unassigned + bucketAmount); return; }
    add({ kind: "account", label: `Depozyt: ${account.nazwa}`, amount: bucketAmount, accountId: account.id, strategyShare: item.share, effectiveShare: amount > 0 ? roundMoney(bucketAmount / amount * 100) : 0 });
  });
  unassigned = roundMoney(unassigned + bucketRemaining);
  add({ kind: "unassigned", label: "Pozostaje do decyzji", amount: unassigned, effectiveShare: amount > 0 ? roundMoney(unassigned / amount * 100) : 0, note: "Np. niewykorzystana część alokacji poduszki albo nadwyżka ponad cel/zadłużenie." });
  return result;
}

export function allocateNewFunds(amount: number, realLiquidity: number, settings: GoalSettings, goals: FinancialGoal[], debts: GoalDebt[] = [], dailyLivingReserve = 0): AllocationLine[] {
  let remaining = roundMoney(Math.max(0, amount));
  let liquidity = roundMoney(realLiquidity);
  const result: AllocationLine[] = [];
  const add = (line: AllocationLine) => { if (line.amount > 0) result.push({ ...line, amount: roundMoney(line.amount) }); };
  const floorGap = Math.max(0, roundMoney(settings.financialFloor - liquidity));
  const floorAmount = Math.min(remaining, floorGap);
  add({ kind: "floor", label: "Uzupełnienie finansowej podłogi", amount: floorAmount });
  remaining = roundMoney(remaining - floorAmount); liquidity = roundMoney(liquidity + floorAmount);
  const livingReserveGap = Math.max(0, roundMoney(settings.financialFloor + Math.max(0, dailyLivingReserve) - liquidity));
  const livingReserveAmount = Math.min(remaining, livingReserveGap);
  add({ kind: "living", label: "Rezerwa na codzienne wydatki do kolejnej wypłaty", amount: livingReserveAmount });
  remaining = roundMoney(remaining - livingReserveAmount); liquidity = roundMoney(liquidity + livingReserveAmount);
  for (let index = 0; index < settings.thresholds.length && remaining > 0; index += 1) {
    const threshold = settings.thresholds[index];
    if (liquidity >= threshold) continue;
    const bufferAmount = Math.min(threshold - liquidity, roundMoney(remaining * settings.allocations[index] / 100));
    add({ kind: "buffer", label: `Poduszka do progu ${threshold.toFixed(2)}`, amount: bufferAmount });
    remaining = roundMoney(remaining - bufferAmount); liquidity = roundMoney(liquidity + bufferAmount);
    if (liquidity < threshold) break;
  }
  const priorityOrder: Record<GoalPriority, number> = { high: 0, normal: 1, low: 2 };
  const activeGoals = goals
    .filter((goal) => goal.status === "active" && goal.allocatedAmount < goal.targetAmount)
    .sort((left, right) => priorityOrder[left.priority] - priorityOrder[right.priority] || (left.dueDate ?? "9999").localeCompare(right.dueDate ?? "9999") || left.id - right.id);
  const urgentGoals = activeGoals.filter((goal) => goal.priority === "high" && goal.dueDate);
  const remainingGoals = activeGoals.filter((goal) => !urgentGoals.includes(goal));
  const allocateGoals = (items: FinancialGoal[]) => items.forEach((goal) => {
    if (remaining <= 0) return;
    const goalAmount = Math.min(remaining, roundMoney(goal.targetAmount - goal.allocatedAmount));
    add({ kind: "goal", label: goal.name, amount: goalAmount, goalId: goal.id });
    remaining = roundMoney(remaining - goalAmount);
  });
  const knownDebts = debts
    .map((debt) => ({ debt, cost: getDebtFinancingCost(debt) }))
    .filter((item): item is { debt: GoalDebt; cost: DebtFinancingCost } => item.debt.debt > 0 && item.cost !== null);
  const expensiveDebts = knownDebts
    .filter(({ debt, cost }) => !isMortgageDebt(debt) && cost.rate > 0 && (cost.rate >= 10 || isCreditCardDebt(debt)))
    .sort((left, right) => right.cost.rate - left.cost.rate || left.debt.id - right.debt.id);
  const otherInterestDebts = knownDebts
    .filter(({ debt, cost }) => !isMortgageDebt(debt) && cost.rate > 0 && cost.rate < 10 && !isCreditCardDebt(debt))
    .sort((left, right) => right.cost.rate - left.cost.rate || left.debt.id - right.debt.id);
  const zeroPercentDebts = knownDebts
    .filter(({ debt, cost }) => !isMortgageDebt(debt) && cost.rate === 0)
    .sort((left, right) => right.debt.debt - left.debt.debt || left.debt.id - right.debt.id);
  const mortgages = knownDebts
    .filter(({ debt }) => isMortgageDebt(debt))
    .sort((left, right) => right.cost.rate - left.cost.rate || left.debt.id - right.debt.id);
  const unknownConsumerDebts = debts
    .filter((debt) => debt.debt > 0 && !isMortgageDebt(debt) && getDebtFinancingCost(debt) === null)
    .sort((left, right) => left.id - right.id);
  const unknownMortgages = debts
    .filter((debt) => debt.debt > 0 && isMortgageDebt(debt) && getDebtFinancingCost(debt) === null)
    .sort((left, right) => left.id - right.id);
  const allocateDebts = (items: typeof knownDebts, optional = false) => items.forEach(({ debt, cost }) => {
    if (remaining <= 0) return;
    const debtAmount = Math.min(remaining, roundMoney(debt.debt));
    const name = debt.name?.trim() || debt.type;
    const rate = `${cost.source} ${cost.rate.toFixed(2)}%`;
    add({ kind: optional ? "mortgage" : "debt", label: optional ? `Opcjonalna nadpłata: ${name} · ${rate}` : `${name} · ${rate}`, amount: debtAmount, debtId: debt.id });
    remaining = roundMoney(remaining - debtAmount);
  });
  const allocateUnknownDebts = (items: GoalDebt[], optional = false) => items.forEach((debt) => {
    if (remaining <= 0) return;
    const debtAmount = Math.min(remaining, roundMoney(debt.debt));
    const name = debt.name?.trim() || debt.type;
    add({ kind: optional ? "mortgage" : "debt", label: optional ? `Opcjonalna nadpłata: ${name} · brak danych o koszcie` : `${name} · brak danych o koszcie finansowania`, amount: debtAmount, debtId: debt.id });
    remaining = roundMoney(remaining - debtAmount);
  });
  allocateGoals(urgentGoals);
  allocateDebts(expensiveDebts);
  allocateDebts(otherInterestDebts);
  allocateGoals(remainingGoals);
  allocateDebts(zeroPercentDebts);
  allocateUnknownDebts(unknownConsumerDebts);
  allocateDebts(mortgages, true);
  allocateUnknownDebts(unknownMortgages, true);
  add({ kind: "unassigned", label: "Pozostaje do decyzji", amount: remaining });
  return result;
}

function sumByLabel(rows: Array<{ category?: string; customTypeId?: number | null; customTypeName?: string | null; amount: number }>): string[] {
  const totals = new Map<string, number>();
  rows.forEach((row) => {
    const label = row.customTypeName?.trim() || (row.customTypeId === undefined && row.category?.trim() ? row.category.trim() : "Bez etykiety");
    totals.set(label, roundMoney((totals.get(label) ?? 0) + Number(row.amount || 0)));
  });
  return Array.from(totals, ([label, amount]) => `- ${label}: ${amount.toFixed(2)}`).sort();
}

export function buildGoalsAiPrompt(input: {
  currency: string;
  accounts: Account[];
  incomes: TransactionModel[];
  expenses: TransactionModel[];
  recurringIncomes: RecurringModel[];
  recurringExpenses: RecurringModel[];
  debts: GoalDebt[];
  goals: FinancialGoal[];
  settings: GoalSettings;
  projection: GoalProjection;
  summary?: FinanceSummaryValues;
}): string {
  const summary = input.summary ?? buildFinanceSummary({ accounts: input.accounts, incomes: input.incomes, expenses: input.expenses, recurringIncomes: input.recurringIncomes, recurringExpenses: input.recurringExpenses });
  const accountTotals = new Map<string, { actual: number; available: number }>();
  input.accounts.forEach((account) => {
    const key = isCreditAccount(account) ? "karta kredytowa" : isVirtualWallet(account) ? "wirtualny portfel" : "konto/gotówka";
    const current = accountTotals.get(key) ?? { actual: 0, available: 0 };
    current.actual = roundMoney(current.actual + Number(account.saldo_wlasciwe || 0));
    current.available = roundMoney(current.available + Number(account.saldo_dostepne || 0));
    accountTotals.set(key, current);
  });
  const plannedIncomes = input.incomes
    .filter(isOutstandingStandalonePlan)
    .map((row) => ({ ...row, amount: outstandingStandalonePlanAmount(row) }))
    .filter((row) => row.amount > 0);
  const plannedExpenses = input.expenses
    .filter(isOutstandingStandalonePlan)
    .map((row) => ({ ...row, amount: outstandingStandalonePlanAmount(row) }))
    .filter((row) => row.amount > 0);
  const lines = [
    "Przeanalizuj poniższy anonimowy snapshot finansów osobistych i pomóż ustalić priorytety.",
    "Nie zakładaj, że dostępny limit karty jest majątkiem. Nie proponuj automatycznych operacji ani produktów finansowych bez wyjaśnienia ryzyka.",
    "Wskaż 3–5 najważniejszych obserwacji, ryzyka, kompromisy między poduszką, długiem i celami oraz pytania, które warto sobie zadać. Używaj spokojnego, niemoralizującego języka.",
    "",
    `Waluta: ${input.currency}`,
    `Realna płynność: ${input.projection.liquidity.total.toFixed(2)} (operacyjna ${input.projection.liquidity.operational.toFixed(2)}, wirtualne portfele ${input.projection.liquidity.virtualWallets.toFixed(2)})`,
    `Finansowa podłoga: ${input.settings.financialFloor.toFixed(2)}`,
    `Budżet bieżący / dzień: ${input.settings.dailyLivingBudget.toFixed(2)}`,
    `Rezerwa na codzienne wydatki do kolejnej wypłaty: ${input.projection.dailyLivingReserve.toFixed(2)}`,
    `Bezpiecznie dostępne / dzień: ${input.projection.safeDailyBudget.toFixed(2)}`,
    `Bezpieczna nadwyżka: ${input.projection.safeSurplus.toFixed(2)}`,
    `Prognoza konserwatywna na koniec okresu: ${input.projection.conservativeEnd.toFixed(2)}`,
    `Prognoza z wpływami oczekiwanymi: ${input.projection.expectedEnd.toFixed(2)}`,
    `Prognoza z wpływami potencjalnymi: ${input.projection.potentialEnd.toFixed(2)}`,
    `Stałe wpływy / miesiąc: ${summary.recurringIncome.toFixed(2)}`,
    `Stałe wydatki / miesiąc: ${summary.recurringExpenses.toFixed(2)}`,
    `Środki dostępne wraz z kartami: ${summary.availableWithCredit.toFixed(2)} (wartość informacyjna, nie majątek)`,
    "",
    "Depozyty zagregowane według typu:",
    ...Array.from(accountTotals, ([type, values]) => `- ${type}: saldo rzeczywiste ${values.actual.toFixed(2)}, dostępne ${values.available.toFixed(2)}`),
    "",
    "Planowane przychody według etykiet:",
    ...sumByLabel(plannedIncomes),
    `- potencjalne łącznie: ${plannedIncomes.filter((row) => row.certainty === "potential").reduce((sum, row) => sum + Number(row.amount), 0).toFixed(2)}`,
    "Planowane wydatki według etykiet:",
    ...sumByLabel(plannedExpenses),
    "",
    "Zobowiązania bez nazw produktów:",
    ...input.debts.filter((debt) => debt.debt > 0).map((debt) => `- ${debt.type}: zadłużenie ${debt.debt.toFixed(2)}, rata ${debt.installment.toFixed(2)}, RRSO ${debt.apr == null ? "brak" : `${debt.apr.toFixed(2)}%`}, oprocentowanie ${debt.interest == null ? "brak" : `${debt.interest.toFixed(2)}%`}`),
    "",
    "Cele (nazwy celów są podane świadomie):",
    ...input.goals.filter((goal) => goal.status === "active").map((goal) => { const metric = buildGoalMetric(goal, input.projection.conservativeMonthlyCapacity); return `- ${goal.name}: ${goal.allocatedAmount.toFixed(2)} / ${goal.targetAmount.toFixed(2)}, pozostało ${metric.remaining.toFixed(2)}, termin ${goal.dueDate ?? "brak"}, priorytet ${goal.priority}`; }),
    "",
    "Aplikacja sama nie ocenia szczegółowo podatków, warunków umów, ryzyka utraty dochodu, sensu nadpłaty konkretnego kredytu ani realności założeń użytkownika. Uwzględnij te ograniczenia i zaznacz, czego nie da się stwierdzić z tych danych.",
  ];
  return lines.join("\n");
}
