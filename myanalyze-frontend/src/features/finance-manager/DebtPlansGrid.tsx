import React from "react";
import axios from "axios";
import { CircleDollarSign, Pencil, Plus, Trash2 } from "lucide-react";
import DataGrid, { type DataGridColumn } from "../../components/DataGrid";
import ConfirmModal from "../../components/ConfirmModal";
import IconButton from "../../components/IconButton";
import Modal from "../../components/Modal";
import ModalFormActions from "../../components/ModalFormActions";
import ModuleBadge from "../../components/ModuleBadge";
import AllocationOptionSelect from "../../components/AllocationOptionSelect";
import ResourceLoadError from "../../components/ResourceLoadError";
import { accountAllocationOptions } from "../../components/accountAllocationOptions";
import { useExpenseStaleContext } from "../../context/ExpenseStaleContext";
import { useAccountContext } from "../../context/useAccountContext";
import { useToast } from "../../context/ToastContext";
import { deleteSelectedRows } from "../../utils/deleteSelectedRows";
import apiClient, { apiErrorMessage } from "../../utils/apiClient";
import { formatCurrency, formatDate } from "../../utils/formatters";
import { canLinkToCreditProduct, isCreditAccount } from "../../utils/accountModel";
import { buildDebtPlanTotals, DEBT_PLAN_TYPES, effectiveDebtPlanCapital, effectiveDebtPlanDebt, effectiveMonthlyInstallment, normalizeDebtPlan, type DebtPlan, type DebtPlanPayload, type DebtPlanType } from "./debtPlanModel";
import { calculateDebt, financialProductBadgeTone, isCreditCardType, isInstallmentPlanType, normalizeCreditProductType, optionalNumber, usesCalculatedDebt } from "./creditProductModel";
import { activeStatusColumn } from "../../components/data-grid/ActiveStatus";
import { useLatestRequestGuard } from "../../hooks/useLatestRequestGuard";
import { DebtPlanEditModal, DebtPlanForm, toDebtPlanPayload, validateDebtPlanPayload } from "./DebtPlanEditor";
import { useUiText } from "../../i18n";

const canPayInstallment = (plan: DebtPlan) => plan.active !== false && ["Kredyt", "Kredyt hipoteczny", "Dług", "Plan ratalny"].includes(plan.typ)
  && Number(plan.zadluzenie) > 0 && Number(plan.rata_miesieczna) > 0;


export default function DebtPlansGrid({ active = true }: { active?: boolean }) {
  const t = useUiText();
  const { expensesStale, fetchExpensesStale } = useExpenseStaleContext();
  const { accounts, fetchAccounts } = useAccountContext();
  const { showToast } = useToast();
  const [rows, setRows] = React.useState<DebtPlan[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const { begin: beginRequest, isLatest: isLatestRequest } = useLatestRequestGuard();
  const [addOpen, setAddOpen] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [editRow, setEditRow] = React.useState<DebtPlan | null>(null);
  const [deleteId, setDeleteId] = React.useState<number | null>(null);
  const [payId, setPayId] = React.useState<number | null>(null);
  const [payAccountId, setPayAccountId] = React.useState<number | null>(null);
  const [paying, setPaying] = React.useState(false);
  const [paidPlanDraft, setPaidPlanDraft] = React.useState<DebtPlan | null>(null);
  const recurringExpenses = React.useMemo(() => expensesStale, [expensesStale]);
  const creditCards = React.useMemo(() => accounts.filter((account) => account.active !== false && isCreditAccount(account)), [accounts]);
  const repaymentAccounts = React.useMemo(() => accounts.filter((account) => account.active !== false && canLinkToCreditProduct(account)), [accounts]);
  const recurringExpenseRevision = React.useMemo(
    () => recurringExpenses.map((expense) => `${expense.id}:${expense.nazwa}:${expense.kwota}:${expense.custom_type_id ?? ""}`).join("|"),
    [recurringExpenses],
  );
  const previousRecurringExpenseRevision = React.useRef(recurringExpenseRevision);
  const accountRevision = React.useMemo(
    () => accounts.map((account) => `${account.id}:${account.nazwa}:${account.saldo_dostepne}:${account.saldo_wlasciwe}:${account.typ_depozytu}`).join("|"),
    [accounts],
  );
  const previousAccountRevision = React.useRef(accountRevision);

  const fetchRows = React.useCallback(async () => {
    const requestVersion = beginRequest();
    try {
      const response = await apiClient.get("/debt-plans");
      if (isLatestRequest(requestVersion)) {
        setRows((Array.isArray(response.data) ? response.data : []).map(normalizeDebtPlan));
        setLoadError(null);
      }
    } catch (error) {
      if (isLatestRequest(requestVersion)) setLoadError(apiErrorMessage(error, "Nie udało się pobrać zobowiązań."));
      throw error;
    }
  }, [beginRequest, isLatestRequest]);

  React.useEffect(() => {
    if (!active) return;
    void fetchRows().catch(() => undefined).finally(() => setLoading(false));
  }, [active, fetchRows]);
  React.useEffect(() => {
    if (!active || previousRecurringExpenseRevision.current === recurringExpenseRevision) return;
    previousRecurringExpenseRevision.current = recurringExpenseRevision;
    void fetchRows().catch(() => undefined);
  }, [active, recurringExpenseRevision, fetchRows]);
  React.useEffect(() => {
    if (!active || previousAccountRevision.current === accountRevision) return;
    previousAccountRevision.current = accountRevision;
    void fetchRows().catch(() => undefined);
  }, [accountRevision, active, fetchRows]);

  const rowsWithRecurring = React.useMemo(() => rows.map((row) => {
    const linked = recurringExpenses.find((expense) => expense.id === row.recurring_expense_id);
    return linked ? { ...row, rata_miesieczna: Number(linked.kwota), recurring_expense_name: linked.nazwa } : row;
  }), [recurringExpenses, rows]);
  const activeRows = React.useMemo(() => rowsWithRecurring.filter((row) => row.active !== false), [rowsWithRecurring]);
  const totals = React.useMemo(() => buildDebtPlanTotals(activeRows, recurringExpenses), [recurringExpenses, activeRows]);

  const updateCalculatedRow = React.useCallback((row: DebtPlan, patch: Partial<DebtPlan>): DebtPlan => {
    const updated = { ...row, ...patch };
    const card = isCreditCardType(updated.typ);
    const refreshDebt = usesCalculatedDebt(updated.typ) && ("rata_miesieczna" in patch || "ilosc_rat" in patch);
    return {
      ...updated,
      zadluzenie: calculateDebt(updated.typ, refreshDebt ? 0 : Number(updated.zadluzenie), optionalNumber(updated.rata_miesieczna), optionalNumber(updated.ilosc_rat)),
      wolny_limit: card ? updated.wolny_limit : null,
      limit_kredytowy: card ? updated.limit_kredytowy : null,
      linked_card_account_id: isInstallmentPlanType(updated.typ) ? updated.linked_card_account_id : null,
      one_time_fee: isInstallmentPlanType(updated.typ) ? updated.one_time_fee : 0,
    };
  }, []);

  const columns = React.useMemo<DataGridColumn<DebtPlan>[]>(() => [
    { key: "produkt", label: "Produkt", value: (row) => row.produkt, sortable: true, width: 210, edit: { value: (row) => row.produkt, update: (row, value) => ({ ...row, produkt: String(value) }) } },
    { key: "typ", label: "Typ", value: (row) => row.typ, render: (row) => <ModuleBadge size="sm" tone={financialProductBadgeTone(row.typ)}>{row.typ}</ModuleBadge>, sortable: true, filterable: true, width: 155, edit: { type: "select", value: (row) => row.typ, options: DEBT_PLAN_TYPES.map((type) => ({ value: type, label: type })), disabled: (row) => row.account_id !== null || row.linked_card_account_id !== null, update: (row, value) => updateCalculatedRow(row, { typ: value as DebtPlanType }) } },
    { key: "kapital", label: "Zadłużenie", value: (row) => effectiveDebtPlanDebt(row, rowsWithRecurring), render: (row) => formatCurrency(effectiveDebtPlanDebt(row, rowsWithRecurring)), exportValue: (row) => formatCurrency(effectiveDebtPlanDebt(row, rowsWithRecurring)), sortable: true, width: 145, align: "right", edit: { type: "number", min: 0, step: 0.01, value: (row) => effectiveDebtPlanCapital(row) ?? "", disabled: (row) => normalizeCreditProductType(row.typ) === "Kredyt hipoteczny" || usesCalculatedDebt(row.typ) || isCreditCardType(row.typ), update: (row, value) => updateCalculatedRow(row, { zadluzenie: Number(value) }) } },
    { key: "rata_miesieczna", label: "Rata / m-c", value: (row) => effectiveMonthlyInstallment(row, recurringExpenses), render: (row) => row.rata_miesieczna === null ? "-" : formatCurrency(effectiveMonthlyInstallment(row, recurringExpenses)), exportValue: (row) => row.rata_miesieczna === null ? "" : formatCurrency(effectiveMonthlyInstallment(row, recurringExpenses)), sortable: true, width: 135, align: "right", edit: { type: "number", min: 0, step: 0.01, value: (row) => row.rata_miesieczna ?? "", update: (row, value) => updateCalculatedRow(row, { rata_miesieczna: optionalNumber(value) }) } },
    { key: "ilosc_rat", label: "Pozostałe raty", value: (row) => row.ilosc_rat ?? 0, render: (row) => row.ilosc_rat ? row.ilosc_rat : "-", sortable: true, width: 125, align: "right", edit: { type: "number", min: 0, step: 1, value: (row) => row.ilosc_rat ?? "", update: (row, value) => updateCalculatedRow(row, { ilosc_rat: optionalNumber(value) }) } },
    { key: "wolny_limit", label: "Wolny limit", value: (row) => row.wolny_limit ?? 0, render: (row) => row.wolny_limit === null ? "-" : formatCurrency(row.wolny_limit), exportValue: (row) => row.wolny_limit === null ? "" : formatCurrency(row.wolny_limit), sortable: true, width: 135, align: "right", edit: { type: "number", min: 0, step: 0.01, value: (row) => row.wolny_limit ?? "", disabled: (row) => !isCreditCardType(row.typ), update: (row, value) => updateCalculatedRow(row, { wolny_limit: optionalNumber(value) }) } },
    { key: "limit_kredytowy", label: "Limit", value: (row) => row.limit_kredytowy ?? 0, render: (row) => row.limit_kredytowy === null ? "-" : formatCurrency(row.limit_kredytowy), exportValue: (row) => row.limit_kredytowy === null ? "" : formatCurrency(row.limit_kredytowy), sortable: true, width: 130, align: "right", edit: { type: "number", min: 0, step: 0.01, value: (row) => row.limit_kredytowy ?? "", disabled: (row) => !isCreditCardType(row.typ), update: (row, value) => updateCalculatedRow(row, { limit_kredytowy: optionalNumber(value) }) } },
    { key: "linked_card_name", label: "Powiązana karta", value: (row) => row.linked_card_name ?? "", render: (row) => row.linked_card_name ? <ModuleBadge size="sm" tone="info">{row.linked_card_name}</ModuleBadge> : "-", sortable: true, filterable: true, width: 165 },
    { key: "one_time_fee", label: "Opłata jednorazowa", value: (row) => row.one_time_fee, render: (row) => isInstallmentPlanType(row.typ) ? formatCurrency(row.one_time_fee) : "-", exportValue: (row) => isInstallmentPlanType(row.typ) ? formatCurrency(row.one_time_fee) : "", sortable: true, width: 155, align: "right", defaultVisible: false, edit: { type: "number", min: 0, step: 0.01, value: (row) => row.one_time_fee, disabled: (row) => !isInstallmentPlanType(row.typ), update: (row, value) => ({ ...row, one_time_fee: Number(value) }) } },
    activeStatusColumn<DebtPlan>(),
    { key: "updated_at", label: "Aktualizacja", value: (row) => row.updated_at, render: (row) => row.updated_at ? formatDate(row.updated_at) : "-", sortable: true, width: 130, defaultVisible: false },
  ], [recurringExpenses, rowsWithRecurring, updateCalculatedRow]);

  const persistInline = async (row: DebtPlan) => {
    const payload = toDebtPlanPayload(row);
    const validation = validateDebtPlanPayload(payload);
    if (validation) throw new Error(validation);
    await apiClient.put(`/debt-plans/${row.id}`, payload);
    await Promise.all([fetchRows(), fetchExpensesStale(), fetchAccounts()]);
    showToast("Zapisano zobowiązanie.", "success");
  };
  const saveInline = async (row: DebtPlan) => {
    const previous = rows.find((item) => item.id === row.id);
    if (previous?.active !== false && row.active === false && isInstallmentPlanType(row.typ)) {
      setPaidPlanDraft({ ...row, zadluzenie: 0 });
      return;
    }
    await persistInline(row);
  };
  const confirmPaidPlan = async () => {
    if (!paidPlanDraft) return;
    const row = paidPlanDraft;
    setPaidPlanDraft(null);
    try { await persistInline(row); }
    catch (error) { showToast(apiErrorMessage(error, "Nie udało się oznaczyć planu jako spłacony."), "error"); }
  };
  const add = async (payload: DebtPlanPayload) => {
    await apiClient.post("/debt-plans", payload);
    await Promise.all([fetchRows(), fetchExpensesStale(), fetchAccounts()]);
    setAddOpen(false);
    showToast("Dodano zobowiązanie.", "success");
  };
  const remove = async () => {
    if (deleteId === null) return;
    await apiClient.delete(`/debt-plans/${deleteId}`);
    await Promise.all([fetchRows(), fetchExpensesStale(), fetchAccounts()]);
    setDeleteId(null);
    showToast("Usunięto zobowiązanie.", "success");
  };
  const removeSelected = async (selectedRows: DebtPlan[]) => {
    const deleted = await deleteSelectedRows(
      selectedRows,
      async (row) => { await apiClient.delete(`/debt-plans/${row.id}`); },
      async () => { await Promise.all([fetchRows(), fetchExpensesStale(), fetchAccounts()]); },
    );
    showToast(`Usunięto ${deleted} ${deleted === 1 ? "zobowiązanie" : "zobowiązania"}.`, "success");
  };
  const payInstallment = async () => {
    if (payId === null || paying) return;
    setPaying(true);
    try {
      if (!payAccountId) return showToast("Wybierz konto do spłaty raty.", "error");
      const plan = rows.find((row) => row.id === payId);
      if (!plan) return showToast("Nie znaleziono zobowiązania.", "error");
      const endpoint = isInstallmentPlanType(plan.typ) ? "pay-installment" : "pay-debt-installment";
      const response = await apiClient.post(`/debt-plans/${payId}/${endpoint}`, { account_id: payAccountId });
      await Promise.all([fetchRows(), fetchExpensesStale(), fetchAccounts()]);
      setPayId(null); setPayAccountId(null);
      showToast(`Spłacono ratę ${formatCurrency(Number(response.data?.paid || 0))}.`, "success");
    } catch (caught) {
      showToast(axios.isAxiosError<{ error?: string }>(caught) ? caught.response?.data?.error || "Nie udało się spłacić raty." : "Nie udało się spłacić raty.", "error");
    } finally { setPaying(false); }
  };
  const refresh = async () => {
    setRefreshing(true);
    try { await Promise.all([fetchRows(), fetchExpensesStale(), fetchAccounts()]); }
    catch { /* fetchRows zachowuje ostatnie dane i ustawia jawny błąd */ }
    finally { setRefreshing(false); }
  };
  return <>
    {loadError && rows.length === 0 && !loading ? <ResourceLoadError blocking message={loadError} retrying={refreshing} onRetry={() => void refresh()} /> : <>
    {loadError && <ResourceLoadError message={loadError} retrying={refreshing} onRetry={() => void refresh()} />}
    <DataGrid
      gridId="manager-debt-plans"
      rows={rowsWithRecurring}
      columns={columns}
      getRowId={(row) => row.id}
      selectable
      onDeleteSelected={removeSelected}
      deleteSelectedConfirmMessage={(selected) => {
        const linked = selected.some((row) => row.recurring_expense_id !== null || row.loan_id !== null);
        const target = selected.length === 1 ? t("Czy na pewno usunąć zaznaczone zobowiązanie?") : `${t("Czy na pewno usunąć zaznaczone zobowiązania?")} (${selected.length})`;
        const consequence = linked ? t("Powiązane wpisy w Kredytach i stałe wydatki również zostaną usunięte. Powiązane karty kredytowe i konta pozostaną bez zmian.") : t("Tej operacji nie można cofnąć.");
        return `${target} ${consequence}`;
      }}
      loading={loading}
      emptyMessage="Brak zobowiązań."
      defaultSort={{ key: "produkt", direction: "asc" }}
      defaultFilters={{ active: "Aktywne" }}
      exportFileName="zobowiazania.csv"
      actionsWidth={154}
      onInlineSave={saveInline}
      validateInlineRow={(row) => validateDebtPlanPayload(toDebtPlanPayload(row))}
      actions={(row) => <>{canPayInstallment(row) && <IconButton label={`Spłać ratę - ${row.produkt}`} tone="info" onClick={() => { setPayId(row.id); setPayAccountId(row.repayment_account_id); }}><CircleDollarSign size={18} aria-hidden="true" /></IconButton>}<IconButton label={`Edytuj ${row.produkt}`} onClick={() => setEditRow(row)}><Pencil size={18} aria-hidden="true" /></IconButton><IconButton label={`Usuń ${row.produkt}`} tone="danger" onClick={() => setDeleteId(row.id)}><Trash2 size={18} aria-hidden="true" /></IconButton></>}
      toolbar={<>
        <ModuleBadge size="sm" tone="danger">Zadłużenie: {formatCurrency(totals.debt)}</ModuleBadge>
        <ModuleBadge size="sm" tone="warning">Raty / m-c: {formatCurrency(totals.monthlyInstallment)}</ModuleBadge>
        <ModuleBadge size="sm" tone="success">Wolny limit: {formatCurrency(totals.availableLimit)}</ModuleBadge>
        <ModuleBadge size="sm" tone="info">Limit: {formatCurrency(totals.creditLimit)}</ModuleBadge>
        <IconButton label="Dodaj pozycję" tone="primary" onClick={() => setAddOpen(true)}><Plus size={19} aria-hidden="true" /></IconButton>
      </>}
      refresh={{ onRefresh: refresh, refreshing, label: "Odśwież zobowiązania" }}
    />
    </>}
    <Modal open={addOpen} onClose={() => { if (!adding) setAddOpen(false); }} title="Dodaj zobowiązanie" description="Pozycja z ratą może automatycznie utworzyć powiązany stały wydatek." size="lg" footer={<ModalFormActions saving={adding} savingLabel="Dodawanie…" onCancel={() => setAddOpen(false)} form="debt-plan-form" submitLabel="Dodaj" />}><DebtPlanForm recurringExpenses={recurringExpenses} creditCards={creditCards} repaymentAccounts={repaymentAccounts} onSave={add} onSavingChange={setAdding} /></Modal>
    <DebtPlanEditModal plan={editRow} onClose={() => setEditRow(null)} onSaved={fetchRows} />
    <ConfirmModal open={deleteId !== null} title="Usuń zobowiązanie" message={rows.find((row) => row.id === deleteId)?.recurring_expense_id ? "Czy usunąć zobowiązanie, powiązany wpis w Kredytach i stały wydatek? Powiązana karta kredytowa pozostanie bez zmian." : rows.find((row) => row.id === deleteId)?.account_id ? "Czy usunąć zobowiązanie? Powiązane konto pozostanie bez zmian." : rows.find((row) => row.id === deleteId)?.loan_id ? "Czy usunąć zobowiązanie i powiązany wpis w Kredytach? Powiązana karta kredytowa pozostanie bez zmian." : "Czy na pewno usunąć tę pozycję?"} confirmLabel="Usuń" onConfirm={() => void remove()} onCancel={() => setDeleteId(null)} />
    <ConfirmModal open={paidPlanDraft !== null} title="Oznacz plan jako spłacony" message="Ustawienie planu ratalnego jako nieaktywny oznacza, że został spłacony. Pozostałe zadłużenie planu zostanie ustawione na 0. Powiązana karta kredytowa pozostanie bez zmian: jej limit ani saldo dostępne nie zostaną zmienione, dlatego saldo rzeczywiste może pozostać ujemne." confirmLabel="Oznacz jako spłacony" cancelLabel="Anuluj" onConfirm={() => void confirmPaidPlan()} onCancel={() => setPaidPlanDraft(null)} />
    <Modal open={payId !== null} onClose={() => { if (!paying) { setPayId(null); setPayAccountId(null); } }} title="Spłać ratę" description={isInstallmentPlanType(rows.find((row) => row.id === payId)?.typ) ? `Rata ${formatCurrency(Math.min(Number(rows.find((row) => row.id === payId)?.rata_miesieczna || 0), Number(rows.find((row) => row.id === payId)?.zadluzenie || 0)))} obciąży wybrane konto i uwolni tę samą kwotę na karcie.` : `Rata ${formatCurrency(Math.min(Number(rows.find((row) => row.id === payId)?.rata_miesieczna || 0), Number(rows.find((row) => row.id === payId)?.zadluzenie || 0)))} obciąży wybrane konto i pomniejszy zadłużenie.`} size="sm" footer={<ModalFormActions saving={paying} savingLabel="Spłacanie…" disabled={!payAccountId} onCancel={() => { setPayId(null); setPayAccountId(null); }} onSubmit={() => void payInstallment()} submitLabel="Spłać ratę" />}><AllocationOptionSelect autoFocus label="Konto do spłaty" placeholder="Wybierz konto" options={accountAllocationOptions(repaymentAccounts, false)} value={payAccountId} onChange={setPayAccountId} /></Modal>
  </>;
}
