import type { DataGridColumn } from "../../../components/DataGrid";
import ModuleBadge from "../../../components/ModuleBadge";
import { formatCurrency, formatDate } from "../../../utils/formatters";
import type { SuggestedTransactionPair } from "../transactionLinkCandidates";
import { accountLabel } from "./presentation";

export function buildSuggestionColumns(accountNames: Map<number, string>): DataGridColumn<SuggestedTransactionPair>[] {
  return [
    { key: "date", label: "Data", value: (row) => row.expense.row.addedAt.slice(0, 10), render: (row) => formatDate(row.expense.row.addedAt), sortable: true, width: 125 },
    { key: "expense", label: "Wydatek", value: (row) => row.expense.row.name, sortable: true, width: 240 },
    { key: "expenseAccount", label: "Konto wydatku", value: (row) => accountLabel(row.expense.row, accountNames), filterable: true, width: 175 },
    { key: "income", label: "Przychód", value: (row) => row.income.row.name, sortable: true, width: 240 },
    { key: "incomeAccount", label: "Konto przychodu", value: (row) => accountLabel(row.income.row, accountNames), filterable: true, width: 175 },
    { key: "amount", label: "Kwota", value: (row) => row.expense.row.amount, render: (row) => formatCurrency(Math.abs(Number(row.expense.row.amount))), sortable: true, width: 125, align: "right" },
    { key: "days", label: "Różnica dni", value: (row) => row.dateDifference, render: (row) => `${row.dateDifference} dni`, sortable: true, width: 125, align: "right" },
    { key: "confidence", label: "Sugestia", value: (row) => row.confidence === "strong" ? "Bezpieczne" : "Do sprawdzenia", render: (row) => <div className="min-w-0"><ModuleBadge tone={row.confidence === "strong" ? "success" : "warning"} size="sm">{row.confidence === "strong" ? "✓ Bezpieczne" : "? Do sprawdzenia"}</ModuleBadge><span className="mt-1 block text-xs leading-4 text-slate-500">{row.confidenceExplanation}</span></div>, sortable: true, filterable: true, width: 235 },
  ];
}
