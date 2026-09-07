import type { ReactNode } from "react";
import { ExpenseContext } from "./ExpenseContextInstance";
import { type TransactionDraft, type TransactionModel, useTransactionResource } from "./useTransactionResource";

export type Expense = TransactionModel;

export interface ExpenseContextType {
  expenses: Expense[];
  expensesLoaded: boolean;
  expensesError: string | null;
  addExpense: (expense: TransactionDraft) => Promise<void>;
  editExpense: (expense: Expense) => Promise<void>;
  deleteExpense: (id: number) => Promise<void>;
  fetchExpenses: () => Promise<void>;
}

export const ExpenseProvider = ({ children }: { children: ReactNode }) => {
  const resource = useTransactionResource("/wydatki");
  return <ExpenseContext.Provider value={{ expenses: resource.rows, expensesLoaded: resource.loaded, expensesError: resource.error, addExpense: resource.add, editExpense: resource.edit, deleteExpense: resource.remove, fetchExpenses: resource.fetchRows }}>{children}</ExpenseContext.Provider>;
};
