import ModuleBadge from "../ModuleBadge";
import type { DataGridColumn } from "./types";

export type ActiveStatusFilterValue = "active" | "all" | "inactive";

export const ACTIVE_STATUS_OPTIONS: ReadonlyArray<{ value: ActiveStatusFilterValue; label: string }> = [
  { value: "active", label: "Aktywne" },
  { value: "all", label: "Wszystkie" },
  { value: "inactive", label: "Nieaktywne" },
];

export const ACTIVE_STATUS_EDIT_OPTIONS = [
  { value: "1", label: "Aktywne" },
  { value: "0", label: "Nieaktywne" },
];

export function activeStatusLabel(active: boolean | undefined): string {
  return active === false ? "Nieaktywne" : "Aktywne";
}

export function matchesActiveStatus(active: boolean | undefined, filter: ActiveStatusFilterValue): boolean {
  if (filter === "all") return true;
  return filter === "active" ? active !== false : active === false;
}

export function filterByActiveStatus<T extends { active?: boolean }>(rows: T[], filter: ActiveStatusFilterValue): T[] {
  return rows.filter((row) => matchesActiveStatus(row.active, filter));
}

export function activeStatusColumn<T extends { active?: boolean }>(): DataGridColumn<T> {
  return {
    key: "active",
    label: "Status",
    value: (row) => activeStatusLabel(row.active),
    render: (row) => <ModuleBadge size="sm" tone={row.active === false ? "neutral" : "success"}>{activeStatusLabel(row.active)}</ModuleBadge>,
    sortable: true,
    filterable: true,
    width: 125,
    edit: {
      type: "select",
      value: (row) => row.active === false ? "0" : "1",
      options: ACTIVE_STATUS_EDIT_OPTIONS,
      update: (row, value) => ({ ...row, active: String(value) === "1" }),
    },
  };
}

export function ActiveStatusFilter({
  value,
  onChange,
  ariaLabel = "Status",
  label = "Status",
}: {
  value: ActiveStatusFilterValue;
  onChange: (value: ActiveStatusFilterValue) => void;
  ariaLabel?: string;
  label?: string;
}) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {label}{" "}
      <select
        aria-label={ariaLabel}
        className="ml-1 rounded border border-slate-300 bg-white px-2 py-1.5 font-normal"
        value={value}
        onChange={(event) => onChange(event.target.value as ActiveStatusFilterValue)}
      >
        {ACTIVE_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
