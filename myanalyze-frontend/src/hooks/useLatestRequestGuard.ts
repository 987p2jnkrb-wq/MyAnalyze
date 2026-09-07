import React from "react";

/**
 * Chroni stan UI przed spóźnioną odpowiedzią starszego requestu.
 * Każdy nowy request unieważnia poprzedni; invalidate() przydaje się po
 * lokalnej mutacji, kiedy nie chcemy dopuścić do nadpisania stanu starym GET-em.
 */
export function useLatestRequestGuard() {
  const versionRef = React.useRef(0);

  const begin = React.useCallback(() => {
    versionRef.current += 1;
    return versionRef.current;
  }, []);

  const isLatest = React.useCallback((version: number) => version === versionRef.current, []);

  const invalidate = React.useCallback(() => {
    versionRef.current += 1;
  }, []);

  React.useEffect(() => () => {
    versionRef.current += 1;
  }, []);

  return { begin, isLatest, invalidate };
}
