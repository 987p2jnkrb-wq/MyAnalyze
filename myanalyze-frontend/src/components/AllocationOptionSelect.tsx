import { formatCurrency } from "../utils/formatters";
import type { AllocationOption } from "./accountAllocationOptions";

export default function AllocationOptionSelect({ label, placeholder, options, value, onChange, amountLabel = "saldo", autoFocus = false }: {
  label: string;
  placeholder: string;
  options: AllocationOption[];
  value: number | null;
  onChange: (value: number | null) => void;
  amountLabel?: string;
  autoFocus?: boolean;
}) {
  return <label className="block">
    <span className="mb-1 block text-sm font-semibold text-slate-800">{label}</span>
    <select autoFocus={autoFocus} required className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2" value={value ?? ""} onChange={(event) => onChange(Number(event.target.value) || null)}>
      <option value="">{placeholder}</option>
      {options.map((option) => {
        const displayedAmount = option.displayAmount ?? option.availableAmount;
        return <option key={option.id} value={option.id}>{option.label}{displayedAmount !== undefined ? ` — ${amountLabel} ${formatCurrency(displayedAmount)}` : ""}</option>;
      })}
    </select>
  </label>;
}
