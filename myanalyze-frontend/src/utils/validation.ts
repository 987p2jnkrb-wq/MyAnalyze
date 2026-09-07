import { getAppCurrency } from "./appSettings";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const MAX_MONEY_AMOUNT = 9_999_999;

export function isValidDateOnly(value: unknown): boolean {
  const match = ISO_DATE.exec(String(value ?? "").slice(0, 10));
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function localDateKey(value = new Date()): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function validatePositiveMoney(value: unknown, label = "Kwota"): string | null {
  return validateMoneyRange(value, label, 0.01);
}

export function validateNonNegativeMoney(value: unknown, label: string): string | null {
  return validateMoneyRange(value, label, 0);
}

export function validateMoneyRange(value: unknown, label = "Kwota", min = 0, max = MAX_MONEY_AMOUNT): string | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).trim().replace(",", "."));
  if (!Number.isFinite(parsed)) return `${label} musi być prawidłową kwotą.`;
  if (parsed < min) return min === 0.01 ? `${label} musi być większa od zera.` : `${label} nie może być ujemna.`;
  if (parsed > max) return `${label} nie może przekraczać ${max.toLocaleString("pl-PL")} ${getAppCurrency()}.`;
  return null;
}

export function validateNonNegativeNumber(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? null : `${label} nie może być ujemna.`;
}

export function validateIntegerRange(value: unknown, label: string, min: number, max: number): string | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? null : `${label} musi mieścić się w zakresie ${min}–${max}.`;
}

export function validateDateRange(start: unknown, end?: unknown): string | null {
  const startDate = String(start ?? "").slice(0, 10);
  const endDate = String(end ?? "").slice(0, 10);
  if (!isValidDateOnly(startDate)) return "Podaj prawidłową datę początkową.";
  if (endDate && !isValidDateOnly(endDate)) return "Podaj prawidłową datę końcową.";
  if (endDate && endDate < startDate) return "Data końcowa nie może być wcześniejsza niż początkowa.";
  return null;
}
