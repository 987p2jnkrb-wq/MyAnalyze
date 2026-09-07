import { applyMatchAnalysis, detectStatementColumns, markAlreadyImported, markPotentialOverlaps, parseCsv, parseStatementCsv } from "./statementImport";

describe("bank statement CSV import", () => {
  it("maps arbitrary columns after a preamble and preserves repeated real operations", () => {
    const text = 'Raport portfela\nKiedy|Wartość operacji|Szczegóły\n05.09.2026|-12,30|"Zakup|opis"\n05.09.2026|-12,30|"Zakup|opis"';
    const columns = { ...detectStatementColumns([]), date: 0, amount: 1, description: 2 };
    const result = parseStatementCsv(text, "PLN", { layout: { separator: "|", headerRow: 1, columns } });
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toMatchObject({ name: "Zakup|opis", amount: -12.3, kind: "expense", date: "2026-09-05" });
    expect(result.transactions.every(row => row.includeByDefault)).toBe(true);
    expect(result.transactions[0].sourceKey).not.toBe(result.transactions[1].sourceKey);
  });

  it("maps separate debit/credit columns and keeps currency validation", () => {
    const columns = { ...detectStatementColumns([]), date: 0, debit: 1, credit: 2, currency: 3 };
    const result = parseStatementCsv('D;Out;In;Unit\n2026-09-05;20;;PLN\n2026-09-05;;30;PLN\n2026-09-05;;40;EUR', "PLN", { layout: { separator: ";", columns } });
    expect(result.transactions.map(row => row.amount)).toEqual([-20, 30]);
    expect(result.transactions[0].name).toBe("Operacja bankowa");
    expect(result.rejected).toHaveLength(1);
  });

  it.each([
    "Data;Kwota;Waluta;Opis;Kontrahent;Rodzaj transakcji;Status;Id transakcji;Instrument",
    "Date;Amount;Currency;Description;Counterparty;Type;Status;Transaction ID;Account",
  ])("accepts the GPT prompt CSV contract: %s", (header) => {
    const result = parseStatementCsv([
      header,
      '2026-09-03;-100.00;PLN;"Wypłata; na konto";;;completed;;wallet-1',
      '2026-09-03;-100.00;PLN;"Wypłata; na konto";;;completed;;wallet-1',
      "2026-09-03;95.00;PLN;;Kupujący;;completed;;wallet-1",
    ].join("\n"));
    expect(result.rejected).toHaveLength(0);
    expect(result.transactions).toHaveLength(3);
    expect(result.transactions.every((row) => row.includeByDefault)).toBe(true);
    expect(result.transactions[0]).toMatchObject({
      amount: -100, date: "2026-09-03", name: "Wypłata; na konto",
      sourceInstrument: { identifier: "wallet-1", bank: "Nieznany bank" },
    });
    expect(result.transactions[2]).toMatchObject({ amount: 95, kind: "income", name: "Kupujący" });
  });

  it("uses completed date and separates expenses from incomes in an extended CSV", () => {
    const csv = [
      "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance",
      "Card Payment,Current,2026-08-03 10:00:00,2026-08-03 10:01:00,BIEDRONKA,-50.20,0.00,PLN,COMPLETED,100.00",
      "Bank Transfer,Current,2026-08-04 09:00:00,2026-08-04 09:01:00,Salary,2000.00,0.00,PLN,COMPLETED,2100.00",
      "Card Payment,Current,2026-08-05 09:00:00,2026-08-05 09:01:00,Pending coffee,-12.00,0.00,PLN,PENDING,2088.00",
      "Card Payment,Current,2026-08-06 09:00:00,2026-08-06 09:01:00,Foreign payment,-10.00,0.00,EUR,COMPLETED,2078.00",
    ].join("\n");

    const result = parseStatementCsv(csv, "PLN");

    expect(result.source).toBe("CSV bankowy");
    expect(result.transactions).toHaveLength(3);
    expect(result.transactions[0]).toMatchObject({ kind: "expense", date: "2026-08-03", occurredAt: "2026-08-03T10:01:00", amount: -50.2, category: "Inne", transactionType: "card_payment" });
    expect(result.transactions[1]).toMatchObject({ kind: "income", date: "2026-08-04", occurredAt: "2026-08-04T09:01:00", amount: 2000, category: "Inne", transactionType: "transfer_in" });
    expect(result.transactions[2]).toMatchObject({ kind: "expense", date: "2026-08-05", occurredAt: "2026-08-05T09:01:00", amount: -12, bankStatus: "pending", includeByDefault: true });
    expect(result.rejected).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });

  it("keeps likely own-account transfers in analysis until the user confirms a counterpart", () => {
    const csv = [
      "Type,Completed Date,Description,Amount,Currency,State",
      "Topup,2026-08-03 10:00:00,Payment from MY CARD,100.00,PLN,COMPLETED",
      "Transfer,2026-08-03 10:01:00,To PLN,-100.00,PLN,COMPLETED",
      "Card Payment,2026-08-03 10:02:00,Shop,-20.00,PLN,COMPLETED",
    ].join("\n");

    const result = parseStatementCsv(csv);

    expect(result.transactions.map((row) => row.includeByDefault)).toEqual([true, true, true]);
    expect(result.transactions.map((row) => row.excludeFromAnalysis)).toEqual([false, false, false]);
    expect(result.transactions.map((row) => Boolean(row.transferSuggested))).toEqual([true, true, false]);
    expect(result.transactions[0].note).toContain("transfer własny");
    expect(result.skipped).toBe(0);
  });

  it("recognizes a credit-card statement without changing the generic CSV model", () => {
    const csv = [
      "Type,Started Date,Completed Date,Description,Amount,Fee,Balance",
      "CARD_PAYMENT,2026-07-01 10:00:00,2026-07-02 14:52:49,Biedronka,-9.47,0.00,-2951.48",
      "CARD_REFUND,2026-07-02 11:51:17,2026-07-03 14:49:45,Vinted,36.59,0.00,-3344.62",
      "TRANSFER,2026-07-02 17:14:56,2026-07-02 17:14:56,To PLN,244.28,0.00,-3000.00",
    ].join("\n");

    const result = parseStatementCsv(csv, "PLN", { accountKind: "credit-card" });

    expect(result.source).toBe("CSV karty kredytowej");
    expect(result.transactions[0]).toMatchObject({ kind: "expense", date: "2026-07-02", transactionType: "card_payment", includeByDefault: true });
    expect(result.transactions[1]).toMatchObject({ kind: "income", date: "2026-07-03", transactionType: "refund", includeByDefault: true });
    expect(result.transactions[2]).toMatchObject({ kind: "income", transactionType: "transfer_in", includeByDefault: true, excludeFromAnalysis: false, transferSuggested: true });
    expect(result.transactions[2].note).toContain("transfer własny");
  });

  it("supports a semicolon file and Polish decimal commas", () => {
    const csv = [
      "Data transakcji;Opis transakcji;Kwota;Waluta",
      "24.08.2026;BIEDRONKA;\"-123,45\";PLN",
      "25.08.2026;Wynagrodzenie;\"3500,00\";PLN",
    ].join("\r\n");

    const result = parseStatementCsv(csv, "PLN");

    expect(result.source).toBe("CSV bankowy");
    expect(result.transactions.map((row) => [row.date, row.amount])).toEqual([["2026-08-24", -123.45], ["2026-08-25", 3500]]);
  });

  it("supports separate debit and credit columns", () => {
    const csv = [
      "Data operacji;Opis;Obciążenia;Uznania;Waluta",
      "24.08.2026;Bilet;12,34;;PLN",
      "25.08.2026;Zwrot;;20,00;PLN",
    ].join("\n");

    expect(parseStatementCsv(csv).transactions.map((row) => row.amount)).toEqual([-12.34, 20]);
  });

  it("selects one unambiguous plan candidate by default and keeps alternatives", () => {
    const parsed = parseStatementCsv([
      "Type,Completed Date,Description,Amount,Currency,State",
      "Card Payment,2026-08-10 10:00:00,Internet,-60.00,PLN,COMPLETED",
      "Transfer,2026-08-10 10:00:00,Refund,60.00,PLN,COMPLETED",
    ].join("\n"));
    const result = applyMatchAnalysis(parsed, [{
      sourceKey: parsed.transactions[0].sourceKey,
      existingCandidates: [],
      planCandidates: [{ kind: "expense", source: "recurring", planId: 1, occurrenceDate: "2026-08-12", name: "Internet", amount: 60, remainingAmount: 60, date: "2026-08-12", recommended: true }],
    }]);

    expect(result.transactions[0].resolution).toBe("plan");
    expect(result.transactions[0].planAllocations).toEqual([{ source: "recurring", planId: 1, occurrenceDate: "2026-08-12", name: "Internet", allocatedAmount: 60 }]);
    expect(result.transactions[0].includeByDefault).toBe(true);
    expect(result.transactions[0].planCandidates).toHaveLength(1);
    expect(result.transactions[1].resolution).toBe("new");
  });

  it("parses quoted descriptions containing the delimiter", () => {
    expect(parseCsv('Date,Description,Amount\n2026-08-01,"Shop, Warsaw",-10')).toEqual([
      ["Date", "Description", "Amount"],
      ["2026-08-01", "Shop, Warsaw", "-10"],
    ]);
  });

  it("uses a bank transaction identifier when it is available", () => {
    const csv = [
      "Transaction ID,Date,Description,Amount,Currency",
      "abc-123,2026-08-01,Shop,-10.00,PLN",
    ].join("\n");

    expect(parseStatementCsv(csv).transactions[0].sourceKey).toBe("external-id:abc-123");
  });

  it("keeps repeated rows visible and selected as separate real occurrences", () => {
    const csv = [
      "Date,Description,Amount,Currency",
      "2026-08-01,Shop,-10.00,PLN",
      "2026-08-01,Shop,-10.00,PLN",
    ].join("\n");

    const result = parseStatementCsv(csv);

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].sourceKey).not.toBe(result.transactions[1].sourceKey);
    expect(result.transactions[1]).toMatchObject({ includeByDefault: true, duplicateState: "same-file", resolution: "new" });
    expect(result.warnings.at(-1)).toContain("pozostają zaznaczone");
  });

  it("uses occurrence-aware fingerprints so a later file can add only the fifth identical payment", () => {
    const header = "Date,Description,Amount,Currency";
    const row = "2026-08-01,Myjnia,-12.30,PLN";
    const first = parseStatementCsv([header, row, row, row, row].join("\n"));
    const next = parseStatementCsv([header, row, row, row, row, row].join("\n"));

    expect(new Set(first.transactions.map((item) => item.sourceKey)).size).toBe(4);
    expect(next.transactions.slice(0, 4).map((item) => item.sourceKey)).toEqual(first.transactions.map((item) => item.sourceKey));
    expect(first.transactions.map((item) => item.includeByDefault)).toEqual([true, true, true, true]);
    expect(next.transactions[4].sourceKey).not.toBe(first.transactions[3].sourceKey);
  });

  it("treats a repeated unique bank ID as a hard duplicate", () => {
    const csv = [
      "Transaction ID,Date,Description,Amount,Currency",
      "abc-123,2026-08-01,Shop,-10.00,PLN",
      "abc-123,2026-08-01,Shop,-10.00,PLN",
    ].join("\n");

    expect(parseStatementCsv(csv).transactions[1]).toMatchObject({ includeByDefault: false, duplicateState: "hard-duplicate", resolution: "skip" });
  });

  it("does not require a description and uses the shared fallback chain", () => {
    const result = parseStatementCsv([
      "Data transakcji;Opis;Odbiorca/Zleceniodawca;Rodzaj transakcji;Kwota;Waluta",
      "01.08.2026;;Jan Kowalski;PRZELEW;-20,00;PLN",
      "02.08.2026;;;WCZEŚN.SPŁ.KARTY:;-200,00;PLN",
      "03.08.2026;;;;-5,00;PLN",
    ].join("\n"), "PLN", { mappedAccountId: 7 });

    expect(result.rejected).toHaveLength(0);
    expect(result.transactions.map((item) => item.name)).toEqual(["Jan Kowalski", "WCZEŚN.SPŁ.KARTY:", "Operacja bankowa"]);
    expect(result.transactions[1]).toMatchObject({ includeByDefault: true, excludeFromAnalysis: false });
    expect(result.transactions[2]).toMatchObject({ applicationType: "normal_transaction", sourceInstrument: { mappedAccountId: 7, type: "account" } });
  });

  it("marks transactions already present on the account before import", () => {
    const parsed = parseStatementCsv("Date,Description,Amount,Currency\n2026-08-01,Shop,-10.00,PLN");
    const result = markAlreadyImported(parsed, [parsed.transactions[0].sourceKey]);

    expect(result.transactions[0]).toMatchObject({ includeByDefault: false, duplicateState: "already-imported" });
    expect(result.transactions[0].note).toContain("już zapisana");
  });

  it("keeps a possible overlap from another account selected as a warning only", () => {
    const parsed = parseStatementCsv("Date,Description,Amount,Currency\n2026-08-01,Shop,-10.00,PLN");
    const result = markPotentialOverlaps(parsed, [{ sourceKey: parsed.transactions[0].sourceKey, accountName: "Konto główne", reason: "same-transaction", transactionId: 12, kind: "expense", transactionName: "Shop", transactionDate: "2026-08-01", transactionAmount: 10 }]);

    expect(result.transactions[0]).toMatchObject({ includeByDefault: true, duplicateState: "possible-overlap", resolution: "new" });
    expect(result.transactions[0].note).toContain("Konto główne");
    expect(result.warnings.at(-1)).toContain("innym koncie");
  });

  it("keeps a suggested own transfer counted until its counterpart is explicitly selected", () => {
    const parsed = parseStatementCsv("Type,Date,Description,Amount,Currency\nTransfer,2026-08-01,To PLN,-10.00,PLN");
    const result = markPotentialOverlaps(parsed, [{ sourceKey: parsed.transactions[0].sourceKey, accountName: "Karta", reason: "own-transfer", transactionId: 44, kind: "income", transactionName: "Zasilenie", transactionDate: "2026-08-01", transactionAmount: 10 }]);

    expect(result.transactions[0]).toMatchObject({ includeByDefault: true, excludeFromAnalysis: false, duplicateState: "own-transfer", resolution: "new", transferCandidates: [{ transactionId: 44, kind: "income", accountName: "Karta", transactionName: "Zasilenie", transactionDate: "2026-08-01", transactionAmount: 10 }] });
    expect(result.transactions[0].note).toContain("Karta");
  });

  it("rejects invalid calendar dates and malformed quoted CSV", () => {
    const invalidDate = parseStatementCsv("Date,Description,Amount,Currency\n2026-02-30,Shop,-10.00,PLN");

    expect(invalidDate.transactions).toHaveLength(0);
    expect(invalidDate.skipped).toBe(1);
    expect(() => parseCsv('Date,Description,Amount\n2026-08-01,"Shop,-10')).toThrow("niezamknięte pole");
  });

  it("reports missing required columns clearly", () => {
    expect(() => parseStatementCsv("A;B\n1;2")).toThrow("Nie rozpoznano kolumn daty i kwoty");
  });
});
