import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import apiClient from "../../utils/apiClient";
import ConfigurationPage from "./ConfigurationPage";
import ModulesConfigTable from "./ModulesConfigTable";

const mockShowToast = jest.fn();

jest.mock("../../utils/apiClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    put: jest.fn(),
  },
}));
jest.mock("../../context/ToastContext", () => ({ useToast: () => ({ showToast: mockShowToast }) }));

const mockedApi = apiClient as jest.Mocked<typeof apiClient>;

const apiModules = [
  { key: "manager", name: "Manager Finansów", icon: "fa-solid fa-wallet", description: "Finanse", order_index: "1", route: "/manager", visible: "1" },
  { key: "logi", name: "Logi aplikacji", icon: "fa-solid fa-cog", description: "Logi", order_index: "2", route: "/app-activity-log", visible: "1" },
  { key: "config", name: "Konfiguracja", icon: "fa-solid fa-gear", description: "Ustawienia", order_index: "3", route: "/konfiguracja", visible: "1" },
];

describe("ModulesConfigTable", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    mockedApi.get.mockReset();
    mockedApi.put.mockReset();
    mockShowToast.mockReset();
    mockedApi.get.mockResolvedValue({ data: apiModules } as never);
    mockedApi.put.mockResolvedValue({ data: {} } as never);
  });

  it("uses the shared grid and saves name editing inline", async () => {
    render(<ModulesConfigTable />);

    await screen.findByText("Manager Finansów");
    expect(screen.getByRole("button", { name: "Kolumny" })).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "Opis" })).not.toBeNull();

    fireEvent.click(screen.getByText("Manager Finansów"));
    fireEvent.change(screen.getByRole("textbox", { name: "Nazwa — edycja wiersza manager" }), { target: { value: "Finanse domowe" } });
    fireEvent.click(screen.getByRole("button", { name: "Zapisz zmiany w wierszu" }));

    await waitFor(() => expect(mockedApi.put).toHaveBeenCalledWith(
      "/modules-config/manager",
      expect.objectContaining({ key: "manager", name: "Finanse domowe" }),
    ));
  });

  it("changes visibility and persists reordering atomically", async () => {
    render(<ModulesConfigTable />);
    await screen.findByText("Manager Finansów");

    fireEvent.click(screen.getAllByRole("button", { name: "Tak" })[0]);
    await waitFor(() => expect(mockedApi.put).toHaveBeenCalledWith(
      "/modules-config/manager",
      expect.objectContaining({ visible: "0" }),
    ));

    mockedApi.put.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Przesuń Manager Finansów niżej" }));

    await waitFor(() => expect(mockedApi.put).toHaveBeenCalledTimes(1));
    expect(mockedApi.put).toHaveBeenCalledWith("/modules-config/order", {
      updates: expect.arrayContaining([
        { key: "logi", order_index: 0 },
        { key: "manager", order_index: 1 },
      ]),
    });
  });

  it("shows settings in the shared grid and opens module DataGrid in a popup", async () => {
    render(<MemoryRouter><ConfigurationPage /></MemoryRouter>);

    expect(screen.getByText("Język aplikacji")).not.toBeNull();
    expect(screen.getByText("Motyw aplikacji")).not.toBeNull();
    expect(screen.getByText("Waluta domyślna")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Kolumny" })).not.toBeNull();

    fireEvent.change(screen.getByRole("combobox", { name: "Motyw aplikacji" }), { target: { value: "dark" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Imię użytkownika lub alias" }), { target: { value: "Mikołaj" } });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Zapisz ustawienia" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("myanalyze.theme")).toBe("dark");
    expect(localStorage.getItem("myanalyze.username")).toBe("Mikołaj");
    expect(mockShowToast).toHaveBeenCalledWith("Ustawienia aplikacji zostały zapisane.", "success");

    fireEvent.click(screen.getByRole("button", { name: "Zarządzaj modułami" }));
    await screen.findByText("Manager Finansów");
    expect(screen.getByRole("dialog", { name: "Zarządzaj modułami aplikacji" })).not.toBeNull();
    expect(screen.getAllByRole("button", { name: "Kolumny" })).toHaveLength(2);
  });
});
