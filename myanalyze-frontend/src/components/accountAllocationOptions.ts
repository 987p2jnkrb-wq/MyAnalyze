import type { Account } from "../types/account";

export interface AllocationOption {
  id: number;
  label: string;
  availableAmount?: number;
  displayAmount?: number;
}

export function accountAllocationOptions(
  accounts: Account[],
  constrainByAvailableBalance: boolean,
  options: { includeInactive?: boolean } = {},
): AllocationOption[] {
  return accounts
    .filter((account) => options.includeInactive || account.active !== false)
    .map((account) => ({
    id: account.id,
    label: account.nazwa,
    displayAmount: Number(account.saldo_dostepne),
    availableAmount: constrainByAvailableBalance ? Math.max(0, Number(account.saldo_dostepne)) : undefined,
  }));
}
