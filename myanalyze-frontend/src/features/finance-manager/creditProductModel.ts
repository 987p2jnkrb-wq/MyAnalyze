import { isValidDateOnly, localDateKey } from "../../utils/validation";

// Keep in sync with backend/services/creditProduct.ts.
export const CREDIT_PRODUCT_TYPES = ["Kredyt", "Kredyt hipoteczny", "Karta kredytowa", "Plan ratalny"] as const;
export type CreditProductType = typeof CREDIT_PRODUCT_TYPES[number];
export type FinancialProductBadgeTone = "neutral" | "info" | "success" | "danger" | "warning" | "violet";

export function financialProductBadgeTone(value: unknown): FinancialProductBadgeTone {
  const normalized = String(value ?? "").trim().toLocaleLowerCase("pl-PL");
  if (normalized === "dług" || normalized === "dlug") return "danger";
  if (normalized === "kredyt hipoteczny" || normalized === "hipoteka") return "success";
  if (normalized === "karta" || normalized === "karta kredytowa") return "violet";
  if (normalized === "plan ratalny") return "warning";
  if (normalized === "kredyt") return "info";
  return "neutral";
}

export function normalizeCreditProductType(value: unknown): CreditProductType {
  const normalized = String(value ?? "").trim().toLocaleLowerCase("pl-PL");
  if (normalized === "kredyt hipoteczny" || normalized === "hipoteka") return "Kredyt hipoteczny";
  if (normalized === "karta" || normalized === "karta kredytowa") return "Karta kredytowa";
  if (normalized === "plan ratalny") return "Plan ratalny";
  return "Kredyt";
}

export function isCreditCardType(value: unknown): boolean {
  return normalizeCreditProductType(value) === "Karta kredytowa";
}

export function isInstallmentPlanType(value: unknown): boolean {
  return normalizeCreditProductType(value) === "Plan ratalny";
}

export function usesCalculatedDebt(value: unknown): boolean {
  const type = String(value ?? "").trim().toLocaleLowerCase("pl-PL");
  return type === "kredyt" || type === "plan ratalny";
}

export function calculateDebt(type: unknown, manualDebt: number, installment: number | null, installmentCount: number | null): number {
  if (usesCalculatedDebt(type) && (!Number.isFinite(manualDebt) || manualDebt <= 0) && installment !== null && installmentCount !== null) {
    return Math.round(installment * installmentCount * 100) / 100;
  }
  return manualDebt;
}

export function suggestedDebt(installment: number | null, installmentCount: number | null): number | null {
  if (installment === null || installmentCount === null || installment < 0 || !Number.isInteger(installmentCount) || installmentCount < 1) return null;
  return Math.round(installment * installmentCount * 100) / 100;
}

export function calculateUsedCreditLimit(creditLimit: unknown, availableLimit: unknown): number {
  const limit = Number(creditLimit || 0);
  const available = Number(availableLimit || 0);
  if (!Number.isFinite(limit) || !Number.isFinite(available)) return 0;
  return Math.max(0, Math.round((limit - available) * 100) / 100);
}

export function optionalNumber(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function dateFromKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dateKey(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function installmentDueDate(targetYear: number, targetMonth: number, paymentDay: number): Date {
  const normalized = new Date(Date.UTC(targetYear, targetMonth, 1));
  const lastDay = new Date(Date.UTC(normalized.getUTCFullYear(), normalized.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(normalized.getUTCFullYear(), normalized.getUTCMonth(), Math.min(paymentDay, lastDay)));
}

function firstDueDate(startDate: string, requestedPaymentDay?: number | null): Date {
  const [year, month, day] = startDate.split("-").map(Number);
  const paymentDay = requestedPaymentDay !== null && requestedPaymentDay !== undefined && Number.isInteger(requestedPaymentDay) && requestedPaymentDay >= 1 && requestedPaymentDay <= 31 ? requestedPaymentDay : day;
  const start = new Date(Date.UTC(year, month - 1, day));
  let firstDue = installmentDueDate(year, month - 1, paymentDay);
  if (firstDue < start) firstDue = installmentDueDate(year, month, paymentDay);
  return firstDue;
}

export type InstallmentProgress = { elapsed: number; remaining: number; nextDueDate: string | null; contractEndDate: string };

export function calculateInstallmentProgress(startDate: string, totalInstallments: number | null, requestedPaymentDay?: number | null, today = localDateKey()): InstallmentProgress | null {
  if (!isValidDateOnly(startDate) || !isValidDateOnly(today) || totalInstallments === null || !Number.isInteger(totalInstallments) || totalInstallments < 1) return null;
  const firstDue = firstDueDate(startDate, requestedPaymentDay);
  const paymentDay = requestedPaymentDay !== null && requestedPaymentDay !== undefined && Number.isInteger(requestedPaymentDay) && requestedPaymentDay >= 1 && requestedPaymentDay <= 31 ? requestedPaymentDay : Number(startDate.slice(8, 10));
  const todayDate = dateFromKey(today);
  let elapsed = 0;
  for (let index = 0; index < totalInstallments; index += 1) {
    const due = installmentDueDate(firstDue.getUTCFullYear(), firstDue.getUTCMonth() + index, paymentDay);
    if (due < todayDate) elapsed += 1;
  }
  const remaining = Math.max(0, totalInstallments - elapsed);
  const nextDue = remaining > 0 ? installmentDueDate(firstDue.getUTCFullYear(), firstDue.getUTCMonth() + elapsed, paymentDay) : null;
  const end = installmentDueDate(firstDue.getUTCFullYear(), firstDue.getUTCMonth() + totalInstallments - 1, paymentDay);
  return { elapsed, remaining, nextDueDate: nextDue ? dateKey(nextDue) : null, contractEndDate: dateKey(end) };
}

export function calculateInstallmentEndDate(startDate: string, remainingInstallments: number | null, requestedPaymentDay?: number | null, today = localDateKey()): string {
  if (!isValidDateOnly(startDate) || !isValidDateOnly(today) || remainingInstallments === null || !Number.isInteger(remainingInstallments) || remainingInstallments < 1) return "";
  const paymentDay = requestedPaymentDay !== null && requestedPaymentDay !== undefined && Number.isInteger(requestedPaymentDay) && requestedPaymentDay >= 1 && requestedPaymentDay <= 31 ? requestedPaymentDay : Number(startDate.slice(8, 10));
  const start = dateFromKey(startDate);
  const anchor = dateFromKey(today) > start ? dateFromKey(today) : start;
  let firstDue = installmentDueDate(anchor.getUTCFullYear(), anchor.getUTCMonth(), paymentDay);
  if (firstDue < anchor) firstDue = installmentDueDate(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, paymentDay);
  return dateKey(installmentDueDate(firstDue.getUTCFullYear(), firstDue.getUTCMonth() + remainingInstallments - 1, paymentDay));
}
