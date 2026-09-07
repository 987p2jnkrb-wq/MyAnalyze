import React from "react";
import { ArrowRightLeft, ChartPie, Download, HandCoins, Landmark, Target, TrendingDown, TrendingUp } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import ModulePage from "../../components/ModulePage";
import { RecurringExpenseGrid, RecurringIncomeGrid } from "./RecurringEntriesGrid";
import { ExpenseGrid, IncomeGrid } from "./TransactionsGrid";
import TransactionsOverviewGrid from "./TransactionsOverviewGrid";
import AccountsGrid from "./AccountsGrid";
import FinanceSummaryGrid, { type FinanceSummaryView } from "./FinanceSummaryGrid";
import DebtPlansGrid from "./DebtPlansGrid";
import LoansPage from "./Loans/LoansPage";
import { DataGridSelectionScope } from "../../components/DataGrid";
import { activeStatusLabel } from "../../components/data-grid/ActiveStatus";
import { csvCell } from "../../components/data-grid/model";
import apiClient from "../../utils/apiClient";
import { accountTypeLabel, displayedActualBalance, parseAccount } from "../../utils/accountModel";
import { effectiveDebtPlanDebt, normalizeDebtPlan } from "./debtPlanModel";
import { useToast } from "../../context/ToastContext";
import { getAppCurrency } from "../../utils/appSettings";
import GoalsPage from "./Goals";

const managerTabs = [
  { id: "accounts", label: "Depozyty", icon: Landmark },
  { id: "transactions", label: "Transakcje", icon: ArrowRightLeft },
  { id: "incomes", label: "Przychody", icon: TrendingUp },
  { id: "expenses", label: "Wydatki", icon: TrendingDown },
  { id: "debt-plans", label: "Zobowiązania", icon: HandCoins },
  { id: "credits", label: "Kredyty", icon: Landmark },
  { id: "goals", label: "Cele", icon: Target },
  { id: "summary", label: "Podsumowanie", icon: ChartPie },
] as const;

type ManagerTab = typeof managerTabs[number]["id"];
const ACTIVE_TAB_KEY = "myanalyze.finance-manager.active-tab";

function isManagerTab(value: string | null): value is ManagerTab {
  return managerTabs.some((tab) => tab.id === value);
}

type EntryView = "current" | "recurring";

const exportHeaders = ["Sekcja", "Nazwa", "Typ / etykieta", "Kwota / zadłużenie", "Saldo dostępne", "Saldo rzeczywiste", "Data", "Data do", "Pozostałe raty", "Status", "Waluta"];
const moneyValue = (value: unknown) => Number.isFinite(Number(value)) ? Number(value).toFixed(2).replace(".", ",") : "";
const records = (data: unknown): Record<string, unknown>[] => Array.isArray(data) ? data as Record<string, unknown>[] : [];
const isRealized = (value: unknown) => value === true || value === 1 || ["1", "true", "tak"].includes(String(value ?? "").trim().toLowerCase());

async function downloadFinanceCsv() {
  const currency = getAppCurrency();
  const [accountsResponse, recurringExpensesResponse, recurringIncomesResponse, expensesResponse, incomesResponse, debtPlansResponse] = await Promise.all([
    apiClient.get("/konta"), apiClient.get("/wydatki_stale"), apiClient.get("/przychody_stale"), apiClient.get("/wydatki"), apiClient.get("/przychody"), apiClient.get("/debt-plans"),
  ]);
  const rows: unknown[][] = [];
  for (const account of records(accountsResponse.data).map(parseAccount)) rows.push(["Konta", account.nazwa, accountTypeLabel(account.typ_depozytu), "", moneyValue(account.saldo_dostepne), moneyValue(displayedActualBalance(account)), "", "", "", "", currency]);
  for (const [section, response] of [["Wydatki stałe", recurringExpensesResponse], ["Przychody stałe", recurringIncomesResponse]] as const) {
    for (const row of records(response.data)) rows.push([section, row.nazwa, row.custom_type_name ?? "Bez etykiety", moneyValue(row.kwota), "", "", row.data_od, row.data_do, "", "Stałe", currency]);
  }
  for (const [section, response] of [["Wydatki zaplanowane", expensesResponse], ["Przychody zaplanowane", incomesResponse]] as const) {
    for (const row of records(response.data).filter((item) => !isRealized(item.zrealizowany))) rows.push([section, row.nazwa, row.custom_type_name ?? "Bez etykiety", moneyValue(row.kwota), "", "", row.data_dodania, "", "", "Zaplanowane", currency]);
  }
  const plans = records(debtPlansResponse.data).map(normalizeDebtPlan);
  for (const plan of plans) rows.push(["Zobowiązania", plan.produkt, plan.typ, moneyValue(effectiveDebtPlanDebt(plan, plans)), "", "", plan.data_od, plan.data_do, plan.ilosc_rat ?? "", activeStatusLabel(plan.active), currency]);

  const csv = [exportHeaders, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `myanalyze-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function mainTabFor(value: string | null): ManagerTab | null {
  if (isManagerTab(value)) return value;
  if (value === "recurring-incomes") return "incomes";
  if (value === "recurring-expenses") return "expenses";
  if (value === "month" || value === "history") return "summary";
  return null;
}

function EntryTabs({ label, value, onChange }: { label: string; value: EntryView; onChange: (value: EntryView) => void }) {
  return <div role="tablist" aria-label={label} className="mb-3 inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
    {([ ["current", "Bieżące"], ["recurring", "Stałe"] ] as const).map(([id, text]) => <button key={id} type="button" role="tab" aria-selected={value === id} className={`rounded-md px-4 py-2 text-sm font-semibold ${value === id ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`} onClick={() => onChange(id)}>{text}</button>)}
  </div>;
}

const FinanceManagerPage: React.FC = () => {
  const { showToast } = useToast();
  const [exporting, setExporting] = React.useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTabValue = searchParams.get("tab");
  const requestedTab = mainTabFor(requestedTabValue);
  const savedTabValue = localStorage.getItem(ACTIVE_TAB_KEY);
  const savedTab = mainTabFor(savedTabValue);
  const activeTab: ManagerTab = requestedTab ?? savedTab ?? "accounts";
  const requestedView = searchParams.get("view");
  const entryView: EntryView = requestedTabValue === "recurring-incomes" || requestedTabValue === "recurring-expenses" || requestedView === "recurring" ? "recurring" : "current";
  const summaryView: FinanceSummaryView = requestedTabValue === "month" || requestedView === "month" ? "month" : requestedTabValue === "history" || requestedView === "history" ? "history" : requestedView === "period" ? "period" : "general";
  const selectionView = activeTab === "summary" ? summaryView : activeTab === "incomes" || activeTab === "expenses" ? entryView : "main";

  const selectTab = (tab: ManagerTab) => {
    if (tab === activeTab && requestedTabValue === tab && !requestedView) return;
    localStorage.setItem(ACTIVE_TAB_KEY, tab);
    setSearchParams({ tab }, { replace: true });
  };

  const selectView = (view: EntryView | FinanceSummaryView) => setSearchParams({ tab: activeTab, view }, { replace: true });
  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try { await downloadFinanceCsv(); showToast("Pobrano zbiorczy eksport CSV.", "success"); }
    catch { showToast("Nie udało się przygotować eksportu CSV.", "error"); }
    finally { setExporting(false); }
  };

  return (
    <ModulePage title="Manager Finansów" maxWidth={1600} className="pb-8">
      <div className="mx-auto min-w-0 w-full">
        <nav aria-label="Sekcje Managera Finansów" className="mb-4 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
          <div className="flex min-w-max w-full items-center gap-1">
            <div role="tablist" className="flex items-center gap-1">{managerTabs.map((tab) => {
              const Icon = tab.icon;
              const active = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`manager-panel-${tab.id}`}
                  className={`inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors ${active ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
                  onClick={() => selectTab(tab.id)}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>{tab.label}</span>
                </button>
              );
            })}</div>
            <button type="button" disabled={exporting} className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50" onClick={() => void exportCsv()}>
              <Download size={18} aria-hidden="true" />
              <span>{exporting ? "Eksportowanie…" : "Pobierz CSV"}</span>
            </button>
          </div>
        </nav>

        <DataGridSelectionScope value={`${activeTab}:${selectionView}`}>
          <div className="min-h-[430px] min-w-0 [overflow-anchor:none]">
            <section id="manager-panel-accounts" role="tabpanel" hidden={activeTab !== "accounts"} className="min-w-0" aria-label="Depozyty">{activeTab === "accounts" && <AccountsGrid />}</section>
            <section id="manager-panel-transactions" role="tabpanel" hidden={activeTab !== "transactions"} className="min-w-0" aria-label="Transakcje">{activeTab === "transactions" && <TransactionsOverviewGrid />}</section>
            <section id="manager-panel-incomes" role="tabpanel" hidden={activeTab !== "incomes"} className="min-w-0" aria-label="Przychody">{activeTab === "incomes" && <><EntryTabs label="Rodzaj przychodów" value={entryView} onChange={selectView} />{entryView === "current" ? <IncomeGrid /> : <RecurringIncomeGrid />}</>}</section>
            <section id="manager-panel-expenses" role="tabpanel" hidden={activeTab !== "expenses"} className="min-w-0" aria-label="Wydatki">{activeTab === "expenses" && <><EntryTabs label="Rodzaj wydatków" value={entryView} onChange={selectView} />{entryView === "current" ? <ExpenseGrid /> : <RecurringExpenseGrid />}</>}</section>
            <section id="manager-panel-debt-plans" role="tabpanel" hidden={activeTab !== "debt-plans"} className="min-w-0" aria-label="Zobowiązania"><DebtPlansGrid active={activeTab === "debt-plans"} /></section>
            <section id="manager-panel-credits" role="tabpanel" hidden={activeTab !== "credits"} className="min-w-0" aria-label="Kredyty"><LoansPage embedded active={activeTab === "credits"} /></section>
            <section id="manager-panel-goals" role="tabpanel" hidden={activeTab !== "goals"} className="min-w-0" aria-label="Cele"><GoalsPage active={activeTab === "goals"} /></section>
            <section id="manager-panel-summary" role="tabpanel" hidden={activeTab !== "summary"} className="min-w-0" aria-label="Podsumowanie"><FinanceSummaryGrid view={summaryView} onViewChange={selectView} active={activeTab === "summary"} /></section>
          </div>
        </DataGridSelectionScope>
      </div>
    </ModulePage>
  );
};

export default FinanceManagerPage;
