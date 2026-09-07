import {
  normalizeStatementHeader,
  parseCsv,
  parseStatementAmount,
  parseStatementDate,
  parseStatementOccurredAt,
  statementColumnIndex,
} from "./statementCsv";
import { classifyApplicationType, importSuggestion, inferTransactionType } from "./statementImportPolicy";
import type { StatementBankStatus, StatementInstrumentType, StatementParseResult, StatementRejectedRow, StatementTransaction, StatementTransactionKind } from "./statementImportTypes";

export type {
  StatementDuplicateState,
  StatementParseResult,
  StatementPotentialOverlap,
  StatementMatchAnalysis,
  StatementTransaction,
  StatementTransactionKind,
} from "./statementImportTypes";
export { parseCsv, readStatementFile } from "./statementCsv";
export { applyMatchAnalysis, markAlreadyImported, markPotentialOverlaps } from "./statementImportPolicy";

const DATE_ALIASES = ["completed date", "transaction date", "data transakcji", "data operacji", "data wykonania", "date", "started date", "data ksiegowania", "data"];
const STARTED_DATE_ALIASES = ["started date", "data rozpoczecia", "authorization date"];
const DESCRIPTION_ALIASES = ["description", "opis transakcji", "opis operacji", "opis", "tytul", "nazwa", "szczegoly transakcji", "odbiorca nadawca"];
const COUNTERPARTY_ALIASES = ["odbiorca zleceniodawca", "odbiorca nadawca", "odbiorca", "zleceniodawca", "nadawca", "kontrahent", "beneficiary", "counterparty"];
const AMOUNT_ALIASES = ["amount", "kwota", "transaction amount", "kwota transakcji", "wartosc"];
const DEBIT_ALIASES = ["debit", "obciazenia", "kwota obciazenia", "rozchod"];
const CREDIT_ALIASES = ["credit", "uznania", "kwota uznania", "przychod"];
const CURRENCY_ALIASES = ["currency", "waluta"];
const STATUS_ALIASES = ["state", "status", "status transakcji"];
const FEE_ALIASES = ["fee", "prowizja", "oplata"];
const TYPE_ALIASES = ["type", "typ", "rodzaj transakcji", "typ transakcji"];
const EXTERNAL_ID_ALIASES = ["transaction id", "id transakcji", "identyfikator transakcji", "external id", "bank transaction id", "reference id", "identyfikator operacji"];
const INSTRUMENT_ALIASES = ["product", "rachunek", "numer rachunku", "konto", "account", "card", "numer karty", "karta", "instrument"];

function appendNote(current: string | undefined, note: string): string {
  return current ? `${current} ${note}` : note;
}

export type StatementColumnMapping = ReturnType<typeof detectStatementColumns>;
export type StatementCsvLayout = { separator?: string; headerRow?: number; columns?: StatementColumnMapping };

export function detectStatementColumns(rawHeaders: string[]) {
  const headers = rawHeaders.map(normalizeStatementHeader);
  return {
    date: statementColumnIndex(headers, DATE_ALIASES),
    startedDate: statementColumnIndex(headers, STARTED_DATE_ALIASES),
    description: statementColumnIndex(headers, DESCRIPTION_ALIASES),
    counterparty: statementColumnIndex(headers, COUNTERPARTY_ALIASES),
    amount: statementColumnIndex(headers, AMOUNT_ALIASES),
    debit: statementColumnIndex(headers, DEBIT_ALIASES),
    credit: statementColumnIndex(headers, CREDIT_ALIASES),
    currency: statementColumnIndex(headers, CURRENCY_ALIASES),
    status: statementColumnIndex(headers, STATUS_ALIASES),
    fee: statementColumnIndex(headers, FEE_ALIASES),
    type: statementColumnIndex(headers, TYPE_ALIASES),
    externalId: statementColumnIndex(headers, EXTERNAL_ID_ALIASES),
    instrument: statementColumnIndex(headers, INSTRUMENT_ALIASES),
  };
}

export function parseStatementCsv(text: string, expectedCurrency = "PLN", options?: { accountKind?: "bank-account" | "credit-card"; detectTransferSuggestions?: boolean; mappedAccountId?: number; layout?: StatementCsvLayout }): StatementParseResult {
  const rows = parseCsv(text, options?.layout?.separator).slice(options?.layout?.headerRow ?? 0);
  if (rows.length < 2) throw new Error("Plik CSV nie zawiera transakcji.");
  const headers = rows[0].map(normalizeStatementHeader);
  const { date: dateIndex, startedDate: startedDateIndex, description: descriptionIndex,
    counterparty: counterpartyIndex, amount: amountIndex, debit: debitIndex, credit: creditIndex,
    currency: currencyIndex, status: statusIndex, fee: feeIndex, type: typeIndex,
    externalId: externalIdIndex, instrument: instrumentIndex,
  } = options?.layout?.columns ?? detectStatementColumns(rows[0]);
  if (dateIndex < 0 || (amountIndex < 0 && debitIndex < 0 && creditIndex < 0)) {
    throw new Error("Nie rozpoznano kolumn daty i kwoty. Sprawdź wymagania formatu CSV.");
  }

  const revolutFormat = headers.includes("started date") && headers.includes("completed date") && headers.includes("type");
  const genericPromptFormat = headers.includes("data") && headers.includes("instrument") && headers.includes("id transakcji");
  const millenniumFormat = !genericPromptFormat && (headers.includes("rodzaj transakcji") || headers.includes("data ksiegowania"));
  const bank = revolutFormat ? "Revolut" : millenniumFormat ? "Millennium" : "Nieznany bank";
  const source = options?.accountKind === "credit-card" ? "CSV karty kredytowej" : "CSV bankowy";
  const currencyExpected = expectedCurrency.trim().toUpperCase() || "PLN";
  const transactions: StatementTransaction[] = [];
  const rejected: StatementRejectedRow[] = [];
  const sourceKeyOccurrences = new Map<string, number>();
  const externalIds = new Set<string>();
  const warningCounts = { invalid: 0, pending: 0, cancelled: 0, currency: 0, zero: 0, suggested: 0, sameFile: 0 };

  rows.slice(1).forEach((cells, rowIndex) => {
    const sourceRowNumber = rowIndex + 2 + (options?.layout?.headerRow ?? 0);
    const status = statusIndex >= 0 ? normalizeStatementHeader(cells[statusIndex] ?? "") : "";
    const bankStatus: StatementBankStatus = /pending|oczekuj/.test(status)
      ? "pending"
      : /revert|rejected|declined|cancel|odrzu|anul/.test(status)
        ? "cancelled"
        : "completed";
    if (bankStatus === "pending") warningCounts.pending += 1;
    if (bankStatus === "cancelled") warningCounts.cancelled += 1;
    const rawDate = (cells[dateIndex] ?? "").trim() || (startedDateIndex >= 0 ? cells[startedDateIndex] ?? "" : "");
    const date = parseStatementDate(rawDate);
    const rawDescription = descriptionIndex >= 0 ? (cells[descriptionIndex] ?? "").trim() : "";
    const counterparty = counterpartyIndex >= 0 ? (cells[counterpartyIndex] ?? "").trim() : "";
    const rawType = typeIndex >= 0 ? cells[typeIndex] ?? "" : "";
    const name = rawDescription || counterparty || rawType.trim() || "Operacja bankowa";
    let amount = amountIndex >= 0 ? parseStatementAmount(cells[amountIndex] ?? "") : null;
    if (amount === null && (debitIndex >= 0 || creditIndex >= 0)) {
      const debit = debitIndex >= 0 ? parseStatementAmount(cells[debitIndex] ?? "") : null;
      const credit = creditIndex >= 0 ? parseStatementAmount(cells[creditIndex] ?? "") : null;
      amount = credit && credit !== 0 ? Math.abs(credit) : debit && debit !== 0 ? -Math.abs(debit) : null;
    }
    const fee = feeIndex >= 0 ? parseStatementAmount(cells[feeIndex] ?? "") : null;
    if (amount !== null && fee && fee > 0) amount -= fee;
    const currency = (currencyIndex >= 0 ? cells[currencyIndex] : currencyExpected)?.trim().toUpperCase() || currencyExpected;
    const rawRejected = (reason: string): StatementRejectedRow => ({
      id: `rejected-${sourceRowNumber}`,
      rowNumber: sourceRowNumber,
      reason,
      name,
      amount: amount === null ? (amountIndex >= 0 ? cells[amountIndex] ?? "" : "") : String(amount),
      date: rawDate,
      currency,
      rawType,
      bankStatus,
    });
    if (!date || amount === null) {
      warningCounts.invalid += 1;
      rejected.push(rawRejected("Nieprawidłowa data lub kwota"));
      return;
    }
    if (amount === 0) {
      warningCounts.zero += 1;
      rejected.push(rawRejected("Kwota wynosi 0"));
      return;
    }
    if (currency !== currencyExpected) {
      warningCounts.currency += 1;
      rejected.push(rawRejected(`Waluta inna niż ${currencyExpected}`));
      return;
    }

    const kind: StatementTransactionKind = amount < 0 ? "expense" : "income";
    const suggestion = importSuggestion(rawType, name, options?.detectTransferSuggestions !== false);
    const transactionType = inferTransactionType(rawType, name, amount);
    const externalId = externalIdIndex >= 0 ? (cells[externalIdIndex] ?? "").trim() : "";
    const stableStartedAt = startedDateIndex >= 0 ? (cells[startedDateIndex] ?? "").trim() : rawDate.trim();
    const rawSourceKey = externalId
      ? `external-id:${externalId}`
      : [normalizeStatementHeader(rawType), stableStartedAt, name, amount.toFixed(2), fee?.toFixed(2) ?? "", currency].join("\u001f");
    const occurrence = (sourceKeyOccurrences.get(rawSourceKey) ?? 0) + 1;
    sourceKeyOccurrences.set(rawSourceKey, occurrence);
    const repeatedExternalId = Boolean(externalId && externalIds.has(externalId));
    if (externalId) externalIds.add(externalId);
    const repeatedRawRow = !externalId && occurrence > 1;
    const sourceKey = repeatedRawRow ? `${rawSourceKey}\u001eoccurrence:${occurrence}` : rawSourceKey;
    const sameFileDuplicate = repeatedExternalId || repeatedRawRow;
    let note = suggestion.note;
    if (bankStatus === "pending") note = appendNote(note, "Operacja oczekująca — możesz ją zapisać; kolejny wyciąg zaktualizuje jej status.");
    if (bankStatus === "cancelled") note = appendNote(note, "Operacja anulowana lub odrzucona — domyślnie pominięta.");
    if (sameFileDuplicate) {
      warningCounts.sameFile += 1;
      note = appendNote(note, repeatedExternalId
        ? "Ten sam unikalny identyfikator bankowy występuje w pliku więcej niż raz — kolejna instancja jest twardym duplikatem."
        : "Taka sama operacja występuje w tym pliku więcej niż raz — pozostaje zaznaczona, bo może być prawdziwą kolejną płatnością.");
    }
    if (suggestion.transferSuggested) warningCounts.suggested += 1;

    transactions.push({
      id: `statement-${sourceRowNumber}`,
      sourceKey,
      kind,
      name,
      amount: Math.round(amount * 100) / 100,
      date,
      occurredAt: parseStatementOccurredAt(rawDate, date),
      category: "Inne",
      currency,
      includeByDefault: suggestion.include && bankStatus !== "cancelled" && !repeatedExternalId,
      excludeFromAnalysis: suggestion.excludeFromAnalysis || bankStatus === "cancelled",
      note,
      transactionType,
      bankStatus,
      rawType,
      rawDescription,
      counterparty,
      rawData: Object.fromEntries(headers.map((header, index) => [header || `column_${index + 1}`, cells[index] ?? ""])),
      sourceInstrument: {
        bank,
        identifier: (instrumentIndex >= 0 ? cells[instrumentIndex] ?? "" : "").trim() || `mapped-account:${options?.mappedAccountId ?? "unknown"}`,
        type: (options?.accountKind === "credit-card" ? "credit_card" : /debit|debet/.test(normalizeStatementHeader(instrumentIndex >= 0 ? cells[instrumentIndex] ?? "" : "")) ? "debit_card" : "account") as StatementInstrumentType,
        ...(options?.mappedAccountId ? { mappedAccountId: options.mappedAccountId } : {}),
      },
      applicationType: classifyApplicationType(rawType, name, amount),
      duplicateState: repeatedExternalId ? "hard-duplicate" : repeatedRawRow ? "same-file" : undefined,
      resolution: repeatedExternalId || bankStatus === "cancelled" ? "skip" : "new",
      transferSuggested: suggestion.transferSuggested,
    });
  });

  const warnings: string[] = [];
  if (warningCounts.pending) warnings.push(`Znaleziono ${warningCounts.pending} operacji oczekujących. Są widoczne i domyślnie zaznaczone do zapisania.`);
  if (warningCounts.cancelled) warnings.push(`Znaleziono ${warningCounts.cancelled} operacji anulowanych lub odrzuconych. Są widoczne, ale domyślnie pominięte.`);
  if (warningCounts.currency) warnings.push(`Pominięto ${warningCounts.currency} transakcji w walucie innej niż ${currencyExpected}.`);
  if (warningCounts.invalid) warnings.push(`Pominięto ${warningCounts.invalid} wierszy z nieprawidłową datą lub kwotą.`);
  if (warningCounts.zero) warnings.push(`Pominięto ${warningCounts.zero} transakcji z kwotą 0.`);
  if (warningCounts.suggested) warnings.push(`Oznaczono ${warningCounts.suggested} możliwych transferów własnych. To tylko sugestie — operacje pozostają domyślnie uwzględnione w analizach.`);
  if (warningCounts.sameFile) warnings.push(`Oznaczono ${warningCounts.sameFile} powtórzonych operacji znalezionych w tym samym pliku. Powtórzenia bez unikalnego ID pozostają zaznaczone.`);
  const skipped = warningCounts.invalid + warningCounts.currency + warningCounts.zero;
  return { source, transactions, rejected, skipped, warnings };
}
