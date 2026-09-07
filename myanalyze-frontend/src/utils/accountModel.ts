import type { Account } from "../types/account";

// Keep account type semantics in sync with backend/utils/accountType.ts.
export const accountTypes = [
  { value: "gotowka", label: "Gotówka" },
  { value: "karta_kredytowa", label: "Karta kredytowa" },
  { value: "konto", label: "Konto" },
  { value: "wirtualny_portfel", label: "Wirtualny portfel" },
];

export const regularAccountTypes = accountTypes.filter((item) => item.value !== "karta_kredytowa");

type AccountValues = Omit<Account, "id">;

export function isCreditAccount(account: Pick<AccountValues, "typ_depozytu">): boolean {
  return String(account.typ_depozytu).trim().toLocaleLowerCase("pl-PL").includes("kredyt");
}

export function isVirtualWallet(account: Pick<AccountValues, "typ_depozytu">): boolean {
  return String(account.typ_depozytu).trim().toLocaleLowerCase("pl-PL").replace(/_/g, " ") === "wirtualny portfel";
}

export function canLinkToCreditProduct(account: Pick<AccountValues, "typ_depozytu">): boolean {
  return !isCreditAccount(account) && !isVirtualWallet(account);
}

export function accountTypeLabel(value: string): string {
  return accountTypes.find((item) => item.value === value)?.label ?? value;
}

export function parseAccount(value: Record<string, unknown>): Account {
  return {
    id: Number(value.id),
    nazwa: String(value.nazwa ?? ""),
    saldo_dostepne: Number(value.saldo_dostepne ?? 0),
    saldo_wlasciwe: Number(value.saldo_wlasciwe ?? 0),
    typ_depozytu: String(value.typ_depozytu ?? "konto"),
    currency: typeof value.currency === "string" ? value.currency : undefined,
    limit_kredytowy: value.limit_kredytowy == null ? null : Number(value.limit_kredytowy),
    repayment_account_id: value.repayment_account_id == null ? null : Number(value.repayment_account_id),
    repayment_account_name: value.repayment_account_name == null ? null : String(value.repayment_account_name),
    installment_plan_debt: Number(value.installment_plan_debt ?? 0),
    active: value.active === undefined || value.active === null ? true : value.active === true || Number(value.active) === 1,
  };
}

export function displayedActualBalance(account: Pick<Account, "saldo_wlasciwe" | "installment_plan_debt">): number {
  return Math.round((Number(account.saldo_wlasciwe || 0) + Number(account.installment_plan_debt || 0)) * 100) / 100;
}

export function withAvailableBalance<T extends AccountValues>(account: T, value: number): T {
  return { ...account, saldo_dostepne: value, saldo_wlasciwe: isCreditAccount(account) ? account.saldo_wlasciwe : value };
}

export function withAccountType<T extends AccountValues>(account: T, value: string): T {
  const next = { ...account, typ_depozytu: value };
  return {
    ...next,
    saldo_wlasciwe: isCreditAccount(next) ? account.saldo_wlasciwe : account.saldo_dostepne,
    repayment_account_id: isCreditAccount(next) ? account.repayment_account_id ?? null : null,
    repayment_account_name: isCreditAccount(next) ? account.repayment_account_name ?? null : null,
  };
}

export function toAccountPayload(account: AccountValues) {
  return {
    nazwa: account.nazwa.trim(),
    saldo_dostepne: Number(account.saldo_dostepne),
    saldo_wlasciwe: isCreditAccount(account) ? Number(account.saldo_wlasciwe) : Number(account.saldo_dostepne),
    typ_depozytu: account.typ_depozytu,
    institution_name: account.institution_name?.trim() || null,
    repayment_account_id: isCreditAccount(account) && account.repayment_account_id != null ? Number(account.repayment_account_id) : null,
    active: account.active !== false,
  };
}

export function validateAccount(account: AccountValues): string | null {
  if (!account.nazwa.trim()) return "Nazwa konta nie może być pusta.";
  const available = Number(account.saldo_dostepne);
  const actual = Number(account.saldo_wlasciwe);
  if (!Number.isFinite(available) || !Number.isFinite(actual)) return "Salda muszą być prawidłowymi liczbami.";
  if (available < 0) return "Saldo dostępne nie może być ujemne.";
  if (!isCreditAccount(account) && actual < 0) return "Ujemne saldo rzeczywiste jest dozwolone tylko dla karty kredytowej.";
  if (account.repayment_account_id != null && (!Number.isInteger(Number(account.repayment_account_id)) || Number(account.repayment_account_id) <= 0)) return "Wybierz prawidłowe konto spłacające kartę.";
  return null;
}
