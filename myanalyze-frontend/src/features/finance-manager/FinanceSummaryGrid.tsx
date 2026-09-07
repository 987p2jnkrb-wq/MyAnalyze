import React from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Save } from "lucide-react";
import RefreshButton from "../../components/RefreshButton";
import ModuleBadge from "../../components/ModuleBadge";
import { useAccountContext } from "../../context/useAccountContext";
import { useExpenseContext } from "../../context/useExpenseContext";
import { useIncomeContext } from "../../context/useIncomeContext";
import { useExpenseStaleContext } from "../../context/ExpenseStaleContext";
import { useIncomeStaleContext } from "../../context/IncomeStaleContext";
import { assessDailyBudget, buildFinanceSummary, buildHistoricalPeriodSummary, buildPeriodSummary, buildUpcomingOperationDays, getPayPeriod, shiftPayPeriod } from "./financeSummary";
import MonthViewGrid from "./MonthViewGrid";
import { buildMonthlyActualHistory } from "./monthViewModel";
import { getAppCurrency } from "../../utils/appSettings";
import { localDateKey } from "../../utils/validation";
import apiClient, { apiErrorMessage } from "../../utils/apiClient";
import { useToast } from "../../context/ToastContext";
import { applyGoalAccountBalances, buildLiquidityBreakdown, normalizeFinancialGoal } from "./Goals/goalsModel";
import { effectiveDebtPlanDebt, normalizeDebtPlan } from "./debtPlanModel";
import HistoryPanel from "./finance-summary/HistoryPanel";
import SnapshotStatePanel from "./finance-summary/SnapshotStatePanel";
import SummaryMetricsGrid from "./finance-summary/SummaryMetricsGrid";
import UpcomingOperationsPanel from "./finance-summary/UpcomingOperationsPanel";
import FinanceSummaryFilters, { type LabelFilterMode } from "./finance-summary/FinanceSummaryFilters";
import FinanceSummaryTabs from "./finance-summary/FinanceSummaryTabs";
import PeriodNavigator from "./finance-summary/PeriodNavigator";
import type { FinanceSummaryView, PeriodSnapshot, SummaryMetric } from "./finance-summary/types";

function normalizeSnapshot(value: Record<string, unknown>): PeriodSnapshot {
  return {
    id: Number(value.id), period_start: String(value.period_start), period_end: String(value.period_end),
    real_liquidity: Number(value.real_liquidity || 0), financial_floor: Number(value.financial_floor || 0),
    consumer_debt: Number(value.consumer_debt || 0), mortgage_debt: Number(value.mortgage_debt || 0),
    goals_allocated: Number(value.goals_allocated || 0), captured_at: String(value.captured_at || ""),
  };
}

export type { FinanceSummaryView } from "./finance-summary/types";

export default function FinanceSummaryGrid({ view = "general", onViewChange, active = true }: { view?: FinanceSummaryView; onViewChange?: (view: FinanceSummaryView) => void; active?: boolean }) {
  const { accounts, accountsLoaded, accountsError, fetchAccounts } = useAccountContext();
  const { incomes, incomesLoaded, incomesError, fetchIncomes } = useIncomeContext();
  const { expenses, expensesLoaded, expensesError, fetchExpenses } = useExpenseContext();
  const { expensesStale, expensesStaleLoaded, expensesStaleError, fetchExpensesStale } = useExpenseStaleContext();
  const { incomesStale, incomesStaleLoaded, incomesStaleError, fetchIncomesStale } = useIncomeStaleContext();
  const currency = getAppCurrency();
  const { showToast } = useToast();
  const [activeView, setActiveView] = React.useState<FinanceSummaryView>(view);
  const [upcomingRange, setUpcomingRange] = React.useState<"period" | "30-days">("period");
  const [planning, setPlanning] = React.useState({ financialFloor: 0, dailyLivingBudget: 0, paydayCycleStartDay: 10 });
  const [planningLoaded, setPlanningLoaded] = React.useState(false);
  const [planningError, setPlanningError] = React.useState<string | null>(null);
  const [periodOffset, setPeriodOffset] = React.useState(0);
  const [snapshots, setSnapshots] = React.useState<PeriodSnapshot[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = React.useState(false);
  const [snapshotsError, setSnapshotsError] = React.useState<string | null>(null);
  const [savingSnapshot, setSavingSnapshot] = React.useState(false);
  const [summaryRefreshing, setSummaryRefreshing] = React.useState(false);
  const [accountFilter, setAccountFilter] = React.useState("");
  const [customTypeFilters, setCustomTypeFilters] = React.useState<number[]>([]);
  const [labelFilterMode, setLabelFilterMode] = React.useState<LabelFilterMode>("include");
  React.useEffect(() => setActiveView(view), [view]);
  // Edycja, realizacja lub usunięcie wygenerowanej transakcji zmienia overrides
  // reguły. Odśwież jej kontekst razem z nową kolekcją transakcji.
  React.useEffect(() => {
    if (active && incomesLoaded) void fetchIncomesStale().catch(() => undefined);
  }, [active, incomesLoaded, incomes, fetchIncomesStale]);
  React.useEffect(() => {
    if (active && expensesLoaded) void fetchExpensesStale().catch(() => undefined);
  }, [active, expensesLoaded, expenses, fetchExpensesStale]);
  const fetchPlanning = React.useCallback(async () => {
    setPlanningLoaded(false);
    setPlanningError(null);
    try {
      const response = await apiClient.get("/financial-goal-settings");
      setPlanning({
        financialFloor: Math.max(0, Number(response.data?.financial_floor) || 0),
        dailyLivingBudget: Math.max(0, Number(response.data?.daily_living_budget) || 0),
        paydayCycleStartDay: Math.min(31, Math.max(1, Number(response.data?.payday_cycle_start_day) || 10)),
      });
    } catch (error) {
      setPlanningError(apiErrorMessage(error, "Nie udało się pobrać ustawień planowania."));
    } finally {
      setPlanningLoaded(true);
    }
  }, []);
  React.useEffect(() => {
    if (!active) return;
    void fetchPlanning();
  }, [active, fetchPlanning]);
  const fetchSnapshots = React.useCallback(async () => {
    setSnapshotsLoading(true);
    setSnapshotsError(null);
    try {
      const response = await apiClient.get("/financial-period-snapshots");
      setSnapshots((Array.isArray(response.data) ? response.data : []).map((item) => normalizeSnapshot(item as Record<string, unknown>)));
    } catch (error) {
      const message = apiErrorMessage(error, "Nie udało się pobrać historii okresów.");
      setSnapshotsError(message);
      showToast(message, "error");
    } finally {
      setSnapshotsLoading(false);
    }
  }, [showToast]);
  React.useEffect(() => { if (active) void fetchSnapshots(); }, [active, fetchSnapshots]);
  const changeView = (next: FinanceSummaryView) => {
    setActiveView(next);
    onViewChange?.(next);
  };
  const [selectedDate, setSelectedDate] = React.useState(() => {
    const end = getPayPeriod(new Date()).end;
    return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  });

  const activeAccounts = React.useMemo(() => accounts.filter((item) => item.active !== false), [accounts]);
  const filteredAccounts = React.useMemo(() => accountFilter ? accounts.filter((item) => String(item.id) === accountFilter) : activeAccounts, [accountFilter, accounts, activeAccounts]);
  const selectedCustomTypeIds = React.useMemo(() => new Set(customTypeFilters), [customTypeFilters]);
  const labelFilterActive = customTypeFilters.length > 0;
  const matchesLabelFilter = React.useCallback((customTypeId: number | null | undefined) => {
    if (!labelFilterActive) return true;
    const selected = customTypeId != null && selectedCustomTypeIds.has(customTypeId);
    return labelFilterMode === "include" ? selected : !selected;
  }, [labelFilterActive, labelFilterMode, selectedCustomTypeIds]);
  const filteredIncomes = React.useMemo(() => incomes.filter((item) => (!accountFilter || String(item.accountId ?? "") === accountFilter) && matchesLabelFilter(item.customTypeId)), [accountFilter, incomes, matchesLabelFilter]);
  const filteredExpenses = React.useMemo(() => expenses.filter((item) => (!accountFilter || String(item.accountId ?? "") === accountFilter) && matchesLabelFilter(item.customTypeId)), [accountFilter, expenses, matchesLabelFilter]);
  // Recurring rules do not belong to a specific account, so an account filter still hides them.
  // Label filters, however, apply to recurring and one-time entries in exactly the same way.
  const filteredRecurringIncomes = React.useMemo(() => accountFilter ? [] : incomesStale.filter((item) => matchesLabelFilter(item.custom_type_id)), [accountFilter, incomesStale, matchesLabelFilter]);
  const filteredRecurringExpenses = React.useMemo(() => accountFilter ? [] : expensesStale.filter((item) => matchesLabelFilter(item.custom_type_id)), [accountFilter, expensesStale, matchesLabelFilter]);
  const customTypeOptions = React.useMemo(() => [...new Map([
    ...incomes.flatMap((item) => item.customTypeId != null && item.customTypeName ? [[item.customTypeId, item.customTypeName] as const] : []),
    ...expenses.flatMap((item) => item.customTypeId != null && item.customTypeName ? [[item.customTypeId, item.customTypeName] as const] : []),
    ...incomesStale.flatMap((item) => item.custom_type_id != null && item.custom_type_name ? [[Number(item.custom_type_id), item.custom_type_name] as const] : []),
    ...expensesStale.flatMap((item) => item.custom_type_id != null && item.custom_type_name ? [[Number(item.custom_type_id), item.custom_type_name] as const] : []),
  ]).entries()].sort((left, right) => left[1].localeCompare(right[1], "pl")), [expenses, expensesStale, incomes, incomesStale]);
  const toggleCustomTypeFilter = (id: number) => setCustomTypeFilters((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const monthlyActuals = React.useMemo(() => buildMonthlyActualHistory(filteredIncomes, filteredExpenses), [filteredExpenses, filteredIncomes]);
  const summary = React.useMemo(() => buildFinanceSummary({ accounts: filteredAccounts, incomes: filteredIncomes, expenses: filteredExpenses, recurringExpenses: filteredRecurringExpenses, recurringIncomes: filteredRecurringIncomes, paydayCycleStartDay: planning.paydayCycleStartDay }), [filteredAccounts, filteredExpenses, filteredIncomes, filteredRecurringExpenses, filteredRecurringIncomes, planning.paydayCycleStartDay]);
  const rows = React.useMemo<SummaryMetric[]>(() => [
    { id: "actual-funds", label: "Rzeczywiste środki", value: summary.actualFunds, calculation: "Suma sald rzeczywistych z Depozytów, z uwzględnieniem planów ratalnych" },
    { id: "recurring-income", label: "Stałe wpływy / m-c", value: summary.recurringIncome, calculation: "Suma wszystkich stałych przychodów" },
    { id: "recurring-expenses", label: "Stałe wydatki / m-c", value: summary.recurringExpenses, calculation: "Suma wszystkich stałych wydatków" },
    { id: "additional-income", label: "Dodatkowe wpływy", value: summary.additionalIncome, calculation: "Suma niezrealizowanych przychodów" },
    { id: "additional-expenses", label: "Dodatkowe wydatki", value: summary.additionalExpenses, calculation: "Suma niezrealizowanych wydatków" },
    { id: "available-with-credit", label: "Środki dostępne (+ karta)", value: summary.availableWithCredit, calculation: "Saldo dostępne wszystkich kont, gotówki i kart kredytowych" },
    { id: "daily-budget", label: `${currency} / dzień (z kartą)`, value: summary.dailyBudget, calculation: `Środki dostępne podzielone przez ${summary.daysUntilPayday} dni do wypłaty` },
  ], [currency, summary]);

  const periodSummary = React.useMemo(() => buildPeriodSummary({
    accounts: filteredAccounts,
    incomes: filteredIncomes,
    expenses: filteredExpenses,
    recurringExpenses: filteredRecurringExpenses,
    recurringIncomes: filteredRecurringIncomes,
    selectedDate: selectedDate ? new Date(`${selectedDate}T12:00:00`) : getPayPeriod(new Date(), planning.paydayCycleStartDay).end,
    dailyLivingBudget: planning.dailyLivingBudget,
    financialFloor: planning.financialFloor,
    paydayCycleStartDay: planning.paydayCycleStartDay,
  }), [filteredAccounts, filteredExpenses, filteredIncomes, filteredRecurringExpenses, filteredRecurringIncomes, planning, selectedDate]);
  React.useEffect(() => {
    setPeriodOffset(0);
    setSelectedDate(localDateKey(getPayPeriod(new Date(), planning.paydayCycleStartDay).end));
  }, [planning.paydayCycleStartDay]);
  const displayedPeriod = React.useMemo(() => shiftPayPeriod(periodSummary.period, periodOffset, planning.paydayCycleStartDay), [periodOffset, periodSummary.period, planning.paydayCycleStartDay]);
  const historicalSummary = React.useMemo(() => periodOffset === 0 ? null : buildHistoricalPeriodSummary({ period: displayedPeriod, incomes: filteredIncomes, expenses: filteredExpenses, recurringIncomes: filteredRecurringIncomes, recurringExpenses: filteredRecurringExpenses }), [displayedPeriod, filteredExpenses, filteredIncomes, filteredRecurringExpenses, filteredRecurringIncomes, periodOffset]);
  const dailyBudgetAssessment = React.useMemo(() => assessDailyBudget(periodSummary.safeDailyBudget, periodSummary.dailyLivingBudget), [periodSummary.dailyLivingBudget, periodSummary.safeDailyBudget]);
  const periodRows = React.useMemo<SummaryMetric[]>(() => [
    { id: "period-current", label: "Rzeczywiste środki dzisiaj", value: periodSummary.currentActual, calculation: "Suma sald rzeczywistych z Depozytów w chwili obliczenia" },
    { id: "period-income", label: "Wpływy całego okresu", value: periodSummary.periodIncome, calculation: "Planowane wpływy jednorazowe i stałe w bieżącym okresie wypłaty" },
    { id: "period-expenses", label: "Wydatki całego okresu", value: periodSummary.periodExpenses, calculation: "Planowane wydatki jednorazowe i stałe w bieżącym okresie wypłaty" },
    { id: "selected-income", label: "Wpływy do wybranego dnia", value: periodSummary.incomeUntilSelectedDate, calculation: "Niezrealizowane wpływy oraz przyszłe stałe wpływy do wybranej daty" },
    { id: "selected-expenses", label: "Wydatki do wybranego dnia", value: periodSummary.expensesUntilSelectedDate, calculation: "Niezrealizowane wydatki oraz przyszłe stałe wydatki do wybranej daty" },
    { id: "daily-living-budget", label: "Budżet bieżący / dzień", value: periodSummary.dailyLivingBudget, calculation: "Orientacyjna dzienna rezerwa planistyczna; nie jest wydatkiem ani transakcją" },
    { id: "daily-living-reserve", label: "Rezerwa na codzienne wydatki do kolejnej wypłaty", value: periodSummary.dailyLivingReserve, calculation: `${periodSummary.dailyLivingBudget.toFixed(2)} × ${periodSummary.remainingDaysInPeriod} pozostałych dni okresu` },
    { id: "actual-after-living-reserve", label: "Rzeczywiste środki na dzień (uwzględniając rezerwę na codzienne wydatki)", value: periodSummary.actualAfterLivingReserveAtSelectedDate, calculation: "Rzeczywiste środki na wybrany dzień pomniejszone o pełną rezerwę na codzienne wydatki do kolejnej wypłaty" },
    { id: "actual-after-living-reserve-daily", label: "Rzeczywiste saldo / dzień (uwzględniając rezerwę na codzienne wydatki)", value: periodSummary.actualAfterLivingReserveDailyBudget, calculation: `Rzeczywiste środki po rezerwie podzielone przez ${periodSummary.daysToSelectedDate} dni od dzisiaj` },
    { id: "safe-daily-budget", label: "Bezpiecznie dostępne / dzień", value: periodSummary.safeDailyBudget, calculation: `Prognozowane środki po zaplanowanych wydatkach i ponad finansową podłogą, podzielone przez ${periodSummary.remainingDaysInPeriod} dni`, dailyBudgetAssessment },
    { id: "actual-at-date", label: "Rzeczywiste środki na dzień", value: periodSummary.actualAtSelectedDate, calculation: "Rzeczywiste środki dzisiaj + przyszłe wpływy − przyszłe wydatki do wybranego dnia" },
    { id: "actual-daily", label: "Rzeczywiste saldo / dzień", value: periodSummary.actualDailyBudget, calculation: `Rzeczywiste środki na wybrany dzień podzielone przez ${periodSummary.daysToSelectedDate} dni od dzisiaj` },
    { id: "available-at-date", label: "Dostępne środki na dzień", value: periodSummary.availableAtSelectedDate, calculation: "Saldo dostępne z Depozytów dzisiaj + przyszłe wpływy − przyszłe wydatki do wybranego dnia" },
    { id: "available-daily", label: "Dostępne saldo / dzień", value: periodSummary.availableDailyBudget, calculation: `Dostępne środki na wybrany dzień podzielone przez ${periodSummary.daysToSelectedDate} dni od dzisiaj` },
  ], [dailyBudgetAssessment, periodSummary]);
  const historicalRows = React.useMemo<SummaryMetric[]>(() => historicalSummary ? [
    { id: "historical-planned-income", label: "Przychody — plan odtworzony", value: historicalSummary.plannedIncome, calculation: "Wpisy jednorazowe oraz reguły stałe aktywne w wybranym okresie" },
    { id: "historical-actual-income", label: "Przychody zrealizowane", value: historicalSummary.actualIncome, calculation: "Datowane transakcje oznaczone jako zrealizowane" },
    { id: "historical-planned-expenses", label: "Wydatki — plan odtworzony", value: historicalSummary.plannedExpenses, calculation: "Wpisy jednorazowe oraz reguły stałe aktywne w wybranym okresie" },
    { id: "historical-actual-expenses", label: "Wydatki zrealizowane", value: historicalSummary.actualExpenses, calculation: "Datowane transakcje oznaczone jako zrealizowane" },
    { id: "historical-actual-balance", label: "Bilans zrealizowany", value: historicalSummary.actualBalance, calculation: "Zrealizowane przychody minus zrealizowane wydatki" },
  ] : [], [historicalSummary]);
  const upcomingEndDate = React.useMemo(() => {
    if (upcomingRange === "period") return periodSummary.period.end;
    const end = new Date();
    end.setDate(end.getDate() + 29);
    return end;
  }, [periodSummary.period.end, upcomingRange]);
  const upcomingDays = React.useMemo(() => buildUpcomingOperationDays({
    accounts: filteredAccounts,
    incomes: filteredIncomes,
    expenses: filteredExpenses,
    recurringExpenses: filteredRecurringExpenses,
    recurringIncomes: filteredRecurringIncomes,
    endDate: upcomingEndDate,
    dailyLivingBudget: planning.dailyLivingBudget,
    financialFloor: planning.financialFloor,
  }), [filteredAccounts, filteredExpenses, filteredIncomes, filteredRecurringExpenses, filteredRecurringIncomes, planning.dailyLivingBudget, planning.financialFloor, upcomingEndDate]);
  const currentPeriodSnapshot = snapshots.find((snapshot) => snapshot.period_start === localDateKey(periodSummary.period.start) && snapshot.period_end === localDateKey(periodSummary.period.end));
  const displayedPeriodSnapshot = snapshots.find((snapshot) => snapshot.period_start === localDateKey(displayedPeriod.start) && snapshot.period_end === localDateKey(displayedPeriod.end));
  const savePeriodSnapshot = async () => {
    if (savingSnapshot) return;
    setSavingSnapshot(true);
    try {
      const [debtsResponse, goalsResponse] = await Promise.all([apiClient.get("/debt-plans"), apiClient.get("/financial-goals")]);
      const debtPlans = (Array.isArray(debtsResponse.data) ? debtsResponse.data : []).map((item) => normalizeDebtPlan(item)).filter((plan) => plan.active !== false);
      const goals = applyGoalAccountBalances((Array.isArray(goalsResponse.data) ? goalsResponse.data : []).map((item) => normalizeFinancialGoal(item)), activeAccounts);
      const debtFor = (mortgage: boolean) => debtPlans
        .filter((plan) => (plan.typ === "Kredyt hipoteczny") === mortgage)
        .reduce((sum, plan) => sum + effectiveDebtPlanDebt(plan, debtPlans), 0);
      const response = await apiClient.post("/financial-period-snapshots", {
        periodStart: localDateKey(periodSummary.period.start), periodEnd: localDateKey(periodSummary.period.end),
        realLiquidity: buildLiquidityBreakdown(activeAccounts).total,
        financialFloor: planning.financialFloor,
        consumerDebt: debtFor(false), mortgageDebt: debtFor(true),
        goalsAllocated: goals.filter((goal) => goal.status !== "completed").reduce((sum, goal) => sum + goal.allocatedAmount, 0),
      });
      const saved = normalizeSnapshot(response.data as Record<string, unknown>);
      setSnapshots((current) => [saved, ...current.filter((item) => item.id !== saved.id)].sort((left, right) => right.period_end.localeCompare(left.period_end)));
      showToast(currentPeriodSnapshot ? "Zaktualizowano podsumowanie okresu." : "Zapisano podsumowanie okresu w Historii.", "success");
    } catch (error) {
      showToast(apiErrorMessage(error, "Nie udało się zapisać podsumowania okresu."), "error");
    } finally {
      setSavingSnapshot(false);
    }
  };

  const paydayLabel = summary.nextPayday.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });

  const minForecastDate = new Date();
  const minDateValue = `${minForecastDate.getFullYear()}-${String(minForecastDate.getMonth() + 1).padStart(2, "0")}-${String(minForecastDate.getDate()).padStart(2, "0")}`;
  const periodEndValue = `${periodSummary.period.end.getFullYear()}-${String(periodSummary.period.end.getMonth() + 1).padStart(2, "0")}-${String(periodSummary.period.end.getDate()).padStart(2, "0")}`;
  const shiftSelectedDate = (days: -1 | 1) => {
    const current = new Date(`${selectedDate}T12:00:00`);
    if (Number.isNaN(current.getTime())) return;
    current.setDate(current.getDate() + days);
    const next = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
    if (next >= minDateValue && next <= periodEndValue) setSelectedDate(next);
  };

  const resourcesLoaded = accountsLoaded && incomesLoaded && expensesLoaded && incomesStaleLoaded && expensesStaleLoaded;
  const summaryError = planningError ?? accountsError ?? incomesError ?? expensesError ?? incomesStaleError ?? expensesStaleError;
  const retrySummary = async () => {
    setSummaryRefreshing(true);
    try {
      await Promise.allSettled([fetchPlanning(), fetchAccounts(), fetchIncomes(), fetchExpenses(), fetchIncomesStale(), fetchExpensesStale(), fetchSnapshots()]);
    } finally {
      setSummaryRefreshing(false);
    }
  };
  if (!resourcesLoaded || !planningLoaded) return <div role="status" className="flex min-h-[430px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-500"><RefreshCw size={18} className="animate-spin" aria-hidden="true" />Ładowanie Podsumowania…</div>;
  if (summaryError) return <div role="alert" className="flex min-h-[430px] flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 p-6 text-center"><div className="font-semibold text-red-800">Nie można bezpiecznie wyświetlić Podsumowania</div><p className="max-w-xl text-sm text-red-700">{summaryError} Ekran nie pokazuje wartości zastępczych.</p><button type="button" className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100" onClick={() => void retrySummary()}>Spróbuj ponownie</button></div>;

  return <div className="min-w-0 space-y-3">
    <FinanceSummaryFilters accounts={accounts} accountFilter={accountFilter} customTypeFilters={customTypeFilters} labelFilterMode={labelFilterMode} customTypeOptions={customTypeOptions} onAccountFilterChange={setAccountFilter} onToggleCustomType={toggleCustomTypeFilter} onClearCustomTypes={() => setCustomTypeFilters([])} onLabelFilterModeChange={setLabelFilterMode} onClearAll={() => { setAccountFilter(""); setCustomTypeFilters([]); setLabelFilterMode("include"); }} />
    <div className="flex flex-wrap items-center gap-2"><FinanceSummaryTabs active={activeView} onChange={changeView} /><RefreshButton label="Odśwież Podsumowanie" refreshing={summaryRefreshing} onRefresh={retrySummary} /></div>
    {activeView === "period" && <PeriodNavigator start={displayedPeriod.start} end={displayedPeriod.end} isCurrent={periodOffset === 0} onPrevious={() => setPeriodOffset((current) => current - 1)} onNext={() => setPeriodOffset((current) => Math.min(0, current + 1))} onCurrent={() => setPeriodOffset(0)} />}
    {activeView === "month" ? <MonthViewGrid filteredIncomes={filteredIncomes} filteredExpenses={filteredExpenses} filteredRecurringIncomes={filteredRecurringIncomes} filteredRecurringExpenses={filteredRecurringExpenses} /> : activeView === "history" ? (snapshotsLoading
      ? <div role="status" className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Ładowanie historii…</div>
      : snapshotsError ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-center text-sm text-red-700">{snapshotsError}<button type="button" className="ml-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 font-semibold hover:bg-red-100" onClick={() => void fetchSnapshots()}>Spróbuj ponownie</button></div>
      : <HistoryPanel snapshots={snapshots} monthlyActuals={monthlyActuals} incomes={filteredIncomes} expenses={filteredExpenses} />) : <SummaryMetricsGrid
      gridId={activeView === "general" ? "manager-summary" : periodOffset === 0 ? "manager-period-summary" : "manager-period-history"}
      rows={activeView === "general" ? rows : periodOffset === 0 ? periodRows : historicalRows}
      exportFileName={activeView === "general" ? "podsumowanie-ogolne.csv" : "podsumowanie-okresu.csv"}
      toolbar={activeView === "general"
        ? undefined
        : periodOffset === 0 ? <>
          <ModuleBadge tone="neutral" size="sm">Wypłata: {paydayLabel} · {summary.daysUntilPayday} dni</ModuleBadge>
          <div className="flex items-center gap-1.5">
            <span className="mr-1 text-xs font-semibold text-slate-600">Prognoza na dzień</span>
            <button type="button" aria-label="Poprzedni dzień prognozy" title="Poprzedni dzień" disabled={selectedDate <= minDateValue} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => shiftSelectedDate(-1)}><ChevronLeft size={17} aria-hidden="true" /></button>
            <input aria-label="Prognoza salda na dzień" type="date" min={minDateValue} max={periodEndValue} value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal" />
            <button type="button" aria-label="Następny dzień prognozy" title="Następny dzień" disabled={selectedDate >= periodEndValue} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => shiftSelectedDate(1)}><ChevronRight size={17} aria-hidden="true" /></button>
          </div>
        </> : <><ModuleBadge tone="info" size="sm">Dane historyczne</ModuleBadge><ModuleBadge tone="neutral" size="sm">Zrealizowane wpisy: {historicalSummary?.realizedTransactions ?? 0}</ModuleBadge></>}
    />}
    {activeView === "period" && periodOffset === 0 && <UpcomingOperationsPanel days={upcomingDays} range={upcomingRange} onRangeChange={setUpcomingRange} />}
    {activeView === "period" && periodOffset < 0 && <SnapshotStatePanel snapshot={displayedPeriodSnapshot} />}
    {activeView === "period" && periodOffset === 0 && <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div><h2 className="font-bold text-slate-900">Historia okresu</h2><p className="mt-0.5 text-sm text-slate-500">{currentPeriodSnapshot ? `Stan tego okresu zapisano ${new Date(currentPeriodSnapshot.captured_at.replace(" ", "T")).toLocaleString("pl-PL")}. Możesz go zaktualizować.` : "Zapisz obecny stan okresu. Aplikacja nie wykonuje przy tym żadnych księgowań."}</p></div><button type="button" disabled={savingSnapshot} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50" onClick={() => void savePeriodSnapshot()}><Save size={17} aria-hidden="true" />{savingSnapshot ? "Zapisywanie…" : currentPeriodSnapshot ? "Aktualizuj podsumowanie" : "Zapisz podsumowanie"}</button></section>}
  </div>;
}
