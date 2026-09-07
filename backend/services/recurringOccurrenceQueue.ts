import { dbPromise } from "../db";
import { deleteTransaction } from "./transactions";

export type RecurringOccurrenceKind = "income" | "expense";
type AppDatabase = Awaited<typeof dbPromise>;
export type RecurringRule = {
  id: number;
  nazwa: string;
  kwota: unknown;
  kategoria: string;
  custom_type_id: number | null;
  data_od: string;
  data_do: string | null;
  dzien_miesiaca: unknown;
};

const config = {
  income: { ruleTable: "przychody_stale", queueTable: "recurring_income_queue", transactionTable: "przychody", ruleId: "recurring_income_id", transactionId: "income_id", transactionType: "top_up" },
  expense: { ruleTable: "wydatki_stale", queueTable: "recurring_expense_queue", transactionTable: "wydatki", ruleId: "recurring_expense_id", transactionId: "expense_id", transactionType: "direct_debit" },
} as const;

function dateOnly(value: Date): Date { return new Date(value.getFullYear(), value.getMonth(), value.getDate()); }
function parseDate(value: string): Date { const [year, month, day] = value.slice(0, 10).split("-").map(Number); return new Date(year, month - 1, day); }
function dateKey(value: Date): string { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function occurrenceInMonth(year: number, month: number, requestedDay: number): Date { const lastDay = new Date(year, month + 1, 0).getDate(); return new Date(year, month, Math.min(requestedDay, lastDay)); }

export function nextRecurringOccurrenceDate(rule: Pick<RecurringRule, "data_od" | "data_do" | "dzien_miesiaca">, now = new Date()): string | null {
  const today = dateOnly(now);
  const start = parseDate(rule.data_od);
  const end = rule.data_do && rule.data_do !== "2099-01-01" ? parseDate(rule.data_do) : null;
  const day = Math.max(1, Math.min(31, Number(rule.dzien_miesiaca)));
  let candidate = occurrenceInMonth(today.getFullYear(), today.getMonth(), day);
  if (candidate < today) candidate = occurrenceInMonth(today.getFullYear(), today.getMonth() + 1, day);
  while (candidate < start) candidate = occurrenceInMonth(candidate.getFullYear(), candidate.getMonth() + 1, day);
  return end && candidate > end ? null : dateKey(candidate);
}

let recurringSavepointSequence = 0;

async function withRecurringSavepoint<T>(db: AppDatabase, work: () => Promise<T>): Promise<T> {
  const savepoint = `recurring_occurrence_${++recurringSavepointSequence}`;
  await db.exec(`SAVEPOINT ${savepoint}`);
  try {
    const result = await work();
    await db.exec(`RELEASE SAVEPOINT ${savepoint}`);
    return result;
  } catch (error) {
    await db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`).catch(() => undefined);
    await db.exec(`RELEASE SAVEPOINT ${savepoint}`).catch(() => undefined);
    throw error;
  }
}

async function removeObsolete(db: AppDatabase, kind: RecurringOccurrenceKind, recurringId: number, keepDate: string | null, today: string) {
  const current = config[kind];
  const obsolete = await db.all<Array<{ queue_id: number; transaction_id: number | null }>>(
    `SELECT q.id AS queue_id, q.${current.transactionId} AS transaction_id
       FROM ${current.queueTable} q
       LEFT JOIN ${current.transactionTable} transaction_row ON transaction_row.id = q.${current.transactionId}
      WHERE q.${current.ruleId} = ? AND q.status = 'scheduled'
        AND q.occurrence_date >= ? AND q.occurrence_date <> COALESCE(?, '')
        AND COALESCE(transaction_row.zrealizowany, 0) NOT IN (1, '1', 'true')`,
    [recurringId, today, keepDate],
  );
  for (const row of obsolete) {
    if (row.transaction_id !== null) await deleteTransaction(db, kind, row.transaction_id);
    await db.run(`DELETE FROM ${current.queueTable} WHERE id = ?`, row.queue_id);
  }
}

export async function syncRecurringOccurrenceRule(db: AppDatabase, kind: RecurringOccurrenceKind, rule: RecurringRule, now = new Date()): Promise<void> {
  await withRecurringSavepoint(db, async () => {
    const current = config[kind];
    const today = dateKey(dateOnly(now));
    const occurrenceDate = nextRecurringOccurrenceDate(rule, now);
    await removeObsolete(db, kind, rule.id, occurrenceDate, today);
    if (!occurrenceDate) return;
    const existing = await db.get<{ id: number; transaction_id: number | null; status: string }>(
      `SELECT id, ${current.transactionId} AS transaction_id, status FROM ${current.queueTable} WHERE ${current.ruleId} = ? AND occurrence_date = ?`,
      [rule.id, occurrenceDate],
    );
    if (existing && existing.status !== "scheduled") return;
    if (existing?.transaction_id) {
      const updated = await db.run(
        `UPDATE ${current.transactionTable} SET nazwa = ?, kwota = ?, kategoria = ?, custom_type_id = ?, data_dodania = ? WHERE id = ? AND COALESCE(zrealizowany, 0) NOT IN (1, '1', 'true')`,
        [rule.nazwa, Number(rule.kwota), rule.kategoria, rule.custom_type_id ?? null, occurrenceDate, existing.transaction_id],
      );
      if (updated.changes) return;
      const transaction = await db.get<{ id: number }>(
        `SELECT id FROM ${current.transactionTable} WHERE id = ?`, existing.transaction_id,
      );
      if (transaction) {
        // An actual occurrence is not an orphan. Preserve its link and prevent
        // both another generated transaction and a synthetic plan occurrence.
        await db.run(`UPDATE ${current.queueTable} SET status = 'customized' WHERE id = ?`, existing.id);
        return;
      }
      // Heal a stale queue row that points at a missing transaction.
      await db.run(`UPDATE ${current.queueTable} SET ${current.transactionId} = NULL WHERE id = ?`, existing.id);
    }

    let queueId = existing?.id ?? null;
    if (queueId === null) {
      const queueInsert = await db.run(
        `INSERT OR IGNORE INTO ${current.queueTable} (${current.ruleId}, occurrence_date, status) VALUES (?, ?, 'scheduled')`,
        [rule.id, occurrenceDate],
      );
      if (!queueInsert.changes) {
        const concurrent = await db.get<{ id: number; transaction_id: number | null; status: string }>(
          `SELECT id, ${current.transactionId} AS transaction_id, status FROM ${current.queueTable} WHERE ${current.ruleId} = ? AND occurrence_date = ?`,
          [rule.id, occurrenceDate],
        );
        if (!concurrent || concurrent.status !== "scheduled" || concurrent.transaction_id) return;
        queueId = concurrent.id;
      } else {
        queueId = Number(queueInsert.lastID);
      }
    }

    const transaction = await db.run(
      `INSERT INTO ${current.transactionTable} (nazwa, kwota, kategoria, custom_type_id, data_dodania, zrealizowany, opis, transaction_type) VALUES (?, ?, ?, ?, ?, 0, NULL, ?)`,
      [rule.nazwa, Number(rule.kwota), rule.kategoria, rule.custom_type_id ?? null, occurrenceDate, current.transactionType],
    );
    await db.run(
      `UPDATE ${current.queueTable} SET ${current.transactionId} = ? WHERE id = ?`,
      [transaction.lastID, queueId],
    );
  });
}

export async function syncRecurringOccurrenceById(db: AppDatabase, kind: RecurringOccurrenceKind, recurringId: number | string, now = new Date()): Promise<void> {
  const rule = await db.get<RecurringRule>(`SELECT * FROM ${config[kind].ruleTable} WHERE id = ?`, recurringId);
  if (rule) await syncRecurringOccurrenceRule(db, kind, rule, now);
}

export async function ensureRecurringOccurrenceQueue(kind: RecurringOccurrenceKind, dbInstance?: AppDatabase, now = new Date()): Promise<void> {
  const db = dbInstance ?? await dbPromise;
  const rules = await db.all<RecurringRule[]>(`SELECT * FROM ${config[kind].ruleTable} ORDER BY id`);
  for (const rule of rules) await syncRecurringOccurrenceRule(db, kind, rule, now);
}

export async function removeRecurringOccurrenceQueue(db: AppDatabase, kind: RecurringOccurrenceKind, recurringId: number | string): Promise<void> {
  const current = config[kind];
  const queued = await db.all<Array<{ transaction_id: number | null }>>(
    `SELECT ${current.transactionId} AS transaction_id FROM ${current.queueTable} WHERE ${current.ruleId} = ? AND status = 'scheduled'`, recurringId,
  );
  for (const row of queued) {
    if (row.transaction_id === null) continue;
    const pending = await db.get<{ id: number }>(
      `SELECT id FROM ${current.transactionTable} WHERE id = ? AND COALESCE(zrealizowany, 0) NOT IN (1, '1', 'true')`,
      row.transaction_id,
    );
    if (pending) await deleteTransaction(db, kind, pending.id);
  }
  await db.run(`DELETE FROM ${current.queueTable} WHERE ${current.ruleId} = ?`, recurringId);
}

export async function dismissGeneratedOccurrence(db: AppDatabase, kind: RecurringOccurrenceKind, transactionId: number | string): Promise<void> {
  const current = config[kind];
  await db.run(`UPDATE ${current.queueTable} SET status = 'dismissed', ${current.transactionId} = NULL WHERE ${current.transactionId} = ?`, transactionId);
}

export async function customizeGeneratedOccurrence(db: AppDatabase, kind: RecurringOccurrenceKind, transactionId: number | string): Promise<void> {
  const current = config[kind];
  await db.run(`UPDATE ${current.queueTable} SET status = 'customized' WHERE ${current.transactionId} = ?`, transactionId);
}
