import { assessDailyBudget, buildFinanceSummary, buildHistoricalPeriodSummary, buildPeriodSummary, buildUpcomingOperationDays, getNextPayday, getPayPeriod, shiftPayPeriod } from "./financeSummary";

describe("finance manager summary", () => {
  it("assesses the safe daily budget relative to the configured plan", () => {
    expect(assessDailyBudget(30, 0)).toEqual({ status: "unconfigured", ratio: null, label: "Brak ustawionego planu" });
    expect(assessDailyBudget(49, 50)).toEqual({ status: "insufficient", ratio: 0.98, label: "Niewystarczająco" });
    expect(assessDailyBudget(60, 50)).toEqual({ status: "tight", ratio: 1.2, label: "Na styk" });
    expect(assessDailyBudget(75, 50)).toEqual({ status: "comfortable", ratio: 1.5, label: "Komfortowo" });
  });
  it("treats credit-card debt as non-owned money while including its available limit", () => {
    const result = buildFinanceSummary({
      now: new Date(2026, 7, 23, 12),
      accounts: [
        { id: 1, nazwa: "Konto główne", saldo_dostepne: 210.6, saldo_wlasciwe: 210.6, typ_depozytu: "konto" },
        { id: 2, nazwa: "Erste", saldo_dostepne: 10.27, saldo_wlasciwe: 10.27, typ_depozytu: "konto" },
        { id: 3, nazwa: "Karta", saldo_dostepne: 160, saldo_wlasciwe: -2840, typ_depozytu: "karta_kredytowa" },
      ],
      recurringExpenses: [{ id: 1, nazwa: "Stałe", kwota: 3650.69, kategoria: "Rachunki", data_od: "2026-08-01", data_do: null, dzien_miesiaca: 1 }],
      recurringIncomes: [{ id: 1, nazwa: "UOP", kwota: 7220, kategoria: "Wynagrodzenie", data_od: "2026-08-01", data_do: null, dzien_miesiaca: 10 }, { id: 2, nazwa: "PPK", kwota: 330, kategoria: "Inne", data_od: "2026-08-01", data_do: null, dzien_miesiaca: 18 }, { id: 3, nazwa: "Multisport", kwota: 210, kategoria: "Inne", data_od: "2026-08-01", data_do: null, dzien_miesiaca: 1 }],
      incomes: [
        { id: 1, name: "Planowany", amount: 1627.4, category: "Inne", addedAt: "2026-08-23", zrealizowany: false },
        { id: 2, name: "Zrealizowany", amount: 500, category: "Inne", addedAt: "2026-08-20", zrealizowany: true },
        { id: 3, name: "UOP z kolejki", amount: 7220, category: "Wynagrodzenie", addedAt: "2026-09-10", zrealizowany: false, generatedFromRecurring: true },
      ],
      expenses: [{ id: 1, name: "Planowany", amount: 450, category: "Inne", addedAt: "2026-08-23", zrealizowany: false }],
    });

    expect(result.actualFunds).toBeCloseTo(-2619.13);
    expect(result.recurringIncome).toBeCloseTo(7760);
    expect(result.recurringExpenses).toBeCloseTo(3650.69);
    expect(result.additionalIncome).toBeCloseTo(1627.4);
    expect(result.additionalExpenses).toBeCloseTo(450);
    expect(result.availableWithCredit).toBeCloseTo(380.87);
    expect(result.daysUntilPayday).toBe(18);
    expect(result.dailyBudget).toBeCloseTo(21.16, 2);
  });

  it("counts only the unallocated part of a one-time plan in additional amounts", () => {
    const result = buildFinanceSummary({
      now: new Date(2026, 8, 2, 12),
      accounts: [],
      recurringExpenses: [],
      recurringIncomes: [],
      incomes: [{ id: 1, name: "Plan", amount: 1000, category: "Inne", addedAt: "2026-09-10", zrealizowany: false, allocatedToPlan: 400 }],
      expenses: [{ id: 2, name: "Wydatek", amount: 500, category: "Inne", addedAt: "2026-09-11", zrealizowany: false, allocatedToPlan: 500 }],
    });

    expect(result.additionalIncome).toBe(600);
    expect(result.additionalExpenses).toBe(0);
  });

  it("uses the next month when today is payday", () => {
    expect(getNextPayday(new Date(2026, 8, 10, 8))).toEqual(new Date(2026, 9, 10));
  });

  it("builds a payday period from the 10th through the 9th", () => {
    expect(getPayPeriod(new Date(2026, 7, 23))).toEqual({ start: new Date(2026, 7, 10), end: new Date(2026, 8, 9) });
    expect(getPayPeriod(new Date(2026, 7, 5))).toEqual({ start: new Date(2026, 6, 10), end: new Date(2026, 7, 9) });
  });

  it("supports configurable cycle starts, including short months", () => {
    expect(getPayPeriod(new Date(2026, 7, 23), 1)).toEqual({ start: new Date(2026, 7, 1), end: new Date(2026, 7, 31) });
    expect(getPayPeriod(new Date(2026, 7, 23), 25)).toEqual({ start: new Date(2026, 6, 25), end: new Date(2026, 7, 24) });
    expect(getPayPeriod(new Date(2027, 1, 28), 31)).toEqual({ start: new Date(2027, 1, 28), end: new Date(2027, 2, 30) });
    expect(shiftPayPeriod(getPayPeriod(new Date(2026, 7, 23), 10), -1, 10)).toEqual({ start: new Date(2026, 6, 10), end: new Date(2026, 7, 9) });
  });

  it("reconstructs historical plans separately from realized transactions", () => {
    const period = { start: new Date(2025, 0, 10), end: new Date(2025, 1, 9) };
    const result = buildHistoricalPeriodSummary({
      period,
      recurringIncomes: [{ id: 1, nazwa: "Pensja", kwota: 4000, kategoria: "Wynagrodzenie", data_od: "2024-01-01", data_do: null, dzien_miesiaca: 10 }],
      recurringExpenses: [{ id: 2, nazwa: "Czynsz", kwota: 1000, kategoria: "Dom", data_od: "2024-01-01", data_do: null, dzien_miesiaca: 15 }],
      incomes: [
        { id: 1, name: "Premia", amount: 500, category: "Inne", addedAt: "2025-01-20", zrealizowany: true },
        { id: 2, name: "Import", amount: 200, category: "Inne", addedAt: "2025-01-21", zrealizowany: true, importSource: "csv" },
        { id: 3, name: "Poza okresem", amount: 999, category: "Inne", addedAt: "2025-02-10", zrealizowany: true },
      ],
      expenses: [
        { id: 4, name: "Zakup", amount: 300, category: "Inne", addedAt: "2025-01-25", zrealizowany: false },
        { id: 5, name: "Paragon", amount: 100, category: "Inne", addedAt: "2025-01-26", zrealizowany: true, importSource: "csv" },
      ],
    });
    expect(result.plannedIncome).toBe(4500);
    expect(result.plannedExpenses).toBe(1300);
    expect(result.actualIncome).toBe(700);
    expect(result.actualExpenses).toBe(100);
    expect(result.actualBalance).toBe(600);
    expect(result.realizedTransactions).toBe(3);
  });

  it("estimates balance through a selected date without double-counting generated recurring income", () => {
    const result = buildPeriodSummary({
      now: new Date(2026, 7, 23, 12),
      selectedDate: new Date(2026, 8, 2, 12),
      accounts: [{ id: 1, nazwa: "Konto", saldo_dostepne: 200, saldo_wlasciwe: 200, typ_depozytu: "konto" }],
      recurringIncomes: [{ id: 1, nazwa: "Pensja", kwota: 500, kategoria: "Wynagrodzenie", data_od: "2026-01-01", data_do: null, dzien_miesiaca: 1 }],
      recurringExpenses: [{ id: 1, nazwa: "Rachunek", kwota: 30, kategoria: "Rachunki", data_od: "2026-01-01", data_do: null, dzien_miesiaca: 28 }],
      incomes: [
        { id: 1, name: "Premia", amount: 100, category: "Inne", addedAt: "2026-09-01", zrealizowany: false },
        { id: 2, name: "Pensja z kolejki", amount: 500, category: "Wynagrodzenie", addedAt: "2026-09-01", zrealizowany: false, generatedFromRecurring: true },
      ],
      expenses: [{ id: 1, name: "Zakup", amount: 50, category: "Inne", addedAt: "2026-08-25", zrealizowany: false }],
    });
    expect(result.periodIncome).toBe(600);
    expect(result.periodExpenses).toBe(80);
    expect(result.incomeUntilSelectedDate).toBe(600);
    expect(result.expensesUntilSelectedDate).toBe(80);
    expect(result.currentActual).toBe(200);
    expect(result.actualAtSelectedDate).toBe(720);
    expect(result.daysToSelectedDate).toBe(11);
    expect(result.actualDailyBudget).toBeCloseTo(65.45, 2);
    expect(result.availableAtSelectedDate).toBe(720);
    expect(result.availableDailyBudget).toBeCloseTo(65.45, 2);
  });

  it("keeps realized one-time entries in the full plan but not in the future forecast", () => {
    const result = buildPeriodSummary({
      now: new Date(2026, 7, 23, 12),
      selectedDate: new Date(2026, 7, 25, 12),
      accounts: [{ id: 1, nazwa: "Konto", saldo_dostepne: 1000, saldo_wlasciwe: 1000, typ_depozytu: "konto" }],
      recurringIncomes: [], recurringExpenses: [],
      incomes: [{ id: 1, name: "Premia", amount: 100, category: "Inne", addedAt: "2026-08-20", zrealizowany: true }],
      expenses: [
        { id: 2, name: "Zrealizowany zakup", amount: 200, category: "Inne", addedAt: "2026-08-21", zrealizowany: true },
        { id: 3, name: "Przyszły zakup", amount: 50, category: "Inne", addedAt: "2026-08-24", zrealizowany: false },
      ],
    });

    expect(result.periodIncome).toBe(100);
    expect(result.periodExpenses).toBe(250);
    expect(result.incomeUntilSelectedDate).toBe(0);
    expect(result.expensesUntilSelectedDate).toBe(50);
    expect(result.actualAtSelectedDate).toBe(950);
  });

  it("uses one day for today and two days for tomorrow in the period daily balance", () => {
    const input = {
      now: new Date(2026, 7, 26, 12),
      accounts: [{ id: 1, nazwa: "Konto", saldo_dostepne: 1000, saldo_wlasciwe: 1000, typ_depozytu: "konto" }],
      recurringIncomes: [], recurringExpenses: [], incomes: [], expenses: [],
    };
    const todayResult = buildPeriodSummary({ ...input, selectedDate: new Date(2026, 7, 26, 12) });
    const tomorrowResult = buildPeriodSummary({ ...input, selectedDate: new Date(2026, 7, 27, 12) });
    expect(todayResult.daysToSelectedDate).toBe(1);
    expect(todayResult.actualDailyBudget).toBe(1000);
    expect(tomorrowResult.daysToSelectedDate).toBe(2);
    expect(tomorrowResult.actualDailyBudget).toBe(500);
    expect(tomorrowResult.availableDailyBudget).toBe(500);
  });

  it("keeps daily living money as a future planning reserve, not an expense", () => {
    const result = buildPeriodSummary({
      now: new Date(2026, 7, 23, 12), selectedDate: new Date(2026, 7, 25, 12),
      accounts: [{ id: 1, nazwa: "Konto", saldo_dostepne: 2000, saldo_wlasciwe: 2000, typ_depozytu: "konto" }],
      recurringIncomes: [], recurringExpenses: [], incomes: [], expenses: [], dailyLivingBudget: 50, financialFloor: 500,
    });
    expect(result.periodExpenses).toBe(0);
    expect(result.remainingDaysInPeriod).toBe(18);
    expect(result.dailyLivingReserve).toBe(900);
    expect(result.actualAfterLivingReserveAtSelectedDate).toBe(1100);
    expect(result.actualAfterLivingReserveDailyBudget).toBeCloseTo(366.67, 2);
    expect(result.plannedActualAtSelectedDate).toBe(1850);
    expect(result.safeDailyBudget).toBeCloseTo(83.33, 2);
  });

  it("uses the same adjusted actual balance as the deposits grid", () => {
    const result = buildFinanceSummary({
      accounts: [
        { id: 1, nazwa: "Konto", saldo_dostepne: 100, saldo_wlasciwe: 100, typ_depozytu: "konto" },
        { id: 2, nazwa: "Karta", saldo_dostepne: 1400, saldo_wlasciwe: -1600, typ_depozytu: "karta_kredytowa", installment_plan_debt: 1000 },
      ],
      recurringExpenses: [], recurringIncomes: [], incomes: [], expenses: [],
    });
    expect(result.actualFunds).toBe(-500);
  });

  it("groups upcoming operations by day and includes the daily planning reserve in the forecast", () => {
    const result = buildUpcomingOperationDays({
      now: new Date(2026, 7, 31, 12),
      endDate: new Date(2026, 8, 5, 12),
      accounts: [{ id: 1, nazwa: "Konto", saldo_dostepne: 1000, saldo_wlasciwe: 1000, typ_depozytu: "konto" }],
      recurringIncomes: [], recurringExpenses: [],
      incomes: [{ id: 1, name: "Zwrot", amount: 200, category: "Inne", addedAt: "2026-09-01", zrealizowany: false, certainty: "expected" }],
      expenses: [{ id: 2, name: "Zakup", amount: 300, category: "Inne", addedAt: "2026-09-01", zrealizowany: false }],
      dailyLivingBudget: 50,
      financialFloor: 900,
    });

    expect(result).toHaveLength(1);
    expect(result[0].operations).toHaveLength(2);
    expect(result[0].income).toBe(200);
    expect(result[0].expenses).toBe(300);
    expect(result[0].balanceAfterDay).toBe(800);
    expect(result[0].belowFinancialFloor).toBe(true);
  });

  it("does not duplicate a recurring income represented by its generated transaction", () => {
    const result = buildUpcomingOperationDays({
      now: new Date(2026, 7, 31, 12),
      endDate: new Date(2026, 8, 2, 12),
      accounts: [{ id: 1, nazwa: "Konto", saldo_dostepne: 100, saldo_wlasciwe: 100, typ_depozytu: "konto" }],
      recurringIncomes: [{ id: 1, nazwa: "Pensja", kwota: 500, kategoria: "Wynagrodzenie", data_od: "2026-01-01", data_do: null, dzien_miesiaca: 1 }],
      recurringExpenses: [],
      incomes: [{ id: 2, name: "Pensja z kolejki", amount: 500, category: "Wynagrodzenie", addedAt: "2026-09-01", zrealizowany: false, generatedFromRecurring: true }],
      expenses: [],
    });

    expect(result).toHaveLength(1);
    expect(result[0].operations).toHaveLength(1);
    expect(result[0].income).toBe(500);
    expect(result[0].balanceAfterDay).toBe(600);
  });

  it("forecasts only the unfulfilled part of a plan matched by an imported operation", () => {
    const result = buildUpcomingOperationDays({
      now: new Date(2026, 7, 31, 12), endDate: new Date(2026, 8, 3, 12),
      accounts: [{ id: 1, nazwa: "Konto", saldo_dostepne: 100, saldo_wlasciwe: 100, typ_depozytu: "konto" }],
      recurringIncomes: [], recurringExpenses: [],
      incomes: [
        { id: 10, name: "Vinted plan", amount: 1000, category: "Vinted", addedAt: "2026-09-02", zrealizowany: false },
        { id: 11, name: "Vinted wpłata", amount: 200, category: "Vinted", addedAt: "2026-09-01", zrealizowany: true, importSource: "CSV bankowy", planMatches: [{ source: "one_time", planId: 10, occurrenceDate: null, allocatedAmount: 200 }] },
      ],
      expenses: [],
    });
    expect(result[0].income).toBe(800);
  });

  it("removes only the allocated part of a recurring occurrence from the forecast", () => {
    const result = buildUpcomingOperationDays({
      now: new Date(2026, 7, 31, 12), endDate: new Date(2026, 8, 3, 12),
      accounts: [{ id: 1, nazwa: "Konto", saldo_dostepne: 100, saldo_wlasciwe: 100, typ_depozytu: "konto" }],
      recurringIncomes: [{ id: 7, nazwa: "Wynagrodzenie", kwota: 5000, kategoria: "Wynagrodzenie", data_od: "2026-01-01", data_do: null, dzien_miesiaca: 2 }],
      recurringExpenses: [],
      incomes: [{ id: 12, name: "Wpłata", amount: 1500, category: "Wynagrodzenie", addedAt: "2026-09-01", zrealizowany: true, importSource: "CSV bankowy", planMatches: [{ source: "recurring", planId: 7, occurrenceDate: "2026-09-02", allocatedAmount: 1500 }] }],
      expenses: [],
    });
    expect(result[0].income).toBe(3500);
  });

  it("does not forecast a recurring occurrence dismissed by the user", () => {
    const result = buildUpcomingOperationDays({
      now: new Date(2026, 7, 31, 12), endDate: new Date(2026, 8, 2, 12),
      accounts: [{ id: 1, nazwa: "Konto", saldo_dostepne: 100, saldo_wlasciwe: 100, typ_depozytu: "konto" }],
      recurringIncomes: [{ id: 1, nazwa: "Multi", kwota: 229, kategoria: "Wynagrodzenie", data_od: "2026-01-01", data_do: null, dzien_miesiaca: 1, occurrenceOverrides: [{ date: "2026-09-01", status: "dismissed" }] }],
      recurringExpenses: [], incomes: [], expenses: [],
    });

    expect(result).toEqual([]);
  });

  it("uses a manually customized occurrence instead of the original recurring value", () => {
    const result = buildUpcomingOperationDays({
      now: new Date(2026, 7, 31, 12), endDate: new Date(2026, 8, 2, 12),
      accounts: [{ id: 1, nazwa: "Konto", saldo_dostepne: 100, saldo_wlasciwe: 100, typ_depozytu: "konto" }],
      recurringIncomes: [{ id: 1, nazwa: "Premia", kwota: 500, kategoria: "Wynagrodzenie", data_od: "2026-01-01", data_do: null, dzien_miesiaca: 1, occurrenceOverrides: [{ date: "2026-09-01", status: "customized" }] }],
      recurringExpenses: [],
      incomes: [{ id: 2, name: "Premia skorygowana", amount: 350, category: "Wynagrodzenie", addedAt: "2026-09-01", zrealizowany: false, generatedFromRecurring: true, recurringIncomeId: 1, recurringQueueStatus: "customized", certainty: "guaranteed" }],
      expenses: [],
    });

    expect(result).toHaveLength(1);
    expect(result[0].operations).toHaveLength(1);
    expect(result[0].operations[0].name).toBe("Premia skorygowana");
    expect(result[0].income).toBe(350);
  });
});
