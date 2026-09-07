import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import DataGrid, { type DataGridColumn } from "../../components/DataGrid";
import ModuleBadge, { type ModuleBadgeTone } from "../../components/ModuleBadge";
import { useExpenseContext } from "../../context/useExpenseContext";
import { useIncomeContext } from "../../context/useIncomeContext";
import { useExpenseStaleContext } from "../../context/ExpenseStaleContext";
import { useIncomeStaleContext } from "../../context/IncomeStaleContext";
import { formatCurrency } from "../../utils/formatters";
import { localDateKey, roundMoney } from "../../utils/validation";
import { buildMonthSummary, currentMonthValue, shiftMonth, monthLabelKey, formatMonthLabel, type MonthLabelResult } from "./monthViewModel";
import MonthTransactionsModal, { buildActualMonthBreakdown, buildPlannedMonthBreakdown, type MonthBreakdownKind, type MonthBreakdownMode } from "./MonthTransactionsModal";
import { useAppPresentation, useUiText } from "../../i18n";

type DetailMode = "expenses" | "incomes" | "balance";

interface MonthDetailRow {
  id: string;
  label: string;
  planned: number;
  actual: number;
  difference: number;
  guaranteed: number;
  expected: number;
  potential: number;
}

const detailLabels: Record<DetailMode, string> = { expenses: "Wydatki", incomes: "Przychody", balance: "Bilans" };

function withMonthTotals<T>(columns: DataGridColumn<T>[]): DataGridColumn<T>[] {
  return columns.map((column) => ({
    ...column,
    summary: (rows) => {
      if (column.key === "label") return "Suma";
      const total = roundMoney(rows.reduce((sum, row) => sum + Number(column.value(row) || 0), 0));
      return <span className={column.key === "net" ? (total < 0 ? "text-rose-700" : "text-emerald-700") : "text-slate-700"}>{formatCurrency(total)}</span>;
    },
  }));
}

function differenceClass(mode: DetailMode, row: MonthDetailRow): string {
  if (mode === "expenses") return row.difference < 0 ? "text-red-600" : "text-emerald-700";
  return row.difference > 0 ? "text-amber-700" : "text-emerald-700";
}

export default function MonthViewGrid({ filteredIncomes, filteredExpenses, filteredRecurringIncomes, filteredRecurringExpenses }: { filteredIncomes?: ReturnType<typeof useIncomeContext>["incomes"]; filteredExpenses?: ReturnType<typeof useExpenseContext>["expenses"]; filteredRecurringIncomes?: ReturnType<typeof useIncomeStaleContext>["incomesStale"]; filteredRecurringExpenses?: ReturnType<typeof useExpenseStaleContext>["expensesStale"] }) {
  const t = useUiText();
  const { locale } = useAppPresentation();
  const { incomes: contextIncomes } = useIncomeContext();
  const { expenses: contextExpenses } = useExpenseContext();
  const incomes = filteredIncomes ?? contextIncomes;
  const expenses = filteredExpenses ?? contextExpenses;
  const { incomesStale: contextIncomesStale } = useIncomeStaleContext();
  const { expensesStale: contextExpensesStale } = useExpenseStaleContext();
  const incomesStale = filteredRecurringIncomes ?? contextIncomesStale;
  const expensesStale = filteredRecurringExpenses ?? contextExpensesStale;
  const [month, setMonth] = React.useState(currentMonthValue);
  const [detailMode, setDetailMode] = React.useState<DetailMode>("balance");
  const [transactionDetail, setTransactionDetail] = React.useState<{ kind: MonthBreakdownKind | "all"; mode: MonthBreakdownMode; labelKey?: string; label?: string } | null>(null);
  const monthOptions = React.useMemo(() => Array.from({ length: 12 }, (_, index) => {
    const label = new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(2020, index, 1));
    return { value: String(index + 1).padStart(2, "0"), label: label.charAt(0).toLocaleUpperCase(locale) + label.slice(1) };
  }), [locale]);
  const changeMonthPart = (year: string, monthNumber: string) => {
    if (/^\d{4}$/.test(year) && /^(0[1-9]|1[0-2])$/.test(monthNumber)) setMonth(`${year}-${monthNumber}`);
  };
  const summary = React.useMemo(() => buildMonthSummary({ month, incomes, expenses, recurringIncomes: incomesStale, recurringExpenses: expensesStale, allocationIncomes: contextIncomes, allocationExpenses: contextExpenses }), [expenses, expensesStale, incomes, incomesStale, month, contextIncomes, contextExpenses]);
  const transactionDetailRows = React.useMemo(() => {
    if (!transactionDetail) return [];
    if (transactionDetail.mode === "outstanding") return summary.outstandingOperations
      .filter((row) => transactionDetail.kind === "all" || row.kind === transactionDetail.kind)
      .filter((row) => !transactionDetail.labelKey || monthLabelKey(row.customTypeId, row.label) === transactionDetail.labelKey)
      .map((row) => ({ id: row.id, date: localDateKey(row.date), name: row.name, category: row.label, amount: row.amount, source: row.source, certainty: row.certainty, kind: row.kind }));
    if (transactionDetail.mode === "actual") {
      const actualRows = [
        ...(transactionDetail.kind !== "expense" ? buildActualMonthBreakdown(month, "income", incomes) : []),
        ...(transactionDetail.kind !== "income" ? buildActualMonthBreakdown(month, "expense", expenses) : []),
      ];
      return transactionDetail.labelKey ? actualRows.filter((row) => monthLabelKey(row.customTypeId, row.category) === transactionDetail.labelKey) : actualRows;
    }
    const transactions = transactionDetail.kind === "income" ? incomes : expenses;
    const recurring = transactionDetail.kind === "income" ? incomesStale : expensesStale;
    return buildPlannedMonthBreakdown(month, transactionDetail.kind === "income" ? "income" : "expense", transactions, recurring);
  }, [expenses, expensesStale, incomes, incomesStale, month, transactionDetail, summary]);
  const openTransactionDetail = (event: React.MouseEvent | React.KeyboardEvent, kind: MonthBreakdownKind, mode: MonthBreakdownMode) => {
    event.preventDefault();
    event.stopPropagation();
    setTransactionDetail({ kind, mode });
  };

  const labelColumns = React.useMemo<DataGridColumn<MonthLabelResult>[]>(() => {
    const outstandingColumn = (key: "remainingIncome" | "remainingExpenses", label: string, kind: MonthBreakdownKind): DataGridColumn<MonthLabelResult> => ({
      key, label, value: (row) => row[key], sortable: true, width: 180, align: "right",
      render: (row) => row[key] > 0
        ? <button type="button" className={`font-semibold underline decoration-dotted underline-offset-4 hover:decoration-solid ${kind === "expense" ? "text-rose-700" : "text-emerald-700"}`} aria-label={`${label}: ${row.label}`} onClick={() => setTransactionDetail({ kind, mode: "outstanding", labelKey: row.id, label: row.label })}>{formatCurrency(row[key])}</button>
        : formatCurrency(row[key]),
    });
    const actualColumn = (key: "income" | "expenses" | "net", label: string, kind: MonthBreakdownKind | "all"): DataGridColumn<MonthLabelResult> => ({
      key, label, value: (row) => row[key], sortable: true, width: 160, align: "right",
      render: (row) => <button type="button" className={`font-semibold underline decoration-dotted underline-offset-4 hover:decoration-solid ${key === "net" ? (row.net < 0 ? "text-rose-700" : "text-emerald-700") : "text-slate-700"}`} aria-label={`${label}: ${row.label}`} onClick={() => setTransactionDetail({ kind, mode: "actual", labelKey: row.id, label: row.label })}>{formatCurrency(row[key])}</button>,
    });
    return withMonthTotals<MonthLabelResult>([
      { key: "label", label: "Etykieta", value: (row) => row.label, sortable: true, filterable: true, width: 210 },
      actualColumn("income", "Przychody wykonane", "income"),
      actualColumn("expenses", "Wydatki wykonane", "expense"),
      actualColumn("net", "Wynik netto", "all"),
      outstandingColumn("remainingIncome", "Przychody do realizacji", "income"),
      outstandingColumn("remainingExpenses", "Wydatki do realizacji", "expense"),
      { key: "forecast", label: "Wynik po realizacji planu", value: (row) => row.forecast, render: (row) => <strong className={row.forecast < 0 ? "text-rose-700" : "text-emerald-700"}>{formatCurrency(row.forecast)}</strong>, sortable: true, width: 190, align: "right" },
    ]);
  }, []);

  const rows = React.useMemo<MonthDetailRow[]>(() => {
    if (detailMode === "expenses") return summary.expenseCategories.map((row) => ({ id: row.category, label: row.category, planned: row.planned, actual: row.actual, difference: row.remaining, guaranteed: 0, expected: 0, potential: 0 }));
    return summary.incomeCategories.map((row) => ({ id: row.category, label: row.category, planned: row.planned, actual: row.actual, difference: row.remaining, guaranteed: row.guaranteed, expected: row.expected, potential: row.potential }));
  }, [detailMode, summary]);

  const columns = React.useMemo<DataGridColumn<MonthDetailRow>[]>(() => withMonthTotals<MonthDetailRow>([
    { key: "label", label: detailMode === "expenses" ? "Etykieta wydatku" : "Etykieta przychodu", value: (row) => row.label, sortable: true, filterable: true, width: 240, hideable: false },
    ...(detailMode === "incomes" ? [
      { key: "guaranteed", label: "Pewne", value: (row: MonthDetailRow) => row.guaranteed, render: (row: MonthDetailRow) => formatCurrency(row.guaranteed), exportValue: (row: MonthDetailRow) => formatCurrency(row.guaranteed), sortable: true, width: 140, align: "right" as const },
      { key: "expected", label: "Oczekiwane", value: (row: MonthDetailRow) => row.expected, render: (row: MonthDetailRow) => formatCurrency(row.expected), exportValue: (row: MonthDetailRow) => formatCurrency(row.expected), sortable: true, width: 145, align: "right" as const },
      { key: "potential", label: "Potencjalne", value: (row: MonthDetailRow) => row.potential, render: (row: MonthDetailRow) => formatCurrency(row.potential), exportValue: (row: MonthDetailRow) => formatCurrency(row.potential), sortable: true, width: 145, align: "right" as const },
    ] : [{ key: "planned", label: "Plan", value: (row: MonthDetailRow) => row.planned, render: (row: MonthDetailRow) => formatCurrency(row.planned), exportValue: (row: MonthDetailRow) => formatCurrency(row.planned), sortable: true, width: 155, align: "right" as const }]),
    { key: "actual", label: "Wykonanie", value: (row) => row.actual, render: (row) => formatCurrency(row.actual), exportValue: (row) => formatCurrency(row.actual), sortable: true, width: 155, align: "right" },
    { key: "difference", label: "Plan − wykonanie", value: (row) => row.difference, render: (row) => <strong className={differenceClass(detailMode, row)}>{formatCurrency(row.difference)}</strong>, exportValue: (row) => formatCurrency(row.difference), sortable: true, width: 165, align: "right" },
  ]), [detailMode]);

  const cardClass = (mode: DetailMode, colors: string) => `w-full rounded-xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${colors} ${detailMode === mode ? "ring-2 ring-blue-500 ring-offset-2" : "hover:-translate-y-0.5 hover:shadow-md"}`;
  const remaining = detailMode === "expenses"
    ? summary.plannedExpenses - summary.actualExpenses
    : detailMode === "incomes"
      ? summary.plannedIncome - summary.actualIncome
      : summary.actualBalance - summary.plannedBalance;
  const remainingLabel = "Plan − wykonanie";
  const remainingTone: ModuleBadgeTone = detailMode === "expenses"
    ? (remaining < 0 ? "danger" : "success")
    : detailMode === "incomes"
      ? (remaining > 0 ? "warning" : "success")
      : (remaining < 0 ? "danger" : "success");

  return <div className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <button type="button" aria-label="Poprzedni miesiąc" title="Poprzedni miesiąc" className="rounded-lg border border-slate-300 p-2 text-slate-700 hover:bg-slate-100" onClick={() => setMonth((current) => shiftMonth(current, -1))}><ChevronLeft size={20} aria-hidden="true" /></button>
      <div className="flex min-w-0 flex-1 justify-center gap-2">
        <select aria-label={t("Miesiąc")} value={month.slice(5, 7)} onChange={(event) => changeMonthPart(month.slice(0, 4), event.target.value)} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm">
          {monthOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <input aria-label={t("Rok")} type="number" min={1900} max={2100} step={1} value={month.slice(0, 4)} onChange={(event) => changeMonthPart(event.target.value, month.slice(5, 7))} className="w-24 rounded border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <button type="button" aria-label="Następny miesiąc" title="Następny miesiąc" className="rounded-lg border border-slate-300 p-2 text-slate-700 hover:bg-slate-100" onClick={() => setMonth((current) => shiftMonth(current, 1))}><ChevronRight size={20} aria-hidden="true" /></button>
    </div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {([{ mode: "incomes", kind: "income", label: "Przychody", amount: summary.actualIncome }, { mode: "expenses", kind: "expense", label: "Wydatki", amount: summary.actualExpenses }] as const).map(card => <div key={card.kind} className={cardClass(card.mode, card.kind === "income" ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50")}>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">{card.label} · wykonanie</span>
        <button type="button" aria-label={`Pokaż wykonane ${card.label.toLowerCase()}: ${formatCurrency(card.amount)}`} title="Pokaż transakcje składające się na tę kwotę" className="mt-1 block w-fit rounded text-2xl font-bold text-slate-900 underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:outline-blue-600" onClick={event => openTransactionDetail(event, card.kind, "actual")}>{formatCurrency(card.amount)}</button>
        <span className="mt-1 block text-[11px] text-slate-600">Bez transferów własnych i ręcznie wyłączonych</span>
        <button type="button" aria-label={`${card.label} · wykonanie - pokaż etykiety`} aria-pressed={detailMode === card.mode} className="mt-2 rounded text-xs font-semibold text-blue-800 hover:underline focus-visible:outline-blue-600" onClick={() => setDetailMode(card.mode)}>Pokaż etykiety →</button>
      </div>)}
      <button type="button" aria-pressed={detailMode === "balance"} className={`${cardClass("balance", "border-blue-200 bg-blue-50")} col-span-2 lg:col-span-1`} onClick={() => setDetailMode("balance")}> 
        <span className="text-xs font-semibold uppercase tracking-wide text-blue-700">Wynik miesiąca · wykonanie</span><strong className={`mt-1 block text-2xl ${summary.actualBalance < 0 ? "text-red-700" : "text-blue-900"}`}>{formatCurrency(summary.actualBalance)}</strong><span className="block text-xs text-blue-700">Przychody wykonane − wydatki wykonane</span><span className="mt-2 block text-xs font-semibold text-blue-800">Pokaż wynik według etykiet →</span>
      </button>
    </div>

    <p className="text-xs text-slate-600">Wynik miesiąca pokazuje, o ile przychody przewyższają wydatki w wybranym miesiącu. Salda pieniędzy na kontach znajdziesz w Depozytach. Filtry konta i etykiet zawężają prezentowane kwoty.</p>
    <section aria-label="Prognoza miesiąca" className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div><p className="text-sm text-slate-600">Przychody do realizacji</p><button type="button" aria-label="Pokaż nierozliczone przychody" className="text-xl font-bold text-emerald-700 underline decoration-dotted underline-offset-4 hover:decoration-solid" onClick={() => setTransactionDetail({ kind: "income", mode: "outstanding" })}>{formatCurrency(summary.remainingIncome)}</button></div>
        <div><p className="text-sm text-slate-600">Wydatki do realizacji</p><button type="button" aria-label="Pokaż nierozliczone wydatki" className="text-xl font-bold text-rose-700 underline decoration-dotted underline-offset-4 hover:decoration-solid" onClick={() => setTransactionDetail({ kind: "expense", mode: "outstanding" })}>{formatCurrency(summary.remainingExpenses)}</button></div>
        <div><p className="text-sm text-slate-600">Wynik po realizacji planu miesiąca</p><strong className={`text-xl ${summary.forecastBalance < 0 ? "text-rose-700" : "text-blue-800"}`}>{formatCurrency(summary.forecastBalance)}</strong></div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">Prognoza = wykonanie + nierozliczone przychody − nierozliczone wydatki tego miesiąca, również zaległe. Uwzględnia przychody pewne i oczekiwane. Nie przewiduje niezaplanowanych operacji i nie jest saldem konta. Import przypisz do planu, aby nie oczekiwać go ponownie.</p>
    </section>

    {detailMode === "balance" ? <DataGrid<MonthLabelResult>
      gridId="manager-month-label-results"
      rows={summary.labelResults}
      columns={labelColumns}
      getRowId={(row) => row.id}
      defaultSort={{ key: "expenses", direction: "desc" }}
      defaultPageSize={10}
      emptyMessage="Brak wykonania i nierozliczonych planów w tym miesiącu."
      exportFileName={`wynik-etykiety-${month}.csv`}
      toolbar={<div className="flex flex-wrap items-center gap-3"><ModuleBadge tone="info">Wynik według etykiet</ModuleBadge><button type="button" className="text-sm font-semibold text-blue-700 hover:underline" onClick={() => setTransactionDetail({ kind: "all", mode: "actual" })}>Wszystkie wykonane transakcje</button><span className="text-xs text-slate-500">Kliknij kwotę, aby zobaczyć operacje. Bez transferów własnych i ręcznie wyłączonych.</span></div>}
    /> : <DataGrid
      key={`manager-month-${detailMode}`}
      gridId={`manager-month-${detailMode}`}
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      emptyMessage="Brak operacji w tym miesiącu."
      defaultSort={{ key: "actual", direction: "desc" }}
      exportFileName={`budzet-${month}-${detailMode}.csv`}
      showFooter
      toolbar={<><ModuleBadge tone="info">Widok: {detailLabels[detailMode]}</ModuleBadge>{detailMode === "incomes" && <ModuleBadge tone="success">Plan: pewne + oczekiwane</ModuleBadge>}<ModuleBadge tone={remainingTone}>{remainingLabel}: {formatCurrency(remaining)}</ModuleBadge></>}
    />}
    {transactionDetail && <MonthTransactionsModal
      open
      month={month}
      kind={transactionDetail.kind}
      mode={transactionDetail.mode}
      rows={transactionDetailRows}
      titleOverride={transactionDetail.label ? `${t(transactionDetail.label)} - ${t(transactionDetail.mode === "outstanding" ? "Nierozliczone" : "Wykonane").toLocaleLowerCase(locale)} ${t(transactionDetail.kind === "all" ? "transakcje" : transactionDetail.kind === "income" ? "przychody" : "wydatki")} - ${formatMonthLabel(month)}` : undefined}
      onClose={() => setTransactionDetail(null)}
    />}
  </div>;
}
