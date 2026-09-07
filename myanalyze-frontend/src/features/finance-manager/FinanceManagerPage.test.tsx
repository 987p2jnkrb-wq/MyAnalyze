import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import FinanceManagerPage from "./FinanceManagerPage";

jest.mock("../../utils/apiClient", () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock("./AccountsGrid", () => () => <div>Konta panel</div>);
jest.mock("./TransactionsGrid", () => ({ IncomeGrid: () => <div>Przychody panel</div>, ExpenseGrid: () => <div>Wydatki panel</div> }));
jest.mock("./RecurringEntriesGrid", () => ({ RecurringIncomeGrid: () => <div>Stałe przychody panel</div>, RecurringExpenseGrid: () => <div>Stałe wydatki panel</div> }));
jest.mock("./DebtPlansGrid", () => ({ active }: { active?: boolean }) => <div data-active={String(Boolean(active))}>Zobowiązania panel</div>);
jest.mock("./Loans/LoansPage", () => ({ active }: { active?: boolean }) => <div data-active={String(Boolean(active))}>Kredyty panel</div>);
jest.mock("./FinanceSummaryGrid", () => ({ view, onViewChange }: { view: "general" | "period" | "month"; onViewChange: (view: "general" | "period" | "month") => void }) => <div><div role="tablist" aria-label="Rodzaj podsumowania"><button role="tab" aria-selected={view === "general"} onClick={() => onViewChange("general")}>Ogólne</button><button role="tab" aria-selected={view === "period"} onClick={() => onViewChange("period")}>Okres</button><button role="tab" aria-selected={view === "month"} onClick={() => onViewChange("month")}>Miesiąc</button></div><div>{view === "month" ? "Miesiąc panel" : "Podsumowanie panel"}</div></div>);
jest.mock("./Goals", () => ({ active }: { active?: boolean }) => <div data-active={String(Boolean(active))}>Cele panel</div>);
jest.mock("./MonthViewGrid", () => () => <div>Miesiąc panel</div>);

describe("FinanceManagerPage tabs", () => {
  beforeEach(() => localStorage.clear());

  it("uses the URL as the single source of the active tab", () => {
    render(<MemoryRouter initialEntries={["/manager?tab=accounts"]}><FinanceManagerPage /></MemoryRouter>);
    const accounts = screen.getByRole("tab", { name: "Depozyty" });
    const incomes = screen.getByRole("tab", { name: "Przychody" });
    expect(accounts.getAttribute("aria-selected")).toBe("true");
    fireEvent.click(incomes);
    expect(incomes.getAttribute("aria-selected")).toBe("true");
    expect(accounts.getAttribute("aria-selected")).toBe("false");
    expect(screen.getByText("Przychody panel").closest("section")?.hasAttribute("hidden")).toBe(false);
    expect(screen.queryByText("Konta panel")).toBeNull();
    expect(screen.getByRole("button", { name: "Pobierz CSV" })).not.toBeNull();
  });

  it("groups current and recurring entries under one income tab", () => {
    render(<MemoryRouter initialEntries={["/manager?tab=incomes"]}><FinanceManagerPage /></MemoryRouter>);
    expect(screen.queryByRole("tab", { name: "Stałe przychody" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Bieżące" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Przychody panel")).not.toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Stałe" }));
    expect(screen.getByRole("tab", { name: "Stałe" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Stałe przychody panel")).not.toBeNull();
    expect(screen.queryByText("Przychody panel")).toBeNull();
  });

  it("keeps Zobowiązania and Kredyty as separate tabs", () => {
    render(<MemoryRouter initialEntries={["/manager?tab=debt-plans"]}><FinanceManagerPage /></MemoryRouter>);
    const debtPlans = screen.getByRole("tab", { name: "Zobowiązania" });
    const credits = screen.getByRole("tab", { name: "Kredyty" });
    expect(debtPlans.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Zobowiązania panel").closest("section")?.hasAttribute("hidden")).toBe(false);
    expect(screen.getByText("Zobowiązania panel").getAttribute("data-active")).toBe("true");
    expect(screen.getByText("Kredyty panel").getAttribute("data-active")).toBe("false");
    fireEvent.click(credits);
    expect(credits.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Kredyty panel").closest("section")?.hasAttribute("hidden")).toBe(false);
    expect(screen.getByText("Zobowiązania panel").closest("section")?.hasAttribute("hidden")).toBe(true);
    expect(screen.getByText("Kredyty panel").getAttribute("data-active")).toBe("true");
    expect(screen.getByText("Zobowiązania panel").getAttribute("data-active")).toBe("false");
  });

  it("opens Goals as a separate manager tab", () => {
    render(<MemoryRouter initialEntries={["/manager?tab=goals"]}><FinanceManagerPage /></MemoryRouter>);
    expect(screen.getByRole("tab", { name: "Cele" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Cele panel").closest("section")?.hasAttribute("hidden")).toBe(false);
  });

  it("opens the legacy monthly URL as a subtab of summary", () => {
    render(<MemoryRouter initialEntries={["/manager?tab=month"]}><FinanceManagerPage /></MemoryRouter>);
    expect(screen.getByRole("tab", { name: "Podsumowanie" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Miesiąc" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Miesiąc panel").closest("section")?.hasAttribute("hidden")).toBe(false);
  });
});
