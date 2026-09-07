import { NextFunction, Request, Response, Router } from "express";
import { dbPromise } from "../db";
import multer from "multer";
import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse";
import { jsPDF } from "jspdf";
import { calculateDebt, isCreditCardType, isInstallmentPlanType, normalizeCreditProductType, syncAccountFromDebtPlan, syncDebtPlanFromLoan } from "../services/creditProduct";
import { calculateInstallmentEndDate, ensureInstallmentPlanSchedule } from "../services/installmentSchedule";
import { validateOptionalDateRange } from "../utils/dateRange";
import { isValidDateOnly, validatedNumber } from "../utils/validation";
import type { RecurringExpenseSelection } from "../services/recurringCreditExpense";

const dataDirectory = process.env.MYANALYZE_DATA_DIR ? path.resolve(process.env.MYANALYZE_DATA_DIR) : path.resolve(__dirname, "..");
const uploadsDirectory = path.join(dataDirectory, "uploads");
const temporaryUploadsDirectory = path.join(uploadsDirectory, "temp");
fs.mkdirSync(temporaryUploadsDirectory, { recursive: true });
const MAX_PDF_SIZE = 50 * 1024 * 1024;
const upload = multer({
  dest: temporaryUploadsDirectory,
  limits: { fileSize: MAX_PDF_SIZE, files: 1 },
  fileFilter: (_req, file, callback) => {
    const isPdf = file.mimetype === "application/pdf" && path.extname(file.originalname).toLowerCase() === ".pdf";
    if (!isPdf) return callback(new Error("Można przesłać wyłącznie plik PDF."));
    callback(null, true);
  },
});

const uploadSchedulePdf = (req: Request, res: Response, next: NextFunction) => {
  upload.single("pdf")(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "Plik PDF może mieć maksymalnie 50 MB." });
    }
    if (error) return res.status(400).json({ error: error instanceof Error ? error.message : "Nieprawidłowy plik PDF." });
    next();
  });
};

const router = Router();

type LoanPayload = {
  nazwa?: unknown; typ?: unknown; data_rozpoczecia?: unknown; ilosc_rat?: unknown;
  kwota_kapitalu?: unknown; kwota_calkowita?: unknown; kwota_raty?: unknown;
  rrso?: unknown; dzien_splaty?: unknown; oprocentowanie?: unknown;
  prowizja?: unknown; ubezpieczenie?: unknown; data_dodania?: unknown; data_do?: unknown;
  recurring_expense_mode?: unknown; recurring_expense_id?: unknown; active?: unknown;
};

function recurringExpenseSelection(body: LoanPayload, fallback: "create" | "keep"): RecurringExpenseSelection {
  const mode = String(body.recurring_expense_mode ?? fallback);
  if (!(["keep", "none", "create", "link"] as const).includes(mode as RecurringExpenseSelection["mode"])) {
    throw new Error("Nieprawidłowy sposób powiązania stałego wydatku.");
  }
  const expenseId = body.recurring_expense_id === null || body.recurring_expense_id === undefined || body.recurring_expense_id === ""
    ? null : Number(body.recurring_expense_id);
  if (mode === "link" && (!Number.isInteger(expenseId) || Number(expenseId) <= 0)) throw new Error("Wybierz istniejący stały wydatek.");
  return { mode: mode as RecurringExpenseSelection["mode"], expenseId };
}

function normalizeLoanPayload(body: LoanPayload, allowIncomplete = false) {
  const nazwa = String(body.nazwa ?? "").trim();
  const typ = normalizeCreditProductType(body.typ);
  const dataRozpoczecia = body.data_rozpoczecia ? String(body.data_rozpoczecia).slice(0, 10) : null;
  const requestedDataDo = body.data_do ? String(body.data_do).slice(0, 10) : null;
  const requestedDateRangeError = validateOptionalDateRange(dataRozpoczecia, requestedDataDo);
  if (requestedDateRangeError) throw new Error(requestedDateRangeError);
  const dataDodania = body.data_dodania ? String(body.data_dodania).slice(0, 10) : null;
  const iloscRat = validatedNumber(body.ilosc_rat, "Pozostała liczba rat", { required: !allowIncomplete, min: 1, integer: true });
  const kapital = validatedNumber(body.kwota_kapitalu, "Kwota kapitału", { required: !allowIncomplete, min: 0.01, money: true });
  const manualTotal = validatedNumber(body.kwota_calkowita, "Aktualne zadłużenie", { min: 0, money: true }) ?? 0;
  let rata = validatedNumber(body.kwota_raty, "Kwota raty", { min: 0.01, money: true });
  const rrso = validatedNumber(body.rrso, "RRSO", { required: !allowIncomplete, min: 0 });
  const dzienSplaty = validatedNumber(body.dzien_splaty, "Dzień spłaty", { required: !allowIncomplete, min: 1, max: 31, integer: true });
  const dataDo = calculateInstallmentEndDate(dataRozpoczecia, iloscRat, dzienSplaty) ?? requestedDataDo;
  const oprocentowanie = validatedNumber(body.oprocentowanie, "Oprocentowanie", { required: !allowIncomplete, min: 0 });
  const prowizja = validatedNumber(body.prowizja, "Prowizja", { required: !allowIncomplete, min: 0, money: true });
  const ubezpieczenie = validatedNumber(body.ubezpieczenie, "Ubezpieczenie", { required: !allowIncomplete, min: 0, money: true });
  const active = body.active === undefined ? null : body.active === true || Number(body.active) === 1 ? 1 : body.active === false || Number(body.active) === 0 ? 0 : Number.NaN;
  if (active !== null && active !== 0 && active !== 1) throw new Error("Nieprawidłowy status kredytu.");

  if (!nazwa) throw new Error("Podaj nazwę kredytu.");
  if ((!allowIncomplete && !dataRozpoczecia) || (dataRozpoczecia && !isValidDateOnly(dataRozpoczecia)) || (dataDo && !isValidDateOnly(dataDo)) || (dataDodania && !isValidDateOnly(dataDodania))) throw new Error("Podaj prawidłowe daty kredytu.");
  const dateRangeError = validateOptionalDateRange(dataRozpoczecia, dataDo);
  if (dateRangeError) throw new Error(dateRangeError);
  if ((!allowIncomplete && iloscRat === null) || (iloscRat !== null && (!Number.isInteger(iloscRat) || iloscRat < 1))) throw new Error("Liczba rat musi być dodatnią liczbą całkowitą.");
  if ((!allowIncomplete && kapital === null) || (kapital !== null && kapital <= 0)) throw new Error("Kwota kapitału musi być większa od zera.");
  if (!allowIncomplete && (rata === null || rata <= 0) && manualTotal > 0 && iloscRat !== null) rata = Math.round(manualTotal / iloscRat * 100) / 100;
  if ((!allowIncomplete && (rata === null || rata <= 0)) || (rata !== null && rata <= 0)) throw new Error("Kwota raty musi być większa od zera.");
  if ((!allowIncomplete && dzienSplaty === null) || (dzienSplaty !== null && (!Number.isInteger(dzienSplaty) || dzienSplaty < 1 || dzienSplaty > 31))) throw new Error("Dzień spłaty musi mieścić się w zakresie 1–31.");
  if ([rrso, oprocentowanie, prowizja, ubezpieczenie].some((value) => value !== null && value < 0) || (!allowIncomplete && [rrso, oprocentowanie, prowizja, ubezpieczenie].some((value) => value === null))) throw new Error("Koszty kredytu nie mogą być ujemne.");
  if (manualTotal < 0 || (!allowIncomplete && typ !== "Kredyt" && manualTotal <= 0)) throw new Error("Podaj prawidłowe aktualne zadłużenie.");
  const kwotaCalkowita = calculateDebt(typ, manualTotal, rata, iloscRat);

  return { nazwa, typ, dataRozpoczecia, dataDo, iloscRat, kapital, kwotaCalkowita, rata, rrso, dzienSplaty, oprocentowanie, prowizja, ubezpieczenie, dataDodania, active };
}

// GET: wszystkie pożyczki
router.get("/", async (req, res) => {
  try {
    const db = await dbPromise;
    const result = await db.all(`SELECT l.id, l.nazwa, l.typ, l.data_rozpoczecia, l.data_do, l.ilosc_rat, l.kwota_kapitalu,
      l.kwota_calkowita, l.kwota_raty, l.rrso, l.dzien_splaty, l.oprocentowanie, l.prowizja, l.ubezpieczenie, l.data_dodania,
      d.account_id AS card_account_id, d.linked_card_account_id, linked_card.nazwa AS linked_card_name,
      d.recurring_expense_id, recurring_expense.nazwa AS recurring_expense_name, COALESCE(d.active, 1) AS active
      FROM loans l
      LEFT JOIN debt_plans d ON d.loan_id = l.id
      LEFT JOIN konta linked_card ON linked_card.id = d.linked_card_account_id
      LEFT JOIN wydatki_stale recurring_expense ON recurring_expense.id = d.recurring_expense_id
      ORDER BY l.id DESC`);
    res.json(result); // Zwraca czystą tablicę
  } catch (err) {
    res.status(500).json({ error: "Błąd serwera przy pobieraniu pożyczek." });
  }
});

// POST: dodaj pożyczkę
router.post("/", async (req, res) => {
  try {
    const data = normalizeLoanPayload(req.body);
    const expenseSelection = recurringExpenseSelection(req.body, "create");
    if (isInstallmentPlanType(data.typ) || isCreditCardType(data.typ)) return res.status(400).json({ error: "Kartę kredytową lub plan ratalny dodaj w Zobowiązaniach." });
    const db = await dbPromise;
    await db.exec("BEGIN");
    try {
      const result = await db.run(
        `INSERT INTO loans (nazwa, typ, data_rozpoczecia, data_do, ilosc_rat, kwota_kapitalu, kwota_calkowita, kwota_raty, rrso, dzien_splaty, oprocentowanie, prowizja, ubezpieczenie, data_dodania)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, date('now', 'localtime'))`,
        [data.nazwa, data.typ, data.dataRozpoczecia, data.dataDo, data.iloscRat, data.kapital, data.kwotaCalkowita, data.rata, data.rrso, data.dzienSplaty, data.oprocentowanie, data.prowizja, data.ubezpieczenie],
      );
      await syncDebtPlanFromLoan(db, Number(result.lastID), expenseSelection);
      const created = await db.get("SELECT * FROM loans WHERE id = ?", result.lastID);
      await db.exec("COMMIT");
      res.status(201).json(created);
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Nie udało się dodać kredytu." });
  }
});

// PUT: edytuj pożyczkę
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const data = normalizeLoanPayload(req.body, true);
    const expenseSelection = recurringExpenseSelection(req.body, "keep");
    const db = await dbPromise;
    await db.exec("BEGIN");
    try {
      const existing = await db.get<{ typ: string }>("SELECT typ FROM loans WHERE id = ?", id);
      if (!existing) {
        await db.exec("ROLLBACK");
        return res.status(404).json({ error: "Nie znaleziono kredytu." });
      }
      if (isCreditCardType(existing.typ) !== isCreditCardType(data.typ) || isInstallmentPlanType(existing.typ) !== isInstallmentPlanType(data.typ)) {
        await db.exec("ROLLBACK");
        return res.status(409).json({ error: "Nie można zmieniać kredytu w kartę kredytową lub plan ratalny ani odwrotnie." });
      }
      const result = await db.run(
        `UPDATE loans SET nazwa = ?, typ = ?, data_rozpoczecia = ?, data_do = ?, ilosc_rat = ?, kwota_kapitalu = ?, kwota_calkowita = ?, kwota_raty = ?,
         rrso = ?, dzien_splaty = ?, oprocentowanie = ?, prowizja = ?, ubezpieczenie = ?, data_dodania = ? WHERE id = ?`,
        [data.nazwa, data.typ, data.dataRozpoczecia, data.dataDo, data.iloscRat, data.kapital, data.kwotaCalkowita, data.rata, data.rrso, data.dzienSplaty, data.oprocentowanie, data.prowizja, data.ubezpieczenie, data.dataDodania, id],
      );
      if (!result.changes) {
        await db.exec("ROLLBACK");
        return res.status(404).json({ error: "Nie znaleziono kredytu." });
      }
      await syncDebtPlanFromLoan(db, id, expenseSelection);
      if (data.active !== null) await db.run("UPDATE debt_plans SET active = ?, updated_at = date('now') WHERE loan_id = ?", data.active, id);
      const linkedPlan = await db.get<{ id: number }>("SELECT id FROM debt_plans WHERE loan_id = ?", id);
      if (linkedPlan) await syncAccountFromDebtPlan(db, linkedPlan.id);
      const updated = await db.get(`SELECT l.*, COALESCE(d.active, 1) AS active FROM loans l LEFT JOIN debt_plans d ON d.loan_id = l.id WHERE l.id = ?`, id);
      await db.exec("COMMIT");
      res.json(updated);
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Nie udało się zapisać kredytu." });
  }
});

// DELETE: usuń pożyczkę
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const db = await dbPromise;
    await db.exec("BEGIN");
    try {
      const result = await db.run("DELETE FROM loans WHERE id = ?", id);
      if (!result.changes) {
        await db.exec("ROLLBACK");
        return res.status(404).json({ error: "Nie znaleziono kredytu." });
      }
      await syncDebtPlanFromLoan(db, id);
      await db.exec("COMMIT");
      res.status(204).send();
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  } catch (err) {
    res.status(500).json({ error: "Błąd serwera przy usuwaniu pożyczki." });
  }
});

// --- IMPORT HARMONOGRAMU PDF ---
// POST: Import harmonogramu PDF dla pożyczki
router.post("/:loanId/import-schedule", uploadSchedulePdf, async (req, res) => {
  const { loanId } = req.params;
  if (!req.file) return res.status(400).json({ error: "Brak pliku PDF." });
  let transactionStarted = false;
  let destinationPath: string | null = null;
  try {
    if (!Number.isInteger(Number(loanId)) || Number(loanId) <= 0) throw new Error("Nieprawidłowy kredyt.");
    // Najpierw parsujemy cały plik. Błędny PDF nie może usunąć istniejącego harmonogramu.
    const data = await pdfParse(await fs.promises.readFile(req.file.path));
    const payments = parseSchedule(data.text, loanId);
    if (!payments.length) throw new Error("Nie rozpoznano żadnych rat w pliku PDF.");
    const db = await dbPromise;
    const loan = await db.get("SELECT id FROM loans WHERE id = ?", loanId);
    if (!loan) throw new Error("Nie znaleziono kredytu.");
    await db.exec("BEGIN IMMEDIATE");
    transactionStarted = true;
    const oldPayments = await db.all("SELECT * FROM loan_payments WHERE loan_id = ?", loanId);
    for (const old of oldPayments) {
      await db.run(
        `INSERT INTO loan_payment_history (loan_payment_id, change_type, old_data, new_data, changed_at) VALUES (?, ?, ?, ?, datetime('now'))`,
        [old.id, 'import', JSON.stringify(old), null]
      );
    }
    await db.run("DELETE FROM loan_payments WHERE loan_id = ?", loanId);
    for (const payment of payments) {
      const result = await db.run(
        `INSERT INTO loan_payments (loan_id, payment_number, due_date, amount_due, principal_amount, interest_amount, saldo_po, is_paid, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, date('now'))`,
        [loanId, payment.payment_number, payment.due_date, payment.amount_due, payment.principal_amount, payment.interest_amount, payment.saldo_po]
      );
      await db.run(
        `INSERT INTO loan_payment_history (loan_payment_id, change_type, old_data, new_data, changed_at) VALUES (?, ?, ?, ?, datetime('now'))`,
        [result.lastID, 'import', null, JSON.stringify(payment)]
      );
    }
    if (!fs.existsSync(uploadsDirectory)) fs.mkdirSync(uploadsDirectory, { recursive: true });
    destinationPath = path.join(uploadsDirectory, req.file.filename + ".pdf");
    fs.renameSync(req.file.path, destinationPath);
    await db.run(
      `INSERT INTO loan_documents (loan_id, file_path, uploaded_at) VALUES (?, ?, date('now'))`,
      [loanId, destinationPath]
    );
    await db.exec("COMMIT");
    transactionStarted = false;
    res.json({ success: true, paymentsCount: payments.length });
  } catch (err) {
    if (transactionStarted) {
      const db = await dbPromise;
      await db.exec("ROLLBACK").catch(() => undefined);
    }
    if (destinationPath && fs.existsSync(destinationPath)) fs.unlinkSync(destinationPath);
    else if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(400).json({ error: "Błąd podczas importu PDF.", details: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/:loanId/ensure-schedule", async (req, res) => {
  try {
    const db = await dbPromise;
    const paymentsCount = await ensureInstallmentPlanSchedule(db, req.params.loanId);
    res.json({ success: true, paymentsCount });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Nie udało się utworzyć harmonogramu." });
  }
});

// GET: Pobierz ostatni PDF harmonogramu pożyczki
router.get("/:loanId/schedule-pdf", async (req, res) => {
  const { loanId } = req.params;
  try {
    const db = await dbPromise;
    const doc = await db.get(
      `SELECT file_path FROM loan_documents WHERE loan_id = ? ORDER BY uploaded_at DESC LIMIT 1`,
      loanId
    );
    if (doc?.file_path) {
      res.download(doc.file_path, `harmonogram-pozyczki-${loanId}.pdf`, (error) => {
        if (!error) return;
        if (!res.headersSent && !res.destroyed) res.status(400).json({ error: "Nie udało się pobrać harmonogramu." });
        else res.end(); // An aborted download must also release the SQLite queue.
      });
      return;
    }

    await ensureInstallmentPlanSchedule(db, loanId);
    const loan = await db.get<{ nazwa: string }>("SELECT nazwa FROM loans WHERE id = ?", loanId);
    const payments = await db.all<{ payment_number: number; due_date: string; amount_due: unknown; saldo_po: unknown }[]>(
      "SELECT payment_number, due_date, amount_due, saldo_po FROM loan_payments WHERE loan_id = ? ORDER BY payment_number",
      loanId,
    );
    const pdf = new jsPDF();
    pdf.setFontSize(16);
    pdf.text(`Harmonogram - ${loan?.nazwa || `plan ${loanId}`}`, 14, 18);
    pdf.setFontSize(10);
    pdf.text("Nr     Termin        Rata (PLN)     Pozostalo (PLN)", 14, 30);
    payments.forEach((payment, index) => {
      if (index > 0 && index % 34 === 0) pdf.addPage();
      const pageRow = index % 34;
      pdf.text(
        `${String(payment.payment_number).padEnd(6)} ${payment.due_date.padEnd(13)} ${Number(payment.amount_due).toFixed(2).padEnd(14)} ${Number(payment.saldo_po).toFixed(2)}`,
        14,
        38 + pageRow * 7,
      );
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=harmonogram-pozyczki-${loanId}.pdf`);
    res.send(Buffer.from(new Uint8Array(pdf.output("arraybuffer"))));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Błąd pobierania harmonogramu." });
  }
});

// Parser harmonogramu PDF (prosty przykład, dostosuj do formatu PDF)
function parseSchedule(text: string, loanId: string) {
  const lines = text.split("\n");
  const payments = [];
  for (const line of lines) {
    // Przykład dopasowania: nr rata, data, kwota raty, kapitał, odsetki, saldo po
    const match = line.match(/(\d+)\s+(\d{2}\.\d{2}\.\d{4})\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)/);
    if (match) {
      payments.push({
        payment_number: parseInt(match[1]),
        due_date: formatDate(match[2]),
        amount_due: parseFloat(match[3].replace(/,/, ".")),
        principal_amount: parseFloat(match[4].replace(/,/, ".")),
        interest_amount: parseFloat(match[5].replace(/,/, ".")),
        saldo_po: parseFloat(match[6].replace(/,/, ".")),
      });
    }
  }
  return payments;
}

function formatDate(d: string) {
  const [day, month, year] = d.split(".");
  return `${year}-${month}-${day}`;
}

export default router;
