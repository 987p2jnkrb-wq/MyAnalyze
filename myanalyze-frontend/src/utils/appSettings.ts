export type AppTheme = "light" | "dark";
export type AppLanguage = "pl" | "en";
export type AppCurrency = "PLN" | "EUR" | "USD";

export interface AppSettings {
  language: AppLanguage;
  theme: AppTheme;
  currency: AppCurrency;
  username: string;
}

export const DEFAULT_APP_SETTINGS: AppSettings = { language: "pl", theme: "light", currency: "PLN", username: "" };

export function normalizeAppLanguage(value: unknown): AppLanguage {
  return String(value ?? "").trim().toLowerCase() === "en" ? "en" : "pl";
}

export function normalizeAppCurrency(value: unknown): AppCurrency {
  const currency = String(value ?? "").trim().toUpperCase();
  return currency === "EUR" || currency === "USD" ? currency : "PLN";
}

export function getAppLanguage(): AppLanguage {
  if (typeof localStorage === "undefined") return DEFAULT_APP_SETTINGS.language;
  return normalizeAppLanguage(localStorage.getItem("myanalyze.language"));
}

export function getAppCurrency(): AppCurrency {
  if (typeof localStorage === "undefined") return DEFAULT_APP_SETTINGS.currency;
  return normalizeAppCurrency(localStorage.getItem("myanalyze.currency"));
}

export function getAppLocale(): "pl-PL" | "en-US" {
  return getAppLanguage() === "en" ? "en-US" : "pl-PL";
}

export function loadAppSettings(): AppSettings {
  if (typeof localStorage === "undefined") return { ...DEFAULT_APP_SETTINGS };
  const storedTheme = localStorage.getItem("myanalyze.theme");
  const hasSavedTheme = localStorage.getItem("myanalyze.theme-configured") === "1";
  return {
    language: getAppLanguage(),
    theme: hasSavedTheme && storedTheme === "dark" ? "dark" : "light",
    currency: getAppCurrency(),
    username: localStorage.getItem("myanalyze.username")?.trim() ?? "",
  };
}

export function saveAppSettings(settings: AppSettings): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem("myanalyze.language", normalizeAppLanguage(settings.language));
  localStorage.setItem("myanalyze.theme", settings.theme);
  localStorage.setItem("myanalyze.theme-configured", "1");
  localStorage.setItem("myanalyze.currency", normalizeAppCurrency(settings.currency));
  localStorage.setItem("myanalyze.username", settings.username.trim());
  if (typeof window !== "undefined") window.dispatchEvent(new Event("myanalyze-settings-changed"));
}

export function applyAppTheme(theme: AppTheme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}
