import { isValidDateOnly } from "./validation";

export function validateOptionalDateRange(start: unknown, end: unknown): string | null {
  const startDate = start ? String(start).slice(0, 10) : "";
  const endDate = end ? String(end).slice(0, 10) : "";
  if (startDate && !isValidDateOnly(startDate)) return "Podaj prawidłową datę rozpoczęcia.";
  if (endDate && !isValidDateOnly(endDate)) return "Podaj prawidłową datę zakończenia.";
  if (startDate && endDate && endDate < startDate) return "Data zakończenia nie może być wcześniejsza niż data rozpoczęcia.";
  return null;
}
