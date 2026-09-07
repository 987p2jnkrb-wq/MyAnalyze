import type { ReactNode } from "react";
import { IncomeContext } from "./IncomeContextInstance";
import { type TransactionDraft, type TransactionModel, useTransactionResource } from "./useTransactionResource";

export type Income = TransactionModel;

export interface IncomeContextType {
  incomes: Income[];
  incomesLoaded: boolean;
  incomesError: string | null;
  addIncome: (income: TransactionDraft) => Promise<void>;
  editIncome: (id: number, income: Omit<Income, "id">) => Promise<void>;
  deleteIncome: (id: number) => Promise<void>;
  fetchIncomes: () => Promise<void>;
}

export const IncomeProvider = ({ children }: { children: ReactNode }) => {
  const resource = useTransactionResource("/przychody");
  return <IncomeContext.Provider value={{ incomes: resource.rows, incomesLoaded: resource.loaded, incomesError: resource.error, addIncome: resource.add, editIncome: (id, income) => resource.edit({ id, ...income }), deleteIncome: resource.remove, fetchIncomes: resource.fetchRows }}>{children}</IncomeContext.Provider>;
};
