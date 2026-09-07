import React from "react";
import { Eye, RotateCcw } from "lucide-react";
import DataGrid from "../../../components/DataGrid";
import Button from "../../../components/Button";
import IconButton from "../../../components/IconButton";
import ModuleBadge from "../../../components/ModuleBadge";
import type { SuggestedTransactionPair } from "../transactionLinkCandidates";
import { TransactionDateRangeFilters } from "./TransactionRangeFilters";
import { buildSuggestionColumns } from "./suggestionColumns";

interface RejectedTransactionsGridProps {
  rows: SuggestedTransactionPair[];
  accountNames: Map<number, string>;
  dateFrom: string;
  dateTo: string;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onClearDates: () => void;
  onRestore: (pairs: SuggestedTransactionPair[]) => void;
  onReview: (pair: SuggestedTransactionPair) => void;
}

export default function RejectedTransactionsGrid({ rows, accountNames, dateFrom, dateTo, refreshing, onRefresh, onDateFromChange, onDateToChange, onClearDates, onRestore, onReview }: RejectedTransactionsGridProps) {
  const columns = React.useMemo(() => buildSuggestionColumns(accountNames), [accountNames]);
  return <DataGrid<SuggestedTransactionPair>
    gridId="manager-transaction-rejected"
    rows={rows}
    columns={columns}
    getRowId={(row) => row.id}
    defaultPageSize={25}
    selectable
    exportFileName="odrzucone-sugestie-transferow.csv"
    actionsWidth={105}
    emptyMessage="Brak odrzuconych sugestii w wybranym zakresie."
    toolbar={<div className="flex flex-wrap items-end gap-2"><TransactionDateRangeFilters dateFrom={dateFrom} dateTo={dateTo} onDateFromChange={onDateFromChange} onDateToChange={onDateToChange} onClear={onClearDates} /><ModuleBadge tone="neutral" size="sm">Odrzucenie ukrywa sugestię, ale nie zmienia transakcji.</ModuleBadge></div>}
    refresh={{ onRefresh, refreshing, label: "Odśwież transakcje" }}
    bulkActions={(selectedRows) => selectedRows.length ? <Button tone="primary" size="sm" onClick={() => onRestore(selectedRows)}>Przywróć zaznaczone ({selectedRows.length})</Button> : null}
    actions={(pair) => <div className="flex gap-1"><IconButton label="Porównaj odrzuconą sugestię" tone="info" onClick={() => onReview(pair)}><Eye size={17} aria-hidden="true" /></IconButton><IconButton label="Przywróć sugestię" tone="primary" onClick={() => onRestore([pair])}><RotateCcw size={17} aria-hidden="true" /></IconButton></div>}
  />;
}
