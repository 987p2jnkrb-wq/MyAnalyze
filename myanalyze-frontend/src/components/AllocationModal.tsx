import React from "react";
import Modal from "./Modal";
import ModalFormActions from "./ModalFormActions";
import MoneyInput from "./MoneyInput";
import { formatCurrency } from "../utils/formatters";
import { parseRequiredNumber } from "../utils/numbers";
import AllocationOptionSelect from "./AllocationOptionSelect";
import type { AllocationOption } from "./accountAllocationOptions";
import { isValidDateOnly, localDateKey } from "../utils/validation";

interface AllocationModalProps {
  open: boolean;
  title: string;
  description?: string;
  sourceLabel: string;
  sourcePlaceholder: string;
  availabilityLabel?: string;
  options: AllocationOption[];
  maximumAmount: number;
  submitLabel: string;
  dateLabel?: string;
  defaultDate?: string;
  onClose: () => void;
  onSubmit: (sourceId: number, amount: number, date?: string) => Promise<void>;
}

export default function AllocationModal({ open, title, description, sourceLabel, sourcePlaceholder, availabilityLabel = "dostępne", options, maximumAmount, submitLabel, dateLabel, defaultDate, onClose, onSubmit }: AllocationModalProps) {
  const [sourceId, setSourceId] = React.useState<number | null>(null);
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(defaultDate ?? localDateKey());
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const selectedOption = options.find((option) => option.id === sourceId);
  const effectiveMaximum = Math.min(maximumAmount, selectedOption?.availableAmount ?? maximumAmount);

  React.useEffect(() => {
    if (!open) return;
    setSourceId(null);
    setAmount("");
    setDate(defaultDate ?? localDateKey());
    setError("");
    setSaving(false);
  }, [defaultDate, open, maximumAmount]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsedAmount = parseRequiredNumber(amount);
    if (!sourceId) { setError(`Wybierz: ${sourceLabel.toLowerCase()}.`); return; }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) { setError("Podaj kwotę większą od zera."); return; }
    if (dateLabel && !isValidDateOnly(date)) { setError("Podaj prawidłową datę realizacji."); return; }
    if (Math.round(parsedAmount * 100) > Math.round(effectiveMaximum * 100)) {
      setError(`Maksymalna kwota to ${formatCurrency(effectiveMaximum)}.`);
      return;
    }
    setError("");
    setSaving(true);
    try {
      if (dateLabel) await onSubmit(sourceId, parsedAmount, date);
      else await onSubmit(sourceId, parsedAmount);
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "Nie udało się zapisać operacji. Sprawdź dane i spróbuj ponownie.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={() => { if (!saving) onClose(); }} title={title} description={description} size="sm" footer={<ModalFormActions saving={saving} disabled={options.length === 0} onCancel={onClose} form="allocation-form" submitLabel={submitLabel} />}>
      <form id="allocation-form" className="space-y-4" onSubmit={(event) => void submit(event)}>
        <AllocationOptionSelect autoFocus label={sourceLabel} placeholder={sourcePlaceholder} options={options} value={sourceId} amountLabel={availabilityLabel} onChange={(value) => { setSourceId(value); setError(""); }} />
        <label className="block">
          <span className="mb-1 flex items-center justify-between gap-3 text-sm font-semibold text-slate-800"><span>Kwota realizacji</span><span className="font-normal text-slate-500">maks. {formatCurrency(effectiveMaximum)}</span></span>
          <MoneyInput required min={0.01} max={effectiveMaximum} autoComplete="off" className="w-full rounded-lg border border-slate-300 px-3 py-2" value={amount} onValueChange={(value) => { setAmount(value); setError(""); }} />
        </label>
        {dateLabel && <label className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-800">{dateLabel}</span>
          <input required type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2" value={date} onChange={(event) => { setDate(event.target.value); setError(""); }} />
        </label>}
        {options.length === 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Brak dostępnych pozycji do rozliczenia.</p>}
        {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
      </form>
    </Modal>
  );
}
