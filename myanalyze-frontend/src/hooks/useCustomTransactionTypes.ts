import React from "react";
import { normalizeCustomTransactionType, type CustomTransactionType } from "../types/customTransactionType";
import apiClient from "../utils/apiClient";
import { useLatestRequestGuard } from "./useLatestRequestGuard";

export function useCustomTransactionTypes() {
  const [rows, setRows] = React.useState<CustomTransactionType[]>([]);
  const [loading, setLoading] = React.useState(true);
  const { begin: beginRequest, isLatest: isLatestRequest } = useLatestRequestGuard();
  const refresh = React.useCallback(async () => {
    const requestVersion = beginRequest();
    setLoading(true);
    try {
      const response = await apiClient.get("/custom-transaction-types");
      if (isLatestRequest(requestVersion)) setRows((Array.isArray(response.data) ? response.data : []).map(normalizeCustomTransactionType));
    } finally { if (isLatestRequest(requestVersion)) setLoading(false); }
  }, [beginRequest, isLatestRequest]);
  React.useEffect(() => { void refresh().catch(() => undefined); }, [refresh]);
  const activeRows = React.useMemo(() => rows.filter((row) => row.active), [rows]);
  return { rows, activeRows, loading, refresh };
}
