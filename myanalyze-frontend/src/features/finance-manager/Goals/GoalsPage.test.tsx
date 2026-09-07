import { render, screen } from "@testing-library/react";
import apiClient from "../../../utils/apiClient";
import GoalsPage from "./GoalsPage";

jest.mock("../../../utils/apiClient", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  apiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));
jest.mock("../../../components/DataGrid", () => ({ __esModule: true, default: () => <div>Grid celów</div> }));
jest.mock("../../../context/useAccountContext", () => ({ useAccountContext: () => ({ accounts: [], accountsLoaded: true }) }));
jest.mock("../../../context/useIncomeContext", () => ({ useIncomeContext: () => ({ incomes: [], incomesLoaded: true }) }));
jest.mock("../../../context/useExpenseContext", () => ({ useExpenseContext: () => ({ expenses: [], expensesLoaded: true }) }));
jest.mock("../../../context/IncomeStaleContext", () => ({ useIncomeStaleContext: () => ({ incomesStale: [], incomesStaleLoaded: true }) }));
jest.mock("../../../context/ExpenseStaleContext", () => ({ useExpenseStaleContext: () => ({ expensesStale: [], expensesStaleLoaded: true }) }));
jest.mock("../../../context/ToastContext", () => ({ useToast: () => ({ showToast: jest.fn() }) }));

const mockedGet = apiClient.get as jest.Mock;
const settings = { financial_floor: 1000, daily_living_budget: 0, prog_1: 1000, prog_2: 3000, prog_3: 5000, alokacja_1: 100, alokacja_2: 70, alokacja_3: 50 };

describe("GoalsPage loading", () => {
  beforeEach(() => mockedGet.mockReset());

  test("nie pokazuje wiarygodnie wyglądających domyślnych danych po częściowym błędzie", async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === "/financial-goals") return Promise.resolve({ data: [] });
      if (url === "/financial-goal-settings") return Promise.reject(new Error("offline"));
      return Promise.resolve({ data: [] });
    });

    render(<GoalsPage active />);

    expect(screen.getByRole("status")).not.toBeNull();
    expect(await screen.findByText("Nie można bezpiecznie wyświetlić modułu Celów")).not.toBeNull();
    expect(screen.queryByText("Realna płynność")).toBeNull();
  });

  test("pokazuje moduł dopiero po pobraniu wszystkich własnych zasobów", async () => {
    mockedGet.mockImplementation((url: string) => Promise.resolve({ data: url === "/financial-goal-settings" ? settings : [] }));

    render(<GoalsPage active />);

    expect(screen.getByRole("status")).not.toBeNull();
    expect(await screen.findByText("Realna płynność")).not.toBeNull();
    expect(screen.getByText("Grid celów")).not.toBeNull();
  });
});
