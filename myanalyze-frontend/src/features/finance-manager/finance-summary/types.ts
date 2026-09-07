import type { DailyBudgetAssessment } from "../financeSummary";

export interface SummaryMetric {
  id: string;
  label: string;
  value: number;
  calculation: string;
  dailyBudgetAssessment?: DailyBudgetAssessment;
}

export interface PeriodSnapshot {
  id: number;
  period_start: string;
  period_end: string;
  real_liquidity: number;
  financial_floor: number;
  consumer_debt: number;
  mortgage_debt: number;
  goals_allocated: number;
  captured_at: string;
}

export type FinanceSummaryView = "general" | "period" | "month" | "history";
