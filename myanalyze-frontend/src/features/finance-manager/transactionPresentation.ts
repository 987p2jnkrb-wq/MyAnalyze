import type { ModuleBadgeTone } from "../../components/ModuleBadge";
import type { TransactionModel } from "../../context/useTransactionResource";
import type { TransactionKind } from "./transactionLinks";

export function transactionKindLabel(kind: TransactionKind): string {
  return kind === "income" ? "Przychód" : "Wydatek";
}

export function signedTransactionAmount(kind: TransactionKind, amount: number): number {
  return kind === "income" ? Math.abs(Number(amount)) : -Math.abs(Number(amount));
}

export function transactionStatus(row: TransactionModel): { value: string; label: string; tone: ModuleBadgeTone } {
  if (row.importStatus === "pending") return { value: "Oczekujące bankowe", label: "Oczekująca bankowa", tone: "warning" };
  if (row.importStatus === "cancelled") return { value: "Anulowane bankowe", label: "Anulowana bankowa", tone: "danger" };
  return row.zrealizowany
    ? { value: "Zrealizowane", label: "Zrealizowany", tone: "success" }
    : { value: "Zaplanowane", label: "Zaplanowany", tone: "warning" };
}
