import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import apiClient from "../../../utils/apiClient";
import DecimalInput from "../../../components/DecimalInput";
import MoneyInput from "../../../components/MoneyInput";
import PercentageInput from "../../../components/PercentageInput";
import { calculateInstallmentProgress, CREDIT_PRODUCT_TYPES, suggestedDebt, usesCalculatedDebt, type CreditProductType } from "../creditProductModel";
import { loanPayload, type EditableLoan, type Loan, validateLoan, withCalculatedLoanDates, withCalculatedLoanDebt } from "./loanModel";
import { formatDate } from "../../../utils/formatters";
import { localDateKey } from "../../../utils/validation";
import { parseRequiredNumber } from "../../../utils/numbers";
import { useExpenseStaleContext } from "../../../context/ExpenseStaleContext";
import RecurringExpenseLinkFields from "../RecurringExpenseLinkFields";

interface LoanFormProps { loan?: Loan; onSuccess: () => void; onCancel?: () => void; }
type LoanFormFieldKey = {
  [K in keyof EditableLoan]-?: Exclude<EditableLoan[K], null | undefined> extends string | number ? K : never;
}[keyof EditableLoan];

interface FieldDefinition {
  key: LoanFormFieldKey; label: string; type: "text" | "number" | "date";
  min?: number; max?: number; step?: number; wide?: boolean; unit?: "currency" | "percent";
}

const today = () => localDateKey();
const LOAN_FORM_TYPES = CREDIT_PRODUCT_TYPES.filter((type) => type !== "Karta kredytowa" && type !== "Plan ratalny");
const initialDraft: EditableLoan = {
  nazwa: "", typ: "Kredyt", kwota_kapitalu: 0, kwota_calkowita: 0, kwota_raty: 0, ilosc_rat: 12,
  data_rozpoczecia: "", data_do: "", data_dodania: today(), rrso: 0, dzien_splaty: 1,
  oprocentowanie: 0, prowizja: 0, ubezpieczenie: 0,
};
const basicFieldsTop: FieldDefinition[] = [
  { key: "nazwa", label: "Nazwa kredytu", type: "text", wide: true },
  { key: "kwota_kapitalu", label: "Kwota kapitału", type: "number", min: 1, step: 0.01, unit: "currency" },
  { key: "kwota_raty", label: "Kwota raty", type: "number", min: 0.01, step: 0.01, unit: "currency" },
];
const scheduleFields: FieldDefinition[] = [
  { key: "dzien_splaty", label: "Dzień spłaty", type: "number", min: 1, max: 31, step: 1 },
  { key: "data_rozpoczecia", label: "Data rozpoczęcia", type: "date" },
];
const basicFieldsBottom: FieldDefinition[] = [
  { key: "kwota_calkowita", label: "Zadłużenie", type: "number", min: 1, step: 0.01, unit: "currency" },
  { key: "data_do", label: "Data do", type: "date" },
];
const costFields: FieldDefinition[] = [
  { key: "rrso", label: "RRSO", type: "number", min: 0, step: 0.01, unit: "percent" },
  { key: "oprocentowanie", label: "Oprocentowanie", type: "number", min: 0, step: 0.01, unit: "percent" },
  { key: "prowizja", label: "Prowizja", type: "number", min: 0, step: 0.01, unit: "currency" },
  { key: "ubezpieczenie", label: "Ubezpieczenie", type: "number", min: 0, step: 0.01, unit: "currency" },
];

function withFinancialSuggestions(loan: EditableLoan, overwriteCalculatedDebt: boolean, overwriteCapital: boolean): EditableLoan {
  const updated = withCalculatedLoanDebt(loan);
  const suggestion = suggestedDebt(updated.kwota_raty, updated.ilosc_rat);
  if (suggestion === null) return updated;
  return {
    ...updated,
    ...(overwriteCalculatedDebt && usesCalculatedDebt(updated.typ) ? { kwota_calkowita: suggestion } : {}),
    ...(overwriteCapital ? { kwota_kapitalu: suggestion } : {}),
  };
}

const LoanForm: React.FC<LoanFormProps> = ({ loan, onSuccess, onCancel }) => {
  const [draft, setDraft] = useState<EditableLoan>(() => loan ? { ...loan, data_dodania: loan.data_dodania ?? today() } : initialDraft);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [debtManuallyEdited, setDebtManuallyEdited] = useState(Boolean(loan));
  const [capitalManuallyEdited, setCapitalManuallyEdited] = useState(Boolean(loan && Number(loan.kwota_kapitalu) > 0));
  const [totalInstallments, setTotalInstallments] = useState<number>(() => Number(loan?.ilosc_rat ?? initialDraft.ilosc_rat));
  const [remainingManuallyEdited, setRemainingManuallyEdited] = useState(Boolean(loan));
  const { expensesStale, fetchExpensesStale } = useExpenseStaleContext();
  const recurringExpenses = useMemo(() => expensesStale, [expensesStale]);
  const [includeRecurringExpense, setIncludeRecurringExpense] = useState(() => loan ? loan.recurring_expense_id != null : true);
  const [recurringExpenseChoice, setRecurringExpenseChoice] = useState(() => loan?.recurring_expense_id == null ? "create" : String(loan.recurring_expense_id));

  const installmentProgress = useMemo(() => calculateInstallmentProgress(
    draft.data_rozpoczecia?.slice(0, 10) ?? "",
    Number.isInteger(totalInstallments) ? totalInstallments : null,
    draft.dzien_splaty,
  ), [draft.data_rozpoczecia, draft.dzien_splaty, totalInstallments]);

  useEffect(() => {
    if (loan || remainingManuallyEdited) return;
    const suggestedRemaining = installmentProgress?.remaining ?? totalInstallments;
    setDraft((current) => {
      const updated = withFinancialSuggestions({ ...current, ilosc_rat: suggestedRemaining }, !debtManuallyEdited, !capitalManuallyEdited);
      return withCalculatedLoanDates(updated);
    });
  }, [capitalManuallyEdited, debtManuallyEdited, installmentProgress, loan, remainingManuallyEdited, totalInstallments]);

  const updateField = (field: FieldDefinition, value: string) => {
    if (field.key === "kwota_calkowita") setDebtManuallyEdited(true);
    if (field.key === "kwota_kapitalu") {
      setCapitalManuallyEdited(true);
      if (/kapita/i.test(error)) setError("");
    }
    setDraft((current) => {
      const shouldRefreshSuggestion = !debtManuallyEdited && (field.key === "kwota_raty" || field.key === "ilosc_rat");
      const shouldRefreshCapital = !capitalManuallyEdited && (field.key === "kwota_raty" || field.key === "ilosc_rat");
      const updated = withFinancialSuggestions({ ...current, [field.key]: field.type === "number" ? (value === "" ? null : parseRequiredNumber(value)) : value }, shouldRefreshSuggestion, shouldRefreshCapital);
      return field.key === "data_rozpoczecia" || field.key === "ilosc_rat" || field.key === "dzien_splaty" ? withCalculatedLoanDates(updated) : updated;
    });
  };
  const capitalFieldInvalid = /kapita/i.test(error);
  const renderFields = (fields: FieldDefinition[]) => fields.map((field) => (
    <label key={field.key} className={field.wide ? "md:col-span-2" : ""}>
      <span className={`mb-1.5 block text-sm font-semibold ${field.key === "kwota_kapitalu" && capitalFieldInvalid ? "text-red-700" : "text-slate-700"}`}>{field.label}</span>
      <div className="relative">
        {field.type === "number" && field.step !== 1
          ? field.unit === "currency" ? <MoneyInput
              value={draft[field.key] ?? ""}
              onValueChange={(value) => updateField(field, value.replace(",", "."))}
              min={field.min}
              max={field.max}
              disabled={field.key === "data_do"}
              aria-invalid={field.key === "kwota_kapitalu" && capitalFieldInvalid}
              className={`w-full rounded-lg border bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:ring-2 disabled:bg-slate-100 ${field.key === "kwota_kapitalu" && capitalFieldInvalid ? "border-red-500 focus:border-red-500 focus:ring-red-100" : "border-slate-300 focus:border-blue-500 focus:ring-blue-100"}`}
              required={!loan}
            /> : field.unit === "percent" ? <PercentageInput
              value={draft[field.key] ?? ""}
              onValueChange={(value) => updateField(field, value.replace(",", "."))}
              min={field.min}
              max={field.max}
              disabled={field.key === "data_do"}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
              required={!loan}
            /> : <DecimalInput
              value={draft[field.key] ?? ""}
              onValueChange={(value) => updateField(field, value.replace(",", "."))}
              min={field.min}
              max={field.max}
              disabled={field.key === "data_do"}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
              required={!loan}
            />
          : <input
              type={field.type}
              value={draft[field.key] ?? ""}
              onChange={(event) => updateField(field, event.target.value)}
              min={field.min}
              max={field.max}
              step={field.step}
              disabled={field.key === "data_do"}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
              required={!loan}
            />}
      </div>
    </label>
  ));

  const updateRemainingInstallments = (value: string, manual = true) => {
    if (manual) setRemainingManuallyEdited(true);
    const count = value === "" ? null : Number(value);
    setDraft((current) => {
      const updated = withFinancialSuggestions({ ...current, ilosc_rat: count }, !debtManuallyEdited, !capitalManuallyEdited);
      return withCalculatedLoanDates(updated);
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationError = validateLoan(draft);
    if (validationError) { setError(validationError); return; }
    setLoading(true); setError("");
    try {
      const recurringSelection = includeRecurringExpense
        ? recurringExpenseChoice === "create"
          ? { recurring_expense_mode: "create", recurring_expense_id: null }
          : { recurring_expense_mode: "link", recurring_expense_id: Number(recurringExpenseChoice) }
        : { recurring_expense_mode: "none", recurring_expense_id: null };
      if (loan) await apiClient.put(`/loans/${loan.id}`, { ...loanPayload(draft), ...recurringSelection });
      else await apiClient.post("/loans", { ...loanPayload(draft), ...recurringSelection });
      await fetchExpensesStale();
      onSuccess();
    } catch (caught: unknown) {
      const message = axios.isAxiosError<{ error?: string }>(caught) ? caught.response?.data?.error : undefined;
      setError(message || `Nie udało się ${loan ? "zapisać" : "dodać"} kredytu.`);
    } finally { setLoading(false); }
  };

  return <form onSubmit={handleSubmit} className="space-y-6">
    <fieldset>
      <legend className="mb-3 text-base font-bold text-slate-900">Podstawowe dane</legend>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="md:col-span-2">
          <span className="mb-1.5 block text-sm font-semibold text-slate-700">Typ</span>
          <select className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5" value={draft.typ} onChange={(event) => setDraft((current) => withCalculatedLoanDebt({ ...current, typ: event.target.value as CreditProductType }))}>
            {LOAN_FORM_TYPES.map((type) => <option key={type}>{type}</option>)}
          </select>
        </label>
        {renderFields(basicFieldsTop)}
        {renderFields(scheduleFields)}
        {!loan && <label>
          <span className="mb-1.5 block text-sm font-semibold text-slate-700">Łączna liczba rat</span>
          <input required type="number" min={1} step={1} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5" value={totalInstallments} onChange={(event) => { setTotalInstallments(Number(event.target.value)); setRemainingManuallyEdited(false); }} />
        </label>}
        <label>
          <span className="mb-1.5 block text-sm font-semibold text-slate-700">Pozostała liczba rat</span>
          <input required type="number" min={1} step={1} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5" value={draft.ilosc_rat ?? ""} onChange={(event) => updateRemainingInstallments(event.target.value)} />
        </label>
        {renderFields(basicFieldsBottom)}
      </div>
      {!loan && installmentProgress && <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
        <div className="font-semibold">Z harmonogramu: minęło {installmentProgress.elapsed}, pozostało {installmentProgress.remaining} rat.</div>
        <div className="mt-0.5">Najbliższa rata: {installmentProgress.nextDueDate ? formatDate(installmentProgress.nextDueDate) : "brak — harmonogram jest zakończony"}. Planowany koniec: {formatDate(draft.data_do)}.</div>
        {remainingManuallyEdited && <button type="button" className="mt-1 font-semibold text-blue-700 hover:underline" onClick={() => { setRemainingManuallyEdited(false); updateRemainingInstallments(String(installmentProgress.remaining), false); }}>Przywróć podpowiedź: {installmentProgress.remaining}</button>}
      </div>}
      {loan && installmentProgress && installmentProgress.elapsed > 0 && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <div>Jeśli zapisane {totalInstallments} oznacza łączną liczbę rat, z dat wynika: minęło {installmentProgress.elapsed}, pozostało {installmentProgress.remaining}.</div>
        {installmentProgress.remaining > 0
          ? <button type="button" className="mt-1 font-semibold text-amber-800 hover:underline" onClick={() => updateRemainingInstallments(String(installmentProgress.remaining))}>Ustaw {installmentProgress.remaining} jako pozostałą liczbę rat</button>
          : <div className="mt-1 font-semibold">Według tych danych harmonogram jest już zakończony.</div>}
      </div>}
      <p className="mt-2 text-sm text-slate-500">Data zakończenia jest liczona od najbliższej niezapłaconej raty. Liczbę pozostałych rat możesz poprawić.</p>
      {usesCalculatedDebt(draft.typ) && <p className="mt-1 text-sm text-slate-500">Podpowiadamy aktualne zadłużenie jako pozostała liczba rat × kwota raty. Kwotę możesz poprawić ręcznie.</p>}
      <p className="mt-1 text-sm text-slate-500">Kwotę kapitału podpowiadamy jako pozostała liczba rat × kwota raty. To wartość orientacyjna, ponieważ rata może zawierać odsetki — możesz ją poprawić ręcznie.</p>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <RecurringExpenseLinkFields enabled={includeRecurringExpense} choice={recurringExpenseChoice} expenses={recurringExpenses} onEnabledChange={setIncludeRecurringExpense} onChoiceChange={setRecurringExpenseChoice} />
      </div>
    </fieldset>
    <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <legend className="px-1 text-base font-bold text-slate-900">Koszty kredytu</legend>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{renderFields(costFields)}</div>
    </fieldset>
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
    <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
      {onCancel && <button type="button" className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50" onClick={onCancel}>Anuluj</button>}
      <button type="submit" className="rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60" disabled={loading}>{loading ? "Zapisywanie…" : loan ? "Zapisz zmiany" : "Dodaj kredyt"}</button>
    </div>
  </form>;
};

export default LoanForm;
