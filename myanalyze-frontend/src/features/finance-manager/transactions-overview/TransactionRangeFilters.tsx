interface DateRangeFiltersProps {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onClear?: () => void;
}

export function TransactionDateRangeFilters({ dateFrom, dateTo, onDateFromChange, onDateToChange, onClear }: DateRangeFiltersProps) {
  return <>
    <label className="text-xs font-semibold text-slate-600">Od<input type="date" className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal" value={dateFrom} onChange={(event) => onDateFromChange(event.target.value)} /></label>
    <label className="text-xs font-semibold text-slate-600">Do<input type="date" className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal" value={dateTo} onChange={(event) => onDateToChange(event.target.value)} /></label>
    {onClear && (dateFrom || dateTo) && <button type="button" className="rounded-lg px-2 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100" onClick={onClear}>Wyczyść daty</button>}
  </>;
}

interface AmountRangeFiltersProps {
  amountFrom: string;
  amountTo: string;
  onAmountFromChange: (value: string) => void;
  onAmountToChange: (value: string) => void;
}

export function TransactionAmountRangeFilters({ amountFrom, amountTo, onAmountFromChange, onAmountToChange }: AmountRangeFiltersProps) {
  return <>
    <label className="text-xs font-semibold text-slate-600">Kwota od<input type="number" min="0" step="0.01" inputMode="decimal" className="mt-1 block w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal" value={amountFrom} onChange={(event) => onAmountFromChange(event.target.value)} /></label>
    <label className="text-xs font-semibold text-slate-600">Kwota do<input type="number" min="0" step="0.01" inputMode="decimal" className="mt-1 block w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal" value={amountTo} onChange={(event) => onAmountToChange(event.target.value)} /></label>
  </>;
}
