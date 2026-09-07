import { fireEvent, render, screen, within } from "@testing-library/react";
import MonthViewGrid from "./MonthViewGrid";

jest.mock("../../context/useIncomeContext", () => ({
  useIncomeContext: () => ({ incomes: [{ id: 1, name: "Premia", amount: 500, category: "Premia", addedAt: "2026-08-05", zrealizowany: false }] }),
}));
jest.mock("../../context/useExpenseContext", () => ({
  useExpenseContext: () => ({ expenses: [{ id: 2, name: "Zakupy", amount: 200, category: "Jedzenie", addedAt: "2026-08-04", zrealizowany: false }] }),
}));
jest.mock("../../context/IncomeStaleContext", () => ({ useIncomeStaleContext: () => ({ incomesStale: [] }) }));
jest.mock("../../context/ExpenseStaleContext", () => ({ useExpenseStaleContext: () => ({ expensesStale: [] }) }));

describe("MonthViewGrid details", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 7, 25, 12));
  });

  afterEach(() => jest.useRealTimers());

  it("uses KPI cards to switch the table between expenses, incomes and balance", () => {
    render(<MonthViewGrid />);

    expect(screen.getByRole("columnheader", { name: /^Wynik netto/ })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Wydatki · wykonanie/ }));
    expect(screen.getByRole("columnheader", { name: /Etykieta wydatku/ })).not.toBeNull();
    expect(screen.getByText("Jedzenie")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Przychody · wykonanie/ }));
    expect(screen.getByRole("columnheader", { name: /Etykieta przychodu/ })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: /^Pewne/ })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: /^Oczekiwane/ })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: /^Potencjalne/ })).not.toBeNull();
    expect(screen.getByText("Premia")).not.toBeNull();
    expect(screen.getByRole("button", { name: /Przychody · wykonanie/ }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: /Wynik miesiąca/ }));
    expect(screen.getByRole("columnheader", { name: /^Wynik netto/ })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: /^Wynik po realizacji planu/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Wynik miesiąca/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText(/Planowany bilans:/)).toBeNull();
    expect(screen.queryByText(/^Różnica:/)).toBeNull();
    expect(screen.queryByText(/Odchylenie:/)).toBeNull();

    expect(screen.getByText("Jedzenie")).not.toBeNull();
    expect(screen.getByText("Premia")).not.toBeNull();
  });

  it("opens both executed directions for one label without plans or transfers", () => {
    const common = { customTypeId: 4, customTypeName: "Vinted", category: "", addedAt: "2026-08-20", zrealizowany: true, importSource: "CSV" };
    render(<MonthViewGrid
      filteredIncomes={[{ ...common, id: 10, name: "Sprzedaż", amount: 200 }, { ...common, id: 11, name: "Transfer", amount: 900, transferLinkId: 1 }]}
      filteredExpenses={[{ ...common, id: 10, name: "Zakup", amount: 50 }]}
    />);
    fireEvent.click(screen.getByRole("button", { name: "Wynik netto: Vinted" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("Sprzedaż")).not.toBeNull();
    expect(dialog.getByText("Zakup")).not.toBeNull();
    expect(dialog.queryByText("Transfer")).toBeNull();
    expect(dialog.getByText(/Wynik netto:/).textContent).toContain("150,00");
  });

  it("shows the remaining amount instead of the original partially covered plan", () => {
    render(<MonthViewGrid filteredExpenses={[{ id: 20, name: "Czynsz częściowo opłacony", amount: 1000, allocatedToPlan: 400, category: "", customTypeId: null, addedAt: "2026-08-02", zrealizowany: false }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Pokaż nierozliczone wydatki" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("Czynsz częściowo opłacony")).not.toBeNull();
    expect(dialog.getByText(/Suma:/).textContent).toContain("600,00");
  });
});
