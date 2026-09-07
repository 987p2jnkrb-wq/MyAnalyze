import React, { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "../../../components/Modal";
import DataGrid, { type DataGridColumn } from "../../../components/DataGrid";
import ModuleBadge from "../../../components/ModuleBadge";
import apiClient from '../../../utils/apiClient';
import { formatCurrency, formatDate } from "../../../utils/formatters";
import { useLatestRequestGuard } from "../../../hooks/useLatestRequestGuard";

interface LoanPayment {
  id: number;
  loan_id: number;
  payment_number: number;
  due_date: string;
  amount_due: number;
  principal_amount: number;
  interest_amount: number;
  saldo_po: number;
  is_paid: boolean;
  paid_date: string | null;
  created_at: string;
}

interface LoanPaymentsModalProps {
  open: boolean;
  loanId: number;
  readOnly?: boolean;
  onClose: () => void;
}

const LoanPaymentsModal: React.FC<LoanPaymentsModalProps> = ({ open, loanId, onClose }) => {
  const [payments, setPayments] = useState<LoanPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { begin: beginRequest, isLatest: isLatestRequest, invalidate: invalidateRequests } = useLatestRequestGuard();

  const fetchPayments = useCallback(async () => {
    const requestVersion = beginRequest();
    setLoading(true);
    setError("");
    try {
      const res = await apiClient.get(`/loan_payments/loan/${loanId}`);
      if (isLatestRequest(requestVersion)) setPayments(await res.data);
    } catch {
      if (isLatestRequest(requestVersion)) setError("Błąd podczas pobierania rat.");
    } finally {
      if (isLatestRequest(requestVersion)) setLoading(false);
    }
  }, [beginRequest, isLatestRequest, loanId]);

  useEffect(() => {
    if (open) void fetchPayments();
    else invalidateRequests();
  }, [fetchPayments, invalidateRequests, open]);

  const columns = useMemo<DataGridColumn<LoanPayment>[]>(() => [
    { key: "payment_number", label: "Nr", value: (row) => Number(row.payment_number), sortable: true, width: 70, align: "right", hideable: false },
    { key: "due_date", label: "Termin", value: (row) => row.due_date, render: (row) => formatDate(row.due_date), exportValue: (row) => formatDate(row.due_date), sortable: true, width: 130, hideable: false },
    { key: "amount_due", label: "Rata", value: (row) => Number(row.amount_due), render: (row) => formatCurrency(row.amount_due), exportValue: (row) => formatCurrency(row.amount_due), sortable: true, width: 125, align: "right" },
    { key: "principal_amount", label: "Kapitał", value: (row) => Number(row.principal_amount), render: (row) => formatCurrency(row.principal_amount), exportValue: (row) => formatCurrency(row.principal_amount), sortable: true, width: 125, align: "right" },
    { key: "interest_amount", label: "Odsetki", value: (row) => Number(row.interest_amount), render: (row) => formatCurrency(row.interest_amount), exportValue: (row) => formatCurrency(row.interest_amount), sortable: true, width: 115, align: "right" },
    { key: "saldo_po", label: "Pozostało", value: (row) => Number(row.saldo_po), render: (row) => formatCurrency(row.saldo_po), exportValue: (row) => formatCurrency(row.saldo_po), sortable: true, width: 135, align: "right" },
    { key: "status", label: "Status", value: (row) => row.is_paid ? "Zapłacona" : "Do zapłaty", render: (row) => <ModuleBadge tone={row.is_paid ? "success" : "warning"} size="sm">{row.is_paid ? "Zapłacona" : "Do zapłaty"}</ModuleBadge>, sortable: true, filterable: true, width: 125 },
    { key: "paid_date", label: "Data zapłaty", value: (row) => row.paid_date ?? "", render: (row) => row.paid_date ? formatDate(row.paid_date) : "-", exportValue: (row) => row.paid_date ? formatDate(row.paid_date) : "", sortable: true, width: 130, defaultVisible: false },
  ], []);

  return (
    <Modal open={open} onClose={onClose} title="Raty kredytu" description="Harmonogram jest tylko podglądem. Spłatę wykonujesz w zakładce Zobowiązania, wybierając konto płatnicze." size="lg" footer={<div className="flex justify-end"><button className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100" onClick={onClose}>Zamknij</button></div>}>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      <DataGrid gridId={`loan-payments-${loanId}`} rows={payments} columns={columns} getRowId={(row) => row.id} loading={loading} emptyMessage="Brak rat w harmonogramie." defaultSort={{ key: "payment_number", direction: "asc" }} defaultPageSize={12} exportFileName={`harmonogram-rat-${loanId}.csv`} showFooter={false} actionsWidth={0} />
    </Modal>
  );
};

export default LoanPaymentsModal;
