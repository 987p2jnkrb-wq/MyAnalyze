import React from "react";

interface UseDataGridSelectionOptions<T> {
  rows: T[];
  getRowId: (row: T) => React.Key;
  selectable: boolean;
  isRowSelectable: (row: T) => boolean;
  selectionScope: React.Key | null;
}

export function useDataGridSelection<T>({
  rows,
  getRowId,
  selectable,
  isRowSelectable,
  selectionScope,
}: UseDataGridSelectionOptions<T>) {
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set());
  const selectionAnchorId = React.useRef<string | null>(null);

  const clearSelection = React.useCallback(() => {
    setSelectedIds(new Set());
    selectionAnchorId.current = null;
  }, []);

  React.useEffect(() => {
    clearSelection();
  }, [clearSelection, selectionScope]);

  const selectableIds = React.useMemo(
    () => rows.filter(isRowSelectable).map((row) => String(getRowId(row))),
    [getRowId, isRowSelectable, rows],
  );
  const allFilteredSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));
  const selectedRows = React.useMemo(
    () => rows.filter((row) => isRowSelectable(row) && selectedIds.has(String(getRowId(row)))),
    [getRowId, isRowSelectable, rows, selectedIds],
  );

  const changeRowSelection = React.useCallback((id: string, checked: boolean, shiftKey: boolean) => {
    const anchorId = selectionAnchorId.current;
    const anchorIndex = anchorId ? rows.findIndex((row) => String(getRowId(row)) === anchorId) : -1;
    const targetIndex = rows.findIndex((row) => String(getRowId(row)) === id);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (shiftKey && anchorIndex >= 0 && targetIndex >= 0) {
        const start = Math.min(anchorIndex, targetIndex);
        const end = Math.max(anchorIndex, targetIndex);
        for (const row of rows.slice(start, end + 1).filter(isRowSelectable)) {
          const rangeId = String(getRowId(row));
          if (checked) next.add(rangeId);
          else next.delete(rangeId);
        }
      } else if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
    if (!shiftKey || anchorIndex < 0) selectionAnchorId.current = id;
  }, [getRowId, isRowSelectable, rows]);

  const handleRowClick = React.useCallback((event: React.MouseEvent<HTMLTableRowElement>, id: string, row: T) => {
    if (!selectable || !isRowSelectable(row) || !(event.target instanceof Element)) return;
    if (event.target.closest("button, input, select, textarea, a, [data-grid-ignore-selection='true']")) return;
    const textSelection = window.getSelection();
    if (textSelection && !textSelection.isCollapsed && textSelection.toString().trim()) return;
    changeRowSelection(id, event.shiftKey ? true : !selectedIds.has(id), event.shiftKey);
  }, [changeRowSelection, isRowSelectable, selectable, selectedIds]);

  const toggleAll = React.useCallback(() => {
    selectionAnchorId.current = null;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allFilteredSelected) selectableIds.forEach((id) => next.delete(id));
      else selectableIds.forEach((id) => next.add(id));
      return next;
    });
  }, [allFilteredSelected, selectableIds]);

  return {
    selectedIds,
    selectedRows,
    selectedCount: selectedRows.length,
    selectableIds,
    allFilteredSelected,
    changeRowSelection,
    handleRowClick,
    toggleAll,
    clearSelection,
  };
}
