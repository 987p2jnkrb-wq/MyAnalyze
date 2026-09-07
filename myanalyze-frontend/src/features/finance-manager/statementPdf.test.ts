import { parseStatementPdf, type StatementPdfExtraction, type StatementPdfTextCell } from "./statementPdf";

function row(y: number, cells: Array<[number, string, number?]>) {
  const normalized: StatementPdfTextCell[] = cells.map(([x, text, width = Math.max(10, text.length * 4)]) => ({ x, text, width }));
  return { y, text: normalized.map((cell) => cell.text).join(" "), cells: normalized };
}

function extraction(text: string, rows: ReturnType<typeof row>[]): StatementPdfExtraction {
  return { text, pageCount: 1, pages: [{ pageNumber: 1, width: 595, height: 842, rows }] };
}

describe("PDF statement import", () => {
  it("reads Vinted wallet rows, ignores balances and keeps wallet withdrawals as transfers", () => {
    const pdf = extraction("Zestawienie Portfela Vinted\nNazwa użytkownika: wallet-user", [
      row(700, [[28, "1"], [38, "wrz."], [65, "2026"], [244, "Saldo początkowe"], [520, "208,38"], [560, "zł"]]),
      row(680, [[28, "5"], [38, "wrz."], [65, "2026"], [116, "buyer"], [244, "Bluza Nike"], [515, "+80,00"], [560, "zł"]]),
      row(650, [[28, "3"], [38, "wrz."], [65, "2026"], [116, "wallet-user"], [244, "Wypłata na konto bankowe"], [520, "-100,00"], [560, "zł"]]),
      row(640, [[244, "**** 8263"]]),
      row(610, [[28, "30"], [45, "wrz."], [244, "Saldo końcowe"], [520, "188,38"], [560, "zł"]]),
    ]);

    const result = parseStatementPdf(pdf, "PLN", { mappedAccountId: 7 });
    expect(result.source).toBe("PDF Vinted Pay");
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toMatchObject({ date: "2026-09-05", amount: 80, kind: "income", name: "Bluza Nike", applicationType: "normal_transaction" });
    expect(result.transactions[1]).toMatchObject({ amount: -100, transactionType: "transfer_out", sourceInstrument: { bank: "Vinted", identifier: "wallet-user" } });
  });

  it("reads Millennium account amount instead of running balance and recognizes card repayments", () => {
    const pdf = extraction("WYCIĄG ŁĄCZONY\nRACHUNKI BIEŻĄCE - INFORMACJE SZCZEGÓŁOWE\nIBAN: PL63 1160 2202 0000 0006 4699 7915", [
      row(300, [[30, "2026-07-01"], [74, "2026-07-01"], [123, "PRZELEW PRZYCHODZĄCY"], [485, "149,99"], [551, "149,99"]]),
      row(290, [[123, "Z R-ku:45188000090000001150568002"]]),
      row(280, [[123, "ADYEN N.V. /OPF/REF"]]),
      row(250, [[30, "2026-07-05"], [74, "2026-07-05"], [123, "PRZELEW WYCHODZĄCY"], [485, "36,60-"], [551, "201,90"]]),
      row(240, [[123, "DWORAK MIKOŁAJ WCZEŚN.SPŁ.KARTY: 5236XXXXXXXX3296"]]),
    ]);

    const result = parseStatementPdf(pdf, "PLN", { mappedAccountId: 2 });
    expect(result.source).toBe("PDF Millennium - rachunek");
    expect(result.transactions.map((item) => item.amount)).toEqual([149.99, -36.6]);
    expect(result.transactions[0]).toMatchObject({ transactionType: "transfer_in", counterparty: "ADYEN N.V." });
    expect(result.transactions[1]).toMatchObject({ rawType: "Spłata karty", transactionType: "card_repayment" });
  });

  it("reads Millennium credit-card booked amount and classifies purchases, repayments and refunds", () => {
    const pdf = extraction("Wyciąg z rachunku karty kredytowej nr 5236xxxxxxxx7156", [
      row(400, [[30, "2026-07-21"], [96, "SPŁATA"], [151, "WCZESN.SPL.Z RACHUNKU: 646997915"], [420, "123,00"], [446, "PLN"], [502, "1,0000"], [557, "123,00"]]),
      row(380, [[30, "2026-08-06"], [96, "ZAKUP"], [151, "Vinted Vilnius LT"], [420, "-113,90"], [446, "PLN"], [502, "1,0000"], [557, "-113,90"]]),
      row(360, [[30, "2026-08-08"], [96, "UZNANIE"], [151, "UBER RIDES AMSTERDAM NL"], [420, "51,59"], [446, "PLN"], [502, "1,0000"], [557, "51,59"]]),
    ]);

    const result = parseStatementPdf(pdf, "PLN", { accountKind: "credit-card", mappedAccountId: 3 });
    expect(result.source).toBe("PDF Millennium - karta kredytowa");
    expect(result.transactions.map((item) => item.amount)).toEqual([123, -113.9, 51.59]);
    expect(result.transactions.map((item) => item.transactionType)).toEqual(["card_repayment", "card_payment", "refund"]);
    expect(result.transactions.map((item) => item.applicationType)).toEqual(["normal_transaction", "card_payment", "refund"]);
  });
  it("keeps unknown PDF layouts editable but deselected until the user approves them", () => {
    const pdf = extraction("Example Bank statement", [
      row(400, [[30, "2026-09-01"], [170, "Coffee shop"], [500, "-12,34"], [550, "PLN"]]),
    ]);

    const result = parseStatementPdf(pdf, "PLN", { mappedAccountId: 9, institutionName: "Example Bank" });
    expect(result.source).toBe("PDF - import niestandardowy");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({ amount: -12.34, includeByDefault: false });
    expect(result.warnings.join(" ")).toContain("domyślnie odznaczone");
  });

});
