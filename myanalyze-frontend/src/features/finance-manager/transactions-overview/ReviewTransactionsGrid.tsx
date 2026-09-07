import React from "react";
import { Eye, Link2, Settings2, X } from "lucide-react";
import DataGrid from "../../../components/DataGrid";
import Button from "../../../components/Button";
import IconButton from "../../../components/IconButton";
import ModuleBadge from "../../../components/ModuleBadge";
import type { SuggestedTransactionPair } from "../transactionLinkCandidates";
import { TransactionDateRangeFilters } from "./TransactionRangeFilters";
import { buildSuggestionColumns } from "./suggestionColumns";

interface ReviewTransactionsGridProps {
  rows: SuggestedTransactionPair[];
  accountNames: Map<number, string>;
  dateFrom: string;
  dateTo: string;
  dismissedCount: number;
  configuredSuggestionRoles: number;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onClearDates: () => void;
  onOpenSettings: () => void;
  onRestoreAllDismissed: () => void;
  onBeginBatch: (pairs: SuggestedTransactionPair[]) => void;
  onDismiss: (pairs: SuggestedTransactionPair[]) => void;
  onReview: (pair: SuggestedTransactionPair) => void;
  onLink: (pair: SuggestedTransactionPair) => void | Promise<void>;
}

export default function ReviewTransactionsGrid({ rows, accountNames, dateFrom, dateTo, dismissedCount, configuredSuggestionRoles, refreshing, onRefresh, onDateFromChange, onDateToChange, onClearDates, onOpenSettings, onRestoreAllDismissed, onBeginBatch, onDismiss, onReview, onLink }: ReviewTransactionsGridProps) {
  const columns = React.useMemo(() => buildSuggestionColumns(accountNames), [accountNames]);
  return <DataGrid<SuggestedTransactionPair>
    gridId="manager-transaction-review"
    rows={rows}
    columns={columns}
    getRowId={(row) => row.id}
    defaultPageSize={25}
    selectable
    exportFileName="sugestie-transferow.csv"
    actionsWidth={145}
    emptyMessage="Brak oczywistych par do sprawdzenia w wybranym zakresie. To nie oznacza, że nie możesz utworzyć ręcznego powiązania w zakładce Wszystkie."
    toolbar={<div className="flex flex-wrap items-end gap-2">
      <TransactionDateRangeFilters dateFrom={dateFrom} dateTo={dateTo} onDateFromChange={onDateFromChange} onDateToChange={onDateToChange} onClear={onClearDates} />
      <Button tone="neutral" size="sm" onClick={onOpenSettings}><Settings2 size={16} aria-hidden="true" />Role kont{configuredSuggestionRoles ? ` (${configuredSuggestionRoles})` : ""}</Button>
      {dismissedCount > 0 && <Button tone="neutral" size="sm" onClick={onRestoreAllDismissed}>Przywróć wszystkie odrzucone ({dismissedCount})</Button>}
      <ModuleBadge tone="info" size="sm">Możesz zaznaczyć dowolne sugestie. Niejednoznaczne pary wymagają świadomego potwierdzenia.</ModuleBadge>
    </div>}
    refresh={{ onRefresh, refreshing, label: "Odśwież transakcje" }}
    bulkActions={(selectedRows) => selectedRows.length ? <div className="flex flex-wrap gap-2"><Button tone="primary" size="sm" onClick={() => onBeginBatch(selectedRows)}>Powiąż zaznaczone ({selectedRows.length})</Button><Button tone="neutral" size="sm" onClick={() => onDismiss(selectedRows)}>Odrzuć zaznaczone ({selectedRows.length})</Button></div> : null}
    actions={(pair) => <div className="flex gap-1"><IconButton label="Porównaj sugestię" title="Porównaj kwoty, daty i konta przed podjęciem decyzji" tone="info" onClick={() => onReview(pair)}><Eye size={17} aria-hidden="true" /></IconButton><IconButton label="Powiąż jako transfer własny" title="Potwierdź tę parę - nie będzie liczona jako przychód i wydatek w analizach" tone="primary" onClick={() => void onLink(pair)}><Link2 size={17} aria-hidden="true" /></IconButton><IconButton label="Odrzuć sugestię" title="Ukryj tę sugestię; transakcje zostają bez zmian. Możesz ją przywrócić w Odrzuconych." tone="neutral" onClick={() => onDismiss([pair])}><X size={17} aria-hidden="true" /></IconButton></div>}
  />;
}
