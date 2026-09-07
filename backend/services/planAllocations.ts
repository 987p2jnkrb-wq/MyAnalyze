import type { Database } from "sqlite";

export type PlanAllocationKind = "income" | "expense";
export type PlanAllocationSource = "one_time" | "recurring";

export interface PlanAllocationInput {
  actualKind: PlanAllocationKind;
  actualId: number;
  planSource: PlanAllocationSource;
  planId: number;
  occurrenceDate?: string | null;
  allocatedAmount: number;
}

const occurrenceKey = (value?: string | null): string => value ?? "";

export async function allocatedToPlan(db: Database, kind: PlanAllocationKind, source: PlanAllocationSource, planId: number, occurrenceDate?: string | null): Promise<number> {
  const row = await db.get<{ total: number | null }>(
    `SELECT SUM(allocated_amount) AS total FROM transaction_plan_allocations
     WHERE actual_kind = ? AND plan_source = ? AND plan_id = ? AND COALESCE(occurrence_date, '') = ?`,
    [kind, source, planId, occurrenceKey(occurrenceDate)],
  );
  return Math.round(Number(row?.total ?? 0) * 100) / 100;
}

export async function addPlanAllocation(db: Database, input: PlanAllocationInput): Promise<void> {
  await db.run(
    `INSERT INTO transaction_plan_allocations
     (actual_kind, actual_id, plan_source, plan_id, occurrence_date, allocated_amount)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [input.actualKind, input.actualId, input.planSource, input.planId, occurrenceKey(input.occurrenceDate), input.allocatedAmount],
  );
}

export async function removeAllocationsForActual(db: Database, actualKind: PlanAllocationKind, actualId: number): Promise<void> {
  await db.run("DELETE FROM transaction_plan_allocations WHERE actual_kind = ? AND actual_id = ?", [actualKind, actualId]);
}

export async function removeAllocationsForPlan(db: Database, kind: PlanAllocationKind, source: PlanAllocationSource, planId: number): Promise<void> {
  await db.run("DELETE FROM transaction_plan_allocations WHERE actual_kind = ? AND plan_source = ? AND plan_id = ?", [kind, source, planId]);
}

export async function replaceAllocationsForActual(db: Database, actualKind: PlanAllocationKind, actualId: number, allocations: Array<Omit<PlanAllocationInput, "actualKind" | "actualId">>): Promise<void> {
  await removeAllocationsForActual(db, actualKind, actualId);
  for (const allocation of allocations) await addPlanAllocation(db, { ...allocation, actualKind, actualId });
}
