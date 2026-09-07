import React from "react";
import { Bookmark, Check, Columns3, Download, GripVertical, ListFilter, Search, Trash2, X } from "lucide-react";
import { useResizableColumns } from "../hooks/useResizableColumns";
import { csvCell, EMPTY_FILTERS } from "./data-grid/model";
import type { DataGridColumn, DataGridProps } from "./data-grid/types";
import { useDataGridView } from "./data-grid/useDataGridView";
import ConfirmModal from "./ConfirmModal";
import IconButton from "./IconButton";
import RefreshButton from "./RefreshButton";
import DataGridCellEditor from "./data-grid/DataGridCellEditor";
import { useDataGridInlineEdit } from "./data-grid/useDataGridInlineEdit";
import { useDataGridSelection } from "./data-grid/useDataGridSelection";

export type { DataGridColumn, DataGridProps } from "./data-grid/types";

const DataGridSelectionScopeContext = React.createContext<React.Key | null>(null);

export function DataGridSelectionScope({ value, children }: { value: React.Key; children: React.ReactNode }) {
  return <DataGridSelectionScopeContext.Provider value={value}>{children}</DataGridSelectionScopeContext.Provider>;
}

export default function DataGrid<T>({
  gridId, rows, columns, getRowId, actions, loading, emptyMessage = "Brak danych do wyświetlenia.",
  defaultPageSize = 10, defaultSort, defaultFilters = EMPTY_FILTERS, toolbar, refresh, bulkActions, stickyActions = true, selectable = false, isRowSelectable = () => true, exportFileName, actionsWidth = 180, onFilteredRowsChange,
  onInlineSave, validateInlineRow, showFooter = true, preserveRowOrder = false, getRowClassName, rowDrag, onDeleteSelected, deleteSelectedConfirmMessage,
}: DataGridProps<T>) {
  const selectionScope = React.useContext(DataGridSelectionScopeContext);
  const [profileName, setProfileName] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(defaultPageSize);
  const [dragSource, setDragSource] = React.useState<T | null>(null);
  const [dragOverId, setDragOverId] = React.useState<string | null>(null);
  const [openPanel, setOpenPanel] = React.useState<"filters" | "columns" | "profiles" | null>(null);
  const [columnFilterMenu, setColumnFilterMenu] = React.useState<{ columnKey: string; x: number; y: number } | null>(null);
  const [deleteSelectedOpen, setDeleteSelectedOpen] = React.useState(false);
  const [deletingSelected, setDeletingSelected] = React.useState(false);
  const [deleteSelectedError, setDeleteSelectedError] = React.useState("");
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const columnFilterMenuRef = React.useRef<HTMLDivElement | null>(null);
  const hasActions = Boolean(actions || onInlineSave);
  const defaultWidths = React.useMemo(() => columns.map((column) => column.width ?? 140).concat(hasActions ? [actionsWidth] : []), [columns, hasActions, actionsWidth]);
  const { columnWidths, startResize, resetColumns, applyColumnWidths } = useResizableColumns(`myanalyze.grid.${gridId}.widths`, defaultWidths, 70);
  const {
    view, updateView, profiles, activeProfile, orderedColumns, visibleColumns, filterableColumns, filterOptions,
    activeFilterCount, filteredRows, sortedRows, toggleColumnFilterValue, clearColumnFilter, toggleSort, moveColumn,
    saveProfile: saveViewProfile, applyProfile, deleteProfile,
  } = useDataGridView({
    gridId, rows, columns, defaultSort, defaultFilters, preserveRowOrder, onFilteredRowsChange,
    columnWidths, resetColumns, applyColumnWidths,
  });
  const {
    selectedIds, selectedRows, selectedCount, selectableIds, allFilteredSelected,
    changeRowSelection, handleRowClick, toggleAll, clearSelection,
  } = useDataGridSelection({ rows: sortedRows, getRowId, selectable, isRowSelectable, selectionScope });
  const {
    rowRef: inlineRowRef, editId: inlineEditId, draft: inlineDraft, focusKey: inlineFocusKey,
    saving: inlineSaving, error: inlineError, setDraft: setInlineDraft, begin: beginInlineEdit,
    cancel: cancelInlineEdit, save: saveInlineEdit,
  } = useDataGridInlineEdit({ columns, getRowId, onInlineSave, validateInlineRow });

  React.useEffect(() => { setPage(1); }, [view]);
  React.useEffect(() => { setDeleteSelectedOpen(false); setDeleteSelectedError(""); }, [selectionScope]);

  React.useEffect(() => {
    if (!openPanel) return;
    const closePanel = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setOpenPanel(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenPanel(null); };
    document.addEventListener("pointerdown", closePanel, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closePanel, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openPanel]);
  React.useEffect(() => {
    if (!columnFilterMenu) return;
    const closeMenu = (event: PointerEvent) => {
      if (event.target instanceof Node && !columnFilterMenuRef.current?.contains(event.target)) setColumnFilterMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setColumnFilterMenu(null); };
    document.addEventListener("pointerdown", closeMenu, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [columnFilterMenu]);
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = sortedRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const rowPadding = "py-2";
  const selectionWidth = selectable ? 48 : 0;
  const actionWidth = hasActions ? Math.max(columnWidths[columnWidths.length - 1], actionsWidth) : 0;
  const minWidth = visibleColumns.reduce((sum, column) => sum + columnWidths[columns.indexOf(column)], selectionWidth + actionWidth + (rowDrag ? 44 : 0));

  const openColumnFilter = (column: DataGridColumn<T>, x: number, y: number) => {
    if (!column.filterable) return;
    const width = 288;
    const height = 420;
    setOpenPanel(null);
    setColumnFilterMenu({
      columnKey: column.key,
      x: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
    });
  };
  const renderFilterChoices = (column: DataGridColumn<T>, contextMenu = false) => {
    const selected = view.filters[column.key] ?? [];
    const choices = filterOptions[column.key] ?? [];
    const itemClass = (active: boolean) => `flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${active ? "bg-blue-50 font-medium text-blue-800" : "text-slate-700 hover:bg-slate-100"}`;
    return <div className="space-y-1">
      <button
        type="button"
        role={contextMenu ? "menuitemradio" : undefined}
        aria-checked={contextMenu ? selected.length === 0 : undefined}
        aria-pressed={contextMenu ? undefined : selected.length === 0}
        className={itemClass(selected.length === 0)}
        onClick={() => clearColumnFilter(column.key)}
      >
        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected.length === 0 ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white"}`}>{selected.length === 0 && <Check size={12} aria-hidden="true" />}</span>
        Wszystkie
      </button>
      {choices.map((value) => {
        const active = selected.includes(value);
        return <button
          key={value}
          type="button"
          role={contextMenu ? "menuitemcheckbox" : undefined}
          aria-checked={contextMenu ? active : undefined}
          aria-pressed={contextMenu ? undefined : active}
          className={itemClass(active)}
          onClick={() => toggleColumnFilterValue(column.key, value)}
        >
          <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${active ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white"}`}>{active && <Check size={12} aria-hidden="true" />}</span>
          <span className="min-w-0 flex-1 break-words">{value}</span>
        </button>;
      })}
    </div>;
  };
  const saveProfile = (event: React.FormEvent) => {
    event.preventDefault();
    const name = profileName.trim();
    if (!name) return;
    saveViewProfile(name);
    setProfileName("");
  };
  const exportCsv = () => {
    const exportRows = selectedCount ? sortedRows.filter((row) => selectedIds.has(String(getRowId(row)))) : sortedRows;
    const lines = [visibleColumns.map((column) => csvCell(column.label)).join(";")];
    for (const row of exportRows) lines.push(visibleColumns.map((column) => csvCell(column.exportValue ? column.exportValue(row) : column.value(row))).join(";"));
    const blob = new Blob(["\ufeff", lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = exportFileName ?? `${gridId}.csv`; link.click();
    URL.revokeObjectURL(url);
  };
  const deleteSelected = async () => {
    if (!onDeleteSelected || !selectedRows.length || deletingSelected) return;
    setDeletingSelected(true);
    setDeleteSelectedError("");
    try {
      await onDeleteSelected(selectedRows);
      clearSelection();
      setDeleteSelectedOpen(false);
    } catch (error) {
      setDeleteSelectedOpen(false);
      setDeleteSelectedError(error instanceof Error && error.message ? error.message : "Nie udało się usunąć zaznaczonych rekordów.");
    } finally {
      setDeletingSelected(false);
    }
  };

  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="relative z-30 flex min-h-14 flex-col gap-2 rounded-t-xl border-b border-slate-200 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        {(toolbar || (bulkActions && selectedCount > 0) || (onDeleteSelected && selectedCount > 0)) && <div role="toolbar" aria-label="Akcje danych" className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-1">
          {bulkActions && selectedCount > 0 && bulkActions(selectedRows)}
          {toolbar}
          {onDeleteSelected && selectedCount > 0 && <IconButton label={`Usuń zaznaczone (${selectedCount})`} tone="danger" disabled={deletingSelected} onClick={() => setDeleteSelectedOpen(true)}><Trash2 size={18} aria-hidden="true" /></IconButton>}
        </div>}
        <div ref={menuRef} role="toolbar" aria-label="Narzędzia tabeli" className="relative ml-auto flex shrink-0 items-center gap-2">
          {refresh && <RefreshButton onRefresh={refresh.onRefresh} refreshing={refresh.refreshing ?? loading} label={refresh.label ?? "Odśwież dane"} />}
          <label className="relative hidden sm:block">
            <span className="sr-only">Szukaj w tabeli</span>
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              aria-label="Szukaj w tabeli"
              placeholder="Szukaj…"
              value={view.search}
              onChange={(event) => updateView((current) => ({ ...current, search: event.target.value }))}
              className="w-36 rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 lg:w-48"
            />
          </label>
          {filterableColumns.length > 0 && <>
            <IconButton label={activeFilterCount ? `Filtry — aktywne: ${activeFilterCount}` : "Filtry"} className={openPanel === "filters" || activeFilterCount ? "border-blue-500 bg-blue-50 text-blue-700" : ""} onClick={() => setOpenPanel((current) => current === "filters" ? null : "filters")}><ListFilter size={18} aria-hidden="true" /></IconButton>
            {openPanel === "filters" && <div className="absolute right-0 top-full z-40 mt-2 max-h-[70vh] w-96 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
              <div className="mb-2 flex items-center justify-between gap-3"><strong className="text-sm">Filtry</strong>{activeFilterCount > 0 && <button type="button" className="text-sm font-medium text-blue-700 hover:underline" onClick={() => updateView((current) => ({ ...current, filters: {} }))}>Wyczyść</button>}</div>
              <div className="space-y-2">{filterableColumns.map((column) => {
                const selectedCount = view.filters[column.key]?.length ?? 0;
                return <details key={column.key} className="rounded-lg border border-slate-200" open={selectedCount > 0 || filterableColumns.length === 1}>
                  <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-slate-700">{column.label}{selectedCount > 0 && <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">{selectedCount}</span>}</summary>
                  <div className="max-h-56 overflow-y-auto border-t border-slate-100 p-2">{renderFilterChoices(column)}</div>
                </details>;
              })}</div>
            </div>}
          </>}
          <IconButton label="Kolumny" className={openPanel === "columns" ? "border-blue-500 bg-blue-50 text-blue-700" : ""} onClick={() => setOpenPanel((current) => current === "columns" ? null : "columns")}><Columns3 size={18} aria-hidden="true" /></IconButton>
          {openPanel === "columns" && <div className="absolute right-0 top-full z-40 mt-2 max-h-96 w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
            {orderedColumns.filter((column) => column.hideable !== false).map((column, index) => (
              <div key={column.key} className="flex items-center gap-2 py-1 text-sm">
                <input type="checkbox" aria-label={`Pokaż ${column.label}`} checked={view.visible.includes(column.key)} onChange={() => updateView((current) => {
                  const visible = current.visible.includes(column.key) ? current.visible.filter((key) => key !== column.key) : [...current.visible, column.key];
                  return visible.length ? { ...current, visible } : current;
                })} />
                <span className="min-w-0 flex-1 whitespace-normal break-words leading-5">{column.label}</span>
                <button type="button" className="shrink-0 rounded border px-1.5 disabled:opacity-30" disabled={index === 0} onClick={() => moveColumn(column.key, -1)} aria-label={`Przesuń ${column.label} w lewo`}>←</button>
                <button type="button" className="shrink-0 rounded border px-1.5 disabled:opacity-30" disabled={index === orderedColumns.length - 1} onClick={() => moveColumn(column.key, 1)} aria-label={`Przesuń ${column.label} w prawo`}>→</button>
              </div>
            ))}
          </div>}
          <IconButton label="Profile widoku" className={openPanel === "profiles" ? "border-blue-500 bg-blue-50 text-blue-700" : ""} onClick={() => setOpenPanel((current) => current === "profiles" ? null : "profiles")}><Bookmark size={18} aria-hidden="true" /></IconButton>
          {openPanel === "profiles" && <div className="absolute right-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
            <label className="mb-3 block text-sm font-medium">Aktywny profil
              <select className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={activeProfile} onChange={(event) => applyProfile(event.target.value)}>
                <option value="custom">Bieżący widok</option><option value="default">Domyślny</option>{Object.keys(profiles).sort().map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <form className="flex gap-2" onSubmit={saveProfile}>
              <input className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm" value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="Nazwa profilu" />
              <button className="rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white">Zapisz</button>
            </form>
            {Object.keys(profiles).length > 0 && <div className="mt-3 border-t pt-2">{Object.keys(profiles).sort().map((name) => <div key={name} className="flex items-center justify-between gap-2 py-1 text-sm"><button className="min-w-0 flex-1 truncate text-left text-blue-700 hover:underline" onClick={() => applyProfile(name)}>{name}</button><button className="text-red-600 hover:underline" onClick={() => deleteProfile(name)}>Usuń</button></div>)}</div>}
          </div>}
          <IconButton label={`Eksport CSV${selectedCount ? ` — ${selectedCount} zaznaczonych` : ""}`} disabled={!rows.length} onClick={exportCsv}><Download size={18} aria-hidden="true" /></IconButton>
        </div>
      </div>
      <div className="border-b border-slate-200 bg-slate-50 px-3 pb-2 sm:hidden">
        <label className="relative block">
          <span className="sr-only">Szukaj w tabeli</span>
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="search" aria-label="Szukaj w tabeli" placeholder="Szukaj w tabeli…" value={view.search} onChange={(event) => updateView((current) => ({ ...current, search: event.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        </label>
      </div>
      {inlineError && <div role="alert" className="border-b border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{inlineError}</div>}
      {deleteSelectedError && <div role="alert" className="flex items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"><span>{deleteSelectedError}</span><button type="button" className="shrink-0 rounded p-1 hover:bg-red-100" aria-label="Zamknij komunikat o błędzie" onClick={() => setDeleteSelectedError("")}><X size={16} aria-hidden="true" /></button></div>}
      <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain">
        <table className="w-full table-fixed" style={{ minWidth, borderCollapse: "separate", borderSpacing: 0 }}>
          <thead><tr className="bg-slate-100 text-left text-sm text-slate-700">
            {selectable && <th className="sticky left-0 z-30 w-12 border-b-2 border-r border-slate-200 bg-slate-100 px-3 py-3 text-center"><input type="checkbox" aria-label="Zaznacz wszystkie rekordy spełniające filtr" checked={allFilteredSelected} disabled={!selectableIds.length} onChange={toggleAll} /></th>}
            {rowDrag && <th className="w-11 border-b-2 border-r border-slate-200 bg-slate-100 px-1 py-3"><span className="sr-only">Przeciągnij, aby powiązać</span></th>}
            {visibleColumns.map((column) => { const index = columns.indexOf(column); return (
              <th
                key={column.key}
                className={`relative border-b-2 px-3 py-3 font-semibold ${view.filters[column.key]?.length ? "border-blue-400 bg-blue-50 text-blue-900" : "border-slate-200 bg-slate-100"}`}
                style={{ width: columnWidths[index], textAlign: column.align }}
                onContextMenu={column.filterable ? (event) => { event.preventDefault(); openColumnFilter(column, event.clientX, event.clientY); } : undefined}
                title={column.filterable ? `Kliknij ikonę filtra lub użyj PPM, aby filtrować kolumnę ${column.label}` : undefined}
              >
                <div className="flex items-center gap-1">
                  <button type="button" className={column.sortable ? "flex min-w-0 flex-1 items-center gap-1 text-left hover:text-blue-700" : "min-w-0 flex-1 text-left"} onClick={() => toggleSort(column)}>{column.label}{column.sortable && <span aria-hidden="true">{view.sortKey === column.key ? (view.direction === "asc" ? "▲" : "▼") : "↕"}</span>}</button>
                  {column.filterable && <button
                    type="button"
                    aria-label={`Filtruj kolumnę ${column.label}`}
                    aria-haspopup="menu"
                    aria-expanded={columnFilterMenu?.columnKey === column.key}
                    className={`relative shrink-0 rounded p-1 transition-colors ${view.filters[column.key]?.length ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-200 hover:text-blue-700"}`}
                    onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); openColumnFilter(column, rect.right - 288, rect.bottom + 6); }}
                  >
                    <ListFilter size={15} aria-hidden="true" />
                    {(view.filters[column.key]?.length ?? 0) > 0 && <span className="sr-only">Aktywny filtr: {view.filters[column.key].length} wartości</span>}
                  </button>}
                </div>
                <span className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400" onMouseDown={(event) => startResize(event, index)} onDoubleClick={resetColumns} />
              </th>
            ); })}
            {hasActions && <th className="border-b-2 border-l border-slate-200 px-3 py-3 text-right font-semibold" style={{ width: actionWidth, minWidth: actionWidth, maxWidth: actionWidth, position: stickyActions ? "sticky" : undefined, right: stickyActions ? 0 : undefined, zIndex: 20, isolation: "isolate", backgroundColor: "#f1f5f9", boxShadow: stickyActions ? "-8px 0 14px -12px rgba(15,23,42,.9)" : undefined }}>Akcje</th>}
          </tr></thead>
          <tbody>
            {!loading && pageRows.length === 0 && <tr><td colSpan={visibleColumns.length + (hasActions ? 1 : 0) + (selectable ? 1 : 0) + (rowDrag ? 1 : 0)} className="px-4 py-12 text-center text-slate-500">{emptyMessage}</td></tr>}
            {pageRows.map((row, index) => {
              const id = String(getRowId(row)); const rowSelectable = isRowSelectable(row); const selected = rowSelectable && selectedIds.has(id); const background = selected ? "bg-blue-50" : index % 2 ? "bg-white" : "bg-slate-50";
              const isInlineEditing = inlineEditId === id && inlineDraft != null;
              const draggable = Boolean(rowDrag && (rowDrag.canDrag?.(row) ?? true));
              const isDragTarget = dragOverId === id && dragSource != null && dragSource !== row;
              return <tr key={getRowId(row)} ref={isInlineEditing ? inlineRowRef : undefined} aria-selected={selectable ? selected : undefined} onClick={(event) => handleRowClick(event, id, row)} onDragOver={rowDrag ? (event) => { if (!dragSource || dragSource === row) return; event.preventDefault(); event.dataTransfer.dropEffect = "link"; setDragOverId(id); } : undefined} onDragLeave={rowDrag ? () => { if (dragOverId === id) setDragOverId(null); } : undefined} onDrop={rowDrag ? (event) => { event.preventDefault(); const source = dragSource; setDragSource(null); setDragOverId(null); if (source && source !== row) rowDrag.onDrop(source, row); } : undefined} className={`${background} ${selectable && rowSelectable ? "transition-colors hover:bg-blue-50" : ""} ${isDragTarget ? "outline outline-2 -outline-offset-2 outline-blue-500" : ""} ${getRowClassName?.(row) ?? ""}`}>
                {selectable && <td className={`sticky left-0 z-20 border-b border-r border-slate-200 px-3 text-center ${background}`}><input type="checkbox" aria-label={`Zaznacz rekord ${id}`} checked={selected} disabled={!rowSelectable} onChange={(event) => changeRowSelection(id, event.target.checked, (event.nativeEvent as MouseEvent).shiftKey)} /></td>}
                {rowDrag && <td className={`border-b border-r border-slate-100 px-1 text-center ${background}`}><button type="button" draggable={draggable} disabled={!draggable} data-grid-ignore-selection="true" aria-label={rowDrag.label?.(row) ?? "Przeciągnij wiersz"} title={rowDrag.label?.(row) ?? "Przeciągnij wiersz"} onDragStart={(event) => { event.dataTransfer.effectAllowed = "link"; event.dataTransfer.setData("text/plain", id); setDragSource(row); }} onDragEnd={() => { setDragSource(null); setDragOverId(null); }} className="cursor-grab rounded p-1 text-slate-400 hover:bg-blue-50 hover:text-blue-700 active:cursor-grabbing disabled:cursor-default disabled:opacity-40"><GripVertical size={18} aria-hidden="true" /></button></td>}
                {visibleColumns.map((column) => {
                  const cellStartsInlineEdit = Boolean(onInlineSave && column.edit && !column.edit.disabled?.(row) && !isInlineEditing);
                  return <td
                    key={column.key}
                    className={`border-b border-slate-100 px-3 ${rowPadding} align-middle ${cellStartsInlineEdit ? "cursor-text hover:bg-blue-50" : ""}`}
                    style={{ textAlign: column.align }}
                    title={cellStartsInlineEdit ? `Kliknij, aby edytować: ${column.label}` : undefined}
                    data-grid-ignore-selection={cellStartsInlineEdit ? "true" : undefined}
                    tabIndex={cellStartsInlineEdit ? 0 : undefined}
                    onClick={cellStartsInlineEdit ? () => beginInlineEdit(row, column.key) : undefined}
                    onKeyDown={cellStartsInlineEdit ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); beginInlineEdit(row, column.key); } } : undefined}
                  >
                  {isInlineEditing && column.edit ? <DataGridCellEditor
                    column={column}
                    row={inlineDraft}
                    rowId={id}
                    autoFocus={inlineFocusKey === column.key}
                    saving={inlineSaving}
                    onChange={setInlineDraft}
                    onCancel={cancelInlineEdit}
                    onSave={() => void saveInlineEdit()}
                  /> : column.render ? column.render(row) : String(column.value(row) ?? "—")}
                </td>;})}
                {hasActions && <td className={`border-b border-l border-slate-200 px-3 ${rowPadding} text-right`} style={{ width: actionWidth, minWidth: actionWidth, maxWidth: actionWidth, position: stickyActions ? "sticky" : undefined, right: stickyActions ? 0 : undefined, zIndex: 10, isolation: "isolate", overflow: "hidden", backgroundColor: selected ? "#eff6ff" : index % 2 ? "#ffffff" : "#f8fafc", boxShadow: stickyActions ? "-8px 0 14px -12px rgba(15,23,42,.9)" : undefined }}><div className="flex flex-nowrap items-center justify-end gap-1">{isInlineEditing ? <><IconButton label="Zapisz zmiany w wierszu" tone="primary" disabled={inlineSaving} onClick={() => void saveInlineEdit()}><Check size={18} aria-hidden="true" /></IconButton><IconButton label="Anuluj edycję wiersza" disabled={inlineSaving} onClick={cancelInlineEdit}><X size={18} aria-hidden="true" /></IconButton></> : actions?.(row)}</div></td>}
              </tr>;
            })}
          </tbody>
          {columns.some((column) => column.summary) && <tfoot>
            <tr aria-label="Podsumowanie tabeli" className="border-t-2 border-blue-200 bg-blue-50 font-bold text-blue-950">
              {selectable && <td />}
              {rowDrag && <td />}
              {visibleColumns.map((column) => <td key={column.key} className={`px-3 py-3 ${column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left"}`}>{column.summary?.(filteredRows)}</td>)}
              {hasActions && <td />}
            </tr>
          </tfoot>}
        </table>
      </div>
      {columnFilterMenu && (() => {
        const column = filterableColumns.find((item) => item.key === columnFilterMenu.columnKey);
        if (!column) return null;
        const selectedCount = view.filters[column.key]?.length ?? 0;
        return <div
          ref={columnFilterMenuRef}
          role="menu"
          aria-label={`Filtr kolumny ${column.label}`}
          className="fixed z-[100] w-72 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
          style={{ left: columnFilterMenu.x, top: columnFilterMenu.y }}
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2">
            <div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-800">{column.label}</div><div className="text-xs text-slate-500">Wybierz jedną lub kilka wartości</div></div>
            <button type="button" aria-label="Zamknij filtr kolumny" className="rounded p-1 text-slate-500 hover:bg-slate-200" onClick={() => setColumnFilterMenu(null)}><X size={16} aria-hidden="true" /></button>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">{renderFilterChoices(column, true)}</div>
          {selectedCount > 0 && <div className="border-t border-slate-100 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800">Aktywny filtr: {selectedCount} {selectedCount === 1 ? "wartość" : "wartości"}</div>}
        </div>;
      })()}
      {showFooter && <footer className="flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t border-slate-200 bg-slate-50 px-3 py-2 text-sm">
        <div className="flex flex-wrap items-center gap-3"><span className="font-medium text-slate-600">{loading ? "Odświeżanie…" : `${filteredRows.length}${filteredRows.length !== rows.length ? ` z ${rows.length}` : ""} rekordów${selectedCount ? ` · zaznaczono ${selectedCount}` : ""}`}</span><select aria-label="Liczba rekordów na stronę" title="Liczba rekordów na stronę" className="rounded border border-slate-300 bg-white px-2 py-1" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option>10</option><option>25</option><option>50</option></select></div>
        <div className="flex items-center gap-2"><button className="rounded border bg-white px-3 py-1 disabled:opacity-40" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>‹</button><span>Strona {safePage} z {totalPages}</span><button className="rounded border bg-white px-3 py-1 disabled:opacity-40" disabled={safePage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>›</button></div>
      </footer>}
      <ConfirmModal
        open={deleteSelectedOpen && selectedRows.length > 0}
        title={`Usuń zaznaczone rekordy (${selectedRows.length})`}
        message={deleteSelectedConfirmMessage?.(selectedRows) ?? `Czy na pewno usunąć ${selectedRows.length} zaznaczone rekordy? Tej operacji nie można cofnąć.`}
        confirmLabel="Usuń zaznaczone"
        cancelLabel="Anuluj"
        busy={deletingSelected}
        onConfirm={() => void deleteSelected()}
        onCancel={() => { if (!deletingSelected) setDeleteSelectedOpen(false); }}
      />
    </section>
  );
}
