import type { Database } from "sqlite";
import { removeTransferLinkForTransaction } from "./statementTransfer";
import { removeAllocationsForActual, removeAllocationsForPlan } from "./planAllocations";

export type TransactionKind = "income" | "expense";
export class TransactionServiceError extends Error {}

export function transactionTable(kind: TransactionKind): "przychody" | "wydatki" {
  return kind === "income" ? "przychody" : "wydatki";
}

export async function validateCustomTransactionType(db: Database, customTypeId: number | null): Promise<void> {
  if (customTypeId === null) return;
  if (!Number.isInteger(customTypeId) || !await db.get("SELECT id FROM custom_transaction_types WHERE id = ? AND active = 1", customTypeId)) {
    throw new TransactionServiceError("Nieprawidłowa etykieta.");
  }
}

export async function bulkUpdateTransactionClassification(db: Database, kind: TransactionKind, ids: number[], input: { customTypeId?: number | null; category?: string | null }): Promise<void> {
  if (input.customTypeId !== undefined) await validateCustomTransactionType(db, input.customTypeId);
  const fields: string[] = [];
  const values: unknown[] = [];
  if (input.category != null) { fields.push("kategoria = ?"); values.push(input.category); }
  if (input.customTypeId !== undefined) { fields.push("custom_type_id = ?"); values.push(input.customTypeId); }
  if (!fields.length || !ids.length) return;
  await db.run(`UPDATE ${transactionTable(kind)} SET ${fields.join(", ")} WHERE id IN (${ids.map(() => "?").join(",")})`, ...values, ...ids);
}


export async function moveImportedTransactionsToAccount(
  db: Database,
  kind: TransactionKind,
  ids: number[],
  accountId: number,
): Promise<void> {
  if (!ids.length || !Number.isInteger(accountId) || accountId <= 0) {
    throw new TransactionServiceError("Nieprawidłowa korekta konta.");
  }
  const account = await db.get<{ id: number }>("SELECT id FROM konta WHERE id = ?", accountId);
  if (!account) throw new TransactionServiceError("Nie znaleziono docelowego konta.");
  const uniqueIds = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (uniqueIds.length !== ids.length) throw new TransactionServiceError("Nieprawidłowe transakcje do korekty konta.");
  const placeholders = uniqueIds.map(() => "?").join(",");
  const rows = await db.all<Array<{ id: number; import_source: string | null }>>(
    `SELECT id, import_source FROM ${transactionTable(kind)} WHERE id IN (${placeholders})`,
    uniqueIds,
  );
  if (rows.length !== uniqueIds.length) throw new TransactionServiceError("Nie znaleziono jednej z transakcji.");
  if (rows.some((row) => !row.import_source)) {
    throw new TransactionServiceError("Tą korektą można przenosić tylko transakcje pochodzące bezpośrednio z importu.");
  }
  await db.run(
    `UPDATE ${transactionTable(kind)} SET account_id = ? WHERE id IN (${placeholders})`,
    accountId,
    ...uniqueIds,
  );
}

export async function deleteTransaction(db: Database, kind: TransactionKind, transactionId: number): Promise<void> {
  await removeTransferLinkForTransaction(db, kind, transactionId);
  await removeAllocationsForActual(db, kind, transactionId);
  await removeAllocationsForPlan(db, kind, "one_time", transactionId);
  await db.run(`DELETE FROM ${transactionTable(kind)} WHERE id = ?`, transactionId);
}
