import React from "react";
import type { Account } from "../../../types/account";
import { activeStatusLabel } from "../../../components/data-grid/ActiveStatus";
import { useUiText } from "../../../i18n";

export type LabelFilterMode = "include" | "exclude";

interface FinanceSummaryFiltersProps {
  accounts: Account[];
  accountFilter: string;
  customTypeFilters: number[];
  labelFilterMode: LabelFilterMode;
  customTypeOptions: Array<[number, string]>;
  onAccountFilterChange: (value: string) => void;
  onToggleCustomType: (id: number) => void;
  onClearCustomTypes: () => void;
  onLabelFilterModeChange: (mode: LabelFilterMode) => void;
  onClearAll: () => void;
}

export default function FinanceSummaryFilters({ accounts, accountFilter, customTypeFilters, labelFilterMode, customTypeOptions, onAccountFilterChange, onToggleCustomType, onClearCustomTypes, onLabelFilterModeChange, onClearAll }: FinanceSummaryFiltersProps) {
  const t = useUiText();
  const [labelMenuOpen, setLabelMenuOpen] = React.useState(false);
  const labelMenuRef = React.useRef<HTMLDivElement | null>(null);
  const labelFilterActive = customTypeFilters.length > 0;
  const classificationFilterActive = Boolean(accountFilter || labelFilterActive);

  React.useEffect(() => {
    if (!labelMenuOpen) return;
    const closeOutside = (event: PointerEvent) => { if (event.target instanceof Node && !labelMenuRef.current?.contains(event.target)) setLabelMenuOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setLabelMenuOpen(false); };
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside, true); document.removeEventListener("keydown", closeOnEscape); };
  }, [labelMenuOpen]);

  return <div className="flex flex-wrap items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
    <label className="text-sm font-semibold text-slate-700">{t("Konto")} <select className="ml-2 rounded border border-slate-300 bg-white px-2 py-1.5 font-normal" value={accountFilter} onChange={(event) => onAccountFilterChange(event.target.value)}><option value="">{t("Wszystkie aktywne")}</option>{accounts.map((account) => <option data-i18n-ignore="true" key={account.id} value={account.id}>{account.nazwa}{account.active === false ? ` (${t(activeStatusLabel(account.active)).toLocaleLowerCase()})` : ""}</option>)}</select></label>
    <div ref={labelMenuRef} className="relative">
      <button type="button" aria-expanded={labelMenuOpen} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setLabelMenuOpen((current) => !current)}>{t("Etykiety:")} {labelFilterActive ? `${t(labelFilterMode === "include" ? "wybrane" : "wykluczone")} ${customTypeFilters.length}` : t("wszystkie")}</button>
      {labelMenuOpen && <div className="absolute left-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
        <label className="block text-xs font-semibold text-slate-600">Tryb<select aria-label="Tryb filtra etykiet" className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal" value={labelFilterMode} onChange={(event) => onLabelFilterModeChange(event.target.value as LabelFilterMode)}><option value="include">Pokaż wybrane etykiety</option><option value="exclude">Pokaż wszystko poza wybranymi</option></select></label>
        <p className="mt-2 text-xs text-slate-500">Możesz zaznaczyć kilka etykiet. „Pokaż wybrane” działa jako LUB; „Pokaż wszystko poza” zostawia również transakcje bez etykiety i pozycje stałe.</p>
        <div className="mt-3 max-h-56 space-y-1 overflow-y-auto border-t border-slate-100 pt-2">{customTypeOptions.length ? customTypeOptions.map(([id, name]) => <label key={id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50"><input type="checkbox" checked={customTypeFilters.includes(id)} onChange={() => onToggleCustomType(id)} /><span data-i18n-ignore="true">{name}</span></label>) : <p className="px-2 py-2 text-sm text-slate-500">Brak etykiet w transakcjach.</p>}</div>
        {labelFilterActive && <button type="button" className="mt-2 text-sm font-semibold text-blue-700 hover:underline" onClick={onClearCustomTypes}>Wyczyść etykiety</button>}
      </div>}
    </div>
    {classificationFilterActive && <button type="button" className="px-2 py-1.5 text-sm font-semibold text-blue-700 hover:underline" onClick={onClearAll}>Wyczyść filtry</button>}
  </div>;
}
