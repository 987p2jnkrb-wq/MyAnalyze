import { render, screen } from "@testing-library/react";
import apiClient from "../../utils/apiClient";
import DebtPlansGrid from "./DebtPlansGrid";
import LoansPage from "./Loans/LoansPage";

jest.mock("../../utils/apiClient", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  apiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));
jest.mock("../../components/DataGrid", () => ({ __esModule: true, default: () => <div>Widok tabeli</div> }));
jest.mock("../../context/ToastContext", () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock("../../context/ExpenseStaleContext", () => ({
  useExpenseStaleContext: () => ({ expensesStale: [], fetchExpensesStale: jest.fn(async () => undefined) }),
}));
jest.mock("../../context/useAccountContext", () => ({
  useAccountContext: () => ({ accounts: [], fetchAccounts: jest.fn(async () => undefined) }),
}));

const mockedGet = apiClient.get as jest.Mock;

describe("jawne błędy ładowania produktów kredytowych", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedGet.mockRejectedValue(new Error("offline"));
  });

  test("Zobowiązania nie udają pustej tabeli po błędzie API", async () => {
    render(<DebtPlansGrid active />);

    expect((await screen.findByRole("alert")).textContent).toContain("Nie udało się pobrać zobowiązań");
    expect(screen.queryByText("Widok tabeli")).toBeNull();
  });

  test("Kredyty nie udają pustej tabeli po błędzie API", async () => {
    render(<LoansPage embedded active />);

    expect((await screen.findByRole("alert")).textContent).toContain("Nie udało się pobrać kredytów");
    expect(screen.queryByText("Widok tabeli")).toBeNull();
  });
});
