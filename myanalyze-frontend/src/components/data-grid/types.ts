import type { Key, ReactNode } from "react";

export interface DataGridColumn<T> {
  key: string;
  label: string;
  value: (row: T) => unknown;
  render?: (row: T) => ReactNode;
  exportValue?: (row: T) => unknown;
  /** Summary over all filtered rows, across pages; enabled only when supplied. */
  summary?: (rows: T[]) => ReactNode;
  sortable?: boolean;
  hideable?: boolean;
  defaultVisible?: boolean;
  width?: number;
  align?: "left" | "center" | "right";
  filterable?: boolean;
  filterOptions?: string[];
  edit?: {
    type?: "text" | "number" | "date" | "select" | "checkbox";
    value: (row: T) => string | number | boolean;
    update: (row: T, value: string | number | boolean) => T;
    options?: { value: string; label: string }[];
    min?: number;
    max?: number;
    step?: number;
    disabled?: (row: T) => boolean;
  };
}

export interface GridView {
  visible: string[];
  order: string[];
  sortKey: string | null;
  direction: "asc" | "desc";
  filters: Record<string, string[]>;
  search: string;
}

export interface GridProfile {
  view: GridView;
  widths: number[];
}

export type FilterDefaults = Record<string, string | string[]>;

export interface DataGridRefreshConfig {
  onRefresh: () => unknown | Promise<unknown>;
  refreshing?: boolean;
  label?: string;
}

export interface DataGridProps<T> {
  gridId: string;
  rows: T[];
  columns: DataGridColumn<T>[];
  getRowId: (row: T) => Key;
  actions?: (row: T) => ReactNode;
  loading?: boolean;
  emptyMessage?: string;
  defaultPageSize?: number;
  defaultSort?: { key: string; direction: "asc" | "desc" };
  defaultFilters?: FilterDefaults;
  toolbar?: ReactNode;
  refresh?: DataGridRefreshConfig;
  bulkActions?: (rows: T[]) => ReactNode;
  stickyActions?: boolean;
  selectable?: boolean;
  isRowSelectable?: (row: T) => boolean;
  exportFileName?: string;
  actionsWidth?: number;
  onFilteredRowsChange?: (rows: T[]) => void;
  onInlineSave?: (row: T) => Promise<void>;
  validateInlineRow?: (row: T) => string | null;
  showFooter?: boolean;
  preserveRowOrder?: boolean;
  getRowClassName?: (row: T) => string;
  rowDrag?: {
    label?: (row: T) => string;
    canDrag?: (row: T) => boolean;
    onDrop: (source: T, target: T) => void;
  };
  onDeleteSelected?: (rows: T[]) => Promise<void>;
  deleteSelectedConfirmMessage?: (rows: T[]) => string;
}
