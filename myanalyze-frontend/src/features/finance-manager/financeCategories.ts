export type FinanceKind = "income" | "expense";

export const INCOME_CATEGORIES = ["Wynagrodzenie", "Premia", "Vinted", "Inne"];

export const EXPENSE_CATEGORIES = ["Jedzenie", "Zobowiązania", "Transport", "Rozrywka", "Inne"];

export const RECURRING_EXPENSE_CATEGORIES = [
  "Kredyt",
  "Rachunki",
  "Subskrypcje",
  ...EXPENSE_CATEGORIES.filter((category) => category !== "Inne"),
  "Pozostałe",
  "Inne",
];

export function categoriesFor(kind: FinanceKind, recurring = false): string[] {
  if (kind === "income") return INCOME_CATEGORIES;

  return recurring ? RECURRING_EXPENSE_CATEGORIES : EXPENSE_CATEGORIES;
}
