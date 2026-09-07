import { accountTypeLabel, accountTypes, canLinkToCreditProduct, displayedActualBalance, isCreditAccount, isVirtualWallet, parseAccount, toAccountPayload, validateAccount, withAvailableBalance } from "./accountModel";

describe("credit-card account rules", () => {
  const creditCard = { nazwa: "Karta", saldo_dostepne: 110.21, saldo_wlasciwe: -2890.79, typ_depozytu: "karta_kredytowa" };

  it("keeps the supported account-type contract aligned with backend accountType", () => {
    expect(accountTypes.map((item) => item.value)).toEqual(["gotowka", "karta_kredytowa", "konto", "wirtualny_portfel"]);
  });

  it("allows a negative actual balance for a credit card", () => {
    expect(validateAccount(creditCard)).toBeNull();
    expect(toAccountPayload(creditCard).saldo_wlasciwe).toBe(-2890.79);
  });

  it("recognizes legacy credit-card type labels", () => {
    expect(isCreditAccount({ typ_depozytu: "Karta Kredytowa" })).toBe(true);
  });

  it("treats a virtual wallet like an account but excludes it from credit products", () => {
    const wallet = { typ_depozytu: "wirtualny_portfel" };
    expect(isVirtualWallet(wallet)).toBe(true);
    expect(accountTypeLabel(wallet.typ_depozytu)).toBe("Wirtualny portfel");
    expect(isCreditAccount(wallet)).toBe(false);
    expect(canLinkToCreditProduct(wallet)).toBe(false);
    expect(canLinkToCreditProduct({ typ_depozytu: "konto" })).toBe(true);
    expect(canLinkToCreditProduct({ typ_depozytu: "gotowka" })).toBe(true);
  });

  it("does not overwrite credit-card debt when available credit changes", () => {
    expect(withAvailableBalance(creditCard, 210.21)).toEqual({ ...creditCard, saldo_dostepne: 210.21 });
  });

  it("preserves the explicit credit limit returned by the API", () => {
    const parsed = parseAccount({ id: 1, ...creditCard, limit_kredytowy: 3000, repayment_account_id: 2, repayment_account_name: "Konto główne" });
    expect(parsed.limit_kredytowy).toBe(3000);
    expect(parsed.repayment_account_id).toBe(2);
    expect(parsed.repayment_account_name).toBe("Konto główne");
  });

  it("sends the repayment relation only for a credit card", () => {
    expect(toAccountPayload({ ...creditCard, repayment_account_id: 2 }).repayment_account_id).toBe(2);
    expect(toAccountPayload({ ...creditCard, typ_depozytu: "konto", repayment_account_id: 2 }).repayment_account_id).toBeNull();
  });

  it("includes installment plans in the displayed actual balance", () => {
    expect(displayedActualBalance({ saldo_wlasciwe: -1601.63, installment_plan_debt: 1019.12 })).toBe(-582.51);
  });

  it("rejects a negative actual balance for a regular account", () => {
    expect(validateAccount({ ...creditCard, typ_depozytu: "konto" })).toBe("Ujemne saldo rzeczywiste jest dozwolone tylko dla karty kredytowej.");
  });
});
