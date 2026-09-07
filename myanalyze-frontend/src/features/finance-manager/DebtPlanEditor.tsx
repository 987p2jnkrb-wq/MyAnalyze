import React from "react";
import axios from "axios";
import MoneyInput from "../../components/MoneyInput";
import PercentageInput from "../../components/PercentageInput";
import Modal from "../../components/Modal";
import { useExpenseStaleContext } from "../../context/ExpenseStaleContext";
import { useAccountContext } from "../../context/useAccountContext";
import { useToast } from "../../context/ToastContext";
import apiClient from "../../utils/apiClient";
import { canLinkToCreditProduct, isCreditAccount } from "../../utils/accountModel";
import type { Account } from "../../types/account";
import { DEBT_PLAN_TYPES, type DebtPlan, type DebtPlanPayload, type DebtPlanType } from "./debtPlanModel";
import { calculateDebt, calculateInstallmentEndDate, calculateUsedCreditLimit, isCreditCardType, isInstallmentPlanType, optionalNumber, suggestedDebt, usesCalculatedDebt } from "./creditProductModel";
import { localDateKey, validateDateRange, validateIntegerRange, validateNonNegativeNumber } from "../../utils/validation";
import { parseRequiredNumber } from "../../utils/numbers";
import RecurringExpenseLinkFields from "./RecurringExpenseLinkFields";

type FormDraft = {
  produkt: string;
  typ: DebtPlanType;
  zadluzenie: number;
  rata_miesieczna: string;
  ilosc_rat: string;
  wolny_limit: string;
  limit_kredytowy: string;
  recurring_expense_id: string;
  data_od: string;
  data_do: string;
  dzien_miesiaca: number;
  linked_card_account_id: string;
  one_time_fee: string;
  repayment_account_id: string;
  kwota_kapitalu: string;
  rrso: string;
  oprocentowanie: string;
  prowizja: string;
  ubezpieczenie: string;
  active: boolean;
};

const today = () => localDateKey();
const initialDraft: FormDraft = { produkt: "", typ: "Kredyt", zadluzenie: 0, rata_miesieczna: "", ilosc_rat: "", wolny_limit: "", limit_kredytowy: "", recurring_expense_id: "", data_od: today(), data_do: "", dzien_miesiaca: 10, linked_card_account_id: "", one_time_fee: "", repayment_account_id: "", kwota_kapitalu: "", rrso: "", oprocentowanie: "", prowizja: "", ubezpieczenie: "", active: true };

const hasDetailedCreditCosts = (type: DebtPlanType) => type === "Kredyt" || type === "Kredyt hipoteczny";
const draftFromPlan = (plan?: DebtPlan): FormDraft => plan ? {
  produkt: plan.produkt, typ: plan.typ, zadluzenie: plan.zadluzenie,
  rata_miesieczna: plan.rata_miesieczna == null ? "" : String(plan.rata_miesieczna),
  ilosc_rat: plan.ilosc_rat == null ? "" : String(plan.ilosc_rat),
  wolny_limit: plan.wolny_limit == null ? "" : String(plan.wolny_limit),
  limit_kredytowy: plan.limit_kredytowy == null ? "" : String(plan.limit_kredytowy),
  recurring_expense_id: plan.recurring_expense_id == null ? "" : String(plan.recurring_expense_id),
  data_od: plan.data_od || (isCreditCardType(plan.typ) ? "" : today()), data_do: plan.data_do || "", dzien_miesiaca: plan.dzien_miesiaca || 10,
  linked_card_account_id: plan.linked_card_account_id == null ? "" : String(plan.linked_card_account_id),
  one_time_fee: String(plan.one_time_fee || ""),
  repayment_account_id: plan.repayment_account_id == null ? "" : String(plan.repayment_account_id),
  kwota_kapitalu: plan.kapital == null ? "" : String(plan.kapital), rrso: plan.rrso == null ? "" : String(plan.rrso),
  oprocentowanie: plan.oprocentowanie == null ? "" : String(plan.oprocentowanie), prowizja: plan.prowizja == null ? "" : String(plan.prowizja),
  ubezpieczenie: plan.ubezpieczenie == null ? "" : String(plan.ubezpieczenie), active: plan.active !== false,
} : initialDraft;

export function toDebtPlanPayload(draft: FormDraft | DebtPlan): DebtPlanPayload {
  const installment = optionalNumber(draft.rata_miesieczna);
  const installmentCount = optionalNumber(draft.ilosc_rat);
  const card = isCreditCardType(draft.typ);
  const installmentPlan = isInstallmentPlanType(draft.typ);
  const detailedCredit = hasDetailedCreditCosts(draft.typ);
  const calculatedEndDate = calculateInstallmentEndDate(draft.data_od || "", installmentCount, Number(draft.dzien_miesiaca));
  return {
    produkt: draft.produkt.trim(),
    typ: draft.typ,
    zadluzenie: calculateDebt(draft.typ, Number(draft.zadluzenie), installment, installmentCount),
    rata_miesieczna: card ? null : installment,
    ilosc_rat: card ? null : installmentCount,
    wolny_limit: card ? optionalNumber(draft.wolny_limit) : null,
    limit_kredytowy: card ? optionalNumber(draft.limit_kredytowy) : null,
    recurring_expense_id: card ? null : optionalNumber(draft.recurring_expense_id),
    linked_card_account_id: installmentPlan ? optionalNumber(draft.linked_card_account_id) : null,
    one_time_fee: installmentPlan ? (optionalNumber(draft.one_time_fee) ?? 0) : 0,
    repayment_account_id: card ? optionalNumber(draft.repayment_account_id) : null,
    kwota_kapitalu: detailedCredit ? optionalNumber("kwota_kapitalu" in draft ? draft.kwota_kapitalu : draft.kapital) : null,
    rrso: installmentPlan ? 0 : detailedCredit ? optionalNumber(draft.rrso) : null,
    oprocentowanie: installmentPlan ? 0 : card || detailedCredit ? optionalNumber(draft.oprocentowanie) : null,
    prowizja: installmentPlan ? (optionalNumber(draft.one_time_fee) ?? 0) : detailedCredit ? optionalNumber(draft.prowizja) : null,
    ubezpieczenie: detailedCredit ? optionalNumber(draft.ubezpieczenie) : null,
    data_od: draft.data_od || undefined,
    data_do: calculatedEndDate || draft.data_do || null,
    dzien_miesiaca: draft.dzien_miesiaca == null ? undefined : Number(draft.dzien_miesiaca),
    active: draft.active !== false,
  };
}

export function validateDebtPlanPayload(payload: DebtPlanPayload): string | null {
  if (!payload.produkt) return "Podaj nazwę produktu.";
  const debtError = validateNonNegativeNumber(payload.zadluzenie, "Zadłużenie");
  if (debtError) return debtError;
  if (payload.ilosc_rat !== null) {
    const installmentError = validateIntegerRange(payload.ilosc_rat, "Liczba rat", 0, Number.MAX_SAFE_INTEGER);
    if (installmentError) return installmentError;
  }
  for (const value of [payload.rata_miesieczna, payload.wolny_limit, payload.limit_kredytowy, payload.kwota_kapitalu, payload.rrso, payload.oprocentowanie, payload.prowizja, payload.ubezpieczenie]) {
    if (value != null && (!Number.isFinite(value) || value < 0)) return "Kwoty nie mogą być ujemne.";
  }
  if (isCreditCardType(payload.typ) && (payload.wolny_limit === null || payload.limit_kredytowy === null)) return "Podaj wolny limit i limit karty.";
  if (isInstallmentPlanType(payload.typ) && (!payload.linked_card_account_id || payload.zadluzenie <= 0 || !payload.rata_miesieczna || payload.rata_miesieczna <= 0 || !payload.ilosc_rat || payload.ilosc_rat <= 0)) return "Uzupełnij kartę, pozostałą kwotę, ratę i liczbę rat planu.";
  if (isInstallmentPlanType(payload.typ) && Number(payload.rata_miesieczna) > payload.zadluzenie) return "Rata nie może być większa od pozostałej kwoty planu.";
  if (Number(payload.one_time_fee || 0) < 0) return "Opłata jednorazowa nie może być ujemna.";
  if (payload.dzien_miesiaca !== undefined) {
    const dayError = validateIntegerRange(payload.dzien_miesiaca, "Dzień płatności", 1, 31);
    if (dayError) return dayError;
  }
  if (payload.data_od) {
    const dateError = validateDateRange(payload.data_od, payload.data_do);
    if (dateError) return dateError;
  }
  return null;
}

export function DebtPlanForm({ initial, formId = "debt-plan-form", recurringExpenses, creditCards, repaymentAccounts, onSave, onSavingChange }: { initial?: DebtPlan; formId?: string; recurringExpenses: ReturnType<typeof useExpenseStaleContext>["expensesStale"]; creditCards: Account[]; repaymentAccounts: Account[]; onSave: (payload: DebtPlanPayload) => Promise<void>; onSavingChange: (saving: boolean) => void }) {
  const [draft, setDraft] = React.useState<FormDraft>(() => draftFromPlan(initial));
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const savingRef = React.useRef(false);
  const [includeRecurringExpense, setIncludeRecurringExpense] = React.useState(() => initial ? initial.recurring_expense_id !== null : true);
  const [recurringExpenseChoice, setRecurringExpenseChoice] = React.useState(() => initial?.recurring_expense_id == null ? "create" : String(initial.recurring_expense_id));
  const [capitalManuallyEdited, setCapitalManuallyEdited] = React.useState(() => Number(initial?.kapital || 0) > 0);
  const update = <K extends keyof FormDraft>(key: K, value: FormDraft[K]) => {
    if (key === "kwota_kapitalu") setCapitalManuallyEdited(true);
    setDraft((current) => {
      let updated = { ...current, [key]: value };
      if (key === "rata_miesieczna" || key === "ilosc_rat") {
        const suggestion = suggestedDebt(optionalNumber(updated.rata_miesieczna), optionalNumber(updated.ilosc_rat));
        if (suggestion !== null) updated = {
          ...updated,
          ...(usesCalculatedDebt(updated.typ) ? { zadluzenie: suggestion } : {}),
          ...(hasDetailedCreditCosts(updated.typ) && !capitalManuallyEdited ? { kwota_kapitalu: String(suggestion) } : {}),
        };
      }
      if (key === "data_od" || key === "ilosc_rat" || key === "dzien_miesiaca") {
        const suggested = calculateInstallmentEndDate(updated.data_od, optionalNumber(updated.ilosc_rat), Number(updated.dzien_miesiaca));
        if (suggested) return { ...updated, data_do: suggested };
      }
      return updated;
    });
  };
  const selectType = (typ: DebtPlanType) => {
    setIncludeRecurringExpense(!isCreditCardType(typ));
    setRecurringExpenseChoice("create");
    setDraft((current) => ({
      ...current,
      typ,
      ...(isCreditCardType(typ)
        ? { rata_miesieczna: "", ilosc_rat: "", recurring_expense_id: "", data_od: "", data_do: "", linked_card_account_id: "", one_time_fee: "" }
        : isInstallmentPlanType(typ)
          ? { wolny_limit: "", limit_kredytowy: "", recurring_expense_id: "" }
          : { wolny_limit: "", limit_kredytowy: "", linked_card_account_id: "", one_time_fee: "" }),
    }));
  };
  const selectExpense = (value: string) => {
    setRecurringExpenseChoice(value);
    const expense = recurringExpenses.find((item) => String(item.id) === value);
    setDraft((current) => ({ ...current, recurring_expense_id: expense ? value : "", produkt: expense?.nazwa ?? current.produkt, rata_miesieczna: expense ? String(expense.kwota) : current.rata_miesieczna }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    const basePayload = toDebtPlanPayload(draft);
    const payload: DebtPlanPayload = isCreditCardType(draft.typ)
      ? { ...basePayload, recurring_expense_mode: "none", recurring_expense_id: null }
      : includeRecurringExpense
        ? recurringExpenseChoice === "create"
          ? { ...basePayload, recurring_expense_mode: "create", recurring_expense_id: null }
          : { ...basePayload, recurring_expense_mode: "link", recurring_expense_id: Number(recurringExpenseChoice) }
        : { ...basePayload, recurring_expense_mode: "none", recurring_expense_id: null };
    const validation = validateDebtPlanPayload(payload);
    if (validation) return setError(validation);
    if (!isCreditCardType(draft.typ) && includeRecurringExpense && (!payload.rata_miesieczna || payload.rata_miesieczna <= 0)) return setError("Podaj ratę, aby utworzyć wydatek stały.");
    savingRef.current = true;
    setSaving(true); onSavingChange(true); setError("");
    try { await onSave(payload); }
    catch (caught) {
      setError(axios.isAxiosError<{ error?: string }>(caught) ? caught.response?.data?.error || "Nie udało się zapisać pozycji." : "Nie udało się zapisać pozycji.");
    } finally { savingRef.current = false; setSaving(false); onSavingChange(false); }
  };

  const moneyField = (key: "zadluzenie" | "rata_miesieczna" | "wolny_limit" | "limit_kredytowy" | "one_time_fee" | "kwota_kapitalu" | "prowizja" | "ubezpieczenie", label: string, disabled = false, required = false) => {
    const value = key === "zadluzenie"
      ? calculateDebt(draft.typ, Number(draft.zadluzenie), optionalNumber(draft.rata_miesieczna), optionalNumber(draft.ilosc_rat))
      : draft[key];
    return <label><span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span><MoneyInput min={0} disabled={disabled} required={required || key === "zadluzenie"} className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" value={value} onValueChange={(next) => update(key, key === "zadluzenie" ? parseRequiredNumber(next) : next)} /></label>;
  };
  const percentageField = (key: "rrso" | "oprocentowanie", label: string) => <label><span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span><PercentageInput min={0} className="w-full rounded-lg border border-slate-300 px-3 py-2" value={draft[key]} onValueChange={(next) => update(key, next)} /></label>;

  const card = isCreditCardType(draft.typ);
  const installmentPlan = isInstallmentPlanType(draft.typ);
  const detailedCredit = hasDetailedCreditCosts(draft.typ);
  const cardDebt = calculateUsedCreditLimit(draft.limit_kredytowy, draft.wolny_limit);
  const selectableExpenses = initial?.recurring_expense_id == null
    ? []
    : recurringExpenses.filter((expense) => expense.id === initial.recurring_expense_id);

  return <form id={formId} className="space-y-5" onSubmit={submit}>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <label className="sm:col-span-2"><span className="mb-1 block text-sm font-semibold text-slate-700">Produkt</span><input autoFocus required className="w-full rounded-lg border border-slate-300 px-3 py-2" value={draft.produkt} onChange={(event) => update("produkt", event.target.value)} /></label>
      <label><span className="mb-1 block text-sm font-semibold text-slate-700">Typ</span><select disabled={Boolean(initial?.account_id || initial?.linked_card_account_id)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-100" value={draft.typ} onChange={(event) => selectType(event.target.value as DebtPlanType)}>{DEBT_PLAN_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
      {card ? <>
        {moneyField("wolny_limit", "Dostępny limit", false, true)}
        {moneyField("limit_kredytowy", "Limit karty", false, true)}
        <label><span className="mb-1 block text-sm font-semibold text-slate-700">Wykorzystany limit</span><MoneyInput disabled className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2" value={cardDebt} onValueChange={() => undefined} /></label>
        <label><span className="mb-1 block text-sm font-semibold text-slate-700">Konto spłacające <span className="font-normal text-slate-500">(opcjonalnie)</span></span><select className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2" value={draft.repayment_account_id} onChange={(event) => update("repayment_account_id", event.target.value)}><option value="">Brak powiązania</option>{repaymentAccounts.map((account) => <option key={account.id} value={account.id}>{account.nazwa}</option>)}</select></label>
        <label><span className="mb-1 block text-sm font-semibold text-slate-700">Data rozpoczęcia <span className="font-normal text-slate-500">(opcjonalnie)</span></span><input type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2" value={draft.data_od} onChange={(event) => update("data_od", event.target.value)} /></label>
        {percentageField("oprocentowanie", "Oprocentowanie — opcjonalnie")}
        <p className="self-end text-sm text-slate-500">Po zapisaniu karta pojawi się automatycznie w Kontach i Kredytach. Konto spłaty ustawisz podczas edycji karty w Kontach.</p>
      </> : installmentPlan ? <>
        <label><span className="mb-1 block text-sm font-semibold text-slate-700">Karta kredytowa</span><select required className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2" value={draft.linked_card_account_id} onChange={(event) => update("linked_card_account_id", event.target.value)}><option value="">Wybierz kartę</option>{creditCards.map((account) => <option key={account.id} value={account.id}>{account.nazwa}</option>)}</select></label>
        {moneyField("zadluzenie", "Pozostała kwota planu", false, true)}
        {moneyField("rata_miesieczna", "Rata / m-c", false, true)}
        <label><span className="mb-1 block text-sm font-semibold text-slate-700">Pozostała liczba rat</span><input required type="number" min={1} step={1} className="w-full rounded-lg border border-slate-300 px-3 py-2" value={draft.ilosc_rat} onChange={(event) => update("ilosc_rat", event.target.value)} /></label>
        {moneyField("one_time_fee", "Opłata jednorazowa", false, false)}
        <p className="self-end text-sm text-slate-500">Plan ma oprocentowanie 0%. Jego kwota jest już częścią zadłużenia karty, dlatego nie zmienia salda przy dodaniu.</p>
      </> : <>
        {moneyField("zadluzenie", usesCalculatedDebt(draft.typ) ? "Zadłużenie (podpowiedź z rat)" : "Zadłużenie")}
        {moneyField("rata_miesieczna", "Rata / m-c")}
        <label><span className="mb-1 block text-sm font-semibold text-slate-700">Pozostała liczba rat</span><input type="number" min={0} step={1} className="w-full rounded-lg border border-slate-300 px-3 py-2" value={draft.ilosc_rat} onChange={(event) => update("ilosc_rat", event.target.value)} /></label>
      </>}
      {!card && <RecurringExpenseLinkFields enabled={includeRecurringExpense} choice={recurringExpenseChoice} expenses={selectableExpenses} onEnabledChange={setIncludeRecurringExpense} onChoiceChange={selectExpense} />}
      {!card && Number(draft.rata_miesieczna) > 0 && <>
        <label><span className="mb-1 block text-sm font-semibold text-slate-700">Data od</span><input required type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2" value={draft.data_od} onChange={(event) => update("data_od", event.target.value)} /></label>
        <label><span className="mb-1 block text-sm font-semibold text-slate-700">Data zakończenia</span><input type="date" disabled className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2" value={draft.data_do} /><span className="mt-1 block text-xs text-slate-500">Wyliczana z daty rozpoczęcia i liczby rat.</span></label>
        <label><span className="mb-1 block text-sm font-semibold text-slate-700">Dzień płatności</span><input required type="number" min={1} max={31} className="w-full rounded-lg border border-slate-300 px-3 py-2" value={draft.dzien_miesiaca} onChange={(event) => update("dzien_miesiaca", Number(event.target.value))} /></label>
      </>}
      {detailedCredit && <div className="sm:col-span-2 grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
        <h3 className="sm:col-span-2 font-bold text-slate-800">Szczegóły kredytu</h3>
        {moneyField("kwota_kapitalu", "Kwota kapitału")}
        {percentageField("rrso", "RRSO")}
        {percentageField("oprocentowanie", "Oprocentowanie")}
        {moneyField("prowizja", "Prowizja")}
        {moneyField("ubezpieczenie", "Ubezpieczenie")}
      </div>}
    </div>
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
    {usesCalculatedDebt(draft.typ) && <p className="text-sm text-slate-500">Podpowiadamy kwotę jako rata × liczba rat. Możesz ją poprawić ręcznie.</p>}
    <button className="sr-only" type="submit" disabled={saving}>Zapisz</button>
  </form>;
}

export function DebtPlanEditModal({ plan, onClose, onSaved }: { plan: DebtPlan | null; onClose: () => void; onSaved?: () => void | Promise<void> }) {
  const { expensesStale, fetchExpensesStale } = useExpenseStaleContext();
  const { accounts, fetchAccounts } = useAccountContext();
  const { showToast } = useToast();
  const [saving, setSaving] = React.useState(false);
  const recurringExpenses = React.useMemo(() => expensesStale, [expensesStale]);
  const creditCards = React.useMemo(() => accounts.filter((account) => account.active !== false && isCreditAccount(account)), [accounts]);
  const repaymentAccounts = React.useMemo(() => accounts.filter((account) => account.active !== false && canLinkToCreditProduct(account)), [accounts]);
  const save = async (payload: DebtPlanPayload) => {
    if (!plan) return;
    await apiClient.put(`/debt-plans/${plan.id}`, payload);
    await Promise.all([fetchExpensesStale(), fetchAccounts(), onSaved?.()]);
    onClose();
    showToast("Zapisano produkt.", "success");
  };
  return <Modal open={plan !== null} onClose={() => { if (!saving) onClose(); }} title="Edytuj produkt" description="Te same pola są dostępne niezależnie od miejsca otwarcia." size="lg" footer={<div className="flex justify-end gap-2"><button type="button" disabled={saving} className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold disabled:opacity-50" onClick={onClose}>Anuluj</button><button type="submit" form="shared-debt-plan-edit-form" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{saving ? "Zapisywanie…" : "Zapisz zmiany"}</button></div>}>{plan && <DebtPlanForm key={plan.id} initial={plan} formId="shared-debt-plan-edit-form" recurringExpenses={recurringExpenses} creditCards={creditCards} repaymentAccounts={repaymentAccounts} onSave={save} onSavingChange={setSaving} />}</Modal>;
}

