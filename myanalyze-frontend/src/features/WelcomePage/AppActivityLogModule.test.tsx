import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import apiClient from "../../utils/apiClient";
import AppActivityLogModule from "./AppActivityLogModule";

jest.mock("../../utils/apiClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockedApi = apiClient as jest.Mocked<typeof apiClient>;
const activityLog = {
  id: 7,
  action_type: "UPDATE_ACCOUNT",
  entity_type: "konta",
  timestamp: "2026-08-29T10:00:00.000Z",
  old_data: { nazwa: "Konto", saldo: 10 },
  new_data: { nazwa: "Konto", saldo: 20 },
  comment: "Zaktualizowano saldo.",
};

describe("AppActivityLogModule", () => {
  beforeEach(() => {
    mockedApi.get.mockReset();
    mockedApi.delete.mockReset();
    mockedApi.get.mockResolvedValue({ data: [activityLog] } as never);
    mockedApi.delete.mockResolvedValue({ data: {} } as never);
  });

  it("requires confirmation before deleting one log from its row", async () => {
    render(<MemoryRouter><AppActivityLogModule /></MemoryRouter>);

    await screen.findByText("Zaktualizowano saldo.");
    expect(screen.queryByRole("button", { name: /wyczyść widoczne/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Usuń log" }));
    expect(mockedApi.delete).not.toHaveBeenCalled();
    const confirmation = screen.getByRole("dialog", { name: "Usuń log aktywności" });

    fireEvent.click(within(confirmation).getByRole("button", { name: "Usuń log" }));
    await waitFor(() => expect(mockedApi.delete).toHaveBeenCalledWith("/app-activity-logs/7"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Usuń log aktywności" })).toBeNull());
  });

  it("offers bulk deletion only after selecting a log", async () => {
    render(<MemoryRouter><AppActivityLogModule /></MemoryRouter>);
    await screen.findByText("Zaktualizowano saldo.");

    expect(screen.queryByRole("button", { name: "Usuń zaznaczone (1)" })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Zaznacz rekord 7" }));
    fireEvent.click(screen.getByRole("button", { name: "Usuń zaznaczone (1)" }));

    expect(mockedApi.delete).not.toHaveBeenCalled();
    expect(screen.getByText(/Czy na pewno usunąć zaznaczony log/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Usuń zaznaczone$/ }));
    await waitFor(() => expect(mockedApi.delete).toHaveBeenCalledWith("/app-activity-logs/7"));
  });

  it("translates historical snapshot, goal values and boolean audit data", async () => {
    mockedApi.get.mockResolvedValue({ data: [{
      ...activityLog,
      id: 8,
      action_type: "DEBT_INSTALLMENT_PAYMENT",
      entity_type: "financial-period-snapshots",
      old_data: { status: "active", typ: "custom", include_account_balance: 0 },
      new_data: { status: "paused", typ: "car", include_account_balance: 1, data_dodania: "2026-08-01", dzien_miesiaca: 10, kapital: 500, account_id: 2, recurring_expense_id: 3 },
      comment: "Zmieniono status: „active” → „paused”; Zmieniono uwzględnianie salda depozytu: „0” → „1”.",
    }] } as never);

    render(<MemoryRouter><AppActivityLogModule /></MemoryRouter>);

    expect(await screen.findByText("Spłata raty zobowiązania")).not.toBeNull();
    expect(screen.getByText("Historia finansowa")).not.toBeNull();
    expect(screen.getByText(/Status: Wstrzymany/)).not.toBeNull();
    expect(screen.getByText(/Typ: Samochód/)).not.toBeNull();
    expect(screen.getByText(/Uwzględniaj saldo depozytu: Tak/)).not.toBeNull();
    expect(screen.getByText(/„Aktywny” → „Wstrzymany”/)).not.toBeNull();
    expect(screen.getByText(/„Nie” → „Tak”/)).not.toBeNull();
  });
});
