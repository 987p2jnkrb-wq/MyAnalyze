import React from "react";
import Modal from "../../components/Modal";
import Button from "../../components/Button";
import DataGrid from "../../components/DataGrid";
import apiClient from "../../utils/apiClient";
import type { AppActivityLog } from "../../context/app-activity-log-types";
import { logColumns, parseMetadataDate } from "./AppActivityLogModule";

interface AccountActivityLogModalProps {
  open: boolean;
  onClose: () => void;
  accountId: number;
}

const accountLogColumns = logColumns.filter((column) => column.key !== "entity_type");

export default function AccountActivityLogModal({ open, onClose, accountId }: AccountActivityLogModalProps) {
  const [logs, setLogs] = React.useState<AppActivityLog[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");

  const fetchLogs = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiClient.get(`/app-activity-logs?entity_type=konta&entity_id=${accountId}`);
      setLogs(Array.isArray(response.data) ? response.data : []);
    } catch {
      setError("Nie udało się pobrać historii zmian konta.");
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  React.useEffect(() => {
    if (open) void fetchLogs();
  }, [fetchLogs, open]);

  const visibleLogs = React.useMemo(() => logs.filter((log) => {
    const timestamp = new Date(parseMetadataDate(log)).getTime();
    if (!Number.isFinite(timestamp)) return !dateFrom && !dateTo;
    if (dateFrom && timestamp < new Date(`${dateFrom}T00:00:00`).getTime()) return false;
    if (dateTo && timestamp > new Date(`${dateTo}T23:59:59.999`).getTime()) return false;
    return true;
  }), [dateFrom, dateTo, logs]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Historia zmian konta"
      description="Zmiany salda, typu konta i operacje powiązane z tym kontem."
      size="xl"
      footer={<div className="flex justify-end"><Button tone="neutral" onClick={onClose}>Zamknij</Button></div>}
    >
      {error && <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <DataGrid
        gridId="account-activity-log"
        rows={visibleLogs}
        columns={accountLogColumns}
        getRowId={(log) => log.id}
        loading={loading}
        emptyMessage="Brak historii zmian dla tego konta."
        defaultSort={{ key: "timestamp", direction: "desc" }}
        exportFileName="historia-konta.csv"
        toolbar={<div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold text-slate-600">Od<input aria-label="Historia od" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal" /></label>
          <label className="text-xs font-semibold text-slate-600">Do<input aria-label="Historia do" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal" /></label>
          {(dateFrom || dateTo) && <button type="button" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50" onClick={() => { setDateFrom(""); setDateTo(""); }}>Wyczyść daty</button>}
        </div>}
      />
    </Modal>
  );
}
