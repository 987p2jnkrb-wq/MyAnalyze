import React from "react";
import { Eye, Link2, Unlink2 } from "lucide-react";
import DataGrid, { type DataGridColumn } from "../../../components/DataGrid";
import Button from "../../../components/Button";
import HelpBadge from "../../../components/HelpBadge";
import IconButton from "../../../components/IconButton";
import { formatCurrency, formatDate } from "../../../utils/formatters";
import { signedTransactionAmount } from "../transactionPresentation";
import { accountLabel, linkedPairStatus } from "./presentation";
import { TransactionDateRangeFilters } from "./TransactionRangeFilters";
import type { LinkedPairRow, OverviewRow } from "./types";

interface LinkedTransactionsGridProps {
  rows: LinkedPairRow[];
  accountNames: Map<number, string>;
  dateFrom: string;
  dateTo: string;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onClearDates: () => void;
  onBatchUnlink: (pairs: LinkedPairRow[]) => void;
  onShowDetails: (row: OverviewRow) => void;
  onLink: (row: OverviewRow) => void;
  onUnlink: (row: OverviewRow) => void;
}

function leftOverviewRow(pair: LinkedPairRow): OverviewRow {
  return { key: `${pair.leftKind}:${pair.left.id}`, kind: pair.leftKind, transaction: pair.left };
}

export default function LinkedTransactionsGrid({ rows, accountNames, dateFrom, dateTo, refreshing, onRefresh, onDateFromChange, onDateToChange, onClearDates, onBatchUnlink, onShowDetails, onLink, onUnlink }: LinkedTransactionsGridProps) {
  const columns = React.useMemo<DataGridColumn<LinkedPairRow>[]>(() => [
    { key: "date", label: "Data", value: (row) => row.left.addedAt.slice(0, 10), render: (row) => formatDate(row.left.addedAt), sortable: true, width: 125 },
    { key: "left", label: "Strona A", value: (row) => `${accountLabel(row.left, accountNames)} ${row.left.name}`, render: (row) => <div className="min-w-0"><span className="block truncate text-xs text-slate-500">{accountLabel(row.left, accountNames)}</span><strong className="block truncate text-slate-800">{row.left.name}</strong></div>, sortable: true, width: 270 },
    { key: "leftAccount", label: "Konto A", value: (row) => accountLabel(row.left, accountNames), filterable: true, defaultVisible: false, width: 175 },
    { key: "right", label: "Strona B", value: (row) => `${accountLabel(row.right, accountNames)} ${row.right.name}`, render: (row) => <div className="min-w-0"><span className="block truncate text-xs text-slate-500">{accountLabel(row.right, accountNames)}</span><strong className="block truncate text-slate-800">{row.right.name}</strong></div>, sortable: true, width: 270 },
    { key: "rightAccount", label: "Konto B", value: (row) => accountLabel(row.right, accountNames), filterable: true, defaultVisible: false, width: 175 },
    { key: "leftAmount", label: "Kwota A", value: (row) => Math.abs(Number(row.left.amount)), render: (row) => <span className={row.leftKind === "income" ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>{formatCurrency(signedTransactionAmount(row.leftKind, row.left.amount))}</span>, sortable: true, width: 135, align: "right" },
    { key: "rightAmount", label: "Kwota B", value: (row) => Math.abs(Number(row.right.amount)), render: (row) => <span className={row.rightKind === "income" ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>{formatCurrency(signedTransactionAmount(row.rightKind, row.right.amount))}</span>, sortable: true, width: 135, align: "right" },
    { key: "difference", label: "Różnica", value: (row) => row.amountDifference, render: (row) => <span className={row.amountDifference === 0 ? "font-semibold text-slate-700" : "font-semibold text-amber-700"}>{row.amountDifference === 0 ? "" : "⚠ "}{formatCurrency(row.amountDifference)}</span>, sortable: true, width: 130, align: "right" },
    { key: "status", label: "Status", value: (row) => linkedPairStatus(row).label, render: (row) => { const status = linkedPairStatus(row); return <HelpBadge tone={status.tone} size="sm" help={status.hint}>{status.label}</HelpBadge>; }, sortable: true, filterable: true, width: 205 },
  ], [accountNames]);

  return <DataGrid<LinkedPairRow>
    gridId="manager-linked-transactions"
    rows={rows}
    columns={columns}
    getRowId={(row) => row.id}
    defaultSort={{ key: "date", direction: "desc" }}
    defaultPageSize={25}
    selectable
    exportFileName="powiazane-transfery.csv"
    actionsWidth={185}
    emptyMessage="Brak potwierdzonych transferów własnych w wybranym zakresie."
    toolbar={<div className="flex flex-wrap items-end gap-2"><TransactionDateRangeFilters dateFrom={dateFrom} dateTo={dateTo} onDateFromChange={onDateFromChange} onDateToChange={onDateToChange} onClear={onClearDates} /></div>}
    refresh={{ onRefresh, refreshing, label: "Odśwież transakcje" }}
    bulkActions={(selectedRows) => selectedRows.length ? <Button tone="danger" size="sm" onClick={() => onBatchUnlink(selectedRows)}>Usuń powiązania ({selectedRows.length})</Button> : null}
    actions={(pair) => { const row = leftOverviewRow(pair); return <div className="flex gap-1"><IconButton label="Szczegóły" title="Pokaż obie strony transferu" tone="info" onClick={() => onShowDetails(row)}><Eye size={17} aria-hidden="true" /></IconButton><IconButton label="Zmień" title="Wybierz inną drugą stronę transferu" tone="info" onClick={() => onLink(row)}><Link2 size={17} aria-hidden="true" /></IconButton><IconButton label="Usuń" title="Usuń tylko powiązanie - obie transakcje pozostaną w historii" tone="danger" onClick={() => onUnlink(row)}><Unlink2 size={17} aria-hidden="true" /></IconButton></div>; }}
  />;
}
