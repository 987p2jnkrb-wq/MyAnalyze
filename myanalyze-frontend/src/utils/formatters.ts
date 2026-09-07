import { isValidDateOnly } from "./validation";
import { getAppCurrency, normalizeAppCurrency } from "./appSettings";

export function formatCurrency(value: unknown, currency = getAppCurrency()): string {
  const number = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(number)) return "—";
  try {
    return number.toLocaleString("pl-PL", {
      style: "currency",
      currency: normalizeAppCurrency(currency),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return `${number.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${normalizeAppCurrency(currency)}`;
  }
}

export function formatDate(value: unknown): string {
  const normalized = String(value ?? "").trim();
  if (!normalized || ["none", "null", "undefined"].includes(normalized.toLowerCase())) return "—";
  if (/^\d{4}-\d{2}-\d{2}/.test(normalized) && !isValidDateOnly(normalized.slice(0, 10))) return normalized;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? normalized : date.toLocaleDateString("pl-PL");
}

export function formatPercentage(value: unknown): string {
  const number = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? `${number.toLocaleString("pl-PL", { maximumFractionDigits: 2 })}%` : "—";
}
