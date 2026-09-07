import { normalizeStatementHeader, parseStatementAmount, parseStatementDate } from "./statementCsv";
import { classifyApplicationType, importSuggestion, inferTransactionType } from "./statementImportPolicy";
import type { StatementInstrumentType, StatementParseResult, StatementTransaction, StatementTransactionKind } from "./statementImportTypes";

export interface StatementPdfTextCell {
  text: string;
  x: number;
  width: number;
}

export interface StatementPdfTextRow {
  y: number;
  text: string;
  cells: StatementPdfTextCell[];
}

export interface StatementPdfPage {
  pageNumber: number;
  width: number;
  height: number;
  rows: StatementPdfTextRow[];
}

export interface StatementPdfExtraction {
  text: string;
  pageCount: number;
  pages: StatementPdfPage[];
}

interface PdfParseOptions {
  accountKind?: "bank-account" | "credit-card";
  detectTransferSuggestions?: boolean;
  mappedAccountId?: number;
  institutionName?: string | null;
}

interface Candidate {
  pageNumber: number;
  date: string;
  amount: number;
  name: string;
  counterparty: string;
  rawType: string;
  rawDescription: string;
  rawText: string;
  provider: string;
  instrumentIdentifier: string;
  instrumentType: StatementInstrumentType;
  note?: string;
  transactionTypeOverride?: StatementTransaction["transactionType"];
  includeByDefault?: boolean;
}

type PdfProfile = "vinted" | "millennium-account" | "millennium-card" | "generic";

const POLISH_MONTHS: Record<string, string> = {
  sty: "01", lut: "02", mar: "03", kwi: "04", maj: "05", cze: "06",
  lip: "07", sie: "08", wrz: "09", paz: "10", "paź": "10", lis: "11", gru: "12",
};

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cellRatio(cell: StatementPdfTextCell, page: StatementPdfPage): number {
  return page.width > 0 ? (cell.x + Math.max(0, cell.width) / 2) / page.width : 0;
}

function textRange(row: StatementPdfTextRow, page: StatementPdfPage, from: number, to: number): string {
  return compact(row.cells.filter((cell) => {
    const ratio = cellRatio(cell, page);
    return ratio >= from && ratio < to;
  }).map((cell) => cell.text).join(" "));
}

function parsePdfMoney(value: string): number | null {
  let normalized = compact(value).replace(/([0-9][0-9.,\s]*)-\s*(?=(?:PLN|zł|$))/i, "-$1");
  const decimal = normalized.match(/[+\-−–-]?\s*\d{1,3}(?:[ .]\d{3})*(?:[,.]\d{2})(?:\s*(?:PLN|zł))?-?/i);
  if (!decimal) return null;
  let token = decimal[0].trim();
  if (token.endsWith("-") && !/^[+\-−–-]/.test(token)) token = `-${token.slice(0, -1)}`;
  return parseStatementAmount(token);
}

function moneyCells(row: StatementPdfTextRow, page: StatementPdfPage, from = 0, to = 1) {
  return row.cells.flatMap((cell) => {
    const ratio = cellRatio(cell, page);
    if (ratio < from || ratio >= to) return [];
    const amount = parsePdfMoney(cell.text);
    return amount === null ? [] : [{ cell, ratio, amount }];
  });
}

function parsePdfDate(value: string): string | null {
  const direct = value.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{4})\b/);
  if (direct) return parseStatementDate(direct[1]);
  const polish = normalizeStatementHeader(value).match(/\b(\d{1,2})\s+(sty|lut|mar|kwi|maj|cze|lip|sie|wrz|paz|lis|gru)\s+(\d{4})\b/);
  if (!polish) return null;
  const month = POLISH_MONTHS[polish[2]];
  return month ? `${polish[3]}-${month}-${polish[1].padStart(2, "0")}` : null;
}

function leftDate(row: StatementPdfTextRow, page: StatementPdfPage, limit = 0.3): string | null {
  return parsePdfDate(textRange(row, page, 0, limit));
}

function profileFor(extraction: StatementPdfExtraction): PdfProfile {
  const normalized = normalizeStatementHeader(extraction.text);
  if (normalized.includes("zestawienie portfela vinted")) return "vinted";
  if (normalized.includes("wyciag z rachunku karty kredytowej")) return "millennium-card";
  if (normalized.includes("wyciag laczony") && normalized.includes("rachunki biezace informacje szczegolowe")) return "millennium-account";
  return "generic";
}

function vintedIdentifier(text: string): string {
  return text.match(/Nazwa użytkownika:\s*([^\n\r]+)/i)?.[1]?.trim() || "vinted-wallet";
}

function millenniumAccountIdentifier(text: string): string {
  const iban = text.match(/\bPL\d{2}(?:\s*\d{4}){6}\b/i)?.[0];
  return iban ? iban.replace(/\s+/g, "").toUpperCase() : "millennium-account";
}

function millenniumCardIdentifier(text: string): string {
  const card = text.match(/(?:karty kredytowej nr|NUMER KARTY GŁÓWNEJ:)\s*([0-9xX*]{12,19})/i)?.[1];
  return card ? card.toLowerCase() : "millennium-card";
}

function isStructuralRow(row: StatementPdfTextRow): boolean {
  const normalized = normalizeStatementHeader(row.text);
  return normalized.startsWith("www ") || normalized.startsWith("strona ")
    || normalized.includes("vinted pay") || normalized.includes("saldo koncowe")
    || normalized.includes("suma uznan") || normalized.includes("suma obciazen")
    || normalized.includes("program kredytowy") || normalized.includes("dokument wygenerowany")
    || normalized.includes("numer zastrzezonej karty") || normalized.startsWith("data transakcji")
    || normalized.startsWith("data ksieg");
}

function continuationRows(page: StatementPdfPage, index: number, dateLimit: number): StatementPdfTextRow[] {
  const rows: StatementPdfTextRow[] = [];
  for (let cursor = index + 1; cursor < page.rows.length; cursor += 1) {
    if (leftDate(page.rows[cursor], page, dateLimit) || isStructuralRow(page.rows[cursor])) break;
    rows.push(page.rows[cursor]);
  }
  return rows;
}

function parseVinted(extraction: StatementPdfExtraction): Candidate[] {
  const candidates: Candidate[] = [];
  const instrumentIdentifier = vintedIdentifier(extraction.text);
  extraction.pages.forEach((page) => page.rows.forEach((row, index) => {
    const date = leftDate(row, page, 0.18);
    if (!date || /saldo (poczatkowe|koncowe)/i.test(normalizeStatementHeader(row.text))) return;
    const amount = moneyCells(row, page, 0.78, 1)[0]?.amount;
    if (amount == null || amount === 0) return;
    const counterparty = textRange(row, page, 0.18, 0.39);
    const following = continuationRows(page, index, 0.18);
    const descriptionParts = [textRange(row, page, 0.39, 0.78), ...following
      .filter((extra) => !/oplata za przewalutowanie/i.test(normalizeStatementHeader(extra.text)))
      .map((extra) => textRange(extra, page, 0.39, 0.78))]
      .map(compact)
      .filter((part) => part && !/^\(?\d+(?:[.,]\d+)?%\)?$/i.test(normalizeStatementHeader(part)));
    const rawDescription = compact(descriptionParts.join(" "));
    const rawType = /wypłata na konto bankowe/i.test(rawDescription) ? "Wypłata na konto bankowe" : amount < 0 ? "Zakup" : "Sprzedaż";
    candidates.push({
      pageNumber: page.pageNumber,
      date,
      amount,
      name: rawDescription || counterparty || rawType,
      counterparty,
      rawType,
      rawDescription,
      rawText: compact([row.text, ...following.slice(0, 3).map((item) => item.text)].join(" | ")),
      provider: "Vinted",
      instrumentIdentifier,
      instrumentType: "account",
    });
  }));
  return candidates;
}

function millenniumDetailSummary(rawType: string, details: string): { name: string; counterparty: string } {
  const normalizedDetails = compact(details);
  const explicit = normalizedDetails.match(/(?:Nadawca|Odbiorca)\s*:\s*(.+?)(?=\s+Tytułem\s*:|\s+Na nr tel\.|$)/i)?.[1]?.trim() || "";
  const title = normalizedDetails.match(/Tytułem\s*:\s*(.+?)(?=\s+Na nr tel\.|$)/i)?.[1]?.trim() || "";
  const freeLine = normalizedDetails.split(" | ").map(compact).find((line) => line
    && !/^(?:z r-ku|na r-k|data nadania|na nr tel\.)/i.test(line)
    && !/^\d{20,}$/.test(line)
    && !/^www\./i.test(line)) || "";
  const counterparty = explicit || (freeLine && !normalizeStatementHeader(freeLine).startsWith(normalizeStatementHeader(rawType)) ? freeLine.split(/\s+\/OPF\//i)[0].trim() : "");
  const detailsForName = title || counterparty || freeLine;
  return { name: compact(detailsForName ? `${rawType} · ${detailsForName}` : rawType), counterparty };
}

function parseMillenniumAccount(extraction: StatementPdfExtraction): Candidate[] {
  const candidates: Candidate[] = [];
  const instrumentIdentifier = millenniumAccountIdentifier(extraction.text);
  extraction.pages.forEach((page) => page.rows.forEach((row, index) => {
    const date = leftDate(row, page, 0.2);
    if (!date) return;
    const amountItem = moneyCells(row, page, 0.76, 0.92)[0];
    if (!amountItem || amountItem.amount === 0) return;
    const following = continuationRows(page, index, 0.2);
    const sourceType = textRange(row, page, 0.2, 0.76);
    if (!sourceType) return;
    const detailLines = following.map((extra) => textRange(extra, page, 0.2, 0.76)).filter(Boolean);
    const detailText = detailLines.join(" | ");
    const normalizedDetail = normalizeStatementHeader(detailText);
    let rawType = sourceType;
    const cardRepayment = /wczesn.*sp[lł].*karty/.test(normalizedDetail);
    if (cardRepayment) rawType = "Spłata karty";
    else if (/^przel.*przych/.test(normalizeStatementHeader(sourceType))) rawType = "Przelew przychodzący";
    const summary = millenniumDetailSummary(rawType, detailText);
    candidates.push({
      pageNumber: page.pageNumber,
      date,
      amount: amountItem.amount,
      name: summary.name,
      counterparty: summary.counterparty,
      rawType,
      rawDescription: compact(detailLines.join(" ")),
      rawText: compact([row.text, ...following.slice(0, 4).map((item) => item.text)].join(" | ")),
      provider: "Millennium",
      instrumentIdentifier,
      instrumentType: "account",
      ...(cardRepayment ? { transactionTypeOverride: "card_repayment" as const } : {}),
    });
  }));
  return candidates;
}

function cardAdapterType(sourceType: string, amount: number): { rawType: string; override?: StatementTransaction["transactionType"] } {
  const normalized = normalizeStatementHeader(sourceType);
  if (/sp[lł]ata/.test(normalized)) return { rawType: "Spłata karty", override: "card_repayment" };
  if (/uznanie|moneyback/.test(normalized)) return { rawType: "Zwrot", override: "refund" };
  if (/wygodne|rata/.test(normalized)) return { rawType: "Spłata kredytu", override: "loan_repayment" };
  if (amount < 0 && /zakup|blik/.test(normalized)) return { rawType: sourceType, override: "card_payment" };
  return { rawType: sourceType };
}

function parseMillenniumCard(extraction: StatementPdfExtraction): Candidate[] {
  const candidates: Candidate[] = [];
  const instrumentIdentifier = millenniumCardIdentifier(extraction.text);
  extraction.pages.forEach((page) => page.rows.forEach((row, index) => {
    const date = leftDate(row, page, 0.15);
    if (!date) return;
    const postedCandidates = moneyCells(row, page, 0.9, 1);
    const posted = postedCandidates[postedCandidates.length - 1];
    if (!posted || posted.amount === 0) return;
    const following = continuationRows(page, index, 0.15);
    let sourceType = textRange(row, page, 0.15, 0.25);
    const typeContinuation = following.slice(0, 2).map((extra) => textRange(extra, page, 0.15, 0.25)).filter((value) => /^(raty)$/i.test(value));
    if (typeContinuation.length) sourceType = compact(`${sourceType} ${typeContinuation.join(" ")}`);
    if (!sourceType) return;
    const descriptionParts = [textRange(row, page, 0.25, 0.70), ...following.slice(0, 2).map((extra) => textRange(extra, page, 0.25, 0.70))].filter(Boolean);
    const rawDescription = compact(descriptionParts.join(" "));
    const adapter = cardAdapterType(sourceType, posted.amount);
    candidates.push({
      pageNumber: page.pageNumber,
      date,
      amount: posted.amount,
      name: rawDescription || sourceType,
      counterparty: rawDescription,
      rawType: adapter.rawType,
      rawDescription,
      rawText: compact([row.text, ...following.slice(0, 2).map((item) => item.text)].join(" | ")),
      provider: "Millennium",
      instrumentIdentifier,
      instrumentType: "credit_card",
      transactionTypeOverride: adapter.override,
    });
  }));
  return candidates;
}

function parseGeneric(extraction: StatementPdfExtraction, options: PdfParseOptions, expectedCurrency: string): Candidate[] {
  const candidates: Candidate[] = [];
  const provider = options.institutionName?.trim() || "Nieznany bank";
  const instrumentIdentifier = `mapped-account:${options.mappedAccountId ?? "unknown"}`;
  extraction.pages.forEach((page) => page.rows.forEach((row) => {
    const date = leftDate(row, page, 0.32);
    if (!date) return;
    const possible = moneyCells(row, page, 0.45, 1);
    if (!possible.length) return;
    const signed = possible.find((item) => /^[+\-−–-]|-$/.test(item.cell.text.trim()) || /[+\-−–-]/.test(item.cell.text));
    const currencyMatched = possible.find((item) => new RegExp(`\\b${expectedCurrency}\\b`, "i").test(item.cell.text));
    const chosen = signed ?? currencyMatched ?? possible[0];
    if (!chosen || chosen.amount === 0) return;
    const amountX = chosen.ratio;
    const description = textRange(row, page, 0.16, Math.max(0.2, amountX - 0.01)).replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ");
    const name = compact(description) || "Operacja z PDF";
    candidates.push({
      pageNumber: page.pageNumber,
      date,
      amount: chosen.amount,
      name,
      counterparty: "",
      rawType: "",
      rawDescription: name,
      rawText: row.text,
      provider,
      instrumentIdentifier,
      instrumentType: options.accountKind === "credit-card" ? "credit_card" : "account",
      includeByDefault: false,
      note: possible.length > 1 ? "Nierozpoznany układ PDF: znaleziono kilka kwot w wierszu. Sprawdź kwotę przed importem." : "Nierozpoznany układ PDF: sprawdź odczytaną datę, opis i kwotę przed importem.",
    });
  }));
  return candidates;
}

function buildResult(candidates: Candidate[], source: string, expectedCurrency: string, options: PdfParseOptions, profile: PdfProfile): StatementParseResult {
  const occurrences = new Map<string, number>();
  let repeatedCount = 0;
  const transactions: StatementTransaction[] = candidates.map((candidate, index) => {
    const kind: StatementTransactionKind = candidate.amount < 0 ? "expense" : "income";
    const suggestion = importSuggestion(candidate.rawType, candidate.name, options.detectTransferSuggestions !== false);
    const rawSourceKey = [
      "pdf", normalizeStatementHeader(candidate.provider), candidate.instrumentIdentifier,
      candidate.date, normalizeStatementHeader(candidate.rawType), normalizeStatementHeader(candidate.name), candidate.amount.toFixed(2),
    ].join("\u001f");
    const occurrence = (occurrences.get(rawSourceKey) ?? 0) + 1;
    occurrences.set(rawSourceKey, occurrence);
    if (occurrence > 1) repeatedCount += 1;
    const sourceKey = occurrence > 1 ? `${rawSourceKey}\u001eoccurrence:${occurrence}` : rawSourceKey;
    const transactionType = candidate.transactionTypeOverride ?? inferTransactionType(candidate.rawType, candidate.name, candidate.amount);
    const applicationType = profile !== "generic" && transactionType === null
      ? "normal_transaction" as const
      : classifyApplicationType(candidate.rawType, candidate.name, candidate.amount, transactionType);
    return {
      id: `statement-pdf-${candidate.pageNumber}-${index + 1}`,
      sourceKey,
      kind,
      name: candidate.name || candidate.counterparty || candidate.rawType || "Operacja bankowa",
      amount: Math.round(candidate.amount * 100) / 100,
      date: candidate.date,
      occurredAt: `${candidate.date}T12:00:00`,
      category: "Inne",
      currency: expectedCurrency,
      includeByDefault: candidate.includeByDefault ?? suggestion.include,
      excludeFromAnalysis: suggestion.excludeFromAnalysis,
      note: [candidate.note, suggestion.note, occurrence > 1 ? "Taka sama operacja występuje w tym PDF więcej niż raz - traktowana jest jako osobne wystąpienie." : ""].filter(Boolean).join(" ") || undefined,
      transactionType,
      bankStatus: "completed",
      rawType: candidate.rawType,
      rawDescription: candidate.rawDescription,
      counterparty: candidate.counterparty,
      rawData: {
        pdf_text: candidate.rawText,
        pdf_page: String(candidate.pageNumber),
        pdf_profile: profile,
        original_date: candidate.date,
        original_amount: String(Math.round(candidate.amount * 100) / 100),
        original_name: candidate.name,
        original_raw_type: candidate.rawType,
        original_counterparty: candidate.counterparty,
        original_transaction_type: transactionType ?? "",
        original_application_type: applicationType,
      },
      sourceInstrument: {
        bank: candidate.provider,
        identifier: candidate.instrumentIdentifier,
        type: candidate.instrumentType,
        ...(options.mappedAccountId ? { mappedAccountId: options.mappedAccountId } : {}),
      },
      applicationType,
      duplicateState: occurrence > 1 ? "same-file" : undefined,
      resolution: "new",
      transferSuggested: suggestion.transferSuggested,
    };
  });

  const profileLabel = profile === "vinted" ? "Vinted Pay" : profile === "millennium-card" ? "Millennium - karta kredytowa" : profile === "millennium-account" ? "Millennium - rachunek" : "układ nierozpoznany";
  const warnings = [`PDF: rozpoznano ${transactions.length} operacji (${profileLabel}). Wszystkie dane są tylko podglądem - przed importem możesz poprawić datę, nazwę, kwotę, typ i kontrahenta.`];
  if (profile === "generic") warnings.push("Nie rozpoznano konkretnego układu instytucji. Parser użył położenia dat i kwot; pozycje są domyślnie odznaczone, dopóki ich nie sprawdzisz lub poprawisz.");
  if (repeatedCount) warnings.push(`Zachowano ${repeatedCount} powtórzonych operacji jako osobne wystąpienia.`);
  return { source, transactions, rejected: [], skipped: 0, warnings };
}

export function parseStatementPdf(extraction: StatementPdfExtraction, expectedCurrency = "PLN", options: PdfParseOptions = {}): StatementParseResult {
  if (!extraction?.pages?.length || !extraction.text?.trim()) throw new Error("PDF nie zawiera tekstu możliwego do analizy.");
  const currency = expectedCurrency.trim().toUpperCase() || "PLN";
  const profile = profileFor(extraction);
  const candidates = profile === "vinted" ? parseVinted(extraction)
    : profile === "millennium-account" ? parseMillenniumAccount(extraction)
      : profile === "millennium-card" ? parseMillenniumCard(extraction)
        : parseGeneric(extraction, options, currency);
  if (!candidates.length) throw new Error("Nie udało się rozpoznać transakcji w tym PDF. Dokument może mieć nietypowy układ albo nie zawierać tekstowej tabeli operacji.");
  const source = profile === "vinted" ? "PDF Vinted Pay"
    : profile === "millennium-account" ? "PDF Millennium - rachunek"
      : profile === "millennium-card" ? "PDF Millennium - karta kredytowa"
        : "PDF - import niestandardowy";
  return buildResult(candidates, source, currency, options, profile);
}
