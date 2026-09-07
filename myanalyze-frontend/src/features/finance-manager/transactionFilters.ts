import type { TransactionModel } from "../../context/useTransactionResource";

export function isTransactionInDateRange(row: TransactionModel, from: string, to: string): boolean {
  const date = row.addedAt.slice(0, 10);
  return (!from || date >= from) && (!to || date <= to);
}

export function isTransactionInAmountRange(row: TransactionModel, from: string, to: string): boolean {
  const amount = Math.abs(Number(row.amount));
  const minimum = from.trim() ? Number(from.replace(",", ".")) : null;
  const maximum = to.trim() ? Number(to.replace(",", ".")) : null;
  return (minimum == null || !Number.isFinite(minimum) || amount >= minimum)
    && (maximum == null || !Number.isFinite(maximum) || amount <= maximum);
}

function dateInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function lastNDaysRange(days: number, now = new Date()): { from: string; to: string } {
  const safeDays = Math.max(1, Math.trunc(days));
  const to = new Date(now);
  const from = new Date(now);
  from.setDate(from.getDate() - (safeDays - 1));
  return { from: dateInputValue(from), to: dateInputValue(to) };
}
