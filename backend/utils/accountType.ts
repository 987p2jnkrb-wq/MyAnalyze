// Keep account type semantics in sync with myanalyze-frontend/src/utils/accountModel.ts.
function normalizedAccountType(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase("pl-PL").replace(/_/g, " ");
}

export function isCreditAccountType(value: unknown): boolean {
  return normalizedAccountType(value).includes("kredyt");
}

export function isVirtualWalletType(value: unknown): boolean {
  return normalizedAccountType(value) === "wirtualny portfel";
}

export function canLinkToCreditProduct(value: unknown): boolean {
  return !isCreditAccountType(value) && !isVirtualWalletType(value);
}

export function isSupportedAccountType(value: unknown): boolean {
  return ["konto", "gotowka", "gotówka", "karta kredytowa", "wirtualny portfel"].includes(normalizedAccountType(value));
}
