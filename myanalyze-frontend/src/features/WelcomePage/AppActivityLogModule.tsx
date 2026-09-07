import React from "react";
import { Eye, Trash2 } from "lucide-react";
import ModulePage from "../../components/ModulePage";
import DataGrid, { DataGridColumn } from "../../components/DataGrid";
import IconButton from "../../components/IconButton";
import RefreshButton from "../../components/RefreshButton";
import ModuleBadge from "../../components/ModuleBadge";
import { useAppActivityLogContext, AppActivityLogProvider } from "../../context/AppActivityLogContext";
import apiClient from "../../utils/apiClient";
import type { AppActivityLog } from "../../context/app-activity-log-types";
import Modal from "../../components/Modal";
import ConfirmModal from "../../components/ConfirmModal";
import { transactionTypeLabel, type TransactionType } from "../../types/transactionType";
import { incomeCertaintyLabel, normalizeIncomeCertainty } from "../../types/incomeCertainty";
import { formatCurrency, formatPercentage } from "../../utils/formatters";

const actionTranslations: Record<string, string> = {
  TRANSFER_OUT: "Przelew wychodzący", TRANSFER_IN: "Przelew przychodzący",
  EXPENSE_REALIZED: "Wydatek zrealizowany", INCOME_REALIZED: "Przychód zrealizowany",
  UPDATE_ACCOUNT: "Aktualizacja konta", LOGIN: "Logowanie", LOGOUT: "Wylogowanie",
  ADD_ACCOUNT: "Dodanie konta", DELETE_ACCOUNT: "Usunięcie konta", EDIT_EXPENSE: "Edycja wydatku",
  EDIT_INCOME: "Edycja przychodu", ADD_EXPENSE: "Dodanie wydatku", ADD_INCOME: "Dodanie przychodu",
  DELETE_EXPENSE: "Usunięcie wydatku", DELETE_INCOME: "Usunięcie przychodu",
  IMPORT_EXPENSE: "Import wydatku", IMPORT_INCOME: "Import przychodu", IMPORT_BANK_STATEMENT: "Import wyciągu",
  INSTALLMENT_PLAN_PAYMENT: "Spłata planu ratalnego",
  INSTALLMENT_PLAN_PAYMENT_OUT: "Spłata planu z konta",
  DEBT_INSTALLMENT_PAYMENT: "Spłata raty zobowiązania",
  RECURRING_INCOME_REALIZED: "Stały przychód zrealizowany",
  RECURRING_EXPENSE_REALIZED: "Stały wydatek zrealizowany",
  QUICK_TOP_UP: "Zasilenie konta", QUICK_CHARGE: "Obciążenie konta",
  CREATE: "Dodanie", UPDATE: "Edycja", DELETE: "Usunięcie",
};

const entityTranslations: Record<string, string> = {
  konta: "Konta", wydatki: "Wydatki", przychody: "Przychody",
  saldo: "Saldo", lokaty: "Lokaty", loans: "Pożyczki", przychody_stale: "Stałe przychody",
  wydatki_stale: "Stałe wydatki", "debt-plans": "Zobowiązania", debt_plans: "Zobowiązania",
  loan_payments: "Raty kredytu", "modules-config": "Konfiguracja modułów",
  "financial-goals": "Cele", financial_goals: "Cele", "financial-goal-settings": "Ustawienia planowania", financial_goal_settings: "Ustawienia planowania",
  "financial-period-snapshots": "Historia finansowa", financial_period_snapshots: "Historia finansowa",
};

const logFieldLabels: Record<string, string> = {
  nazwa: "Nazwa", name: "Nazwa", account_name: "Nazwa konta", produkt: "Produkt",
  saldo_dostepne: "Saldo dostępne", saldo_wlasciwe: "Saldo właściwe", saldo: "Saldo",
  kwota: "Kwota", kwota_kapitalu: "Kapitał", kwota_calkowita: "Kwota całkowita",
  kwota_raty: "Rata", rata_miesieczna: "Rata miesięczna", zadluzenie: "Zadłużenie",
  wolny_limit: "Wolny limit", limit_kredytowy: "Limit kredytowy", kategoria: "Kategoria",
  rrso: "RRSO", oprocentowanie: "Oprocentowanie", prowizja: "Prowizja",
  ubezpieczenie: "Ubezpieczenie", one_time_fee: "Opłata jednorazowa",
  status: "Status", typ: "Typ", typ_depozytu: "Typ konta", transaction_type: "Typ transakcji",
  typ_transakcji: "Typ transakcji", data_rozpoczecia: "Data rozpoczęcia", data_od: "Data rozpoczęcia",
  data_do: "Data zakończenia", ilosc_rat: "Liczba rat", repayment_account_id: "Konto spłacające",
  account_repayment_id: "Konto spłacające", account_repaymant_id: "Konto spłacające",
  repayment_account_name: "Nazwa konta spłacającego", account_repayment_name: "Nazwa konta spłacającego",
  account_repaymant_name: "Nazwa konta spłacającego", linked_card_account_id: "Powiązana karta",
  linked_card_name: "Nazwa powiązanej karty", data: "Data transakcji", zrodlo: "Źródło",
  visible: "Widoczny", zrealizowany: "Zrealizowany", excluded_from_analysis: "Poza analizą",
  order_index: "Kolejność",
  kwota_docelowa: "Kwota docelowa", kwota_przypisana: "Kwota przypisana", termin: "Termin",
  priorytet: "Priorytet", notatka: "Notatka", financial_floor: "Finansowa podłoga", daily_living_budget: "Budżet bieżący / dzień", pewnosc: "Pewność wpływu", include_account_balance: "Uwzględniaj saldo depozytu",
  data_dodania: "Data", dzien_miesiaca: "Dzień płatności", kapital: "Kapitał",
  account_id: "Konto", recurring_expense_id: "Powiązany wydatek stały", recurring_expense_name: "Nazwa wydatku stałego",
  period_start: "Początek okresu", period_end: "Koniec okresu", real_liquidity: "Realna płynność",
  consumer_debt: "Dług konsumencki", mortgage_debt: "Kredyt hipoteczny", goals_allocated: "Środki w celach", captured_at: "Data zapisu",
  payday_cycle_start_day: "Dzień rozpoczęcia okresu",
};
const logMoneyFields = new Set(["saldo_dostepne", "saldo_wlasciwe", "saldo", "kwota", "kwota_kapitalu", "kapital", "kwota_calkowita", "kwota_raty", "rata_miesieczna", "zadluzenie", "wolny_limit", "limit_kredytowy", "prowizja", "ubezpieczenie", "one_time_fee", "kwota_docelowa", "kwota_przypisana", "financial_floor", "daily_living_budget", "real_liquidity", "consumer_debt", "mortgage_debt", "goals_allocated"]);
const logPercentFields = new Set(["rrso", "oprocentowanie"]);
const logBooleanFields = new Set(["visible", "zrealizowany", "excluded_from_analysis", "include_account_balance"]);
const accountTypeLabels: Record<string, string> = {
  konto: "Konto", gotowka: "Gotówka", "gotówka": "Gotówka",
  karta_kredytowa: "Karta kredytowa", "karta kredytowa": "Karta kredytowa",
  wirtualny_portfel: "Wirtualny portfel", "wirtualny portfel": "Wirtualny portfel",
};
const goalValueLabels: Record<string, string> = {
  active: "Aktywny", paused: "Wstrzymany", completed: "Zakończony",
  low: "Niski", normal: "Normalny", high: "Wysoki",
  emergency_fund: "Poduszka finansowa", purchase: "Zakup", travel: "Podróż", car: "Samochód",
  renovation: "Remont", down_payment: "Wkład własny", debt_repayment: "Spłata zadłużenia", custom: "Własny",
};

function formatEntityType(value: string): string {
  return entityTranslations[value?.toLowerCase()] ?? (value ? value.charAt(0).toUpperCase() + value.slice(1) : "—");
}

function actionLabel(log: AppActivityLog): string {
  if (log.action_type === "IMPORT_EXPENSE") return "IMPORT · Wydatek";
  if (log.action_type === "IMPORT_INCOME") return "IMPORT · Przychód";
  if (log.action_type === "IMPORT_BANK_STATEMENT") return "IMPORT · Wyciąg";
  return actionTranslations[log.action_type] ?? log.action_type;
}

function renderAction(log: AppActivityLog): React.ReactNode {
  if (!log.action_type.startsWith("IMPORT_")) return actionLabel(log);
  const entity = log.action_type === "IMPORT_EXPENSE" ? "Wydatek" : log.action_type === "IMPORT_INCOME" ? "Przychód" : "Wyciąg";
  return <span className="flex flex-wrap items-center gap-1.5"><ModuleBadge tone="info" size="sm">IMPORT</ModuleBadge><span>{entity}</span></span>;
}

export function parseMetadataDate(log: AppActivityLog): string {
  let metadata = log.metadata;
  if (typeof metadata === "string") { try { metadata = JSON.parse(metadata); } catch { /* starszy wpis */ } }
  if (metadata && typeof metadata === "object" && "date" in metadata && typeof (metadata as Record<string, unknown>).date === "string") return String((metadata as Record<string, unknown>).date);
  return log.timestamp;
}

function formatLogDate(log: AppActivityLog): string {
  const date = new Date(parseMetadataDate(log));
  return Number.isNaN(date.getTime()) ? String(log.timestamp ?? "—") : date.toLocaleString("pl-PL", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

interface ImportLogDetail {
  transaction_id?: number;
  kind: "expense" | "income";
  name: string;
  amount: number;
  date: string;
  category?: string;
  custom_type_name?: string | null;
  transaction_type?: TransactionType | null;
  excluded_from_analysis?: boolean;
}

function parsedMetadata(log: AppActivityLog): Record<string, unknown> {
  if (log.metadata && typeof log.metadata === "object" && !Array.isArray(log.metadata)) return log.metadata as Record<string, unknown>;
  if (typeof log.metadata === "string") {
    try {
      const parsed = JSON.parse(log.metadata);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch { /* starszy albo niepełny wpis */ }
  }
  return {};
}

function importLogDetails(log: AppActivityLog): ImportLogDetail[] {
  const transactions = parsedMetadata(log).transactions;
  if (!Array.isArray(transactions)) return [];
  return transactions.filter((item): item is ImportLogDetail => Boolean(item && typeof item === "object" && !Array.isArray(item) && typeof (item as ImportLogDetail).name === "string"));
}

function normalizedLogRecord(data: unknown): Record<string, unknown> | null {
  if (data == null) return null;
  let parsed = data;
  if (typeof data === "string") { try { parsed = JSON.parse(data); } catch { return null; } }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const source = parsed as Record<string, unknown>;
  const nested = source.account ?? source.konto ?? source.loan ?? source.data;
  return nested && typeof nested === "object" && !Array.isArray(nested) ? nested as Record<string, unknown> : source;
}

function formatLogValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (logMoneyFields.has(key)) return formatCurrency(value);
  if (logPercentFields.has(key)) {
    const number = Number(value);
    return Number.isFinite(number) ? formatPercentage(number) : String(value);
  }
  if (logBooleanFields.has(key)) return [true, 1, "1", "true", "tak"].includes(value as never) ? "Tak" : "Nie";
  if (key === "typ_depozytu") return accountTypeLabels[String(value).trim().toLowerCase()] ?? String(value);
  if (key === "transaction_type" || key === "typ_transakcji") return transactionTypeLabel(value as TransactionType);
  if (key === "pewnosc") return incomeCertaintyLabel(normalizeIncomeCertainty(value));
  if (["typ", "status", "priorytet"].includes(key)) return goalValueLabels[String(value)] ?? String(value);
  if (key.endsWith("_id") && Number.isFinite(Number(value))) return `#${value}`;
  return String(value);
}

function renderLogCell(data: unknown): string {
  if (data == null) return "—";
  const record = normalizedLogRecord(data);
  if (!record) return typeof data === "string" ? data || "—" : String(data);
  const preferred = Object.keys(logFieldLabels).filter((key) => record[key] != null);
  const ignored = new Set(["id", "success", "paymentsCount", "created_at", "updated_at"]);
  const keys = preferred.length ? preferred : Object.keys(record).filter((key) => !ignored.has(key) && record[key] != null).slice(0, 5);
  return keys.length ? keys.slice(0, 8).map((key) => `${logFieldLabels[key] ?? key.replace(/_/g, " ")}: ${formatLogValue(key, record[key])}`).join(" · ") : "—";
}

function renderLogComment(log: AppActivityLog): string {
  const comment = typeof log.comment === "string" ? log.comment : "";
  if (!log.old_data && /^(PUT|PATCH)\s/.test(comment)) return "Starszy wpis — stan przed zmianą nie był jeszcze rejestrowany.";
  if (comment === "Dodano rekord." && log.entity_type === "loans") {
    const details = renderLogCell(log.new_data);
    const name = /(?:Nazwa|Produkt): ([^·]+)/.exec(details)?.[1]?.trim();
    return name ? `Dodano rekord „${name}”.` : "Dodano kredyt.";
  }
  if (!comment) return "—";
  let translated = comment
    .replace(/financial[-_]goal[-_]settings/gi, "Ustawienia planowania")
    .replace(/financial[-_]period[-_]snapshots/gi, "Historia finansowa")
    .replace(/linked card name/gi, "nazwę powiązanej karty")
    .replace(/(?:repayment account|account repay(?:ment|mant)) name/gi, "nazwę konta spłacającego")
    .replace(/(?:repayment account|account repay(?:ment|mant)) id/gi, "konto spłacające")
    .replace(/wirtualny_portfel/gi, "Wirtualny portfel")
    .replace(/karta_kredytowa/gi, "Karta kredytowa")
    .replace(/\bgotowka\b/gi, "Gotówka");
  Object.entries(goalValueLabels).forEach(([raw, label]) => {
    translated = translated.replace(new RegExp(`„${raw}”`, "gi"), `„${label}”`);
  });
  translated = translated.replace(
    /(uwzględnianie salda depozytu:\s*)„(0|1|false|true)”\s*→\s*„(0|1|false|true)”/gi,
    (_match, prefix: string, before: string, afterValue: string) => `${prefix}„${["1", "true"].includes(before.toLowerCase()) ? "Tak" : "Nie"}” → „${["1", "true"].includes(afterValue.toLowerCase()) ? "Tak" : "Nie"}”`,
  );
  const after = normalizedLogRecord(log.new_data);
  const repaymentName = after?.repayment_account_name ?? after?.account_repayment_name ?? after?.account_repaymant_name;
  const repaymentId = after?.repayment_account_id ?? after?.account_repayment_id ?? after?.account_repaymant_id;
  const repaymentTarget = repaymentName ? String(repaymentName) : repaymentId != null ? `konto #${repaymentId}` : null;
  if (repaymentTarget) translated = translated.replace(/(Zmieniono konto spłacające:\s*„[^”]*”\s*→\s*)„tak”/gi, `$1„${repaymentTarget}”`);
  return translated;
}

export const logColumns: DataGridColumn<AppActivityLog>[] = [
  { key: "timestamp", label: "Czas", value: (log) => new Date(parseMetadataDate(log)).getTime(), render: formatLogDate, exportValue: formatLogDate, sortable: true, width: 185, hideable: false },
  { key: "action_type", label: "Typ operacji", value: actionLabel, render: renderAction, exportValue: actionLabel, sortable: true, filterable: true, width: 180 },
  { key: "entity_type", label: "Moduł", value: (log) => formatEntityType(log.entity_type), render: (log) => formatEntityType(log.entity_type), sortable: true, filterable: true, width: 165 },
  { key: "old_data", label: "Przed zmianą", value: (log) => renderLogCell(log.old_data), render: (log) => <span className="block whitespace-normal leading-5">{renderLogCell(log.old_data)}</span>, width: 300 },
  { key: "new_data", label: "Po zmianie", value: (log) => renderLogCell(log.new_data), render: (log) => <span className="block whitespace-normal leading-5">{renderLogCell(log.new_data)}</span>, width: 300 },
  { key: "comment", label: "Komentarz", value: renderLogComment, render: (log) => <span className="block whitespace-normal font-medium leading-5 text-slate-700">{renderLogComment(log)}</span>, width: 360 },
];

function AppActivityLogModuleInner() {
  const { logs, loading, error, fetchLogs } = useAppActivityLogContext();
  const [detailsLog, setDetailsLog] = React.useState<AppActivityLog | null>(null);
  const [deleteLog, setDeleteLog] = React.useState<AppActivityLog | null>(null);
  const [deletingLog, setDeletingLog] = React.useState(false);

  const deleteLogs = async (selectedLogs: AppActivityLog[]) => {
    await Promise.all(selectedLogs.map((log) => apiClient.delete(`/app-activity-logs/${log.id}`)));
    await fetchLogs();
  };
  const deleteSingleLog = async () => {
    if (!deleteLog) return;
    setDeletingLog(true);
    try {
      await deleteLogs([deleteLog]);
      setDeleteLog(null);
    } catch {
      // Wspólny interceptor API pokazuje użytkownikowi toast z błędem.
    } finally {
      setDeletingLog(false);
    }
  };

  return <ModulePage title="Log aktywności aplikacji" maxWidth={1440} actions={<RefreshButton label="Odśwież logi" onRefresh={fetchLogs} refreshing={loading} iconSize={19} />}>
    {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>}
    <DataGrid gridId="activity-log" rows={logs} columns={logColumns} getRowId={(log) => log.id} loading={loading} emptyMessage="Brak logów. Nowe operacje pojawią się tutaj automatycznie." defaultPageSize={10} defaultSort={{ key: "timestamp", direction: "desc" }} selectable onDeleteSelected={deleteLogs} deleteSelectedConfirmMessage={(selected) => `Czy na pewno usunąć ${selected.length === 1 ? "zaznaczony log" : `${selected.length} zaznaczonych logów`}? Tej operacji nie można cofnąć.`} exportFileName="log-aktywnosci.csv" actionsWidth={104} actions={(log) => <>{log.action_type === "IMPORT_BANK_STATEMENT" && <IconButton label="Pokaż szczegóły importu" tone="info" onClick={() => setDetailsLog(log)}><Eye size={18} aria-hidden="true" /></IconButton>}<IconButton label="Usuń log" tone="danger" onClick={() => setDeleteLog(log)}><Trash2 size={17} aria-hidden="true" /></IconButton></>} />
    <ConfirmModal open={deleteLog !== null} title="Usuń log aktywności" message="Czy na pewno usunąć ten log? Tej operacji nie można cofnąć." confirmLabel="Usuń log" busy={deletingLog} onConfirm={() => void deleteSingleLog()} onCancel={() => setDeleteLog(null)} />
    <Modal open={detailsLog !== null} onClose={() => setDetailsLog(null)} title="Szczegóły importu wyciągu" description={detailsLog ? renderLogComment(detailsLog) : undefined} size="xl">
      {detailsLog && (() => {
        const metadata = parsedMetadata(detailsLog);
        const details = importLogDetails(detailsLog);
        return <div className="space-y-4">
          <div className="flex flex-wrap gap-2"><ModuleBadge tone="info">Konto: {String(metadata.account_name ?? `#${detailsLog.entity_id ?? "—"}`)}</ModuleBadge><ModuleBadge tone="danger">Wydatki: {String(metadata.imported_expenses ?? 0)}</ModuleBadge><ModuleBadge tone="success">Przychody: {String(metadata.imported_incomes ?? 0)}</ModuleBadge><ModuleBadge tone="warning">Duplikaty: {String(metadata.duplicates ?? 0)}</ModuleBadge></div>
          {details.length ? <div className="max-h-[520px] overflow-auto rounded-xl border border-slate-200"><table className="w-full min-w-[900px] text-sm"><thead className="sticky top-0 bg-slate-100 text-left"><tr><th className="px-3 py-2">Data</th><th className="px-3 py-2">Nazwa</th><th className="px-3 py-2">Kierunek</th><th className="px-3 py-2">Typ</th><th className="px-3 py-2">Etykieta</th><th className="px-3 py-2">Budżet</th><th className="px-3 py-2 text-right">Kwota</th></tr></thead><tbody>{details.map((item, index) => <tr key={`${item.transaction_id ?? index}-${item.kind}`} className="border-t border-slate-100"><td className="whitespace-nowrap px-3 py-2">{formatLogDate({ ...detailsLog, timestamp: item.date })}</td><td className="px-3 py-2 font-medium">{item.name}</td><td className={`px-3 py-2 font-semibold ${item.kind === "expense" ? "text-red-700" : "text-emerald-700"}`}>{item.kind === "expense" ? "Wydatek" : "Przychód"}</td><td className="px-3 py-2">{transactionTypeLabel(item.transaction_type ?? null)}</td><td className="px-3 py-2">{item.custom_type_name ?? item.category ?? "Bez etykiety"}</td><td className="px-3 py-2"><ModuleBadge tone={item.excluded_from_analysis ? "neutral" : "success"} size="sm">{item.excluded_from_analysis ? "Nie licz" : "Uwzględnij"}</ModuleBadge></td><td className="whitespace-nowrap px-3 py-2 text-right font-semibold">{formatCurrency(item.amount)}</td></tr>)}</tbody></table></div> : <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Ten starszy log zawiera tylko podsumowanie. Pełna lista pozycji będzie dostępna dla nowych importów.</div>}
        </div>;
      })()}
    </Modal>
  </ModulePage>;
}

export default function AppActivityLogModule() {
  return <AppActivityLogProvider><AppActivityLogModuleInner /></AppActivityLogProvider>;
}
