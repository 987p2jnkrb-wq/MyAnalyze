import React from "react";
import { ArrowDown, ArrowRightLeft, ArrowUp, FileUp, History, Pencil, Plus, Trash2 } from "lucide-react";
import DataGrid, { type DataGridColumn } from "../../components/DataGrid";
import MoneyInput from "../../components/MoneyInput";
import IconButton from "../../components/IconButton";
import Modal from "../../components/Modal";
import ModalFormActions from "../../components/ModalFormActions";
import ConfirmModal from "../../components/ConfirmModal";
import ModuleBadge from "../../components/ModuleBadge";
import type { Account } from "../../types/account";
import AccountActivityLogModal from "../WelcomePage/AccountActivityLogModal";
import TransferModal from "../WelcomePage/TransferModal";
import apiClient from "../../utils/apiClient";
import { formatCurrency } from "../../utils/formatters";
import { accountTypeLabel, accountTypes, canLinkToCreditProduct, displayedActualBalance, isCreditAccount, isVirtualWallet, regularAccountTypes, toAccountPayload, validateAccount, withAccountType, withAvailableBalance } from "../../utils/accountModel";
import { useAccountContext } from "../../context/useAccountContext";
import { useToast } from "../../context/ToastContext";
import { deleteSelectedRows } from "../../utils/deleteSelectedRows";
import { parseRequiredNumber } from "../../utils/numbers";
import { localDateKey } from "../../utils/validation";
import { useIncomeContext } from "../../context/useIncomeContext";
import { useExpenseContext } from "../../context/useExpenseContext";
import StatementImportModal from "./StatementImportModal";
import { DebtPlanEditModal } from "./DebtPlanEditor";
import { normalizeDebtPlan, type DebtPlan } from "./debtPlanModel";
import { transactionTypeOptionsFor, type TransactionType } from "../../types/transactionType";
import ResourceLoadError from "../../components/ResourceLoadError";
import { activeStatusColumn } from "../../components/data-grid/ActiveStatus";

type AccountDraft = Omit<Account, "id">;
type EditorState = { mode: "add" | "edit"; row: Account | null } | null;
type AdjustmentDirection = "income" | "expense";

const today = () => localDateKey();

function AccountAdjustmentForm({ account, onSave }: { account: Account; onSave: (payload: { direction: AdjustmentDirection; title: string; amount: number; date: string; transaction_type: TransactionType }) => Promise<void> }) {
  const creditCard = isCreditAccount(account);
  const [direction, setDirection] = React.useState<AdjustmentDirection>(() => creditCard ? "expense" : "income");
  const [title, setTitle] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(today());
  const [transactionType, setTransactionType] = React.useState<TransactionType>(() => creditCard ? "card_payment" : "top_up");
  const income = direction === "income";
  const selectDirection = (nextDirection: AdjustmentDirection) => {
    setDirection(nextDirection);
    setTransactionType(nextDirection === "income" ? (creditCard ? "refund" : "top_up") : (creditCard ? "card_payment" : "other"));
  };
  return <form id="account-adjustment-form" className="space-y-4" onSubmit={(event) => { event.preventDefault(); void onSave({ direction, title: title.trim(), amount: parseRequiredNumber(amount), date, transaction_type: transactionType }); }}>
    <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1" role="group" aria-label="Rodzaj zmiany salda">
      <button type="button" aria-pressed={income} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${income ? "bg-emerald-600 text-white shadow-sm" : "text-slate-600 hover:bg-white"}`} onClick={() => selectDirection("income")}><ArrowUp size={17} aria-hidden="true" />{creditCard ? "Zwrot / uznanie" : "Zasilenie"}</button>
      <button type="button" aria-pressed={!income} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${!income ? "bg-rose-600 text-white shadow-sm" : "text-slate-600 hover:bg-white"}`} onClick={() => selectDirection("expense")}><ArrowDown size={17} aria-hidden="true" />{creditCard ? "Wydatek kartą" : "Obciążenie"}</button>
    </div>
    <div className={`flex items-center gap-3 rounded-xl border p-3 ${income ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
      {income ? <ArrowUp size={20} aria-hidden="true" /> : <ArrowDown size={20} aria-hidden="true" />}<span className="text-sm">{creditCard ? "Karta" : "Konto"}: <strong>{account.nazwa}</strong> · {creditCard ? "wolny limit" : "obecnie"} {formatCurrency(account.saldo_dostepne)}</span>
    </div>
    <label><span className="mb-1 block text-sm font-semibold">Tytuł</span><input autoFocus required className="w-full rounded-lg border border-slate-300 px-3 py-2.5" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={income ? "np. Przelew" : "np. Zakupy"} /></label>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <label><span className="mb-1 block text-sm font-semibold">Kwota</span><MoneyInput required min={0.01} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" value={amount} onValueChange={setAmount} /></label>
      <label><span className="mb-1 block text-sm font-semibold">Data</span><input required type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2.5" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label className="sm:col-span-2"><span className="mb-1 block text-sm font-semibold">Typ</span><select className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5" value={transactionType} onChange={(event) => setTransactionType(event.target.value as TransactionType)}>{transactionTypeOptionsFor(direction).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    </div>
  </form>;
}

function AccountForm({ row, accounts, onSave }: { row: Account | null; accounts: Account[]; onSave: (draft: AccountDraft) => Promise<void> }) {
  const [draft, setDraft] = React.useState<AccountDraft>(() => row ? { nazwa: row.nazwa, saldo_dostepne: Number(row.saldo_dostepne), saldo_wlasciwe: Number(row.saldo_wlasciwe), typ_depozytu: row.typ_depozytu, institution_name: row.institution_name ?? null, currency: row.currency, repayment_account_id: row.repayment_account_id ?? null, repayment_account_name: row.repayment_account_name ?? null, active: row.active !== false } : { nazwa: "", saldo_dostepne: 0, saldo_wlasciwe: 0, typ_depozytu: "konto", institution_name: null, repayment_account_id: null, repayment_account_name: null, active: true });
  const [availableInput, setAvailableInput] = React.useState(() => row ? String(row.saldo_dostepne) : "");
  const isCredit = isCreditAccount(draft);
  const selectableTypes = isCredit ? accountTypes.filter((item) => item.value === "karta_kredytowa") : regularAccountTypes;
  return (
    <form id="account-form" className="space-y-5" onSubmit={(event) => { event.preventDefault(); void onSave(withAvailableBalance(draft, parseRequiredNumber(availableInput))); }}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="md:col-span-2"><span className="mb-1 block text-sm font-semibold">Nazwa konta</span><input autoFocus required className="w-full rounded-lg border border-gray-300 px-3 py-2" value={draft.nazwa} onChange={(event) => setDraft((current) => ({ ...current, nazwa: event.target.value }))} /></label>
        <label className="md:col-span-2"><span className="mb-1 block text-sm font-semibold">Instytucja <span className="font-normal text-gray-500">(opcjonalnie)</span></span><input className="w-full rounded-lg border border-gray-300 px-3 py-2" value={draft.institution_name ?? ""} onChange={(event) => setDraft((current) => ({ ...current, institution_name: event.target.value || null }))} placeholder="np. Millennium, Revolut, Vinted" /></label>
        <label><span className="mb-1 block text-sm font-semibold">Saldo dostępne</span><MoneyInput required min={0} className="w-full rounded-lg border border-gray-300 px-3 py-2" value={availableInput} onValueChange={(value) => { setAvailableInput(value); const parsed = parseRequiredNumber(value); if (Number.isFinite(parsed)) setDraft((current) => withAvailableBalance(current, parsed)); }} /></label>
        <label><span className="mb-1 block text-sm font-semibold">Saldo rzeczywiste</span><MoneyInput required min={0} disabled className="w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100" value={draft.saldo_wlasciwe} onValueChange={() => undefined} /><span className="mt-1 block text-xs text-gray-500">{isCredit ? "Wyliczane automatycznie jako wolny limit minus limit karty ustawiony w tabie Kredyty." : "Dla zwykłego konta jest zgodne z saldem dostępnym."}</span></label>
        <label className="md:col-span-2"><span className="mb-1 block text-sm font-semibold">Typ</span><select disabled={isCredit} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 disabled:bg-gray-100" value={draft.typ_depozytu} onChange={(event) => setDraft((current) => withAccountType(current, event.target.value))}>{selectableTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>{!row && <span className="mt-1 block text-xs text-gray-500">Kartę kredytową dodasz w zakładce Zobowiązania. Tutaj pojawi się automatycznie.</span>}</label>
        {isCredit && <label className="md:col-span-2"><span className="mb-1 block text-sm font-semibold">Konto spłacające kartę <span className="font-normal text-gray-500">(opcjonalnie)</span></span><select className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2" value={draft.repayment_account_id ?? ""} onChange={(event) => { const selectedId = event.target.value ? Number(event.target.value) : null; const selectedAccount = accounts.find((account) => account.id === selectedId); setDraft((current) => ({ ...current, repayment_account_id: selectedId, repayment_account_name: selectedAccount?.nazwa ?? null })); }}><option value="">Brak powiązania</option>{accounts.filter((account) => account.id !== row?.id && canLinkToCreditProduct(account)).map((account) => <option key={account.id} value={account.id}>{account.nazwa}</option>)}</select><span className="mt-1 block text-xs text-gray-500">Informacyjne powiązanie używane przy analizie importu. Nie tworzy przelewów i nie zmienia sald.</span></label>}
      </div>
    </form>
  );
}

export default function AccountsGrid() {
  const { accounts, accountsLoaded, accountsError, fetchAccounts } = useAccountContext();
  const { fetchIncomes } = useIncomeContext();
  const { fetchExpenses } = useExpenseContext();
  const { showToast } = useToast();
  const [editor, setEditor] = React.useState<EditorState>(null);
  const [confirmId, setConfirmId] = React.useState<number | null>(null);
  const [history, setHistory] = React.useState<Account | null>(null);
  const [transferFrom, setTransferFrom] = React.useState<Account | null>(null);
  const [importAccount, setImportAccount] = React.useState<Account | null>(null);
  const [productPlan, setProductPlan] = React.useState<DebtPlan | null>(null);
  const [adjustment, setAdjustment] = React.useState<Account | null>(null);
  const [adjusting, setAdjusting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const columns = React.useMemo<DataGridColumn<Account>[]>(() => [
    {
      key: "nazwa",
      label: "Nazwa",
      value: (row) => row.nazwa,
      render: (row) => (
        <div className="flex flex-wrap items-center gap-2">
          <span data-i18n-ignore="true">{row.nazwa}</span>
          {isCreditAccount(row) && row.limit_kredytowy != null && Number.isFinite(Number(row.limit_kredytowy)) && (
            <ModuleBadge tone="info" size="sm">
              Limit: {formatCurrency(Number(row.limit_kredytowy))}
            </ModuleBadge>
          )}
        </div>
      ),
      sortable: true,
      width: 300,
      edit: { value: (row) => row.nazwa, update: (row, value) => ({ ...row, nazwa: String(value) }) },
    },
    { key: "saldo_dostepne", label: "Saldo dostępne", value: (row) => Number(row.saldo_dostepne), render: (row) => formatCurrency(row.saldo_dostepne), exportValue: (row) => formatCurrency(row.saldo_dostepne), sortable: true, width: 165, align: "right", edit: { type: "number", min: 0, step: 0.01, value: (row) => Number(row.saldo_dostepne), update: (row, value) => withAvailableBalance(row, Number(value)) } },
    { key: "saldo_wlasciwe", label: "Saldo rzeczywiste", value: displayedActualBalance, render: (row) => <div><div>{formatCurrency(displayedActualBalance(row))}</div>{isCreditAccount(row) && Number(row.installment_plan_debt || 0) > 0 && <div className="mt-0.5 text-xs font-medium text-slate-500">Bez planu: {formatCurrency(row.saldo_wlasciwe)}</div>}</div>, exportValue: (row) => formatCurrency(displayedActualBalance(row)), sortable: true, width: 190, align: "right" },
    { key: "typ_depozytu", label: "Typ", value: (row) => accountTypeLabel(row.typ_depozytu), render: (row) => <ModuleBadge tone={isCreditAccount(row) ? "warning" : isVirtualWallet(row) ? "info" : row.typ_depozytu === "gotowka" ? "success" : "neutral"} size="sm">{accountTypeLabel(row.typ_depozytu)}</ModuleBadge>, sortable: true, filterable: true, width: 180, edit: { type: "select", value: (row) => row.typ_depozytu, options: regularAccountTypes, disabled: (row) => isCreditAccount(row), update: (row, value) => withAccountType(row, String(value)) } },
    activeStatusColumn<Account>(),
  ], []);

  const updateAccountAndVerify = async (id: number, draft: Account | AccountDraft) => {
    const payload = toAccountPayload(draft);
    await apiClient.put(`/konta/${id}`, payload);
    const persisted = (await fetchAccounts()).find((account) => account.id === id);
    const matches = persisted
      && persisted.nazwa === payload.nazwa
      && Number(persisted.saldo_dostepne) === payload.saldo_dostepne
      && Number.isFinite(Number(persisted.saldo_wlasciwe))
      && persisted.typ_depozytu === payload.typ_depozytu
      && (persisted.repayment_account_id ?? null) === payload.repayment_account_id
      && (persisted.active !== false) === Boolean(payload.active);
    if (!matches) throw new Error("Backend nie utrwalił zmian konta.");
    return persisted;
  };

  const saveInline = async (row: Account) => {
    await updateAccountAndVerify(row.id, row);
    showToast("Zapisano konto.", "success");
  };

  const save = async (draft: AccountDraft) => {
    if (!editor) return;
    setSaving(true);
    try {
      if (editor.mode === "edit" && editor.row) await updateAccountAndVerify(editor.row.id, draft);
      else { await apiClient.post("/konta", toAccountPayload(draft)); await fetchAccounts(); }
      setEditor(null);
      showToast(editor.mode === "edit" ? "Zapisano konto." : "Dodano konto.", "success");
    } catch { showToast("Nie udało się zapisać konta.", "error"); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (confirmId == null) return;
    try { await apiClient.delete(`/konta/${confirmId}`); await fetchAccounts(); showToast("Usunięto konto.", "success"); }
    catch (caught) { showToast((caught as { response?: { data?: { error?: string } } })?.response?.data?.error || "Nie udało się usunąć konta.", "error"); }
    finally { setConfirmId(null); }
  };
  const removeSelected = async (selectedRows: Account[]) => {
    const deleted = await deleteSelectedRows(selectedRows, async (row) => { await apiClient.delete(`/konta/${row.id}`); }, async () => { await fetchAccounts(); });
    showToast(`Usunięto ${deleted} ${deleted === 1 ? "konto" : "konta"}.`, "success");
  };

  const transfer = async (fromId: number, toId: number, amount: number) => { await apiClient.post("/konta/transfer", { fromId, toId, amount }); await fetchAccounts(); showToast("Przelew zrealizowany.", "success"); };
  const saveAdjustment = async (payload: { direction: AdjustmentDirection; title: string; amount: number; date: string; transaction_type: TransactionType }) => {
    if (!adjustment) return;
    setAdjusting(true);
    try {
      await apiClient.post(`/konta/${adjustment.id}/adjustment`, payload);
      await Promise.all([fetchAccounts(), payload.direction === "income" ? fetchIncomes() : fetchExpenses()]);
      showToast(payload.direction === "income" ? "Dodano środki i zapisano przychód." : "Odjęto środki i zapisano wydatek.", "success");
      setAdjustment(null);
    } catch (caught) {
      showToast((caught as { response?: { data?: { error?: string } } })?.response?.data?.error || "Nie udało się zaksięgować operacji.", "error");
    } finally { setAdjusting(false); }
  };
  const refresh = async () => { setRefreshing(true); try { await fetchAccounts(); } finally { setRefreshing(false); } };
  const editAccount = async (row: Account) => {
    if (!isCreditAccount(row)) return setEditor({ mode: "edit", row });
    try {
      const response = await apiClient.get("/debt-plans");
      const plan = (Array.isArray(response.data) ? response.data : []).map(normalizeDebtPlan).find((item) => item.account_id === row.id);
      if (!plan) throw new Error("Nie znaleziono produktu karty.");
      setProductPlan(plan);
    } catch { showToast("Nie udało się otworzyć produktu karty.", "error"); }
  };
  const activeAccounts = React.useMemo(() => accounts.filter((row) => row.active !== false), [accounts]);
  const availableTotal = activeAccounts.reduce((sum, row) => sum + Number(row.saldo_dostepne || 0), 0);
  const actualTotal = activeAccounts.reduce((sum, row) => sum + displayedActualBalance(row), 0);

  if (!accountsLoaded) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Ładowanie depozytów…</div>;
  if (accountsError) return <ResourceLoadError blocking message={accountsError} onRetry={() => void fetchAccounts()} />;

  return (
    <div className="min-w-0 space-y-3">
      <DataGrid
        gridId="manager-accounts"
        rows={accounts}
        columns={columns}
        getRowId={(row) => row.id}
        selectable
        onDeleteSelected={removeSelected}
        deleteSelectedConfirmMessage={(selected) => `Czy na pewno usunąć ${selected.length === 1 ? "zaznaczone konto" : `${selected.length} zaznaczone konta`}? Tej operacji nie można cofnąć.`}
        exportFileName="konta.csv"
        actionsWidth={260}
        onInlineSave={saveInline}
        validateInlineRow={validateAccount}
        defaultFilters={{ active: "Aktywne" }}
        toolbar={<><ModuleBadge tone="info">Dostępne: {formatCurrency(availableTotal)}</ModuleBadge><ModuleBadge tone="success">Rzeczywiste: {formatCurrency(actualTotal)}</ModuleBadge><IconButton label="Dodaj konto" tone="primary" onClick={() => setEditor({ mode: "add", row: null })}><Plus size={19} aria-hidden="true" /></IconButton></>}
        refresh={{ onRefresh: refresh, refreshing, label: "Odśwież konta" }}
        actions={(row) => <>{row.active !== false && <IconButton label={`Zaksięguj operację - ${row.nazwa}`} className="h-8 w-8 border-sky-200 text-sky-700 hover:bg-sky-50" onClick={() => setAdjustment(row)}><span className="text-sm font-extrabold leading-none" aria-hidden="true">+/−</span></IconButton>}<IconButton label={`Importuj CSV/PDF - ${row.nazwa}`} tone="info" onClick={() => setImportAccount(row)}><FileUp size={17} aria-hidden="true" /></IconButton><IconButton label="Edytuj konto" onClick={() => void editAccount(row)}><Pencil size={17} aria-hidden="true" /></IconButton><IconButton label="Historia konta" onClick={() => setHistory(row)}><History size={17} aria-hidden="true" /></IconButton>{row.active !== false && <IconButton label="Przelej środki" tone="info" onClick={() => setTransferFrom(row)}><ArrowRightLeft size={17} aria-hidden="true" /></IconButton>}<IconButton label="Usuń konto" tone="danger" onClick={() => setConfirmId(row.id)}><Trash2 size={17} aria-hidden="true" /></IconButton></>}
      />
      <Modal open={Boolean(editor)} onClose={() => { if (!saving) setEditor(null); }} title={editor?.mode === "edit" ? "Edytuj konto" : "Dodaj konto"} size="lg" footer={editor && <ModalFormActions saving={saving} onCancel={() => setEditor(null)} form="account-form" submitLabel={editor.mode === "edit" ? "Zapisz zmiany" : "Dodaj konto"} />}>{editor && <AccountForm key={`${editor.mode}-${editor.row?.id ?? "new"}`} row={editor.row} accounts={accounts} onSave={save} />}</Modal>
      {history && <AccountActivityLogModal open onClose={() => setHistory(null)} accountId={history.id} />}
      {transferFrom && <TransferModal open fromAccount={transferFrom} accounts={accounts.filter((row) => row.id !== transferFrom.id && row.active !== false)} onClose={() => setTransferFrom(null)} onTransfer={transfer} />}
      {importAccount && <StatementImportModal account={importAccount} onClose={() => setImportAccount(null)} onImported={async () => { await Promise.all([fetchAccounts(), fetchIncomes(), fetchExpenses()]); }} onSuccess={(message) => showToast(message, "success", 6000)} />}
      <ConfirmModal open={confirmId != null} title="Potwierdź usunięcie" message="Czy na pewno usunąć konto?" onConfirm={() => void remove()} onCancel={() => setConfirmId(null)} />
      <DebtPlanEditModal plan={productPlan} onClose={() => setProductPlan(null)} />
      <Modal open={adjustment !== null} onClose={() => { if (!adjusting) setAdjustment(null); }} title="Zaksięguj operację" description="Operacja zmieni saldo lub wolny limit i od razu zapisze się jako zrealizowany przychód albo wydatek." size="sm" footer={adjustment && <ModalFormActions saving={adjusting} savingLabel="Księgowanie…" onCancel={() => setAdjustment(null)} form="account-adjustment-form" submitLabel="Zaksięguj" />}>{adjustment && <AccountAdjustmentForm key={adjustment.id} account={adjustment} onSave={saveAdjustment} />}</Modal>
    </div>
  );
}
