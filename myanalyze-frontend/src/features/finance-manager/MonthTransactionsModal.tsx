import DataGrid, { type DataGridColumn } from "../../components/DataGrid";
import Modal from "../../components/Modal";
import ModuleBadge from "../../components/ModuleBadge";
import type { TransactionModel } from "../../context/useTransactionResource";
import type { RecurringModel } from "../../context/useRecurringResource";
import type { IncomeCertainty } from "../../types/incomeCertainty";
import { incomeCertaintyLabel } from "../../types/incomeCertainty";
import { formatCurrency, formatDate } from "../../utils/formatters";
import { localDateKey } from "../../utils/validation";
import { isActualTransaction, isManualPlanEntry } from "./transactionSemantics";
import { parseFinancialDate, recurringOccurrences } from "./financialRangeAggregation";
import { formatMonthLabel } from "./monthViewModel";
import { signedTransactionAmount, transactionKindLabel } from "./transactionPresentation";
import { useUiText } from "../../i18n";

export type MonthBreakdownKind = "income" | "expense";
export type MonthBreakdownMode = "actual" | "planned" | "outstanding";

export interface MonthBreakdownRow {
  id: string;
  date: string;
  name: string;
  category: string;
  amount: number;
  source: "actual" | "one-time" | "recurring";
  certainty?: IncomeCertainty;
  kind?: MonthBreakdownKind;
  customTypeId?: number | null;
}

function monthRange(month: string): { start: Date; end: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return { start: new Date(0), end: new Date(0) };
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  return { start: new Date(year, monthIndex, 1), end: new Date(year, monthIndex + 1, 0) };
}

export function buildActualMonthBreakdown(month: string, kind: MonthBreakdownKind, rows: TransactionModel[], includeExcluded = false): MonthBreakdownRow[] {
  return rows
    .filter((row) => (includeExcluded ? row.zrealizowany : isActualTransaction(row)) && row.addedAt.slice(0, 7) === month)
    .map((row) => ({
      id: `actual-${kind}-${row.id}`,
      date: row.addedAt.slice(0, 10),
      name: row.name,
      category: row.customTypeName?.trim() || (row.customTypeId === undefined ? row.category || "Bez etykiety" : "Bez etykiety"),
      amount: Number(row.amount || 0),
      source: "actual" as const,
      kind,
      customTypeId: row.customTypeId,
      ...(kind === "income" ? { certainty: row.certainty } : {}),
    }));
}

export function buildPlannedMonthBreakdown(
  month: string,
  kind: MonthBreakdownKind,
  transactions: TransactionModel[],
  recurring: RecurringModel[],
): MonthBreakdownRow[] {
  const range = monthRange(month);
  const oneTime = transactions
    .filter((row) => {
      if (!isManualPlanEntry(row)) return false;
      const date = parseFinancialDate(row.addedAt);
      if (!date || row.addedAt.slice(0, 7) !== month) return false;
      if (kind === "income" && (row.certainty ?? "expected") === "potential") return false;
      return true;
    })
    .map((row) => ({
      id: `plan-${kind}-${row.id}`,
      date: row.addedAt.slice(0, 10),
      name: row.name,
      category: row.customTypeName?.trim() || (row.customTypeId === undefined ? row.category || "Bez etykiety" : "Bez etykiety"),
      amount: Number(row.amount || 0),
      source: "one-time" as const,
      ...(kind === "income" ? { certainty: row.certainty ?? "expected" } : {}),
    }));
  const recurringRows = recurring.flatMap((row) => recurringOccurrences(row, range).map((occurrence) => ({
    id: `recurring-${kind}-${row.id}-${localDateKey(occurrence)}`,
    date: localDateKey(occurrence),
    name: row.nazwa,
    category: row.custom_type_name?.trim() || (row.custom_type_id === undefined ? row.kategoria || "Bez etykiety" : "Bez etykiety"),
    amount: Number(row.kwota || 0),
    source: "recurring" as const,
    ...(kind === "income" ? { certainty: "guaranteed" as const } : {}),
  })));
  return [...oneTime, ...recurringRows];
}

const columns: DataGridColumn<MonthBreakdownRow>[] = [
  { key: "date", label: "Data", value: (row) => row.date, render: (row) => formatDate(row.date), sortable: true, width: 125 },
  { key: "name", label: "Nazwa", value: (row) => row.name, sortable: true, filterable: true, width: 300 },
  { key: "category", label: "Etykieta", value: (row) => row.category, sortable: true, filterable: true, width: 190 },
  { key: "source", label: "Źródło", value: (row) => row.source === "actual" ? "Wykonanie" : row.source === "recurring" ? "Stały" : "Jednorazowy", sortable: true, filterable: true, width: 135 },
  { key: "certainty", label: "Pewność", value: (row) => row.certainty ? incomeCertaintyLabel(row.certainty) : "-", sortable: true, filterable: true, width: 135, defaultVisible: false },
  { key: "amount", label: "Kwota", value: (row) => row.amount, render: (row) => formatCurrency(row.amount), sortable: true, width: 145, align: "right" },
];

export default function MonthTransactionsModal({
  open,
  month,
  kind,
  mode,
  rows,
  titleOverride,
  onClose,
}: {
  open: boolean;
  month: string;
  kind: MonthBreakdownKind | "all";
  mode: MonthBreakdownMode;
  rows: MonthBreakdownRow[];
  titleOverride?: string;
  onClose: () => void;
}) {
  const t = useUiText();
  const title = titleOverride ?? `${t(mode === "actual" ? "Wykonane" : mode === "outstanding" ? "Nierozliczone" : "Planowane")} ${t(kind === "all" ? "transakcje" : kind === "income" ? "przychody" : "wydatki")} - ${formatMonthLabel(month)}`;
  const total = rows.reduce((sum, row) => sum + (kind === "all" && row.kind ? signedTransactionAmount(row.kind, row.amount) : Number(row.amount || 0)), 0);
  const displayColumns: DataGridColumn<MonthBreakdownRow>[] = kind === "all" ? [
    { key: "kind", label: "Kierunek", value: (row) => row.kind ? transactionKindLabel(row.kind) : "-", filterable: true, sortable: true, width: 130 },
    ...columns.map((column) => column.key === "amount" ? { ...column, exportValue: (row: MonthBreakdownRow) => signedTransactionAmount(row.kind ?? "income", row.amount), render: (row: MonthBreakdownRow) => <span className={row.kind === "expense" ? "text-rose-700" : "text-emerald-700"}>{formatCurrency(signedTransactionAmount(row.kind ?? "income", row.amount))}</span> } : column),
  ] : columns;
  return <Modal open={open} onClose={onClose} title={title} size="xl">
    <DataGrid
      gridId={`manager-month-breakdown-${mode}-${kind}`}
      rows={rows}
      columns={displayColumns}
      getRowId={(row) => row.id}
      defaultPageSize={25}
      defaultSort={{ key: "date", direction: "desc" }}
      emptyMessage={`Brak ${mode === "actual" ? "wykonanych" : "planowanych"} ${kind === "all" ? "transakcji" : kind === "income" ? "przychodów" : "wydatków"} w tym miesiącu.`}
      exportFileName={`${mode === "actual" ? "wykonanie" : "plan"}-${month}-${kind}.csv`}
      toolbar={<ModuleBadge tone={kind === "all" ? (total < 0 ? "danger" : "success") : kind === "income" ? "success" : "danger"}>{kind === "all" ? "Wynik netto" : "Suma"}: {formatCurrency(total)}</ModuleBadge>}
    />
  </Modal>;
}
