import React from "react";
import { Plus, Trash2 } from "lucide-react";
import DataGrid, { type DataGridColumn } from "../../components/DataGrid";
import MoneyInput from "../../components/MoneyInput";
import IconButton from "../../components/IconButton";
import Modal from "../../components/Modal";
import ModalFormActions from "../../components/ModalFormActions";
import ConfirmModal from "../../components/ConfirmModal";
import ModuleBadge, { type ModuleBadgeTone } from "../../components/ModuleBadge";
import { useIncomeStaleContext } from "../../context/IncomeStaleContext";
import { useExpenseStaleContext } from "../../context/ExpenseStaleContext";
import { useIncomeContext } from "../../context/useIncomeContext";
import { useExpenseContext } from "../../context/useExpenseContext";
import { formatCurrency, formatDate } from "../../utils/formatters";
import { useToast } from "../../context/ToastContext";
import { parseRequiredNumber } from "../../utils/numbers";
import { deleteSelectedRows } from "../../utils/deleteSelectedRows";
import { localDateKey, validateDateRange, validateIntegerRange, validatePositiveMoney } from "../../utils/validation";
import ResourceLoadError from "../../components/ResourceLoadError";
import { useCustomTransactionTypes } from "../../hooks/useCustomTransactionTypes";
import type { RecurringDraft as RecurringPayload, RecurringModel as RecurringEntry } from "../../context/useRecurringResource";

type EditorState = { mode: "add" | "edit"; row: RecurringEntry | null } | null;

interface RecurringEntriesGridProps {
  kind: "income" | "expense";
  rows: RecurringEntry[];
  onAdd: (payload: RecurringPayload) => Promise<void>;
  onEdit: (id: number, payload: RecurringPayload) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onRefresh: () => Promise<void>;
  onRelatedRefresh?: () => Promise<void>;
}

interface RecurringDraft {
  nazwa: string;
  kwota: string;
  custom_type_id: number | null;
  data_od: string;
  data_do: string | null;
  dzien_miesiaca: string;
  unlimited: boolean;
}

const today = () => localDateKey();

function initialDraft(row?: RecurringEntry | null): RecurringDraft {
  return row ? {
    nazwa: row.nazwa,
    kwota: String(row.kwota),
    custom_type_id: row.custom_type_id ?? null,
    data_od: row.data_od?.slice(0, 10) ?? "",
    data_do: row.data_do && row.data_do !== "2099-01-01" ? row.data_do.slice(0, 10) : null,
    dzien_miesiaca: String(row.dzien_miesiaca),
    unlimited: row.data_do === "2099-01-01",
  } : {
    nazwa: "",
    kwota: "",
    custom_type_id: null,
    data_od: today(),
    data_do: null,
    dzien_miesiaca: "1",
    unlimited: false,
  };
}

function RecurringEntryForm({ row, customTypes, onSave }: {
  row: RecurringEntry | null;
  customTypes: Array<{ id: number; name: string }>;
  onSave: (draft: RecurringDraft) => Promise<void>;
}) {
  const [draft, setDraft] = React.useState(() => initialDraft(row));
  const update = <K extends keyof RecurringDraft>(key: K, value: RecurringDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  return (
    <form id="recurring-entry-form" className="space-y-5" onSubmit={(event) => { event.preventDefault(); void onSave(draft); }}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="mb-1 block text-sm font-semibold">Nazwa</span><input autoFocus required className="w-full rounded-lg border border-gray-300 px-3 py-2" value={draft.nazwa} onChange={(event) => update("nazwa", event.target.value)} /></label>
        <label><span className="mb-1 block text-sm font-semibold">Kwota</span><MoneyInput required min={0.01} className="w-full rounded-lg border border-gray-300 px-3 py-2" value={draft.kwota} onValueChange={(value) => update("kwota", value)} /></label>
        <label><span className="mb-1 block text-sm font-semibold">Etykieta</span><select className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2" value={draft.custom_type_id ?? ""} onChange={(event) => update("custom_type_id", event.target.value ? Number(event.target.value) : null)}><option value="">Bez etykiety</option>{customTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span className="mb-1 block text-sm font-semibold">Data od</span><input required type="date" className="w-full rounded-lg border border-gray-300 px-3 py-2" value={draft.data_od} onChange={(event) => update("data_od", event.target.value)} /></label>
        <label><span className="mb-1 block text-sm font-semibold">Data do</span><input type="date" disabled={draft.unlimited} className="w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100" value={draft.data_do ?? ""} onChange={(event) => update("data_do", event.target.value || null)} /></label>
        <label><span className="mb-1 block text-sm font-semibold">Dzień miesiąca</span><input required min={1} max={31} type="number" className="w-full rounded-lg border border-gray-300 px-3 py-2" value={draft.dzien_miesiaca} onChange={(event) => update("dzien_miesiaca", event.target.value)} /></label>
        <label className="flex items-end gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"><input type="checkbox" className="h-5 w-5" checked={draft.unlimited} onChange={(event) => update("unlimited", event.target.checked)} /><span className="font-semibold">Bezterminowo</span></label>
      </div>
    </form>
  );
}

function RecurringEntriesGrid({ kind, rows, onAdd, onEdit, onDelete, onRefresh, onRelatedRefresh }: RecurringEntriesGridProps) {
  const { showToast } = useToast();
  const { rows: allCustomTypes, activeRows: activeCustomTypes } = useCustomTransactionTypes();
  const [editor, setEditor] = React.useState<EditorState>(null);
  const [confirmId, setConfirmId] = React.useState<number | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const isIncome = kind === "income";
  const tone: ModuleBadgeTone = isIncome ? "success" : "danger";
  const label = isIncome ? "stały przychód" : "stały wydatek";
  const customTypeOptions = React.useMemo(() => [{ value: "", label: "Bez etykiety" }, ...allCustomTypes.map((item) => ({ value: String(item.id), label: item.name }))], [allCustomTypes]);

  const columns = React.useMemo<DataGridColumn<RecurringEntry>[]>(() => [
    { key: "nazwa", label: "Nazwa", value: (row) => row.nazwa, sortable: true, width: 190, edit: { value: (row) => row.nazwa, update: (row, value) => ({ ...row, nazwa: String(value) }) } },
    { key: "kwota", label: "Kwota", value: (row) => Number(row.kwota), render: (row) => formatCurrency(row.kwota), exportValue: (row) => formatCurrency(row.kwota), sortable: true, width: 130, align: "right", edit: { type: "number", min: 0.01, step: 0.01, value: (row) => Number(row.kwota), update: (row, value) => ({ ...row, kwota: Number(value) }) } },
    { key: "custom_type_name", label: "Etykieta", value: (row) => row.custom_type_name || "Bez etykiety", sortable: true, filterable: true, width: 160, edit: { type: "select", value: (row) => row.custom_type_id == null ? "" : String(row.custom_type_id), options: customTypeOptions, update: (row, value) => ({ ...row, custom_type_id: value === "" ? null : Number(value), custom_type_name: value === "" ? null : allCustomTypes.find((item) => item.id === Number(value))?.name ?? row.custom_type_name }) } },
    { key: "data_od", label: "Data od", value: (row) => row.data_od, render: (row) => formatDate(row.data_od), exportValue: (row) => formatDate(row.data_od), sortable: true, width: 135, edit: { type: "date", value: (row) => row.data_od.slice(0, 10), update: (row, value) => ({ ...row, data_od: String(value) }) } },
    { key: "data_do", label: "Data do", value: (row) => row.data_do === "2099-01-01" ? "Bezterminowo" : row.data_do ?? "Brak", render: (row) => row.data_do === "2099-01-01" ? "Bezterminowo" : row.data_do ? formatDate(row.data_do) : "-", sortable: true, filterable: true, width: 145, edit: { type: "date", value: (row) => row.data_do === "2099-01-01" ? "" : row.data_do?.slice(0, 10) ?? "", update: (row, value) => ({ ...row, data_do: String(value) || null }), disabled: (row) => row.data_do === "2099-01-01" } },
    { key: "dzien_miesiaca", label: "Dzień miesiąca", value: (row) => Number(row.dzien_miesiaca), sortable: true, width: 135, align: "right", edit: { type: "number", min: 1, max: 31, step: 1, value: (row) => Number(row.dzien_miesiaca), update: (row, value) => ({ ...row, dzien_miesiaca: Number(value) }) } },
    { key: "bezterminowo", label: "Bezterminowo", value: (row) => row.data_do === "2099-01-01" ? "Tak" : "Nie", render: (row) => <ModuleBadge tone={row.data_do === "2099-01-01" ? "success" : "neutral"} size="sm">{row.data_do === "2099-01-01" ? "Tak" : "Nie"}</ModuleBadge>, filterable: true, width: 135, align: "center", edit: { type: "checkbox", value: (row) => row.data_do === "2099-01-01", update: (row, value) => ({ ...row, data_do: value === true ? "2099-01-01" : null }) } },
  ], [allCustomTypes, customTypeOptions]);

  const validateInline = (row: RecurringEntry) => {
    if (!row.nazwa.trim()) return "Nazwa nie może być pusta.";
    const amountError = validatePositiveMoney(row.kwota);
    if (amountError) return amountError;
    const dateError = validateDateRange(row.data_od, row.data_do === "2099-01-01" ? undefined : row.data_do);
    if (dateError) return dateError;
    const dayError = validateIntegerRange(row.dzien_miesiaca, "Dzień miesiąca", 1, 31);
    if (dayError) return dayError;
    return null;
  };

  const saveInline = async (row: RecurringEntry) => {
    const payload: RecurringPayload = { nazwa: row.nazwa.trim(), kwota: Number(row.kwota), kategoria: "Inne", custom_type_id: row.custom_type_id ?? null, data_od: row.data_od, data_do: row.data_do, dzien_miesiaca: Number(row.dzien_miesiaca) };
    try {
      await onEdit(row.id, payload);
      await onRelatedRefresh?.();
      showToast(`Zapisano ${label}.`, "success");
    } catch (error) {
      showToast(`Nie udało się zapisać: ${label}.`, "error");
      throw error;
    }
  };

  const save = async (draft: RecurringDraft) => {
    if (!editor) return;
    const payload: RecurringPayload = { nazwa: draft.nazwa.trim(), kwota: parseRequiredNumber(draft.kwota), kategoria: "Inne", custom_type_id: draft.custom_type_id, data_od: draft.data_od, data_do: draft.unlimited ? "2099-01-01" : draft.data_do || null, dzien_miesiaca: parseRequiredNumber(draft.dzien_miesiaca) };
    const validation = validateInline({ id: editor.row?.id ?? 0, custom_type_name: null, linked_debt_plan_id: null, occurrenceOverrides: [], ...payload });
    if (validation) { showToast(validation, "error"); return; }
    setSaving(true);
    try {
      if (editor.mode === "edit" && editor.row) await onEdit(editor.row.id, payload); else await onAdd(payload);
      await onRelatedRefresh?.();
      setEditor(null);
      showToast(`${editor.mode === "edit" ? "Zapisano" : "Dodano"} ${label}.`, "success");
    } catch { showToast(`Nie udało się zapisać: ${label}.`, "error"); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (confirmId == null) return;
    try { await onDelete(confirmId); await onRelatedRefresh?.(); showToast(`Usunięto ${label}.`, "success"); }
    catch { showToast(`Nie udało się usunąć: ${label}.`, "error"); }
    finally { setConfirmId(null); }
  };
  const removeSelected = async (selectedRows: RecurringEntry[]) => {
    const deleted = await deleteSelectedRows(selectedRows, (row) => onDelete(row.id), onRelatedRefresh);
    showToast(`Usunięto ${deleted} ${isIncome ? (deleted === 1 ? "stały przychód" : "stałe przychody") : (deleted === 1 ? "stały wydatek" : "stałe wydatki")}.`, "success");
  };

  const refresh = async () => { setRefreshing(true); try { await Promise.all([onRefresh(), onRelatedRefresh?.()]); } finally { setRefreshing(false); } };
  const total = rows.reduce((sum, row) => sum + Number(row.kwota || 0), 0);

  return (
    <div className="min-w-0 space-y-3">
      <DataGrid
        gridId={`manager-recurring-${kind}`}
        rows={rows}
        columns={columns}
        getRowId={(row) => row.id}
        selectable
        onDeleteSelected={removeSelected}
        deleteSelectedConfirmMessage={(selected) => {
          const base = `Czy na pewno usunąć ${selected.length} zaznaczone ${isIncome ? "stałe przychody" : "stałe wydatki"}?`;
          return kind === "expense" && selected.some((row) => row.linked_debt_plan_id != null)
            ? `${base} Powiązane zobowiązania pozostaną, a ich raty zostaną odłączone.`
            : `${base} Tej operacji nie można cofnąć.`;
        }}
        exportFileName={`${isIncome ? "stale-przychody" : "stale-wydatki"}.csv`}
        actionsWidth={104}
        onInlineSave={saveInline}
        validateInlineRow={validateInline}
        toolbar={<><ModuleBadge tone={tone}>Suma: {formatCurrency(total)}</ModuleBadge><IconButton label="Dodaj" tone="primary" onClick={() => setEditor({ mode: "add", row: null })}><Plus size={19} aria-hidden="true" /></IconButton></>}
        refresh={{ onRefresh: refresh, refreshing, label: `Odśwież ${label}` }}
        actions={(row) => <IconButton label="Usuń" tone="danger" onClick={() => setConfirmId(row.id)}><Trash2 size={17} aria-hidden="true" /></IconButton>}
      />
      <Modal
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        title={editor?.mode === "edit" ? `Edytuj: ${label}` : `Dodaj: ${label}`}
        size="lg"
        footer={editor && <ModalFormActions saving={saving} onCancel={() => setEditor(null)} form="recurring-entry-form" submitLabel={editor.mode === "edit" ? "Zapisz zmiany" : "Dodaj"} />}
      >
        {editor && <RecurringEntryForm key={`${editor.mode}-${editor.row?.id ?? "new"}`} customTypes={activeCustomTypes} row={editor.row} onSave={save} />}
      </Modal>
      <ConfirmModal open={confirmId != null} title="Potwierdź usunięcie" message={kind === "expense" && rows.find((row) => row.id === confirmId)?.linked_debt_plan_id != null ? "Czy usunąć stały wydatek? Powiązane zobowiązanie pozostanie, a rata zostanie odłączona." : `Czy na pewno usunąć ${label}?`} onConfirm={() => void remove()} onCancel={() => setConfirmId(null)} />
    </div>
  );
}

export function RecurringIncomeGrid() {
  const context = useIncomeStaleContext();
  const incomes = useIncomeContext();
  if (!context.incomesStaleLoaded) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Ładowanie stałych przychodów…</div>;
  if (context.incomesStaleError) return <ResourceLoadError blocking message={context.incomesStaleError} onRetry={() => void context.fetchIncomesStale()} />;
  return <RecurringEntriesGrid kind="income" rows={context.incomesStale} onAdd={context.addIncomeStale} onEdit={context.editIncomeStale} onDelete={context.deleteIncomeStale} onRefresh={context.fetchIncomesStale} onRelatedRefresh={incomes.fetchIncomes} />;
}

export function RecurringExpenseGrid() {
  const context = useExpenseStaleContext();
  const expenses = useExpenseContext();
  if (!context.expensesStaleLoaded) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Ładowanie stałych wydatków…</div>;
  if (context.expensesStaleError) return <ResourceLoadError blocking message={context.expensesStaleError} onRetry={() => void context.fetchExpensesStale()} />;
  return <RecurringEntriesGrid kind="expense" rows={context.expensesStale} onAdd={context.addExpenseStale} onEdit={context.editExpenseStale} onDelete={context.deleteExpenseStale} onRefresh={context.fetchExpensesStale} onRelatedRefresh={expenses.fetchExpenses} />;
}
