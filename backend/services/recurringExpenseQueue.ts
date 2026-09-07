import { dbPromise } from "../db";
import { customizeGeneratedOccurrence, dismissGeneratedOccurrence, ensureRecurringOccurrenceQueue, nextRecurringOccurrenceDate, removeRecurringOccurrenceQueue, syncRecurringOccurrenceById, syncRecurringOccurrenceRule, type RecurringRule } from "./recurringOccurrenceQueue";

type AppDatabase = Awaited<typeof dbPromise>;
export const nextRecurringExpenseDate = nextRecurringOccurrenceDate;
export const syncRecurringExpenseRule = (db: AppDatabase, rule: RecurringRule, now = new Date()) => syncRecurringOccurrenceRule(db, "expense", rule, now);
export const syncRecurringExpenseById = (db: AppDatabase, id: number | string, now = new Date()) => syncRecurringOccurrenceById(db, "expense", id, now);
export const ensureRecurringExpenseQueue = (db?: AppDatabase, now = new Date()) => ensureRecurringOccurrenceQueue("expense", db, now);
export const removeRecurringExpenseQueue = (db: AppDatabase, id: number | string) => removeRecurringOccurrenceQueue(db, "expense", id);
export const dismissGeneratedExpense = (db: AppDatabase, id: number | string) => dismissGeneratedOccurrence(db, "expense", id);
export const customizeGeneratedExpense = (db: AppDatabase, id: number | string) => customizeGeneratedOccurrence(db, "expense", id);
