import { useContext } from "react";
import { ExpenseContext } from "./ExpenseContextInstance";

export const useExpenseContext = () => {
  const context = useContext(ExpenseContext);
  if (!context) {
    throw new Error("useExpenseContext must be used within ExpenseProvider");
  }
  return context;
};
