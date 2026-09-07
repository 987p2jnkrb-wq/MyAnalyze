import { translateUiText } from "./i18n";

describe("UI translations", () => {
  it("keeps Polish text unchanged when Polish is selected", () => {
    expect(translateUiText("Zapisz strategię", "pl")).toBe("Zapisz strategię");
  });

  it("translates new PDF messages", () => {
    expect(translateUiText("Nierozpoznany układ PDF: sprawdź odczytaną datę, opis i kwotę przed importem.", "en"))
      .toBe("Unknown PDF layout: check the extracted date, description and amount before importing.");
    expect(translateUiText("PDF: rozpoznano 4 operacji (Millennium). Wszystkie dane są tylko podglądem - przed importem możesz poprawić datę, nazwę, kwotę, typ i kontrahenta.", "en"))
      .toBe("PDF: recognized 4 transactions (Millennium). All data is only a preview - you can correct the date, name, amount, type and counterparty before importing.");
  });

  it("translates dynamic goal allocation labels without changing their values", () => {
    expect(translateUiText("Poduszka do progu 10000.00", "en")).toBe("Emergency fund up to 10000.00");
    expect(translateUiText("30.00% strategii × 70.00% alokacji aktywnego progu.", "en"))
      .toBe("30.00% of strategy × 70.00% allocation of the active threshold.");
  });

  it("translates goal recommendations without translating the goal name", () => {
    expect(translateUiText("Pilnuj tempa celu „Wakacje”", "en")).toBe("Keep goal “Wakacje” on track");
    expect(translateUiText("Cel jest wykonalny, ale wymaga przeznaczania na niego znacznej części obecnej nadwyżki miesięcznej.", "en"))
      .toBe("The goal is achievable, but it requires a significant share of your current monthly surplus.");
  });

  it("uses natural English singular and plural forms for grid records", () => {
    expect(translateUiText("1 rekord", "en")).toBe("1 record");
    expect(translateUiText("2 rekordy", "en")).toBe("2 records");
    expect(translateUiText("1 z 12 rekordów", "en")).toBe("1 of 12 records");
    expect(translateUiText("5 rekordów · zaznaczono 2", "en")).toBe("5 records · 2 selected");
  });

  it("translates the negative liquidity recommendation and lowercase filter label", () => {
    expect(translateUiText("Prognoza rzeczywistych środków po rezerwie na codzienne wydatki spada poniżej zera. Sprawdź, które wydatki można zmniejszyć lub przełożyć, albo uzupełnij środki. Prognozowany brak:", "en"))
      .toBe("The forecast of available funds after the daily expense reserve falls below zero. Review which expenses can be reduced or postponed, or add funds. Forecast shortfall:");
    expect(translateUiText("wszystkie", "en")).toBe("all");
  });

  it("translates monthly actual and outstanding labels", () => {
    expect(translateUiText("Przychody wykonane", "en")).toBe("Actual income");
    expect(translateUiText("Wydatki wykonane", "en")).toBe("Actual expenses");
    expect(translateUiText("Wynik netto", "en")).toBe("Net result");
    expect(translateUiText("Nierozliczone przychody - wrzesień 2026", "en")).toBe("Outstanding income - September 2026");
    expect(translateUiText("Wykonane transakcje - wrzesień 2026", "en")).toBe("Actual transactions - September 2026");
    expect(translateUiText("Wynik netto: Wakacje", "en")).toBe("Net result: Wakacje");
  });

  it("does not leave mixed Polish and English finance labels", () => {
    expect(translateUiText("Rekomendacja na teraz", "en")).toBe("Recommendation for now");
    expect(translateUiText("Pobierz CSV", "en")).toBe("Download CSV");
    expect(translateUiText("Typ transakcji", "en")).toBe("Transaction type");
    expect(translateUiText("Typ operacji", "en")).toBe("Operation type");
    expect(translateUiText("Przychody wykonane", "en")).toBe("Actual income");
    expect(translateUiText("Wydatki wykonane", "en")).toBe("Actual expenses");
    expect(translateUiText("Wykonane wydatki", "en")).toBe("Actual expenses");
    expect(translateUiText("Realne przychody", "en")).toBe("Actual income");
    expect(translateUiText("Realne wydatki", "en")).toBe("Actual expenses");
    expect(translateUiText("Przeznaczenie", "en")).toBe("Allocate to");
    expect(translateUiText("Proponowane cele", "en")).toBe("Suggested goals");
    expect(translateUiText("saldo uwzględniane", "en")).toBe("balance included");
    expect(translateUiText("Zaplanowany", "en")).toBe("Planned");
    expect(translateUiText("Uruchomienie kredytu", "en")).toBe("Loan disbursement");
    expect(translateUiText("Oczekujące bankowe", "en")).toBe("Pending at bank");
    expect(translateUiText("Anulowane bankowe", "en")).toBe("Cancelled by bank");
    expect(translateUiText("Dodaj przychód", "en")).toBe("Add income");
    expect(translateUiText("Dodaj wydatek", "en")).toBe("Add expense");
    expect(translateUiText("wartość", "en")).toBe("value");
    expect(translateUiText("dni", "en")).toBe("days");
  });
});
