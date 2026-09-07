import React from "react";
import { type RecurringDraft, type RecurringModel, useRecurringResource } from "./useRecurringResource";

export type ExpenseStale = RecurringModel;

export type ExpenseStaleContextType = {
  expensesStale: ExpenseStale[];
  expensesStaleLoaded: boolean;
  expensesStaleError: string | null;
  addExpenseStale: (expense: RecurringDraft) => Promise<void>;
  editExpenseStale: (id: number, expense: RecurringDraft) => Promise<void>;
  deleteExpenseStale: (id: number) => Promise<void>;
  fetchExpensesStale: () => Promise<void>;
};

const ExpenseStaleContext = React.createContext<ExpenseStaleContextType | undefined>(undefined);

export const useExpenseStaleContext = () => {
  const context = React.useContext(ExpenseStaleContext);
  if (!context) throw new Error("useExpenseStaleContext must be used within ExpenseStaleProvider");
  return context;
};

export function ExpenseStaleProvider({ children }: { children: React.ReactNode }) {
  const resource = useRecurringResource("/wydatki_stale");
  return <ExpenseStaleContext.Provider value={{ expensesStale: resource.rows, expensesStaleLoaded: resource.loaded, expensesStaleError: resource.error, addExpenseStale: resource.add, editExpenseStale: resource.edit, deleteExpenseStale: resource.remove, fetchExpensesStale: resource.fetchRows }}>{children}</ExpenseStaleContext.Provider>;
}
