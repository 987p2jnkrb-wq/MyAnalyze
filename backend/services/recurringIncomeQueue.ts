import { dbPromise } from "../db";
import { customizeGeneratedOccurrence, dismissGeneratedOccurrence, ensureRecurringOccurrenceQueue, nextRecurringOccurrenceDate, removeRecurringOccurrenceQueue, syncRecurringOccurrenceById, syncRecurringOccurrenceRule, type RecurringRule } from "./recurringOccurrenceQueue";

type AppDatabase = Awaited<typeof dbPromise>;
export const nextRecurringIncomeDate = nextRecurringOccurrenceDate;
export const syncRecurringIncomeRule = (db: AppDatabase, rule: RecurringRule, now = new Date()) => syncRecurringOccurrenceRule(db, "income", rule, now);
export const syncRecurringIncomeById = (db: AppDatabase, id: number | string, now = new Date()) => syncRecurringOccurrenceById(db, "income", id, now);
export const ensureRecurringIncomeQueue = (db?: AppDatabase, now = new Date()) => ensureRecurringOccurrenceQueue("income", db, now);
export const removeRecurringIncomeQueue = (db: AppDatabase, id: number | string) => removeRecurringOccurrenceQueue(db, "income", id);
export const dismissGeneratedIncome = (db: AppDatabase, id: number | string) => dismissGeneratedOccurrence(db, "income", id);
export const customizeGeneratedIncome = (db: AppDatabase, id: number | string) => customizeGeneratedOccurrence(db, "income", id);
