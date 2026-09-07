import type { TransactionModel } from "../../context/useTransactionResource";

export function isIncludedInAnalysis(row: TransactionModel): boolean {
  return !row.excludedFromAnalysis && row.transferLinkId == null;
}

export function isActualTransaction(row: TransactionModel): boolean {
  return row.zrealizowany && isIncludedInAnalysis(row);
}

export function isManualPlanEntry(row: TransactionModel): boolean {
  return isIncludedInAnalysis(row)
    && !row.importSource
    && (!row.generatedFromRecurring || row.recurringQueueStatus === "customized");
}

export function isOutstandingStandalonePlan(row: TransactionModel): boolean {
  return !row.zrealizowany && isManualPlanEntry(row);
}
export function outstandingStandalonePlanAmount(row: TransactionModel): number {
  if (!isOutstandingStandalonePlan(row)) return 0;
  const amount = Number(row.amount);
  const allocated = Number(row.allocatedToPlan ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.max(0, Math.round((amount - (Number.isFinite(allocated) ? allocated : 0)) * 100) / 100);
}
