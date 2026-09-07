import type { TransactionModel } from "../../context/useTransactionResource";
import apiClient from "../../utils/apiClient";
import { isCreditAccount } from "../../utils/accountModel";

export type TransactionKind = "income" | "expense";

export function transactionLinkDirectionIssue(
  sourceKind: TransactionKind,
  source: TransactionModel,
  counterpartKind: TransactionKind,
  counterpart: TransactionModel,
  accountTypes: Map<number, string>,
): string | null {
  if (sourceKind === "income" && counterpartKind === "income") {
    return "Nie można powiązać dwóch przychodów jako transferu własnego.";
  }
  if (sourceKind !== "expense" || counterpartKind !== "expense") return null;

  const sourceIsCreditCard = source.accountId != null && isCreditAccount({ typ_depozytu: accountTypes.get(source.accountId) ?? "" });
  const counterpartIsCreditCard = counterpart.accountId != null && isCreditAccount({ typ_depozytu: accountTypes.get(counterpart.accountId) ?? "" });
  const cardRepaymentInvolved = source.transactionType === "card_repayment" || counterpart.transactionType === "card_repayment";
  return (sourceIsCreditCard || counterpartIsCreditCard) && cardRepaymentInvolved
    ? null
    : "Transfer własny powinien łączyć wydatek z przychodem.";
}

export async function saveTransactionLink(
  sourceKind: TransactionKind,
  source: TransactionModel,
  counterpartKind: TransactionKind,
  counterpart: TransactionModel,
): Promise<"created" | "changed"> {
  const payload = {
    kind: sourceKind,
    transactionId: source.id,
    counterpartKind,
    counterpartId: counterpart.id,
  };

  if (source.transferLinkId != null) {
    await apiClient.patch(`/konta/import-transfers/${source.transferLinkId}`, payload);
    return "changed";
  }

  await apiClient.post("/konta/import-transfers", payload);
  return "created";
}

export async function removeTransactionLink(source: TransactionModel): Promise<void> {
  if (source.transferLinkId == null) return;
  await apiClient.delete(`/konta/import-transfers/${source.transferLinkId}`);
}
