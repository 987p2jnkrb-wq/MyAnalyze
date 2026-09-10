import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import ModulePage from "../../../components/ModulePage";
import Modal from "../../../components/Modal";
import ModalFormActions from "../../../components/ModalFormActions";
import DataGrid, { DataGridColumn } from "../../../components/DataGrid";
import IconButton from "../../../components/IconButton";
import ResourceLoadError from "../../../components/ResourceLoadError";
import LoanForm from "./LoanForm";
import LoanPaymentsModal from "./LoanPaymentsModal";
import ConfirmModal from "../../../components/ConfirmModal";
import ModuleBadge from "../../../components/ModuleBadge";
import { useToast } from "../../../context/ToastContext";
import apiClient, { apiErrorMessage } from "../../../utils/apiClient";
import { formatCurrency, formatDate, formatPercentage } from "../../../utils/formatters";
import { calculateEffectiveCreditCardDebt, CREDIT_PRODUCT_TYPES, financialProductBadgeTone, isCreditCardType, isInstallmentPlanType, normalizeCreditProductType, usesCalculatedDebt, type CreditProductType } from "../creditProductModel";
import { loanPayload, type Loan, validateLoan, withCalculatedLoanDates, withCalculatedLoanDebt } from "./loanModel";
import { deleteSelectedRows } from "../../../utils/deleteSelectedRows";
import { DebtPlanEditModal } from "../DebtPlanEditor";
import { normalizeDebtPlan, type DebtPlan } from "../debtPlanModel";
import { useExpenseStaleContext } from "../../../context/ExpenseStaleContext";
import { activeStatusColumn } from "../../../components/data-grid/ActiveStatus";
import { useLatestRequestGuard } from "../../../hooks/useLatestRequestGuard";

const LOAN_TYPES = CREDIT_PRODUCT_TYPES.filter((type) => type !== "Karta kredytowa" && type !== "Plan ratalny");
const cardIsReadOnly = (row: Loan) => isCreditCardType(row.typ) || isInstallmentPlanType(row.typ);
const effectiveLoanDebt = (row: Loan, loans: Loan[]) => calculateEffectiveCreditCardDebt(
  row.typ,
  row.kwota_calkowita,
  row.card_account_id,
  loans.map((item) => ({ type: item.typ, linkedCardAccountId: item.linked_card_account_id, debt: item.kwota_calkowita })),
);
const numberEdit = (key: keyof Loan, min = 0, max?: number, step = 0.01) => ({
  type: "number" as const,
  min,
  max,
  step,
  disabled: cardIsReadOnly,
  value: (row: Loan) => row[key] == null ? "" : Number(row[key]),
  update: (row: Loan, value: string | number | boolean) => ({ ...row, [key]: value === "" ? null : Number(value) }),
});
const dateEdit = (key: "data_rozpoczecia" | "data_do" | "data_dodania") => ({
  type: "date" as const,
  disabled: cardIsReadOnly,
  value: (row: Loan) => row[key]?.slice(0, 10) ?? "",
  update: (row: Loan, value: string | number | boolean) => ({ ...row, [key]: String(value) }),
});

export default function LoansPage({ embedded = false, active = true }: { embedded?: boolean; active?: boolean }) {
  const { showToast } = useToast();
  const { fetchExpensesStale } = useExpenseStaleContext();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { begin: beginRequest, isLatest: isLatestRequest } = useLatestRequestGuard();
  const [paymentsModal, setPaymentsModal] = useState<{ open: boolean; loanId: number | null; readOnly: boolean }>({ open: false, loanId: null, readOnly: false });
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; id: number | null }>({ open: false, id: null });
  const [loanEditor, setLoanEditor] = useState<{ mode: "add" | "edit"; loan: Loan | null } | null>(null);
  const [productPlan, setProductPlan] = useState<DebtPlan | null>(null);
  const [loanFormSaving, setLoanFormSaving] = useState(false);
  const activeLoans = useMemo(() => loans.filter((loan) => loan.active !== false), [loans]);
  const totals = useMemo(() => activeLoans.reduce((sum, loan) => ({
    debt: sum.debt + effectiveLoanDebt(loan, loans),
    installment: sum.installment + (Number(loan.kwota_raty) || 0),
  }), { debt: 0, installment: 0 }), [activeLoans, loans]);

  const fetchLoans = React.useCallback(async () => {
    const requestVersion = beginRequest();
    setRefreshing(true);
    try {
      const response = await apiClient.get("/loans");
      if (isLatestRequest(requestVersion)) {
        setLoans((Array.isArray(response.data) ? response.data : []).map((loan) => ({ ...loan, typ: normalizeCreditProductType(loan.typ), active: !(loan.active === false || Number(loan.active) === 0) })));
        setLoadError(null);
      }
    } catch (error) {
      if (isLatestRequest(requestVersion)) setLoadError(apiErrorMessage(error, "Nie udało się pobrać kredytów."));
    } finally {
      if (isLatestRequest(requestVersion)) {
        setLoaded(true);
        setRefreshing(false);
      }
    }
  }, [beginRequest, isLatestRequest]);
  useEffect(() => {
    if (active) fetchLoans();
  }, [active, fetchLoans]);

  const handleConfirmDelete = async () => {
    if (confirmModal.id == null) return;
    try {
      await apiClient.delete(`/loans/${confirmModal.id}`);
      setLoans((current) => current.filter((loan) => loan.id !== confirmModal.id));
      await fetchExpensesStale();
      showToast("Kredyt usunięty.", "success");
    } catch { showToast("Błąd podczas usuwania kredytu.", "error"); }
    finally { setConfirmModal({ open: false, id: null }); }
  };
  const removeSelected = async (selectedLoans: Loan[]) => {
    const deleted = await deleteSelectedRows(selectedLoans, async (loan) => {
      await apiClient.delete(`/loans/${loan.id}`);
      setLoans((current) => current.filter((item) => item.id !== loan.id));
    });
    await fetchExpensesStale();
    showToast(`Usunięto ${deleted} ${deleted === 1 ? "kredyt" : "kredyty"}.`, "success");
  };

  const handleDownloadSchedule = async (loan: Loan) => {
    try {
      const response = await apiClient.get(`/loans/${loan.id}/schedule-pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a"); link.href = url; link.download = `harmonogram-${loan.nazwa}.pdf`; link.click(); URL.revokeObjectURL(url);
    } catch { showToast("Nie udało się pobrać harmonogramu.", "error"); }
  };
  const showPayments = async (loan: Loan) => {
    try {
      await apiClient.post(`/loans/${loan.id}/ensure-schedule`);
      setPaymentsModal({ open: true, loanId: loan.id, readOnly: isInstallmentPlanType(loan.typ) });
    } catch { showToast("Nie udało się przygotować harmonogramu rat.", "error"); }
  };
  const openProductEditor = async (loan: Loan) => {
    try {
      const response = await apiClient.get("/debt-plans");
      const plan = (Array.isArray(response.data) ? response.data : []).map(normalizeDebtPlan).find((item) => item.loan_id === loan.id);
      if (plan) setProductPlan(plan);
      else setLoanEditor({ mode: "edit", loan });
    } catch { showToast("Nie udało się otworzyć produktu.", "error"); }
  };

  const columns = useMemo<DataGridColumn<Loan>[]>(() => [
    { key: "nazwa", label: "Nazwa", value: (row) => row.nazwa, sortable: true, width: 180, edit: { value: (row) => row.nazwa, disabled: cardIsReadOnly, update: (row, value) => ({ ...row, nazwa: String(value) }) } },
    { key: "typ", label: "Typ", value: (row) => row.typ, render: (row) => <ModuleBadge size="sm" tone={financialProductBadgeTone(row.typ)}>{row.typ}</ModuleBadge>, sortable: true, filterable: true, width: 165, edit: { type: "select", value: (row) => row.typ, options: LOAN_TYPES.map((type) => ({ value: type, label: type })), disabled: cardIsReadOnly, update: (row, value) => withCalculatedLoanDebt({ ...row, typ: value as CreditProductType }) } },
    { key: "data_rozpoczecia", label: "Data rozpoczęcia", value: (row) => row.data_rozpoczecia, render: (row) => formatDate(row.data_rozpoczecia), exportValue: (row) => formatDate(row.data_rozpoczecia), sortable: true, width: 135, edit: { ...dateEdit("data_rozpoczecia"), update: (row, value) => withCalculatedLoanDates({ ...row, data_rozpoczecia: String(value) }) } },
    { key: "data_do", label: "Data zakończenia", value: (row) => row.data_do, render: (row) => formatDate(row.data_do), exportValue: (row) => formatDate(row.data_do), sortable: true, width: 145 },
    { key: "ilosc_rat", label: "Pozostałe raty", value: (row) => row.ilosc_rat, render: (row) => row.ilosc_rat == null ? "-" : row.ilosc_rat, sortable: true, width: 125, align: "right", edit: { type: "number", min: 1, step: 1, value: (row) => row.ilosc_rat ?? "", disabled: cardIsReadOnly, update: (row, value) => withCalculatedLoanDates(withCalculatedLoanDebt({ ...row, ilosc_rat: value === "" ? null : Number(value) })) } },
    { key: "kwota_kapitalu", label: "Kapitał", value: (row) => Number(row.kwota_kapitalu), render: (row) => row.kwota_kapitalu == null ? "-" : formatCurrency(row.kwota_kapitalu), exportValue: (row) => row.kwota_kapitalu == null ? "" : formatCurrency(row.kwota_kapitalu), sortable: true, width: 130, align: "right", edit: numberEdit("kwota_kapitalu", 0.01) },
    { key: "kwota_calkowita", label: "Zadłużenie", value: (row) => effectiveLoanDebt(row, loans), render: (row) => formatCurrency(effectiveLoanDebt(row, loans)), exportValue: (row) => formatCurrency(effectiveLoanDebt(row, loans)), sortable: true, width: 145, align: "right", edit: { type: "number", min: 0.01, step: 0.01, value: (row) => row.kwota_calkowita, disabled: (row) => cardIsReadOnly(row) || usesCalculatedDebt(row.typ), update: (row, value) => ({ ...row, kwota_calkowita: Number(value) }) } },
    { key: "kwota_raty", label: "Rata", value: (row) => row.kwota_raty, render: (row) => row.kwota_raty == null ? "-" : formatCurrency(row.kwota_raty), exportValue: (row) => row.kwota_raty == null ? "" : formatCurrency(row.kwota_raty), sortable: true, width: 115, align: "right", edit: { type: "number", min: 0.01, step: 0.01, value: (row) => row.kwota_raty ?? "", disabled: cardIsReadOnly, update: (row, value) => withCalculatedLoanDebt({ ...row, kwota_raty: value === "" ? null : Number(value) }) } },
    { key: "rrso", label: "RRSO (%)", value: (row) => Number(row.rrso), render: (row) => row.rrso == null ? "-" : formatPercentage(row.rrso), exportValue: (row) => row.rrso == null ? "" : formatPercentage(row.rrso), sortable: true, width: 105, align: "right", edit: numberEdit("rrso") },
    { key: "dzien_splaty", label: "Dzień spłaty", value: (row) => Number(row.dzien_splaty), render: (row) => row.dzien_splaty == null ? "-" : row.dzien_splaty, sortable: true, width: 110, align: "right", edit: { ...numberEdit("dzien_splaty", 1, 31, 1), update: (row, value) => withCalculatedLoanDates({ ...row, dzien_splaty: value === "" ? null : Number(value) }) } },
    { key: "oprocentowanie", label: "Oprocentowanie (%)", value: (row) => Number(row.oprocentowanie), render: (row) => row.oprocentowanie == null ? "-" : formatPercentage(row.oprocentowanie), sortable: true, width: 165, align: "right", edit: numberEdit("oprocentowanie") },
    { key: "prowizja", label: "Prowizja", value: (row) => Number(row.prowizja), render: (row) => row.prowizja == null ? "-" : formatCurrency(row.prowizja), sortable: true, width: 115, align: "right", edit: numberEdit("prowizja") },
    { key: "ubezpieczenie", label: "Ubezpieczenie", value: (row) => Number(row.ubezpieczenie), render: (row) => row.ubezpieczenie == null ? "-" : formatCurrency(row.ubezpieczenie), sortable: true, width: 135, align: "right", edit: numberEdit("ubezpieczenie") },
    activeStatusColumn<Loan>(),
    { key: "data_dodania", label: "Data dodania", value: (row) => row.data_dodania, render: (row) => formatDate(row.data_dodania), exportValue: (row) => formatDate(row.data_dodania), sortable: true, width: 125, edit: dateEdit("data_dodania") },
  ], [loans]);

  const saveInlineLoan = async (loan: Loan) => {
    try {
      await apiClient.put(`/loans/${loan.id}`, loanPayload(loan));
      const response = await apiClient.get("/loans");
      setLoans((Array.isArray(response.data) ? response.data : []).map((item) => ({ ...item, typ: normalizeCreditProductType(item.typ), active: !(item.active === false || Number(item.active) === 0) })));
      showToast("Zmieniono kredyt.", "success");
    } catch (error) {
      showToast("Nie udało się zapisać kredytu.", "error");
      throw error;
    }
  };

  const addAction = <IconButton label="Dodaj kredyt" tone="primary" onClick={() => setLoanEditor({ mode: "add", loan: null })}><Plus size={21} aria-hidden="true" /></IconButton>;
  const content = <>
    {loadError && loans.length === 0 && loaded ? <ResourceLoadError blocking message={loadError} retrying={refreshing} onRetry={() => void fetchLoans()} /> : <>
    {loadError && <ResourceLoadError message={loadError} retrying={refreshing} onRetry={() => void fetchLoans()} />}
    <DataGrid gridId="loans" rows={loans} columns={columns} getRowId={(loan) => loan.id} loading={refreshing} emptyMessage="Brak kredytów do wyświetlenia." selectable isRowSelectable={(loan) => !cardIsReadOnly(loan)} onDeleteSelected={removeSelected} deleteSelectedConfirmMessage={(selected) => `Czy na pewno usunąć ${selected.length === 1 ? "zaznaczony kredyt" : `${selected.length} zaznaczone kredyty`}? Powiązane Zobowiązania i stałe wydatki również zostaną usunięte.`} exportFileName="kredyty.csv" actionsWidth={190} onInlineSave={saveInlineLoan} validateInlineRow={validateLoan} defaultFilters={{ active: "Aktywne" }} toolbar={<>
      <ModuleBadge size="sm" tone="danger">Zadłużenie: {formatCurrency(totals.debt)}</ModuleBadge>
      <ModuleBadge size="sm" tone="warning">Raty / m-c: {formatCurrency(totals.installment)}</ModuleBadge>
      {embedded && addAction}
    </>} refresh={{ onRefresh: fetchLoans, refreshing, label: "Odśwież kredyty" }} actions={(loan) => <>
      <IconButton label={`Edytuj ${loan.nazwa}`} onClick={() => void openProductEditor(loan)}><Pencil size={18} aria-hidden="true" /></IconButton>
      {!isCreditCardType(loan.typ) && <IconButton label="Pobierz harmonogram" tone="primary" onClick={() => handleDownloadSchedule(loan)}><CalendarDays size={18} aria-hidden="true" /></IconButton>}
      {!isCreditCardType(loan.typ) && <IconButton label="Pokaż raty" tone="info" onClick={() => void showPayments(loan)}><ListChecks size={18} aria-hidden="true" /></IconButton>}
      <IconButton label={`Usuń ${loan.nazwa}`} tone="danger" onClick={() => setConfirmModal({ open: true, id: loan.id })}><Trash2 size={18} aria-hidden="true" /></IconButton>
    </>} />
    </>}
    {paymentsModal.open && paymentsModal.loanId !== null && <LoanPaymentsModal open loanId={paymentsModal.loanId} readOnly={paymentsModal.readOnly} onClose={() => setPaymentsModal({ open: false, loanId: null, readOnly: false })} />}
    <ConfirmModal open={confirmModal.open} message={loans.find((loan) => loan.id === confirmModal.id)?.recurring_expense_id ? "Czy usunąć kredyt i powiązany z nim wydatek stały?" : "Czy na pewno chcesz usunąć ten kredyt?"} confirmLabel="Tak, usuń" cancelLabel="Anuluj" onConfirm={handleConfirmDelete} onCancel={() => setConfirmModal({ open: false, id: null })} />
    <Modal open={loanEditor !== null} onClose={() => { if (!loanFormSaving) setLoanEditor(null); }} title={loanEditor?.mode === "edit" ? "Edytuj kredyt" : "Dodaj kredyt"} description={loanEditor?.mode === "edit" ? "Puste pola możesz uzupełnić teraz lub później bezpośrednio w tabeli." : "Uzupełnij podstawowe dane oraz koszty finansowania."} size="lg" footer={loanEditor && <ModalFormActions saving={loanFormSaving} onCancel={() => setLoanEditor(null)} form="loan-form" submitLabel={loanEditor.mode === "edit" ? "Zapisz zmiany" : "Dodaj kredyt"} />}>
      {loanEditor && <LoanForm loan={loanEditor.mode === "edit" ? loanEditor.loan ?? undefined : undefined} formId="loan-form" onSavingChange={setLoanFormSaving} onSuccess={() => { const mode = loanEditor.mode; setLoanEditor(null); void fetchLoans(); showToast(mode === "edit" ? "Kredyt zapisany." : "Kredyt dodany.", "success"); }} />}
    </Modal>
    <DebtPlanEditModal plan={productPlan} onClose={() => setProductPlan(null)} onSaved={fetchLoans} />
  </>;

  return embedded ? content : <ModulePage title="Kredyty" maxWidth={1440} actions={addAction}>{content}</ModulePage>;
}
