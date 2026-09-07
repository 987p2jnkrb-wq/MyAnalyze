import type { FilterDefaults, GridView } from "./types";

export const EMPTY_FILTERS: FilterDefaults = {};

function normalizeFilterValues(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return Array.from(new Set(values.map(String).filter(Boolean)));
}

export function normalizeFilters(filters: Record<string, unknown> | undefined): Record<string, string[]> {
  if (!filters) return {};
  return Object.fromEntries(Object.entries(filters)
    .map(([key, value]) => [key, normalizeFilterValues(value)] as const)
    .filter(([, values]) => values.length > 0));
}

function mergeColumnOrder(savedOrder: string[] | undefined, columnKeys: string[]): string[] {
  const merged = (savedOrder ?? []).filter((key) => columnKeys.includes(key));
  for (const key of columnKeys) {
    if (merged.includes(key)) continue;
    const defaultIndex = columnKeys.indexOf(key);
    const previous = [...columnKeys.slice(0, defaultIndex)].reverse().find((candidate) => merged.includes(candidate));
    const next = columnKeys.slice(defaultIndex + 1).find((candidate) => merged.includes(candidate));
    if (previous) merged.splice(merged.indexOf(previous) + 1, 0, key);
    else if (next) merged.splice(merged.indexOf(next), 0, key);
    else merged.push(key);
  }
  return merged;
}

export function reconcileSavedView(saved: Partial<GridView>, defaults: GridView, columnKeys: string[], defaultVisible: string[]): GridView {
  const savedOrder = saved.order?.length ? saved.order : columnKeys;
  const newKeys = columnKeys.filter((key) => !savedOrder.includes(key));
  const visible = (saved.visible ?? defaultVisible).filter((key) => columnKeys.includes(key));
  for (const key of newKeys) if (defaultVisible.includes(key) && !visible.includes(key)) visible.push(key);
  return {
    ...defaults,
    ...saved,
    visible,
    order: mergeColumnOrder(savedOrder, columnKeys),
    filters: normalizeFilters(saved.filters as unknown as Record<string, unknown> | undefined),
    search: typeof saved.search === "string" ? saved.search : "",
  };
}

export function compareValues(left: unknown, right: unknown): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right), "pl", { numeric: true, sensitivity: "base" });
}

export function csvCell(value: unknown): string {
  const text = String(value ?? "").replace(/\r?\n/g, " ").replace(/"/g, '""');
  return `"${text}"`;
}
