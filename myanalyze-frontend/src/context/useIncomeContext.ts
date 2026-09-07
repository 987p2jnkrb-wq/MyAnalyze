import { useContext } from "react";
import { IncomeContext } from "./IncomeContextInstance";

export const useIncomeContext = () => {
  const context = useContext(IncomeContext);
  if (!context) {
    throw new Error("useIncomeContext must be used within IncomeProvider");
  }
  return context;
};
