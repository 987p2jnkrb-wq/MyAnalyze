import React from "react";
import { CircleCheckBig, ClipboardCopy, Pencil, Plus, RefreshCw, Settings2, Sparkles, Trash2 } from "lucide-react";
import DataGrid, { type DataGridColumn } from "../../../components/DataGrid";
import Modal from "../../../components/Modal";
import ModalFormActions from "../../../components/ModalFormActions";
import ConfirmModal from "../../../components/ConfirmModal";
import IconButton from "../../../components/IconButton";
import ModuleBadge, { type ModuleBadgeTone } from "../../../components/ModuleBadge";
import MoneyInput from "../../../components/MoneyInput";
import HelpBadge from "../../../components/HelpBadge";
import { activeStatusLabel } from "../../../components/data-grid/ActiveStatus";
import apiClient, { apiErrorMessage } from "../../../utils/apiClient";
import { formatCurrency, formatDate } from "../../../utils/formatters";
import { getAppCurrency } from "../../../utils/appSettings";
import { useUiText } from "../../../i18n";
import { isCreditAccount } from "../../../utils/accountModel";
import { useAccountContext } from "../../../context/useAccountContext";
import { useIncomeContext } from "../../../context/useIncomeContext";
import { useExpenseContext } from "../../../context/useExpenseContext";
import { useIncomeStaleContext } from "../../../context/IncomeStaleContext";
import { useExpenseStaleContext } from "../../../context/ExpenseStaleContext";
import { useToast } from "../../../context/ToastContext";
import { buildFinanceSummary } from "../financeSummary";
import { effectiveDebtPlanDebt, effectiveMonthlyInstallment, normalizeDebtPlan, type DebtPlan } from "../debtPlanModel";
import { MAX_MONEY_AMOUNT, validateMoneyRange } from "../../../utils/validation";
import NewFundsStrategyForm from "./NewFundsStrategyForm";
import {
  allocateNewFundsWithStrategy, applyGoalAccountBalances, buildBufferStatus, buildGoalMetric, buildGoalProjection, buildGoalRecommendations, buildGoalsAiPrompt, buildProposedGoals, buildSuggestedNewFundsStrategy, goalAvailableNow, newFundsStrategyPayload, normalizeNewFundsStrategy, proposedGoalAlreadyExists,
  DEFAULT_GOAL_SETTINGS, goalPayload, goalSettingsPayload, normalizeFinancialGoal, normalizeGoalSettings, validateFinancialGoal, validateGoalSettings, validateNewFundsStrategy,
  type AllocationLine, type FinancialGoal, type FinancialGoalDraft, type GoalMetric, type GoalPriority, type GoalSettings, type GoalStatus, type GoalType, type NewFundsStrategy,
} from "./goalsModel";

const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  emergency_fund: "Poduszka", purchase: "Zakup", travel: "Wyjazd", car: "Samochód", renovation: "Remont",
  down_payment: "Wkład własny", debt_repayment: "Spłata zobowiązania", custom: "Własny",
};
const PRIORITY_LABELS: Record<GoalPriority, string> = { low: "Niski", normal: "Normalny", high: "Wysoki" };
const STATUS_LABELS: Record<GoalStatus, string> = { active: "Aktywny", paused: "Wstrzymany", completed: "Zakończony" };
const FEASIBILITY_LABELS: Record<GoalMetric["feasibility"], string> = { comfortable: "Komfortowy", demanding: "Wymagający", difficult: "Trudny", unknown: "Brak terminu" };
const FEASIBILITY_TONES: Record<GoalMetric["feasibility"], ModuleBadgeTone> = { comfortable: "success", demanding: "warning", difficult: "danger", unknown: "neutral" };
const FEASIBILITY_HELP = "Wykonalność uwzględnia środki dostępne teraz oraz wymagane tempo do terminu. Jeśli saldo depozytu jest uwzględniane jako postęp celu, używane jest tylko saldo tego depozytu. W pozostałych przypadkach używana jest bezpieczna nadwyżka ze wszystkich aktywnych depozytów, po zabezpieczeniu finansowej podłogi, bieżącej rezerwy i zaplanowanych wydatków.";
type GoalResourcesLoaded = { goals: boolean; settings: boolean; debts: boolean };

function numberInput(value: string): number {
  return Number(value.trim().replace(",", "."));
}

function emptyGoal(): FinancialGoalDraft {
  return { name: "", type: "custom", targetAmount: 0, allocatedAmount: 0, dueDate: null, priority: "normal", status: "active", accountId: null, includeAccountBalance: false, note: null };
}

function draftFromGoal(goal: FinancialGoal): FinancialGoalDraft {
  return { name: goal.name, type: goal.type, targetAmount: goal.targetAmount, allocatedAmount: goal.allocatedAmount, dueDate: goal.dueDate, priority: goal.priority, status: goal.status, accountId: goal.accountId, includeAccountBalance: goal.includeAccountBalance, note: goal.note };
}

function GoalForm({ initial, accounts, onSave }: { initial: FinancialGoalDraft; accounts: ReturnType<typeof useAccountContext>["accounts"]; onSave: (goal: FinancialGoalDraft) => Promise<void> }) {
  const [draft, setDraft] = React.useState(initial);
  const [target, setTarget] = React.useState(initial.targetAmount ? String(initial.targetAmount) : "");
  const [allocated, setAllocated] = React.useState(String(initial.allocatedAmount || 0));
  const { showToast } = useToast();
  const submit = () => {
    const next = { ...draft, name: draft.name.trim(), targetAmount: numberInput(target), allocatedAmount: numberInput(allocated) };
    const validationError = validateFinancialGoal(next);
    if (validationError) return showToast(validationError, "error");
    void onSave(next);
  };
  return <form id="goal-form" className="space-y-5" onSubmit={(event) => { event.preventDefault(); submit(); }}>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <label className="md:col-span-2"><span className="mb-1 block text-sm font-semibold">Nazwa celu</span><input autoFocus required className="w-full rounded-lg border border-slate-300 px-3 py-2.5" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
      <label><span className="mb-1 block text-sm font-semibold">Typ</span><select className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5" value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as GoalType }))}>{Object.entries(GOAL_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label><span className="mb-1 block text-sm font-semibold">Priorytet</span><select className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5" value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as GoalPriority }))}>{Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label><span className="mb-1 block text-sm font-semibold">Kwota docelowa</span><MoneyInput required min={0.01} max={MAX_MONEY_AMOUNT} value={target} onValueChange={setTarget} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
      <label><span className="mb-1 block text-sm font-semibold">Kwota przypisana</span><MoneyInput required min={0} max={MAX_MONEY_AMOUNT} disabled={draft.includeAccountBalance && draft.accountId !== null} value={allocated} onValueChange={setAllocated} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 disabled:bg-slate-100" /></label>
      <label><span className="mb-1 block text-sm font-semibold">Termin <span className="font-normal text-slate-500">(opcjonalnie)</span></span><input type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2.5" value={draft.dueDate ?? ""} onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value || null }))} /></label>
      <label><span className="mb-1 block text-sm font-semibold">Status</span><select className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5" value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as GoalStatus }))}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <div className="md:col-span-2 space-y-2"><label><span className="mb-1 block text-sm font-semibold">Depozyt celu <span className="font-normal text-slate-500">(opcjonalnie)</span></span><select className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5" value={draft.accountId ?? ""} onChange={(event) => setDraft((current) => ({ ...current, accountId: event.target.value ? Number(event.target.value) : null, includeAccountBalance: event.target.value ? current.includeAccountBalance : false }))}><option value="">Bez powiązania</option>{accounts.filter((account) => !isCreditAccount(account)).map((account) => <option key={account.id} value={account.id}>{account.nazwa}{account.active === false ? ` (${activeStatusLabel(account.active).toLocaleLowerCase("pl-PL")})` : ""} · saldo rzeczywiste {formatCurrency(account.saldo_wlasciwe)}</option>)}</select></label>{draft.accountId !== null && <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"><input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300" checked={draft.includeAccountBalance} onChange={(event) => setDraft((current) => ({ ...current, includeAccountBalance: event.target.checked }))} /><span><span className="block text-sm font-semibold text-slate-800">Uwzględniaj saldo depozytu jako postęp celu</span><span className="block text-xs text-slate-500">Postęp będzie liczony z bieżącego salda rzeczywistego wybranego depozytu zamiast z kwoty przypisanej ręcznie.</span></span></label>}<span className="block text-xs text-slate-500">Powiązanie nie wykonuje przelewów i nie zmienia salda depozytu.</span></div>
      <label className="md:col-span-2"><span className="mb-1 block text-sm font-semibold">Notatka <span className="font-normal text-slate-500">(opcjonalnie)</span></span><textarea rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" value={draft.note ?? ""} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value || null }))} /></label>
    </div>
  </form>;
}

function SettingsForm({ settings, onChange }: { settings: GoalSettings; onChange: (settings: GoalSettings) => void }) {
  const updateThreshold = (index: number, value: number) => onChange({ ...settings, thresholds: settings.thresholds.map((item, itemIndex) => itemIndex === index ? value : item) as GoalSettings["thresholds"] });
  const updateAllocation = (index: number, value: number) => onChange({ ...settings, allocations: settings.allocations.map((item, itemIndex) => itemIndex === index ? Math.max(0, Math.min(100, Math.round(value))) : item) as GoalSettings["allocations"] });
  return <div className="space-y-5">
    <label><span className="mb-1 block text-sm font-semibold">Finansowa podłoga</span><MoneyInput min={0} max={MAX_MONEY_AMOUNT} value={settings.financialFloor} onValueChange={(value) => onChange({ ...settings, financialFloor: numberInput(value) || 0 })} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
    <label><span className="mb-1 block text-sm font-semibold" title="Orientacyjna kwota przeznaczona na codzienne wydatki, których nie musisz osobno planować w aplikacji. Jest używana wyłącznie do prognozowania płynności.">Budżet bieżący / dzień</span><MoneyInput min={0} max={MAX_MONEY_AMOUNT} value={settings.dailyLivingBudget} onValueChange={(value) => onChange({ ...settings, dailyLivingBudget: numberInput(value) || 0 })} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" /><span className="mt-1 block text-xs text-slate-500">Orientacyjna rezerwa na codzienne wydatki, używana tylko w prognozie płynności.</span></label>
    <label><span className="mb-1 block text-sm font-semibold">Początek okresu wypłatowego</span><div className="flex"><input type="number" min={1} max={31} step={1} value={settings.paydayCycleStartDay} onChange={(event) => onChange({ ...settings, paydayCycleStartDay: Number(event.target.value) })} className="min-w-0 flex-1 rounded-l-lg border border-slate-300 px-3 py-2.5" /><span className="rounded-r-lg border border-l-0 border-slate-300 bg-slate-50 px-3 py-2.5 text-sm">dzień miesiąca</span></div><span className="mt-1 block text-xs text-slate-500">Koniec okresu przypada dzień przed kolejnym początkiem.</span></label>
    <fieldset className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4"><legend className="px-2 text-sm font-bold text-slate-800">Poduszka finansowa</legend><p className="text-xs text-slate-500">Progi określają kolejne poziomy poduszki, a alokacje sterują podziałem nowych środków.</p><div className="grid grid-cols-1 gap-4 sm:grid-cols-3">{settings.thresholds.map((threshold, index) => <label key={index}><span className="mb-1 block text-sm font-semibold">Próg {index + 1}</span><MoneyInput min={0.01} max={MAX_MONEY_AMOUNT} value={threshold} onValueChange={(value) => updateThreshold(index, numberInput(value) || 0)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5" /></label>)}</div><div className="grid grid-cols-1 gap-4 sm:grid-cols-3">{settings.allocations.map((allocation, index) => <label key={index}><span className="mb-1 block text-sm font-semibold">Alokacja - próg {index + 1}</span><div className="flex"><input type="number" min={0} max={100} step={1} className="min-w-0 flex-1 rounded-l-lg border border-slate-300 bg-white px-3 py-2.5" value={allocation} onChange={(event) => updateAllocation(index, Number(event.target.value))} /><span className="rounded-r-lg border border-l-0 border-slate-300 bg-white px-3 py-2.5">%</span></div></label>)}</div></fieldset>
    <p className="text-sm text-slate-500">Ustawienia wpływają wyłącznie na rekomendacje. Nie wykonują przelewów ani księgowań.</p>
  </div>;
}

export default function GoalsPage({ active = true }: { active?: boolean }) {
  const t = useUiText();
  const { accounts, accountsLoaded, accountsError, fetchAccounts } = useAccountContext();
  const { incomes, incomesLoaded, incomesError, fetchIncomes } = useIncomeContext();
  const { expenses, expensesLoaded, expensesError, fetchExpenses } = useExpenseContext();
  const { incomesStale, incomesStaleLoaded, incomesStaleError, fetchIncomesStale } = useIncomeStaleContext();
  const { expensesStale, expensesStaleLoaded, expensesStaleError, fetchExpensesStale } = useExpenseStaleContext();
  const { showToast } = useToast();
  const [goals, setGoals] = React.useState<FinancialGoal[]>([]);
  const [settings, setSettings] = React.useState<GoalSettings>(DEFAULT_GOAL_SETTINGS);
  const [debtPlans, setDebtPlans] = React.useState<DebtPlan[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [resourcesLoaded, setResourcesLoaded] = React.useState<GoalResourcesLoaded>({ goals: false, settings: false, debts: false });
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [editor, setEditor] = React.useState<{ id: number | null; draft: FinancialGoalDraft } | null>(null);
  const [deleteGoal, setDeleteGoal] = React.useState<FinancialGoal | null>(null);
  const [newFundsStrategyOpen, setNewFundsStrategyOpen] = React.useState(false);
  const [newFundsStrategy, setNewFundsStrategy] = React.useState<NewFundsStrategy | null>(null);
  const [planningDraft, setPlanningDraft] = React.useState<GoalSettings | null>(null);
  const [strategyDraft, setStrategyDraft] = React.useState<NewFundsStrategy | null>(null);
  const [newFunds, setNewFunds] = React.useState("");
  const [prompt, setPrompt] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setLoadError(null);
    try {
      const [goalsResult, settingsResult, debtsResult] = await Promise.allSettled([
        apiClient.get("/financial-goals"), apiClient.get("/financial-goal-settings"), apiClient.get("/debt-plans"),
      ]);
      const loadedNow: GoalResourcesLoaded = {
        goals: goalsResult.status === "fulfilled",
        settings: settingsResult.status === "fulfilled",
        debts: debtsResult.status === "fulfilled",
      };
      if (goalsResult.status === "fulfilled") setGoals((Array.isArray(goalsResult.value.data) ? goalsResult.value.data : []).map(normalizeFinancialGoal));
      if (settingsResult.status === "fulfilled") {
        setSettings(normalizeGoalSettings(settingsResult.value.data));
        setNewFundsStrategy(normalizeNewFundsStrategy(settingsResult.value.data?.new_funds_strategy));
      }
      if (debtsResult.status === "fulfilled") setDebtPlans((Array.isArray(debtsResult.value.data) ? debtsResult.value.data : []).map(normalizeDebtPlan));
      setResourcesLoaded((current) => ({ goals: current.goals || loadedNow.goals, settings: current.settings || loadedNow.settings, debts: current.debts || loadedNow.debts }));
      const failed = ([['celów', loadedNow.goals], ['ustawień planowania', loadedNow.settings], ['zobowiązań', loadedNow.debts]] as const).filter(([, loaded]) => !loaded).map(([label]) => label);
      if (failed.length) {
        setLoadError(`Nie udało się pobrać: ${failed.join(", ")}. Pozostałe dane zachowano.`);
        return false;
      }
      return true;
    } catch {
      setLoadError("Nie udało się przetworzyć danych Celów. Spróbuj ponownie.");
      return false;
    } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { if (active) void fetchData(); }, [active, fetchData]);

  const refreshAllGoalData = React.useCallback(async (): Promise<boolean> => {
    const results = await Promise.allSettled([
      fetchData(), fetchAccounts(), fetchIncomes(), fetchExpenses(), fetchIncomesStale(), fetchExpensesStale(),
    ]);
    return results.every((result) => result.status === "fulfilled" && result.value !== false);
  }, [fetchAccounts, fetchData, fetchExpenses, fetchExpensesStale, fetchIncomes, fetchIncomesStale]);

  const activeAccounts = React.useMemo(() => accounts.filter((account) => account.active !== false), [accounts]);
  const activeDebtPlans = React.useMemo(() => debtPlans.filter((plan) => plan.active !== false), [debtPlans]);
  const projection = React.useMemo(() => buildGoalProjection({ accounts: activeAccounts, incomes, expenses, recurringIncomes: incomesStale, recurringExpenses: expensesStale, settings }), [activeAccounts, expenses, expensesStale, incomes, incomesStale, settings]);
  const debts = React.useMemo(() => activeDebtPlans.map((plan) => ({ id: plan.id, name: plan.produkt, type: plan.typ, debt: effectiveDebtPlanDebt(plan, activeDebtPlans), installment: effectiveMonthlyInstallment(plan, expensesStale), apr: plan.rrso, interest: plan.oprocentowanie })), [activeDebtPlans, expensesStale]);
  const goalsForAnalysis = React.useMemo(() => applyGoalAccountBalances(goals, activeAccounts), [activeAccounts, goals]);
  const analysisGoalsById = React.useMemo(() => new Map(goalsForAnalysis.map((goal) => [goal.id, goal])), [goalsForAnalysis]);
  const metrics = React.useMemo(() => new Map(goalsForAnalysis.map((goal) => [goal.id, buildGoalMetric(goal, projection.conservativeMonthlyCapacity, goalAvailableNow(goal, projection.safeSurplus))])), [goalsForAnalysis, projection.conservativeMonthlyCapacity, projection.safeSurplus]);
  const recommendations = React.useMemo(() => buildGoalRecommendations({ projection, settings, goals: goalsForAnalysis, debts }), [debts, goalsForAnalysis, projection, settings]);
  const proposedGoals = React.useMemo(() => {
    const proposals = buildProposedGoals(expenses, projection.liquidity.total, projection.safeSurplus);
    return proposals.filter((proposal) => !proposedGoalAlreadyExists(proposal, goals));
  }, [expenses, goals, projection.liquidity.total, projection.safeSurplus]);
  const newFundsError = React.useMemo(() => validateMoneyRange(newFunds, "Kwota dodatkowych środków"), [newFunds]);
  const strategyStartLiquidity = Math.max(projection.liquidity.total, settings.financialFloor + projection.dailyLivingReserve);
  const suggestedNewFundsStrategy = React.useMemo(() => buildSuggestedNewFundsStrategy(strategyStartLiquidity, settings, goalsForAnalysis, debts, activeAccounts), [activeAccounts, debts, goalsForAnalysis, settings, strategyStartLiquidity]);
  const effectiveNewFundsStrategy = newFundsStrategy ?? suggestedNewFundsStrategy;
  const openPlanningSettings = () => {
    setPlanningDraft(settings);
    setStrategyDraft(effectiveNewFundsStrategy);
    setNewFundsStrategyOpen(true);
  };
  const allocation = React.useMemo<AllocationLine[]>(() => allocateNewFundsWithStrategy(newFundsError ? 0 : numberInput(newFunds) || 0, projection.liquidity.total, settings, goalsForAnalysis, debts, activeAccounts, effectiveNewFundsStrategy, projection.dailyLivingReserve), [activeAccounts, debts, effectiveNewFundsStrategy, goalsForAnalysis, newFunds, newFundsError, projection.dailyLivingReserve, projection.liquidity.total, settings]);
  const activeGoals = goals.filter((goal) => goal.status === "active").length;
  const bufferStatus = React.useMemo(() => buildBufferStatus(projection.liquidity.total, settings), [projection.liquidity.total, settings]);
  const hasCriticalLiquidityAlert = recommendations.some((item) => item.id === "cashflow-negative");

  const columns = React.useMemo<DataGridColumn<FinancialGoal>[]>(() => [
    { key: "name", label: "Cel", value: (row) => row.name, render: (row) => <div><span data-i18n-ignore="true" className="font-semibold text-slate-900">{row.name}</span>{row.accountName && <div className="mt-1 text-xs text-slate-500">{t("Depozyt celu:")} <span data-i18n-ignore="true">{row.accountName}</span>{row.includeAccountBalance && <> · {t("saldo uwzględniane")}</>}</div>}</div>, sortable: true, width: 230, edit: { type: "text", value: (row) => row.name, update: (row, value) => ({ ...row, name: String(value) }) } },
    { key: "type", label: "Typ", value: (row) => t(GOAL_TYPE_LABELS[row.type]), render: (row) => <ModuleBadge size="sm" tone="violet">{t(GOAL_TYPE_LABELS[row.type])}</ModuleBadge>, sortable: true, filterable: true, width: 155 },
    { key: "progress", label: "Postęp", value: (row) => metrics.get(row.id)?.progress ?? 0, render: (row) => { const metric = metrics.get(row.id); const analyzedGoal = analysisGoalsById.get(row.id) ?? row; return <div className="min-w-[150px]"><div className="mb-1 flex justify-between text-xs"><span>{formatCurrency(analyzedGoal.allocatedAmount)}</span><span>{metric?.progress ?? 0}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-blue-600" style={{ width: `${metric?.progress ?? 0}%` }} /></div></div>; }, sortable: true, width: 190 },
    { key: "target", label: "Kwota docelowa", value: (row) => row.targetAmount, render: (row) => formatCurrency(row.targetAmount), exportValue: (row) => formatCurrency(row.targetAmount), sortable: true, width: 155, align: "right", edit: { type: "number", min: 0.01, max: MAX_MONEY_AMOUNT, step: 0.01, value: (row) => row.targetAmount, update: (row, value) => ({ ...row, targetAmount: Number(value) }) } },
    { key: "remaining", label: "Pozostało", value: (row) => metrics.get(row.id)?.remaining ?? 0, render: (row) => formatCurrency(metrics.get(row.id)?.remaining ?? 0), exportValue: (row) => formatCurrency(metrics.get(row.id)?.remaining ?? 0), sortable: true, width: 145, align: "right" },
    { key: "dueDate", label: "Termin", value: (row) => row.dueDate ?? "", render: (row) => row.dueDate ? formatDate(row.dueDate) : "-", sortable: true, width: 135, edit: { type: "date", value: (row) => row.dueDate ?? "", update: (row, value) => ({ ...row, dueDate: String(value) || null }) } },
    { key: "pace", label: "Tempo / m-c", value: (row) => metrics.get(row.id)?.monthlyRequired ?? -1, render: (row) => metrics.get(row.id)?.monthlyRequired == null ? "-" : formatCurrency(metrics.get(row.id)?.monthlyRequired ?? 0), exportValue: (row) => metrics.get(row.id)?.monthlyRequired == null ? "" : formatCurrency(metrics.get(row.id)?.monthlyRequired ?? 0), sortable: true, width: 145, align: "right" },
    { key: "feasibility", label: "Wykonalność", value: (row) => t(FEASIBILITY_LABELS[metrics.get(row.id)?.feasibility ?? "unknown"]), render: (row) => { const feasibility = metrics.get(row.id)?.feasibility ?? "unknown"; return <div className="flex items-center gap-1.5"><ModuleBadge size="sm" tone={FEASIBILITY_TONES[feasibility]}>{t(FEASIBILITY_LABELS[feasibility])}</ModuleBadge><HelpBadge tone="info" help={FEASIBILITY_HELP} /></div>; }, sortable: true, filterable: true, width: 180 },
    { key: "priority", label: "Priorytet", value: (row) => t(PRIORITY_LABELS[row.priority]), render: (row) => <ModuleBadge size="sm" tone={row.priority === "high" ? "warning" : "neutral"}>{t(PRIORITY_LABELS[row.priority])}</ModuleBadge>, sortable: true, filterable: true, width: 125, edit: { type: "select", value: (row) => row.priority, options: Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label: t(label) })), update: (row, value) => ({ ...row, priority: value as GoalPriority }) } },
    { key: "status", label: "Status", value: (row) => t(STATUS_LABELS[row.status]), render: (row) => <ModuleBadge size="sm" tone={row.status === "active" ? "info" : row.status === "completed" ? "success" : "neutral"}>{t(STATUS_LABELS[row.status])}</ModuleBadge>, sortable: true, filterable: true, filterOptions: Object.values(STATUS_LABELS).map(t), width: 140, edit: { type: "select", value: (row) => row.status, options: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label: t(label) })), update: (row, value) => ({ ...row, status: value as GoalStatus }) } },
  ], [analysisGoalsById, metrics, t]);

  const saveGoal = async (draft: FinancialGoalDraft) => {
    if (!editor) return;
    setSaving(true);
    try {
      if (editor.id == null) await apiClient.post("/financial-goals", goalPayload(draft));
      else await apiClient.put(`/financial-goals/${editor.id}`, goalPayload(draft));
      const refreshed = await fetchData();
      setEditor(null);
      showToast(refreshed ? (editor.id == null ? "Dodano cel." : "Zapisano cel.") : "Cel zapisano, ale nie wszystkie dane widoku udało się odświeżyć.", refreshed ? "success" : "warning");
    } catch (caught) { showToast(apiErrorMessage(caught, "Nie udało się zapisać celu."), "error"); }
    finally { setSaving(false); }
  };
  const saveInlineGoal = async (goal: FinancialGoal) => {
    try {
      await apiClient.put(`/financial-goals/${goal.id}`, goalPayload(draftFromGoal(goal)));
      const refreshed = await fetchData();
      showToast(refreshed ? "Zapisano cel." : "Cel zapisano, ale nie wszystkie dane widoku udało się odświeżyć.", refreshed ? "success" : "warning");
    } catch (caught) {
      throw new Error(apiErrorMessage(caught, "Nie udało się zapisać celu."));
    }
  };
  const removeGoal = async () => {
    if (!deleteGoal) return;
    try {
      await apiClient.delete(`/financial-goals/${deleteGoal.id}`);
      const refreshed = await fetchData();
      setDeleteGoal(null);
      showToast(refreshed ? "Usunięto cel." : "Cel usunięto, ale nie wszystkie dane widoku udało się odświeżyć.", refreshed ? "success" : "warning");
    } catch (caught) { showToast(apiErrorMessage(caught, "Nie udało się usunąć celu."), "error"); }
  };
  const savePlanningSettings = async () => {
    if (!planningDraft || !strategyDraft) return;
    const settingsError = validateGoalSettings(planningDraft);
    const strategyError = validateNewFundsStrategy(strategyDraft, goalsForAnalysis, debts, activeAccounts);
    if (settingsError || strategyError) {
      showToast(settingsError ?? strategyError ?? "Sprawdź ustawienia planowania.", "error");
      return;
    }
    setSaving(true);
    try {
      await apiClient.put("/financial-goal-settings/1/planning", {
        settings: goalSettingsPayload(planningDraft),
        strategy: newFundsStrategyPayload(strategyDraft),
      });
      setSettings(planningDraft);
      setNewFundsStrategy(strategyDraft);
      setNewFundsStrategyOpen(false);
      showToast("Zapisano ustawienia planowania.", "success");
    } catch (caught) { showToast(apiErrorMessage(caught, "Nie udało się zapisać ustawień planowania."), "error"); }
    finally { setSaving(false); }
  };
  const createPrompt = () => {
    const summary = buildFinanceSummary({ accounts: activeAccounts, incomes, expenses, recurringIncomes: incomesStale, recurringExpenses: expensesStale });
    setPrompt(buildGoalsAiPrompt({ currency: getAppCurrency(), accounts: activeAccounts, incomes, expenses, recurringIncomes: incomesStale, recurringExpenses: expensesStale, debts, goals: goalsForAnalysis, settings, projection, summary }));
  };
  const copyPrompt = async () => {
    if (!prompt) return;
    try { await navigator.clipboard.writeText(prompt); showToast("Skopiowano analizę dla GPT.", "success"); }
    catch { showToast("Nie udało się skopiować tekstu. Zaznacz go ręcznie.", "error"); }
  };

  const goalResourcesLoaded = resourcesLoaded.goals && resourcesLoaded.settings && resourcesLoaded.debts;
  const initialDataLoaded = goalResourcesLoaded && accountsLoaded && incomesLoaded && expensesLoaded && incomesStaleLoaded && expensesStaleLoaded;
  const dependentDataError = accountsError ?? incomesError ?? expensesError ?? incomesStaleError ?? expensesStaleError;
  if (!goalResourcesLoaded && loadError && !loading) return <div role="alert" className="flex min-h-[430px] flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 p-6 text-center"><div className="font-semibold text-red-800">Nie można bezpiecznie wyświetlić modułu Celów</div><p className="max-w-xl text-sm text-red-700">{loadError}</p><button type="button" className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100" onClick={() => void fetchData()}>Spróbuj ponownie</button></div>;
  if (!initialDataLoaded) return <div role="status" className="flex min-h-[430px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-500"><RefreshCw size={18} className="animate-spin" aria-hidden="true" />Ładowanie danych Celów…</div>;
  if (dependentDataError) return <div role="alert" className="flex min-h-[430px] flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 p-6 text-center"><div className="font-semibold text-red-800">Nie można bezpiecznie wyliczyć Celów</div><p className="max-w-xl text-sm text-red-700">Część danych bazowych nie została pobrana: {dependentDataError} Zamiast pokazywać niepełną prognozę, moduł czeka na poprawne dane.</p><button type="button" className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500" onClick={() => void refreshAllGoalData()}>Spróbuj ponownie</button></div>;

  return <div className="min-w-0 space-y-5">
    {loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><span>{loadError} Widoczne wartości mogą być nieaktualne.</span><button type="button" disabled={loading} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-semibold hover:bg-amber-100 disabled:opacity-50" onClick={() => void fetchData()}>Ponów odświeżenie</button></div>}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4"><div className="text-sm font-semibold text-blue-700">Realna płynność</div><div className="mt-1 text-2xl font-bold text-slate-900">{formatCurrency(projection.liquidity.total)}</div><div className="mt-1 text-xs text-slate-600">Operacyjna {formatCurrency(projection.liquidity.operational)} · portfele {formatCurrency(projection.liquidity.virtualWallets)}</div></div>
      <div className="rounded-xl border border-violet-100 bg-violet-50 p-4"><div className="text-sm font-semibold text-violet-700">Finansowa podłoga</div><div className="mt-1 text-2xl font-bold text-slate-900">{formatCurrency(settings.financialFloor)}</div><div className="mt-1 text-xs text-slate-600">Reguła bezpieczeństwa, nie osobny cel</div></div>
      <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4"><div className="text-sm font-semibold text-emerald-700">Bezpieczna nadwyżka</div><div className="mt-1 text-2xl font-bold text-slate-900">{formatCurrency(projection.safeSurplus)}</div><div className="mt-1 text-xs text-slate-600">Ponad podłogą, planem dziennym i zaplanowanymi wydatkami</div></div>
      <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-sm font-semibold text-slate-600">Aktywne cele</div><div className="mt-1 text-2xl font-bold text-slate-900">{activeGoals}</div><div className="mt-1 text-xs text-slate-500">Potencjał odkładania / okres: {formatCurrency(projection.conservativeMonthlyCapacity)}</div>{settings.dailyLivingBudget > 0 && <div className="mt-1 text-xs text-slate-500">Plan dzienny: {formatCurrency(settings.dailyLivingBudget)} · bezpiecznie {formatCurrency(projection.safeDailyBudget)}</div>}</div>
    </div>

    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-bold text-slate-900">{t("Rekomendacja na teraz")}</h2><p className="text-sm text-slate-500">{t("Status poduszki i maksymalnie trzy sugestie, bez wykonywania operacji.")}</p></div><div className="flex gap-2"><button type="button" className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100" onClick={createPrompt}><Sparkles size={17} />Generuj analizę dla GPT</button></div></div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">{!hasCriticalLiquidityAlert && <div className={`rounded-lg border p-3 ${bufferStatus.complete ? "border-green-200 bg-green-50" : bufferStatus.achievedCount > 0 ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-slate-50"}`}><div className="flex items-start justify-between gap-3"><div><div className={`text-sm font-semibold ${bufferStatus.complete ? "text-green-700" : bufferStatus.achievedCount > 0 ? "text-blue-700" : "text-slate-600"}`}>Poduszka finansowa</div><div className="mt-1 text-xl font-bold text-slate-900">{bufferStatus.complete ? "Osiągnięta" : bufferStatus.achievedCount > 0 ? `Próg ${bufferStatus.achievedCount}` : "W budowie"}</div></div>{bufferStatus.achievedCount > 0 && <span className={`rounded-full p-1.5 text-white ${bufferStatus.complete ? "bg-green-600" : "bg-blue-600"}`}><CircleCheckBig size={22} strokeWidth={3} aria-hidden="true" /></span>}</div><div className="mt-1 text-xs text-slate-600">{bufferStatus.complete ? `Najwyższy próg: ${formatCurrency(bufferStatus.achievedThreshold)}` : bufferStatus.achievedThreshold !== null ? `Osiągnięto ${formatCurrency(bufferStatus.achievedThreshold)} · do progu ${bufferStatus.achievedCount + 1} brakuje ${formatCurrency(bufferStatus.missingToNext)}` : `Do progu 1 brakuje ${formatCurrency(bufferStatus.missingToNext)}`}</div></div>}{recommendations.map((item) => <div key={item.id} className={`rounded-lg border p-3 ${item.id === "cashflow-negative" ? "lg:col-span-4" : ""} ${item.tone === "danger" ? "border-red-200 bg-red-50" : item.tone === "warning" ? "border-orange-200 bg-orange-50" : item.tone === "success" ? "border-green-200 bg-green-50" : "border-blue-200 bg-blue-50"}`}><div className={`font-semibold ${item.tone === "danger" ? "text-red-800" : "text-slate-900"}`}>{t(item.title)}</div><p className="mt-1 text-sm text-slate-600">{t(item.message)}{item.amount != null && <> <strong>{formatCurrency(item.amount)}</strong></>}</p></div>)}</div>
    </section>

    <DataGrid gridId="manager-financial-goals" rows={goals} columns={columns} getRowId={(row) => row.id} loading={loading} emptyMessage="Brak celów. Dodaj pierwszy cel albo skorzystaj z propozycji." defaultFilters={{ status: t("Aktywny") }} defaultSort={{ key: "dueDate", direction: "asc" }} exportFileName="cele-finansowe.csv" actionsWidth={92} onInlineSave={saveInlineGoal} validateInlineRow={validateFinancialGoal} toolbar={<><HelpBadge tone="info" help="Prognozowany stan środków na koniec bieżącego okresu wypłatowego. Uwzględnia bieżącą płynność, planowane wydatki i tylko przychody oznaczone jako gwarantowane. Zrealizowane importy nie są liczone drugi raz.">Konserwatywnie: {formatCurrency(projection.conservativeEnd)}</HelpBadge><HelpBadge tone="warning" help="Prognozowany stan środków na koniec bieżącego okresu wypłatowego jak w wariancie konserwatywnym, ale z dodaniem przychodów oznaczonych jako oczekiwane. Przychody potencjalne nie są tutaj wliczane.">Z oczekiwanymi: {formatCurrency(projection.expectedEnd)}</HelpBadge><IconButton label="Dodaj cel" tone="primary" onClick={() => setEditor({ id: null, draft: emptyGoal() })}><Plus size={19} /></IconButton></>} refresh={{ onRefresh: refreshAllGoalData, refreshing: loading, label: "Odśwież cele i dane bazowe" }} actions={(row) => <><IconButton label={`Edytuj ${row.name}`} onClick={() => setEditor({ id: row.id, draft: draftFromGoal(row) })}><Pencil size={17} /></IconButton><IconButton label={`Usuń ${row.name}`} tone="danger" onClick={() => setDeleteGoal(row)}><Trash2 size={17} /></IconButton></>} />

    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="text-lg font-bold text-slate-900">Proponowane cele</h2><p className="mb-3 text-sm text-slate-500">Duże zaplanowane wydatki z najbliższych 60 dni. Nic nie jest tworzone automatycznie.</p>{proposedGoals.length ? <div className="space-y-2">{proposedGoals.map((proposal) => <div key={proposal.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"><div><div className="font-semibold text-slate-900">{proposal.title}</div><div className="text-sm text-slate-500">{proposal.reason} · {formatCurrency(proposal.draft.targetAmount)}</div></div><button type="button" className="shrink-0 rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50" onClick={() => setEditor({ id: null, draft: proposal.draft })}>Dodaj jako cel</button></div>)}</div> : <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">Brak dużych zaplanowanych wydatków wymagających osobnej sugestii.</p>}</section>
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold text-slate-900">Co zrobić z nowymi środkami?</h2><HelpBadge tone="info" help="Kalkulator nie wykonuje przelewów. Najpierw uzupełnia finansową podłogę i rezerwę na codzienne wydatki, a pozostałą kwotę dzieli według zapisanej strategii procentowej."><span className="sr-only">Jak działa?</span></HelpBadge></div><p className="text-sm text-slate-500">Kalkulator tworzy sugestię. Nie zmienia sald, celów ani zobowiązań.</p></div><button type="button" className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100" onClick={openPlanningSettings}><Settings2 size={17} />Konfiguruj podział</button></div>{newFundsStrategy === null && <div className="mb-3 rounded-lg border border-violet-100 bg-violet-50 px-3 py-2 text-xs text-violet-700">Używana jest automatyczna propozycja na podstawie aktywnych zobowiązań, celów, depozytów i aktualnego progu poduszki. Możesz ją zapisać lub zmienić w konfiguratorze.</div>}<label><span className="mb-1 block text-sm font-semibold">Mam dodatkowe</span><MoneyInput min={0} max={MAX_MONEY_AMOUNT} value={newFunds} onValueChange={setNewFunds} aria-invalid={Boolean(newFundsError)} className={`w-full rounded-lg border px-3 py-2.5 ${newFundsError ? "border-red-400" : "border-slate-300"}`} /></label>{newFundsError && <p className="mt-1 text-sm text-red-600">{newFundsError}</p>}{!newFundsError && numberInput(newFunds) > 0 && <div className="mt-3 space-y-2">{allocation.length ? allocation.map((line, index) => <div key={`${line.kind}-${line.goalId ?? line.debtId ?? line.accountId ?? index}`} className={`rounded-lg px-3 py-2 ${line.kind === "unassigned" ? "border border-orange-200 bg-orange-50" : line.kind === "floor" || line.kind === "living" ? "border border-blue-100 bg-blue-50" : "bg-slate-50"}`}><div className="flex items-center justify-between gap-3"><span className="text-sm text-slate-700">{t(line.label)}</span><div className="shrink-0 text-right"><strong>{formatCurrency(line.amount)}</strong>{line.effectiveShare != null && <div className="text-xs font-normal text-slate-500">{Math.round(line.effectiveShare)}% {t("całości")}</div>}</div></div>{line.note && <p className="mt-1 text-xs text-slate-500">{t(line.note)}</p>}</div>) : <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">Brak pozycji do wyliczenia. Otwórz konfigurator i dodaj własny podział.</div>}</div>}</section>
    </div>

    <Modal open={Boolean(editor)} onClose={() => { if (!saving) setEditor(null); }} title={editor?.id == null ? "Dodaj cel" : "Edytuj cel"} description="Cel nie wykonuje przelewów i nie zmienia salda depozytu." size="lg" footer={editor && <ModalFormActions saving={saving} onCancel={() => setEditor(null)} form="goal-form" submitLabel="Zapisz cel" />}>{editor && <GoalForm key={`${editor.id ?? "new"}-${editor.draft.name}`} initial={editor.draft} accounts={accounts} onSave={saveGoal} />}</Modal>
    <Modal open={newFundsStrategyOpen} onClose={() => { if (!saving) setNewFundsStrategyOpen(false); }} title={t("Ustawienia planowania")} description={t("Finansowa podłoga, budżet bieżący i strategia poduszki.")} size="xl" footer={<ModalFormActions saving={saving} onCancel={() => setNewFundsStrategyOpen(false)} form="planning-settings-form" submitLabel="Zapisz ustawienia" />}><form id="planning-settings-form" className="space-y-8" onSubmit={(event) => { event.preventDefault(); void savePlanningSettings(); }}><SettingsForm settings={planningDraft ?? settings} onChange={setPlanningDraft} /><section className="border-t border-slate-200 pt-6"><h3 className="mb-4 text-base font-bold text-slate-900">{t("Podział nowych środków")}</h3><NewFundsStrategyForm strategy={strategyDraft ?? effectiveNewFundsStrategy} settings={planningDraft ?? settings} realLiquidity={strategyStartLiquidity} goals={goalsForAnalysis} debts={debts} accounts={activeAccounts} onChange={setStrategyDraft} /></section></form></Modal>
    <Modal open={prompt !== null} onClose={() => setPrompt(null)} title="Analiza dla GPT" description="Anonimowy snapshot nie jest wysyłany z aplikacji. Skopiuj go i wklej do wybranego modelu." size="xl" footer={<div className="flex justify-end"><button type="button" className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 font-semibold text-white" onClick={() => void copyPrompt()}><ClipboardCopy size={18} />Kopiuj prompt</button></div>}><textarea readOnly className="h-[55vh] w-full resize-none rounded-lg border border-slate-300 bg-slate-50 p-4 font-mono text-sm leading-6" value={prompt ?? ""} /></Modal>
    <ConfirmModal open={deleteGoal !== null} title="Usuń cel" message={`Czy na pewno usunąć cel „${deleteGoal?.name ?? ""}”? Operacja nie zmieni salda powiązanego depozytu.`} onConfirm={() => void removeGoal()} onCancel={() => setDeleteGoal(null)} />
  </div>;
}
