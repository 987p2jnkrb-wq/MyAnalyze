import React from "react";
import { useLatestRequestGuard } from "../hooks/useLatestRequestGuard";
import apiClient from "../utils/apiClient";
import type { TransactionType } from "../types/transactionType";
import { normalizeIncomeCertainty, type IncomeCertainty } from "../types/incomeCertainty";

export type { IncomeCertainty } from "../types/incomeCertainty";

export interface PlanMatch {
  source: "one_time" | "recurring";
  planId: number;
  occurrenceDate: string | null;
  allocatedAmount: number;
}

export interface TransactionModel {
  id: number;
  name: string;
  amount: number;
  category: string;
  customTypeId?: number | null;
  customTypeName?: string | null;
  addedAt: string;
  zrealizowany: boolean;
  generatedFromRecurring?: boolean;
  recurringIncomeId?: number | null;
  recurringQueueStatus?: "scheduled" | "dismissed" | "customized" | null;
  transactionType?: TransactionType | null;
  accountId?: number | null;
  importSource?: string | null;
  importStatus?: "completed" | "pending" | "cancelled" | null;
  excludedFromAnalysis?: boolean;
  transferLinkId?: number | null;
  transferCounterpartName?: string | null;
  transferCounterpartKind?: "income" | "expense" | null;
  transferCounterpartId?: number | null;
  allocatedToPlan?: number;
  certainty?: IncomeCertainty;
  planMatches?: PlanMatch[];
}

export type TransactionDraft = Omit<TransactionModel, "id" | "zrealizowany">;

interface TransactionApiResponse {
  id: number;
  nazwa: string;
  kwota: number;
  kategoria: string;
  custom_type_id?: number | string | null;
  custom_type_name?: string | null;
  data_dodania: string;
  zrealizowany?: boolean | number | string | null;
  generated_from_recurring?: boolean | number | string | null;
  recurring_income_id?: number | string | null;
  recurring_queue_status?: "scheduled" | "dismissed" | "customized" | null;
  transaction_type?: TransactionType | null;
  account_id?: number | string | null;
  import_source?: string | null;
  import_status?: "completed" | "pending" | "cancelled" | null;
  excluded_from_analysis?: boolean | number | string | null;
  transfer_link_id?: number | string | null;
  transfer_counterpart_name?: string | null;
  transfer_counterpart_kind?: "income" | "expense" | null;
  transfer_counterpart_id?: number | string | null;
  allocated_to_plan?: number | string | null;
  pewnosc?: IncomeCertainty | null;
  plan_allocations?: string | null;
  planMatch?: PlanMatch | null;
  planMatches?: TransactionModel["planMatches"] | null;
  plan_match?: PlanMatch | null;
  plan_matches?: TransactionModel["planMatches"] | null;
}

function apiBoolean(value: boolean | number | string | null | undefined): boolean {
  return value === true || value === 1 || (typeof value === "string" && ["1", "true", "yes", "tak"].includes(value.trim().toLowerCase()));
}

function fromApi(item: TransactionApiResponse): TransactionModel {
  const generatedFromRecurring = apiBoolean(item.generated_from_recurring);
  const zrealizowany = apiBoolean(item.zrealizowany);
  const completedImportedIncome = Boolean(item.import_source)
    && (item.import_status ?? "completed") === "completed"
    && zrealizowany;
  let planMatches: NonNullable<TransactionModel["planMatches"]> = item.planMatches ?? item.plan_matches ?? (item.planMatch ? [item.planMatch] : item.plan_match ? [item.plan_match] : []);
  try {
    const parsed = JSON.parse(item.plan_allocations || "[]") as Array<Record<string, unknown>>;
    const parsedMatches = parsed.flatMap((match) => match && ["one_time", "recurring"].includes(String(match.source)) && Number.isInteger(Number(match.planId)) && Number(match.allocatedAmount) > 0 ? [{
      source: String(match.source) as "one_time" | "recurring",
      planId: Number(match.planId),
      occurrenceDate: match.occurrenceDate == null ? null : String(match.occurrenceDate),
      allocatedAmount: Number(match.allocatedAmount),
    }] : []);
    if (parsedMatches.length) planMatches = parsedMatches;
  } catch { /* Zachowaj znormalizowane pola legacy. */ }
  return {
    id: Number(item.id),
    name: item.nazwa,
    amount: Number(item.kwota),
    category: item.kategoria,
    customTypeId: item.custom_type_id == null ? null : Number(item.custom_type_id),
    customTypeName: item.custom_type_name ?? null,
    addedAt: item.data_dodania,
    zrealizowany,
    generatedFromRecurring,
    recurringIncomeId: item.recurring_income_id == null ? null : Number(item.recurring_income_id),
    recurringQueueStatus: item.recurring_queue_status ?? null,
    transactionType: item.transaction_type ?? null,
    accountId: item.account_id == null ? null : Number(item.account_id),
    importSource: item.import_source ?? null,
    importStatus: item.import_status ?? null,
    excludedFromAnalysis: apiBoolean(item.excluded_from_analysis),
    transferLinkId: item.transfer_link_id == null ? null : Number(item.transfer_link_id),
    transferCounterpartName: item.transfer_counterpart_name ?? null,
    transferCounterpartKind: item.transfer_counterpart_kind ?? null,
    transferCounterpartId: item.transfer_counterpart_id == null ? null : Number(item.transfer_counterpart_id),
    allocatedToPlan: Number(item.allocated_to_plan ?? 0),
    certainty: generatedFromRecurring || completedImportedIncome
      ? "guaranteed"
      : normalizeIncomeCertainty(item.pewnosc),
    planMatches,
  };
}

function toApi(item: TransactionDraft | Omit<TransactionModel, "id">, includeCertainty: boolean) {
  return { nazwa: item.name, kwota: Number(item.amount), kategoria: item.category, custom_type_id: item.customTypeId ?? null, data_dodania: item.addedAt, transaction_type: item.transactionType ?? null, ...(includeCertainty ? { pewnosc: normalizeIncomeCertainty(item.certainty) } : {}), ...( "zrealizowany" in item ? { zrealizowany: item.zrealizowany } : {}) };
}

export function useTransactionResource(endpoint: "/przychody" | "/wydatki") {
  const [rows, setRows] = React.useState<TransactionModel[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const { begin: beginRequest, isLatest: isLatestRequest, invalidate: invalidateRequests } = useLatestRequestGuard();

  const fetchRows = React.useCallback(async () => {
    const requestVersion = beginRequest();
    try {
      const response = await apiClient.get(endpoint);
      if (isLatestRequest(requestVersion)) {
        setRows((Array.isArray(response.data) ? response.data : []).map(fromApi));
        setError(null);
      }
    } catch (caught) {
      if (isLatestRequest(requestVersion)) setError(`Nie udało się pobrać ${endpoint === "/przychody" ? "przychodów" : "wydatków"}.`);
      throw caught;
    } finally {
      if (isLatestRequest(requestVersion)) setLoaded(true);
    }
  }, [beginRequest, endpoint, isLatestRequest]);

  React.useEffect(() => { void fetchRows().catch((error) => console.error(`Nie udało się pobrać ${endpoint}:`, error)); }, [endpoint, fetchRows]);

  const add = async (draft: TransactionDraft) => {
    await apiClient.post(endpoint, toApi(draft, endpoint === "/przychody"));
    await fetchRows();
  };

  const edit = async (row: TransactionModel) => {
    await apiClient.put(`${endpoint}/${row.id}`, toApi(row, endpoint === "/przychody"));
    await fetchRows();
  };

  const remove = async (id: number) => {
    await apiClient.delete(`${endpoint}/${id}`);
    invalidateRequests();
    setRows((current) => current.filter((item) => item.id !== id));
  };

  return { rows, loaded, error, add, edit, remove, fetchRows };
}
