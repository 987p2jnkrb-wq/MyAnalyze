export function parseRequiredNumber(value: string): number {
  return value.trim() === "" ? Number.NaN : Number(value.trim().replace(",", "."));
}
