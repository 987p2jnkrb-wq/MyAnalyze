// Keep in sync with myanalyze-frontend/src/types/transactionType.ts.
export const transactionTypes = [
  'card_payment', 'transfer_in', 'transfer_out', 'top_up', 'cash_withdrawal',
  'direct_debit', 'fee', 'loan_disbursement', 'loan_repayment', 'card_repayment', 'refund', 'other',
] as const;

export type TransactionType = typeof transactionTypes[number];

const labels: Record<TransactionType, string> = {
  card_payment: 'Płatność kartą',
  transfer_in: 'Przelew przychodzący',
  transfer_out: 'Przelew wychodzący',
  top_up: 'Zasilenie',
  cash_withdrawal: 'Wypłata gotówki',
  direct_debit: 'Polecenie zapłaty',
  fee: 'Opłata bankowa',
  loan_disbursement: 'Uruchomienie kredytu',
  loan_repayment: 'Spłata kredytu',
  card_repayment: 'Spłata karty',
  refund: 'Zwrot środków',
  other: 'Inna operacja',
};

export function normalizeTransactionType(value: unknown): TransactionType | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  return typeof value === 'string' && transactionTypes.includes(value as TransactionType) ? value as TransactionType : undefined;
}

export function transactionTypeLabel(value: TransactionType | null): string {
  return value ? labels[value] : 'Nie określono';
}
