import { createContext } from "react";
import type { Account } from "../types/account";

export interface AccountContextValue {
  accounts: Account[];
  accountsLoaded: boolean;
  accountsError: string | null;
  fetchAccounts: () => Promise<Account[]>;
}

export const AccountContextInstance = createContext<AccountContextValue | undefined>(undefined);
