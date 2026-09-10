import { Router } from "express";
import { dbPromise } from "../db";
import { calculateDebt, isCreditCardType, isInstallmentPlanType, normalizeCreditProductType, syncAccountFromDebtPlan, syncLoanFromDebtPlan } from "../services/creditProduct";
import { applyDebtPlanPayment } from "../services/debtPlanPayment";
import { applyAccountBalanceDelta } from "../services/accountBalance";
import { reconcileRecurringCreditExpense, type RecurringExpenseSelection } from "../services/recurringCreditExpense";
import { calculateInstallmentEndDate, ensureInstallmentPlanSchedule } from "../services/installmentSchedule";
import { validateOptionalDateRange } from "../utils/dateRange";
import { canLinkToCreditProduct } from "../utils/accountType";
import { deleteRecurringEntry } from "../services/recurringEntries";

const router = Router();
const allowedTypes = new Set(["Dług", "Raty", "Kredyt", "Kredyt hipoteczny", "Karta kredytowa", "Plan ratalny", "Inne"]);

function hasDetailedCreditCosts(type: string): boolean {
  return type === "Kredyt" || type === "Kredyt hipoteczny";
}

function hasLoanModel(type: string): boolean {
  return hasDetailedCreditCosts(type) || isCreditCardType(type) || isInstallmentPlanType(type);
}

type DebtPlanPayload = {
  produkt?: unknown;
  typ?: unknown;
  zadluzenie?: unknown;
  rata_miesieczna?: unknown;
  ilosc_rat?: unknown;
  wolny_limit?: unknown;
  limit_kredytowy?: unknown;
  recurring_expense_id?: unknown;
  recurring_expense_mode?: unknown;
  data_od?: unknown;
  data_do?: unknown;
  dzien_miesiaca?: unknown;
  linked_card_account_id?: unknown;
  one_time_fee?: unknown;
  repayment_account_id?: unknown;
  kwota_kapitalu?: unknown;
  rrso?: unknown;
  oprocentowanie?: unknown;
  prowizja?: unknown;
  ubezpieczenie?: unknown;
  active?: unknown;
};

function recurringExpenseSelection(body: DebtPlanPayload, fallback: RecurringExpenseSelection["mode"]): RecurringExpenseSelection {
  const mode = String(body.recurring_expense_mode ?? fallback);
  if (!(["keep", "none", "create", "link"] as const).includes(mode as RecurringExpenseSelection["mode"])) {
    throw new Error("Nieprawidłowy sposób powiązania stałego wydatku.");
  }
  const expenseId = optionalNumber(body.recurring_expense_id);
  if (mode === "link" && (expenseId === null || !Number.isInteger(expenseId) || expenseId <= 0)) throw new Error("Wybierz istniejący stały wydatek.");
  return { mode: mode as RecurringExpenseSelection["mode"], expenseId };
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

async function normalizePayload(body: DebtPlanPayload) {
  const produkt = String(body.produkt ?? "").trim();
  const rawType = String(body.typ ?? "").trim();
  const typ = ["Kredyt", "Kredyt hipoteczny", "Karta", "Karta kredytowa"].includes(rawType) ? normalizeCreditProductType(rawType) : rawType;
  const manualDebt = optionalNumber(body.zadluzenie) ?? 0;
  const card = isCreditCardType(typ);
  const installmentPlan = isInstallmentPlanType(typ);
  let rataMiesieczna = card ? null : optionalNumber(body.rata_miesieczna);
  const iloscRat = card ? null : optionalNumber(body.ilosc_rat);
  const wolnyLimit = card ? optionalNumber(body.wolny_limit) : null;
  const limitKredytowy = card ? optionalNumber(body.limit_kredytowy) : null;
  const recurringExpenseId = card ? null : optionalNumber(body.recurring_expense_id);
  const dataOd = body.data_od ? String(body.data_od).slice(0, 10) : null;
  const requestedDataDo = body.data_do ? String(body.data_do).slice(0, 10) : null;
  const requestedDateRangeError = validateOptionalDateRange(dataOd, requestedDataDo);
  if (requestedDateRangeError) throw new Error(requestedDateRangeError);
  const dzienMiesiaca = optionalNumber(body.dzien_miesiaca);
  const dataDo = calculateInstallmentEndDate(dataOd, iloscRat, dzienMiesiaca) ?? requestedDataDo;
  const linkedCardAccountId = installmentPlan ? optionalNumber(body.linked_card_account_id) : null;
  const oneTimeFee = installmentPlan ? (optionalNumber(body.one_time_fee) ?? 0) : 0;
  const repaymentAccountId = card ? optionalNumber(body.repayment_account_id) : null;
  const detailedCredit = hasDetailedCreditCosts(typ);
  const capital = detailedCredit ? optionalNumber(body.kwota_kapitalu) : null;
  const rrso = installmentPlan ? 0 : (detailedCredit ? optionalNumber(body.rrso) : null);
  const interest = installmentPlan ? 0 : (card || detailedCredit ? optionalNumber(body.oprocentowanie) : null);
  const commission = installmentPlan ? oneTimeFee : (detailedCredit ? optionalNumber(body.prowizja) : null);
  const insurance = detailedCredit ? optionalNumber(body.ubezpieczenie) : null;
  const active = body.active === undefined ? null : body.active === true || Number(body.active) === 1 ? 1 : body.active === false || Number(body.active) === 0 ? 0 : Number.NaN;
  if (active !== null && active !== 0 && active !== 1) throw new Error("Nieprawidłowy status zobowiązania.");
  // Nieaktywny plan ratalny oznacza plan spłacony. Zachowujemy jego dane
  // historyczne, ale pozostałe zadłużenie musi wynosić zero.
  const calculatedDebt = installmentPlan && active === 0 ? 0 : calculateDebt(typ, manualDebt, rataMiesieczna, iloscRat);

  if (!produkt) throw new Error("Podaj nazwę produktu.");
  if (!allowedTypes.has(typ)) throw new Error("Wybierz prawidłowy typ zobowiązania.");
  if (!Number.isFinite(manualDebt) || manualDebt < 0) throw new Error("Zadłużenie nie może być ujemne.");
  for (const [label, value] of [["Rata", rataMiesieczna], ["Liczba rat", iloscRat], ["Wolny limit", wolnyLimit], ["Limit", limitKredytowy]] as const) {
    if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error(`${label} nie może mieć wartości ujemnej.`);
  }
  if (card && (wolnyLimit === null || limitKredytowy === null)) throw new Error("Podaj wolny limit i limit karty.");
  if (iloscRat !== null && !Number.isInteger(iloscRat)) throw new Error("Liczba rat musi być liczbą całkowitą.");
  if (recurringExpenseId !== null && (!Number.isInteger(recurringExpenseId) || recurringExpenseId <= 0)) throw new Error("Nieprawidłowe powiązanie ze stałym wydatkiem.");
  if (dzienMiesiaca !== null && (!Number.isInteger(dzienMiesiaca) || dzienMiesiaca < 1 || dzienMiesiaca > 31)) throw new Error("Dzień płatności musi mieścić się w zakresie 1–31.");
  if (!Number.isFinite(oneTimeFee) || oneTimeFee < 0) throw new Error("Opłata jednorazowa nie może być ujemna.");
  for (const [label, value] of [["Kapitał", capital], ["RRSO", rrso], ["Oprocentowanie", interest], ["Prowizja", commission], ["Ubezpieczenie", insurance]] as const) {
    if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error(`${label} nie może mieć wartości ujemnej.`);
  }
  if (repaymentAccountId !== null) {
    if (!Number.isInteger(repaymentAccountId) || repaymentAccountId <= 0) throw new Error("Nieprawidłowe konto spłacające kartę.");
    const db = await dbPromise;
    const repaymentAccount = await db.get<{ typ_depozytu: string }>("SELECT typ_depozytu FROM konta WHERE id = ?", repaymentAccountId);
    if (!repaymentAccount || !canLinkToCreditProduct(repaymentAccount.typ_depozytu)) throw new Error("Kontem spłacającym musi być zwykłe konto lub gotówka, nie wirtualny portfel.");
  }
  if (installmentPlan) {
    if (active !== 0 && calculatedDebt <= 0) throw new Error("Pozostała kwota planu musi być większa od zera.");
    if (active !== 0 && (rataMiesieczna === null || rataMiesieczna <= 0)) throw new Error("Rata planu musi być większa od zera.");
    if (active !== 0 && (iloscRat === null || !Number.isInteger(iloscRat) || iloscRat <= 0)) throw new Error("Podaj dodatnią liczbę pozostałych rat.");
    if (active !== 0 && rataMiesieczna !== null && rataMiesieczna > calculatedDebt) throw new Error("Rata nie może być większa od pozostałej kwoty planu.");
    if (linkedCardAccountId === null || !Number.isInteger(linkedCardAccountId) || linkedCardAccountId <= 0) throw new Error("Wybierz kartę kredytową dla planu ratalnego.");
    const db = await dbPromise;
    const linkedCard = await db.get<{ typ_depozytu: string }>("SELECT typ_depozytu FROM konta WHERE id = ?", linkedCardAccountId);
    if (!linkedCard || !String(linkedCard.typ_depozytu).toLocaleLowerCase("pl-PL").includes("kredyt")) throw new Error("Plan ratalny można powiązać tylko z kartą kredytową.");
  }

  if (recurringExpenseId !== null) {
    const db = await dbPromise;
    const expense = await db.get<{ id: number }>("SELECT id FROM wydatki_stale WHERE id = ?", recurringExpenseId);
    if (!expense) throw new Error("Powiązany stały wydatek nie istnieje.");
  }

  const zadluzenie = card && wolnyLimit !== null && limitKredytowy !== null
    ? Math.max(0, Math.round((limitKredytowy - wolnyLimit) * 100) / 100)
    : calculatedDebt;
  return { produkt, typ, zadluzenie, rataMiesieczna, iloscRat, wolnyLimit, limitKredytowy, recurringExpenseId, dataOd, dataDo, dzienMiesiaca, linkedCardAccountId, oneTimeFee, repaymentAccountId, capital, rrso, interest, commission, insurance, active };
}

const selectDebtPlans = `
  SELECT
    d.id, d.produkt, d.typ, d.zadluzenie, d.active,
    COALESCE(CAST(w.kwota AS REAL), d.rata_miesieczna) AS rata_miesieczna,
    d.ilosc_rat, d.wolny_limit, d.limit_kredytowy, d.recurring_expense_id, d.loan_id, d.account_id,
    d.linked_card_account_id, linked_card.nazwa AS linked_card_name, d.one_time_fee,
    card_account.repayment_account_id, repayment_account.nazwa AS repayment_account_name,
    l.kwota_kapitalu AS kapital, l.rrso, l.oprocentowanie, l.prowizja, l.ubezpieczenie, l.data_dodania,
    w.nazwa AS recurring_expense_name,
    COALESCE(w.data_od, d.start_date, l.data_rozpoczecia) AS data_od, COALESCE(w.data_do, l.data_do) AS data_do,
    COALESCE(w.dzien_miesiaca, l.dzien_splaty) AS dzien_miesiaca,
    d.updated_at
  FROM debt_plans d
  LEFT JOIN wydatki_stale w ON w.id = d.recurring_expense_id
  LEFT JOIN loans l ON l.id = d.loan_id
  LEFT JOIN konta linked_card ON linked_card.id = d.linked_card_account_id
  LEFT JOIN konta card_account ON card_account.id = COALESCE(d.account_id, d.linked_card_account_id)
  LEFT JOIN konta repayment_account ON repayment_account.id = card_account.repayment_account_id
`;

router.get("/", async (_req, res) => {
  try {
    const db = await dbPromise;
    res.json(await db.all(`${selectDebtPlans} ORDER BY d.id DESC`));
  } catch (error) {
    res.status(500).json({ error: "Nie udało się pobrać planu pożyczek.", details: error instanceof Error ? error.message : String(error) });
  }
});

router.post("/", async (req, res) => {
  try {
    const data = await normalizePayload(req.body);
    const db = await dbPromise;
    await db.exec("BEGIN");
    try {
      const selection = isCreditCardType(data.typ)
        ? { mode: "none" as const }
        : recurringExpenseSelection(req.body, data.rataMiesieczna !== null && data.rataMiesieczna > 0 ? "create" : "none");
      const recurringExpenseId = await reconcileRecurringCreditExpense(db, null, selection, {
        name: data.produkt, installment: data.rataMiesieczna, startDate: data.dataOd,
        endDate: data.dataDo, paymentDay: data.dzienMiesiaca,
      });

      const result = await db.run(
        `INSERT INTO debt_plans
         (produkt, typ, zadluzenie, rata_miesieczna, ilosc_rat, wolny_limit, limit_kredytowy, recurring_expense_id, loan_id, account_id, linked_card_account_id, one_time_fee, start_date, active, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, date('now'))`,
        [data.produkt, data.typ, data.zadluzenie, data.rataMiesieczna, data.iloscRat, data.wolnyLimit, data.limitKredytowy, recurringExpenseId, data.linkedCardAccountId, data.oneTimeFee, data.dataOd, data.active ?? 1],
      );
      if (hasLoanModel(data.typ)) await syncLoanFromDebtPlan(db, Number(result.lastID), true);
      const linkedProduct = await db.get<{ loan_id: number | null }>("SELECT loan_id FROM debt_plans WHERE id = ?", result.lastID);
      if (linkedProduct?.loan_id !== null && linkedProduct?.loan_id !== undefined) await db.run(
        "UPDATE loans SET kwota_kapitalu = ?, rrso = ?, oprocentowanie = ?, prowizja = ?, ubezpieczenie = ?, data_rozpoczecia = ?, data_do = ?, dzien_splaty = ? WHERE id = ?",
        [data.capital, data.rrso, data.interest, data.commission, data.insurance, data.dataOd, data.dataDo, data.dzienMiesiaca, linkedProduct.loan_id],
      );
      if (isInstallmentPlanType(data.typ) && linkedProduct?.loan_id !== null && linkedProduct?.loan_id !== undefined) {
        await ensureInstallmentPlanSchedule(db, linkedProduct.loan_id, true);
      }
      await syncAccountFromDebtPlan(db, Number(result.lastID));
      const account = await db.get<{ account_id: number | null }>("SELECT account_id FROM debt_plans WHERE id = ?", result.lastID);
      if (account?.account_id !== null && account?.account_id !== undefined) await db.run("UPDATE konta SET repayment_account_id = ? WHERE id = ?", [data.repaymentAccountId, account.account_id]);
      const row = await db.get(`${selectDebtPlans} WHERE d.id = ?`, result.lastID);
      await db.exec("COMMIT");
      res.status(201).json(row);
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const data = await normalizePayload(req.body);
    const db = await dbPromise;
    await db.exec("BEGIN");
    try {
      const existing = await db.get<{ typ: string; recurring_expense_id: number | null; loan_id: number | null; account_id: number | null; active: unknown }>("SELECT typ, recurring_expense_id, loan_id, account_id, active FROM debt_plans WHERE id = ?", req.params.id);
      if (!existing) {
        await db.exec("ROLLBACK");
        return res.status(404).json({ error: "Nie znaleziono pozycji planu pożyczek." });
      }
      if (isCreditCardType(existing.typ) !== isCreditCardType(data.typ) || isInstallmentPlanType(existing.typ) !== isInstallmentPlanType(data.typ)) {
        await db.exec("ROLLBACK");
        return res.status(409).json({ error: "Nie można zmieniać kredytu w kartę kredytową lub plan ratalny ani odwrotnie." });
      }

      const selection = isCreditCardType(data.typ) ? { mode: "none" as const } : recurringExpenseSelection(req.body, "keep");
      const recurringExpenseId = await reconcileRecurringCreditExpense(db, existing.recurring_expense_id, selection, {
        name: data.produkt, installment: data.rataMiesieczna, startDate: data.dataOd,
        endDate: data.dataDo, paymentDay: data.dzienMiesiaca,
      }, req.params.id);

      await db.run(
        `UPDATE debt_plans SET
         produkt = ?, typ = ?, zadluzenie = ?, rata_miesieczna = ?, ilosc_rat = ?, wolny_limit = ?,
         limit_kredytowy = ?, recurring_expense_id = ?, linked_card_account_id = ?, one_time_fee = ?, start_date = ?, active = ?, updated_at = date('now')
         WHERE id = ?`,
        [data.produkt, data.typ, data.zadluzenie, data.rataMiesieczna, data.iloscRat, data.wolnyLimit, data.limitKredytowy, recurringExpenseId, data.linkedCardAccountId, data.oneTimeFee, data.dataOd, data.active ?? Number(existing.active ?? 1), req.params.id],
      );
      if (hasLoanModel(data.typ)) {
        await syncLoanFromDebtPlan(db, req.params.id, true);
      } else if (existing.loan_id !== null) {
        await db.run("UPDATE debt_plans SET loan_id = NULL WHERE id = ?", req.params.id);
        await db.run("DELETE FROM loans WHERE id = ?", existing.loan_id);
      }
      const linkedProduct = await db.get<{ loan_id: number | null }>("SELECT loan_id FROM debt_plans WHERE id = ?", req.params.id);
      if (linkedProduct?.loan_id !== null && linkedProduct?.loan_id !== undefined) await db.run(
        "UPDATE loans SET kwota_kapitalu = ?, rrso = ?, oprocentowanie = ?, prowizja = ?, ubezpieczenie = ?, data_rozpoczecia = ?, data_do = ?, dzien_splaty = ? WHERE id = ?",
        [data.capital, data.rrso, data.interest, data.commission, data.insurance, data.dataOd, data.dataDo, data.dzienMiesiaca, linkedProduct.loan_id],
      );
      if (isInstallmentPlanType(data.typ) && linkedProduct?.loan_id !== null && linkedProduct?.loan_id !== undefined) await ensureInstallmentPlanSchedule(db, linkedProduct.loan_id, true);
      await syncAccountFromDebtPlan(db, req.params.id);
      if (existing.account_id !== null && isCreditCardType(data.typ)) await db.run("UPDATE konta SET repayment_account_id = ? WHERE id = ?", [data.repaymentAccountId, existing.account_id]);
      const updated = await db.get(`${selectDebtPlans} WHERE d.id = ?`, req.params.id);
      await db.exec("COMMIT");
      res.json(updated);
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: message });
  }
});

router.post("/:id/pay-installment", async (req, res) => {
  const id = Number(req.params.id);
  const paymentAccountId = Number(req.body?.account_id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Nieprawidłowy plan ratalny." });
  if (!Number.isInteger(paymentAccountId) || paymentAccountId <= 0) return res.status(400).json({ error: "Wybierz konto, z którego ma zostać spłacona rata." });
  const db = await dbPromise;
  let transactionStarted = false;
  try {
    await db.exec("BEGIN IMMEDIATE");
    transactionStarted = true;
    const plan = await db.get<{
      id: number; produkt: string; typ: string; zadluzenie: unknown; rata_miesieczna: unknown; ilosc_rat: unknown; active: unknown;
      recurring_expense_id: number | null; linked_card_account_id: number | null; loan_id: number | null;
      card_name: string; saldo_dostepne: unknown; saldo_wlasciwe: unknown; limit_kredytowy: unknown; repayment_account_id: number | null;
    }>(`SELECT d.id, d.produkt, d.typ, d.zadluzenie, d.rata_miesieczna, d.ilosc_rat, d.active, d.recurring_expense_id,
        d.linked_card_account_id, d.loan_id, k.nazwa AS card_name, k.saldo_dostepne, k.saldo_wlasciwe, k.repayment_account_id,
        card_plan.limit_kredytowy
      FROM debt_plans d
      JOIN konta k ON k.id = d.linked_card_account_id
      LEFT JOIN debt_plans card_plan ON card_plan.account_id = k.id AND lower(trim(card_plan.typ)) IN ('karta', 'karta kredytowa')
      WHERE d.id = ?`, id);
    if (!plan || !isInstallmentPlanType(plan.typ)) throw new Error("Nie znaleziono planu ratalnego powiązanego z kartą.");
    if (Number(plan.active ?? 1) !== 1) throw new Error("Zobowiązanie jest nieaktywne. Możesz je edytować historycznie, ale nie księgować kolejnych spłat.");
    const linkedCardAccountId = Number(plan.linked_card_account_id);
    if (!Number.isInteger(linkedCardAccountId) || linkedCardAccountId <= 0) throw new Error("Plan ratalny nie ma prawidłowo powiązanej karty.");
    const debtBefore = Number(plan.zadluzenie);
    const installment = Number(plan.rata_miesieczna);
    const availableBefore = Number(plan.saldo_dostepne);
    const limit = Number(plan.limit_kredytowy);
    if (![debtBefore, installment, availableBefore, limit].every(Number.isFinite) || debtBefore <= 0 || installment <= 0 || limit <= 0) throw new Error("Plan lub karta mają niepełne dane do spłaty raty.");
    if (plan.loan_id !== null) await ensureInstallmentPlanSchedule(db, plan.loan_id);
    const paid = Math.round(Math.min(debtBefore, installment) * 100) / 100;
    const paymentAccount = await db.get<{ id: number; nazwa: string; saldo_dostepne: unknown; saldo_wlasciwe: unknown; typ_depozytu: string }>(
      "SELECT id, nazwa, saldo_dostepne, saldo_wlasciwe, typ_depozytu FROM konta WHERE id = ?",
      paymentAccountId,
    );
    if (!paymentAccount || !canLinkToCreditProduct(paymentAccount.typ_depozytu)) throw new Error("Ratę można spłacić tylko ze zwykłego konta lub gotówki, nie wirtualnego portfela.");
    const paymentAvailableBefore = Number(paymentAccount.saldo_dostepne);
    const paymentActualBefore = Number(paymentAccount.saldo_wlasciwe);
    if (![paymentAvailableBefore, paymentActualBefore].every(Number.isFinite) || paymentAvailableBefore < paid) throw new Error("Na wybranym koncie nie ma wystarczających środków na spłatę raty.");
    const paymentAvailableAfter = Math.round((paymentAvailableBefore - paid) * 100) / 100;
    const paymentActualAfter = Math.round((paymentActualBefore - paid) * 100) / 100;
    const cardBalanceDelta = Math.max(0, Math.min(paid, Math.round((limit - availableBefore) * 100) / 100));
    const availableAfter = Math.round((availableBefore + cardBalanceDelta) * 100) / 100;
    const actualAfter = Math.round((availableAfter - limit) * 100) / 100;
    await applyAccountBalanceDelta(db, paymentAccountId, -paid);
    await applyAccountBalanceDelta(db, linkedCardAccountId, cardBalanceDelta);
    await db.run("UPDATE konta SET repayment_account_id = ? WHERE id = ?", [paymentAccountId, linkedCardAccountId]);
    const { debtAfter } = await applyDebtPlanPayment(db, { debtPlanId: id, amount: paid, paymentDate: new Date().toISOString().slice(0, 10) });
    await db.run(
      `INSERT INTO app_activity_log (user_id, action_type, entity_type, entity_id, old_data, new_data, metadata, comment)
       VALUES (NULL, 'INSTALLMENT_PLAN_PAYMENT_OUT', 'konta', ?, ?, ?, ?, ?)`,
      [
        paymentAccountId,
        JSON.stringify({ nazwa: paymentAccount.nazwa, saldo_dostepne: paymentAvailableBefore, saldo_wlasciwe: paymentActualBefore }),
        JSON.stringify({ nazwa: paymentAccount.nazwa, saldo_dostepne: paymentAvailableAfter, saldo_wlasciwe: paymentActualAfter }),
        JSON.stringify({ plan_id: id, plan_name: plan.produkt, card_id: linkedCardAccountId, installment_amount: paid, source: "installment-plan" }),
        `Spłata raty planu „${plan.produkt}” na karcie ${plan.card_name}: ${paid.toFixed(2)} zł.`,
      ],
    );
    if (plan.loan_id !== null) await db.run(
      `UPDATE loan_payments SET is_paid = 1, paid_date = date('now', 'localtime')
       WHERE id = (SELECT id FROM loan_payments WHERE loan_id = ? AND is_paid = 0 ORDER BY payment_number LIMIT 1)`,
      plan.loan_id,
    );
    await db.run(
      `INSERT INTO app_activity_log (user_id, action_type, entity_type, entity_id, old_data, new_data, metadata, comment)
       VALUES (NULL, 'INSTALLMENT_PLAN_PAYMENT', 'konta', ?, ?, ?, ?, ?)`,
      [
        linkedCardAccountId,
        JSON.stringify({ nazwa: plan.card_name, saldo_dostepne: availableBefore, saldo_wlasciwe: Number(plan.saldo_wlasciwe) }),
        JSON.stringify({ nazwa: plan.card_name, saldo_dostepne: availableAfter, saldo_wlasciwe: actualAfter }),
        JSON.stringify({ plan_id: id, plan_name: plan.produkt, installment_amount: paid, debt_before: debtBefore, debt_after: debtAfter, source: "installment-plan" }),
        `Spłata raty planu „${plan.produkt}”: ${paid.toFixed(2)} zł. Pozostało ${debtAfter.toFixed(2)} zł.`,
      ],
    );
    const updated = await db.get(`${selectDebtPlans} WHERE d.id = ?`, id);
    await db.exec("COMMIT");
    transactionStarted = false;
    res.json({ plan: updated, card: { id: linkedCardAccountId, saldo_dostepne: availableAfter, saldo_wlasciwe: actualAfter }, payment_account: { id: paymentAccountId, saldo_dostepne: paymentAvailableAfter, saldo_wlasciwe: paymentActualAfter }, paid });
  } catch (error) {
    if (transactionStarted) await db.exec("ROLLBACK").catch(() => undefined);
    res.status(400).json({ error: error instanceof Error ? error.message : "Nie udało się spłacić raty." });
  }
});

router.post("/:id/pay-debt-installment", async (req, res) => {
  const id = Number(req.params.id);
  const paymentAccountId = Number(req.body?.account_id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Nieprawidłowe zobowiązanie." });
  if (!Number.isInteger(paymentAccountId) || paymentAccountId <= 0) return res.status(400).json({ error: "Wybierz konto, z którego ma zostać spłacona rata." });
  const db = await dbPromise;
  let transactionStarted = false;
  try {
    await db.exec("BEGIN IMMEDIATE");
    transactionStarted = true;
    const plan = await db.get<{
      id: number; produkt: string; typ: string; zadluzenie: unknown; rata_miesieczna: unknown;
      ilosc_rat: unknown; recurring_expense_id: number | null; loan_id: number | null; active: unknown;
    }>("SELECT id, produkt, typ, zadluzenie, rata_miesieczna, ilosc_rat, recurring_expense_id, loan_id, active FROM debt_plans WHERE id = ?", id);
    const normalizedType = String(plan?.typ || "").trim().toLocaleLowerCase("pl-PL");
    if (!plan || !new Set(["kredyt", "kredyt hipoteczny", "dług"]).has(normalizedType)) {
      throw new Error("Spłata raty jest dostępna dla kredytu, kredytu hipotecznego i długu.");
    }
    if (Number(plan.active ?? 1) !== 1) throw new Error("Zobowiązanie jest nieaktywne. Możesz je edytować historycznie, ale nie księgować kolejnych spłat.");
    const debtBefore = Number(plan.zadluzenie);
    const installment = Number(plan.rata_miesieczna);
    if (![debtBefore, installment].every(Number.isFinite) || debtBefore <= 0 || installment <= 0) throw new Error("Zobowiązanie nie ma prawidłowej kwoty raty.");
    const paid = Math.round(Math.min(debtBefore, installment) * 100) / 100;
    const account = await db.get<{ id: number; nazwa: string; saldo_dostepne: unknown; saldo_wlasciwe: unknown; typ_depozytu: string }>(
      "SELECT id, nazwa, saldo_dostepne, saldo_wlasciwe, typ_depozytu FROM konta WHERE id = ?",
      paymentAccountId,
    );
    if (!account || !canLinkToCreditProduct(account.typ_depozytu)) throw new Error("Ratę można spłacić tylko ze zwykłego konta lub gotówki, nie wirtualnego portfela.");
    const availableBefore = Number(account.saldo_dostepne);
    const actualBefore = Number(account.saldo_wlasciwe);
    if (![availableBefore, actualBefore].every(Number.isFinite) || availableBefore < paid) throw new Error("Na wybranym koncie nie ma wystarczających środków na spłatę raty.");
    const availableAfter = Math.round((availableBefore - paid) * 100) / 100;
    const actualAfter = Math.round((actualBefore - paid) * 100) / 100;
    await applyAccountBalanceDelta(db, paymentAccountId, -paid);
    const { debtAfter } = await applyDebtPlanPayment(db, { debtPlanId: id, amount: paid, paymentDate: new Date().toISOString().slice(0, 10) });
    if (plan.loan_id !== null) await db.run(
      `UPDATE loan_payments SET is_paid = 1, paid_date = date('now', 'localtime')
       WHERE id = (SELECT id FROM loan_payments WHERE loan_id = ? AND is_paid = 0 ORDER BY payment_number LIMIT 1)`,
      plan.loan_id,
    );
    await db.run(
      `INSERT INTO app_activity_log (user_id, action_type, entity_type, entity_id, old_data, new_data, metadata, comment)
       VALUES (NULL, 'DEBT_INSTALLMENT_PAYMENT', 'konta', ?, ?, ?, ?, ?)`,
      [
        paymentAccountId,
        JSON.stringify({ nazwa: account.nazwa, saldo_dostepne: availableBefore, saldo_wlasciwe: actualBefore }),
        JSON.stringify({ nazwa: account.nazwa, saldo_dostepne: availableAfter, saldo_wlasciwe: actualAfter }),
        JSON.stringify({ debt_plan_id: id, product_name: plan.produkt, installment_amount: paid, debt_before: debtBefore, debt_after: debtAfter }),
        `Spłata raty „${plan.produkt}”: ${paid.toFixed(2)} zł. Pozostało ${debtAfter.toFixed(2)} zł.`,
      ],
    );
    const updated = await db.get(`${selectDebtPlans} WHERE d.id = ?`, id);
    await db.exec("COMMIT");
    transactionStarted = false;
    res.json({ plan: updated, payment_account: { id: paymentAccountId, saldo_dostepne: availableAfter, saldo_wlasciwe: actualAfter }, paid });
  } catch (error) {
    if (transactionStarted) await db.exec("ROLLBACK").catch(() => undefined);
    res.status(400).json({ error: error instanceof Error ? error.message : "Nie udało się spłacić raty." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const db = await dbPromise;
    await db.exec("BEGIN");
    try {
      const plan = await db.get<{ recurring_expense_id: number | null; loan_id: number | null }>("SELECT recurring_expense_id, loan_id FROM debt_plans WHERE id = ?", req.params.id);
      if (!plan) {
        await db.exec("ROLLBACK");
        return res.status(404).json({ error: "Nie znaleziono pozycji planu pożyczek." });
      }
      await db.run("DELETE FROM debt_plans WHERE id = ?", req.params.id);
      if (plan.recurring_expense_id !== null) await deleteRecurringEntry(db, "expense", plan.recurring_expense_id);
      if (plan.loan_id !== null) await db.run("DELETE FROM loans WHERE id = ?", plan.loan_id);
      await db.exec("COMMIT");
      res.status(204).send();
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  } catch (error) {
    res.status(500).json({ error: "Nie udało się usunąć pozycji planu pożyczek.", details: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
