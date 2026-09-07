export type AppTheme = "light" | "dark";

export interface AppSettings {
  language: "pl";
  theme: AppTheme;
  currency: string;
  username: string;
}

export const DEFAULT_APP_SETTINGS: AppSettings = { language: "pl", theme: "light", currency: "PLN", username: "" };

export function normalizeAppCurrency(value: unknown): string {
  const currency = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : DEFAULT_APP_SETTINGS.currency;
}

export function getAppCurrency(): string {
  if (typeof localStorage === "undefined") return DEFAULT_APP_SETTINGS.currency;
  return normalizeAppCurrency(localStorage.getItem("myanalyze.currency"));
}

export function loadAppSettings(): AppSettings {
  const storedTheme = localStorage.getItem("myanalyze.theme");
  const hasSavedTheme = localStorage.getItem("myanalyze.theme-configured") === "1";
  return {
    language: "pl",
    theme: hasSavedTheme && storedTheme === "dark" ? "dark" : "light",
    currency: getAppCurrency(),
    username: localStorage.getItem("myanalyze.username")?.trim() ?? "",
  };
}

export function saveAppSettings(settings: AppSettings): void {
  localStorage.setItem("myanalyze.language", settings.language);
  localStorage.setItem("myanalyze.theme", settings.theme);
  localStorage.setItem("myanalyze.theme-configured", "1");
  localStorage.setItem("myanalyze.currency", normalizeAppCurrency(settings.currency));
  localStorage.setItem("myanalyze.username", settings.username.trim());
}

export function applyAppTheme(theme: AppTheme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}
