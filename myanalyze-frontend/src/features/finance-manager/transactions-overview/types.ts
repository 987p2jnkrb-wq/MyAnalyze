import type { TransactionModel } from "../../../context/useTransactionResource";
import type { TransactionKind } from "../transactionLinks";

export type TransactionsSubTab = "all" | "review" | "rejected" | "linked";
export type OverviewRow = { key: string; kind: TransactionKind; transaction: TransactionModel };
export type DirectionFilter = "all" | TransactionKind;
export type LinkFilter = "all" | "linked" | "unlinked";
export type LinkedPairRow = {
  id: number;
  leftKind: TransactionKind;
  left: TransactionModel;
  rightKind: TransactionKind;
  right: TransactionModel;
  amountDifference: number;
  dateDifference: number;
  sameAccount: boolean;
};
