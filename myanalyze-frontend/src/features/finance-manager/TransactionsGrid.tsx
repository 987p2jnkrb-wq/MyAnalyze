import React from "react";
import { ArrowRightLeft, CheckCircle2, CircleDollarSign, Eye, EyeOff, Link2, Plus, Trash2, Unlink2, WalletCards } from "lucide-react";
import DataGrid, { type DataGridColumn } from "../../components/DataGrid";
import MoneyInput from "../../components/MoneyInput";
import IconButton from "../../components/IconButton";
import Modal from "../../components/Modal";
import ModalFormActions from "../../components/ModalFormActions";
import ConfirmModal from "../../components/ConfirmModal";
import ModuleBadge, { type ModuleBadgeTone } from "../../components/ModuleBadge";
import RealizeModal from "../../components/RealizeModal";
import AllocationModal from "../../components/AllocationModal";
import AllocationOptionSelect from "../../components/AllocationOptionSelect";
import { accountAllocationOptions, type AllocationOption } from "../../components/accountAllocationOptions";
import { useIncomeContext } from "../../context/useIncomeContext";
import { useExpenseContext } from "../../context/useExpenseContext";
import apiClient, { apiErrorMessage } from "../../utils/apiClient";
import { formatCurrency, formatDate } from "../../utils/formatters";
import { useAccountContext } from "../../context/useAccountContext";
import { useToast } from "../../context/ToastContext";
import { parseRequiredNumber } from "../../utils/numbers";
import { transactionTypeLabel, transactionTypeOptionsFor, type TransactionType } from "../../types/transactionType";
import { deleteSelectedRows } from "../../utils/deleteSelectedRows";
import { localDateKey, validateDateRange, validatePositiveMoney } from "../../utils/validation";
import type { IncomeCertainty, TransactionModel } from "../../context/useTransactionResource";
import type { Account } from "../../types/account";
import { INCOME_CERTAINTY_OPTIONS, incomeCertaintyLabel } from "../../types/incomeCertainty";
import ResourceLoadError from "../../components/ResourceLoadError";
import type { CustomTransactionType } from "../../types/customTransactionType";
import TransactionLinkPicker from "./TransactionLinkPicker";
import Button from "../../components/Button";
import { useCustomTransactionTypes } from "../../hooks/useCustomTransactionTypes";
import { isIncludedInAnalysis } from "./transactionSemantics";
import { transactionStatus } from "./transactionPresentation";
import { isTransactionInDateRange } from "./transactionFilters";
import { useUiText } from "../../i18n";
import HelpBadge from "../../components/HelpBadge";

type TransactionRow = TransactionModel;

type TransactionPayload = Omit<TransactionRow, "id" | "zrealizowany">;
type TransactionFormDraft = Omit<TransactionPayload, "amount"> & { amount: string };
type EditorState = { mode: "add" | "edit"; row: TransactionRow | null } | null;

interface TransactionsGridProps {
  kind: "income" | "expense";
  rows: TransactionRow[];
  onAdd: (payload: TransactionPayload) => Promise<void>;
  onEdit: (row: TransactionRow) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onRefresh: () => Promise<void>;
  plannedIncomes?: TransactionRow[];
  onIncomeRefresh?: () => Promise<void>;
  allIncomes: TransactionRow[];
  allExpenses: TransactionRow[];
  onAllRefresh: () => Promise<void>;
}

const today = () => localDateKey();
const PLANNED_TRANSACTION_FILTER = { status: "Zaplanowane" };

function availableToRealize(row: TransactionRow): number {
  return Math.max(0, Number(row.amount) - Number(row.allocatedToPlan ?? 0));
}

function transactionCertainty(row: TransactionRow): IncomeCertainty {
  return row.generatedFromRecurring ? "guaranteed" : row.certainty ?? "expected";
}

function hasPastExpectedDate(row: TransactionRow): boolean {
  const date = row.addedAt.slice(0, 10);
  return !row.zrealizowany && /^\d{4}-\d{2}-\d{2}$/.test(date) && date < today();
}

function TransactionForm({ row, kind, customTypes, onSave }: {
  row: TransactionRow | null;
  kind: "income" | "expense";
  customTypes: CustomTransactionType[];
  onSave: (payload: TransactionPayload) => Promise<void>;
}) {
  const [draft, setDraft] = React.useState<TransactionFormDraft>(() => row ? { name: row.name, amount: String(row.amount), category: row.category || "Inne", customTypeId: row.customTypeId ?? null, customTypeName: row.customTypeName ?? null, addedAt: row.addedAt?.slice(0, 10) ?? today(), transactionType: row.transactionType ?? null, certainty: row.certainty ?? "expected" } : { name: "", amount: "", category: "Inne", customTypeId: null, customTypeName: null, addedAt: today(), transactionType: null, certainty: "expected" });
  const transactionTypes = transactionTypeOptionsFor(kind);
  return (
    <form id="transaction-form" className="space-y-5" onSubmit={(event) => { event.preventDefault(); void onSave({ ...draft, name: draft.name.trim(), amount: parseRequiredNumber(draft.amount) }); }}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="md:col-span-2"><span className="mb-1 block text-sm font-semibold">Nazwa</span><input autoFocus required className="w-full rounded-lg border border-gray-300 px-3 py-2" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
        <label><span className="mb-1 block text-sm font-semibold">Kwota</span><MoneyInput required min={0.01} className="w-full rounded-lg border border-gray-300 px-3 py-2" value={draft.amount} onValueChange={(value) => setDraft((current) => ({ ...current, amount: value }))} /></label>
        <label><span className="mb-1 block text-sm font-semibold">Etykieta <span className="font-normal text-gray-500">(opcjonalnie)</span></span><select className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2" value={draft.customTypeId ?? ""} onChange={(event) => { const selected = customTypes.find((item) => item.id === Number(event.target.value)); setDraft((current) => ({ ...current, customTypeId: selected?.id ?? null, customTypeName: selected?.name ?? null })); }}><option value="">Bez etykiety</option>{customTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span className="mb-1 block text-sm font-semibold">Data</span><input required type="date" className="w-full rounded-lg border border-gray-300 px-3 py-2" value={draft.addedAt} onChange={(event) => setDraft((current) => ({ ...current, addedAt: event.target.value }))} /></label>
        <label><span className="mb-1 block text-sm font-semibold">Typ transakcji <span className="font-normal text-gray-500">(opcjonalnie)</span></span><select className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2" value={draft.transactionType ?? ""} onChange={(event) => setDraft((current) => ({ ...current, transactionType: (event.target.value || null) as TransactionType | null }))}><option value="">Nie określono</option>{transactionTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        {kind === "income" && <label><span className="mb-1 block text-sm font-semibold">Pewność wpływu</span><select className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2" value={draft.certainty ?? "expected"} onChange={(event) => setDraft((current) => ({ ...current, certainty: event.target.value as IncomeCertainty }))}>{INCOME_CERTAINTY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><span className="mt-1 block text-xs text-slate-500">Potencjalny wpływ nie zwiększa konserwatywnej prognozy Celów.</span></label>}
      </div>
    </form>
  );
}

function ImportedAccountCorrectionModal({
  rows,
  accounts,
  accountNames,
  onClose,
  onSave,
}: {
  rows: TransactionRow[] | null;
  accounts: Account[];
  accountNames: Map<number, string>;
  onClose: () => void;
  onSave: (accountId: number) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    setSelectedId(null);
    setSaving(false);
    setError("");
  }, [rows]);
  if (!rows?.length) return null;
  const single = rows.length === 1 ? rows[0] : null;
  const saveSelection = async () => {
    if (selectedId == null) return;
    setSaving(true); setError("");
    try { await onSave(selectedId); }
    catch (caught) { setError(caught instanceof Error && caught.message ? caught.message : "Nie udało się zmienić konta."); }
    finally { setSaving(false); }
  };
  return <Modal open onClose={() => { if (!saving) onClose(); }} title={rows.length === 1 ? "Zmień konto zaimportowanej transakcji" : `Zmień konto ${rows.length} zaimportowanych transakcji`} size="sm" footer={<ModalFormActions saving={saving} disabled={selectedId == null} onCancel={onClose} onSubmit={() => void saveSelection()} submitLabel="Zmień konto" />}>
    <div className="space-y-4">
      {single && <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><strong className="block text-slate-900">{single.name}</strong><span>{formatDate(single.addedAt)} · {formatCurrency(single.amount)}</span><span className="mt-1 block">Obecne konto: {single.accountId == null ? "Nieprzypisane" : accountNames.get(single.accountId) ?? `#${single.accountId}`}</span></div>}
      <p className="text-sm text-slate-600">To jest korekta przypisania importu. Salda kont, fingerprint importu, etykieta, powiązanie z planem i cross-link pozostaną bez zmian.</p>
      <AllocationOptionSelect label="Nowe konto" placeholder="Wybierz konto" options={accountAllocationOptions(accounts, false, { includeInactive: true })} value={selectedId} onChange={(value) => { setSelectedId(value); setError(""); }} />
      <p className="text-xs text-slate-500">Zmiana dotyczy tylko wybranych transakcji. Nie zmienia zapisanych mapowań instrumentu używanych przy kolejnych importach.</p>
      {error && <div role="alert" className="text-sm font-semibold text-red-700">{error}</div>}
    </div>
  </Modal>;
}

function TransactionsGrid({ kind, rows, onAdd, onEdit, onDelete, onRefresh, plannedIncomes = [], onIncomeRefresh, allIncomes, allExpenses, onAllRefresh }: TransactionsGridProps) {
  const t = useUiText();
  const [editor, setEditor] = React.useState<EditorState>(null);
  const [confirmId, setConfirmId] = React.useState<number | null>(null);
  const [realizeRow, setRealizeRow] = React.useState<TransactionRow | null>(null);
  const [partialRow, setPartialRow] = React.useState<TransactionRow | null>(null);
  const [incomePaymentRow, setIncomePaymentRow] = React.useState<TransactionRow | null>(null);
  const { accounts, fetchAccounts } = useAccountContext();
  const { showToast } = useToast();
  const [visibleRows, setVisibleRows] = React.useState<TransactionRow[]>(rows);
  const [saving, setSaving] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const { activeRows: customTypes } = useCustomTransactionTypes();
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [linkRow, setLinkRow] = React.useState<TransactionRow | null>(null);
  const [accountChangeRows, setAccountChangeRows] = React.useState<TransactionRow[] | null>(null);
  const isIncome = kind === "income";
  const tone: ModuleBadgeTone = isIncome ? "success" : "danger";
  const singular = isIncome ? "przychód" : "wydatek";
  const accountNames = React.useMemo(() => new Map(accounts.map((account) => [account.id, account.nazwa])), [accounts]);
  const accountTypes = React.useMemo(() => new Map(accounts.map((account) => [account.id, account.typ_depozytu])), [accounts]);
  const allTransactionMap = React.useMemo(() => new Map([
    ...allIncomes.map((row) => [`income:${row.id}`, row] as const),
    ...allExpenses.map((row) => [`expense:${row.id}`, row] as const),
  ]), [allExpenses, allIncomes]);
  const dateFilteredRows = React.useMemo(() => rows.filter((row) => isTransactionInDateRange(row, dateFrom, dateTo)), [dateFrom, dateTo, rows]);
  const accountOptions = React.useMemo<AllocationOption[]>(() => accountAllocationOptions(accounts, !isIncome), [accounts, isIncome]);
  const incomeOptions = React.useMemo<AllocationOption[]>(() => plannedIncomes.filter((income) => !income.zrealizowany && availableToRealize(income) > 0).map((income) => ({ id: income.id, label: income.name, availableAmount: availableToRealize(income) })), [plannedIncomes]);

  const columns = React.useMemo<DataGridColumn<TransactionRow>[]>(() => [
    { key: "name", label: "Nazwa", value: (row) => row.name, render: (row) => {
      const counterpart = row.transferCounterpartKind && row.transferCounterpartId != null ? allTransactionMap.get(`${row.transferCounterpartKind}:${row.transferCounterpartId}`) : null;
      return <div className="min-w-0"><span data-i18n-ignore="true" className="block truncate">{row.name}</span>{row.importSource && row.accountId != null && <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600"><ModuleBadge tone="info" size="sm">IMPORT</ModuleBadge><span>Konto: {accountNames.get(row.accountId) ?? `#${row.accountId}`}</span></span>}{row.transferLinkId != null && <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600"><ModuleBadge tone="neutral" size="sm">TRANSFER ↔ {row.transferCounterpartName ?? "powiązana operacja"}</ModuleBadge>{counterpart && <span>{counterpart.accountId == null ? "Bez konta" : accountNames.get(counterpart.accountId) ?? `#${counterpart.accountId}`} · {formatDate(counterpart.addedAt)} · {formatCurrency(counterpart.amount)}</span>}</span>}</div>;
    }, exportValue: (row) => row.importSource && row.accountId != null ? `${row.name} [IMPORT · konto: ${accountNames.get(row.accountId) ?? `#${row.accountId}`}]` : row.name, sortable: true, width: 270, edit: { value: (row) => row.name, disabled: (row) => row.zrealizowany, update: (row, value) => ({ ...row, name: String(value) }) } },
    { key: "amount", label: "Kwota", value: (row) => Number(row.amount), render: (row) => formatCurrency(row.amount), exportValue: (row) => formatCurrency(row.amount), sortable: true, width: 135, align: "right", edit: { type: "number", min: 0.01, step: 0.01, value: (row) => Number(row.amount), disabled: (row) => row.zrealizowany, update: (row, value) => ({ ...row, amount: Number(value) }) } },
    { key: "customType", label: "Etykieta", value: (row) => row.customTypeName ?? "Nie ustawiono", sortable: true, filterable: true, width: 180, edit: { type: "select", value: (row) => String(row.customTypeId ?? "none"), options: [{ value: "none", label: "Bez etykiety" }, ...customTypes.map((item) => ({ value: String(item.id), label: item.name }))], update: (row, value) => { const customTypeId = value === "none" ? null : Number(value); const customType = customTypes.find((item) => item.id === customTypeId); return { ...row, customTypeId, customTypeName: customType?.name ?? null }; } } },
    { key: "account", label: "Konto", value: (row) => row.accountId == null ? "Nieprzypisane" : accountNames.get(row.accountId) ?? `#${row.accountId}`, sortable: true, filterable: true, width: 170, edit: { type: "select", value: (row) => String(row.accountId ?? ""), options: [{ value: "", label: "Nieprzypisane" }, ...accountOptions.map((account) => ({ value: String(account.id), label: account.label }))], disabled: (row) => !row.importSource, update: (row, value) => ({ ...row, accountId: value === "" ? null : Number(value) }) } },
    { key: "transactionType", label: "Typ transakcji", value: (row) => transactionTypeLabel(row.transactionType), render: (row) => <ModuleBadge tone={row.transactionType ? "info" : "neutral"} size="sm">{transactionTypeLabel(row.transactionType)}</ModuleBadge>, sortable: true, filterable: true, width: 190, edit: { type: "select", value: (row) => row.transactionType ?? "", options: [{ value: "", label: "Nie określono" }, ...transactionTypeOptionsFor(kind).map((option) => ({ value: option.value, label: option.label }))], disabled: (row) => row.zrealizowany, update: (row, value) => ({ ...row, transactionType: (String(value) || null) as TransactionType | null }) } },
    { key: "addedAt", label: "Data", value: (row) => row.addedAt, render: (row) => <span className="inline-flex items-center gap-1.5"><span>{formatDate(row.addedAt)}</span>{hasPastExpectedDate(row) && <HelpBadge help="Oczekiwana data tej pozycji jest w przeszłości. Możesz zmienić datę albo pozostawić ją bez zmian." tone="warning" icon="warning" />}</span>, exportValue: (row) => formatDate(row.addedAt), sortable: true, width: 165, edit: { type: "date", value: (row) => row.addedAt.slice(0, 10), disabled: (row) => row.zrealizowany, update: (row, value) => ({ ...row, addedAt: String(value) }) } },
    ...(isIncome ? [{ key: "certainty", label: "Pewność", value: (row: TransactionRow) => incomeCertaintyLabel(transactionCertainty(row)), render: (row: TransactionRow) => { const certainty = transactionCertainty(row); return <ModuleBadge tone={certainty === "potential" ? "warning" : certainty === "guaranteed" ? "success" : "info"} size="sm">{incomeCertaintyLabel(certainty)}</ModuleBadge>; }, sortable: true, filterable: true, filterOptions: INCOME_CERTAINTY_OPTIONS.map((option) => option.label), width: 145, edit: { type: "select" as const, value: (row: TransactionRow) => row.certainty ?? "expected", options: INCOME_CERTAINTY_OPTIONS.map((option) => ({ ...option })), disabled: (row: TransactionRow) => row.zrealizowany || Boolean(row.generatedFromRecurring), update: (row: TransactionRow, value: string | number | boolean) => ({ ...row, certainty: String(value) as IncomeCertainty }) } }] : []),
    { key: "status", label: "Status", value: (row) => t(transactionStatus(row).value), render: (row) => { const status = transactionStatus(row); return <ModuleBadge tone={status.tone} size="sm">{t(status.label)}</ModuleBadge>; }, sortable: true, filterable: true, filterOptions: ["Zaplanowane", "Zrealizowane", "Oczekujące bankowe", "Anulowane bankowe"].map(t), width: 170, align: "center" },
  ], [accountNames, accountOptions, allTransactionMap, customTypes, isIncome, kind, t]);

  const validateInline = (row: TransactionRow) => {
    if (!row.name.trim()) return "Nazwa nie może być pusta.";
    const amountError = validatePositiveMoney(row.amount);
    if (amountError) return amountError;
    const dateError = validateDateRange(row.addedAt);
    if (dateError) return dateError.replace("początkową", "");
    return null;
  };

  const saveInline = async (row: TransactionRow) => {
    const original = rows.find((item) => item.id === row.id);
    const labelChanged = original?.customTypeId !== row.customTypeId;
    const accountChanged = original?.accountId !== row.accountId;
    try {
      if (accountChanged) {
        if (!row.importSource || row.accountId == null) throw new Error("Konto można zmienić tylko dla importowanej transakcji.");
        await apiClient.patch(`/${isIncome ? "przychody" : "wydatki"}/bulk-account`, { ids: [row.id], account_id: row.accountId });
      }
      if (row.zrealizowany) {
        if (!labelChanged && !accountChanged) throw new Error("Zrealizowanego rekordu nie można edytować.");
        if (labelChanged) await apiClient.patch(`/${isIncome ? "przychody" : "wydatki"}/bulk-classification`, { ids: [row.id], custom_type_id: row.customTypeId });
      } else {
        await onEdit(row);
      }
      await onRefresh();
      showToast(`Zapisano ${singular}.`, "success");
    } catch (error) {
      showToast(apiErrorMessage(error, `Nie udało się zapisać: ${singular}.`), "error");
      throw error;
    }
  };

  const save = async (payload: TransactionPayload) => {
    if (!editor) return;
    const validation = validateInline({ id: editor.row?.id ?? 0, zrealizowany: false, ...payload });
    if (validation) { showToast(validation, "error"); return; }
    setSaving(true);
    try {
      if (editor.mode === "edit" && editor.row) await onEdit({ ...editor.row, ...payload }); else await onAdd(payload);
      setEditor(null);
      showToast(`${editor.mode === "edit" ? "Zapisano" : "Dodano"} ${singular}.`, "success");
    } catch { showToast(`Nie udało się zapisać: ${singular}.`, "error"); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (confirmId == null) return;
    try { await onDelete(confirmId); showToast(`Usunięto ${singular}.`, "success"); }
    catch { showToast(`Nie udało się usunąć: ${singular}.`, "error"); }
    finally { setConfirmId(null); }
  };
  const removeSelected = async (selectedRows: TransactionRow[]) => {
    const deleted = await deleteSelectedRows(selectedRows, (row) => onDelete(row.id));
    showToast(`Usunięto ${deleted} ${isIncome ? (deleted === 1 ? "przychód" : "przychody") : (deleted === 1 ? "wydatek" : "wydatki")}.`, "success");
  };

  const realize = async (accountId: number) => {
    if (!realizeRow) return;
    const account = accounts.find((item) => item.id === accountId);
    if (!account) return;
    try {
      await apiClient.patch(`/${isIncome ? "przychody" : "wydatki"}/realize/${realizeRow.id}`, { account_id: accountId });
      await Promise.all([onRefresh(), fetchAccounts()]);
      showToast(isIncome ? "Przychód zrealizowany i dodany do konta." : "Wydatek zrealizowany i pobrany z konta.", "success");
      setRealizeRow(null);
    } catch (error) {
      throw new Error(apiErrorMessage(error, `Nie udało się zrealizować: ${singular}.`));
    }
  };

  const realizePartially = async (accountId: number, amount: number) => {
    if (!partialRow) return;
    try {
      await apiClient.patch(`/${isIncome ? "przychody" : "wydatki"}/realize/${partialRow.id}`, { account_id: accountId, amount });
      await Promise.all([onRefresh(), fetchAccounts()]);
      showToast(`${isIncome ? "Przychód" : "Wydatek"} zrealizowany częściowo: ${formatCurrency(amount)}.`, "success");
      setPartialRow(null);
    } catch (error) {
      throw new Error(apiErrorMessage(error, `Nie udało się częściowo zrealizować: ${singular}.`));
    }
  };

  const realizeWithIncome = async (incomeId: number, amount: number) => {
    if (!incomePaymentRow || !onIncomeRefresh) return;
    try {
      await apiClient.patch(`/wydatki/realize-with-income/${incomePaymentRow.id}`, { income_id: incomeId, amount });
      await Promise.all([onRefresh(), onIncomeRefresh()]);
      showToast(`Wydatek rozliczony przychodem w kwocie ${formatCurrency(amount)}.`, "success");
      setIncomePaymentRow(null);
    } catch (error) {
      throw new Error(apiErrorMessage(error, "Nie udało się rozliczyć wydatku przychodem."));
    }
  };

  const refresh = async () => { setRefreshing(true); try { await Promise.all([onRefresh(), fetchAccounts()]); } finally { setRefreshing(false); } };
  const bulkChange = async (selectedRows: TransactionRow[], update: { custom_type_id?: number | null }) => {
    try { await apiClient.patch(`/${isIncome ? "przychody" : "wydatki"}/bulk-classification`, { ids: selectedRows.map((row) => row.id), ...update }); await onRefresh(); showToast(`Zmieniono ${selectedRows.length} operacji.`, "success"); }
    catch { showToast("Nie udało się wykonać zmiany zbiorczej.", "error"); }
  };
  const changeImportedAccount = async (accountId: number) => {
    if (!accountChangeRows?.length) return;
    try {
      await apiClient.patch(`/${isIncome ? "przychody" : "wydatki"}/bulk-account`, { ids: accountChangeRows.map((row) => row.id), account_id: accountId });
      await onRefresh();
      showToast(accountChangeRows.length === 1 ? "Zmieniono konto zaimportowanej transakcji. Salda nie zostały zmienione." : `Zmieniono konto ${accountChangeRows.length} zaimportowanych transakcji. Salda nie zostały zmienione.`, "success");
      setAccountChangeRows(null);
    } catch (error) {
      throw new Error(apiErrorMessage(error, "Nie udało się zmienić konta zaimportowanej transakcji."));
    }
  };
  const unlinkTransfer = async (row: TransactionRow) => {
    if (row.transferLinkId == null) return;
    try { await apiClient.delete(`/konta/import-transfers/${row.transferLinkId}`); await onAllRefresh(); showToast("Usunięto powiązanie transferu.", "success"); }
    catch (error) { showToast(apiErrorMessage(error, "Nie udało się usunąć powiązania transferu."), "error"); }
  };
  const linkTransfer = async (candidate: { kind: "income" | "expense"; row: TransactionRow }) => {
    if (!linkRow) return;
    const changing = linkRow.transferLinkId != null;
    const payload = { kind, transactionId: linkRow.id, counterpartKind: candidate.kind, counterpartId: candidate.row.id };
    try {
      if (changing) await apiClient.patch(`/konta/import-transfers/${linkRow.transferLinkId}`, payload);
      else await apiClient.post("/konta/import-transfers", payload);
      await onAllRefresh();
      setLinkRow(null);
      showToast(changing ? "Zmieniono powiązanie." : "Powiązano transakcje.", "success");
    } catch (error) { showToast(apiErrorMessage(error, changing ? "Nie udało się zmienić powiązania." : "Nie udało się powiązać transakcji."), "error"); }
  };
  const toggleAnalysis = async (row: TransactionRow) => {
    try { await apiClient.patch(`/konta/import-transactions/${kind}/${row.id}/analysis`, { excluded: !row.excludedFromAnalysis }); await onRefresh(); showToast(row.excludedFromAnalysis ? "Operacja ponownie liczy się w analizach." : "Operacja została wyłączona z analiz.", "success"); }
    catch (error) { showToast(apiErrorMessage(error, "Nie udało się zmienić udziału operacji w analizach."), "error"); }
  };
  const total = visibleRows.filter(isIncludedInAnalysis).reduce((sum, row) => sum + Number(row.amount || 0), 0);

  return (
    <div className="min-w-0 space-y-3">
      <DataGrid
        gridId={`manager-${kind}s`}
        rows={dateFilteredRows}
        columns={columns}
        getRowId={(row) => row.id}
        selectable
        bulkActions={(selectedRows) => <><select aria-label="Zmień etykietę zaznaczonych" defaultValue="" className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" onChange={(event) => { if (event.target.value !== "") void bulkChange(selectedRows, { custom_type_id: event.target.value === "none" ? null : Number(event.target.value) }); event.currentTarget.value = ""; }}><option value="">Zmień etykietę…</option><option value="none">Bez etykiety</option>{customTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{selectedRows.every((row) => Boolean(row.importSource)) && <Button size="sm" tone="secondary" onClick={() => setAccountChangeRows(selectedRows)}><WalletCards size={16} aria-hidden="true" />Zmień konto importu…</Button>}</>}
        onDeleteSelected={removeSelected}
        deleteSelectedConfirmMessage={(selected) => `Czy na pewno usunąć ${selected.length === 1 ? `zaznaczony ${singular}` : `${selected.length} zaznaczone ${isIncome ? "przychody" : "wydatki"}`}? Tej operacji nie można cofnąć.`}
        defaultFilters={PLANNED_TRANSACTION_FILTER}
        exportFileName={`${isIncome ? "przychody" : "wydatki"}.csv`}
        actionsWidth={280}
        onInlineSave={saveInline}
        validateInlineRow={validateInline}
        onFilteredRowsChange={setVisibleRows}
        toolbar={<><label className="flex items-center gap-1 text-sm font-semibold text-slate-700">Od<input aria-label="Data od" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1.5 font-normal" /></label><label className="flex items-center gap-1 text-sm font-semibold text-slate-700">Do<input aria-label="Data do" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1.5 font-normal" /></label>{(dateFrom || dateTo) && <button type="button" className="text-sm font-semibold text-blue-700 hover:underline" onClick={() => { setDateFrom(""); setDateTo(""); }}>Wyczyść daty</button>}<ModuleBadge tone={tone}>Suma: {formatCurrency(total)}</ModuleBadge><IconButton label={t(isIncome ? "Dodaj przychód" : "Dodaj wydatek")} tone="primary" onClick={() => setEditor({ mode: "add", row: null })}><Plus size={19} aria-hidden="true" /></IconButton></>}
        refresh={{ onRefresh: refresh, refreshing, label: `Odśwież ${isIncome ? "przychody" : "wydatki"}` }}
        actions={(row) => <>{!row.zrealizowany && !row.importSource && availableToRealize(row) > 0 && <><IconButton label="Zrealizuj w całości" tone="info" onClick={() => setRealizeRow(row)}><CheckCircle2 size={18} aria-hidden="true" /></IconButton><IconButton label="Zrealizuj częściowo" tone="info" onClick={() => setPartialRow(row)}><CircleDollarSign size={18} aria-hidden="true" /></IconButton>{!isIncome && <IconButton label="Zrealizuj przychodem" tone="info" onClick={() => setIncomePaymentRow(row)}><ArrowRightLeft size={18} aria-hidden="true" /></IconButton>}</>}{row.transferLinkId == null ? <IconButton label="Powiąż transakcję" tone="info" onClick={() => setLinkRow(row)}><Link2 size={18} aria-hidden="true" /></IconButton> : <><IconButton label="Zmień powiązanie" tone="info" onClick={() => setLinkRow(row)}><Link2 size={18} aria-hidden="true" /></IconButton><IconButton label="Usuń powiązanie transferu" tone="info" onClick={() => void unlinkTransfer(row)}><Unlink2 size={18} aria-hidden="true" /></IconButton></>}{row.importSource && <IconButton label="Zmień konto importu" tone="info" onClick={() => setAccountChangeRows([row])}><WalletCards size={18} aria-hidden="true" /></IconButton>}{row.importSource && row.transferLinkId == null && <IconButton label={row.excludedFromAnalysis ? "Włącz w analizach" : "Wyłącz z analiz"} tone="info" onClick={() => void toggleAnalysis(row)}>{row.excludedFromAnalysis ? <Eye size={18} aria-hidden="true" /> : <EyeOff size={18} aria-hidden="true" />}</IconButton>}<IconButton label="Usuń" tone="danger" onClick={() => setConfirmId(row.id)}><Trash2 size={17} aria-hidden="true" /></IconButton></>}
      />
      <ImportedAccountCorrectionModal rows={accountChangeRows} accounts={accounts} accountNames={accountNames} onClose={() => setAccountChangeRows(null)} onSave={changeImportedAccount} />
      <TransactionLinkPicker open={Boolean(linkRow)} sourceKind={kind} sourceRow={linkRow} incomes={allIncomes} expenses={allExpenses} accountNames={accountNames} accountTypes={accountTypes} onClose={() => setLinkRow(null)} onSelect={async (candidateKind, candidate) => { await linkTransfer({ kind: candidateKind, row: candidate }); }} />
      <Modal open={Boolean(editor)} onClose={() => { if (!saving) setEditor(null); }} title={editor?.mode === "edit" ? `${t("Edytuj")}: ${t(singular)}` : t(isIncome ? "Dodaj przychód" : "Dodaj wydatek")} size="lg" footer={editor && <ModalFormActions saving={saving} onCancel={() => setEditor(null)} form="transaction-form" submitLabel={editor.mode === "edit" ? "Zapisz zmiany" : "Dodaj"} />}>
        {editor && <TransactionForm key={`${editor.mode}-${editor.row?.id ?? "new"}`} row={editor.row} kind={kind} customTypes={customTypes} onSave={save} />}
      </Modal>
      <RealizeModal open={Boolean(realizeRow)} accounts={accounts} onClose={() => setRealizeRow(null)} onSelect={realize} title={`Wybierz konto - ${isIncome ? "dodanie środków" : "realizacja wydatku"}`} />
      <AllocationModal open={Boolean(partialRow)} title={`Zrealizuj częściowo: ${partialRow?.name ?? singular}`} description="Zaplanowana pozycja zostanie pomniejszona, a zrealizowana część zapisana osobno." sourceLabel="Konto" sourcePlaceholder="Wybierz konto" availabilityLabel="saldo" options={accountOptions} maximumAmount={partialRow ? availableToRealize(partialRow) : 0} submitLabel="Zrealizuj częściowo" onClose={() => setPartialRow(null)} onSubmit={realizePartially} />
      {!isIncome && <AllocationModal open={Boolean(incomePaymentRow)} title={`Zrealizuj przychodem: ${incomePaymentRow?.name ?? "wydatek"}`} description="Przychód i wydatek zostaną pomniejszone o tę samą kwotę. Saldo konta nie ulegnie zmianie." sourceLabel="Przychód" sourcePlaceholder="Wybierz zaplanowany przychód" availabilityLabel="pozostało" options={incomeOptions} maximumAmount={incomePaymentRow ? availableToRealize(incomePaymentRow) : 0} submitLabel="Rozlicz przychodem" onClose={() => setIncomePaymentRow(null)} onSubmit={realizeWithIncome} />}
      <ConfirmModal open={confirmId != null} title="Potwierdź usunięcie" message={`Czy na pewno usunąć ${singular}?`} onConfirm={() => void remove()} onCancel={() => setConfirmId(null)} />
    </div>
  );
}

export function IncomeGrid() {
  const incomeContext = useIncomeContext();
  const expenseContext = useExpenseContext();
  if (!incomeContext.incomesLoaded) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Ładowanie przychodów…</div>;
  if (incomeContext.incomesError) return <ResourceLoadError blocking message={incomeContext.incomesError} onRetry={() => void incomeContext.fetchIncomes()} />;
  return <TransactionsGrid kind="income" rows={incomeContext.incomes} onAdd={incomeContext.addIncome} onEdit={(row) => incomeContext.editIncome(row.id, row)} onDelete={incomeContext.deleteIncome} onRefresh={incomeContext.fetchIncomes} allIncomes={incomeContext.incomes} allExpenses={expenseContext.expenses} onAllRefresh={async () => { await Promise.all([incomeContext.fetchIncomes(), expenseContext.fetchExpenses()]); }} />;
}

export function ExpenseGrid() {
  const expenseContext = useExpenseContext();
  const incomeContext = useIncomeContext();
  if (!expenseContext.expensesLoaded) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Ładowanie wydatków…</div>;
  if (expenseContext.expensesError) return <ResourceLoadError blocking message={expenseContext.expensesError} onRetry={() => void expenseContext.fetchExpenses()} />;
  return <TransactionsGrid kind="expense" rows={expenseContext.expenses} onAdd={expenseContext.addExpense} onEdit={expenseContext.editExpense} onDelete={expenseContext.deleteExpense} onRefresh={expenseContext.fetchExpenses} plannedIncomes={incomeContext.incomes} onIncomeRefresh={incomeContext.fetchIncomes} allIncomes={incomeContext.incomes} allExpenses={expenseContext.expenses} onAllRefresh={async () => { await Promise.all([incomeContext.fetchIncomes(), expenseContext.fetchExpenses()]); }} />;
}
