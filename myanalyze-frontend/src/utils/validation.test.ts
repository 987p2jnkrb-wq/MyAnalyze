import { MAX_MONEY_AMOUNT, isValidDateOnly, localDateKey, validateDateRange, validateIntegerRange, validateNonNegativeMoney, validatePositiveMoney } from "./validation";

describe("shared form validation", () => {
  it("rejects calendar dates that only look like ISO dates", () => {
    expect(isValidDateOnly("2026-02-28")).toBe(true);
    expect(isValidDateOnly("2026-02-30")).toBe(false);
    expect(isValidDateOnly("2026-13-01")).toBe(false);
    expect(validateDateRange("2026-02-30")).toBeTruthy();
  });

  it("uses the local calendar day", () => {
    expect(localDateKey(new Date(2026, 7, 27, 0, 5))).toBe("2026-08-27");
  });

  it("validates money and bounded integers consistently", () => {
    expect(validatePositiveMoney(0)).toBeTruthy();
    expect(validatePositiveMoney(0.01)).toBeNull();
    expect(validatePositiveMoney(MAX_MONEY_AMOUNT)).toBeNull();
    expect(validatePositiveMoney(MAX_MONEY_AMOUNT + 0.01)).toContain("PLN");
    expect(validateNonNegativeMoney(0, "Saldo")).toBeNull();
    expect(validateNonNegativeMoney("10000000", "Saldo")).toContain("PLN");
    expect(validateIntegerRange(31, "Dzień", 1, 31)).toBeNull();
    expect(validateIntegerRange(32, "Dzień", 1, 31)).toBeTruthy();
  });
});
