import type { RecurringModel } from "../../context/useRecurringResource";
import { formatCurrency } from "../../utils/formatters";

export type RecurringExpenseChoice = "create" | string;

export default function RecurringExpenseLinkFields({
  enabled,
  choice,
  expenses,
  onEnabledChange,
  onChoiceChange,
}: {
  enabled: boolean;
  choice: RecurringExpenseChoice;
  expenses: RecurringModel[];
  onEnabledChange: (enabled: boolean) => void;
  onChoiceChange: (choice: RecurringExpenseChoice) => void;
}) {
  return <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
        checked={enabled}
        onChange={(event) => onEnabledChange(event.target.checked)}
      />
      <span>
        <span className="block font-semibold text-slate-800">Uwzględnij ratę jako wydatek stały</span>
        <span className="mt-0.5 block text-sm text-slate-500">Dzięki temu rata będzie widoczna w planowanych wydatkach okresu.</span>
      </span>
    </label>
    {enabled && <label className="mt-3 block">
      <span className="mb-1 block text-sm font-semibold text-slate-700">Sposób powiązania</span>
      <select className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2" value={choice} onChange={(event) => onChoiceChange(event.target.value)}>
        <option value="create">Utwórz nowy z danych raty</option>
        {expenses.map((expense) => <option key={expense.id} value={String(expense.id)}>{expense.nazwa} · {formatCurrency(expense.kwota)}</option>)}
      </select>
      <span className="mt-1 block text-xs text-slate-500">Usunięcie wydatku tylko odłączy go od produktu. Usunięcie produktu usunie aktualnie powiązany wydatek.</span>
    </label>}
  </div>;
}
