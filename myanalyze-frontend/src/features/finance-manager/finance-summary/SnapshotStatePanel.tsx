import ModuleBadge from "../../../components/ModuleBadge";
import { formatCurrency } from "../../../utils/formatters";
import type { PeriodSnapshot } from "./types";

export default function SnapshotStatePanel({ snapshot }: { snapshot: PeriodSnapshot | undefined }) {
  if (!snapshot) return <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><strong>Brak zapisanego stanu okresu.</strong><p className="mt-1">Przychody i wydatki odtworzono z datowanych wpisów. Historyczna płynność, zadłużenie i stan Celów nie są wyliczane z dzisiejszych wartości.</p></section>;
  const floorSecured = snapshot.real_liquidity >= snapshot.financial_floor;
  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-bold text-slate-900">Zapisany stan okresu</h2><p className="text-xs text-slate-500">Zapisano {new Date(snapshot.captured_at.replace(" ", "T")).toLocaleString("pl-PL")}</p></div><ModuleBadge size="sm" tone={floorSecured ? "success" : "danger"}>{floorSecured ? "Podłoga zabezpieczona" : "Poniżej finansowej podłogi"}</ModuleBadge></div><div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">{[["Płynność przy zapisie", snapshot.real_liquidity], ["Dług konsumencki", snapshot.consumer_debt], ["Kredyt hipoteczny", snapshot.mortgage_debt], ["Środki w celach", snapshot.goals_allocated]].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-slate-50 p-3"><div className="text-xs font-semibold text-slate-500">{String(label)}</div><div className="mt-1 font-bold text-slate-900">{formatCurrency(Number(value))}</div></div>)}</div></section>;
}
