import ModuleBadge from "../../../components/ModuleBadge";
import { formatDateTime } from "../../../utils/formatters";
import type { PeriodSnapshot } from "./types";
import SnapshotMetrics from "./SnapshotMetrics";

export default function SnapshotStatePanel({ snapshot }: { snapshot: PeriodSnapshot | undefined }) {
  if (!snapshot) return <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><strong>Brak zapisanego stanu okresu.</strong><p className="mt-1">Przychody i wydatki odtworzono z datowanych wpisów. Historyczna płynność, zadłużenie i stan Celów nie są wyliczane z dzisiejszych wartości.</p></section>;
  const floorSecured = snapshot.real_liquidity >= snapshot.financial_floor;
  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-bold text-slate-900">Zapisany stan okresu</h2><p className="text-xs text-slate-500">Zapisano {formatDateTime(snapshot.captured_at)}</p></div><ModuleBadge size="sm" tone={floorSecured ? "success" : "danger"}>{floorSecured ? "Podłoga zabezpieczona" : "Poniżej finansowej podłogi"}</ModuleBadge></div><SnapshotMetrics snapshot={snapshot} /></section>;
}
