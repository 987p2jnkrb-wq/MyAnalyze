import { dbPromise } from "../db";
import { localDateKey } from "../utils/validation";
import { syncRecurringExpenseById } from "./recurringExpenseQueue";
import { deleteRecurringEntry } from "./recurringEntries";

type AppDatabase = Awaited<typeof dbPromise>;

export type RecurringExpenseSelection = {
  mode: "keep" | "none" | "create" | "link";
  expenseId?: number | null;
};

type RecurringExpenseData = {
  name: string;
  installment: number | null;
  startDate?: string | null;
  endDate?: string | null;
  paymentDay?: number | null;
};

export async function createRecurringCreditExpense(db: AppDatabase, {
  name,
  installment,
  startDate,
  endDate,
  paymentDay,
}: {
  name: string;
  installment: number;
  startDate?: string | null;
  endDate?: string | null;
  paymentDay?: number | null;
}): Promise<number> {
  const today = localDateKey();
  const day = Number.isInteger(paymentDay) && Number(paymentDay) >= 1 && Number(paymentDay) <= 31 ? Number(paymentDay) : 10;
  const result = await db.run(
    `INSERT INTO wydatki_stale (nazwa, kwota, kategoria, data_od, data_do, dzien_miesiaca)
     VALUES (?, ?, 'Inne', ?, ?, ?)`,
    [name, installment, startDate || today, endDate || null, day],
  );
  const expenseId = Number(result.lastID);
  await syncRecurringExpenseById(db, expenseId);
  return expenseId;
}

export async function updateRecurringCreditExpense(db: AppDatabase, expenseId: number, {
  name,
  installment,
  startDate,
  endDate,
  paymentDay,
}: {
  name: string;
  installment: number;
  startDate: string | null;
  endDate: string | null;
  paymentDay: number | null;
}): Promise<void> {
  await db.run(
    `UPDATE wydatki_stale SET nazwa = ?, kwota = ?,
     data_od = ?, data_do = ?, dzien_miesiaca = ?
     WHERE id = ?`,
    [name, installment, startDate, endDate, paymentDay, expenseId],
  );
  await syncRecurringExpenseById(db, expenseId);
}

export async function reconcileRecurringCreditExpense(
  db: AppDatabase,
  currentExpenseId: number | null,
  selection: RecurringExpenseSelection,
  data: RecurringExpenseData,
  debtPlanId?: number | string,
): Promise<number | null> {
  if (selection.mode === "keep") {
    if (currentExpenseId !== null && data.installment !== null && data.installment > 0) {
      const existing = await db.get<{ data_od: string; data_do: string | null; dzien_miesiaca: number }>(
        "SELECT data_od, data_do, dzien_miesiaca FROM wydatki_stale WHERE id = ?",
        currentExpenseId,
      );
      if (!existing) throw new Error("Powiązany stały wydatek już nie istnieje.");
      await updateRecurringCreditExpense(db, currentExpenseId, {
        name: data.name, installment: data.installment, startDate: data.startDate ?? existing.data_od,
        endDate: data.endDate ?? existing.data_do, paymentDay: data.paymentDay ?? Number(existing.dzien_miesiaca),
      });
    }
    return currentExpenseId;
  }

  if (selection.mode === "none") {
    if (currentExpenseId !== null) await deleteRecurringEntry(db, "expense", currentExpenseId);
    return null;
  }

  if (data.installment === null || data.installment <= 0) {
    throw new Error("Stały wydatek wymaga raty większej od zera.");
  }

  let targetId = currentExpenseId;
  if (selection.mode === "link") {
    targetId = Number(selection.expenseId);
    if (!Number.isInteger(targetId) || targetId <= 0) throw new Error("Wybierz istniejący stały wydatek.");
    const expense = await db.get<{ id: number }>("SELECT id FROM wydatki_stale WHERE id = ?", targetId);
    if (!expense) throw new Error("Wybrany stały wydatek już nie istnieje.");
    const linked = await db.get<{ id: number }>(
      `SELECT id FROM debt_plans WHERE recurring_expense_id = ?${debtPlanId === undefined ? "" : " AND id <> ?"}`,
      ...(debtPlanId === undefined ? [targetId] : [targetId, debtPlanId]),
    );
    if (linked) throw new Error("Ten stały wydatek jest już powiązany z innym zobowiązaniem.");
  }

  if (selection.mode === "create" && targetId === null) {
    targetId = await createRecurringCreditExpense(db, {
      name: data.name, installment: data.installment, startDate: data.startDate,
      endDate: data.endDate, paymentDay: data.paymentDay,
    });
  } else if (targetId !== null) {
    await updateRecurringCreditExpense(db, targetId, {
      name: data.name, installment: data.installment, startDate: data.startDate ?? null,
      endDate: data.endDate ?? null, paymentDay: data.paymentDay ?? null,
    });
  }

  if (currentExpenseId !== null && currentExpenseId !== targetId) {
    await deleteRecurringEntry(db, "expense", currentExpenseId);
  }
  return targetId;
}
