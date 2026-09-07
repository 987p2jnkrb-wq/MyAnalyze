import React from "react";
import Button from "../../components/Button";
import DataGrid, { type DataGridColumn } from "../../components/DataGrid";
import ModuleBadge from "../../components/ModuleBadge";
import { useToast } from "../../context/ToastContext";
import type { CustomTransactionType } from "../../types/customTransactionType";
import apiClient, { apiErrorMessage } from "../../utils/apiClient";
import { useCustomTransactionTypes } from "../../hooks/useCustomTransactionTypes";

export default function CustomTransactionTypesConfig() {
  const { rows, loading, refresh } = useCustomTransactionTypes();
  const [name, setName] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const { showToast } = useToast();
  const columns = React.useMemo<DataGridColumn<CustomTransactionType>[]>(() => [
    {
      key: "name", label: "Nazwa etykiety", value: (row) => row.name,
      sortable: true, width: 320,
      edit: { type: "text", value: (row) => row.name, update: (row, value) => ({ ...row, name: String(value) }) },
    },
    {
      key: "active", label: "Status", value: (row) => row.active ? "Aktywna" : "Nieaktywna",
      sortable: true, filterable: true, width: 180,
      render: (row) => <ModuleBadge tone={row.active ? "success" : "neutral"}>{row.active ? "Aktywna" : "Nieaktywna"}</ModuleBadge>,
      edit: {
        type: "select", value: (row) => row.active ? "active" : "inactive",
        options: [{ value: "active", label: "Aktywna" }, { value: "inactive", label: "Nieaktywna" }],
        update: (row, value) => ({ ...row, active: value === "active" }),
      },
    },
  ], []);

  const add = async () => {
    if (!name.trim() || adding) return;
    setAdding(true);
    try {
      await apiClient.post("/custom-transaction-types", { name: name.trim() });
      setName("");
      await refresh();
      showToast("Dodano etykietę.", "success");
    } catch (error) {
      showToast(apiErrorMessage(error, "Nie udało się dodać etykiety."), "error");
    } finally { setAdding(false); }
  };

  const save = async (row: CustomTransactionType) => {
    try {
      await apiClient.put(`/custom-transaction-types/${row.id}`, { name: row.name.trim(), active: row.active });
      await refresh();
      showToast("Zapisano etykietę.", "success");
    } catch (error) {
      throw new Error(apiErrorMessage(error, "Nie udało się zapisać etykiety."));
    }
  };

  return <div className="space-y-4">
    <p className="text-sm text-slate-600">Etykiety są wspólne dla przychodów i wydatków. Zmiana nazwy zachowuje przypisania do transakcji. Nieaktywna etykieta pozostaje w historii, ale nie jest dostępna do nowych przypisań.</p>
    <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void add(); }}>
      <input aria-label="Nazwa etykiety" required maxLength={80} disabled={adding} className="min-w-56 flex-1 rounded-lg border border-slate-300 px-3 py-2" placeholder="np. Vinted" value={name} onChange={(event) => setName(event.target.value)} />
      <Button type="submit" tone="primary" disabled={adding || !name.trim()}>{adding ? "Dodawanie…" : "Dodaj etykietę"}</Button>
    </form>
    <DataGrid<CustomTransactionType>
      gridId="configuration-transaction-labels"
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      loading={loading}
      defaultSort={{ key: "name", direction: "asc" }}
      defaultPageSize={10}
      emptyMessage="Brak etykiet. Dodaj pierwszą powyżej."
      onInlineSave={save}
      validateInlineRow={(row) => !row.name.trim() ? "Podaj nazwę etykiety." : row.name.trim().length > 80 ? "Nazwa etykiety może mieć maksymalnie 80 znaków." : null}
      refresh={{ onRefresh: async () => { try { await refresh(); } catch (error) { showToast(apiErrorMessage(error, "Nie udało się odświeżyć etykiet."), "error"); } }, refreshing: loading }}
      exportFileName="etykiety.csv"
    />
  </div>;
}
