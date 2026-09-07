export async function deleteSelectedRows<T>(
  rows: T[],
  remove: (row: T) => Promise<void>,
  refresh?: () => Promise<void>,
): Promise<number> {
  let deleted = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await remove(row);
      deleted += 1;
    } catch {
      failed += 1;
    }
  }

  await refresh?.();

  if (failed > 0) {
    if (deleted === 0) throw new Error(`Nie udało się usunąć zaznaczonych rekordów (${failed}).`);
    throw new Error(`Usunięto ${deleted} z ${rows.length} rekordów. Pozostałe (${failed}) nadal są zaznaczone.`);
  }

  return deleted;
}
