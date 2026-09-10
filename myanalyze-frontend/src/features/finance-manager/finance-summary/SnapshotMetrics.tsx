import { useUiText } from "../../../i18n";
import { formatCurrency } from "../../../utils/formatters";
import type { PeriodSnapshot } from "./types";

function SnapshotDelta({ value, inverse = false }: { value: number; inverse?: boolean }) {
  const t = useUiText();
  if (Math.abs(value) < 0.01) return <span className="text-xs text-slate-400">{t("bez zmiany")}</span>;
  const favorable = inverse ? value < 0 : value > 0;
  return <span className={`text-xs font-semibold ${favorable ? "text-emerald-700" : "text-rose-700"}`}>{value > 0 ? "+" : "−"}{formatCurrency(Math.abs(value))} {value > 0 ? "↑" : "↓"}</span>;
}

export default function SnapshotMetrics({ snapshot, older, className = "mt-3" }: { snapshot: PeriodSnapshot; older?: PeriodSnapshot; className?: string }) {
  const t = useUiText();
  const metrics = [
    { label: "Płynność przy zapisie", value: snapshot.real_liquidity, olderValue: older?.real_liquidity, inverse: false },
    { label: "Dług konsumencki", value: snapshot.consumer_debt, olderValue: older?.consumer_debt, inverse: true },
    { label: "Kredyt hipoteczny", value: snapshot.mortgage_debt, olderValue: older?.mortgage_debt, inverse: true },
    { label: "Środki w celach", value: snapshot.goals_allocated, olderValue: older?.goals_allocated, inverse: false },
  ];
  return <div className={`${className} grid grid-cols-2 gap-3 lg:grid-cols-4`}>
    {metrics.map((metric) => {
      const delta = metric.olderValue == null ? null : metric.value - metric.olderValue;
      return <div key={metric.label} className="rounded-lg bg-slate-50 p-3">
        <div className="text-xs font-semibold text-slate-500">{t(metric.label)}</div>
        <div className="mt-1 font-bold text-slate-900">{formatCurrency(metric.value)}</div>
        {delta !== null && <div className="mt-1"><SnapshotDelta value={delta} inverse={metric.inverse} /></div>}
      </div>;
    })}
  </div>;
}
