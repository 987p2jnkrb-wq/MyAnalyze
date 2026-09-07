import { render, screen, waitFor } from "@testing-library/react";
import apiClient from "../../utils/apiClient";
import { useAccountContext } from "../../context/useAccountContext";
import { useExpenseContext } from "../../context/useExpenseContext";
import { useIncomeContext } from "../../context/useIncomeContext";
import { useExpenseStaleContext } from "../../context/ExpenseStaleContext";
import { useIncomeStaleContext } from "../../context/IncomeStaleContext";
import FinanceSummaryGrid from "./FinanceSummaryGrid";

jest.mock("../../utils/apiClient", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  apiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));
const mockShowToast = jest.fn();
jest.mock("../../context/ToastContext", () => ({ useToast: () => ({ showToast: mockShowToast }) }));
jest.mock("../../context/useAccountContext", () => ({ useAccountContext: jest.fn() }));
jest.mock("../../context/useExpenseContext", () => ({ useExpenseContext: jest.fn() }));
jest.mock("../../context/useIncomeContext", () => ({ useIncomeContext: jest.fn() }));
jest.mock("../../context/ExpenseStaleContext", () => ({ useExpenseStaleContext: jest.fn() }));
jest.mock("../../context/IncomeStaleContext", () => ({ useIncomeStaleContext: jest.fn() }));

const mockedApi = apiClient as jest.Mocked<typeof apiClient>;
const mockedAccounts = useAccountContext as jest.MockedFunction<typeof useAccountContext>;
const mockedExpenses = useExpenseContext as jest.MockedFunction<typeof useExpenseContext>;
const mockedIncomes = useIncomeContext as jest.MockedFunction<typeof useIncomeContext>;
const mockedRecurringExpenses = useExpenseStaleContext as jest.MockedFunction<typeof useExpenseStaleContext>;
const mockedRecurringIncomes = useIncomeStaleContext as jest.MockedFunction<typeof useIncomeStaleContext>;
const retry = jest.fn(async () => undefined);

function mockResources({ loaded, accountError = null }: { loaded: boolean; accountError?: string | null }) {
  mockedAccounts.mockReturnValue({ accounts: [], accountsLoaded: loaded, accountsError: accountError, fetchAccounts: jest.fn(async () => []) });
  mockedIncomes.mockReturnValue({ incomes: [], incomesLoaded: loaded, incomesError: null, addIncome: retry, editIncome: retry, deleteIncome: retry, fetchIncomes: retry });
  mockedExpenses.mockReturnValue({ expenses: [], expensesLoaded: loaded, expensesError: null, addExpense: retry, editExpense: retry, deleteExpense: retry, fetchExpenses: retry });
  mockedRecurringIncomes.mockReturnValue({ incomesStale: [], incomesStaleLoaded: loaded, incomesStaleError: null, addIncomeStale: retry, editIncomeStale: retry, deleteIncomeStale: retry, fetchIncomesStale: retry });
  mockedRecurringExpenses.mockReturnValue({ expensesStale: [], expensesStaleLoaded: loaded, expensesStaleError: null, addExpenseStale: retry, editExpenseStale: retry, deleteExpenseStale: retry, fetchExpensesStale: retry });
}

describe("FinanceSummaryGrid loading", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.get.mockImplementation(async (url) => ({ data: url === "/financial-goal-settings"
      ? { financial_floor: 1000, daily_living_budget: 50, payday_cycle_start_day: 10 }
      : [] }) as never);
  });

  it("does not present zero values before all financial resources are loaded", async () => {
    mockResources({ loaded: false });
    render(<FinanceSummaryGrid active />);
    expect(screen.getByRole("status").textContent).toContain("Ładowanie Podsumowania");
    expect(screen.queryByText("Rzeczywiste środki")).toBeNull();
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledWith("/financial-period-snapshots"));
  });

  it("shows an explicit error instead of treating a failed resource as an empty dataset", async () => {
    mockResources({ loaded: true, accountError: "Nie udało się pobrać depozytów." });
    render(<FinanceSummaryGrid active />);
    expect((await screen.findByRole("alert")).textContent).toContain("Nie można bezpiecznie wyświetlić Podsumowania");
    expect(screen.getByRole("alert").textContent).toContain("Nie udało się pobrać depozytów");
  });

  it("refreshes recurring overrides when transactions change and when returning to Summary", async () => {
    mockResources({ loaded: true });
    const refreshExpenses = jest.fn(async () => undefined);
    const recurring = mockedRecurringExpenses();
    mockedRecurringExpenses.mockReturnValue({ ...recurring, fetchExpensesStale: refreshExpenses });
    const expenses = mockedExpenses();
    const { rerender } = render(<FinanceSummaryGrid active />);
    await waitFor(() => expect(refreshExpenses).toHaveBeenCalledTimes(1));
    mockedExpenses.mockReturnValue({ ...expenses, expenses: [{ id: 246, name: "nju", amount: 31, category: "", addedAt: "2026-09-10", zrealizowany: false, generatedFromRecurring: true, recurringQueueStatus: "customized" }] });
    rerender(<FinanceSummaryGrid active />);
    await waitFor(() => expect(refreshExpenses).toHaveBeenCalledTimes(2));
    rerender(<FinanceSummaryGrid active={false} />);
    rerender(<FinanceSummaryGrid active />);
    await waitFor(() => expect(refreshExpenses).toHaveBeenCalledTimes(3));
  });
});
