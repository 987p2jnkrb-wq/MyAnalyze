import React from "react";
import apiClient from "../utils/apiClient";
import { useLatestRequestGuard } from "../hooks/useLatestRequestGuard";

export interface RecurringModel {
  id: number;
  nazwa: string;
  kwota: number;
  /** Pole legacy z bazy; UI klasyfikuje wpis przez etykietę. */
  kategoria: string;
  custom_type_id?: number | null;
  custom_type_name?: string | null;
  linked_debt_plan_id?: number | null;
  data_od: string;
  data_do: string | null;
  dzien_miesiaca: number;
  occurrenceOverrides?: Array<{ date: string; status: "dismissed" | "customized" }>;
}

export type RecurringDraft = Omit<RecurringModel, "id" | "custom_type_name" | "linked_debt_plan_id" | "occurrenceOverrides">;

type RecurringApiRow = RecurringModel & {
  occurrence_overrides?: RecurringModel["occurrenceOverrides"];
  custom_type_id?: number | string | null;
  custom_type_name?: string | null;
  linked_debt_plan_id?: number | string | null;
};

function normalize(item: RecurringApiRow): RecurringModel {
  return {
    ...item,
    id: Number(item.id),
    kwota: Number(item.kwota),
    kategoria: item.kategoria || "Inne",
    custom_type_id: item.custom_type_id == null ? null : Number(item.custom_type_id),
    custom_type_name: item.custom_type_name ?? null,
    linked_debt_plan_id: item.linked_debt_plan_id == null ? null : Number(item.linked_debt_plan_id),
    data_od: item.data_od ? item.data_od.slice(0, 10) : "",
    data_do: item.data_do ? item.data_do.slice(0, 10) : null,
    dzien_miesiaca: Number(item.dzien_miesiaca),
    occurrenceOverrides: Array.isArray(item.occurrence_overrides) ? item.occurrence_overrides : item.occurrenceOverrides ?? [],
  };
}

export function useRecurringResource(endpoint: "/przychody_stale" | "/wydatki_stale") {
  const [rows, setRows] = React.useState<RecurringModel[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const { begin: beginRequest, isLatest: isLatestRequest, invalidate: invalidateRequests } = useLatestRequestGuard();

  const fetchRows = React.useCallback(async () => {
    const requestVersion = beginRequest();
    try {
      const response = await apiClient.get(endpoint);
      if (isLatestRequest(requestVersion)) {
        setRows((Array.isArray(response.data) ? response.data : []).map(normalize));
        setError(null);
      }
    } catch (caught) {
      if (isLatestRequest(requestVersion)) setError(`Nie udało się pobrać ${endpoint === "/przychody_stale" ? "stałych przychodów" : "stałych wydatków"}.`);
      throw caught;
    } finally {
      if (isLatestRequest(requestVersion)) setLoaded(true);
    }
  }, [beginRequest, endpoint, isLatestRequest]);

  React.useEffect(() => { void fetchRows().catch((error) => console.error(`Nie udało się pobrać ${endpoint}:`, error)); }, [endpoint, fetchRows]);

  const add = async (draft: RecurringDraft) => {
    await apiClient.post(endpoint, draft);
    await fetchRows();
  };

  const edit = async (id: number, draft: RecurringDraft) => {
    await apiClient.put(`${endpoint}/${id}`, draft);
    await fetchRows();
  };

  const remove = async (id: number) => {
    await apiClient.delete(`${endpoint}/${id}`);
    invalidateRequests();
    setRows((current) => current.filter((item) => item.id !== id));
  };

  return { rows, loaded, error, add, edit, remove, fetchRows };
}
