import { Router } from "express";
import { dbPromise } from "../db";

const router = Router();

// Get all payments for a loan. The schedule is a read-only projection of the
// financial product; real repayment is booked through /debt-plans so account
// balance, debt and installment status change atomically in one place.
router.get("/loan/:loanId", async (req, res) => {
  const { loanId } = req.params;
  try {
    const db = await dbPromise;
    const stmt = await db.prepare("SELECT * FROM loan_payments WHERE loan_id = ? ORDER BY due_date ASC");
    const rows = await stmt.all(loanId);
    await stmt.finalize();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Błąd pobierania płatności." });
  }
});

// Legacy endpoint kept only to give old clients an explicit answer. Marking a
// schedule row as paid without booking the payment caused debt/account data to
// disagree, so this action is intentionally no longer allowed.
router.post("/pay/:paymentId", async (req, res) => {
  const paymentId = Number(req.params.paymentId);
  if (!Number.isInteger(paymentId) || paymentId <= 0) return res.status(400).json({ error: "Nieprawidłowa rata." });
  try {
    const db = await dbPromise;
    const payment = await db.get<{ id: number }>("SELECT id FROM loan_payments WHERE id = ?", paymentId);
    if (!payment) return res.status(404).json({ error: "Nie znaleziono płatności o podanym ID." });
    return res.status(409).json({ error: "Ratę spłać w zakładce Zobowiązania, wybierając konto obciążane płatnością." });
  } catch (err) {
    res.status(500).json({ error: "Błąd sprawdzania płatności." });
  }
});

// GET: historia zmian rat dla pożyczki
router.get("/:loanId/history", async (req, res) => {
  const { loanId } = req.params;
  try {
    const db = await dbPromise;
    const rows = await db.all(`
      SELECT h.*, p.payment_number, p.due_date, p.amount_due
      FROM loan_payment_history h
      LEFT JOIN loan_payments p ON h.loan_payment_id = p.id
      WHERE p.loan_id = ? OR (
        h.old_data IS NOT NULL AND json_extract(h.old_data, '$.loan_id') = ?
      )
      ORDER BY h.changed_at DESC
    `, loanId, loanId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Błąd pobierania historii zmian rat." });
  }
});

export default router;
