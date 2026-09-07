// import pg from 'pg';
// Fix: make node-postgres return DATE as string, not Date object
// pg.types.setTypeParser(1082, (str: string) => str);

import express from "express";
import cors from "cors";
import modulesConfigRouter from "./routes/modulesConfig";
import kontaRouter from "./routes/konta";
import przychodyRouter from "./routes/przychody";
import wydatkiStaleRouter from "./routes/wydatki_stale";
import loansRouter from "./routes/loans";
import przychodyStaleRouter from "./routes/przychody_stale";
import wydatkiRouter from "./routes/wydatki";
import appActivityLogRouter from "./routes/app_activity_log";
import loanPaymentsRouter from './routes/loan_payments';
import debtPlansRouter from './routes/debt_plans';
import financialGoalsRouter from './routes/financial_goals';
import financialGoalSettingsRouter from './routes/financial_goal_settings';
import backupRouter from './routes/backup';
import financialPeriodSnapshotsRouter from './routes/financial_period_snapshots';
import customTransactionTypesRouter from './routes/custom_transaction_types';
import { auditApiMutation } from "./middleware/audit";
import { serializeApiMutations } from "./middleware/mutationQueue";
import { ensureRecurringIncomeQueue } from "./services/recurringIncomeQueue";
import { ensureRecurringExpenseQueue } from "./services/recurringExpenseQueue";

const app = express();
app.disable("etag");
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api", serializeApiMutations);
app.use("/api", auditApiMutation);

app.use("/api/modules-config", modulesConfigRouter);
app.use("/api/konta", kontaRouter);
app.use("/api/przychody", przychodyRouter);
app.use("/api/wydatki_stale", wydatkiStaleRouter);
app.use("/api/przychody_stale", przychodyStaleRouter);
app.use("/api/wydatki", wydatkiRouter);
app.use("/api/loans", loansRouter);
app.use("/api/loan_payments", loanPaymentsRouter);
app.use("/api/debt-plans", debtPlansRouter);
app.use("/api/financial-goals", financialGoalsRouter);
app.use("/api/financial-goal-settings", financialGoalSettingsRouter);
app.use("/api/backup", backupRouter);
app.use("/api/financial-period-snapshots", financialPeriodSnapshotsRouter);
app.use("/api/custom-transaction-types", customTransactionTypesRouter);
app.use("/api/app-activity-logs", appActivityLogRouter);

export async function initializeStartupData(): Promise<void> {
  await ensureRecurringIncomeQueue();
  await ensureRecurringExpenseQueue();
}

const PORT = Number(process.env.PORT || 3003);
if (require.main === module) {
  void (async () => {
    try {
      // Do not expose /api/health until all startup DB maintenance is done.
      await initializeStartupData();
      app.listen(PORT, () => {
        console.log(`Backend API listening on port ${PORT}`);
      });
    } catch (error) {
      console.error("[STARTUP] Nie udało się przygotować danych aplikacji:", error);
      process.exitCode = 1;
    }
  })();
}

export default app;
