import { createContext } from "react";
import type { IncomeContextType } from "./IncomeContext";

export const IncomeContext = createContext<IncomeContextType | undefined>(undefined);
