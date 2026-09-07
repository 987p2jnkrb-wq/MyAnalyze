import type { TransactionType } from "../../types/transactionType";
import { normalizeStatementHeader } from "./statementCsv";
import type {
  StatementApplicationType,
  StatementMatchAnalysis,
  StatementParseResult,
  StatementPotentialOverlap,
} from "./statementImportTypes";


export function importSuggestion(
  type: string,
  description: string,
  enabled = true,
): { include: boolean; excludeFromAnalysis: boolean; transferSuggested: boolean; note?: string } {
  const normalizedType = normalizeStatementHeader(type);
  const normalizedDescription = normalizeStatementHeader(description);
  const looksInternal = normalizedType === "topup"
    || /^to (pln|eur|usd|gbp|chf)$/.test(normalizedDescription)
    || /credit card excess funds transfer|credit card repayment|card repayment|\bspl(?:ata)? karty\b|karta kredytowa|to credit card|from credit card/.test(normalizedDescription);
  return enabled && looksInternal
    ? {
        include: true,
        excludeFromAnalysis: false,
        transferSuggested: true,
        note: "Możliwy transfer własny — sugestia wymaga wskazania drugiej strony. Do tego czasu operacja jest normalnie liczona.",
      }
    : { include: true, excludeFromAnalysis: false, transferSuggested: false };
}

export function inferTransactionType(type: string, description: string, amount: number): TransactionType | null {
  const normalizedType = normalizeStatementHeader(type);
  const normalizedDescription = normalizeStatementHeader(description);
  if (/card payment|platnosc karta/.test(normalizedType) || /platnosc karta/.test(normalizedDescription)) return "card_payment";
  if (/cash withdrawal|wyplata gotowki|bankomat/.test(normalizedType) || /atm |bankomat/.test(normalizedDescription)) return "cash_withdrawal";
  if (/direct debit|polecenie zaplaty/.test(normalizedType)) return "direct_debit";
  if (/fee|charge|oplata|prowizja/.test(normalizedType)) return "fee";
  if (/spl(?:ata)? karty|card repayment|to credit card/.test(`${normalizedType} ${normalizedDescription}`)) return "card_repayment";
  if (/loan payment|loan_payment|splata kredytu/.test(normalizedType.replace(/ /g, "_"))) return "loan_repayment";
  if (/^loan$|uruchomienie kredytu/.test(normalizedType)) return "loan_disbursement";
  if (/topup|top up|zasilenie/.test(normalizedType)) return "top_up";
  if (/refund|cashback|chargeback|zwrot/.test(normalizedType) || /refund|cashback|chargeback|zwrot/.test(normalizedDescription)) return "refund";
  if (/transfer|przelew/.test(normalizedType) || /wyplata na konto bankowe/.test(normalizedDescription)) return amount < 0 ? "transfer_out" : "transfer_in";
  return null;
}

export function classifyApplicationType(type: string, description: string, amount: number): StatementApplicationType {
  const transactionType = inferTransactionType(type, description, amount);
  if (transactionType === "card_payment") return "card_payment";
  if (transactionType === "refund") return "refund";
  if (["transfer_in", "transfer_out", "top_up"].includes(transactionType ?? "") || importSuggestion(type, description).transferSuggested) return "transfer_candidate";
  if (transactionType) return "normal_transaction";
  return normalizeStatementHeader(type) ? "unknown" : "normal_transaction";
}

export function markAlreadyImported(result: StatementParseResult, duplicateSourceKeys: string[]): StatementParseResult {
  const duplicateKeys = new Set(duplicateSourceKeys);
  let duplicates = 0;
  const transactions = result.transactions.map((transaction) => {
    if (!duplicateKeys.has(transaction.sourceKey)) return transaction;
    duplicates += 1;
    const duplicateNote = "Ta transakcja jest już zapisana na tym koncie — domyślnie odznaczona.";
    return {
      ...transaction,
      includeByDefault: false,
      duplicateState: "already-imported" as const,
      resolution: "skip",
      note: transaction.note ? `${transaction.note} ${duplicateNote}` : duplicateNote,
    };
  });
  return duplicates
    ? { ...result, transactions, warnings: [...result.warnings, `Odznaczono ${duplicates} wcześniej zaimportowanych transakcji.`] }
    : result;
}

export function markPotentialOverlaps(result: StatementParseResult, overlaps: StatementPotentialOverlap[]): StatementParseResult {
  const overlapsByKey = new Map<string, StatementPotentialOverlap[]>();
  overlaps.forEach((overlap) => overlapsByKey.set(overlap.sourceKey, [...(overlapsByKey.get(overlap.sourceKey) ?? []), overlap]));
  let marked = 0;
  const transactions = result.transactions.map((transaction) => {
    const matches = overlapsByKey.get(transaction.sourceKey) ?? [];
    const overlap = matches.find((item) => item.reason === "same-transaction") ?? matches[0];
    if (!overlap || transaction.duplicateState) return transaction;
    marked += 1;
    const explanation = overlap.reason === "own-transfer"
      ? `Możliwy transfer między własnymi kontami — druga strona występuje na koncie „${overlap.accountName}”.`
      : `Możliwa ta sama operacja na koncie „${overlap.accountName}” — sprawdź przed importem.`;
    if (overlap.reason === "own-transfer") {
      const transferCandidates = matches
        .filter((item) => item.reason === "own-transfer")
        .map((item) => ({
          transactionId: item.transactionId,
          kind: item.kind,
          accountName: item.accountName,
          transactionName: item.transactionName,
          transactionDate: item.transactionDate,
          transactionAmount: item.transactionAmount,
        }));
      const accounts = [...new Set(transferCandidates.map((candidate) => `„${candidate.accountName}”`))].join(", ");
      const transferExplanation = transferCandidates.length === 1
        ? explanation
        : `Znaleziono ${transferCandidates.length} możliwe drugie strony transferu na kontach: ${accounts}. Wybierz właściwą ręcznie.`;
      return {
        ...transaction,
        duplicateState: "own-transfer" as const,
        transferSuggested: true,
        transferCandidates,
        note: transaction.note ? `${transaction.note} ${transferExplanation}` : transferExplanation,
      };
    }
    return {
      ...transaction,
      includeByDefault: true,
      duplicateState: "possible-overlap" as const,
      resolution: transaction.resolution.startsWith("existing:") ? transaction.resolution : "new",
      note: transaction.note ? `${transaction.note} ${explanation}` : explanation,
    };
  });
  return marked
    ? { ...result, transactions, warnings: [...result.warnings, `Rozpoznano ${marked} operacji powiązanych lub mogących nakładać się z importem na innym koncie.`] }
    : result;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function existingCandidateKey(candidate: StatementMatchAnalysis["existingCandidates"][number]): string {
  return `${candidate.kind}:${candidate.transactionId}`;
}

function planCandidateKey(candidate: StatementMatchAnalysis["planCandidates"][number]): string {
  return `${candidate.kind}:${candidate.source}:${candidate.planId}:${candidate.occurrenceDate ?? ""}`;
}

export function applyMatchAnalysis(
  result: StatementParseResult,
  analyses: StatementMatchAnalysis[],
  autoSelectRecommended = true,
): StatementParseResult {
  const byKey = new Map(analyses.map((analysis) => [analysis.sourceKey, analysis]));

  // Preview jest analizowany jako jeden batch. Backend zwraca remainingAmount na
  // podstawie danych już zapisanych w bazie, ale nie wie jeszcze, które pozycje
  // z TEGO preview zostaną automatycznie przypisane do tego samego planu.
  // Dlatego lokalnie rezerwujemy wykorzystane istniejące transakcje i kwoty planów.
  const usedExisting = new Set<string>();
  const reservedPlanAmounts = new Map<string, number>();

  return {
    ...result,
    transactions: result.transactions.map((transaction) => {
      const analysis = byKey.get(transaction.sourceKey);
      if (!analysis) return transaction;

      if (transaction.bankStatus !== "completed") {
        return {
          ...transaction,
          planCandidates: [],
          existingCandidates: [],
          planAllocations: [],
        };
      }

      const recommendedExisting = analysis.existingCandidates.find((candidate) => (
        candidate.recommended && !usedExisting.has(existingCandidateKey(candidate))
      ));

      const recommendedPlan = analysis.planCandidates.find((candidate) => {
        if (!candidate.recommended) return false;
        const reserved = reservedPlanAmounts.get(planCandidateKey(candidate)) ?? 0;
        return roundMoney(candidate.remainingAmount - reserved) > 0;
      });

      let resolution = transaction.resolution;
      let planAllocations = transaction.planAllocations ?? [];

      if (autoSelectRecommended && !transaction.duplicateState) {
        if (recommendedExisting) {
          resolution = `existing:${recommendedExisting.transactionId}`;
          planAllocations = [];
          usedExisting.add(existingCandidateKey(recommendedExisting));
        } else if (recommendedPlan && resolution !== "transfer") {
          const key = planCandidateKey(recommendedPlan);
          const alreadyReserved = reservedPlanAmounts.get(key) ?? 0;
          const availableAmount = roundMoney(Math.max(0, recommendedPlan.remainingAmount - alreadyReserved));
          const allocatedAmount = roundMoney(Math.min(Math.abs(transaction.amount), availableAmount));

          if (allocatedAmount > 0) {
            resolution = "plan";
            planAllocations = [{
              source: recommendedPlan.source,
              planId: recommendedPlan.planId,
              occurrenceDate: recommendedPlan.occurrenceDate,
              name: recommendedPlan.name,
              allocatedAmount,
            }];
            reservedPlanAmounts.set(key, roundMoney(alreadyReserved + allocatedAmount));
          }
        }
      }

      // Jeśli po analizie pozycja nie jest przypisana do planu, nie zostawiamy
      // starej alokacji. Chroni to przed niespójnym payloadem po ponownej analizie.
      if (resolution !== "plan") {
        planAllocations = [];
      }

      return {
        ...transaction,
        resolution,
        includeByDefault: resolution !== "skip",
        planCandidates: analysis.planCandidates,
        existingCandidates: analysis.existingCandidates,
        planAllocations,
      };
    }),
  };
}
