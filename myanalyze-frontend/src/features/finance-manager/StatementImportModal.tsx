import React from "react";
import StatementCsvMapping from "./StatementCsvMapping";
import type { StatementCsvLayout } from "./statementImport";
import Button from "../../components/Button";
import { ClipboardCopy, FileUp, Sparkles } from "lucide-react";
import Modal from "../../components/Modal";
import DataGrid, { type DataGridColumn } from "../../components/DataGrid";
import ModuleBadge from "../../components/ModuleBadge";
import TransactionLinkDetailsModal from "./TransactionLinkDetailsModal";
import type { Account } from "../../types/account";
import apiClient, { apiErrorMessage } from "../../utils/apiClient";
import { formatDate, formatCurrency } from "../../utils/formatters";
import { applyMatchAnalysis, markAlreadyImported, markPotentialOverlaps, parseStatementCsv, readStatementFile, type StatementMatchAnalysis, type StatementParseResult, type StatementPotentialOverlap, type StatementTransaction } from "./statementImport";
import { parseStatementPdf, type StatementPdfExtraction } from "./statementPdf";
import { normalizeStatementHeader, parseStatementAmount, parseStatementDate } from "./statementCsv";
import { classifyApplicationType, importSuggestion, inferTransactionType } from "./statementImportPolicy";
import type { StatementRejectedRow, StatementTransferCandidate } from "./statementImportTypes";
import { transactionTypeOptionsFor } from "../../types/transactionType";
import { isCreditAccount } from "../../utils/accountModel";
import AllocationModal from "../../components/AllocationModal";
import { useCustomTransactionTypes } from "../../hooks/useCustomTransactionTypes";
import { useUiText } from "../../i18n";

interface StatementImportModalProps {
  account: Account;
  onClose: () => void;
  onImported: () => Promise<void>;
  onSuccess: (message: string) => void;
}

interface ImportResponse {
  importedExpenses: number;
  importedIncomes: number;
  duplicates: number;
  matchedPlans: number;
  reconciledExisting: number;
  linkedTransfers: number;
  refreshedTransactions: number;
}

interface ImportSettings {
  detectTransferSuggestions: boolean;
  transferDateTolerance: number;
  autoSelectPlanMatch: boolean;
}

const DEFAULT_IMPORT_SETTINGS: ImportSettings = {
  detectTransferSuggestions: true,
  transferDateTolerance: 3,
  autoSelectPlanMatch: true,
};

function ImportOperation({ kind, name, date, amount, accountName }: { kind: "income" | "expense"; name: string; date: string; amount: number; accountName: string }) {
  return <div className="min-w-0 space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <ModuleBadge tone={kind === "income" ? "success" : "danger"} size="sm">{kind === "income" ? "Przychód" : "Wydatek"}</ModuleBadge>
      <strong className={kind === "income" ? "text-emerald-700" : "text-red-700"}>{kind === "income" ? "+" : "−"}{formatCurrency(Math.abs(amount))}</strong>
    </div>
    <p className="text-xs text-slate-500">{accountName} · {formatDate(date)}</p>
    <p className="break-words text-sm font-semibold text-slate-900">{name}</p>
  </div>;
}

function StatementCorrectionEditor({ transaction, onApply, onReset }: { transaction: StatementTransaction; onApply: (draft: { date: string; name: string; amount: string; rawType: string; counterparty: string }) => void; onReset?: () => void }) {
  const [date, setDate] = React.useState(transaction.date);
  const [name, setName] = React.useState(transaction.name);
  const [amount, setAmount] = React.useState(String(transaction.amount));
  const [rawType, setRawType] = React.useState(transaction.rawType);
  const [counterparty, setCounterparty] = React.useState(transaction.counterparty);
  React.useEffect(() => {
    setDate(transaction.date); setName(transaction.name); setAmount(String(transaction.amount)); setRawType(transaction.rawType); setCounterparty(transaction.counterparty);
  }, [transaction.id, transaction.date, transaction.name, transaction.amount, transaction.rawType, transaction.counterparty]);
  return <div className="space-y-2 rounded-lg border border-blue-100 bg-white p-3">
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
      <label className="text-xs font-medium text-slate-600">Data<input type="date" className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label className="text-xs font-medium text-slate-600 xl:col-span-2">Nazwa<input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm" value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className="text-xs font-medium text-slate-600">Kwota ze znakiem<input inputMode="decimal" className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      <label className="text-xs font-medium text-slate-600">Typ źródłowy<input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm" value={rawType} onChange={(event) => setRawType(event.target.value)} /></label>
      <label className="text-xs font-medium text-slate-600 md:col-span-2 xl:col-span-5">Kontrahent<input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm" value={counterparty} onChange={(event) => setCounterparty(event.target.value)} /></label>
    </div>
    <div className="flex flex-wrap gap-2">
      <button type="button" className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700" onClick={() => onApply({ date, name, amount, rawType, counterparty })}>Zastosuj korektę</button>
      {onReset && <button type="button" className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={onReset}>Cofnij korektę</button>}
    </div>
  </div>;
}

const providerCode = (source: string) => source.toLowerCase().includes("millennium") ? "millennium" : source.toLowerCase().includes("revolut") ? "revolut" : source.toLowerCase().includes("vinted") ? "vinted" : source.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "generic_csv";
const importProvider = (result: StatementParseResult, account: Account) => providerCode(result.transactions.find((item) => item.sourceInstrument.bank !== "Nieznany bank")?.sourceInstrument.bank || account.institution_name || result.source);

function buildStatementCsvGptPrompt(currency: string): string {
  return [
    "ZADANIE: przekonwertuj załączony wyciąg na CSV do MyAnalyze. Nie wykonuj analizy finansowej.",
    "Zwróć plik do pobrania .csv (UTF-8). Jeżeli nie możesz tworzyć plików, zwróć tylko jeden blok kodu csv; do pliku zapisuje się jego zawartość BEZ znaczników bloku.",
    "",
    "FORMAT OBOWIĄZKOWY:",
    "Pierwszy wiersz to dokładnie poniższy nagłówek. Nie tłumacz go, nie zmieniaj kolejności ani nazw:",
    "Date;Amount;Currency;Description;Counterparty;Type;Status;Transaction ID;Account",
    "Separator: średnik. Każdy rekord ma dokładnie 9 pól, również gdy ostatnie pola są puste. Bez sep=;, komentarzy, numeracji, tabel Markdown i podsumowań.",
    "Kwota: kropka dziesiętna, dokładnie 2 miejsca, bez separatorów tysięcy i symbolu waluty: -1234.56 lub 1234.56.",
    "",
    "ZNACZENIE PÓL:",
    "Date: data operacji YYYY-MM-DD; data księgowania, jeśli tylko ona jest dostępna. Nie zgaduj brakującego roku.",
    "Amount: ruch na rachunku/karcie/portfelu, KTÓREGO dotyczy wyciąg. Wypływ = minus; wpływ = liczba dodatnia. Wypłata z portfela na konto bankowe jest wypływem portfela, a nie zakupem.",
    `Currency: kod waluty, np. ${currency}. Ten import przyjmuje ${currency}. Nie przeliczaj walut; jeśli są inne, zapytaj przed konwersją o zakres zamiast usuwać je bez informacji.`,
    "Description: wierny opis ze źródła, może być pusty.",
    "Counterparty: kontrahent ze źródła, może być pusty.",
    "Type: surowy rodzaj operacji, jeśli występuje. W przeciwnym razie puste. Nie zgaduj transferu własnego.",
    "Status: completed / pending / cancelled. Bez statusu na wyciągu użyj completed. Zachowaj operacje oczekujące i anulowane z właściwym statusem.",
    "Transaction ID: wyłącznie unikalny identyfikator operacji podany przez instytucję. Brak = puste; nie generuj ID ani nie używaj numeru wiersza.",
    "Account: identyfikator ŹRÓDŁOWEGO rachunku/karty/portfela, którego historię konwertujesz. NIGDY rachunek odbiorcy ani rachunek docelowy wypłaty. Jeśli nie znasz źródłowego identyfikatora, pozostaw puste; nie wyciągaj numeru z opisu przelewu.",
    "",
    "ZACHOWANIE DANYCH:",
    "Jedna operacja = jeden rekord. Zachowaj wszystkie wystąpienia identycznych transakcji. Nie łącz rekordów, nie deduplikuj, nie pomijaj transferów, zakupów, zwrotów ani spłat.",
    "Pomiń wyłącznie elementy niebędące operacjami (nagłówki, salda, sumy, limity, puste linie) oraz operacje o kwocie 0.",
    "Nie wymyślaj danych. Gdy data, kwota lub kierunek są nieczytelne, zapytaj o te konkretne rekordy przed wygenerowaniem końcowego pliku. Nie zwracaj nieoznaczonego fragmentu wyciągu jako kompletnego.",
    "Puste opis/kontrahent/typ są poprawne. Nie dodawaj sztucznych wartości NULL, N/A ani kategorii.",
    'Pola ze średnikiem lub cudzysłowem otocz cudzysłowami; każdy cudzysłów wewnątrz podwój. Łamanie tekstu w opisie zamień na spację.',
    "",
    "PRZYKŁAD SKŁADNI (nie dopisuj tych operacji do wyniku):",
    `2026-09-03;-100.00;${currency};Wypłata na konto bankowe;;;completed;;`,
    `2026-09-03;95.00;${currency};Sprzedaż przedmiotu;Kupujący;;completed;;`,
    "",
    "KONTROLA PRZED ODDANIEM:",
    "Odczytaj wynik parserem CSV z separatorem ;, jeśli masz narzędzie do kodu. Sprawdź: dokładny nagłówek, 9 pól w każdym rekordzie, poprawne daty, kwoty i walutę, zachowanie liczby operacji oraz osobno sum wpływów i wypływów ze źródła.",
    "Przykładowe rekordy nie mogą znaleźć się w wyniku. Żadnych trzech kropek, skrótów ani zastępowania reszty opisem. Zwróć kompletny CSV.",
  ].join("\n");
}

interface DuplicateCheckResponse {
  duplicateSourceKeys: string[];
  possibleOverlaps?: StatementPotentialOverlap[];
  matchAnalysis?: StatementMatchAnalysis[];
}

interface ExistingTransactionApiRow {
  id?: unknown;
  nazwa?: unknown;
  kwota?: unknown;
  data_dodania?: unknown;
  zrealizowany?: unknown;
  account_id?: unknown;
}

interface TransferAccountApiRow {
  id?: unknown;
  nazwa?: unknown;
  typ_depozytu?: unknown;
}

function importPayload(transaction: StatementTransaction) {
  const base = { sourceKey: transaction.sourceKey, name: transaction.name, amount: transaction.amount, date: transaction.date, occurredAt: transaction.occurredAt, category: transaction.category, customTypeId: transaction.customTypeId ?? null, currency: transaction.currency, transactionType: transaction.transactionType, excludeFromAnalysis: transaction.excludeFromAnalysis, bankStatus: transaction.bankStatus, rawType: transaction.rawType, applicationType: transaction.applicationType, sourceInstrument: transaction.sourceInstrument };
  if (transaction.resolution === "transfer" && transaction.transferCandidate) return { ...base, resolution: "transfer", transferTarget: { kind: transaction.transferCandidate.kind, transactionId: transaction.transferCandidate.transactionId } };
  if (transaction.resolution.startsWith("existing:")) return { ...base, resolution: "existing", existingTransactionId: Number(transaction.resolution.split(":")[1]) };
  if (transaction.resolution === "plan") return { ...base, resolution: "plan", planMatches: (transaction.planAllocations ?? []).map((allocation) => ({ source: allocation.source, planId: allocation.planId, occurrenceDate: allocation.occurrenceDate, amount: allocation.allocatedAmount })) };
  return { ...base, resolution: "new" };
}

export default function StatementImportModal({ account, onClose, onImported, onSuccess }: StatementImportModalProps) {
  const t = useUiText();
  const [result, setResult] = React.useState<StatementParseResult | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState("");
  const [reading, setReading] = React.useState(false);
  const [csvText, setCsvText] = React.useState("");
  const [sourceFileName, setSourceFileName] = React.useState("");
  const [importing, setImporting] = React.useState(false);
  const [previewFilter, setPreviewFilter] = React.useState<"all" | "expense" | "income" | "transfer" | "skipped" | "rejected" | "review">("all");
  const [rejectedErrors, setRejectedErrors] = React.useState<Record<string, string>>({});
  const [manualTransfer, setManualTransfer] = React.useState<{ transactionId: string; candidates: StatementTransferCandidate[]; loading: boolean; error: string } | null>(null);
  const [transferPreview, setTransferPreview] = React.useState<{ transaction: StatementTransaction; candidate: StatementTransferCandidate } | null>(null);
  const [allocationTransactionId, setAllocationTransactionId] = React.useState<string | null>(null);
  const [settings, setSettings] = React.useState<ImportSettings>(DEFAULT_IMPORT_SETTINGS);
  const [settingsSaving, setSettingsSaving] = React.useState(false);
  const [gptPromptOpen, setGptPromptOpen] = React.useState(false);
  const { activeRows: customTypes } = useCustomTransactionTypes();
  const [rememberClassification, setRememberClassification] = React.useState(false);
  const expectedCurrency = "PLN";
  const creditCard = isCreditAccount(account);

  React.useEffect(() => {
    let active = true;
    void apiClient.get("/konta/import-settings").then((response) => {
      if (!active) return;
      setSettings({
        detectTransferSuggestions: response.data?.detect_transfer_suggestions === 1 || response.data?.detect_transfer_suggestions === "1" || response.data?.detect_transfer_suggestions === true,
        transferDateTolerance: Math.min(7, Math.max(0, Number(response.data?.transfer_date_tolerance ?? 3))),
        autoSelectPlanMatch: response.data?.auto_select_plan_match === 1 || response.data?.auto_select_plan_match === "1" || response.data?.auto_select_plan_match === true,
      });
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const saveImportSettings = async () => {
    setSettingsSaving(true);
    setError("");
    try { await apiClient.put("/konta/import-settings", settings); }
    catch { setError("Nie udało się zapisać ustawień importu."); }
    finally { setSettingsSaving(false); }
  };

  const copyGptPrompt = async () => {
    try {
      await navigator.clipboard.writeText(buildStatementCsvGptPrompt(expectedCurrency));
      onSuccess("Skopiowano wytyczne dla GPT.");
    } catch {
      setError("Nie udało się skopiować wytycznych. Zaznacz tekst ręcznie.");
    }
  };

  const prepareParsed = async (input: StatementParseResult) => {
    let parsed = input;
    try {
      const mappingsResponse = await apiClient.get(`/custom-transaction-types/import-classification/${importProvider(parsed, account)}`);
      const mappings = Array.isArray(mappingsResponse.data) ? mappingsResponse.data : [];
      parsed = { ...parsed, transactions: parsed.transactions.map((transaction) => {
        const exact = mappings.find((item: Record<string, unknown>) => item.kind === transaction.kind && String(item.raw_type ?? "").toLocaleLowerCase("pl-PL") === transaction.rawType.trim().toLocaleLowerCase("pl-PL"));
        const fallback = mappings.find((item: Record<string, unknown>) => item.kind === transaction.kind && !String(item.raw_type ?? ""));
        const mapping = exact ?? fallback;
        return mapping ? { ...transaction, customTypeId: mapping.custom_type_id == null ? null : Number(mapping.custom_type_id), customTypeName: mapping.custom_type_name == null ? null : String(mapping.custom_type_name) } : transaction;
      }) };
    } catch { /* Brak konfiguracji nie blokuje importu. */ }
    try {
      const duplicateCheck = await apiClient.post<DuplicateCheckResponse>(`/konta/${account.id}/import-transactions/check-duplicates`, {
        sourceKeys: parsed.transactions.map((transaction) => transaction.sourceKey),
        transactions: parsed.transactions.map(({ sourceKey, name, amount, date, transactionType, bankStatus, transferSuggested }) => ({ sourceKey, name, amount, date, transactionType, bankStatus, transferSuggested })),
      });
      parsed = markAlreadyImported(parsed, duplicateCheck.data.duplicateSourceKeys);
      parsed = applyMatchAnalysis(parsed, duplicateCheck.data.matchAnalysis ?? [], settings.autoSelectPlanMatch);
      parsed = markPotentialOverlaps(parsed, duplicateCheck.data.possibleOverlaps ?? []);
    } catch {
      parsed = { ...parsed, warnings: [...parsed.warnings, "Nie udało się sprawdzić wcześniejszych importów. Twarde duplikaty zostaną ponownie sprawdzone podczas zapisu."] };
    }
    setResult(parsed);
    setSelected(new Set(parsed.transactions.filter((transaction) => transaction.includeByDefault).map((transaction) => transaction.id)));
    if (!parsed.transactions.length) setError("Nie znaleziono transakcji możliwych do importu.");
  };

  const resetPreview = () => {
    setError("");
    setResult(null);
    setSelected(new Set());
    setPreviewFilter("all");
    setRejectedErrors({});
    setManualTransfer(null);
    setTransferPreview(null);
    setAllocationTransactionId(null);
  };

  const previewCsv = async (text: string, layout?: StatementCsvLayout) => {
    resetPreview();
    setReading(true);
    try {
      const parsed = parseStatementCsv(text, expectedCurrency, { accountKind: creditCard ? "credit-card" : "bank-account", detectTransferSuggestions: settings.detectTransferSuggestions, mappedAccountId: account.id, layout });
      await prepareParsed(parsed);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nie udało się odczytać pliku CSV.");
    } finally { setReading(false); }
  };

  const previewPdf = async (file: File) => {
    resetPreview();
    setReading(true);
    try {
      const bytes = await file.arrayBuffer();
      const response = await apiClient.post<StatementPdfExtraction>(`/konta/${account.id}/extract-statement-pdf`, bytes, { headers: { "Content-Type": "application/pdf" } });
      const parsed = parseStatementPdf(response.data, expectedCurrency, {
        accountKind: creditCard ? "credit-card" : "bank-account",
        detectTransferSuggestions: settings.detectTransferSuggestions,
        mappedAccountId: account.id,
        institutionName: account.institution_name,
      });
      await prepareParsed(parsed);
    } catch (caught) {
      setError(apiErrorMessage(caught, caught instanceof Error ? caught.message : "Nie udało się odczytać pliku PDF."));
    } finally { setReading(false); }
  };

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    setCsvText("");
    setSourceFileName(file.name);
    const lowerName = file.name.toLocaleLowerCase("pl-PL");
    if (lowerName.endsWith(".pdf")) {
      if (file.size > 10 * 1024 * 1024) {
        resetPreview();
        setError("Wybierz plik PDF o rozmiarze do 10 MB.");
        return;
      }
      await previewPdf(file);
      return;
    }
    if (!lowerName.endsWith(".csv") || file.size > 5 * 1024 * 1024) {
      resetPreview();
      setError("Wybierz plik CSV do 5 MB albo PDF do 10 MB.");
      return;
    }
    setReading(true);
    try {
      const text = await readStatementFile(file);
      setCsvText(text);
      await previewCsv(text);
    } catch {
      resetPreview();
      setError("Nie udało się odczytać pliku CSV.");
    } finally { setReading(false); }
  };

  const updateTransaction = (id: string, update: Partial<StatementTransaction>) => {
    setResult((current) => current ? { ...current, transactions: current.transactions.map((transaction) => transaction.id === id ? { ...transaction, ...update } : transaction) } : current);
  };

  const applyTransactionCorrection = (
    transaction: StatementTransaction,
    draft: { date: string; name: string; amount: string; rawType: string; counterparty: string },
    restoreOriginalClassification = false,
  ) => {
    const date = parseStatementDate(draft.date);
    const amount = parseStatementAmount(draft.amount);
    const name = draft.name.trim() || draft.counterparty.trim() || draft.rawType.trim() || "Operacja bankowa";
    if (!date || amount === null || amount === 0) {
      setError("Korekta wymaga prawidłowej daty i niezerowej kwoty ze znakiem.");
      return;
    }
    const kind = amount < 0 ? "expense" as const : "income" as const;
    const rawType = draft.rawType.trim();
    const counterparty = draft.counterparty.trim();
    const suggestion = importSuggestion(rawType, name, settings.detectTransferSuggestions);
    const inferredTransactionType = inferTransactionType(rawType, name, amount);
    const originalTransactionType = transaction.rawData.original_transaction_type || null;
    const sameProviderSignal = normalizeStatementHeader(rawType) === normalizeStatementHeader(transaction.rawType)
      && Math.sign(amount) === Math.sign(transaction.amount);
    const correctedTransactionType = restoreOriginalClassification
      ? originalTransactionType as StatementTransaction["transactionType"]
      : inferredTransactionType ?? (sameProviderSignal ? transaction.transactionType : null);
    const correctedApplicationType = restoreOriginalClassification && transaction.rawData.original_application_type
      ? transaction.rawData.original_application_type as StatementTransaction["applicationType"]
      : classifyApplicationType(rawType, name, amount, correctedTransactionType);
    const hardDuplicate = ["already-imported", "hard-duplicate"].includes(transaction.duplicateState ?? "");
    updateTransaction(transaction.id, {
      date,
      occurredAt: `${date}T12:00:00`,
      name,
      amount: Math.round(amount * 100) / 100,
      kind,
      rawType,
      rawDescription: name,
      counterparty,
      transactionType: correctedTransactionType,
      applicationType: correctedApplicationType,
      transferSuggested: suggestion.transferSuggested,
      excludeFromAnalysis: hardDuplicate ? transaction.excludeFromAnalysis : suggestion.excludeFromAnalysis,
      resolution: hardDuplicate ? "skip" : "new",
      duplicateState: hardDuplicate ? transaction.duplicateState : transaction.duplicateState === "same-file" ? "same-file" : undefined,
      planCandidates: [], existingCandidates: [], planAllocations: [], transferCandidate: undefined, transferCandidates: undefined,
      note: [transaction.note?.replace(/Wprowadzono ręczną korektę odczytu PDF\.?.*$/i, "").trim(), "Wprowadzono ręczną korektę odczytu PDF. Dopasowanie planu/transferu zostało wyzerowane; sprawdź decyzję przed importem."].filter(Boolean).join(" "),
    });
    if (!hardDuplicate) setSelected((current) => new Set(current).add(transaction.id));
    setError("");
  };

  const resetTransactionCorrection = (transaction: StatementTransaction) => {
    const originalDate = transaction.rawData.original_date;
    const originalAmount = transaction.rawData.original_amount;
    const originalName = transaction.rawData.original_name;
    if (!originalDate || !originalAmount || !originalName) return;
    applyTransactionCorrection(transaction, {
      date: originalDate,
      amount: originalAmount,
      name: originalName,
      rawType: transaction.rawData.original_raw_type ?? transaction.rawType,
      counterparty: transaction.rawData.original_counterparty ?? transaction.counterparty,
    }, true);
  };
  const isUnclassified = (transaction: StatementTransaction) => transaction.applicationType === "unknown" || (!transaction.rawType.trim() && transaction.transactionType == null);
  const classifyUnknown = async (kind: "income" | "expense", update: { customTypeId?: number | null; customTypeName?: string | null }) => {
    setResult((current) => current ? { ...current, transactions: current.transactions.map((transaction) => transaction.kind === kind && isUnclassified(transaction) ? { ...transaction, ...update } : transaction) } : current);
    if (!result || !rememberClassification) return;
    try { await apiClient.put(`/custom-transaction-types/import-classification/${importProvider(result, account)}`, { raw_type: "", kind, custom_type_id: update.customTypeId }); }
    catch { setError("Zastosowano ustawienie w imporcie, ale nie udało się zapamiętać go dla providera."); }
  };
  const classifyTransaction = async (transaction: StatementTransaction, update: { customTypeId?: number | null; customTypeName?: string | null }) => {
    updateTransaction(transaction.id, update);
    if (!result || !rememberClassification || !transaction.rawType.trim()) return;
    try { await apiClient.put(`/custom-transaction-types/import-classification/${importProvider(result, account)}`, { raw_type: transaction.rawType.trim(), kind: transaction.kind, custom_type_id: update.customTypeId }); }
    catch { setError("Zastosowano ustawienie w imporcie, ale nie udało się zapamiętać mapowania typu źródłowego."); }
  };

  const updateRejected = (id: string, update: Partial<StatementRejectedRow>) => {
    setResult((current) => current ? { ...current, rejected: current.rejected.map((row) => row.id === id ? { ...row, ...update } : row) } : current);
    setRejectedErrors((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const removeRejected = (id: string) => {
    setResult((current) => current ? { ...current, rejected: current.rejected.filter((row) => row.id !== id) } : current);
    if (result?.rejected.length === 1) setPreviewFilter("all");
    setRejectedErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const restoreRejected = (row: StatementRejectedRow) => {
    const date = parseStatementDate(row.date);
    const amount = parseStatementAmount(row.amount);
    const name = row.name.trim() || row.rawType.trim() || "Operacja bankowa";
    const currency = row.currency.trim().toUpperCase();
    if (!date || amount === null || amount === 0 || currency !== expectedCurrency) {
      setRejectedErrors((current) => ({ ...current, [row.id]: `Uzupełnij poprawną datę, niezerową kwotę i walutę ${expectedCurrency}.` }));
      return;
    }
    const kind = amount < 0 ? "expense" as const : "income" as const;
    const suggestion = importSuggestion(row.rawType, name, settings.detectTransferSuggestions);
    const id = `statement-repaired-${row.rowNumber}`;
    const transaction: StatementTransaction = {
      id,
      sourceKey: ["repaired", row.rowNumber, row.rawType, row.date, name, amount.toFixed(2), currency].join("\u001f"),
      kind,
      name,
      amount: Math.round(amount * 100) / 100,
      date,
      occurredAt: `${date}T12:00:00`,
      category: "Inne",
      currency,
      includeByDefault: row.bankStatus !== "cancelled",
      excludeFromAnalysis: row.bankStatus === "cancelled",
      note: row.bankStatus === "pending" ? "Operacja oczekująca - kolejny wyciąg może zaktualizować jej status." : undefined,
      transactionType: inferTransactionType(row.rawType, name, amount),
      bankStatus: row.bankStatus,
      rawType: row.rawType,
      rawDescription: row.name.trim(),
      counterparty: "",
      rawData: {},
      sourceInstrument: { bank: "Nieznany bank", identifier: `mapped-account:${account.id}`, type: creditCard ? "credit_card" : "account", mappedAccountId: account.id },
      applicationType: classifyApplicationType(row.rawType, name, amount),
      resolution: row.bankStatus === "cancelled" ? "skip" : "new",
      transferSuggested: suggestion.transferSuggested,
    };
    setResult((current) => current ? { ...current, transactions: [...current.transactions, transaction], rejected: current.rejected.filter((item) => item.id !== row.id), skipped: Math.max(0, current.skipped - 1) } : current);
    if (row.bankStatus !== "cancelled") setSelected((current) => new Set(current).add(id));
    setRejectedErrors((current) => {
      const next = { ...current };
      delete next[row.id];
      return next;
    });
    setError("");
    setPreviewFilter("all");
  };

  const changeResolution = (transaction: StatementTransaction, resolution: string) => {
    const transferCandidate = resolution.startsWith("transfer:")
      ? transaction.transferCandidates?.find((candidate) => `transfer:${candidate.kind}:${candidate.transactionId}` === resolution)
      : undefined;
    updateTransaction(transaction.id, {
      resolution: transferCandidate ? "transfer" : resolution,
      transferCandidate,
    });
    setSelected((current) => {
      const next = new Set(current);
      if (resolution === "skip") next.delete(transaction.id);
      else next.add(transaction.id);
      return next;
    });
  };

  const openManualTransfer = async (transaction: StatementTransaction) => {
    setManualTransfer({ transactionId: transaction.id, candidates: [], loading: true, error: "" });
    try {
      const [expensesResponse, incomesResponse, accountsResponse] = await Promise.all([
        apiClient.get<ExistingTransactionApiRow[]>("/wydatki"),
        apiClient.get<ExistingTransactionApiRow[]>("/przychody"),
        apiClient.get<TransferAccountApiRow[]>("/konta"),
      ]);
      const accounts = new Map((Array.isArray(accountsResponse.data) ? accountsResponse.data : []).map((row) => [Number(row.id), {
        name: typeof row.nazwa === "string" ? row.nazwa : "Inne konto",
        creditCard: /karta.*kredyt/i.test(String(row.typ_depozytu ?? "")),
      }]));
      const rows = [
        ...(Array.isArray(expensesResponse.data) ? expensesResponse.data.map((row) => ({ row, kind: "expense" as const })) : []),
        ...(Array.isArray(incomesResponse.data) ? incomesResponse.data.map((row) => ({ row, kind: "income" as const })) : []),
      ];
      const importedDate = Date.parse(`${transaction.date}T00:00:00Z`);
      const importedAmount = Math.round(Math.abs(transaction.amount) * 100);
      const candidates = rows.flatMap(({ row, kind }): StatementTransferCandidate[] => {
        const realized = row.zrealizowany === true || row.zrealizowany === 1 || row.zrealizowany === "1" || row.zrealizowany === "true";
        const transactionId = Number(row.id);
        const candidateAccountId = Number(row.account_id);
        const amount = Number(row.kwota);
        const date = typeof row.data_dodania === "string" ? row.data_dodania.slice(0, 10) : "";
        const distance = Math.abs(Date.parse(`${date}T00:00:00Z`) - importedDate) / 86_400_000;
        const candidateAccount = accounts.get(candidateAccountId);
        const directionMatches = kind !== transaction.kind || creditCard || candidateAccount?.creditCard;
        if (!realized || candidateAccountId === account.id || !candidateAccount || !directionMatches || !Number.isInteger(transactionId) || !Number.isFinite(amount) || Math.round(Math.abs(amount) * 100) !== importedAmount || distance > settings.transferDateTolerance) return [];
        return [{ kind, transactionId, accountName: candidateAccount.name, transactionName: typeof row.nazwa === "string" && row.nazwa.trim() ? row.nazwa : "Operacja bez nazwy", transactionDate: date, transactionAmount: Math.abs(amount) }];
      });
      setManualTransfer((current) => current?.transactionId === transaction.id ? { ...current, candidates, loading: false, error: candidates.length ? "" : `Brak operacji o tej kwocie na innych kontach w zakresie ±${settings.transferDateTolerance} dni.` } : current);
    } catch {
      setManualTransfer((current) => current?.transactionId === transaction.id ? { ...current, loading: false, error: "Nie udało się pobrać operacji z innych kont." } : current);
    }
  };

  const chooseManualTransfer = (transaction: StatementTransaction, candidate: StatementTransferCandidate) => {
    updateTransaction(transaction.id, {
      transferCandidates: [...(transaction.transferCandidates ?? []).filter((item) => item.kind !== candidate.kind || item.transactionId !== candidate.transactionId), candidate],
      transferCandidate: candidate,
      resolution: "transfer",
    });
    setSelected((current) => new Set(current).add(transaction.id));
    setManualTransfer(null);
  };

  const importTransactions = async () => {
    if (!result) return;
    const transactions = result.transactions.filter((transaction) => selected.has(transaction.id));
    if (!transactions.length) { setError("Zaznacz co najmniej jedną transakcję."); return; }
    if (transactions.some((transaction) => transaction.resolution === "plan" && !(transaction.planAllocations?.length))) {
      setError("Wybierz co najmniej jedną powiązaną transakcję dla każdej pozycji rozliczającej plan.");
      return;
    }
    setImporting(true);
    setError("");
    try {
      const response = await apiClient.post<ImportResponse>(`/konta/${account.id}/import-transactions`, {
        source: result.source,
        transactions: transactions.map(importPayload),
      });
      await onImported();
      const imported = response.data.importedExpenses + response.data.importedIncomes;
      onSuccess(`Zaimportowano ${imported} transakcji (${response.data.importedExpenses} wydatków, ${response.data.importedIncomes} przychodów).${response.data.refreshedTransactions ? ` Zaktualizowano statusów: ${response.data.refreshedTransactions}.` : ""}${response.data.linkedTransfers ? ` Potwierdzono transferów: ${response.data.linkedTransfers}.` : ""}${response.data.reconciledExisting ? ` Powiązano z istniejącymi: ${response.data.reconciledExisting}.` : ""}${response.data.matchedPlans ? ` Rozliczono planów: ${response.data.matchedPlans}.` : ""}${response.data.duplicates ? ` Pominięto ${response.data.duplicates} duplikatów.` : ""}`);
      onClose();
    } catch (caught) { setError(apiErrorMessage(caught, "Nie udało się zapisać importu. Dane nie zostały częściowo dodane.")); }
    finally { setImporting(false); }
  };

  const selectedTransactions = result?.transactions.filter((transaction) => selected.has(transaction.id)) ?? [];
  const selectedExpenses = selectedTransactions.filter((transaction) => transaction.kind === "expense");
  const selectedIncomes = selectedTransactions.filter((transaction) => transaction.kind === "income");
  const expenseTotal = selectedExpenses.reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const incomeTotal = selectedIncomes.reduce((sum, transaction) => sum + transaction.amount, 0);
  const needsReview = (transaction: StatementTransaction) => transaction.resolution === "new" && Boolean(
    transaction.duplicateState || transaction.transferSuggested || transaction.transferCandidates?.length
    || transaction.existingCandidates?.length || transaction.planCandidates?.length
  );
  const duplicateCount = result?.transactions.filter(needsReview).length ?? 0;
  const skippedPreviewCount = result?.transactions.filter((transaction) => transaction.resolution === "skip").length ?? 0;
  const transferPreviewCount = result?.transactions.filter((transaction) => transaction.transferSuggested || transaction.transferCandidate || transaction.resolution === "transfer").length ?? 0;
  const visibleTransactions = result?.transactions.filter((transaction) => previewFilter === "all"
    || (previewFilter === "skipped" ? transaction.resolution === "skip"
      : previewFilter === "transfer" ? Boolean(transaction.transferSuggested || transaction.transferCandidate || transaction.resolution === "transfer")
        : previewFilter === "review" ? needsReview(transaction)
        : transaction.kind === previewFilter)) ?? [];
  const filterButtonClass = (active: boolean) => `inline-flex rounded-md p-0.5 cursor-pointer transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${active ? "bg-blue-50 ring-2 ring-blue-500 ring-offset-1 shadow-sm" : "hover:-translate-y-px hover:bg-slate-50 hover:shadow-sm"}`;
  const allocationTransaction = result?.transactions.find((transaction) => transaction.id === allocationTransactionId) ?? null;
  const availableAllocationCandidates = (allocationTransaction?.planCandidates ?? []).filter((candidate) => !(allocationTransaction?.planAllocations ?? []).some((allocation) => allocation.source === candidate.source && allocation.planId === candidate.planId && allocation.occurrenceDate === candidate.occurrenceDate));
  const allocationOptions = availableAllocationCandidates.map((candidate, index) => ({ id: index + 1, label: `${candidate.source === "recurring" ? "Stały" : "Plan"}: ${candidate.name} · ${candidate.date}`, availableAmount: candidate.remainingAmount, displayAmount: candidate.remainingAmount }));
  const allocationLeft = allocationTransaction ? Math.max(0, Math.abs(allocationTransaction.amount) - (allocationTransaction.planAllocations ?? []).reduce((sum, allocation) => sum + allocation.allocatedAmount, 0)) : 0;

  const previewColumns: DataGridColumn<StatementTransaction>[] = [
    { key: "selected", label: "Importuj", value: (row) => selected.has(row.id) ? "Tak" : "Nie", width: 65, render: (row) =>
      <input type="checkbox" aria-label={`Importuj ${row.name}`} disabled={["already-imported", "hard-duplicate"].includes(row.duplicateState ?? "")} checked={selected.has(row.id)} onChange={(event) => changeResolution(row, event.target.checked ? (row.resolution === "skip" ? "new" : row.resolution) : "skip")} /> },
    { key: "date", label: "Data", value: (row) => row.date, render: (row) => formatDate(row.date), sortable: true, width: 110 },
    { key: "name", label: "Transakcja", value: (row) => row.name, sortable: true, width: 310, render: (row) => <div className="min-w-0 space-y-2">
      <p data-i18n-ignore="true" className="whitespace-normal break-words font-semibold text-slate-900">{row.name}</p>
      <p className="text-xs text-slate-500">{account.nazwa}</p>
      <div className="flex flex-wrap gap-1">
        {row.bankStatus !== "completed" && <ModuleBadge tone="warning" size="sm">{row.bankStatus === "pending" ? "Oczekująca" : "Anulowana"}</ModuleBadge>}
        {row.duplicateState && <ModuleBadge tone="warning" size="sm">{row.duplicateState === "already-imported" ? "Już w aplikacji" : row.duplicateState === "hard-duplicate" ? "Duplikat ID" : row.duplicateState === "same-file" ? "Podobna operacja w pliku" : row.duplicateState === "own-transfer" ? "Możliwy transfer" : "Możliwe powtórzenie"}</ModuleBadge>}
      </div>
      <details className="text-xs text-slate-600">
        <summary className="cursor-pointer font-semibold text-blue-700">Szczegóły i ustawienia</summary>
        <div className="mt-2 space-y-3 whitespace-normal rounded-lg bg-slate-50 p-3">
          {row.note && <p className="text-amber-800">{row.note}</p>}
          <p>Kontrahent: {row.counterparty || "-"}</p>
          <p>Typ ze źródła: {row.rawType || "Nie podano - nie blokuje importu"}</p>
          {row.rawData.pdf_text && <details className="rounded border border-slate-200 bg-white px-2 py-2"><summary className="cursor-pointer font-semibold text-slate-700">Tekst odczytany z PDF</summary><p className="mt-2 break-words font-mono text-[11px] leading-5 text-slate-500">{row.rawData.pdf_text}</p></details>}
          <StatementCorrectionEditor transaction={row} onApply={(draft) => applyTransactionCorrection(row, draft)} onReset={row.rawData.original_date ? () => resetTransactionCorrection(row) : undefined} />
          <label className="block">{t("Typ transakcji")}<select aria-label={`${t("Typ transakcji")} ${row.name}`} value={row.transactionType ?? ""} className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5" onChange={(event) => updateTransaction(row.id, { transactionType: (event.target.value || null) as StatementTransaction["transactionType"] })}><option value="">Nie określono</option>{transactionTypeOptionsFor(row.kind).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="flex items-center gap-2"><input type="checkbox" aria-label={`Licz w analizach ${row.name}`} disabled={row.resolution === "transfer"} checked={row.resolution !== "transfer" && !row.excludeFromAnalysis} onChange={(event) => updateTransaction(row.id, { excludeFromAnalysis: !event.target.checked })} />Licz w analizach</label>
        </div>
      </details>
    </div> },
    { key: "amount", label: "Kwota", value: (row) => Math.abs(row.amount), sortable: true, width: 145, align: "right", render: (row) => <div className={row.kind === "income" ? "text-emerald-700" : "text-red-700"}><strong className="block whitespace-nowrap text-base">{row.kind === "income" ? "+" : "−"}{formatCurrency(Math.abs(row.amount))}</strong><span className="text-xs">{row.kind === "income" ? "Przychód" : "Wydatek"}</span></div> },
    { key: "label", label: "Etykieta", value: (row) => row.customTypeName ?? "Bez etykiety", filterable: true, width: 165, render: (row) =>
      <select aria-label={`Etykieta ${row.name}`} value={row.customTypeId ?? ""} className="w-full rounded border border-slate-300 bg-white px-2 py-1.5" onChange={(event) => { const label = customTypes.find((item) => item.id === Number(event.target.value)); void classifyTransaction(row, { customTypeId: label?.id ?? null, customTypeName: label?.name ?? null }); }}><option value="">Bez etykiety</option>{customTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> },
    { key: "decision", label: "Co zrobić z operacją?", value: (row) => row.resolution === "new" ? "Nowa transakcja" : row.resolution === "skip" ? "Pomiń" : row.resolution === "transfer" ? "Transfer własny" : row.resolution === "plan" ? "Rozlicza plan" : "Potwierdza istniejącą", filterable: true, width: 340, render: (row) => {
      const existing = row.existingCandidates?.find((item) => `existing:${item.transactionId}` === row.resolution);
      const hardDuplicate = ["already-imported", "hard-duplicate"].includes(row.duplicateState ?? "");
      return <div className="min-w-0 space-y-2 whitespace-normal">
        <select aria-label={`Sposób importu ${row.name}`} disabled={hardDuplicate} value={row.resolution} className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 font-medium" onChange={(event) => event.target.value === "manual-transfer" ? void openManualTransfer(row) : changeResolution(row, event.target.value)}>
          <option value="new">{row.bankStatus === "completed" ? "Dodaj nową transakcję" : "Dodaj ze statusem z wyciągu"}</option>
          {row.resolution === "transfer" && <option value="transfer">Transfer własny · wybrano drugą stronę</option>}
          {row.bankStatus === "completed" && <option value="manual-transfer">Wybierz drugą stronę transferu…</option>}
          {row.existingCandidates?.map((candidate) => <option key={candidate.transactionId} value={`existing:${candidate.transactionId}`}>To ta sama operacja: {candidate.name} · {formatCurrency(candidate.amount)} · {formatDate(candidate.date)}</option>)}
          {!!row.planCandidates?.length && <option value="plan">Rozlicz zaplanowany wydatek / przychód</option>}
          <option value="skip">Pomiń w tym imporcie</option>
        </select>
        {row.resolution === "transfer" && row.transferCandidate ? <>
          <ImportOperation kind={row.transferCandidate.kind} name={row.transferCandidate.transactionName} date={row.transferCandidate.transactionDate} amount={row.transferCandidate.transactionAmount} accountName={row.transferCandidate.accountName} />
          <p className="text-xs text-blue-700">Po zapisie obie operacje pozostaną w historii, poza przychodami i wydatkami w analizach.</p>
          <div className="flex gap-3"><button type="button" className="text-xs font-semibold text-blue-700 hover:underline" onClick={() => setTransferPreview({ transaction: row, candidate: row.transferCandidate! })}>Porównaj</button><button type="button" className="text-xs font-semibold text-blue-700 hover:underline" onClick={() => void openManualTransfer(row)}>Zmień</button><button type="button" className="text-xs font-semibold text-slate-600 hover:underline" onClick={() => changeResolution(row, "new")}>Cofnij wybór</button></div>
        </> : row.resolution === "plan" ? <>
          {(row.planAllocations ?? []).map((allocation) => <div key={`${allocation.source}-${allocation.planId}-${allocation.occurrenceDate ?? ""}`} className="flex items-center justify-between gap-2 rounded bg-blue-50 px-2 py-2 text-xs text-blue-900"><span>{allocation.name}<strong className="block">{formatCurrency(allocation.allocatedAmount)}</strong></span><button type="button" aria-label={`Usuń powiązanie ${allocation.name}`} className="font-bold text-red-600" onClick={() => updateTransaction(row.id, { planAllocations: row.planAllocations?.filter((item) => item !== allocation) })}>×</button></div>)}
          <button type="button" disabled={!row.planCandidates?.length || (row.planAllocations ?? []).length >= (row.planCandidates ?? []).length || Math.abs(row.amount) <= (row.planAllocations ?? []).reduce((sum, item) => sum + item.allocatedAmount, 0)} className="text-sm font-semibold text-blue-700 disabled:opacity-50" onClick={() => setAllocationTransactionId(row.id)}>Wybierz plan i kwotę</button>
        </> : existing ? <>
          <ImportOperation kind={existing.kind} name={existing.name} date={existing.date} amount={existing.amount} accountName={account.nazwa} />
          <p className="text-xs text-slate-500">Potwierdzasz tę samą operację - bez dodawania drugiej transakcji.</p>
        </> : row.resolution === "new" ? <>
          <p className="text-xs text-slate-500">{row.excludeFromAnalysis ? "Wyłączona z analiz - możesz zmienić to w szczegółach." : row.bankStatus === "completed" ? "Zostanie dodana do historii i wykonania." : "Zapisze się ze statusem z wyciągu; nie jest wykonaniem."}</p>
          {!!row.transferCandidates?.length && row.bankStatus === "completed" && <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
            <p className="text-xs text-amber-900">Możliwy transfer · {row.transferCandidates.length} {row.transferCandidates.length === 1 ? "kandydat" : "kandydatów"}. Potwierdź, jeśli to ten sam przepływ.</p>
            <button type="button" className="mt-1 text-sm font-semibold text-blue-700 hover:underline" onClick={() => row.transferCandidates?.length === 1 ? setTransferPreview({ transaction: row, candidate: row.transferCandidates[0] }) : void openManualTransfer(row)}>Porównaj drugą stronę</button>
          </div>}
        </> : <p className="text-xs text-slate-500">Nie zostanie dodana z tego pliku.</p>}
      </div>;
    } },
  ];
  const manualSource = result?.transactions.find((row) => row.id === manualTransfer?.transactionId);
  const transferColumns: DataGridColumn<StatementTransferCandidate>[] = [
    { key: "date", label: "Data", value: (row) => row.transactionDate, render: (row) => formatDate(row.transactionDate), sortable: true, width: 110 },
    { key: "kind", label: "Kierunek", value: (row) => row.kind === "income" ? "Przychód" : "Wydatek", filterable: true, width: 120 },
    { key: "account", label: "Konto", value: (row) => row.accountName, filterable: true, width: 170 },
    { key: "name", label: "Transakcja", value: (row) => row.transactionName, sortable: true, width: 280 },
    { key: "amount", label: "Kwota", value: (row) => Math.abs(row.transactionAmount), sortable: true, width: 140, render: (row) => <strong className={row.kind === "income" ? "text-emerald-700" : "text-red-700"}>{row.kind === "income" ? "+" : "−"}{formatCurrency(Math.abs(row.transactionAmount))}</strong> },
  ];

  return (
    <Modal
      open
      onClose={importing || reading ? () => undefined : onClose}
      title={`${t("Import wyciągu")} - ${account.nazwa}`}
      description={t(creditCard ? "Transakcje zostaną zapisane jako wykonane. Import nie zmieni salda, zadłużenia ani wolnego limitu karty." : "Transakcje zostaną zapisane jako wykonane. Import nie zmieni salda konta.")}
      size="full"
      footer={<div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-slate-600">Wybrano: <strong>{selectedTransactions.length}</strong></span><div className="flex gap-2"><Button tone="neutral" disabled={importing || reading} onClick={onClose}>Anuluj</Button><Button tone="primary" disabled={importing || reading || !selectedTransactions.length} onClick={() => void importTransactions()}>{importing ? "Importowanie…" : `Importuj ${selectedTransactions.length}`}</Button></div></div>}
    >
      <div className="space-y-5">
        <label className={`flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-blue-200 bg-blue-50 px-4 text-center transition hover:border-blue-400 hover:bg-blue-100 ${result ? "flex-wrap gap-3 py-2" : "flex-col py-7"}`}>
          <FileUp size={result ? 20 : 30} className="text-blue-600" aria-hidden="true" />
          <span className="font-semibold text-blue-800">{t(reading ? "Odczytywanie pliku…" : result ? "Wybierz inny plik CSV lub PDF" : "Wybierz wyciąg CSV lub PDF")}</span>
          <span className="mt-1 text-xs text-blue-700">{t("PDF z warstwą tekstową (automatyczne rozpoznanie + korekta) albo CSV z własnym przypisaniem kolumn")}</span>
          {sourceFileName && <span className="text-xs font-medium text-blue-900">{sourceFileName}</span>}
          <input type="file" accept=".csv,text/csv,.pdf,application/pdf" disabled={reading || importing} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void chooseFile(file); }} />
        </label>
        {csvText && <StatementCsvMapping key={csvText} text={csvText} currency={expectedCurrency} busy={reading || importing} onApply={(layout) => previewCsv(csvText, layout)} />}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
          <p className="text-sm text-violet-950"><strong>PDF nie został rozpoznany, masz skan albo XLSX?</strong><span className="block text-xs text-violet-800">PDF z tekstem aplikacja czyta lokalnie. Dla skanu lub nietypowego pliku możesz nadal użyć gotowych wytycznych i przekonwertować go do CSV.</span></p>
          <button type="button" className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-violet-300 bg-white px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100" onClick={() => setGptPromptOpen(true)}><Sparkles size={17} aria-hidden="true" />Generuj wytyczne dla GPT</button>
        </div>

        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

        <details className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <summary className="cursor-pointer font-semibold">Ustawienia dopasowania importu</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="flex items-start gap-2"><input type="checkbox" disabled={Boolean(result)} checked={settings.detectTransferSuggestions} onChange={(event) => setSettings((current) => ({ ...current, detectTransferSuggestions: event.target.checked }))} /><span>Wykrywaj możliwe transfery</span></label>
            <label><span className="mb-1 block font-medium">Tolerancja daty transferu</span><select disabled={Boolean(result)} className="w-full rounded border border-slate-300 bg-white px-2 py-1.5" value={settings.transferDateTolerance} onChange={(event) => setSettings((current) => ({ ...current, transferDateTolerance: Number(event.target.value) }))}>{[0, 1, 2, 3, 4, 5, 6, 7].map((days) => <option key={days} value={days}>±{days} {days === 1 ? "dzień" : "dni"}</option>)}</select></label>
            <label className="flex items-start gap-2"><input type="checkbox" disabled={Boolean(result)} checked={settings.autoSelectPlanMatch} onChange={(event) => setSettings((current) => ({ ...current, autoSelectPlanMatch: event.target.checked }))} /><span>Automatycznie wybieraj jednoznaczny plan</span></label>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-slate-500">Kwota transferu zawsze musi zgadzać się co do grosza.</span><button type="button" disabled={Boolean(result) || settingsSaving} className="rounded border border-slate-300 bg-white px-3 py-1.5 font-semibold disabled:opacity-50" onClick={() => void saveImportSettings()}>{settingsSaving ? "Zapisywanie…" : "Zapisz ustawienia"}</button></div>
          {result && <p className="mt-2 text-xs text-slate-500">Aby zmienić ustawienia dla tego importu, wybierz plik ponownie.</p>}
        </details>

        {result && <>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={filterButtonClass(previewFilter === "all")} aria-pressed={previewFilter === "all"} onClick={() => setPreviewFilter("all")}><ModuleBadge tone="info" size="sm">{t("Wszystkie")}: {result.transactions.length}</ModuleBadge></button>
            <ModuleBadge tone="info" size="sm">Format: {result.source}</ModuleBadge>
            {creditCard && account.repayment_account_name && <ModuleBadge tone="neutral" size="sm">Konto spłacające: {account.repayment_account_name}</ModuleBadge>}
            <button type="button" className={filterButtonClass(previewFilter === "expense")} aria-pressed={previewFilter === "expense"} onClick={() => setPreviewFilter((current) => current === "expense" ? "all" : "expense")}><ModuleBadge tone="danger" size="sm">Wydatki: {selectedExpenses.length} · {formatCurrency(expenseTotal)}</ModuleBadge></button>
            <button type="button" className={filterButtonClass(previewFilter === "income")} aria-pressed={previewFilter === "income"} onClick={() => setPreviewFilter((current) => current === "income" ? "all" : "income")}><ModuleBadge tone="success" size="sm">Przychody: {selectedIncomes.length} · {formatCurrency(incomeTotal)}</ModuleBadge></button>
            {transferPreviewCount > 0 && <button type="button" className={filterButtonClass(previewFilter === "transfer")} aria-pressed={previewFilter === "transfer"} onClick={() => setPreviewFilter((current) => current === "transfer" ? "all" : "transfer")}><ModuleBadge tone="info" size="sm">Transfery i sugestie: {transferPreviewCount}</ModuleBadge></button>}
            {skippedPreviewCount > 0 && <button type="button" className={filterButtonClass(previewFilter === "skipped")} aria-pressed={previewFilter === "skipped"} onClick={() => setPreviewFilter((current) => current === "skipped" ? "all" : "skipped")}><ModuleBadge tone="warning" size="sm">Pomijane: {skippedPreviewCount}</ModuleBadge></button>}
            {result.rejected.length > 0 && <button type="button" className={filterButtonClass(previewFilter === "rejected")} aria-pressed={previewFilter === "rejected"} onClick={() => setPreviewFilter((current) => current === "rejected" ? "all" : "rejected")}><ModuleBadge tone="neutral" size="sm">Do poprawy: {result.rejected.length}</ModuleBadge></button>}
            {duplicateCount > 0 && <button type="button" className={filterButtonClass(previewFilter === "review")} aria-pressed={previewFilter === "review"} onClick={() => setPreviewFilter((current) => current === "review" ? "all" : "review")}><ModuleBadge tone="warning" size="sm">Do sprawdzenia: {duplicateCount}</ModuleBadge></button>}
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><strong>Klasyfikacja nierozpoznanych pozycji</strong><label className="flex items-center gap-2"><input type="checkbox" checked={rememberClassification} onChange={(event) => setRememberClassification(event.target.checked)} />Zapamiętaj dla {importProvider(result, account)}</label></div><div className="grid gap-2 md:grid-cols-2">{(["income", "expense"] as const).map((kind) => <select key={kind} aria-label={`Etykieta ${kind}`} defaultValue="" className="rounded border border-slate-300 bg-white px-2 py-1.5" onChange={(event) => { const selectedType = customTypes.find((item) => item.id === Number(event.target.value)); if (selectedType) void classifyUnknown(kind, { customTypeId: selectedType.id, customTypeName: selectedType.name }); }}><option value="">{kind === "income" ? "Etykieta przychodów…" : "Etykieta wydatków…"}</option>{customTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>)}</div></div>
          {result.warnings.length > 0 && <details className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><summary className="cursor-pointer font-semibold">Uwagi do pliku ({result.warnings.length})</summary><ul className="mt-2 space-y-1">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></details>}
          {previewFilter === "rejected" && result.rejected.length > 0 && <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2"><strong className="text-sm text-slate-700">Wiersze wymagające poprawy</strong><p className="mt-0.5 text-xs text-slate-500">Popraw podstawowe dane i przywróć wiersz do zwykłego podglądu albo usuń go z tego importu. Ostateczna walidacja nadal działa podczas zapisu.</p></div>
            <div className="max-h-[360px] overflow-auto"><table className="w-full min-w-[1120px] text-sm"><thead className="sticky top-0 bg-slate-100 text-left"><tr><th className="px-3 py-2">Wiersz</th><th className="px-3 py-2">Powód</th><th className="px-3 py-2">Data</th><th className="px-3 py-2">Opis</th><th className="px-3 py-2">Kwota ze znakiem</th><th className="px-3 py-2">Waluta</th><th className="px-3 py-2">Akcja</th></tr></thead><tbody>{result.rejected.map((row) => <tr key={row.id} className="border-t border-slate-100 align-top"><td className="px-3 py-2">{row.rowNumber}</td><td className="px-3 py-2 text-amber-800">{row.reason}{rejectedErrors[row.id] && <span role="alert" className="mt-1 block max-w-52 text-xs font-semibold text-red-700">{rejectedErrors[row.id]}</span>}</td><td className="px-3 py-2"><input type="date" className="rounded border border-slate-300 px-2 py-1.5" value={parseStatementDate(row.date) ?? row.date} onChange={(event) => updateRejected(row.id, { date: event.target.value })} /></td><td className="px-3 py-2"><input className="w-full min-w-60 rounded border border-slate-300 px-2 py-1.5" value={row.name} onChange={(event) => updateRejected(row.id, { name: event.target.value })} /></td><td className="px-3 py-2"><input inputMode="decimal" className="w-32 rounded border border-slate-300 px-2 py-1.5 text-right" value={row.amount} onChange={(event) => updateRejected(row.id, { amount: event.target.value })} /></td><td className="px-3 py-2"><input className="w-20 rounded border border-slate-300 px-2 py-1.5 uppercase" value={row.currency} onChange={(event) => updateRejected(row.id, { currency: event.target.value })} /></td><td className="px-3 py-2"><div className="flex gap-2"><button type="button" className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700" onClick={() => restoreRejected(row)}>Przywróć</button><button type="button" aria-label={`Usuń wiersz ${row.rowNumber} z importu`} className="rounded border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50" onClick={() => removeRejected(row.id)}>Usuń</button></div></td></tr>)}</tbody></table></div>
          </div>}
          {previewFilter !== "rejected" && result.transactions.length > 0 && <DataGrid<StatementTransaction>
            gridId="statement-import-preview"
            rows={visibleTransactions}
            columns={previewColumns}
            getRowId={(row) => row.id}
            defaultPageSize={10}
            emptyMessage="Brak transakcji dla wybranego filtra."
            getRowClassName={(row) => selected.has(row.id) ? "" : "opacity-60"}
            toolbar={<div className="flex flex-wrap items-center gap-3">
              <strong className="text-sm text-slate-800">Sprawdź i importuj</strong>
              <span className="text-xs text-slate-500">Nowe operacje możesz zaimportować bez dopasowania. Powiązania zapiszą się dopiero po imporcie.</span>
              <button type="button" className="text-sm font-semibold text-blue-700 hover:underline" onClick={() => { setSelected(new Set(result.transactions.filter((row) => !["already-imported", "hard-duplicate"].includes(row.duplicateState ?? "")).map((row) => row.id))); setResult({ ...result, transactions: result.transactions.map((row) => ["already-imported", "hard-duplicate"].includes(row.duplicateState ?? "") ? row : { ...row, resolution: row.resolution === "skip" ? "new" : row.resolution }) }); }}>Zaznacz cały import</button>
              <button type="button" className="text-sm font-semibold text-slate-600 hover:underline" onClick={() => { setSelected(new Set()); setResult({ ...result, transactions: result.transactions.map((row) => ({ ...row, resolution: "skip" })) }); }}>Odznacz cały import</button>
            </div>}
          />}
        </>}

        <details className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <summary className="cursor-pointer font-semibold text-slate-700">Formaty i korekta importu</summary>
          <p className="mt-2">PDF jest najpierw odczytywany lokalnie i dopasowywany na podstawie położenia dat, opisów i kwot. Znane układy mają dokładniejsze adaptery, a nierozpoznane dokumenty korzystają z heurystyk. Nic nie zapisuje się automatycznie: każdą pozycję możesz odznaczyć, poprawić lub cofnąć korektę przed kliknięciem „Importuj”. Dla CSV nadal możesz ręcznie dopasować kolumny. Import nie przelicza walut.</p>
        </details>
        <AllocationModal
          open={Boolean(allocationTransaction)}
          title="Powiąż z planowaną transakcją"
          description="Możesz podzielić jedną operację bankową między kilka planów. Suma powiązań nie może przekroczyć kwoty z wyciągu."
          sourceLabel="Planowana transakcja"
          sourcePlaceholder="Wybierz plan lub wpis stały"
          availabilityLabel="pozostało"
          options={allocationOptions}
          maximumAmount={allocationLeft}
          submitLabel="Dodaj powiązanie"
          onClose={() => setAllocationTransactionId(null)}
          onSubmit={async (optionId, amount) => {
            const candidate = availableAllocationCandidates[optionId - 1];
            if (!allocationTransaction || !candidate) throw new Error("Wybrana operacja nie jest już dostępna.");
            updateTransaction(allocationTransaction.id, { planAllocations: [...(allocationTransaction.planAllocations ?? []), { source: candidate.source, planId: candidate.planId, occurrenceDate: candidate.occurrenceDate, name: candidate.name, allocatedAmount: amount }] });
            setAllocationTransactionId(null);
          }}
        />
      </div>
      <Modal open={Boolean(manualTransfer)} onClose={() => setManualTransfer(null)} title="Wybierz drugą stronę transferu" description="To inna operacja tego samego przepływu pieniędzy. Obie strony zostaną w historii." size="xl">
        {manualSource && <div className="mb-4"><ImportOperation kind={manualSource.kind} name={manualSource.name} amount={manualSource.amount} date={manualSource.date} accountName={account.nazwa} /></div>}
        <p className="mb-3 text-xs text-slate-500">Kandydaci importu: ta sama kwota, inne konto, ±{settings.transferDateTolerance} dni. Nietypowe powiązanie możesz ustawić po imporcie w Transakcjach.</p>
        {manualTransfer?.error && <p role="alert" className="mb-3 text-sm text-amber-800">{manualTransfer.error}</p>}
        <DataGrid<StatementTransferCandidate> gridId="statement-import-transfer-choice" rows={manualTransfer?.candidates ?? []} columns={transferColumns} getRowId={(row) => `${row.kind}:${row.transactionId}`} loading={manualTransfer?.loading} defaultPageSize={10} emptyMessage="Brak pasujących operacji. Możesz dodać transakcję bez powiązania." actions={(candidate) => <Button tone="primary" size="sm" onClick={() => { if (manualSource) setTransferPreview({ transaction: manualSource, candidate }); }}>Porównaj</Button>} />
      </Modal>
      <TransactionLinkDetailsModal
        open={Boolean(transferPreview)} preview
        sourceKind={transferPreview?.transaction.kind ?? "expense"}
        source={transferPreview ? { name: transferPreview.transaction.name, amount: Math.abs(transferPreview.transaction.amount), addedAt: transferPreview.transaction.date, accountName: account.nazwa, customTypeName: transferPreview.transaction.customTypeName } : null}
        counterpartKind={transferPreview?.candidate.kind ?? null}
        counterpart={transferPreview ? { name: transferPreview.candidate.transactionName, amount: Math.abs(transferPreview.candidate.transactionAmount), addedAt: transferPreview.candidate.transactionDate, accountName: transferPreview.candidate.accountName } : null}
        accountNames={new Map()}
        previewMessage="Sprawdź obie strony. Powiązanie zapisze się dopiero po imporcie. Obie operacje pozostaną w historii, poza przychodami i wydatkami w analizach."
        confirmLabel="Wybierz jako transfer własny"
        onClose={() => setTransferPreview(null)} onChange={() => undefined} onUnlink={() => undefined}
        onConfirm={() => { if (transferPreview) chooseManualTransfer(transferPreview.transaction, transferPreview.candidate); setTransferPreview(null); }}
      />
      <Modal open={gptPromptOpen} onClose={() => setGptPromptOpen(false)} title="Wytyczne konwersji wyciągu dla GPT" description="Aplikacja nie wysyła pliku. Skopiuj prompt, dodaj swój wyciąg w wybranym czacie i zapisz odpowiedź jako plik CSV." size="xl" footer={<div className="flex justify-end"><button type="button" className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 font-semibold text-white hover:bg-violet-700" onClick={() => void copyGptPrompt()}><ClipboardCopy size={18} aria-hidden="true" />Kopiuj prompt</button></div>}><textarea readOnly className="h-[55vh] w-full resize-none rounded-lg border border-slate-300 bg-slate-50 p-4 font-mono text-sm leading-6" value={buildStatementCsvGptPrompt(expectedCurrency)} /></Modal>
    </Modal>
  );
}
