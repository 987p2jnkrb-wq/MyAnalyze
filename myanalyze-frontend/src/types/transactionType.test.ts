import { TRANSACTION_TYPE_OPTIONS } from "./transactionType";

it("utrzymuje kontrakt typów transakcji zgodny z backendem", () => {
  expect(TRANSACTION_TYPE_OPTIONS.map((option) => option.value)).toEqual([
    "card_payment", "transfer_in", "transfer_out", "top_up", "cash_withdrawal", "direct_debit",
    "fee", "loan_disbursement", "loan_repayment", "card_repayment", "refund", "other",
  ]);
});
