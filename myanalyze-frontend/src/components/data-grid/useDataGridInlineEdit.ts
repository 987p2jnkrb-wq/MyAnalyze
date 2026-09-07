import React from "react";
import type { DataGridColumn } from "./types";

interface UseDataGridInlineEditOptions<T> {
  columns: DataGridColumn<T>[];
  getRowId: (row: T) => React.Key;
  onInlineSave?: (row: T) => Promise<void>;
  validateInlineRow?: (row: T) => string | null;
}

export function useDataGridInlineEdit<T>({
  columns,
  getRowId,
  onInlineSave,
  validateInlineRow,
}: UseDataGridInlineEditOptions<T>) {
  const rowRef = React.useRef<HTMLTableRowElement | null>(null);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [original, setOriginal] = React.useState<T | null>(null);
  const [draft, setDraft] = React.useState<T | null>(null);
  const [focusKey, setFocusKey] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const sessionRef = React.useRef(0);
  const saveInFlightRef = React.useRef(false);

  const clearEditor = React.useCallback(() => {
    setEditId(null);
    setOriginal(null);
    setDraft(null);
    setFocusKey(null);
  }, []);

  const begin = React.useCallback((row: T, nextFocusKey?: string) => {
    if (saveInFlightRef.current) return;
    sessionRef.current += 1;
    setEditId(String(getRowId(row)));
    setOriginal(row);
    setDraft(row);
    setFocusKey(nextFocusKey ?? columns.find((column) => column.edit)?.key ?? null);
    setError("");
  }, [columns, getRowId]);

  const cancel = React.useCallback(() => {
    if (saveInFlightRef.current) return;
    sessionRef.current += 1;
    clearEditor();
    setError("");
  }, [clearEditor]);

  const save = React.useCallback(async () => {
    if (!draft || !onInlineSave || saveInFlightRef.current) return;
    const session = sessionRef.current;
    const currentDraft = draft;
    const changed = !original || columns.some((column) => column.edit
      && String(column.edit.value(original) ?? "") !== String(column.edit.value(currentDraft) ?? ""));
    if (!changed) {
      sessionRef.current += 1;
      clearEditor();
      setError("");
      return;
    }
    const validationError = validateInlineRow?.(currentDraft);
    if (validationError) {
      setError(validationError);
      return;
    }

    saveInFlightRef.current = true;
    setSaving(true);
    setError("");
    try {
      await onInlineSave(currentDraft);
      if (sessionRef.current === session) clearEditor();
    } catch (caught) {
      const message = caught instanceof Error && caught.message ? caught.message : "Nie udało się zapisać zmian. Spróbuj ponownie.";
      setError(sessionRef.current === session ? message : `Nie udało się zapisać poprzednio edytowanego wiersza. ${message}`);
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }, [clearEditor, columns, draft, onInlineSave, original, validateInlineRow]);

  React.useEffect(() => {
    if (!draft || saving) return;
    const saveWhenClickingOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && rowRef.current && !rowRef.current.contains(target)) void save();
    };
    document.addEventListener("pointerdown", saveWhenClickingOutside, true);
    return () => document.removeEventListener("pointerdown", saveWhenClickingOutside, true);
  }, [draft, save, saving]);

  return {
    rowRef,
    editId,
    draft,
    focusKey,
    saving,
    error,
    setDraft,
    begin,
    cancel,
    save,
  };
}
