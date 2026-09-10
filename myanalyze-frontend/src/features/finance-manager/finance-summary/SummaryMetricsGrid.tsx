import type { ReactNode } from "react";
import DataGrid, { type DataGridColumn } from "../../../components/DataGrid";
import { formatCurrency } from "../../../utils/formatters";
import { getAppLocale } from "../../../utils/appSettings";
import { useUiText } from "../../../i18n";
import type { DailyBudgetAssessment } from "../financeSummary";
import type { SummaryMetric } from "./types";

const assessmentValueClass: Record<DailyBudgetAssessment["status"], string> = {
  unconfigured: "text-slate-900",
  insufficient: "text-red-700",
  tight: "text-amber-700",
  comfortable: "text-emerald-700",
};

function MetricLabel({ row }: { row: SummaryMetric }) {
  const t = useUiText();
  return <div className={row.sectionLabel ? "py-1" : undefined}>
    {row.sectionLabel && <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-blue-700">{t(row.sectionLabel)}</div>}
    <div>{t(row.label)}</div>
  </div>;
}

const columns: DataGridColumn<SummaryMetric>[] = [
  { key: "label", label: "Pozycja", value: (row) => row.label, render: (row) => <MetricLabel row={row} />, width: 300, hideable: false },
  { key: "value", label: "Wartość", value: (row) => row.value, render: (row) => {
    const assessment = row.dailyBudgetAssessment;
    const ratio = assessment?.ratio == null ? "" : ` · ${assessment.ratio.toLocaleString(getAppLocale(), { maximumFractionDigits: 1 })}× budżetu dziennego`;
    const status = assessment ? `${assessment.label}${ratio}` : undefined;
    return <strong title={status} aria-label={status ? `${formatCurrency(row.value)} - ${status}` : undefined} className={`text-base ${row.value < 0 ? "font-extrabold text-red-700" : assessment ? assessmentValueClass[assessment.status] : "text-slate-900"}`}>{formatCurrency(row.value)}{status && <span className="sr-only"> - {status}</span>}</strong>;
  }, exportValue: (row) => formatCurrency(row.value), width: 180, align: "right", hideable: false },
  { key: "calculation", label: "Sposób obliczenia", value: (row) => row.calculation, width: 420, defaultVisible: false },
];

interface SummaryMetricsGridProps {
  gridId: string;
  rows: SummaryMetric[];
  exportFileName: string;
  toolbar?: ReactNode;
}

export default function SummaryMetricsGrid({ gridId, rows, exportFileName, toolbar }: SummaryMetricsGridProps) {
  return <DataGrid<SummaryMetric>
    gridId={gridId}
    rows={rows}
    columns={columns}
    getRowId={(row) => row.id}
    exportFileName={exportFileName}
    showFooter={false}
    toolbar={toolbar}
  />;
}
