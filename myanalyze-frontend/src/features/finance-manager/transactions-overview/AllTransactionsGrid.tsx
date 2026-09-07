import React from "react";
import { Eye, EyeOff, Link2, Unlink2 } from "lucide-react";
import DataGrid, { type DataGridColumn } from "../../../components/DataGrid";
import HelpBadge from "../../../components/HelpBadge";
import IconButton from "../../../components/IconButton";
import ModuleBadge from "../../../components/ModuleBadge";
import type { TransactionModel } from "../../../context/useTransactionResource";
import type { Account } from "../../../types/account";
import type { CustomTransactionType } from "../../../types/customTransactionType";
import { formatCurrency, formatDate } from "../../../utils/formatters";
import { signedTransactionAmount, transactionKindLabel, transactionStatus } from "../transactionPresentation";
import { accountLabel } from "./presentation";
import { TransactionAmountRangeFilters, TransactionDateRangeFilters } from "./TransactionRangeFilters";
import type { DirectionFilter, LinkFilter, OverviewRow } from "./types";
import type { TransactionKind } from "../transactionLinks";

interface AllTransactionsGridProps {
  rows: OverviewRow[];
  accounts: Account[];
  customTypes: CustomTransactionType[];
  accountNames: Map<number, string>;
  linkedPairCount: number;
  direction: DirectionFilter;
  linkFilter: LinkFilter;
  dateFrom: string;
  dateTo: string;
  amountFrom: string;
  amountTo: string;
  initialDateRange: { from: string; to: string };
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  onDirectionChange: (value: DirectionFilter) => void;
  onLinkFilterChange: (value: LinkFilter) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onAmountFromChange: (value: string) => void;
  onAmountToChange: (value: string) => void;
  onResetFilters: () => void;
  counterpartFor: (row: OverviewRow) => { kind: TransactionKind; transaction: TransactionModel } | null;
  onShowDetails: (row: OverviewRow) => void;
  onLink: (row: OverviewRow) => void;
  onUnlink: (row: OverviewRow) => void;
  onToggleAnalysis: (row: OverviewRow) => void | Promise<void>;
  onInlineSave: (row: OverviewRow) => Promise<void>;
  onBulkLabelChange: (rows: OverviewRow[], customTypeId: number | null) => Promise<void>;
  onDropLink: (source: OverviewRow, target: OverviewRow) => void;
}

export default function AllTransactionsGrid({
  rows, accounts, customTypes, accountNames, linkedPairCount, direction, linkFilter, dateFrom, dateTo, amountFrom, amountTo,
  initialDateRange, refreshing, onRefresh, onDirectionChange, onLinkFilterChange, onDateFromChange, onDateToChange,
  onAmountFromChange, onAmountToChange, onResetFilters, counterpartFor, onShowDetails, onLink, onUnlink, onToggleAnalysis,
  onInlineSave, onBulkLabelChange, onDropLink,
}: AllTransactionsGridProps) {
  const [changingLabel, setChangingLabel] = React.useState(false);
  const changeLabel = async (selectedRows: OverviewRow[], customTypeId: number | null) => {
    setChangingLabel(true);
    try { await onBulkLabelChange(selectedRows, customTypeId); }
    finally { setChangingLabel(false); }
  };
  const columns = React.useMemo<DataGridColumn<OverviewRow>[]>(() => [
    { key: "date", label: "Data", value: (row) => row.transaction.addedAt.slice(0, 10), render: (row) => formatDate(row.transaction.addedAt), sortable: true, width: 130 },
    { key: "kind", label: "Rodzaj", value: (row) => transactionKindLabel(row.kind), render: (row) => <ModuleBadge tone={row.kind === "income" ? "success" : "danger"} size="sm">{transactionKindLabel(row.kind)}</ModuleBadge>, sortable: true, filterable: true, width: 125 },
    { key: "name", label: "Nazwa", value: (row) => row.transaction.name, sortable: true, width: 270 },
    { key: "amount", label: "Kwota", value: (row) => Math.abs(Number(row.transaction.amount)), render: (row) => <span className={`font-semibold ${row.kind === "income" ? "text-emerald-700" : "text-rose-700"}`}>{formatCurrency(signedTransactionAmount(row.kind, row.transaction.amount))}</span>, sortable: true, width: 140, align: "right" },
    { key: "label", label: "Etykieta", value: (row) => row.transaction.customTypeName ?? "Bez etykiety", sortable: true, filterable: true, width: 175, edit: { type: "select", value: (row) => String(row.transaction.customTypeId ?? "none"), options: [{ value: "none", label: "Bez etykiety" }, ...customTypes.map((item) => ({ value: String(item.id), label: item.name }))], update: (row, value) => { const customTypeId = value === "none" ? null : Number(value); const customType = customTypes.find((item) => item.id === customTypeId); return { ...row, transaction: { ...row.transaction, customTypeId, customTypeName: customType?.name ?? null } }; } } },
    { key: "account", label: "Konto", value: (row) => accountLabel(row.transaction, accountNames), sortable: true, filterable: true, width: 180, edit: { type: "select", value: (row) => String(row.transaction.accountId ?? ""), options: [{ value: "", label: "Nieprzypisane" }, ...accounts.map((account) => ({ value: String(account.id), label: account.nazwa }))], disabled: (row) => !row.transaction.importSource, update: (row, value) => ({ ...row, transaction: { ...row.transaction, accountId: value === "" ? null : Number(value) } }) } },
    { key: "status", label: "Status", value: (row) => transactionStatus(row.transaction).value, render: (row) => { const status = transactionStatus(row.transaction); return <ModuleBadge tone={status.tone} size="sm">{status.label}</ModuleBadge>; }, sortable: true, filterable: true, width: 165 },
    { key: "analysis", label: "Analiza", value: (row) => row.transaction.transferLinkId != null ? "Transfer własny" : row.transaction.excludedFromAnalysis ? "Wyłączona ręcznie" : "Liczona", render: (row) => row.transaction.transferLinkId != null ? <HelpBadge tone="info" size="sm" help="Nie jest liczony jako przychód ani wydatek w analizach.">↔ Transfer własny</HelpBadge> : row.transaction.excludedFromAnalysis ? <ModuleBadge tone="warning" size="sm">⊘ Wyłączona ręcznie</ModuleBadge> : <ModuleBadge tone="success" size="sm">✓ Liczona</ModuleBadge>, sortable: true, filterable: true, width: 185 },
    { key: "counterpart", label: "Powiązana transakcja", value: (row) => { const counterpart = counterpartFor(row); return counterpart ? `${accountLabel(counterpart.transaction, accountNames)} ${counterpart.transaction.name} ${counterpart.transaction.amount} ${counterpart.transaction.addedAt.slice(0, 10)}` : row.transaction.transferCounterpartName ?? ""; }, render: (row) => { if (row.transaction.transferLinkId == null) return <span className="text-sm text-slate-400">-</span>; const counterpart = counterpartFor(row); if (!counterpart) return <span className="text-sm text-amber-700">{row.transaction.transferCounterpartName ?? "Powiązana operacja"}</span>; return <button type="button" className="min-w-0 text-left text-sm hover:underline" onClick={() => onShowDetails(row)}><span className="block truncate text-slate-500">{accountLabel(counterpart.transaction, accountNames)}</span><strong className="block truncate text-slate-800">{counterpart.transaction.name}</strong><span className={`block font-semibold ${counterpart.kind === "income" ? "text-emerald-700" : "text-rose-700"}`}>{formatCurrency(signedTransactionAmount(counterpart.kind, counterpart.transaction.amount))}</span><span className="block text-xs text-slate-500">{formatDate(counterpart.transaction.addedAt)}</span></button>; }, width: 300 },
  ], [accountNames, accounts, counterpartFor, customTypes, onShowDetails]);

  const filtersActive = Boolean(dateFrom || dateTo || direction !== "all" || linkFilter !== "all" || amountFrom || amountTo);
  const defaultRangeActive = dateFrom === initialDateRange.from && dateTo === initialDateRange.to;

  return <DataGrid<OverviewRow>
    gridId="manager-transactions"
    rows={rows}
    columns={columns}
    getRowId={(row) => row.key}
    defaultSort={{ key: "date", direction: "desc" }}
    defaultPageSize={25}
    exportFileName="transakcje.csv"
    actionsWidth={150}
    selectable
    bulkActions={(selectedRows) => <select
      aria-label="Zmień etykietę zaznaczonych"
      value=""
      disabled={changingLabel}
      className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm disabled:opacity-50"
      onChange={(event) => {
        const value = event.target.value;
        if (value !== "") void changeLabel(selectedRows, value === "none" ? null : Number(value));
      }}
    >
      <option value="">{changingLabel ? "Zapisywanie…" : `Zmień etykietę (${selectedRows.length})…`}</option>
      <option value="none">Bez etykiety</option>
      {customTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>}
    onInlineSave={onInlineSave}
    getRowClassName={(row) => row.transaction.transferLinkId != null ? "outline outline-1 -outline-offset-1 outline-blue-200" : ""}
    rowDrag={{ label: (row) => `Przeciągnij „${row.transaction.name}”, aby powiązać`, onDrop: onDropLink }}
    toolbar={<div className="flex flex-wrap items-end gap-2">
      <label className="text-xs font-semibold text-slate-600">Kierunek<select className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal" value={direction} onChange={(event) => onDirectionChange(event.target.value as DirectionFilter)}><option value="all">Wszystkie</option><option value="income">Przychody</option><option value="expense">Wydatki</option></select></label>
      <label className="text-xs font-semibold text-slate-600">Powiązanie<select className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal" value={linkFilter} onChange={(event) => onLinkFilterChange(event.target.value as LinkFilter)}><option value="all">Wszystkie</option><option value="linked">Powiązane</option><option value="unlinked">Niepowiązane</option></select></label>
      <TransactionDateRangeFilters dateFrom={dateFrom} dateTo={dateTo} onDateFromChange={onDateFromChange} onDateToChange={onDateToChange} />
      <TransactionAmountRangeFilters amountFrom={amountFrom} amountTo={amountTo} onAmountFromChange={onAmountFromChange} onAmountToChange={onAmountToChange} />
      {filtersActive && <button type="button" className="rounded-lg px-2 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100" onClick={onResetFilters}>Wyczyść filtry</button>}
      {defaultRangeActive && <ModuleBadge tone="info" size="sm">Domyślnie: ostatnie 30 dni</ModuleBadge>}
      <ModuleBadge tone="info" size="sm">Relacje: {linkedPairCount}</ModuleBadge>
    </div>}
    refresh={{ onRefresh, refreshing, label: "Odśwież transakcje" }}
    actions={(row) => row.transaction.transferLinkId == null ? <>
      {row.transaction.importSource && <IconButton label={row.transaction.excludedFromAnalysis ? "Włącz w analizach" : "Wyłącz z analiz"} tone="info" onClick={() => void onToggleAnalysis(row)}>{row.transaction.excludedFromAnalysis ? <Eye size={18} aria-hidden="true" /> : <EyeOff size={18} aria-hidden="true" />}</IconButton>}
      <IconButton label="Powiąż transakcję" tone="info" onClick={() => onLink(row)}><Link2 size={18} aria-hidden="true" /></IconButton>
    </> : <>
      <IconButton label="Pokaż szczegóły powiązania" tone="info" onClick={() => onShowDetails(row)}><Eye size={18} aria-hidden="true" /></IconButton>
      <IconButton label="Zmień powiązanie" tone="info" onClick={() => onLink(row)}><Link2 size={18} aria-hidden="true" /></IconButton>
      <IconButton label="Usuń powiązanie" tone="danger" onClick={() => onUnlink(row)}><Unlink2 size={18} aria-hidden="true" /></IconButton>
    </>}
  />;
}
