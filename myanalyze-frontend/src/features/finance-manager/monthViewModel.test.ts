import { buildMonthSummary, formatMonthLabel, shiftMonth } from "./monthViewModel";

describe("monthViewModel", () => {
  it("counts a generated recurring occurrence once, also after manual customization", () => {
    const transaction = { id: 246, name: "nju", amount: 31, category: "", customTypeId: 10, customTypeName: "Wpis stały", addedAt: "2026-09-10", zrealizowany: false, generatedFromRecurring: true };
    const rule = { id: 3, nazwa: "nju", kwota: 31, kategoria: "", custom_type_id: 5, custom_type_name: "Subskrypcje", data_od: "2026-01-01", data_do: null, dzien_miesiaca: 10 };
    const base = { month: "2026-09", incomes: [], recurringIncomes: [] };
    const scheduled = buildMonthSummary({ ...base, expenses: [{ ...transaction, recurringQueueStatus: "scheduled" }], recurringExpenses: [rule] });
    expect(scheduled.remainingExpenses).toBe(31);
    expect(scheduled.outstandingOperations).toHaveLength(1);
    const customized = buildMonthSummary({ ...base, expenses: [{ ...transaction, recurringQueueStatus: "customized", amount: 35 }], recurringExpenses: [{ ...rule, occurrenceOverrides: [{ date: "2026-09-10", status: "customized" }] }] });
    expect(customized.plannedExpenses).toBe(35);
    expect(customized.remainingExpenses).toBe(35);
    expect(customized.outstandingOperations).toHaveLength(1);
    expect(customized.outstandingOperations[0].label).toBe("Wpis stały");
  });

  it("combines actual directions by label ID and projects only the unallocated remainder", () => {
    const common = { category: "", customTypeId: 4, customTypeName: "Vinted", addedAt: "2026-08-10" };
    const summary = buildMonthSummary({
      month: "2026-08", recurringIncomes: [], recurringExpenses: [],
      incomes: [
        { ...common, id: 1, name: "Sprzedaż", amount: 600, zrealizowany: true, importSource: "CSV" },
        { ...common, id: 2, name: "Transfer", amount: 500, zrealizowany: true, transferLinkId: 1 },
        { ...common, id: 3, name: "Może", amount: 900, zrealizowany: false, certainty: "potential" },
      ],
      expenses: [
        { ...common, id: 1, name: "Plan", amount: 1000, allocatedToPlan: 400, zrealizowany: false },
        { ...common, id: 2, name: "Wykonanie", amount: 400, zrealizowany: true, importSource: "CSV", planMatches: [{ source: "one_time", planId: 1, occurrenceDate: null, allocatedAmount: 400 }] },
        { ...common, id: 3, name: "Ręcznie wyłączona", amount: 100, zrealizowany: true, excludedFromAnalysis: true },
      ],
    });
    expect(summary.actualBalance).toBe(200);
    expect(summary.remainingExpenses).toBe(600);
    expect(summary.remainingIncome).toBe(0);
    expect(summary.forecastBalance).toBe(-400);
    expect(summary.labelResults).toEqual([{ id: "label:4", label: "Vinted", income: 600, expenses: 400, net: 200, remainingIncome: 0, remainingExpenses: 600, forecast: -400 }]);
  });

  it("uses allocations outside the filtered label and recurring overrides", () => {
    const summary = buildMonthSummary({
      month: "2026-08", incomes: [], expenses: [], recurringIncomes: [],
      recurringExpenses: [
        { id: 1, nazwa: "Czynsz", kwota: 1000, kategoria: "", custom_type_id: 4, custom_type_name: "Dom", data_od: "2026-01-01", data_do: null, dzien_miesiaca: 10 },
        { id: 2, nazwa: "Anulowany", kwota: 500, kategoria: "", data_od: "2026-01-01", data_do: null, dzien_miesiaca: 10, occurrenceOverrides: [{ date: "2026-08-10", status: "dismissed" }] },
      ],
      allocationExpenses: [{ id: 9, name: "Import", amount: 400, category: "", addedAt: "2026-07-31", zrealizowany: true, planMatches: [{ source: "recurring", planId: 1, occurrenceDate: "2026-08-10", allocatedAmount: 400 }] }],
    });
    expect(summary.remainingExpenses).toBe(600);
    expect(summary.forecastBalance).toBe(-600);
  });

  it("builds a monthly plan and actual values without duplicating generated recurring income", () => {
    const summary = buildMonthSummary({
      month: "2026-08",
      incomes: [
        { id: 1, name: "Premia", amount: 500, category: "Premia", addedAt: "2026-08-05", zrealizowany: true, certainty: "expected" },
        { id: 2, name: "Pensja z kolejki", amount: 5000, category: "Wynagrodzenie", addedAt: "2026-08-10", zrealizowany: true, generatedFromRecurring: true },
        { id: 5, name: "Import zasilenia", amount: 1000, category: "Inne", addedAt: "2026-08-11", zrealizowany: true, importSource: "CSV bankowy", excludedFromAnalysis: true },
      ],
      expenses: [
        { id: 3, name: "Zakupy", amount: 200, category: "Jedzenie", addedAt: "2026-08-04", zrealizowany: true },
        { id: 4, name: "Kino", amount: 80, category: "Rozrywka", addedAt: "2026-08-20", zrealizowany: false },
        { id: 6, name: "Import zakupów", amount: 25, category: "Jedzenie", addedAt: "2026-08-21", zrealizowany: true, importSource: "CSV bankowy" },
      ],
      recurringIncomes: [{ id: 1, nazwa: "Pensja", kwota: 5000, kategoria: "Wynagrodzenie", data_od: "2026-01-01", data_do: null, dzien_miesiaca: 10 }],
      recurringExpenses: [{ id: 2, nazwa: "Internet", kwota: 70, kategoria: "Rachunki", data_od: "2026-01-01", data_do: null, dzien_miesiaca: 15 }],
    });

    expect(summary.plannedIncome).toBe(5500);
    expect(summary.plannedGuaranteedIncome).toBe(5000);
    expect(summary.plannedPotentialIncome).toBe(5500);
    expect(summary.actualIncome).toBe(5500);
    expect(summary.plannedExpenses).toBe(350);
    expect(summary.actualExpenses).toBe(225);
    expect(summary.plannedBalance).toBe(5150);
    expect(summary.expenseCategories).toEqual([
      { category: "Jedzenie", planned: 200, actual: 225, remaining: -25, guaranteed: 0, expected: 0, potential: 0 },
      { category: "Rozrywka", planned: 80, actual: 0, remaining: 80, guaranteed: 0, expected: 0, potential: 0 },
      { category: "Rachunki", planned: 70, actual: 0, remaining: 70, guaranteed: 0, expected: 0, potential: 0 },
    ]);
    expect(summary.incomeCategories).toEqual([
      { category: "Wynagrodzenie", planned: 5000, actual: 5000, remaining: 0, guaranteed: 5000, expected: 0, potential: 0 },
      { category: "Premia", planned: 500, actual: 500, remaining: 0, guaranteed: 0, expected: 500, potential: 0 },
    ]);
  });

  it("keeps potential income outside the expected monthly plan", () => {
    const summary = buildMonthSummary({
      month: "2026-09",
      incomes: [
        { id: 1, name: "Pewny", amount: 1000, category: "Praca", addedAt: "2026-09-02", zrealizowany: false, certainty: "guaranteed" },
        { id: 2, name: "Oczekiwany", amount: 500, category: "Sprzedaż", addedAt: "2026-09-03", zrealizowany: false, certainty: "expected" },
        { id: 3, name: "Potencjalny", amount: 700, category: "Sprzedaż", addedAt: "2026-09-04", zrealizowany: false, certainty: "potential" },
      ],
      expenses: [], recurringIncomes: [], recurringExpenses: [],
    });
    expect(summary.plannedGuaranteedIncome).toBe(1000);
    expect(summary.plannedIncome).toBe(1500);
    expect(summary.plannedPotentialIncome).toBe(2200);
    expect(summary.plannedBalance).toBe(1500);
    expect(summary.incomeCategories.find((row) => row.category === "Sprzedaż")).toMatchObject({ expected: 500, potential: 700, planned: 500 });
  });

  it("includes a recurring entry only when its occurrence is inside its active range", () => {
    const base = { incomes: [], expenses: [], recurringIncomes: [] };
    const entry = { id: 1, nazwa: "Abonament", kwota: 50, kategoria: "Rachunki", data_od: "2026-08-20", data_do: "2026-09-05", dzien_miesiaca: 10 };
    expect(buildMonthSummary({ ...base, month: "2026-08", recurringExpenses: [entry] }).plannedExpenses).toBe(0);
    expect(buildMonthSummary({ ...base, month: "2026-09", recurringExpenses: [entry] }).plannedExpenses).toBe(0);
  });

  it("moves between years and formats the month label", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(formatMonthLabel("2026-08").toLocaleLowerCase("pl-PL")).toContain("sierpień");
  });
});
