import { dbPromise } from "../db";
import { dbBoolean } from "../utils/dbBoolean";
import { localDateKey, positiveMoney, requiredDateOnly, validatedNumber } from "../utils/validation";
import { AccountBalanceError, applyAccountBalanceDelta } from "./accountBalance";
import { addPlanAllocation, allocatedToPlan } from "./planAllocations";

type AppDatabase = Awaited<typeof dbPromise>;
type TransactionKind = "income" | "expense";
type TransactionTable = "przychody" | "wydatki";

type TransactionRow = {
  id: number;
  nazwa: string;
  kwota: unknown;
  kategoria: string;
  data_dodania: string;
  zrealizowany: unknown;
  opis?: unknown;
  transaction_type?: unknown;
  excluded_from_analysis?: unknown;
  pewnosc?: unknown;
  custom_type_id?: number | null;
};

export class TransactionRealizationError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "TransactionRealizationError";
  }
}

const tableFor = (kind: TransactionKind): TransactionTable => kind === "income" ? "przychody" : "wydatki";
const labelFor = (kind: TransactionKind): string => kind === "income" ? "przychód" : "wydatek";
const genitiveLabelFor = (kind: TransactionKind): string => kind === "income" ? "przychodu" : "wydatku";
const cents = (value: unknown): number => Math.round(Number(value) * 100);
const money = (valueInCents: number): number => valueInCents / 100;
const moneyLabel = (value: number): string => value.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function requestedAmount(value: unknown, remainingCents: number): number {
  const amount = value === undefined || value === null || value === "" ? money(remainingCents) : positiveMoney(value);
  const amountCents = cents(amount);
  if (amountCents > remainingCents) {
    throw new TransactionRealizationError(400, "Kwota realizacji nie może przekraczać kwoty pozostałej do rozliczenia.");
  }
  return amountCents;
}

async function plannedTransaction(db: AppDatabase, table: TransactionTable, id: number | string, kind: TransactionKind): Promise<TransactionRow> {
  const row = await db.get<TransactionRow>(`SELECT * FROM ${table} WHERE id = ?`, id);
  if (!row) throw new TransactionRealizationError(404, `Nie znaleziono ${genitiveLabelFor(kind)}.`);
  if (dbBoolean(row.zrealizowany)) throw new TransactionRealizationError(409, `Ten ${labelFor(kind)} został już zrealizowany.`);
  if (cents(row.kwota) <= 0) throw new TransactionRealizationError(409, `Ten ${labelFor(kind)} nie ma już kwoty do realizacji.`);
  return row;
}

async function allocatedToOneTimePlan(db: AppDatabase, kind: TransactionKind, planId: number): Promise<number> {
  return cents(await allocatedToPlan(db, kind, "one_time", planId));
}

async function splitOrComplete(
  db: AppDatabase,
  table: TransactionTable,
  row: TransactionRow,
  amountCents: number,
  accountId: number | null,
  realizedDate = row.data_dodania,
): Promise<{ realized: TransactionRow; remaining: TransactionRow | null; partial: boolean }> {
  const remainingCents = cents(row.kwota);
  if (amountCents === remainingCents) {
    await db.run(`UPDATE ${table} SET zrealizowany = 1, account_id = ? WHERE id = ?`, accountId, row.id);
    if (table === "przychody") await db.run("UPDATE recurring_income_queue SET status = 'customized' WHERE income_id = ?", row.id);
    else await db.run("UPDATE recurring_expense_queue SET status = 'customized' WHERE expense_id = ?", row.id);
    const realized = (await db.get<TransactionRow>(`SELECT * FROM ${table} WHERE id = ?`, row.id))!;
    return { realized, remaining: null, partial: false };
  }

  await db.run(`UPDATE ${table} SET kwota = ? WHERE id = ?`, money(remainingCents - amountCents), row.id);
  // Generator nie może przy kolejnym odczycie przywrócić pierwotnej kwoty
  // częściowo rozliczonego wystąpienia stałego.
  if (table === "przychody") await db.run("UPDATE recurring_income_queue SET status = 'customized' WHERE income_id = ?", row.id);
  else await db.run("UPDATE recurring_expense_queue SET status = 'customized' WHERE expense_id = ?", row.id);
  const inserted = await db.run(
    `INSERT INTO ${table}
     (nazwa, kwota, kategoria, data_dodania, zrealizowany, opis, account_id, transaction_type, excluded_from_analysis, custom_type_id)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
    row.nazwa,
    money(amountCents),
    row.kategoria,
    realizedDate,
    row.opis ?? null,
    accountId,
    row.transaction_type ?? null,
    dbBoolean(row.excluded_from_analysis) ? 1 : 0,
    row.custom_type_id ?? null,
  );
  const realized = (await db.get<TransactionRow>(`SELECT * FROM ${table} WHERE id = ?`, inserted.lastID))!;
  if (table === "przychody") {
    await db.run("UPDATE przychody SET pewnosc = ? WHERE id = ?", row.pewnosc ?? "expected", inserted.lastID);
    realized.pewnosc = row.pewnosc ?? "expected";
  }
  const remaining = (await db.get<TransactionRow>(`SELECT * FROM ${table} WHERE id = ?`, row.id))!;
  return { realized, remaining, partial: true };
}

async function realizePlannedAmount(
  db: AppDatabase,
  kind: TransactionKind,
  row: TransactionRow,
  amountCents: number,
  availableCents: number,
  allocatedCents: number,
  accountId: number | null,
  realizedDate = row.data_dodania,
) {
  if (allocatedCents === 0) return splitOrComplete(db, tableFor(kind), row, amountCents, accountId, realizedDate);
  const table = tableFor(kind);
  const inserted = await db.run(
    `INSERT INTO ${table}
     (nazwa, kwota, kategoria, data_dodania, zrealizowany, opis, account_id, transaction_type, excluded_from_analysis, custom_type_id)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
    [row.nazwa, money(amountCents), row.kategoria, realizedDate, row.opis ?? null, accountId, row.transaction_type ?? null, dbBoolean(row.excluded_from_analysis) ? 1 : 0, row.custom_type_id ?? null],
  );
  if (kind === "income") await db.run("UPDATE przychody SET pewnosc = ? WHERE id = ?", row.pewnosc ?? "expected", inserted.lastID);
  await addPlanAllocation(db, { actualKind: kind, actualId: Number(inserted.lastID), planSource: "one_time", planId: row.id, occurrenceDate: null, allocatedAmount: money(amountCents) });
  const realized = (await db.get<TransactionRow>(`SELECT * FROM ${table} WHERE id = ?`, inserted.lastID))!;
  return { realized, remaining: row, partial: amountCents < availableCents };
}

function normalizedTransaction(row: TransactionRow | null) {
  return row ? { ...row, zrealizowany: dbBoolean(row.zrealizowany) } : null;
}

export async function realizeTransaction(input: {
  kind: TransactionKind;
  transactionId: number | string;
  accountId: unknown;
  amount?: unknown;
  realizationDate?: unknown;
  userId?: unknown;
}) {
  const db = await dbPromise;
  const table = tableFor(input.kind);
  const accountId = validatedNumber(input.accountId, "Konto", { required: true, min: 1, integer: true }) as number;
  let transactionStarted = false;
  try {
    await db.exec("BEGIN IMMEDIATE");
    transactionStarted = true;
    const transaction = await plannedTransaction(db, table, input.transactionId, input.kind);
    const allocatedCents = await allocatedToOneTimePlan(db, input.kind, transaction.id);
    const availableCents = Math.max(0, cents(transaction.kwota) - allocatedCents);
    if (availableCents <= 0) throw new TransactionRealizationError(409, "Ta planowana operacja została już w całości rozliczona wykonaniem.");
    const amountCents = requestedAmount(input.amount, availableCents);
    const partial = amountCents < availableCents;
    const realizedDate = input.kind === "income" && partial
      ? requiredDateOnly(input.realizationDate ?? localDateKey(), "Data realizacji")
      : transaction.data_dodania;
    const oldAccount = await db.get("SELECT * FROM konta WHERE id = ?", accountId);
    if (!oldAccount) throw new TransactionRealizationError(404, "Nie znaleziono konta.");
    try {
      await applyAccountBalanceDelta(db, accountId, input.kind === "income" ? money(amountCents) : -money(amountCents));
    } catch (error) {
      if (error instanceof AccountBalanceError) throw new TransactionRealizationError(400, error.message);
      throw error;
    }
    const account = await db.get("SELECT * FROM konta WHERE id = ?", accountId);
    const result = await realizePlannedAmount(db, input.kind, transaction, amountCents, availableCents, allocatedCents, accountId, realizedDate);
    const actionType = input.kind === "income" ? "Realizacja Przychodu" : "Realizacja Wydatku";
    const partialLabel = result.partial ? "częściowo zrealizowany" : "zrealizowany";
    const comment = `${input.kind === "income" ? "Przychód" : "Wydatek"} „${transaction.nazwa}” został ${partialLabel} w kwocie ${moneyLabel(money(amountCents))} zł na koncie ${oldAccount.nazwa}.`;
    await db.run(
      `INSERT INTO app_activity_log (user_id, action_type, entity_type, entity_id, old_data, new_data, comment, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      input.userId || 1,
      actionType,
      "konta",
      accountId,
      JSON.stringify({ konto: oldAccount.nazwa, saldo_dostepne: Number(oldAccount.saldo_dostepne), saldo_wlasciwe: Number(oldAccount.saldo_wlasciwe) }),
      JSON.stringify({ konto: account.nazwa, saldo_dostepne: Number(account.saldo_dostepne), saldo_wlasciwe: Number(account.saldo_wlasciwe) }),
      comment,
      JSON.stringify({ date: new Date().toISOString(), realization_date: realizedDate, partial: result.partial, realized_amount: money(amountCents) }),
    );
    await db.exec("COMMIT");
    transactionStarted = false;
    return {
      transaction: normalizedTransaction(result.realized),
      remaining_transaction: normalizedTransaction(result.remaining),
      account,
      partial: result.partial,
      realized_amount: money(amountCents),
    };
  } catch (error) {
    if (transactionStarted) await db.exec("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function realizeExpenseWithIncome(input: {
  expenseId: number | string;
  incomeId: unknown;
  amount?: unknown;
  userId?: unknown;
}) {
  const db = await dbPromise;
  const incomeId = validatedNumber(input.incomeId, "Przychód", { required: true, min: 1, integer: true }) as number;
  let transactionStarted = false;
  try {
    await db.exec("BEGIN IMMEDIATE");
    transactionStarted = true;
    const expense = await plannedTransaction(db, "wydatki", input.expenseId, "expense");
    const income = await plannedTransaction(db, "przychody", incomeId, "income");
    const expenseAllocated = await allocatedToOneTimePlan(db, "expense", expense.id);
    const incomeAllocated = await allocatedToOneTimePlan(db, "income", income.id);
    const expenseAvailable = Math.max(0, cents(expense.kwota) - expenseAllocated);
    const incomeAvailable = Math.max(0, cents(income.kwota) - incomeAllocated);
    const maximumCents = Math.min(expenseAvailable, incomeAvailable);
    if (maximumCents <= 0) throw new TransactionRealizationError(409, "Ta planowana operacja została już w całości rozliczona wykonaniem.");
    const amountCents = requestedAmount(input.amount, maximumCents);
    const expenseResult = await realizePlannedAmount(db, "expense", expense, amountCents, expenseAvailable, expenseAllocated, null);
    const incomeResult = await realizePlannedAmount(db, "income", income, amountCents, incomeAvailable, incomeAllocated, null);
    const comment = `Wydatek „${expense.nazwa}” rozliczono przychodem „${income.nazwa}” w kwocie ${moneyLabel(money(amountCents))} zł.`;
    await db.run(
      `INSERT INTO app_activity_log (user_id, action_type, entity_type, entity_id, old_data, new_data, comment, metadata)
       VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)`,
      input.userId || 1,
      "Realizacja Wydatku Przychodem",
      "wydatki",
      expense.id,
      comment,
      JSON.stringify({ date: new Date().toISOString(), income_id: income.id, realized_amount: money(amountCents) }),
    );
    await db.exec("COMMIT");
    transactionStarted = false;
    return {
      expense_transaction: normalizedTransaction(expenseResult.realized),
      income_transaction: normalizedTransaction(incomeResult.realized),
      remaining_expense: normalizedTransaction(expenseResult.remaining),
      remaining_income: normalizedTransaction(incomeResult.remaining),
      realized_amount: money(amountCents),
    };
  } catch (error) {
    if (transactionStarted) await db.exec("ROLLBACK").catch(() => undefined);
    throw error;
  }
}
