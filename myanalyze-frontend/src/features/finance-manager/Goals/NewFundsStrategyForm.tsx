import React from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import HelpBadge from "../../../components/HelpBadge";
import type { Account } from "../../../types/account";
import { isCreditAccount } from "../../../utils/accountModel";
import { useUiText } from "../../../i18n";
import {
  buildSuggestedNewFundsStrategy,
  getBufferAllocationRule,
  validateNewFundsStrategy,
  type FinancialGoal,
  type GoalDebt,
  type GoalSettings,
  type NewFundsStrategy,
  type NewFundsStrategyItem,
  type NewFundsStrategyKind,
} from "./goalsModel";

const KIND_LABELS: Record<NewFundsStrategyKind, string> = {
  debt: "Zobowiązanie",
  goal: "Cel",
  account: "Depozyt",
  buffer: "Poduszka finansowa",
};

let strategyRowSequence = 0;
function rowId(kind: NewFundsStrategyKind): string {
  strategyRowSequence += 1;
  return `${kind}-${Date.now()}-${strategyRowSequence}`;
}

function targetOptions(kind: NewFundsStrategyKind, goals: FinancialGoal[], debts: GoalDebt[], accounts: Account[]) {
  if (kind === "goal") return goals.filter((goal) => goal.status === "active" && goal.allocatedAmount < goal.targetAmount).map((goal) => ({ id: goal.id, label: goal.name }));
  if (kind === "debt") return debts.filter((debt) => debt.debt > 0).map((debt) => ({ id: debt.id, label: debt.name?.trim() || debt.type }));
  if (kind === "account") return accounts.filter((account) => account.active !== false && !isCreditAccount(account)).map((account) => ({ id: account.id, label: account.nazwa }));
  return [];
}

export default function NewFundsStrategyForm({
  strategy,
  settings,
  realLiquidity,
  goals,
  debts,
  accounts,
  onChange,
}: {
  strategy: NewFundsStrategy;
  settings: GoalSettings;
  realLiquidity: number;
  goals: FinancialGoal[];
  debts: GoalDebt[];
  accounts: Account[];
  onChange: (strategy: NewFundsStrategy) => void;
}) {
  const t = useUiText();
  const bufferRule = getBufferAllocationRule(realLiquidity, settings);
  const total = strategy.items.reduce((sum, item) => sum + Number(item.share || 0), 0);
  const validationError = validateNewFundsStrategy(strategy, goals, debts, accounts);

  const replaceItem = (id: string, updater: (item: NewFundsStrategyItem) => NewFundsStrategyItem) => {
    onChange({ ...strategy, items: strategy.items.map((item) => item.id === id ? updater(item) : item) });
  };

  const changeKind = (item: NewFundsStrategyItem, kind: NewFundsStrategyKind) => {
    const options = targetOptions(kind, goals, debts, accounts);
    replaceItem(item.id, (current) => ({ ...current, kind, targetId: kind === "buffer" ? null : options[0]?.id ?? null }));
  };

  const nextCandidate = React.useMemo(() => {
    const used = new Set(strategy.items.map((item) => `${item.kind}:${item.targetId ?? "buffer"}`));
    for (const kind of ["debt", "goal", "account"] as const) {
      const option = targetOptions(kind, goals, debts, accounts).find((candidate) => !used.has(`${kind}:${candidate.id}`));
      if (option) return { kind, targetId: option.id };
    }
    if (!used.has("buffer:buffer")) return { kind: "buffer" as const, targetId: null };
    return null;
  }, [accounts, debts, goals, strategy.items]);

  const addRow = () => {
    if (!nextCandidate) return;
    const missing = Math.max(0, Math.round(100 - total));
    onChange({ ...strategy, items: [...strategy.items, { id: rowId(nextCandidate.kind), kind: nextCandidate.kind, targetId: nextCandidate.targetId, share: missing > 0 ? missing : 10 }] });
  };

  const useSuggestion = () => onChange(buildSuggestedNewFundsStrategy(realLiquidity, settings, goals, debts, accounts));

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-900">{t("Suma udziałów")}: {Math.round(total)}%</span>
          <HelpBadge tone={total === 100 ? "success" : "warning"} help="Udziały w konfiguratorze opisują całą pulę, która zostaje po uzupełnieniu finansowej podłogi i rezerwy na codzienne wydatki. Suma musi wynosić dokładnie 100%.">{t(total === 100 ? "Gotowe" : "Wymaga korekty")}</HelpBadge>
        </div>
        <p className="mt-1 text-xs text-slate-600">To tylko symulacja. Zapis strategii nie zmienia żadnego salda, celu ani zobowiązania.</p>
      </div>
      <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50" onClick={useSuggestion}><RotateCcw size={16} />Podpowiedz z danych</button>
    </div>

    <div className="space-y-3">
      {strategy.items.map((item) => {
        const options = targetOptions(item.kind, goals, debts, accounts);
        const bufferEffective = item.kind === "buffer" ? Math.round(item.share * bufferRule.allocation) / 100 : null;
        return <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[180px_minmax(0,1fr)_130px_42px] md:items-end">
            <label><span className="mb-1 block text-xs font-semibold text-slate-600">{t("Przeznaczenie")}</span><select className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5" value={item.kind} onChange={(event) => changeKind(item, event.target.value as NewFundsStrategyKind)}>{Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
            {item.kind === "buffer"
              ? <div><span className="mb-1 block text-xs font-semibold text-slate-600">Aktywny próg poduszki</span><div className="flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{bufferRule.complete ? "Poduszka osiągnięta" : <>Próg {bufferRule.threshold?.toFixed(2)} · alokacja {bufferRule.allocation}%</>}<HelpBadge tone="info" help="Dla poduszki udział strategii jest mnożony przez alokację aktualnego progu. Przykład: 30% strategii × 70% alokacji progu = 21% puli po zabezpieczeniu podłogi i rezerwy. Niewykorzystana część albo kwota ponad brak do progu pozostaje do decyzji.">Jak liczę?</HelpBadge></div></div>
              : <label><span className="mb-1 block text-xs font-semibold text-slate-600">Konkretny cel</span><select className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5" value={item.targetId ?? ""} onChange={(event) => replaceItem(item.id, (current) => ({ ...current, targetId: event.target.value ? Number(event.target.value) : null }))}><option value="">Wybierz…</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>}
            <label><span className="mb-1 block text-xs font-semibold text-slate-600">Udział</span><div className="flex"><input type="number" min={1} max={100} step={1} className="min-w-0 flex-1 rounded-l-lg border border-slate-300 px-3 py-2.5 text-right" value={item.share} onChange={(event) => replaceItem(item.id, (current) => ({ ...current, share: Math.round(Number(event.target.value)) }))} /><span className="rounded-r-lg border border-l-0 border-slate-300 bg-slate-50 px-3 py-2.5">%</span></div></label>
            <button type="button" aria-label="Usuń pozycję" title="Usuń pozycję" className="flex h-[42px] w-[42px] items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50" onClick={() => onChange({ ...strategy, items: strategy.items.filter((candidate) => candidate.id !== item.id) })}><Trash2 size={17} /></button>
          </div>
          {item.kind === "buffer" && <p className="mt-2 text-xs text-slate-500">Maks. efektywnie teraz: <strong>{bufferEffective == null ? "-" : `${Math.round(bufferEffective)}%`}</strong> puli strategii{bufferRule.complete ? " - poduszka jest już powyżej najwyższego progu, więc ta część pozostanie do decyzji." : "."}</p>}
        </div>;
      })}
      {!strategy.items.length && <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-500">Brak pozycji. Dodaj własny podział albo użyj podpowiedzi.</div>}
    </div>

    <button type="button" disabled={!nextCandidate} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" onClick={addRow}><Plus size={16} />Dodaj pozycję</button>

    {validationError && <p className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">{t(validationError)}</p>}
  </div>;
}
