import React from "react";
import DataGrid, { type DataGridColumn } from "../../components/DataGrid";
import IconButton from "../../components/IconButton";
import Modal from "../../components/Modal";
import ModuleBadge from "../../components/ModuleBadge";
import type { TransactionModel } from "../../context/useTransactionResource";
import { formatCurrency, formatDate } from "../../utils/formatters";
import { Link2 } from "lucide-react";
import { transactionDayDistance, transactionLinkScore, type TransactionCandidate } from "./transactionLinkCandidates";
import { transactionLinkDirectionIssue } from "./transactionLinks";

interface TransactionLinkPickerProps {
  open: boolean;
  sourceKind: "income" | "expense";
  sourceRow: TransactionModel | null;
  incomes: TransactionModel[];
  expenses: TransactionModel[];
  accountNames: Map<number, string>;
  accountTypes: Map<number, string>;
  onClose: () => void;
  onSelect: (candidateKind: "income" | "expense", candidate: TransactionModel) => Promise<void>;
}

type LinkCandidateRow = {
  key: string;
  kind: "income" | "expense";
  transaction: TransactionModel;
  accountName: string;
  dayDistance: number;
  exactAmount: boolean;
  oppositeKind: boolean;
  otherAccount: boolean;
  score: number;
};

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export default function TransactionLinkPicker({ open, sourceKind, sourceRow, incomes, expenses, accountNames, accountTypes, onClose, onSelect }: TransactionLinkPickerProps) {
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [amountFilter, setAmountFilter] = React.useState("");

  const restoreSuggestion = React.useCallback(() => {
    if (!sourceRow) return;
    setDateFrom(shiftDate(sourceRow.addedAt, -7));
    setDateTo(shiftDate(sourceRow.addedAt, 7));
    setAmountFilter(String(sourceRow.amount));
  }, [sourceRow]);

  React.useEffect(() => {
    if (open && sourceRow) restoreSuggestion();
  }, [open, sourceRow?.id, restoreSuggestion]);

  const rows = React.useMemo<LinkCandidateRow[]>(() => {
    if (!sourceRow) return [];
    const amountCents = amountFilter.trim() === "" ? null : Math.round(Number(amountFilter.replace(",", ".")) * 100);
    return [
      ...incomes.map((transaction) => ({ kind: "income" as const, transaction })),
      ...expenses.map((transaction) => ({ kind: "expense" as const, transaction })),
    ]
      .filter((candidate) => !(candidate.kind === sourceKind && candidate.transaction.id === sourceRow.id))
      .filter((candidate) => candidate.transaction.transferLinkId == null)
      .filter((candidate) => transactionLinkDirectionIssue(sourceKind, sourceRow, candidate.kind, candidate.transaction, accountTypes) == null)
      .filter((candidate) => {
        const date = candidate.transaction.addedAt.slice(0, 10);
        if (dateFrom && date < dateFrom) return false;
        if (dateTo && date > dateTo) return false;
        return amountCents == null || Number.isNaN(amountCents) || Math.round(Number(candidate.transaction.amount) * 100) === amountCents;
      })
      .map((candidate) => {
        const source: TransactionCandidate = { kind: sourceKind, row: sourceRow };
        const target: TransactionCandidate = { kind: candidate.kind, row: candidate.transaction };
        return {
        key: `${candidate.kind}:${candidate.transaction.id}`,
        ...candidate,
        accountName: candidate.transaction.accountId == null ? "Bez konta" : accountNames.get(candidate.transaction.accountId) ?? `#${candidate.transaction.accountId}`,
        dayDistance: transactionDayDistance(candidate.transaction, sourceRow),
        exactAmount: Math.round(Number(candidate.transaction.amount) * 100) === Math.round(Number(sourceRow.amount) * 100),
        oppositeKind: candidate.kind !== sourceKind,
        otherAccount: candidate.transaction.accountId !== sourceRow.accountId,
        score: transactionLinkScore(source, target),
        };
      })
      .sort((left, right) => right.score - left.score || left.dayDistance - right.dayDistance);
  }, [accountNames, accountTypes, amountFilter, dateFrom, dateTo, expenses, incomes, sourceKind, sourceRow]);

  const columns = React.useMemo<DataGridColumn<LinkCandidateRow>[]>(() => [
    { key: "date", label: "Data", value: (row) => row.transaction.addedAt.slice(0, 10), render: (row) => formatDate(row.transaction.addedAt), sortable: true, width: 120 },
    { key: "kind", label: "Kierunek", value: (row) => row.kind === "income" ? "Przychód" : "Wydatek", filterable: true, width: 120 },
    { key: "name", label: "Nazwa", value: (row) => row.transaction.name, sortable: true, width: 260 },
    { key: "amount", label: "Kwota", value: (row) => Number(row.transaction.amount), render: (row) => formatCurrency(row.transaction.amount), sortable: true, width: 130, align: "right" },
    { key: "account", label: "Konto", value: (row) => row.accountName, filterable: true, width: 170 },
    { key: "match", label: "Dopasowanie", value: (row) => row.exactAmount && row.oppositeKind ? "Typowe" : "Nietypowe", width: 130 },
  ], []);

  return <Modal open={open} onClose={onClose} title="Powiąż transakcję" size="xl" preserveScroll>
    {sourceRow && <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-semibold">
        <ModuleBadge tone={sourceKind === "income" ? "success" : "danger"} size="sm">{sourceKind === "income" ? "Przychód" : "Wydatek"}</ModuleBadge>
        <span>{formatDate(sourceRow.addedAt)} · {sourceRow.accountId == null ? "Bez konta" : accountNames.get(sourceRow.accountId) ?? `#${sourceRow.accountId}`} · {sourceRow.name} · {formatCurrency(sourceRow.amount)}</span>
      </div>
      <DataGrid<LinkCandidateRow>
        gridId="transaction-link-picker"
        rows={rows}
        columns={columns}
        getRowId={(row) => row.key}
        defaultPageSize={10}
        emptyMessage="Brak wolnych operacji spełniających wybrane filtry."
        actionsWidth={60}
        actions={(candidate) => <IconButton label="Powiąż jako transfer własny" tone="primary" onClick={() => void onSelect(candidate.kind, candidate.transaction)}><Link2 size={17} aria-hidden="true" /></IconButton>}
        toolbar={<div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold text-slate-600">Od<input type="date" className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
          <label className="text-xs font-semibold text-slate-600">Do<input type="date" className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
          <label className="text-xs font-semibold text-slate-600">Kwota dokładnie<input aria-label="Filtruj po kwocie" type="number" min="0" step="0.01" placeholder="np. 547,69" className="mt-1 block w-36 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" value={amountFilter} onChange={(event) => setAmountFilter(event.target.value)} /></label>
          <button type="button" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700" onClick={restoreSuggestion}>Przywróć sugestię</button>
          <button type="button" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700" onClick={() => { setDateFrom(""); setDateTo(""); setAmountFilter(""); }}>Pokaż wszystkie</button>
        </div>}
      />
    </div>}
  </Modal>;
}
