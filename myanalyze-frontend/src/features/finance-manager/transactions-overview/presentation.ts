import type { TransactionModel } from "../../../context/useTransactionResource";
import type { LinkedPairRow } from "./types";

export function accountLabel(row: TransactionModel, accountNames: Map<number, string>): string {
  return row.accountId == null ? "Bez konta" : accountNames.get(row.accountId) ?? `#${row.accountId}`;
}

export function linkedPairStatus(pair: LinkedPairRow): { label: string; tone: "success" | "info"; hint: string } {
  return pair.leftKind !== pair.rightKind && !pair.sameAccount && pair.amountDifference === 0
    ? { label: "✓ Potwierdzone", tone: "success", hint: "Potwierdzony transfer o typowych parametrach." }
    : { label: "✓ Potwierdzone · nietypowe", tone: "info", hint: "Powiązanie zostało potwierdzone, ale kwota, konto lub kierunek są nietypowe." };
}
