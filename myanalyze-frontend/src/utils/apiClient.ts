import axios from "axios";

declare global {
  interface Window {
    API_URL?: string;
  }
}

// Centralne i niezawodne pobieranie API_URL
let API_URL = '';
if (typeof window !== "undefined" && window.API_URL) {
  API_URL = window.API_URL;
} else if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_URL) {
  API_URL = import.meta.env.VITE_API_URL;
} else if (typeof process !== "undefined" && process.env && process.env.API_URL) {
  API_URL = process.env.API_URL;
}
if (!API_URL) {
  API_URL = "http://127.0.0.1:3003";
}

const apiClient = axios.create({
  baseURL: API_URL + "/api",
  withCredentials: false,
});

// Funkcja pomocnicza do wyświetlania toastów poza React tree
// Ujednolicone typy toastFn oraz setToastFunction
let toastFn: ((message: string, type?: string, duration?: number) => void) | null = null;
export const setToastFunction = (fn: ((message: string, type?: string, duration?: number) => void) | null) => { toastFn = fn; };

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<{ error?: unknown }>(error)) {
    const message = error.response?.data?.error;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

apiClient.interceptors.response.use(
  response => response,
  error => {
    if (error.response) {
      const status = error.response.status;
      // Only show toast if toastFn is set, and avoid logging undefined
      if (status === 500 && toastFn) toastFn("Wystąpił błąd serwera (500). Spróbuj ponownie później.", "error");
      else if (status === 401 && toastFn) toastFn("Brak autoryzacji (401).", "error");
      // Błędy 4xx zawierają zwykle konkretny komunikat walidacyjny i są
      // prezentowane przez formularz, który zna kontekst operacji.
    } else if (error.request && toastFn) toastFn("Brak odpowiedzi z serwera. Sprawdź połączenie.", "error");
    else if (toastFn) toastFn("Wystąpił nieoczekiwany błąd.", "error");
    return Promise.reject(error);
  }
);

export default apiClient;
