import { createContext } from "react";
import type { ExpenseContextType } from "./ExpenseContext";

export const ExpenseContext = createContext<ExpenseContextType | undefined>(undefined);
