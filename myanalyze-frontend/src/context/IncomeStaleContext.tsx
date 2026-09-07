import React from "react";
import { type RecurringDraft, type RecurringModel, useRecurringResource } from "./useRecurringResource";

export type IncomeStale = RecurringModel;

type IncomeStaleContextType = {
  incomesStale: IncomeStale[];
  incomesStaleLoaded: boolean;
  incomesStaleError: string | null;
  addIncomeStale: (income: RecurringDraft) => Promise<void>;
  editIncomeStale: (id: number, income: RecurringDraft) => Promise<void>;
  deleteIncomeStale: (id: number) => Promise<void>;
  fetchIncomesStale: () => Promise<void>;
};

const IncomeStaleContext = React.createContext<IncomeStaleContextType | undefined>(undefined);

export const useIncomeStaleContext = () => {
  const context = React.useContext(IncomeStaleContext);
  if (!context) throw new Error("useIncomeStaleContext must be used within IncomeStaleProvider");
  return context;
};

export function IncomeStaleProvider({ children }: { children: React.ReactNode }) {
  const resource = useRecurringResource("/przychody_stale");
  return <IncomeStaleContext.Provider value={{ incomesStale: resource.rows, incomesStaleLoaded: resource.loaded, incomesStaleError: resource.error, addIncomeStale: resource.add, editIncomeStale: resource.edit, deleteIncomeStale: resource.remove, fetchIncomesStale: resource.fetchRows }}>{children}</IncomeStaleContext.Provider>;
}
