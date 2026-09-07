import { dbPromise } from "../db";
import { isCreditCardType } from "./creditProduct";
import { isValidDateOnly } from "../utils/validation";

type AppDatabase = Awaited<typeof dbPromise>;

type ScheduleLoan = {
  id: number;
  typ: string;
  data_rozpoczecia: string | null;
  ilosc_rat: unknown;
  kwota_calkowita: unknown;
  kwota_raty: unknown;
  dzien_splaty: unknown;
};

function dateOnly(value: string | null): Date {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function dueDate(year: number, month: number, day: number): Date {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay));
}

function isoDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function calculateInstallmentEndDate(startDate: string | null, installmentCount: number | null, requestedPaymentDay?: number | null, now = new Date()): string | null {
  if (!startDate || !isValidDateOnly(startDate) || installmentCount === null || !Number.isInteger(installmentCount) || installmentCount < 1) return null;
  const start = dateOnly(startDate);
  const paymentDay = requestedPaymentDay !== null && requestedPaymentDay !== undefined && Number.isInteger(requestedPaymentDay) && requestedPaymentDay >= 1 && requestedPaymentDay <= 31 ? requestedPaymentDay : start.getDate();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const anchor = start > today ? start : today;
  let firstDue = dueDate(anchor.getFullYear(), anchor.getMonth(), paymentDay);
  if (firstDue < anchor) firstDue = dueDate(anchor.getFullYear(), anchor.getMonth() + 1, paymentDay);
  return isoDate(dueDate(firstDue.getFullYear(), firstDue.getMonth() + installmentCount - 1, paymentDay));
}

/**
 * Creates a simple calculated schedule when no imported bank schedule exists.
 * Existing paid rows are never rebuilt, so showing or downloading it cannot erase history.
 */
export async function ensureInstallmentPlanSchedule(db: AppDatabase, loanId: number | string, refresh = false): Promise<number> {
  const loan = await db.get<ScheduleLoan>(
    "SELECT id, typ, data_rozpoczecia, ilosc_rat, kwota_calkowita, kwota_raty, dzien_splaty FROM loans WHERE id = ?",
    loanId,
  );
  if (!loan) throw new Error("Nie znaleziono produktu kredytowego.");
  if (isCreditCardType(loan.typ)) throw new Error("Harmonogram rat nie dotyczy karty kredytowej.");

  const existing = await db.get<{ count: number; paid: number }>(
    "SELECT COUNT(*) AS count, COALESCE(SUM(CASE WHEN is_paid = 1 THEN 1 ELSE 0 END), 0) AS paid FROM loan_payments WHERE loan_id = ?",
    loanId,
  );
  if (Number(existing?.count || 0) > 0 && (!refresh || Number(existing?.paid || 0) > 0)) return Number(existing?.count || 0);

  const count = Number(loan.ilosc_rat);
  const installment = Number(loan.kwota_raty);
  let remaining = Math.round(Number(loan.kwota_calkowita) * 100) / 100;
  if (!loan.data_rozpoczecia || !isValidDateOnly(loan.data_rozpoczecia) || !Number.isInteger(count) || count <= 0 || !Number.isFinite(installment) || installment <= 0 || !Number.isFinite(remaining) || remaining <= 0) {
    throw new Error("Kredyt nie ma kompletnych danych do utworzenia harmonogramu.");
  }

  if (Number(existing?.count || 0) > 0) await db.run("DELETE FROM loan_payments WHERE loan_id = ?", loanId);
  const start = dateOnly(loan.data_rozpoczecia);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const anchor = start > today ? start : today;
  const requestedDay = Number(loan.dzien_splaty);
  const paymentDay = Number.isInteger(requestedDay) && requestedDay >= 1 && requestedDay <= 31 ? requestedDay : start.getDate();
  let firstDue = dueDate(anchor.getFullYear(), anchor.getMonth(), paymentDay);
  if (firstDue < anchor) firstDue = dueDate(anchor.getFullYear(), anchor.getMonth() + 1, paymentDay);

  let inserted = 0;
  for (let index = 0; index < count && remaining > 0; index += 1) {
    const paymentDate = dueDate(firstDue.getFullYear(), firstDue.getMonth() + index, paymentDay);
    const principal = Math.round(Math.min(installment, remaining) * 100) / 100;
    remaining = Math.max(0, Math.round((remaining - principal) * 100) / 100);
    await db.run(
      `INSERT INTO loan_payments
       (loan_id, payment_number, due_date, amount_due, principal_amount, interest_amount, saldo_po, is_paid, paid_date, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, 0, NULL, date('now', 'localtime'))`,
      [loan.id, index + 1, isoDate(paymentDate), principal, principal, remaining],
    );
    inserted += 1;
  }
  return inserted;
}
