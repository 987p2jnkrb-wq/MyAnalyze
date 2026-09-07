import type { TransactionsSubTab } from "./types";

export default function TransactionsOverviewTabs({ active, reviewCount, rejectedCount, linkedCount, onChange }: { active: TransactionsSubTab; reviewCount: number; rejectedCount: number; linkedCount: number; onChange: (tab: TransactionsSubTab) => void }) {
  const tabClass = (tab: TransactionsSubTab) => `rounded-md px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${active === tab ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`;
  return <div role="tablist" aria-label="Widok transakcji" className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
    <button type="button" role="tab" aria-selected={active === "all"} className={tabClass("all")} onClick={() => onChange("all")}>Wszystkie</button>
    <button type="button" role="tab" aria-selected={active === "review"} className={tabClass("review")} onClick={() => onChange("review")}>Do sprawdzenia{reviewCount ? ` (${reviewCount})` : ""}</button>
    <button type="button" role="tab" aria-selected={active === "rejected"} className={tabClass("rejected")} onClick={() => onChange("rejected")}>Odrzucone{rejectedCount ? ` (${rejectedCount})` : ""}</button>
    <button type="button" role="tab" aria-selected={active === "linked"} className={tabClass("linked")} onClick={() => onChange("linked")}>Powiązane{linkedCount ? ` (${linkedCount})` : ""}</button>
  </div>;
}
