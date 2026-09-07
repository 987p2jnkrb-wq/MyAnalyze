import { InputValidationError, positiveMoney, requiredDateOnly, requiredText, validatedNumber } from "./validation";

export type TransactionPayload = {
  nazwa: string;
  kwota: number;
  /** Pole legacy dla zgodności ze starszym API/DB. Nowa klasyfikacja używa custom_type_id. */
  kategoria: string;
  data_dodania: string;
  opis: unknown;
  transaction_type: unknown;
  custom_type_id: number | null;
  zrealizowany: unknown;
};

function optionalCustomTypeId(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new InputValidationError("Nieprawidłowa etykieta.");
  return id;
}

export function normalizeTransactionPayload(body: Record<string, unknown>): TransactionPayload {
  return {
    nazwa: requiredText(body.nazwa, "Nazwa"),
    kwota: positiveMoney(body.kwota),
    kategoria: typeof body.kategoria === "string" && body.kategoria.trim() ? body.kategoria.trim().slice(0, 80) : "Inne",
    data_dodania: requiredDateOnly(body.data_dodania),
    opis: body.opis,
    transaction_type: body.transaction_type,
    custom_type_id: optionalCustomTypeId(body.custom_type_id),
    zrealizowany: body.zrealizowany,
  };
}

export type RecurringPayload = {
  nazwa: string;
  kwota: number;
  /** Pole legacy; klasyfikacja użytkownika jest przechowywana w custom_type_id. */
  kategoria: string;
  custom_type_id: number | null;
  data_od: string;
  data_do: string | null;
  dzien_miesiaca: number;
};

export function normalizeRecurringPayload(body: Record<string, unknown>): RecurringPayload {
  const dataOd = requiredDateOnly(body.data_od, "Data początkowa");
  const unlimited = body.bezterminowo === true || body.bezterminowo === "true" || body.bezterminowo === 1;
  const rawEnd = unlimited ? "2099-01-01" : body.data_do;
  const dataDo = rawEnd === null || rawEnd === undefined || rawEnd === "" ? null : requiredDateOnly(rawEnd, "Data końcowa");
  if (dataDo && dataDo < dataOd) throw new InputValidationError("Data końcowa nie może być wcześniejsza niż data początkowa.");
  return {
    nazwa: requiredText(body.nazwa, "Nazwa"),
    kwota: positiveMoney(body.kwota),
    kategoria: typeof body.kategoria === "string" && body.kategoria.trim() ? body.kategoria.trim().slice(0, 80) : "Inne",
    custom_type_id: optionalCustomTypeId(body.custom_type_id),
    data_od: dataOd,
    data_do: dataDo,
    dzien_miesiaca: validatedNumber(body.dzien_miesiaca, "Dzień miesiąca", { required: true, min: 1, max: 31, integer: true }) as number,
  };
}
