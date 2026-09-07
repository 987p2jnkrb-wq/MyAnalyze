import { fireEvent, render, screen, within } from "@testing-library/react";
import DataGrid from "./DataGrid";

describe("DataGrid summary", () => {
  beforeEach(() => localStorage.clear());

  it("sums all filtered pages without adding a selectable or sortable data row", () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({ id: index, name: index === 0 ? "Vinted" : "Pozostałe", amount: 10 }));
    render(<DataGrid
      gridId="summary-test" rows={rows} getRowId={(row) => row.id} defaultPageSize={10} selectable
      columns={[
        { key: "name", label: "Nazwa", value: (row) => row.name, summary: () => "Suma" },
        { key: "amount", label: "Kwota", value: (row) => row.amount, summary: (filtered) => filtered.reduce((sum, row) => sum + row.amount, 0) },
      ]}
    />);
    expect(within(screen.getByRole("row", { name: "Podsumowanie tabeli" })).getByText("120")).not.toBeNull();
    expect(within(screen.getByRole("row", { name: "Podsumowanie tabeli" })).queryByRole("checkbox")).toBeNull();
    fireEvent.change(within(screen.getByRole("toolbar", { name: "Narzędzia tabeli" })).getByRole("searchbox", { name: "Szukaj w tabeli" }), { target: { value: "Vinted" } });
    expect(within(screen.getByRole("row", { name: "Podsumowanie tabeli" })).getByText("10")).not.toBeNull();
  });

  it("leaves grids without configured summaries unchanged", () => {
    render(<DataGrid gridId="no-summary" rows={[{ id: 1 }]} getRowId={(row) => row.id} columns={[{ key: "id", label: "ID", value: (row) => row.id }]} />);
    expect(screen.queryByRole("row", { name: "Podsumowanie tabeli" })).toBeNull();
  });
});
