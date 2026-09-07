// Keep in sync with backend/utils/transactionType.ts.
export type TransactionType =
  | "card_payment"
  | "transfer_in"
  | "transfer_out"
  | "top_up"
  | "cash_withdrawal"
  | "direct_debit"
  | "fee"
  | "loan_disbursement"
  | "loan_repayment"
  | "card_repayment"
  | "refund"
  | "other";

export const TRANSACTION_TYPE_OPTIONS: { value: TransactionType; label: string; kinds: ("income" | "expense")[] }[] = [
  { value: "card_payment", label: "Płatność kartą", kinds: ["expense"] },
  { value: "transfer_in", label: "Przelew przychodzący", kinds: ["income"] },
  { value: "transfer_out", label: "Przelew wychodzący", kinds: ["expense"] },
  { value: "top_up", label: "Zasilenie", kinds: ["income"] },
  { value: "cash_withdrawal", label: "Wypłata gotówki", kinds: ["expense"] },
  { value: "direct_debit", label: "Polecenie zapłaty", kinds: ["expense"] },
  { value: "fee", label: "Opłata bankowa", kinds: ["expense"] },
  { value: "loan_disbursement", label: "Uruchomienie kredytu", kinds: ["income"] },
  { value: "loan_repayment", label: "Spłata kredytu", kinds: ["expense"] },
  { value: "card_repayment", label: "Spłata karty", kinds: ["expense"] },
  { value: "refund", label: "Zwrot środków", kinds: ["income"] },
  { value: "other", label: "Inna operacja", kinds: ["income", "expense"] },
];

export function transactionTypeLabel(value: TransactionType | null | undefined): string {
  if (!value) return "Nie określono";
  return TRANSACTION_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function transactionTypeOptionsFor(kind: "income" | "expense") {
  return TRANSACTION_TYPE_OPTIONS.filter((option) => option.kinds.includes(kind));
}
