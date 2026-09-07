import React from "react";
import DecimalInput from "../DecimalInput";
import type { DataGridColumn } from "./types";

interface DataGridCellEditorProps<T> {
  column: DataGridColumn<T>;
  row: T;
  rowId: string;
  autoFocus: boolean;
  saving: boolean;
  onChange: (row: T) => void;
  onCancel: () => void;
  onSave: () => void;
}

export default function DataGridCellEditor<T>({
  column,
  row,
  rowId,
  autoFocus,
  saving,
  onChange,
  onCancel,
  onSave,
}: DataGridCellEditorProps<T>) {
  const editor = column.edit;
  if (!editor) return null;

  const currentValue = editor.value(row);
  const disabled = saving || editor.disabled?.(row);
  const common = {
    "aria-label": `${column.label} — edycja wiersza ${rowId}`,
    autoFocus,
    disabled,
    className: "w-full min-w-0 rounded-md border border-blue-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100",
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") onCancel();
    if (event.key === "Enter") {
      event.preventDefault();
      onSave();
    }
  };

  if (editor.type === "select") {
    return <select {...common} value={String(currentValue)} onChange={(event) => onChange(editor.update(row, event.target.value))}>
      {(editor.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>;
  }
  if (editor.type === "checkbox") {
    return <input
      aria-label={`${column.label} — edycja wiersza ${rowId}`}
      autoFocus={autoFocus}
      disabled={disabled}
      className="h-5 w-5 rounded border-slate-300"
      type="checkbox"
      checked={Boolean(currentValue)}
      onChange={(event) => onChange(editor.update(row, event.target.checked))}
      onKeyDown={(event) => { if (event.key === "Escape") onCancel(); }}
    />;
  }
  if (editor.type === "number" && editor.step !== 1) {
    return <DecimalInput
      {...common}
      min={editor.min}
      max={editor.max}
      value={String(currentValue)}
      onValueChange={(value) => onChange(editor.update(row, value.replace(",", ".")))}
      onKeyDown={handleKeyDown}
    />;
  }
  return <input
    {...common}
    type={editor.type ?? "text"}
    min={editor.min}
    max={editor.max}
    step={editor.step}
    value={String(currentValue)}
    onChange={(event) => onChange(editor.update(row, event.target.value))}
    onKeyDown={handleKeyDown}
  />;
}
