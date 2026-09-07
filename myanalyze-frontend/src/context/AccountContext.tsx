import React from "react";
import type { Account } from "../types/account";
import apiClient from "../utils/apiClient";
import { parseAccount } from "../utils/accountModel";
import { AccountContextInstance } from "./AccountContextInstance";
import { useLatestRequestGuard } from "../hooks/useLatestRequestGuard";

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [accountsLoaded, setAccountsLoaded] = React.useState(false);
  const [accountsError, setAccountsError] = React.useState<string | null>(null);
  const { begin: beginRequest, isLatest: isLatestRequest } = useLatestRequestGuard();

  const fetchAccounts = React.useCallback(async () => {
    const requestVersion = beginRequest();
    try {
      const response = await apiClient.get("/konta");
      const next = Array.isArray(response.data) ? response.data.map(parseAccount) : [];
      if (isLatestRequest(requestVersion)) {
        setAccounts(next);
        setAccountsError(null);
      }
      return next;
    } catch (error) {
      if (isLatestRequest(requestVersion)) setAccountsError("Nie udało się pobrać depozytów.");
      throw error;
    } finally {
      if (isLatestRequest(requestVersion)) setAccountsLoaded(true);
    }
  }, [beginRequest, isLatestRequest]);

  React.useEffect(() => { void fetchAccounts().catch((error) => console.error("Nie udało się pobrać depozytów:", error)); }, [fetchAccounts]);

  return <AccountContextInstance.Provider value={{ accounts, accountsLoaded, accountsError, fetchAccounts }}>{children}</AccountContextInstance.Provider>;
}
