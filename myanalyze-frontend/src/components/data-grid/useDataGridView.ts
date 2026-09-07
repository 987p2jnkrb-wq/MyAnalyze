import React from "react";
import { compareValues, normalizeFilters, reconcileSavedView } from "./model";
import type { DataGridColumn, FilterDefaults, GridProfile, GridView } from "./types";

interface UseDataGridViewOptions<T> {
  gridId: string;
  rows: T[];
  columns: DataGridColumn<T>[];
  defaultSort?: { key: string; direction: "asc" | "desc" };
  defaultFilters: FilterDefaults;
  preserveRowOrder: boolean;
  onFilteredRowsChange?: (rows: T[]) => void;
  columnWidths: number[];
  resetColumns: () => void;
  applyColumnWidths: (widths: number[]) => void;
}

export function useDataGridView<T>({
  gridId,
  rows,
  columns,
  defaultSort,
  defaultFilters,
  preserveRowOrder,
  onFilteredRowsChange,
  columnWidths,
  resetColumns,
  applyColumnWidths,
}: UseDataGridViewOptions<T>) {
  const columnKeys = React.useMemo(() => columns.map((column) => column.key), [columns]);
  const defaultVisible = React.useMemo(() => columns.filter((column) => column.defaultVisible !== false).map((column) => column.key), [columns]);
  const viewKey = `myanalyze.grid.${gridId}.view`;
  const profilesKey = `myanalyze.grid.${gridId}.profiles`;
  const normalizedDefaultFilters = React.useMemo(() => normalizeFilters(defaultFilters), [defaultFilters]);
  const defaults = React.useMemo<GridView>(() => ({
    visible: defaultVisible,
    order: columnKeys,
    sortKey: defaultSort?.key ?? null,
    direction: defaultSort?.direction ?? "asc",
    filters: normalizedDefaultFilters,
    search: "",
  }), [columnKeys, defaultVisible, normalizedDefaultFilters, defaultSort?.key, defaultSort?.direction]);
  const [view, setView] = React.useState<GridView>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(viewKey) || "null") as Partial<GridView> | null;
      if (!saved?.visible) return defaults;
      const reconciled = reconcileSavedView(saved, defaults, columnKeys, defaultVisible);
      return Object.keys(reconciled.filters).length ? reconciled : { ...reconciled, filters: normalizedDefaultFilters };
    } catch {
      return defaults;
    }
  });
  const [profiles, setProfiles] = React.useState<Record<string, GridProfile>>(() => {
    try {
      return JSON.parse(localStorage.getItem(profilesKey) || "{}") as Record<string, GridProfile>;
    } catch {
      return {};
    }
  });
  const [activeProfile, setActiveProfile] = React.useState("custom");

  React.useEffect(() => { localStorage.setItem(viewKey, JSON.stringify(view)); }, [viewKey, view]);
  React.useEffect(() => { localStorage.setItem(profilesKey, JSON.stringify(profiles)); }, [profilesKey, profiles]);

  const orderedColumns = React.useMemo(() => {
    const byKey = new Map(columns.map((column) => [column.key, column]));
    return [...view.order, ...columnKeys.filter((key) => !view.order.includes(key))]
      .map((key) => byKey.get(key))
      .filter((column): column is DataGridColumn<T> => Boolean(column));
  }, [columns, columnKeys, view.order]);
  const visibleColumns = React.useMemo(
    () => orderedColumns.filter((column) => view.visible.includes(column.key)),
    [orderedColumns, view.visible],
  );
  const filterableColumns = React.useMemo(() => columns.filter((column) => column.filterable), [columns]);
  const filterOptions = React.useMemo<Record<string, string[]>>(() => Object.fromEntries(filterableColumns.map((column) => [
    column.key,
    Array.from(new Set([
      ...(column.filterOptions ?? []),
      ...rows.map((row) => String(column.value(row) ?? "")),
    ])).filter(Boolean).sort((a, b) => a.localeCompare(b, "pl", { numeric: true })),
  ])), [filterableColumns, rows]);
  const activeFilterCount = filterableColumns.filter((column) => (view.filters[column.key]?.length ?? 0) > 0).length;

  React.useEffect(() => {
    if (!rows.length) return;
    setView((current) => {
      let changed = false;
      const filters = { ...current.filters };
      for (const column of filterableColumns) {
        const selected = filters[column.key] ?? [];
        const available = filterOptions[column.key] ?? [];
        const valid = selected.filter((value) => available.includes(value));
        if (valid.length !== selected.length) {
          const fallback = normalizedDefaultFilters[column.key]?.filter((value) => available.includes(value)) ?? [];
          if (valid.length) filters[column.key] = valid;
          else if (fallback.length) filters[column.key] = fallback;
          else delete filters[column.key];
          changed = true;
        }
      }
      return changed ? { ...current, filters } : current;
    });
  }, [filterOptions, filterableColumns, normalizedDefaultFilters, rows.length]);

  const filteredRows = React.useMemo(() => {
    const query = view.search.trim().toLocaleLowerCase("pl-PL");
    return rows.filter((row) => {
      const matchesSearch = !query || columns.some((column) => String(column.value(row) ?? "").toLocaleLowerCase("pl-PL").includes(query));
      const matchesFilters = filterableColumns.every((column) => {
        const selected = view.filters[column.key] ?? [];
        return selected.length === 0 || selected.includes(String(column.value(row) ?? ""));
      });
      return matchesSearch && matchesFilters;
    });
  }, [rows, columns, filterableColumns, view.filters, view.search]);
  React.useEffect(() => { onFilteredRowsChange?.(filteredRows); }, [filteredRows, onFilteredRowsChange]);
  const sortedRows = React.useMemo(() => {
    const result = [...filteredRows];
    if (preserveRowOrder) return result;
    const column = columns.find((item) => item.key === view.sortKey);
    if (column) result.sort((a, b) => compareValues(column.value(a), column.value(b)) * (view.direction === "asc" ? 1 : -1));
    return result;
  }, [filteredRows, columns, preserveRowOrder, view.sortKey, view.direction]);

  const updateView = React.useCallback((updater: (current: GridView) => GridView) => {
    setActiveProfile("custom");
    setView(updater);
  }, []);
  const toggleColumnFilterValue = React.useCallback((columnKey: string, value: string) => updateView((current) => {
    const selected = current.filters[columnKey] ?? [];
    const nextSelected = selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value];
    const filters = { ...current.filters };
    if (nextSelected.length) filters[columnKey] = nextSelected;
    else delete filters[columnKey];
    return { ...current, filters };
  }), [updateView]);
  const clearColumnFilter = React.useCallback((columnKey: string) => updateView((current) => {
    if (!current.filters[columnKey]?.length) return current;
    const filters = { ...current.filters };
    delete filters[columnKey];
    return { ...current, filters };
  }), [updateView]);
  const toggleSort = React.useCallback((column: DataGridColumn<T>) => {
    if (!column.sortable) return;
    updateView((current) => current.sortKey === column.key
      ? { ...current, direction: current.direction === "asc" ? "desc" : "asc" }
      : { ...current, sortKey: column.key, direction: "asc" });
  }, [updateView]);
  const moveColumn = React.useCallback((key: string, direction: -1 | 1) => updateView((current) => {
    const order = [...current.order];
    const index = order.indexOf(key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return current;
    [order[index], order[target]] = [order[target], order[index]];
    return { ...current, order };
  }), [updateView]);
  const saveProfile = React.useCallback((name: string) => {
    setProfiles((current) => ({ ...current, [name]: { view, widths: columnWidths } }));
    setActiveProfile(name);
  }, [columnWidths, view]);
  const applyProfile = React.useCallback((name: string) => {
    setActiveProfile(name);
    if (name === "default") {
      setView(defaults);
      resetColumns();
      return;
    }
    if (name === "custom") return;
    const profile = profiles[name];
    if (!profile) return;
    setView(reconcileSavedView(profile.view, defaults, columnKeys, defaultVisible));
    applyColumnWidths(profile.widths);
  }, [applyColumnWidths, columnKeys, defaultVisible, defaults, profiles, resetColumns]);
  const deleteProfile = React.useCallback((name: string) => {
    setProfiles((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
    setActiveProfile((current) => current === name ? "custom" : current);
  }, []);

  return {
    view,
    updateView,
    profiles,
    activeProfile,
    orderedColumns,
    visibleColumns,
    filterableColumns,
    filterOptions,
    activeFilterCount,
    filteredRows,
    sortedRows,
    toggleColumnFilterValue,
    clearColumnFilter,
    toggleSort,
    moveColumn,
    saveProfile,
    applyProfile,
    deleteProfile,
  };
}
