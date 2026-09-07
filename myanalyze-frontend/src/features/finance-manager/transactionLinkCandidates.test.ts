import { buildSuggestedTransactionPairs, prepareSuggestedTransactionBatch } from "./transactionLinkCandidates";
import type { TransactionModel } from "../../context/useTransactionResource";

function transaction(
  id: number,
  amount: number,
  accountId: number,
  addedAt = "2026-08-21",
  overrides: Partial<TransactionModel> = {},
): TransactionModel {
  return {
    id,
    name: `Transakcja ${id}`,
    amount,
    category: "Inne",
    accountId,
    addedAt,
    zrealizowany: true,
    ...overrides,
  };
}

describe("transactionLinkCandidates", () => {
  it("marks one opposite-direction pair on different accounts and the same day as strong", () => {
    const pairs = buildSuggestedTransactionPairs(
      [transaction(1, 100, 2, "2026-08-21", { transactionType: "transfer_in" })],
      [transaction(2, 100, 1, "2026-08-21", { transactionType: "transfer_out" })],
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ confidence: "strong", dateDifference: 0, candidateCount: 1 });
  });

  it("includes a matching pair exactly three days apart", () => {
    const pairs = buildSuggestedTransactionPairs(
      [transaction(1, 100, 2, "2026-08-24", { transactionType: "transfer_in" })],
      [transaction(2, 100, 1, "2026-08-21", { transactionType: "transfer_out" })],
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ confidence: "strong", dateDifference: 3 });
  });

  it.each([4, 5, 6, 7, 8])("does not suggest a matching amount %i days apart", (days) => {
    const pairs = buildSuggestedTransactionPairs(
      [transaction(1, 100, 2, `2026-08-${21 + days}`, { transactionType: "transfer_in" })],
      [transaction(2, 100, 1, "2026-08-21", { transactionType: "transfer_out" })],
    );
    expect(pairs).toEqual([]);
  });

  it("never suggests income to income or expense to expense", () => {
    expect(buildSuggestedTransactionPairs([transaction(1, 100, 2), transaction(2, 100, 3)], [])).toEqual([]);
    expect(buildSuggestedTransactionPairs([], [transaction(1, 100, 1), transaction(2, 100, 2)])).toEqual([]);
  });

  it("excludes same-account and already linked transactions", () => {
    expect(buildSuggestedTransactionPairs([transaction(1, 100, 1)], [transaction(2, 100, 1)])).toEqual([]);
    expect(buildSuggestedTransactionPairs([{ ...transaction(1, 100, 2), transferLinkId: 9 }], [transaction(2, 100, 1)])).toEqual([]);
  });

  it("respects account roles when narrowing suggestions", () => {
    const income = transaction(1, 100, 2, "2026-08-21", { transactionType: "transfer_in" });
    const expense = transaction(2, 100, 1, "2026-08-21", { transactionType: "transfer_out" });
    expect(buildSuggestedTransactionPairs([income], [expense], { "1": "income", "2": "expense" })).toEqual([]);
    expect(buildSuggestedTransactionPairs([income], [expense], { "1": "expense", "2": "income" })).toHaveLength(1);
    expect(buildSuggestedTransactionPairs([income], [expense], { "1": "off" })).toEqual([]);
  });

  it("can treat an explicit expense-to-income account setup as strong evidence", () => {
    const pairs = buildSuggestedTransactionPairs(
      [transaction(1, 230, 2, "2026-08-21", { name: "ADYEN N.V." })],
      [transaction(2, 230, 1, "2026-08-21", { name: "Wypłata na konto bankowe" })],
      { "1": "expense", "2": "income" },
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ confidence: "strong", accountRolesAligned: true });
  });

  it("does not call ambiguous matches strong", () => {
    const pairs = buildSuggestedTransactionPairs(
      [transaction(1, 100, 2)],
      [transaction(2, 100, 1), transaction(3, 100, 3)],
    );
    expect(pairs).toHaveLength(2);
    expect(pairs.every((pair) => pair.confidence === "possible")).toBe(true);
  });

  it("does not mark a mathematical match strong when a side looks like a sale", () => {
    const pairs = buildSuggestedTransactionPairs(
      [transaction(1, 105, 2, "2026-08-21", { name: "Biała koszula Ralph Lauren" })],
      [transaction(2, 105, 1, "2026-08-20", { name: "Przelew na telefon", transactionType: "transfer_out" })],
    );
    expect(pairs[0]).toMatchObject({ confidence: "possible", incomeTransferEvidence: "none" });
  });

  it("keeps two generic transfer markers available for review but out of batch-safe matches", () => {
    const pairs = buildSuggestedTransactionPairs(
      [transaction(1, 230, 2, "2026-08-21", { name: "ADYEN payout" })],
      [transaction(2, 230, 1, "2026-08-20", { name: "Wypłata na konto bankowe" })],
    );
    expect(pairs[0]).toMatchObject({ confidence: "possible", expenseTransferEvidence: "weak", incomeTransferEvidence: "weak" });
  });

  it("keeps card repayments out of batch-safe suggestions until the card relation is verified", () => {
    const pairs = buildSuggestedTransactionPairs(
      [transaction(1, 200, 2, "2026-08-21", { transactionType: "transfer_in" })],
      [transaction(2, 200, 1, "2026-08-21", { transactionType: "card_repayment" })],
    );
    expect(pairs[0].confidence).toBe("possible");
  });

  it("does not batch two suggestions that use the same transaction", () => {
    const pairs = buildSuggestedTransactionPairs(
      [transaction(1, 100, 2), transaction(2, 50, 4)],
      [transaction(3, 100, 1), transaction(4, 100, 3), transaction(5, 50, 5)],
    );
    const batch = prepareSuggestedTransactionBatch(pairs);
    expect(batch).toMatchObject({ conflictCount: 2 });
    expect(batch.pairs).toHaveLength(1);
    expect(batch.pairs[0].expense.row.id).toBe(5);
  });
});
