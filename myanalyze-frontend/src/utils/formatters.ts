import { isValidDateOnly } from "./validation";
import { getAppCurrency, getAppLocale, normalizeAppCurrency } from "./appSettings";

export function formatCurrency(value: unknown, currency = getAppCurrency()): string {
  const number = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(number)) return "-";
  const normalizedCurrency = normalizeAppCurrency(currency);
  const locale = getAppLocale();
  try {
    return number.toLocaleString(locale, {
      style: "currency",
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return `${number.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${normalizedCurrency}`;
  }
}

export function formatDate(value: unknown, options?: Intl.DateTimeFormatOptions): string {
  const normalized = String(value ?? "").trim();
  if (!normalized || ["none", "null", "undefined"].includes(normalized.toLowerCase())) return "-";
  if (/^\d{4}-\d{2}-\d{2}/.test(normalized) && !isValidDateOnly(normalized.slice(0, 10))) return normalized;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? normalized : date.toLocaleDateString(getAppLocale(), options);
}

export function formatDateTime(value: unknown): string {
  const normalized = String(value ?? "").trim();
  if (!normalized || ["none", "null", "undefined"].includes(normalized.toLowerCase())) return "-";
  const date = value instanceof Date ? value : new Date(normalized.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? normalized : date.toLocaleString(getAppLocale());
}

export function formatPercentage(value: unknown): string {
  const number = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? `${number.toLocaleString(getAppLocale(), { maximumFractionDigits: 2 })}%` : "-";
}
