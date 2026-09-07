import { calculateDebt, calculateInstallmentEndDate, normalizeCreditProductType, type CreditProductType } from "../creditProductModel";
import { isValidDateOnly, validateDateRange, validateIntegerRange, validateNonNegativeMoney, validateNonNegativeNumber, validatePositiveMoney } from "../../../utils/validation";

export interface Loan {
  id: number;
  nazwa: string;
  typ: CreditProductType;
  data_rozpoczecia: string | null;
  data_do: string | null;
  ilosc_rat: number | null;
  kwota_kapitalu: number | null;
  kwota_calkowita: number;
  kwota_raty: number | null;
  rrso: number | null;
  dzien_splaty: number | null;
  oprocentowanie: number | null;
  prowizja: number | null;
  ubezpieczenie: number | null;
  data_dodania: string | null;
  card_account_id?: number | null;
  linked_card_account_id?: number | null;
  linked_card_name?: string | null;
  recurring_expense_id?: number | null;
  recurring_expense_name?: string | null;
  active?: boolean;
}

export type EditableLoan = Omit<Loan, "id">;

export function validateLoan(loan: EditableLoan): string | null {
  if (!loan.nazwa.trim()) return "Nazwa kredytu nie może być pusta.";
  if (loan.data_rozpoczecia) {
    const dateError = validateDateRange(loan.data_rozpoczecia, loan.data_do);
    if (dateError) return dateError;
  }
  if (loan.data_dodania && !isValidDateOnly(loan.data_dodania)) return "Podaj prawidłową datę dodania.";
  if (loan.ilosc_rat !== null) {
    const countError = validateIntegerRange(loan.ilosc_rat, "Pozostała liczba rat", 1, Number.MAX_SAFE_INTEGER);
    if (countError) return countError;
  }
  if (loan.kwota_kapitalu !== null) {
    const capitalError = validatePositiveMoney(loan.kwota_kapitalu, "Kapitał");
    if (capitalError) return capitalError;
  }
  const debtError = validateNonNegativeMoney(loan.kwota_calkowita, "Zadłużenie");
  if (debtError) return debtError;
  if (loan.kwota_raty !== null) {
    const installmentError = validatePositiveMoney(loan.kwota_raty, "Rata");
    if (installmentError) return installmentError;
  }
  if (loan.dzien_splaty !== null) {
    const paymentDayError = validateIntegerRange(loan.dzien_splaty, "Dzień spłaty", 1, 31);
    if (paymentDayError) return paymentDayError;
  }
  for (const [label, value] of [["RRSO", loan.rrso], ["Oprocentowanie", loan.oprocentowanie]] as const) {
    const costError = validateNonNegativeNumber(value, label);
    if (costError) return costError;
  }
  for (const [label, value] of [["Prowizja", loan.prowizja], ["Ubezpieczenie", loan.ubezpieczenie]] as const) {
    const costError = validateNonNegativeMoney(value, label);
    if (costError) return costError;
  }
  return null;
}

export function loanPayload(loan: EditableLoan) {
  const calculatedEndDate = calculateInstallmentEndDate(loan.data_rozpoczecia?.slice(0, 10) ?? "", loan.ilosc_rat, loan.dzien_splaty);
  return {
    nazwa: loan.nazwa.trim(),
    typ: normalizeCreditProductType(loan.typ),
    data_rozpoczecia: loan.data_rozpoczecia?.slice(0, 10) ?? null,
    data_do: calculatedEndDate || loan.data_do?.slice(0, 10) || null,
    ilosc_rat: loan.ilosc_rat,
    kwota_kapitalu: loan.kwota_kapitalu,
    kwota_calkowita: Number(loan.kwota_calkowita),
    kwota_raty: loan.kwota_raty,
    rrso: loan.rrso,
    dzien_splaty: loan.dzien_splaty,
    oprocentowanie: loan.oprocentowanie,
    prowizja: loan.prowizja,
    ubezpieczenie: loan.ubezpieczenie,
    data_dodania: loan.data_dodania?.slice(0, 10) ?? null,
    active: loan.active !== false,
  };
}

export function withCalculatedLoanDates<T extends { data_rozpoczecia: string | null; data_do: string | null; ilosc_rat: number | null; dzien_splaty: number | null }>(loan: T): T {
  const endDate = calculateInstallmentEndDate(loan.data_rozpoczecia?.slice(0, 10) ?? "", loan.ilosc_rat, loan.dzien_splaty);
  return endDate ? { ...loan, data_do: endDate } : loan;
}

export function withCalculatedLoanDebt<T extends { typ: CreditProductType; kwota_calkowita: number; kwota_raty: number | null; ilosc_rat: number | null }>(loan: T): T {
  return {
    ...loan,
    typ: normalizeCreditProductType(loan.typ),
    kwota_calkowita: calculateDebt(loan.typ, Number(loan.kwota_calkowita), loan.kwota_raty, loan.ilosc_rat),
  };
}
