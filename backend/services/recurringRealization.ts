import { dbPromise } from "../db";
import { localDateKey, positiveMoney, requiredDateOnly, validatedNumber } from "../utils/validation";
import { dbBoolean } from "../utils/dbBoolean";
import { AccountBalanceError, applyAccountBalanceDelta } from "./accountBalance";

type AppDatabase = Awaited<typeof dbPromise>;
export type RecurringKind = "income" | "expense";

export class RecurringRealizationError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "RecurringRealizationError";
  }
}

export async function realizeRecurringEntry(input: {
  kind: RecurringKind;
  recurringId: string | number;
  accountId: unknown;
  userId?: unknown;
  occurrenceDate?: unknown;
}) {
  const db: AppDatabase = await dbPromise;
  const accountId = validatedNumber(input.accountId, "Konto", { required: true, min: 1, integer: true }) as number;
  const occurrenceDate = input.occurrenceDate ? requiredDateOnly(input.occurrenceDate, "Data realizacji") : localDateKey();
  const table = input.kind === "income" ? "przychody_stale" : "wydatki_stale";
  const transactionTable = input.kind === "income" ? "przychody" : "wydatki";
  const actionType = input.kind === "income" ? "RECURRING_INCOME_REALIZED" : "RECURRING_EXPENSE_REALIZED";
  const queueTable = input.kind === "income" ? "recurring_income_queue" : "recurring_expense_queue";
  const queueRuleId = input.kind === "income" ? "recurring_income_id" : "recurring_expense_id";
  const queueTransactionId = input.kind === "income" ? "income_id" : "expense_id";
  let transactionStarted = false;

  try {
    await db.exec("BEGIN IMMEDIATE");
    transactionStarted = true;
    const recurring = await db.get<{ id: number; nazwa: string; kwota: unknown; kategoria: string; custom_type_id: number | null; data_od: string; data_do: string | null }>(`SELECT * FROM ${table} WHERE id = ?`, input.recurringId);
    if (!recurring) throw new RecurringRealizationError(404, input.kind === "income" ? "Nie znaleziono przychodu stałego." : "Nie znaleziono wydatku stałego.");
    if (occurrenceDate < recurring.data_od || (recurring.data_do && recurring.data_do !== "2099-01-01" && occurrenceDate > recurring.data_do)) {
      throw new RecurringRealizationError(400, "Data realizacji jest poza okresem obowiązywania wpisu stałego.");
    }
    const realizationKey = `__recurring__:${input.kind}:${recurring.id}:${occurrenceDate}`;
    const existingTransaction = await db.get(`SELECT id FROM ${transactionTable} WHERE opis = ? AND data_dodania = ? LIMIT 1`, [realizationKey, occurrenceDate]);
    if (existingTransaction) throw new RecurringRealizationError(409, "Ten wpis stały został już zrealizowany dla wybranej daty.");

    const alreadyRealized = await db.get(
      `SELECT id FROM app_activity_log
       WHERE action_type = ? AND entity_type = ? AND CAST(entity_id AS TEXT) = CAST(? AS TEXT)
         AND json_extract(CASE WHEN json_valid(metadata) THEN metadata ELSE '{}' END, '$.occurrence_date') = ? LIMIT 1`,
      [actionType, table, recurring.id, occurrenceDate],
    );
    if (alreadyRealized) throw new RecurringRealizationError(409, "Ten wpis stały został już zrealizowany dla wybranej daty.");

    const amount = positiveMoney(recurring.kwota);
    const account = await db.get<{ id: number; nazwa: string; saldo_dostepne: unknown; saldo_wlasciwe: unknown }>("SELECT * FROM konta WHERE id = ?", accountId);
    if (!account) throw new RecurringRealizationError(404, "Nie znaleziono konta.");
    try {
      await applyAccountBalanceDelta(db, accountId, input.kind === "income" ? amount : -amount);
    } catch (error) {
      if (error instanceof AccountBalanceError) throw new RecurringRealizationError(400, error.message);
      throw error;
    }
    const accountAfter = await db.get<{ id: number; nazwa: string; saldo_dostepne: unknown; saldo_wlasciwe: unknown }>("SELECT * FROM konta WHERE id = ?", accountId);
    if (!accountAfter) throw new RecurringRealizationError(404, "Nie znaleziono konta.");

    let transactionId: number | null = null;
    {
      const queued = await db.get<{ transaction_id: number | null }>(
        `SELECT ${queueTransactionId} AS transaction_id FROM ${queueTable} WHERE ${queueRuleId} = ? AND occurrence_date = ?`,
        [recurring.id, occurrenceDate],
      );
      if (queued?.transaction_id) {
        const updated = await db.run(
          `UPDATE ${transactionTable} SET zrealizowany = 1, account_id = ?, opis = ? WHERE id = ? AND COALESCE(zrealizowany, 0) NOT IN (1, '1', 'true')`,
          [accountId, realizationKey, queued.transaction_id],
        );
        if (!updated.changes) throw new RecurringRealizationError(409, `Ten ${input.kind === "income" ? "przychód" : "wydatek"} stały został już zrealizowany.`);
        transactionId = queued.transaction_id;
        await db.run(
          `UPDATE ${queueTable} SET status = 'customized' WHERE ${queueRuleId} = ? AND occurrence_date = ?`,
          [recurring.id, occurrenceDate],
        );
      }
    }
    if (transactionId === null) {
      const transaction = await db.run(
        `INSERT INTO ${transactionTable} (nazwa, kwota, kategoria, custom_type_id, data_dodania, zrealizowany, account_id, opis, transaction_type)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        [recurring.nazwa, amount, recurring.kategoria, recurring.custom_type_id ?? null, occurrenceDate, accountId, realizationKey, input.kind === "income" ? "top_up" : "direct_debit"],
      );
      transactionId = Number(transaction.lastID);
      await db.run(
        `INSERT INTO ${queueTable} (${queueRuleId}, occurrence_date, ${queueTransactionId}, status)
         VALUES (?, ?, ?, 'customized')
         ON CONFLICT(${queueRuleId}, occurrence_date)
         DO UPDATE SET ${queueTransactionId} = excluded.${queueTransactionId}, status = 'customized'`,
        [recurring.id, occurrenceDate, transactionId],
      );
    }

    const oldData = { nazwa: account.nazwa, saldo_dostepne: Number(account.saldo_dostepne), saldo_wlasciwe: Number(account.saldo_wlasciwe) };
    const newData = { nazwa: accountAfter.nazwa, saldo_dostepne: Number(accountAfter.saldo_dostepne), saldo_wlasciwe: Number(accountAfter.saldo_wlasciwe) };
    const amountLabel = amount.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const comment = `${input.kind === "income" ? "Przychód" : "Wydatek"} stały „${recurring.nazwa}” ${amountLabel} zł zrealizowano na koncie ${account.nazwa}.`;
    const metadata = { occurrence_date: occurrenceDate, recurring_entry_id: recurring.id, transaction_id: transactionId, direction: input.kind };
    await db.run(
      `INSERT INTO app_activity_log
       (user_id, timestamp, action_type, entity_type, entity_id, old_data, new_data, metadata, comment)
       VALUES (?, datetime('now', 'localtime'), ?, ?, ?, ?, ?, ?, ?)`,
      [input.userId ?? "local", actionType, table, recurring.id, JSON.stringify(oldData), JSON.stringify(newData), JSON.stringify(metadata), comment],
    );

    const realizedTransaction = await db.get(`SELECT * FROM ${transactionTable} WHERE id = ?`, transactionId);
    await db.exec("COMMIT");
    transactionStarted = false;
    return { transaction: { ...realizedTransaction, zrealizowany: dbBoolean(realizedTransaction?.zrealizowany) }, account: accountAfter, occurrence_date: occurrenceDate };
  } catch (error) {
    if (transactionStarted) await db.exec("ROLLBACK").catch(() => undefined);
    throw error;
  }
}
