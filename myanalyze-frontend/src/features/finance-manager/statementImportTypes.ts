import type { TransactionType } from "../../types/transactionType";

export type StatementTransactionKind = "expense" | "income";
export type StatementBankStatus = "completed" | "pending" | "cancelled";
export type StatementInstrumentType = "account" | "debit_card" | "credit_card";
export type StatementApplicationType = "normal_transaction" | "transfer_candidate" | "card_payment" | "refund" | "unknown";

export type StatementDuplicateState = "already-imported" | "hard-duplicate" | "same-file" | "possible-overlap" | "own-transfer";

export interface StatementSourceInstrument {
  bank: string;
  identifier: string;
  type: StatementInstrumentType;
  mappedAccountId?: number;
}

export interface StatementPotentialOverlap {
  sourceKey: string;
  accountName: string;
  reason: "same-transaction" | "own-transfer";
  transactionId: number;
  kind: StatementTransactionKind;
  transactionName: string;
  transactionDate: string;
  transactionAmount: number;
}

export interface StatementTransferCandidate {
  transactionId: number;
  kind: StatementTransactionKind;
  accountName: string;
  transactionName: string;
  transactionDate: string;
  transactionAmount: number;
}

export interface StatementPlanCandidate {
  kind: StatementTransactionKind;
  source: "one_time" | "recurring";
  planId: number;
  occurrenceDate: string | null;
  name: string;
  amount: number;
  remainingAmount: number;
  date: string;
  recommended: boolean;
}

export interface StatementExistingCandidate {
  kind: StatementTransactionKind;
  transactionId: number;
  name: string;
  amount: number;
  date: string;
  recommended: boolean;
}

export interface StatementPlanAllocation {
  source: "one_time" | "recurring";
  planId: number;
  occurrenceDate: string | null;
  name: string;
  allocatedAmount: number;
}

export interface StatementMatchAnalysis {
  sourceKey: string;
  planCandidates: StatementPlanCandidate[];
  existingCandidates: StatementExistingCandidate[];
}

export interface StatementTransaction {
  id: string;
  sourceKey: string;
  kind: StatementTransactionKind;
  name: string;
  amount: number;
  date: string;
  occurredAt: string;
  category: string;
  customTypeId?: number | null;
  customTypeName?: string | null;
  currency: string;
  includeByDefault: boolean;
  excludeFromAnalysis: boolean;
  note?: string;
  transactionType: TransactionType | null;
  bankStatus: StatementBankStatus;
  rawType: string;
  rawDescription: string;
  counterparty: string;
  rawData: Record<string, string>;
  sourceInstrument: StatementSourceInstrument;
  applicationType: StatementApplicationType;
  duplicateState?: StatementDuplicateState;
  resolution: string;
  planCandidates?: StatementPlanCandidate[];
  existingCandidates?: StatementExistingCandidate[];
  planAllocations?: StatementPlanAllocation[];
  transferSuggested?: boolean;
  transferCandidate?: StatementTransferCandidate;
  transferCandidates?: StatementTransferCandidate[];
}

export interface StatementParseResult {
  source: string;
  transactions: StatementTransaction[];
  rejected: StatementRejectedRow[];
  skipped: number;
  warnings: string[];
}

export interface StatementRejectedRow {
  id: string;
  rowNumber: number;
  reason: string;
  name: string;
  amount: string;
  date: string;
  currency: string;
  rawType: string;
  bankStatus: StatementBankStatus;
}
