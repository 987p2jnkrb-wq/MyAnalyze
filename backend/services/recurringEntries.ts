import type { Database } from "sqlite";
import { normalizeRecurringPayload } from "../utils/financePayload";
import { removeAllocationsForPlan } from "./planAllocations";
import { removeRecurringOccurrenceQueue } from "./recurringOccurrenceQueue";
import { validateCustomTransactionType } from "./transactions";

export type RecurringEntryKind = "income" | "expense";
export class RecurringEntryError extends Error {}

const tableFor = (kind: RecurringEntryKind) => kind === "income" ? "przychody_stale" : "wydatki_stale";

export async function getRecurringEntries(db: Database, kind: RecurringEntryKind) {
  const table = tableFor(kind);
  if (kind === "expense") {
    return db.all(`SELECT recurring.*, custom_type.name AS custom_type_name,
      (SELECT plan.id FROM debt_plans plan WHERE plan.recurring_expense_id = recurring.id LIMIT 1) AS linked_debt_plan_id
      FROM ${table} recurring
      LEFT JOIN custom_transaction_types custom_type ON custom_type.id = recurring.custom_type_id
      ORDER BY recurring.id DESC`);
  }
  return db.all(`SELECT recurring.*, custom_type.name AS custom_type_name
    FROM ${table} recurring
    LEFT JOIN custom_transaction_types custom_type ON custom_type.id = recurring.custom_type_id
    ORDER BY recurring.id DESC`);
}

export async function createRecurringEntry(db: Database, kind: RecurringEntryKind, value: Record<string, unknown>) {
  const data = normalizeRecurringPayload(value);
  await validateCustomTransactionType(db, data.custom_type_id);
  const result = await db.run(
    `INSERT INTO ${tableFor(kind)} (nazwa, kwota, kategoria, custom_type_id, data_od, data_do, dzien_miesiaca) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [data.nazwa, data.kwota, data.kategoria, data.custom_type_id, data.data_od, data.data_do, data.dzien_miesiaca],
  );
  const rows = await getRecurringEntries(db, kind);
  return { id: Number(result.lastID), row: rows.find((row: { id: number }) => Number(row.id) === Number(result.lastID)) };
}

export async function updateRecurringEntry(db: Database, kind: RecurringEntryKind, id: number | string, value: Record<string, unknown>) {
  const data = normalizeRecurringPayload(value);
  await validateCustomTransactionType(db, data.custom_type_id);
  const result = await db.run(
    `UPDATE ${tableFor(kind)} SET nazwa = ?, kwota = ?, kategoria = ?, custom_type_id = ?, data_od = ?, data_do = ?, dzien_miesiaca = ? WHERE id = ?`,
    [data.nazwa, data.kwota, data.kategoria, data.custom_type_id, data.data_od, data.data_do, data.dzien_miesiaca, id],
  );
  if (!result.changes) throw new RecurringEntryError("Nie znaleziono wpisu stałego o podanym ID.");
  const rows = await getRecurringEntries(db, kind);
  return rows.find((row: { id: number }) => Number(row.id) === Number(id));
}

/**
 * Usuwa regułę recurring razem z jej wygenerowaną kolejką i allocations.
 * Zwraca false, gdy reguła już nie istnieje, dzięki czemu wewnętrzne cleanupy
 * mogą być idempotentne, a router może nadal zwrócić 404.
 */
export async function deleteRecurringEntry(db: Database, kind: RecurringEntryKind, id: number | string): Promise<boolean> {
  const existing = await db.get<{ id: number }>(`SELECT id FROM ${tableFor(kind)} WHERE id = ?`, id);
  if (!existing) return false;
  await removeRecurringOccurrenceQueue(db, kind, id);
  await removeAllocationsForPlan(db, kind, "recurring", Number(existing.id));
  const result = await db.run(`DELETE FROM ${tableFor(kind)} WHERE id = ?`, existing.id);
  return Boolean(result.changes);
}
