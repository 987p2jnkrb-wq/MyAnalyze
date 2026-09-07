import {
  allocateNewFunds, applyGoalAccountBalances, buildBufferStatus, buildGoalProjection, buildGoalRecommendations, buildGoalsAiPrompt, buildLiquidityBreakdown,
  DEFAULT_GOAL_SETTINGS, validateFinancialGoal, validateGoalSettings, buildProposedGoals, proposedGoalAlreadyExists, type FinancialGoal, type GoalDebt,
} from "./goalsModel";

const now = new Date(2026, 7, 20, 12);
const account = (id: number, type: string, actual: number, available = actual) => ({ id, nazwa: `Konto ${id}`, saldo_dostepne: available, saldo_wlasciwe: actual, typ_depozytu: type });
const goal = (overrides: Partial<FinancialGoal> = {}): FinancialGoal => ({ id: 1, name: "Wyjazd", type: "travel", targetAmount: 1000, allocatedAmount: 0, dueDate: "2026-12-20", priority: "normal", status: "active", accountId: null, includeAccountBalance: false, accountName: null, note: null, createdAt: "", updatedAt: "", ...overrides });

describe("goals model", () => {
  it("does not propose recurring bills as goals even after manual customization", () => {
    const expense = { id: 1, name: "Wakacje", amount: 2240, category: "", addedAt: "2026-09-10", zrealizowany: false };
    const proposals = buildProposedGoals([
      expense,
      { ...expense, id: 2, name: "PKO Hipoteka", generatedFromRecurring: true, recurringQueueStatus: "customized" },
      { ...expense, id: 3, name: "Mieszkanie", generatedFromRecurring: true, recurringQueueStatus: "scheduled" },
    ], 0, 0, now);
    expect(proposals.map((proposal) => proposal.title)).toEqual(["Wakacje"]);
  });

  it("recognizes an existing proposed goal after the planned expense date changes", () => {
    const [proposal] = buildProposedGoals([{ id: 8, name: "Wakacje", amount: 2000, category: "", addedAt: "2026-09-09", zrealizowany: false }], 0, 0, now);
    expect(proposedGoalAlreadyExists(proposal, [goal({ name: " Wakacje ", targetAmount: 2000, allocatedAmount: 900, dueDate: "2026-09-10" })])).toBe(true);
    expect(proposedGoalAlreadyExists(proposal, [goal({ name: "Wakacje", targetAmount: 3000, dueDate: "2026-09-09" })])).toBe(false);
  });
  it("requires the first buffer threshold to cover the financial floor and keeps thresholds increasing", () => {
    expect(validateGoalSettings({ ...DEFAULT_GOAL_SETTINGS, financialFloor: 1500, thresholds: [1000, 3000, 5000] })).toBe("Próg 1 nie może być niższy niż finansowa podłoga.");
    expect(validateGoalSettings({ ...DEFAULT_GOAL_SETTINGS, thresholds: [1000, 1000, 5000] })).toBe("Próg 2 musi być wyższy niż Próg 1.");
    expect(validateGoalSettings({ ...DEFAULT_GOAL_SETTINGS, paydayCycleStartDay: 0 })).toBe("Dzień rozpoczęcia okresu musi mieścić się między 1 a 31.");
    expect(validateGoalSettings({ ...DEFAULT_GOAL_SETTINGS, paydayCycleStartDay: 31 })).toBeNull();
    expect(validateGoalSettings({ ...DEFAULT_GOAL_SETTINGS, financialFloor: 1000, thresholds: [1000, 3000, 5000] })).toBeNull();
  });
  it("does not include a credit-card limit or debt in real liquidity", () => {
    const result = buildLiquidityBreakdown([account(1, "konto", 500), account(2, "karta_kredytowa", -2800, 200)]);
    expect(result.total).toBe(500);
    expect(result.operational).toBe(500);
  });

  it("keeps virtual-wallet money real but visible separately", () => {
    const result = buildLiquidityBreakdown([account(1, "konto", 500), account(2, "wirtualny_portfel", 250)]);
    expect(result.total).toBe(750);
    expect(result.virtualWallets).toBe(250);
  });

  it("uses a linked account balance as goal progress only when explicitly enabled", () => {
    const goals = [goal({ id: 1, accountId: 7, allocatedAmount: 100, includeAccountBalance: true }), goal({ id: 2, accountId: 7, allocatedAmount: 100, includeAccountBalance: false })];
    const result = applyGoalAccountBalances(goals, [account(7, "konto", 650)]);
    expect(result[0].allocatedAmount).toBe(650);
    expect(result[1].allocatedAmount).toBe(100);
    expect(goals[0].allocatedAmount).toBe(100);
  });

  it("gives the first buffer threshold high priority", () => {
    const projection = buildGoalProjection({ accounts: [account(1, "konto", 860)], incomes: [], expenses: [], recurringIncomes: [], recurringExpenses: [], settings: DEFAULT_GOAL_SETTINGS, now });
    const recommendations = buildGoalRecommendations({ projection, settings: DEFAULT_GOAL_SETTINGS, goals: [], debts: [], now });
    expect(recommendations[0].id).toBe("floor");
    expect(recommendations[0].priority).toBeGreaterThan(100);
  });

  it("reports the achieved buffer level without duplicating it in recommendations", () => {
    expect(buildBufferStatus(3500, DEFAULT_GOAL_SETTINGS)).toEqual(expect.objectContaining({ achievedCount: 2, achievedThreshold: 3000, nextThreshold: 5000, missingToNext: 1500, complete: false }));
    const projection = buildGoalProjection({ accounts: [account(1, "konto", 6000)], incomes: [], expenses: [], recurringIncomes: [], recurringExpenses: [], settings: DEFAULT_GOAL_SETTINGS, now });
    expect(buildGoalRecommendations({ projection, settings: DEFAULT_GOAL_SETTINGS, goals: [], debts: [], now }).some((item) => item.id.startsWith("buffer"))).toBe(false);
  });

  it("does not aggressively recommend a zero-percent debt before the basic buffer", () => {
    const projection = buildGoalProjection({ accounts: [account(1, "konto", 500)], incomes: [], expenses: [], recurringIncomes: [], recurringExpenses: [], settings: DEFAULT_GOAL_SETTINGS, now });
    const zeroDebt: GoalDebt = { id: 2, type: "Plan ratalny", debt: 1000, installment: 100, apr: 0, interest: 0 };
    const recommendations = buildGoalRecommendations({ projection, settings: DEFAULT_GOAL_SETTINGS, goals: [], debts: [zeroDebt], now });
    expect(recommendations.some((item) => item.id === "debt-2")).toBe(false);
    expect(recommendations[0].id).toBe("floor");
  });

  it("does not count potential future income as available or conservative money", () => {
    const projection = buildGoalProjection({
      accounts: [account(1, "konto", 500)], recurringIncomes: [], recurringExpenses: [], expenses: [], settings: DEFAULT_GOAL_SETTINGS, now,
      incomes: [{ id: 1, name: "Możliwa sprzedaż", amount: 1000, category: "Inne", addedAt: "2026-08-25", zrealizowany: false, certainty: "potential" }],
    });
    expect(projection.liquidity.total).toBe(500);
    expect(projection.conservativeEnd).toBe(500);
    expect(projection.expectedEnd).toBe(500);
    expect(projection.potentialEnd).toBe(1500);
  });

  it("counts a guaranteed one-time income in every forecast scenario", () => {
    const projection = buildGoalProjection({
      accounts: [account(1, "konto", 500)], recurringIncomes: [], recurringExpenses: [], expenses: [], settings: DEFAULT_GOAL_SETTINGS, now,
      incomes: [{ id: 1, name: "Pewny zwrot", amount: 1000, category: "Inne", addedAt: "2026-08-25", zrealizowany: false, certainty: "guaranteed" }],
    });
    expect(projection.conservativeEnd).toBe(1500);
    expect(projection.expectedEnd).toBe(1500);
    expect(projection.potentialEnd).toBe(1500);
  });

  it("uses the recurring expense once and never adds a debt installment separately", () => {
    const projection = buildGoalProjection({
      accounts: [account(1, "konto", 1000)], incomes: [], expenses: [], recurringIncomes: [], settings: { ...DEFAULT_GOAL_SETTINGS, financialFloor: 0 }, now,
      recurringExpenses: [{ id: 1, nazwa: "Rata", kwota: 100, kategoria: "Kredyt", data_od: "2026-01-01", data_do: null, dzien_miesiaca: 25 }],
    });
    expect(projection.conservativeEnd).toBe(900);
    expect(projection.minimumConservativeLiquidity).toBe(900);
  });

  it("recommends rebuilding after liquidity falls below the financial floor", () => {
    const projection = buildGoalProjection({ accounts: [account(1, "konto", 1200)], incomes: [], expenses: [{ id: 1, name: "Pilny wydatek", amount: 400, category: "Inne", addedAt: "2026-08-21", zrealizowany: false }], recurringIncomes: [], recurringExpenses: [], settings: DEFAULT_GOAL_SETTINGS, now });
    expect(projection.safeSurplus).toBe(0);
    const lowerProjection = { ...projection, liquidity: { ...projection.liquidity, total: 800 } };
    expect(buildGoalRecommendations({ projection: lowerProjection, settings: DEFAULT_GOAL_SETTINGS, goals: [], debts: [], now })[0].id).toBe("floor");
  });

  it("prioritizes a negative liquidity forecast and suppresses less urgent goal advice", () => {
    const projection = buildGoalProjection({
      accounts: [account(1, "konto", 100)], incomes: [], recurringIncomes: [], recurringExpenses: [], settings: { ...DEFAULT_GOAL_SETTINGS, financialFloor: 0 }, now,
      expenses: [{ id: 1, name: "Pilny wydatek", amount: 300, category: "Inne", addedAt: "2026-08-21", zrealizowany: false }],
    });
    const recommendations = buildGoalRecommendations({ projection, settings: { ...DEFAULT_GOAL_SETTINGS, financialFloor: 0 }, goals: [goal({ dueDate: "2026-08-21" })], debts: [], now });
    expect(projection.minimumExpectedLiquidityAfterReserve).toBe(-200);
    expect(recommendations).toEqual([expect.objectContaining({ id: "cashflow-negative", tone: "danger", amount: 200 })]);
  });

  it("warns about an operating-period deficit without recommending goal acceleration", () => {
    const projection = buildGoalProjection({
      accounts: [account(1, "konto", 2000)], incomes: [], recurringIncomes: [], recurringExpenses: [], settings: DEFAULT_GOAL_SETTINGS, now,
      expenses: [{ id: 1, name: "Wydatek", amount: 300, category: "Inne", addedAt: "2026-08-21", zrealizowany: false }],
    });
    const recommendations = buildGoalRecommendations({ projection, settings: DEFAULT_GOAL_SETTINGS, goals: [goal({ dueDate: "2026-08-21" })], debts: [], now });
    expect(projection.periodExpenses - projection.periodIncome).toBe(300);
    expect(recommendations.some((item) => item.id === "period-deficit")).toBe(true);
    expect(recommendations.some((item) => item.id.startsWith("goal-"))).toBe(false);
  });

  it("uses the shared daily-budget assessment only when the margin needs attention", () => {
    const settings = { ...DEFAULT_GOAL_SETTINGS, dailyLivingBudget: 50 };
    const base = buildGoalProjection({ accounts: [account(1, "konto", 5000)], incomes: [], expenses: [], recurringIncomes: [], recurringExpenses: [], settings, now });
    expect(buildGoalRecommendations({ projection: { ...base, safeDailyBudget: 40 }, settings, goals: [], debts: [], now })).toContainEqual(expect.objectContaining({ id: "daily-budget-insufficient", tone: "danger" }));
    expect(buildGoalRecommendations({ projection: { ...base, safeDailyBudget: 60 }, settings, goals: [], debts: [], now })).toContainEqual(expect.objectContaining({ id: "daily-budget-tight", tone: "warning" }));
    expect(buildGoalRecommendations({ projection: { ...base, safeDailyBudget: 75 }, settings, goals: [], debts: [], now }).some((item) => item.id.startsWith("daily-budget"))).toBe(false);
  });

  it("shows a useful recommendation for a demanding active goal", () => {
    const projection = {
      ...buildGoalProjection({ accounts: [account(1, "konto", 2000)], incomes: [], expenses: [], recurringIncomes: [], recurringExpenses: [], settings: DEFAULT_GOAL_SETTINGS, now }),
      conservativeMonthlyCapacity: 1000,
    };
    const demandingGoal = goal({ targetAmount: 700, dueDate: "2026-09-20" });
    const recommendations = buildGoalRecommendations({ projection, settings: DEFAULT_GOAL_SETTINGS, goals: [demandingGoal], debts: [], now });
    expect(recommendations).toContainEqual(expect.objectContaining({ id: `goal-${demandingGoal.id}`, tone: "info" }));
  });

  it("allocates new funds deterministically without changing goals", () => {
    const goals = [goal({ allocatedAmount: 200, priority: "high" })];
    const snapshot = JSON.stringify(goals);
    const result = allocateNewFunds(1500, 860, DEFAULT_GOAL_SETTINGS, goals);
    expect(result[0]).toEqual(expect.objectContaining({ kind: "floor", amount: 140 }));
    expect(result.some((line) => line.kind === "buffer")).toBe(true);
    expect(result.some((line) => line.kind === "goal")).toBe(true);
    expect(JSON.stringify(goals)).toBe(snapshot);
  });

  it("allocates surplus by cost, keeps zero-percent debt behind goals and mortgage last", () => {
    const goals = [
      goal({ id: 1, name: "Pilne auto", targetAmount: 500, priority: "high", dueDate: "2026-10-01" }),
      goal({ id: 2, name: "Wyjazd", targetAmount: 400, priority: "normal", dueDate: "2027-05-01" }),
    ];
    const debts: GoalDebt[] = [
      { id: 1, name: "Kredyt 12", type: "Kredyt", debt: 1000, installment: 100, apr: 12, interest: 10 },
      { id: 2, name: "Revolving", type: "Karta kredytowa", debt: 800, installment: 0, apr: null, interest: 8 },
      { id: 3, name: "Tańszy kredyt", type: "Kredyt", debt: 700, installment: 70, apr: 5, interest: 4 },
      { id: 4, name: "Raty zero", type: "Plan ratalny", debt: 600, installment: 60, apr: 0, interest: 0 },
      { id: 5, name: "Dom", type: "Kredyt hipoteczny", debt: 2000, installment: 500, apr: 4, interest: 3.5 },
      { id: 6, name: "Nieznane zobowiązanie", type: "Inne", debt: 300, installment: 0, apr: null, interest: null },
    ];
    const result = allocateNewFunds(20_000, 1000, DEFAULT_GOAL_SETTINGS, goals, debts);
    const labels = result.map((line) => line.label);
    expect(labels.indexOf("Pilne auto")).toBeLessThan(labels.findIndex((label) => label.startsWith("Kredyt 12")));
    expect(labels.findIndex((label) => label.startsWith("Kredyt 12"))).toBeLessThan(labels.findIndex((label) => label.startsWith("Revolving")));
    expect(labels.findIndex((label) => label.startsWith("Revolving"))).toBeLessThan(labels.findIndex((label) => label.startsWith("Tańszy kredyt")));
    expect(labels.findIndex((label) => label.startsWith("Tańszy kredyt"))).toBeLessThan(labels.indexOf("Wyjazd"));
    expect(labels.indexOf("Wyjazd")).toBeLessThan(labels.findIndex((label) => label.startsWith("Raty zero")));
    expect(labels.findIndex((label) => label.startsWith("Raty zero"))).toBeLessThan(labels.findIndex((label) => label.startsWith("Nieznane zobowiązanie")));
    expect(labels.findIndex((label) => label.startsWith("Nieznane zobowiązanie"))).toBeLessThan(labels.findIndex((label) => label.startsWith("Opcjonalna nadpłata: Dom")));
    expect(labels.find((label) => label.startsWith("Nieznane zobowiązanie"))).toContain("brak danych o koszcie finansowania");
    expect(goals[0].allocatedAmount).toBe(0);
    expect(debts[0].debt).toBe(1000);
  });

  it("uses RRSO before interest and validates inline goal values like the form", () => {
    const result = allocateNewFunds(10_000, 5000, DEFAULT_GOAL_SETTINGS, [], [
      { id: 1, name: "A", type: "Kredyt", debt: 100, installment: 10, apr: 6, interest: 20 },
      { id: 2, name: "B", type: "Kredyt", debt: 100, installment: 10, apr: null, interest: 8 },
    ]);
    expect(result.findIndex((line) => line.label.startsWith("B"))).toBeLessThan(result.findIndex((line) => line.label.startsWith("A")));
    expect(validateFinancialGoal(goal({ name: "" }))).toBe("Podaj nazwę celu.");
    expect(validateFinancialGoal(goal({ targetAmount: 100, allocatedAmount: 101 }))).toBe("Kwota przypisana nie może przekraczać kwoty docelowej.");
    expect(validateFinancialGoal(goal({ dueDate: "2026-02-30" }))).toBe("Termin celu jest nieprawidłowy.");
    expect(validateFinancialGoal(goal())).toBeNull();
    expect(allocateNewFunds(1000, 5000, DEFAULT_GOAL_SETTINGS, [], [{ id: 3, name: "Dług prywatny", type: "Dług", debt: 100, installment: 0, apr: null, interest: null }])[0].label).toContain("koszt 0.00%");
  });

  it("reserves only future daily living costs in Safe Surplus and new-funds allocation", () => {
    const settings = { ...DEFAULT_GOAL_SETTINGS, financialFloor: 1000, dailyLivingBudget: 50 };
    const projection = buildGoalProjection({ accounts: [account(1, "konto", 3000)], incomes: [], expenses: [], recurringIncomes: [], recurringExpenses: [], settings, now });
    expect(projection.dailyLivingReserve).toBe(1050);
    expect(projection.safeSurplus).toBe(950);
    const allocation = allocateNewFunds(2000, 1000, settings, [], [], projection.dailyLivingReserve);
    expect(allocation[0]).toEqual(expect.objectContaining({ kind: "living", amount: 1050 }));
  });

  it("creates an anonymous GPT snapshot while preserving goal names", () => {
    const accounts = [{ ...account(1, "konto", 500), nazwa: "Tajne konto" }];
    const projection = buildGoalProjection({ accounts, incomes: [], expenses: [], recurringIncomes: [], recurringExpenses: [], settings: DEFAULT_GOAL_SETTINGS, now });
    const prompt = buildGoalsAiPrompt({ currency: "PLN", accounts, incomes: [], expenses: [], recurringIncomes: [], recurringExpenses: [], debts: [], goals: [goal({ name: "Mój wyjazd" })], settings: DEFAULT_GOAL_SETTINGS, projection });
    expect(prompt).not.toContain("Tajne konto");
    expect(prompt).toContain("Mój wyjazd");
    expect(prompt).toContain("Środki dostępne wraz z kartami");
  });
});
