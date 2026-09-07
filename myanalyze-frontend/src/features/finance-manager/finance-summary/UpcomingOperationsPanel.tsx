import React from "react";
import { AlertTriangle } from "lucide-react";
import { incomeCertaintyLabel } from "../../../types/incomeCertainty";
import { formatCurrency } from "../../../utils/formatters";
import type { UpcomingOperationDay } from "../financeSummary";

export default function UpcomingOperationsPanel({ days, range, onRangeChange }: { days: UpcomingOperationDay[]; range: "period" | "30-days"; onRangeChange: (range: "period" | "30-days") => void }) {
  const [expanded, setExpanded] = React.useState(false);
  React.useEffect(() => setExpanded(false), [range]);
  const visibleDays = expanded ? days : days.slice(0, 5);
  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="upcoming-operations-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="upcoming-operations-title" className="text-base font-bold text-slate-900">Najbliższe operacje</h2><p className="mt-0.5 text-xs text-slate-500">Prognoza po dniu uwzględnia budżet bieżący bez tworzenia dodatkowych wydatków.</p></div>
      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1" role="group" aria-label="Zakres najbliższych operacji">
        {([["period", "Do końca okresu"], ["30-days", "30 dni"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={range === value} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${range === value ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`} onClick={() => onRangeChange(value)}>{label}</button>)}
      </div>
    </div>
    {visibleDays.length === 0 ? <p className="mt-4 rounded-lg bg-slate-50 px-3 py-4 text-sm text-slate-500">Brak zaplanowanych operacji w wybranym zakresie.</p> : <div className="mt-4 divide-y divide-slate-100">
      {visibleDays.map((day) => <div key={day.date.toISOString()} className="grid gap-2 py-3 first:pt-0 sm:grid-cols-[100px_minmax(0,1fr)_210px] sm:items-start">
        <time className="text-sm font-semibold text-slate-700" dateTime={`${day.date.getFullYear()}-${String(day.date.getMonth() + 1).padStart(2, "0")}-${String(day.date.getDate()).padStart(2, "0")}`}>{day.date.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" })}</time>
        <div className="min-w-0 space-y-1.5">{day.operations.map((operation) => <div key={operation.id} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm"><span className="truncate font-medium text-slate-800">{operation.name}</span>{operation.source === "recurring" && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Stały</span>}{operation.kind === "income" && operation.source === "one-time" && operation.certainty && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${operation.certainty === "guaranteed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{incomeCertaintyLabel(operation.certainty)}</span>}<strong className={`ml-auto whitespace-nowrap ${operation.kind === "income" ? "text-emerald-700" : "text-rose-700"}`}>{operation.kind === "income" ? "+" : "−"}{formatCurrency(operation.amount)}</strong></div>)}</div>
        <div className="text-left sm:text-right"><div className="text-xs text-slate-500">Prognoza po dniu</div><strong className={`text-sm ${day.balanceAfterDay < 0 ? "text-red-700" : "text-slate-900"}`}>{formatCurrency(day.balanceAfterDay)}</strong>{day.belowFinancialFloor && <div className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><AlertTriangle size={14} aria-hidden="true" />Poniżej finansowej podłogi</div>}</div>
      </div>)}
    </div>}
    {days.length > 5 && <button type="button" className="mt-2 text-sm font-semibold text-blue-700 hover:text-blue-800" onClick={() => setExpanded((current) => !current)}>{expanded ? "Pokaż mniej" : `Pokaż wszystkie (${days.length})`}</button>}
  </section>;
}
