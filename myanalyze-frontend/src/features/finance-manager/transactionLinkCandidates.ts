import type { TransactionModel } from "../../context/useTransactionResource";
import type { TransactionKind } from "./transactionLinks";

export type TransferEvidence = "strong" | "weak" | "negative" | "none";
export type TransactionSuggestionRole = "both" | "income" | "expense" | "off";
export type TransactionSuggestionAccountRoles = Record<string, TransactionSuggestionRole>;

export type TransactionCandidate = {
  kind: TransactionKind;
  row: TransactionModel;
};

export type SuggestedTransactionPair = {
  id: string;
  expense: TransactionCandidate;
  income: TransactionCandidate;
  amountDifference: number;
  dateDifference: number;
  candidateCount: number;
  confidence: "strong" | "possible";
  expenseTransferEvidence: TransferEvidence;
  incomeTransferEvidence: TransferEvidence;
  accountRolesAligned: boolean;
  confidenceExplanation: string;
  score: number;
};

export type SuggestedTransactionBatch = {
  pairs: SuggestedTransactionPair[];
  conflictCount: number;
};

const MAX_SUGGESTION_DAY_DISTANCE = 3;

function cents(value: number): number {
  return Math.round(Math.abs(Number(value) || 0) * 100);
}

function normalizedText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pl-PL")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizedTokens(value: string): Set<string> {
  return new Set(normalizedText(value).split(" ").filter((token) => token.length >= 3));
}

function namesOverlap(left: string, right: string): boolean {
  const leftTokens = normalizedTokens(left);
  const rightTokens = normalizedTokens(right);
  return [...leftTokens].some((token) => rightTokens.has(token));
}

const TRANSFER_TYPES = new Set(["transfer_in", "transfer_out"]);
const NON_TRANSFER_TYPES = new Set(["card_payment", "cash_withdrawal", "direct_debit", "fee", "loan_disbursement", "loan_repayment", "refund"]);
const TRANSFER_PHRASES = ["przelew", "transfer", "payout", "wyplata na konto", "payment from", "sent from", "sent to"];
const NON_TRANSFER_PHRASES = ["sprzedaz", "sale", "zakup", "purchase", "cashback", "moneyback", "platnosc karta", "payment card", "zwrot", "wynagrodzenie", "odsetki"];

function includesPhrase(text: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}

export function transferEvidenceFor(row: TransactionModel): TransferEvidence {
  const transactionType = row.transactionType ?? null;
  if (transactionType && NON_TRANSFER_TYPES.has(transactionType)) return "negative";
  // Spłata karty jest wartościową wskazówką, ale bez relacji z kartą nie trafia do batcha.
  if (transactionType === "card_repayment") return "weak";
  if (transactionType && TRANSFER_TYPES.has(transactionType)) return "strong";

  const name = normalizedText(row.name);
  if (includesPhrase(name, NON_TRANSFER_PHRASES)) return "negative";
  return includesPhrase(name, TRANSFER_PHRASES) ? "weak" : "none";
}

function evidenceScore(evidence: TransferEvidence): number {
  return evidence === "strong" ? 250 : evidence === "weak" ? 100 : evidence === "negative" ? -250 : 0;
}

export function suggestionAccountRoleFor(
  accountId: number | null | undefined,
  roles: TransactionSuggestionAccountRoles,
): TransactionSuggestionRole {
  if (accountId == null) return "off";
  return roles[String(accountId)] ?? "both";
}

export function accountAllowsSuggestionKind(
  accountId: number | null | undefined,
  kind: TransactionKind,
  roles: TransactionSuggestionAccountRoles,
): boolean {
  const role = suggestionAccountRoleFor(accountId, roles);
  return role === "both" || role === kind;
}

function accountRolesConfirmDirection(
  expense: TransactionModel,
  income: TransactionModel,
  roles: TransactionSuggestionAccountRoles,
): boolean {
  return suggestionAccountRoleFor(expense.accountId, roles) === "expense"
    && suggestionAccountRoleFor(income.accountId, roles) === "income";
}

function confidenceExplanation(
  expense: TransactionModel,
  income: TransactionModel,
  expenseEvidence: TransferEvidence,
  incomeEvidence: TransferEvidence,
  dateDifference: number,
  candidateCount: number,
  accountRolesAligned: boolean,
): string {
  if (expense.transactionType === "card_repayment" || income.transactionType === "card_repayment") {
    return "Spłata karty wymaga ręcznej weryfikacji instrumentów.";
  }
  if (expenseEvidence === "negative" || incomeEvidence === "negative") return "Opis lub typ jednej ze stron nie wygląda jak transfer własny.";
  if (candidateCount > 1) return `Znaleziono ${candidateCount} możliwych drugich stron.`;
  if (dateDifference > 3) return `Kwota pasuje, ale operacje dzieli ${dateDifference} dni.`;
  if (accountRolesAligned) return "Ustawione role kont potwierdzają kierunek: wydatek → przychód.";
  if (expenseEvidence === "none" && incomeEvidence === "none") return "Żadna strona nie ma rozpoznanego typu transferu.";
  if (expenseEvidence === "none") return "Wydatek nie ma sygnału transferu.";
  if (incomeEvidence === "none") return "Przychód nie ma sygnału transferu.";
  return expense.transactionType === "transfer_out" && income.transactionType === "transfer_in"
    ? "Obie strony mają kompatybilne typy transferu."
    : "Brakuje kompatybilnych typów transferu po obu stronach.";
}

export function transactionDayDistance(left: TransactionModel, right: TransactionModel): number {
  const leftTime = Date.parse(`${left.addedAt.slice(0, 10)}T00:00:00Z`);
  const rightTime = Date.parse(`${right.addedAt.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return Number.POSITIVE_INFINITY;
  return Math.abs(leftTime - rightTime) / 86_400_000;
}

export function transactionLinkScore(left: TransactionCandidate, right: TransactionCandidate): number {
  const exactAmount = cents(left.row.amount) === cents(right.row.amount);
  const oppositeKind = left.kind !== right.kind;
  const otherAccount = left.row.accountId != null && right.row.accountId != null && left.row.accountId !== right.row.accountId;
  const dayDistance = transactionDayDistance(left.row, right.row);
  const evidence = evidenceScore(transferEvidenceFor(left.row)) + evidenceScore(transferEvidenceFor(right.row));
  return (exactAmount ? 10_000 : 0)
    + (oppositeKind ? 1_000 : 0)
    + (otherAccount ? 500 : 0)
    + (namesOverlap(left.row.name, right.row.name) ? 100 : 0)
    + evidence
    - Math.min(dayDistance, 999);
}

export function buildSuggestedTransactionPairs(
  incomes: TransactionModel[],
  expenses: TransactionModel[],
  accountRoles: TransactionSuggestionAccountRoles = {},
): SuggestedTransactionPair[] {
  const expensesByAmount = new Map<number, TransactionModel[]>();
  expenses
    .filter((row) => row.transferLinkId == null && accountAllowsSuggestionKind(row.accountId, "expense", accountRoles))
    .forEach((row) => {
      const key = cents(row.amount);
      expensesByAmount.set(key, [...(expensesByAmount.get(key) ?? []), row]);
    });

  const rawPairs: Array<Omit<SuggestedTransactionPair, "candidateCount" | "confidence" | "confidenceExplanation">> = [];
  const matchesByIncome = new Map<number, number>();
  const matchesByExpense = new Map<number, number>();

  incomes
    .filter((income) => income.transferLinkId == null && accountAllowsSuggestionKind(income.accountId, "income", accountRoles))
    .forEach((income) => {
      for (const expense of expensesByAmount.get(cents(income.amount)) ?? []) {
        if (income.accountId == null || expense.accountId == null || income.accountId === expense.accountId) continue;
        const dateDifference = transactionDayDistance(expense, income);
        if (dateDifference > MAX_SUGGESTION_DAY_DISTANCE) continue;
        const expenseCandidate = { kind: "expense" as const, row: expense };
        const incomeCandidate = { kind: "income" as const, row: income };
        const expenseTransferEvidence = transferEvidenceFor(expense);
        const incomeTransferEvidence = transferEvidenceFor(income);
        rawPairs.push({
          id: `expense:${expense.id}:income:${income.id}`,
          expense: expenseCandidate,
          income: incomeCandidate,
          amountDifference: Math.abs(Number(expense.amount) - Number(income.amount)),
          dateDifference,
          expenseTransferEvidence,
          incomeTransferEvidence,
          accountRolesAligned: accountRolesConfirmDirection(expense, income, accountRoles),
          score: transactionLinkScore(expenseCandidate, incomeCandidate),
        });
        matchesByIncome.set(income.id, (matchesByIncome.get(income.id) ?? 0) + 1);
        matchesByExpense.set(expense.id, (matchesByExpense.get(expense.id) ?? 0) + 1);
      }
    });

  return rawPairs
    .map((pair) => {
      const candidateCount = Math.max(matchesByIncome.get(pair.income.row.id) ?? 0, matchesByExpense.get(pair.expense.row.id) ?? 0);
      const cardRepaymentInvolved = pair.expense.row.transactionType === "card_repayment" || pair.income.row.transactionType === "card_repayment";
      const hasCompatibleTransferTypes = pair.expense.row.transactionType === "transfer_out"
        && pair.income.row.transactionType === "transfer_in";
      const hasNegativeEvidence = pair.expenseTransferEvidence === "negative" || pair.incomeTransferEvidence === "negative";
      const confidence = pair.dateDifference <= 3
        && candidateCount === 1
        && !hasNegativeEvidence
        && !cardRepaymentInvolved
        && (hasCompatibleTransferTypes || pair.accountRolesAligned)
        ? "strong" as const
        : "possible" as const;
      return {
        ...pair,
        candidateCount,
        confidence,
        confidenceExplanation: confidenceExplanation(
          pair.expense.row,
          pair.income.row,
          pair.expenseTransferEvidence,
          pair.incomeTransferEvidence,
          pair.dateDifference,
          candidateCount,
          pair.accountRolesAligned,
        ),
      };
    })
    .sort((left, right) => Number(right.confidence === "strong") - Number(left.confidence === "strong") || right.score - left.score || left.id.localeCompare(right.id));
}

export function prepareSuggestedTransactionBatch(pairs: SuggestedTransactionPair[]): SuggestedTransactionBatch {
  const usage = new Map<string, number>();
  pairs.forEach((pair) => {
    const expenseKey = `expense:${pair.expense.row.id}`;
    const incomeKey = `income:${pair.income.row.id}`;
    usage.set(expenseKey, (usage.get(expenseKey) ?? 0) + 1);
    usage.set(incomeKey, (usage.get(incomeKey) ?? 0) + 1);
  });
  const uniquePairs = pairs.filter((pair) =>
    usage.get(`expense:${pair.expense.row.id}`) === 1
    && usage.get(`income:${pair.income.row.id}`) === 1,
  );
  return { pairs: uniquePairs, conflictCount: pairs.length - uniquePairs.length };
}
