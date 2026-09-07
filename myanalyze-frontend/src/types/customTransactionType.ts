export interface CustomTransactionType {
  id: number;
  name: string;
  active: boolean;
}

export function normalizeCustomTransactionType(value: Record<string, unknown>): CustomTransactionType {
  return { id: Number(value.id), name: String(value.name ?? ""), active: value.active === true || value.active === 1 || value.active === "1" };
}
