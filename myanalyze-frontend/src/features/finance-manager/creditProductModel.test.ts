import { CREDIT_PRODUCT_TYPES, calculateDebt, calculateInstallmentEndDate, calculateInstallmentProgress, calculateUsedCreditLimit, financialProductBadgeTone, isCreditCardType, optionalNumber, suggestedDebt, usesCalculatedDebt } from "./creditProductModel";

describe("credit product rules", () => {
  it("keeps the credit-product contract aligned with backend creditProduct", () => {
    expect([...CREDIT_PRODUCT_TYPES]).toEqual(["Kredyt", "Kredyt hipoteczny", "Karta kredytowa", "Plan ratalny"]);
  });

  it("uses distinct, semantic badge colors for the main financial product types", () => {
    expect(financialProductBadgeTone("Dług")).toBe("danger");
    expect(financialProductBadgeTone("Kredyt")).toBe("info");
    expect(financialProductBadgeTone("Kredyt hipoteczny")).toBe("success");
    expect(financialProductBadgeTone("Karta kredytowa")).toBe("violet");
    expect(financialProductBadgeTone("Plan ratalny")).toBe("warning");
  });

  it("suggests regular credit debt but keeps a manual correction", () => {
    expect(calculateDebt("Kredyt", 0, 127.39, 9)).toBe(1146.51);
    expect(calculateDebt("Kredyt", 9999, 127.39, 9)).toBe(9999);
    expect(suggestedDebt(100, 12)).toBe(1200);
    expect(calculateDebt("Plan ratalny", 0, 125, 8)).toBe(1000);
    expect(calculateDebt("Plan ratalny", 950, 125, 8)).toBe(950);
  });

  it("keeps mortgage and credit-card debt manual", () => {
    expect(calculateDebt("Kredyt hipoteczny", 250000, 2000, 240)).toBe(250000);
    expect(calculateDebt("Karta kredytowa", 1693.45, null, null)).toBe(1693.45);
    expect(usesCalculatedDebt("Kredyt hipoteczny")).toBe(false);
    expect(usesCalculatedDebt("Dług")).toBe(false);
    expect(isCreditCardType("Karta")).toBe(true);
  });

  it("maps a cleared numeric field to null instead of zero", () => {
    expect(optionalNumber("")).toBeNull();
    expect(optionalNumber("0")).toBe(0);
  });

  it("rounds the used credit-card limit to grosze", () => {
    expect(calculateUsedCreditLimit(3000, 1980.84)).toBe(1019.16);
    expect(calculateUsedCreditLimit(1000, 1200)).toBe(0);
  });

  it("calculates the last installment date and clamps short months", () => {
    expect(calculateInstallmentEndDate("2026-08-10", 12, null, "2026-08-01")).toBe("2027-07-10");
    expect(calculateInstallmentEndDate("2026-01-31", 2, null, "2026-01-01")).toBe("2026-02-28");
    expect(calculateInstallmentEndDate("2026-08-26", 12, 10, "2026-08-27")).toBe("2027-08-10");
    expect(calculateInstallmentEndDate("", 12)).toBe("");
  });

  it("suggests remaining installments for a credit started in the past", () => {
    expect(calculateInstallmentProgress("2026-04-27", 12, 27, "2026-08-27")).toEqual({
      elapsed: 4,
      remaining: 8,
      nextDueDate: "2026-08-27",
      contractEndDate: "2027-03-27",
    });
    expect(calculateInstallmentEndDate("2026-04-27", 8, 27, "2026-08-27")).toBe("2027-03-27");
    expect(calculateInstallmentEndDate("2026-04-27", 9, 27, "2026-08-27")).toBe("2027-04-27");
  });
});
