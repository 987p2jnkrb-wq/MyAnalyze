import { formatCurrency, formatDate, formatPercentage } from "./formatters";

describe("formatCurrency", () => {
  beforeEach(() => localStorage.clear());
  it("does not hide invalid data as a zero balance", () => {
    expect(formatCurrency("błędna wartość")).toBe("-");
  });

  it("uses the selected display currency without converting the value", () => {
    localStorage.setItem("myanalyze.currency", "EUR");
    const rendered = formatCurrency(1000);
    expect(rendered).toContain("€");
    expect(rendered).not.toContain("PLN");
  });

  it("does not normalize an invalid calendar date into another day", () => {
    expect(formatDate("2026-02-30")).toBe("2026-02-30");
  });

  it("formats percentage consistently and accepts a decimal comma", () => {
    expect(formatPercentage("10,25")).toBe("10,25%");
    expect(formatPercentage("brak")).toBe("-");
  });
});
