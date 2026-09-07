import type { Database } from "sqlite";
import { isCreditAccountType } from "../utils/accountType";
import { syncLoanFromDebtPlan } from "./creditProduct";

export class AccountBalanceError extends Error {}
export interface AccountBalanceChange { beforeAvailable: number; afterAvailable: number; beforeActual: number; afterActual: number; }
export interface AccountBalanceOptions { rejectCreditOverpayment?: boolean; allowInactive?: boolean; }

const money = (value: number): number => Math.round(value * 100) / 100;

type AccountBalanceRow = {
  id: number;
  typ_depozytu: string | null;
  saldo_dostepne: unknown;
  saldo_wlasciwe: unknown;
  active: unknown;
};

type CreditCardPlanRow = {
  id: number;
  limit_kredytowy: unknown;
};

async function readAccountBalance(db: Database, accountId: number): Promise<AccountBalanceRow> {
  const row = await db.get<AccountBalanceRow>(
    "SELECT id, saldo_dostepne, saldo_wlasciwe, typ_depozytu, active FROM konta WHERE id = ?",
    accountId,
  );
  if (!row) throw new AccountBalanceError("Nie znaleziono konta.");
  return row;
}

async function creditCardPlan(db: Database, accountId: number): Promise<{ id: number; limit: number }> {
  const plans = await db.all<CreditCardPlanRow[]>(
    `SELECT id, limit_kredytowy
       FROM debt_plans
      WHERE account_id = ?
        AND lower(trim(typ)) IN ('karta', 'karta kredytowa')
      ORDER BY id
      LIMIT 2`,
    accountId,
  );
  if (plans.length === 0) throw new AccountBalanceError("Karta nie ma prawidłowo ustawionego planu karty. Uzupełnij go w Zobowiązaniach.");
  if (plans.length > 1) throw new AccountBalanceError("Karta ma więcej niż jeden plan karty. Pozostaw jedno powiązane zobowiązanie karty.");
  const limit = Number(plans[0].limit_kredytowy);
  if (!Number.isFinite(limit) || limit < 0) throw new AccountBalanceError("Karta nie ma prawidłowo ustawionego limitu kredytowego. Uzupełnij go w Zobowiązaniach.");
  return { id: plans[0].id, limit };
}

async function persistBalance(
  db: Database,
  before: AccountBalanceRow,
  availableAfter: number,
  requestedActualAfter: number,
  knownCardPlan?: { id: number; limit: number },
): Promise<AccountBalanceChange> {
  const availableBefore = Number(before.saldo_dostepne);
  const actualBefore = before.saldo_wlasciwe == null ? availableBefore : Number(before.saldo_wlasciwe);
  if (![availableBefore, actualBefore, availableAfter, requestedActualAfter].every(Number.isFinite)) {
    throw new AccountBalanceError("Konto ma nieprawidłowe saldo.");
  }

  const normalizedAvailable = money(availableAfter);
  let normalizedActual = money(requestedActualAfter);
  if (isCreditAccountType(before.typ_depozytu)) {
    const plan = knownCardPlan ?? await creditCardPlan(db, before.id);
    normalizedActual = money(normalizedAvailable - plan.limit);
    await db.run(
      "UPDATE konta SET saldo_dostepne = ?, saldo_wlasciwe = ? WHERE id = ?",
      [normalizedAvailable, normalizedActual, before.id],
    );
    await db.run(
      "UPDATE debt_plans SET wolny_limit = ?, zadluzenie = ?, updated_at = date('now', 'localtime') WHERE id = ?",
      [normalizedAvailable, Math.max(0, money(plan.limit - normalizedAvailable)), plan.id],
    );
    await syncLoanFromDebtPlan(db, plan.id);
  } else {
    await db.run(
      "UPDATE konta SET saldo_dostepne = ?, saldo_wlasciwe = ? WHERE id = ?",
      [normalizedAvailable, normalizedActual, before.id],
    );
  }

  return { beforeAvailable: availableBefore, afterAvailable: normalizedAvailable, beforeActual: actualBefore, afterActual: normalizedActual };
}

// Ręczna/absolutna korekta zachowuje dotychczasową swobodę użytkownika.
// Dla karty saldo właściwe wynika z limitu, a debt_plans jest synchronizowany w tym samym miejscu.
export async function setAccountBalanceAbsolute(
  db: Database,
  accountId: number,
  available: number,
  actual: number,
): Promise<AccountBalanceChange> {
  const before = await readAccountBalance(db, accountId);
  if (![available, actual].every(Number.isFinite)) throw new AccountBalanceError("Konto ma nieprawidłowe saldo.");
  return persistBalance(db, before, available, actual);
}

export async function applyAccountBalanceDelta(
  db: Database,
  accountId: number,
  delta: number,
  options: AccountBalanceOptions = {},
): Promise<AccountBalanceChange> {
  const before = await readAccountBalance(db, accountId);
  if (!options.allowInactive && Number(before.active ?? 1) !== 1) {
    throw new AccountBalanceError("Konto jest nieaktywne. Możesz nadal korygować dane historyczne, ale nie księgować na nim nowych operacji.");
  }
  const availableBefore = Number(before.saldo_dostepne);
  const actualBefore = before.saldo_wlasciwe == null ? availableBefore : Number(before.saldo_wlasciwe);
  if (![availableBefore, actualBefore, delta].every(Number.isFinite)) throw new AccountBalanceError("Konto ma nieprawidłowe saldo.");

  const availableAfter = money(availableBefore + delta);
  if (availableAfter < 0) {
    throw new AccountBalanceError(isCreditAccountType(before.typ_depozytu) ? "Wydatek przekracza wolny limit karty." : "Brak wystarczających środków na koncie.");
  }

  if (isCreditAccountType(before.typ_depozytu)) {
    const plan = await creditCardPlan(db, accountId);
    if (options.rejectCreditOverpayment && delta > 0 && availableAfter > plan.limit) {
      throw new AccountBalanceError("Zwrot lub uznanie nie może przekroczyć aktualnego zadłużenia karty.");
    }
    return persistBalance(db, before, availableAfter, actualBefore + delta, plan);
  }

  return persistBalance(db, before, availableAfter, actualBefore + delta);
}
