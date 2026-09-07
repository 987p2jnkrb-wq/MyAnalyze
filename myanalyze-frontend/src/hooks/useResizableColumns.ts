import { useCallback, useEffect, useRef, useState } from "react";

type ActiveResize = {
  column: number;
  startX: number;
  startWidth: number;
} | null;

export function useResizableColumns(
  storageKey: string,
  defaultWidths: number[],
  minimumWidth = 70,
) {
  const [columnWidths, setColumnWidths] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      const parsed = saved ? JSON.parse(saved) : null;
      if (
        Array.isArray(parsed) &&
        parsed.length === defaultWidths.length &&
        parsed.every((width) => typeof width === "number" && Number.isFinite(width))
      ) {
        return parsed;
      }
    } catch {
      // Ignore invalid settings left by older versions of the app.
    }
    return defaultWidths;
  });

  const activeResize = useRef<ActiveResize>(null);

  const stopResize = useCallback(() => {
    activeResize.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  const handleResize = useCallback((event: MouseEvent) => {
    const active = activeResize.current;
    if (!active) return;

    const width = Math.max(minimumWidth, active.startWidth + event.clientX - active.startX);
    setColumnWidths((previous) => {
      if (previous[active.column] === width) return previous;
      const next = [...previous];
      next[active.column] = width;
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, [minimumWidth, storageKey]);

  useEffect(() => {
    window.addEventListener("mousemove", handleResize);
    window.addEventListener("mouseup", stopResize);
    window.addEventListener("blur", stopResize);
    return () => {
      window.removeEventListener("mousemove", handleResize);
      window.removeEventListener("mouseup", stopResize);
      window.removeEventListener("blur", stopResize);
      stopResize();
    };
  }, [handleResize, stopResize]);

  const startResize = useCallback((event: React.MouseEvent, column: number) => {
    event.preventDefault();
    event.stopPropagation();
    activeResize.current = {
      column,
      startX: event.clientX,
      startWidth: columnWidths[column],
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [columnWidths]);

  const resetColumns = useCallback(() => {
    setColumnWidths(defaultWidths);
    localStorage.removeItem(storageKey);
  }, [defaultWidths, storageKey]);

  const applyColumnWidths = useCallback((widths: number[]) => {
    if (widths.length !== defaultWidths.length || widths.some((width) => !Number.isFinite(width))) return;
    const normalized = widths.map((width) => Math.max(minimumWidth, width));
    setColumnWidths(normalized);
    localStorage.setItem(storageKey, JSON.stringify(normalized));
  }, [defaultWidths.length, minimumWidth, storageKey]);

  return { columnWidths, startResize, resetColumns, applyColumnWidths };
}
