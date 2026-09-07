import { useContext } from "react";
import { AccountContextInstance } from "./AccountContextInstance";

export function useAccountContext() {
  const context = useContext(AccountContextInstance);
  if (!context) throw new Error("useAccountContext must be used within AccountProvider");
  return context;
}
