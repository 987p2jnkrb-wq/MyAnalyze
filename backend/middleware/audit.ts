import { NextFunction, Request, Response } from "express";
import { dbPromise } from "../db";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SKIPPED_PATH_PARTS = ["app-activity-logs", "financial-period-snapshots", "transfer", "realize", "pay", "import-schedule", "ensure-schedule", "import-transactions", "adjustment"];
const ACTION_BY_METHOD: Record<string, string> = { POST: "CREATE", PUT: "UPDATE", PATCH: "UPDATE", DELETE: "DELETE" };
const ENTITY_LABELS: Record<string, string> = {
  konta: "Konta", przychody: "Przychody", wydatki: "Wydatki",
  przychody_stale: "Stałe przychody", wydatki_stale: "Stałe wydatki",
  loans: "Kredyty", "debt-plans": "Zobowiązania", "financial-goals": "Cele",
  "financial-goal-settings": "Ustawienia planowania", "modules-config": "Konfiguracja modułów",
};
const ENTITY_TABLES: Record<string, { table: string; idColumn: string }> = {
  konta: { table: "konta", idColumn: "id" },
  przychody: { table: "przychody", idColumn: "id" },
  wydatki: { table: "wydatki", idColumn: "id" }, przychody_stale: { table: "przychody_stale", idColumn: "id" },
  wydatki_stale: { table: "wydatki_stale", idColumn: "id" }, loans: { table: "loans", idColumn: "id" },
  "debt-plans": { table: "debt_plans", idColumn: "id" },
  "financial-goals": { table: "financial_goals", idColumn: "id" },
  "financial-goal-settings": { table: "financial_goal_settings", idColumn: "id" },
  "modules-config": { table: "modules_config", idColumn: "key" },
};
const FIELD_LABELS: Record<string, string> = {
  nazwa: "nazwę", saldo_dostepne: "saldo dostępne", saldo_wlasciwe: "saldo właściwe",
  kwota: "kwotę", kwota_kapitalu: "kwotę kapitału", kwota_calkowita: "kwotę całkowitą",
  kwota_raty: "kwotę raty", kategoria: "kategorię", status: "status", opis: "opis",
  zadluzenie: "zadłużenie", rata_miesieczna: "ratę miesięczną", wolny_limit: "wolny limit", limit_kredytowy: "limit",
  produkt: "nazwę produktu", typ: "typ", typ_depozytu: "typ konta", transaction_type: "typ transakcji",
  ilosc_rat: "liczbę rat", data_rozpoczecia: "datę rozpoczęcia", data_do: "datę zakończenia",
  dzien_splaty: "dzień spłaty", dzien_miesiaca: "dzień płatności", repayment_account_id: "konto spłacające",
  account_repayment_id: "konto spłacające", account_repaymant_id: "konto spłacające",
  repayment_account_name: "nazwę konta spłacającego", account_repayment_name: "nazwę konta spłacającego",
  account_repaymant_name: "nazwę konta spłacającego", linked_card_account_id: "powiązaną kartę",
  linked_card_name: "nazwę powiązanej karty", zrealizowany: "status realizacji", visible: "widoczność",
  kwota_docelowa: "kwotę docelową", kwota_przypisana: "kwotę przypisaną", termin: "termin", include_account_balance: "uwzględnianie salda depozytu", daily_living_budget: "budżet bieżący / dzień",
  priorytet: "priorytet", notatka: "notatkę", financial_floor: "finansową podłogę",
  data_dodania: "datę", kapital: "kapitał", account_id: "konto", recurring_expense_id: "powiązany wydatek stały", payday_cycle_start_day: "dzień rozpoczęcia okresu",
  prog_1: "pierwszy próg", prog_2: "drugi próg", prog_3: "trzeci próg",
  alokacja_1: "alokację pierwszego progu", alokacja_2: "alokację drugiego progu", alokacja_3: "alokację trzeciego progu",
  pewnosc: "pewność wpływu",
};
const MONEY_FIELDS = new Set(["saldo_dostepne", "saldo_wlasciwe", "kwota", "kwota_kapitalu", "kapital", "kwota_calkowita", "kwota_raty", "zadluzenie", "rata_miesieczna", "wolny_limit", "limit_kredytowy", "kwota_docelowa", "kwota_przypisana", "financial_floor", "daily_living_budget", "prog_1", "prog_2", "prog_3"]);
const BOOLEAN_FIELDS = new Set(["zrealizowany", "visible", "excluded_from_analysis", "include_account_balance"]);
const VALUE_LABELS: Record<string, string> = {
  konto: "Konto", gotowka: "Gotówka", "gotówka": "Gotówka",
  karta_kredytowa: "Karta kredytowa", "karta kredytowa": "Karta kredytowa",
  wirtualny_portfel: "Wirtualny portfel", "wirtualny portfel": "Wirtualny portfel",
};
const GOAL_VALUE_LABELS: Record<string, string> = {
  active: "Aktywny", paused: "Wstrzymany", completed: "Zakończony",
  low: "Niski", normal: "Normalny", high: "Wysoki",
  emergency_fund: "Poduszka finansowa", purchase: "Zakup", travel: "Podróż",
  car: "Samochód", renovation: "Remont", down_payment: "Wkład własny",
  debt_repayment: "Spłata zadłużenia", custom: "Własny",
};
type AuditRecord = Record<string, unknown>;

function normalizeRecord(value: unknown): AuditRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as AuditRecord;
  for (const key of ["account", "konto", "loan", "data"]) {
    const nested = record[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) return nested as AuditRecord;
  }
  return record;
}

function formatMoney(value: unknown): string {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString("pl-PL", { style: "currency", currency: "PLN" })
    : String(value ?? "—");
}

function recordName(record: AuditRecord | null): string {
  const name = record?.nazwa ?? record?.name ?? record?.produkt ?? record?.title;
  return name ? ` „${String(name)}”` : "";
}

function comparableValue(key: string, value: unknown): string {
  if (BOOLEAN_FIELDS.has(key)) {
    if (value === true || value === 1 || (typeof value === "string" && ["1", "true", "tak", "yes"].includes(value.trim().toLowerCase()))) return "true";
    if (value === false || value === 0 || (typeof value === "string" && ["0", "false", "nie", "no"].includes(value.trim().toLowerCase()))) return "false";
  }
  return String(value ?? "");
}

function displayValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (BOOLEAN_FIELDS.has(key) && comparableValue(key, value) === "true") return "tak";
  if (BOOLEAN_FIELDS.has(key) && comparableValue(key, value) === "false") return "nie";
  if (key === "typ_depozytu") return VALUE_LABELS[String(value).trim().toLowerCase()] ?? String(value);
  if (key === "pewnosc") return String(value).trim().toLowerCase() === "guaranteed" ? "Pewny" : String(value).trim().toLowerCase() === "potential" ? "Potencjalny" : "Oczekiwany";
  if (["typ", "status", "priorytet"].includes(key)) return GOAL_VALUE_LABELS[String(value).trim().toLowerCase()] ?? String(value);
  if (key.endsWith("_id") && Number.isFinite(Number(value))) return `#${value}`;
  return String(value);
}

function buildComment(method: string, before: AuditRecord | null, after: AuditRecord | null, entityType: string): string {
  if (method === "POST") return `Dodano rekord${recordName(after)}.`;
  if (method === "DELETE") return `Usunięto rekord${recordName(before)}.`;
  const changes: string[] = [];
  // Odpowiedź PUT bywa celowo częściowa. Porównujemy tylko pola zwrócone po
  // zmianie, aby brak pola nie wyglądał w logu jak jego wyczyszczenie.
  const keys = new Set(Object.keys(after ?? {}));
  for (const key of keys) {
    if (["id", "data_dodania", "created_at", "updated_at"].includes(key)) continue;
    const oldValue = before?.[key];
    const newValue = after?.[key];
    if (comparableValue(key, oldValue) === comparableValue(key, newValue)) continue;
    const label = FIELD_LABELS[key] ?? key.replace(/_/g, " ");
    if (MONEY_FIELDS.has(key) && Number.isFinite(Number(oldValue)) && Number.isFinite(Number(newValue))) {
      const delta = Number(newValue) - Number(oldValue);
      if (delta !== 0) {
        changes.push(`${delta > 0 ? "Zwiększono" : "Zmniejszono"} ${label} o ${formatMoney(Math.abs(delta))} (z ${formatMoney(oldValue)} do ${formatMoney(newValue)})`);
        continue;
      }
    }
    changes.push(`Zmieniono ${label}: „${displayValue(key, oldValue)}” → „${displayValue(key, newValue)}”`);
  }
  return changes.length ? `${changes.slice(0, 4).join("; ")}.` : `Zaktualizowano rekord w module ${ENTITY_LABELS[entityType] ?? entityType}.`;
}

export async function auditApiMutation(req: Request, res: Response, next: NextFunction) {
  if (!MUTATING_METHODS.has(req.method) || SKIPPED_PATH_PARTS.some((part) => req.path.includes(part))) return next();
  const pathParts = req.path.split("/").filter(Boolean);
  const entityType = pathParts[0] || "unknown";
  const mapping = ENTITY_TABLES[entityType];
  const pathEntityId = mapping ? pathParts[1] : pathParts.slice(1).find((part) => /^\d+$/.test(part));
  let before: AuditRecord | null = null;
  if (pathEntityId && mapping && req.method !== "POST") {
    try {
      const db = await dbPromise;
      before = await db.get<AuditRecord>(`SELECT * FROM ${mapping.table} WHERE ${mapping.idColumn} = ?`, pathEntityId) ?? null;
    } catch (error) {
      console.error("[AUDIT] Nie udało się pobrać stanu przed zmianą:", error);
    }
  }

  let responseBody: unknown;
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => { responseBody = body; return originalJson(body); }) as Response["json"];
  res.on("finish", () => {
    if (res.statusCode < 200 || res.statusCode >= 400) return;
    const responseRecord = normalizeRecord(responseBody);
    const requestRecord = normalizeRecord(req.body);
    const entityId = pathEntityId || responseRecord?.id || null;
    const responseKeys = Object.keys(responseRecord ?? {});
    const responseIsTechnical = responseKeys.length > 0 && responseKeys.every((key) => ["success", "paymentsCount", "message"].includes(key));
    const after = req.method === "DELETE" ? null : (responseIsTechnical ? requestRecord : (responseRecord ?? requestRecord));
    void dbPromise.then((db) => db.run(
      `INSERT INTO app_activity_log
       (user_id, timestamp, action_type, entity_type, entity_id, old_data, new_data, ip_address, device_info, metadata, comment)
       VALUES (?, datetime('now', 'localtime'), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ["local", ACTION_BY_METHOD[req.method], entityType, entityId == null ? null : String(entityId),
        before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after),
        req.ip || null, req.get("user-agent") || null, JSON.stringify({ method: req.method, path: req.originalUrl }),
        buildComment(req.method, before, after, entityType)],
    )).catch((error) => console.error("[AUDIT] Nie udało się zapisać logu:", error));
  });
  next();
}
