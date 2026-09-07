const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const MAX_MONEY_AMOUNT = 9_999_999;

export class InputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputValidationError";
  }
}

export function isInputValidationError(error: unknown): error is InputValidationError {
  return error instanceof InputValidationError;
}

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

export function requiredText(value: unknown, label: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new InputValidationError(`${label} nie może być pusta.`);
  return normalized;
}

export function requiredDateOnly(value: unknown, label = "Data"): string {
  const normalized = String(value ?? "").slice(0, 10);
  if (!isValidDateOnly(normalized)) throw new InputValidationError(`${label} jest nieprawidłowa.`);
  return normalized;
}

type NumberOptions = {
  required?: boolean;
  min?: number;
  max?: number;
  integer?: boolean;
  money?: boolean;
};

export function validatedNumber(value: unknown, label: string, options: NumberOptions = {}): number | null {
  const { required = false, min, max, integer = false, money = false } = options;
  const effectiveMax = max ?? (money ? MAX_MONEY_AMOUNT : undefined);
  if (value === null || value === undefined || value === "") {
    if (required) throw new InputValidationError(`${label} jest wymagana.`);
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(String(value).trim().replace(",", "."));
  if (!Number.isFinite(parsed)) throw new InputValidationError(`${label} musi być prawidłową liczbą.`);
  if (integer && !Number.isInteger(parsed)) throw new InputValidationError(`${label} musi być liczbą całkowitą.`);
  if (min !== undefined && parsed < min) throw new InputValidationError(`${label} nie może być mniejsza niż ${min}.`);
  if (effectiveMax !== undefined && parsed > effectiveMax) throw new InputValidationError(`${label} nie może być większa niż ${effectiveMax.toLocaleString("pl-PL")}.`);
  return money ? Math.round(parsed * 100) / 100 : parsed;
}

export function positiveMoney(value: unknown, label = "Kwota"): number {
  const amount = validatedNumber(value, label, { required: true, min: 0.01, money: true });
  return amount as number;
}
