export type IncomeCertainty = "guaranteed" | "expected" | "potential";

export const INCOME_CERTAINTY_OPTIONS: ReadonlyArray<{ value: IncomeCertainty; label: string }> = [
  { value: "guaranteed", label: "Pewny" },
  { value: "expected", label: "Oczekiwany" },
  { value: "potential", label: "Potencjalny" },
];

export function normalizeIncomeCertainty(value: unknown): IncomeCertainty {
  return value === "guaranteed" || value === "potential" ? value : "expected";
}

export function incomeCertaintyLabel(value: IncomeCertainty | null | undefined): string {
  return INCOME_CERTAINTY_OPTIONS.find((option) => option.value === value)?.label ?? "Oczekiwany";
}
