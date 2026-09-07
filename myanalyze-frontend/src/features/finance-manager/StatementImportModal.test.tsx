import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import StatementImportModal from "./StatementImportModal";
import apiClient from "../../utils/apiClient";
import { readStatementFile } from "./statementImport";

jest.mock("../../utils/apiClient", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn() },
  apiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));
jest.mock("../../hooks/useCustomTransactionTypes", () => ({
  useCustomTransactionTypes: () => ({ activeRows: [] }),
}));
jest.mock("./statementImport", () => ({
  ...jest.requireActual("./statementImport"),
  readStatementFile: jest.fn(),
}));

const api = apiClient as jest.Mocked<typeof apiClient>;
const readFile = readStatementFile as jest.MockedFunction<typeof readStatementFile>;
const account = { id: 1, nazwa: "Portfel", saldo_dostepne: 0, saldo_wlasciwe: 0, typ_depozytu: "konto" };

async function openImport(csv: string) {
  readFile.mockResolvedValue(csv);
  const view = render(<StatementImportModal account={account} onClose={jest.fn()} onImported={async () => undefined} onSuccess={jest.fn()} />);
  fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [new File(["csv"], "statement.csv")] } });
  await screen.findByText("Sprawdź i importuj");
  return view;
}

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
  api.post.mockResolvedValue({ data: { duplicateSourceKeys: [] } });
});

it("recovers an unknown CSV layout through column mapping without saving transactions", async () => {
  readFile.mockResolvedValue("Kiedy;Suma;Napis\n05.09.2026;-23,50;Obiad");
  const view = render(<StatementImportModal account={account} onClose={jest.fn()} onImported={async () => undefined} onSuccess={jest.fn()} />);
  fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [new File(["csv"], "other.csv")] } });
  await screen.findByText(/Nie rozpoznano kolumn daty i kwoty/);
  fireEvent.click(screen.getByText("Dopasuj kolumny CSV — inny układ lub błędny podgląd"));
  fireEvent.change(screen.getByLabelText(/Data operacji/), { target: { value: "0" } });
  fireEvent.change(screen.getByLabelText(/Kwota ze znakiem/), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText(/Opis \/ nazwa/), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Zastosuj i sprawdź podgląd" }));
  expect(await screen.findByRole("checkbox", { name: "Importuj Obiad" })).toBeChecked();
  expect(screen.getByRole("button", { name: "Importuj 1" })).toBeEnabled();
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.post.mock.calls[0][0]).toContain("check-duplicates");
});

it("sorts and searches the preview without losing selected rows on other pages", async () => {
  await openImport(["Date;Amount;Currency;Description", ...Array.from({ length: 12 }, (_, index) => `2026-09-03;-${12 - index};PLN;Operacja ${index + 1}`)].join("\n"));
  expect(screen.getAllByRole("checkbox", { name: /^Importuj / })).toHaveLength(10);
  fireEvent.click(screen.getByRole("button", { name: "Kwota" }));
  expect(screen.getAllByRole("checkbox", { name: /^Importuj / })[0]).toHaveAccessibleName("Importuj Operacja 12");
  fireEvent.change(screen.getAllByRole("searchbox", { name: "Szukaj w tabeli" })[0], { target: { value: "Operacja 12" } });
  expect(screen.getAllByRole("checkbox", { name: /^Importuj / })).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Importuj 12" })).toBeEnabled();
});

it("compares both sides and stages the transfer without saving before import", async () => {
  api.post.mockImplementation(async (_url, payload) => ({ data: {
    duplicateSourceKeys: [],
    possibleOverlaps: [{ sourceKey: (payload as { transactions: Array<{ sourceKey: string }> }).transactions[0].sourceKey, reason: "own-transfer", kind: "income", transactionId: 9, accountName: "Bank", transactionName: "Wpływ z portfela", transactionDate: "2026-09-03", transactionAmount: 100 }],
  } }));
  await openImport("Date;Amount;Currency;Description\n2026-09-03;-100;PLN;Wypłata z portfela");
  fireEvent.click(screen.getByRole("button", { name: "Porównaj drugą stronę" }));
  const comparison = screen.getByRole("dialog", { name: "Porównaj sugerowany transfer" });
  expect(within(comparison).getByText("Wydatek")).toBeInTheDocument();
  expect(within(comparison).getByText("Przychód")).toBeInTheDocument();
  expect(within(comparison).getByText("Wpływ z portfela")).toBeInTheDocument();
  fireEvent.click(within(comparison).getByRole("button", { name: "Wybierz jako transfer własny" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Porównaj sugerowany transfer" })).not.toBeInTheDocument());
  expect(screen.getByRole("combobox", { name: "Sposób importu Wypłata z portfela" })).toHaveValue("transfer");
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.post.mock.calls[0][0]).toContain("check-duplicates");
});
