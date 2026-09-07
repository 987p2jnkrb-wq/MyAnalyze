import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import DataGrid, { DataGridSelectionScope, type DataGridColumn } from "./DataGrid";

interface Row { id: number; name: string; amount: number; }
interface FilterRow extends Row { category: string; }

const columns: DataGridColumn<Row>[] = [
  { key: "name", label: "Nazwa", value: (row) => row.name, edit: { value: (row) => row.name, update: (row, value) => ({ ...row, name: String(value) }) } },
  { key: "amount", label: "Kwota", value: (row) => row.amount, edit: { type: "number", value: (row) => row.amount, update: (row, value) => ({ ...row, amount: Number(value) }) } },
];

const filterColumns: DataGridColumn<FilterRow>[] = [
  { key: "name", label: "Nazwa", value: (row) => row.name },
  { key: "category", label: "Kategoria", value: (row) => row.category, filterable: true },
];

describe("DataGrid inline editing", () => {
  beforeEach(() => localStorage.clear());

  it("opens inline editing by clicking an editable cell and persists the draft", async () => {
    const onInlineSave = jest.fn(async () => undefined);
    render(<DataGrid gridId="cell-edit-test" rows={[{ id: 1, name: "Konto", amount: 10 }]} columns={columns} getRowId={(row) => row.id} onInlineSave={onInlineSave} />);

    expect(screen.queryByRole("button", { name: "Edytuj w wierszu" })).toBeNull();
    expect(screen.queryByText("Wygodny")).toBeNull();
    expect(screen.queryByRole("button", { name: "Resetuj widok" })).toBeNull();
    expect(screen.getByText("1 rekordów").closest("footer")).not.toBeNull();
    expect(screen.queryByText("Rekordów na stronę:")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Liczba rekordów na stronę" })).not.toBeNull();
    fireEvent.click(screen.getByTitle("Kliknij, aby edytować: Kwota"));
    const amountInput = screen.getByRole("textbox", { name: "Kwota - edycja wiersza 1" });
    fireEvent.change(amountInput, { target: { value: "25,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Zapisz zmiany w wierszu" }));

    await waitFor(() => expect(onInlineSave).toHaveBeenCalledWith({ id: 1, name: "Konto", amount: 25.5 }));
  });

  it("automatically saves an edited row when the user clicks outside the grid", async () => {
    const onInlineSave = jest.fn(async () => undefined);
    render(<div><DataGrid gridId="outside-save-test" rows={[{ id: 1, name: "Konto", amount: 10 }]} columns={columns} getRowId={(row) => row.id} onInlineSave={onInlineSave} /><button type="button">Tło strony</button></div>);

    fireEvent.click(screen.getByTitle("Kliknij, aby edytować: Kwota"));
    fireEvent.change(screen.getByRole("textbox", { name: "Kwota - edycja wiersza 1" }), { target: { value: "42.5" } });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Tło strony" }));

    await waitFor(() => expect(onInlineSave).toHaveBeenCalledWith({ id: 1, name: "Konto", amount: 42.5 }));
  });

  it("closes an untouched inline editor without reporting a save", async () => {
    const onInlineSave = jest.fn(async () => undefined);
    render(<div><DataGrid gridId="unchanged-save-test" rows={[{ id: 1, name: "Konto", amount: 10 }]} columns={columns} getRowId={(row) => row.id} onInlineSave={onInlineSave} /><button type="button">Tło strony</button></div>);

    fireEvent.click(screen.getByTitle("Kliknij, aby edytować: Nazwa"));
    fireEvent.pointerDown(screen.getByRole("button", { name: "Tło strony" }));

    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Nazwa - edycja wiersza 1" })).toBeNull());
    expect(onInlineSave).not.toHaveBeenCalled();
  });

  it("automatically saves an edited row when the user clicks another part of the grid", async () => {
    const onInlineSave = jest.fn(async () => undefined);
    render(<DataGrid gridId="inside-grid-save-test" rows={[{ id: 1, name: "Konto", amount: 10 }]} columns={columns} getRowId={(row) => row.id} onInlineSave={onInlineSave} />);

    fireEvent.click(screen.getByTitle("Kliknij, aby edytować: Kwota"));
    fireEvent.change(screen.getByRole("textbox", { name: "Kwota - edycja wiersza 1" }), { target: { value: "33.25" } });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Kolumny" }));

    await waitFor(() => expect(onInlineSave).toHaveBeenCalledWith({ id: 1, name: "Konto", amount: 33.25 }));
  });

  it("removes a persisted filter whose value no longer exists instead of hiding every row", async () => {
    localStorage.setItem("myanalyze.grid.invalid-filter-test.view", JSON.stringify({
      visible: ["name", "category"],
      order: ["name", "category"],
      sortKey: null,
      direction: "asc",
      filters: { category: "Nieistniejąca kategoria" },
    }));

    render(<DataGrid gridId="invalid-filter-test" rows={[{ id: 1, name: "Pensja", amount: 100, category: "Wynagrodzenie" }]} columns={filterColumns} getRowId={(row) => row.id} />);

    await waitFor(() => expect(screen.getByText("Pensja")).not.toBeNull());
    expect(screen.queryByText("0 z 1 rekordów")).toBeNull();
  });

  it("starts with a default filter even when an older saved view has empty filters", () => {
    localStorage.setItem("myanalyze.grid-default-filter-test.view", JSON.stringify({
      visible: ["name", "category"],
      order: ["name", "category"],
      sortKey: null,
      direction: "asc",
      filters: {},
    }));

    render(<DataGrid gridId="default-filter-test" rows={[
      { id: 1, name: "Plan", amount: 100, category: "Zaplanowane" },
      { id: 2, name: "Historia", amount: 50, category: "Zrealizowane" },
    ]} columns={filterColumns} getRowId={(row) => row.id} defaultFilters={{ category: "Zaplanowane" }} />);

    expect(screen.getByText("Plan")).not.toBeNull();
    expect(screen.queryByText("Historia")).toBeNull();
    expect(screen.getByRole("button", { name: "Filtry - aktywne: 1" })).not.toBeNull();
  });

  it("keeps a configured default filter available when no row currently has that value", () => {
    const statusColumns: DataGridColumn<FilterRow>[] = [
      filterColumns[0],
      { ...filterColumns[1], filterOptions: ["Zaplanowane", "Zrealizowane"] },
    ];
    render(<DataGrid gridId="empty-planned-filter-test" rows={[
      { id: 1, name: "Historia", amount: 50, category: "Zrealizowane" },
    ]} columns={statusColumns} getRowId={(row) => row.id} defaultFilters={{ category: "Zaplanowane" }} />);

    expect(screen.getByText("Brak danych do wyświetlenia.")).not.toBeNull();
    expect(screen.queryByText("Historia")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Filtry - aktywne: 1" }));
    expect(screen.getByRole("button", { name: "Zaplanowane" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Zrealizowane" })).not.toBeNull();
  });

  it("shows only one grid configuration panel at a time", () => {
    render(<DataGrid gridId="exclusive-panels-test" rows={[{ id: 1, name: "Pensja", amount: 100, category: "Wynagrodzenie" }]} columns={filterColumns} getRowId={(row) => row.id} />);

    fireEvent.click(screen.getByRole("button", { name: "Kolumny" }));
    expect(screen.getByRole("checkbox", { name: "Pokaż Nazwa" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Profile widoku" }));
    expect(screen.queryByRole("checkbox", { name: "Pokaż Nazwa" })).toBeNull();
    expect(screen.getByText("Aktywny profil")).not.toBeNull();
  });

  it("searches across columns and combines search with column filters", async () => {
    render(<DataGrid gridId="search-test" rows={[
      { id: 1, name: "Pensja", amount: 100, category: "Wynagrodzenie" },
      { id: 2, name: "Premia", amount: 50, category: "Wynagrodzenie" },
      { id: 3, name: "Zwrot", amount: 20, category: "Inne" },
    ]} columns={filterColumns} getRowId={(row) => row.id} />);

    const search = screen.getAllByRole("searchbox", { name: "Szukaj w tabeli" })[0];
    fireEvent.change(search, { target: { value: "Premia" } });
    expect(screen.getByText("Premia")).not.toBeNull();
    expect(screen.queryByText("Pensja")).toBeNull();

    fireEvent.change(search, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Filtry" }));
    fireEvent.click(screen.getByRole("button", { name: "Inne" }));
    await waitFor(() => expect(screen.getByText("Zwrot")).not.toBeNull());
    expect(screen.queryByText("Pensja")).toBeNull();
  });

  it("opens a highlighted multi-select filter from a column header context menu", async () => {
    render(<DataGrid gridId="context-filter-test" rows={[
      { id: 1, name: "Pensja", amount: 100, category: "Wynagrodzenie" },
      { id: 2, name: "Premia", amount: 50, category: "Wynagrodzenie" },
      { id: 3, name: "Zwrot", amount: 20, category: "Inne" },
      { id: 4, name: "Sprzedaż", amount: 30, category: "Sprzedaż" },
    ]} columns={filterColumns} getRowId={(row) => row.id} />);

    fireEvent.contextMenu(screen.getByRole("columnheader", { name: /Kategoria/ }), { clientX: 200, clientY: 100 });
    expect(screen.getByRole("menu", { name: "Filtr kolumny Kategoria" })).not.toBeNull();

    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Wynagrodzenie" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Inne" }));

    await waitFor(() => expect(screen.queryByRole("cell", { name: "Sprzedaż" })).toBeNull());
    expect(screen.getByRole("cell", { name: "Pensja" })).not.toBeNull();
    expect(screen.getByRole("cell", { name: "Premia" })).not.toBeNull();
    expect(screen.getByRole("cell", { name: "Zwrot" })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Filtruj kolumnę Kategoria/ }).className).toContain("bg-blue-600");
  });

  it("does not toggle a selectable row when the user is selecting text", () => {
    const getSelection = jest.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      toString: () => "Pierwszy",
    } as Selection);
    render(<DataGrid gridId="text-selection-test" rows={[{ id: 1, name: "Pierwszy", amount: 10 }]} columns={columns} getRowId={(row) => row.id} selectable />);

    fireEvent.click(screen.getByText("Pierwszy"));

    expect((screen.getByRole("checkbox", { name: "Zaznacz rekord 1" }) as HTMLInputElement).checked).toBe(false);
    getSelection.mockRestore();
  });

  it("selects the visible range between an anchor row and a Shift-clicked row", () => {
    render(<DataGrid gridId="range-selection-test" rows={[
      { id: 1, name: "Pierwszy", amount: 10 },
      { id: 2, name: "Drugi", amount: 20 },
      { id: 3, name: "Trzeci", amount: 30 },
      { id: 4, name: "Czwarty", amount: 40 },
      { id: 5, name: "Piąty", amount: 50 },
    ]} columns={columns} getRowId={(row) => row.id} selectable />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Zaznacz rekord 1" }));
    fireEvent.click(screen.getByText("Czwarty"), { shiftKey: true });

    for (const id of [1, 2, 3, 4]) expect((screen.getByRole("checkbox", { name: `Zaznacz rekord ${id}` }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Zaznacz rekord 5" }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText(/zaznaczono 4/)).not.toBeNull();
  });

  it("deletes only selected rows after one shared confirmation", async () => {
    const onDeleteSelected = jest.fn(async () => undefined);
    render(<DataGrid gridId="bulk-delete-test" rows={[
      { id: 1, name: "Pierwszy", amount: 10 },
      { id: 2, name: "Drugi", amount: 20 },
      { id: 3, name: "Trzeci", amount: 30 },
    ]} columns={columns} getRowId={(row) => row.id} selectable onDeleteSelected={onDeleteSelected} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Zaznacz rekord 1" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Zaznacz rekord 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Usuń zaznaczone (2)" }));

    expect(screen.getByText("Usuń zaznaczone rekordy (2)")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Usuń zaznaczone$/ }));

    await waitFor(() => expect(onDeleteSelected).toHaveBeenCalledWith([
      { id: 1, name: "Pierwszy", amount: 10 },
      { id: 3, name: "Trzeci", amount: 30 },
    ]));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Usuń zaznaczone (2)" })).toBeNull());
  });

  it("selects all filtered rows across pagination from the header checkbox", async () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({ id: index + 1, name: `Rekord ${index + 1}`, amount: index + 1 }));
    const onDeleteSelected = jest.fn(async () => undefined);
    render(<DataGrid gridId="all-filtered-selection-test" rows={rows} columns={columns} getRowId={(row) => row.id} selectable onDeleteSelected={onDeleteSelected} defaultPageSize={10} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Zaznacz wszystkie rekordy spełniające filtr" }));
    expect(screen.getByRole("button", { name: "Usuń zaznaczone (12)" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Usuń zaznaczone (12)" }));
    fireEvent.click(screen.getByRole("button", { name: /^Usuń zaznaczone$/ }));

    await waitFor(() => expect(onDeleteSelected).toHaveBeenCalledWith(rows));
  });

  it("does not select protected rows through a row, range or header selection", () => {
    const rows = [
      { id: 1, name: "Kredyt", amount: 10 },
      { id: 2, name: "Karta", amount: 20 },
      { id: 3, name: "Hipoteka", amount: 30 },
    ];
    render(<DataGrid gridId="protected-selection-test" rows={rows} columns={columns} getRowId={(row) => row.id} selectable isRowSelectable={(row) => row.name !== "Karta"} onDeleteSelected={async () => undefined} />);

    expect((screen.getByRole("checkbox", { name: "Zaznacz rekord 2" }) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Zaznacz wszystkie rekordy spełniające filtr" }));
    expect((screen.getByRole("checkbox", { name: "Zaznacz rekord 1" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Zaznacz rekord 2" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: "Zaznacz rekord 3" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("button", { name: "Usuń zaznaczone (2)" })).not.toBeNull();
  });

  it("clears selection when the surrounding tab scope changes", async () => {
    const rows = [{ id: 1, name: "Konto", amount: 10 }];
    const onDeleteSelected = jest.fn(async () => undefined);
    const { rerender } = render(<DataGridSelectionScope value="accounts"><DataGrid gridId="selection-scope-test" rows={rows} columns={columns} getRowId={(row) => row.id} selectable onDeleteSelected={onDeleteSelected} /></DataGridSelectionScope>);

    fireEvent.click(screen.getByRole("checkbox", { name: "Zaznacz rekord 1" }));
    expect(screen.getByRole("button", { name: "Usuń zaznaczone (1)" })).not.toBeNull();

    rerender(<DataGridSelectionScope value="expenses"><DataGrid gridId="selection-scope-test" rows={rows} columns={columns} getRowId={(row) => row.id} selectable onDeleteSelected={onDeleteSelected} /></DataGridSelectionScope>);

    await waitFor(() => expect((screen.getByRole("checkbox", { name: "Zaznacz rekord 1" }) as HTMLInputElement).checked).toBe(false));
    expect(screen.queryByRole("button", { name: "Usuń zaznaczone (1)" })).toBeNull();
  });

  it("adds a new default column to an older saved layout in its natural position", () => {
    localStorage.setItem("myanalyze.grid-schema-upgrade.view", JSON.stringify({
      visible: ["name", "amount"],
      order: ["name", "amount"],
      sortKey: null,
      direction: "asc",
      filters: {},
    }));
    const upgradedColumns: DataGridColumn<Row & { type: string }>[] = [
      { key: "name", label: "Nazwa", value: (row) => row.name },
      { key: "type", label: "Typ", value: (row) => row.type },
      { key: "amount", label: "Kwota", value: (row) => row.amount },
    ];

    render(<DataGrid gridId="schema-upgrade" rows={[{ id: 1, name: "Hipoteka", type: "Kredyt hipoteczny", amount: 10 }]} columns={upgradedColumns} getRowId={(row) => row.id} />);

    const headers = screen.getAllByRole("columnheader").map((header) => header.textContent?.trim());
    expect(headers).toEqual(["Nazwa", "Typ", "Kwota"]);
    expect(screen.getByText("Kredyt hipoteczny")).not.toBeNull();
  });

  it("sorts rows through a sortable column without changing the source order", () => {
    const sourceRows = [
      { id: 1, name: "Zulu", amount: 10 },
      { id: 2, name: "Alfa", amount: 20 },
    ];
    const sortableColumns: DataGridColumn<Row>[] = [
      { key: "name", label: "Nazwa", value: (row) => row.name, sortable: true },
      { key: "amount", label: "Kwota", value: (row) => row.amount },
    ];

    render(<DataGrid gridId="sorting-test" rows={sourceRows} columns={sortableColumns} getRowId={(row) => row.id} />);
    fireEvent.click(screen.getByRole("button", { name: /Nazwa/ }));

    const dataRows = screen.getAllByRole("row").slice(1);
    expect(dataRows[0].textContent).toContain("Alfa");
    expect(dataRows[1].textContent).toContain("Zulu");
    expect(sourceRows.map((row) => row.name)).toEqual(["Zulu", "Alfa"]);
  });

  it("paginates rows while keeping the footer controls stable", () => {
    const rows = Array.from({ length: 11 }, (_, index) => ({ id: index + 1, name: `Pozycja ${index + 1}`, amount: index + 1 }));

    render(<DataGrid gridId="pagination-test" rows={rows} columns={columns} getRowId={(row) => row.id} />);
    expect(screen.getByText("Pozycja 1")).not.toBeNull();
    expect(screen.queryByText("Pozycja 11")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "›" }));

    expect(screen.queryByText("Pozycja 1")).toBeNull();
    expect(screen.getByText("Pozycja 11")).not.toBeNull();
    expect(screen.getByText("Strona 2 z 2")).not.toBeNull();
  });

  it("saves and reapplies a column profile", () => {
    render(<DataGrid gridId="profile-test" rows={[{ id: 1, name: "Konto", amount: 10 }]} columns={columns} getRowId={(row) => row.id} />);

    fireEvent.click(screen.getByRole("button", { name: "Kolumny" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Pokaż Kwota" }));
    expect(screen.queryByRole("columnheader", { name: "Kwota" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Profile widoku" }));
    fireEvent.change(screen.getByPlaceholderText("Nazwa profilu"), { target: { value: "Bez kwoty" } });
    fireEvent.click(screen.getByRole("button", { name: "Zapisz" }));

    fireEvent.click(screen.getByRole("button", { name: "Kolumny" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Pokaż Kwota" }));
    expect(screen.getByRole("columnheader", { name: "Kwota" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Profile widoku" }));
    fireEvent.change(screen.getByLabelText("Aktywny profil"), { target: { value: "Bez kwoty" } });
    expect(screen.queryByRole("columnheader", { name: "Kwota" })).toBeNull();
  });
});
