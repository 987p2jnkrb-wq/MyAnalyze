import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { IncomeGrid } from "./TransactionsGrid";

jest.mock("../../utils/apiClient", () => ({
  __esModule: true,
  default: { get: jest.fn(() => new Promise(() => undefined)), patch: jest.fn() },
  apiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));
jest.mock("../../components/DataGrid", () => ({
  __esModule: true,
  default: ({ toolbar, columns }: { toolbar: ReactNode; columns: Array<{ key: string; edit?: { options?: Array<{ label: string }> } }> }) => <div>
    {toolbar}
    <div data-testid="inline-certainty-options">{columns.find((column) => column.key === "certainty")?.edit?.options?.map((option) => option.label).join("|")}</div>
  </div>,
}));
jest.mock("../../context/useIncomeContext", () => ({
  useIncomeContext: () => ({ incomes: [], incomesLoaded: true, incomesError: null, addIncome: jest.fn(), editIncome: jest.fn(), deleteIncome: jest.fn(), fetchIncomes: jest.fn(async () => undefined) }),
}));
jest.mock("../../context/IncomeStaleContext", () => ({ useIncomeStaleContext: () => ({ fetchIncomesStale: jest.fn(async () => undefined) }) }));
jest.mock("../../context/useExpenseContext", () => ({ useExpenseContext: () => ({ expenses: [] }) }));
jest.mock("../../context/useAccountContext", () => ({ useAccountContext: () => ({ accounts: [], fetchAccounts: jest.fn(async () => undefined) }) }));
jest.mock("../../context/ToastContext", () => ({ useToast: () => ({ showToast: jest.fn() }) }));

test("Pewny, Oczekiwany i Potencjalny są dostępne w formularzu i edycji inline przychodu", () => {
  render(<IncomeGrid />);

  expect(screen.getByTestId("inline-certainty-options").textContent).toBe("Pewny|Oczekiwany|Potencjalny");
  fireEvent.click(screen.getByRole("button", { name: "Dodaj przychód" }));
  const select = screen.getAllByRole("combobox").find((element) => Array.from((element as HTMLSelectElement).options).some((option) => option.value === "guaranteed")) as HTMLSelectElement;
  expect(Array.from(select.options).map((option) => option.text)).toEqual(["Pewny", "Oczekiwany", "Potencjalny"]);
});
