import type { FinanceSummaryView } from "./types";

export default function FinanceSummaryTabs({ active, onChange }: { active: FinanceSummaryView; onChange: (view: FinanceSummaryView) => void }) {
  const className = (view: FinanceSummaryView) => `rounded-md px-4 py-2 text-sm font-semibold ${active === view ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`;
  return <div role="tablist" aria-label="Rodzaj podsumowania" className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
    <button type="button" role="tab" aria-selected={active === "general"} className={className("general")} onClick={() => onChange("general")}>Ogólne</button>
    <button type="button" role="tab" aria-selected={active === "period"} className={className("period")} onClick={() => onChange("period")}>Okres</button>
    <button type="button" role="tab" aria-selected={active === "month"} className={className("month")} onClick={() => onChange("month")}>Miesiąc</button>
    <button type="button" role="tab" aria-selected={active === "history"} className={className("history")} onClick={() => onChange("history")}>Historia</button>
  </div>;
}
