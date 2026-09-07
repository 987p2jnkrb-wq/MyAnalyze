import type { Database } from 'sqlite';
import { isCreditAccountType } from '../utils/accountType';

export type ImportedTransactionKind = 'income' | 'expense';

export class StatementTransferError extends Error {}

function tableFor(kind: ImportedTransactionKind): 'przychody' | 'wydatki' {
  return kind === 'income' ? 'przychody' : 'wydatki';
}

interface ImportedRow {
  id: number;
  kwota: number;
  account_id: number | null;
  account_type: string | null;
  zrealizowany: unknown;
  excluded_from_analysis: unknown;
  transaction_type: string | null;
}

function isTrue(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

export async function linkImportedTransfer(
  db: Database,
  kind: ImportedTransactionKind,
  transactionId: number,
  counterpartKind: ImportedTransactionKind,
  counterpartId: number,
  options: { manual?: boolean } = {},
): Promise<number> {
  const manual = options.manual === true;
  const [transaction, counterpart] = await Promise.all([
    db.get<ImportedRow>(`SELECT transaction_row.id, transaction_row.kwota, transaction_row.account_id, transaction_row.zrealizowany, transaction_row.excluded_from_analysis, transaction_row.transaction_type, account.typ_depozytu AS account_type FROM ${tableFor(kind)} transaction_row LEFT JOIN konta account ON account.id = transaction_row.account_id WHERE transaction_row.id = ?`, transactionId),
    db.get<ImportedRow>(`SELECT transaction_row.id, transaction_row.kwota, transaction_row.account_id, transaction_row.zrealizowany, transaction_row.excluded_from_analysis, transaction_row.transaction_type, account.typ_depozytu AS account_type FROM ${tableFor(counterpartKind)} transaction_row LEFT JOIN konta account ON account.id = transaction_row.account_id WHERE transaction_row.id = ?`, counterpartId),
  ]);
  if (!transaction || !counterpart) {
    throw new StatementTransferError('Nie znaleziono jednej z operacji.');
  }
  if (kind === counterpartKind && transactionId === counterpartId) {
    throw new StatementTransferError('Operacja nie może być powiązana sama ze sobą.');
  }
  if (kind === 'income' && counterpartKind === 'income') {
    throw new StatementTransferError('Nie można powiązać dwóch przychodów jako transferu własnego.');
  }
  if (kind === 'expense' && counterpartKind === 'expense') {
    const creditCardInvolved = isCreditAccountType(transaction.account_type) || isCreditAccountType(counterpart.account_type);
    const cardRepaymentInvolved = transaction.transaction_type === 'card_repayment' || counterpart.transaction_type === 'card_repayment';
    if (!creditCardInvolved || !cardRepaymentInvolved) {
      throw new StatementTransferError('Transfer własny powinien łączyć wydatek z przychodem.');
    }
  }
  if (!manual) {
    if (!isTrue(transaction.zrealizowany) || !isTrue(counterpart.zrealizowany)) {
      throw new StatementTransferError('Transfer można powiązać wyłącznie między dwiema wykonanymi operacjami.');
    }
    if (transaction.account_id === null || counterpart.account_id === null || Number(transaction.account_id) === Number(counterpart.account_id)) {
      throw new StatementTransferError('Transfer musi łączyć dwa różne własne konta.');
    }
    if (Math.round(Number(transaction.kwota) * 100) !== Math.round(Number(counterpart.kwota) * 100)) {
      throw new StatementTransferError('Kwoty obu stron transferu muszą być identyczne.');
    }
  }
  const existing = await db.get(
    `SELECT id FROM statement_cross_transaction_links
      WHERE (left_kind = ? AND left_transaction_id = ?) OR (right_kind = ? AND right_transaction_id = ?)
         OR (left_kind = ? AND left_transaction_id = ?) OR (right_kind = ? AND right_transaction_id = ?)`,
    [kind, transactionId, kind, transactionId, counterpartKind, counterpartId, counterpartKind, counterpartId],
  );
  if (existing) throw new StatementTransferError('Jedna z operacji jest już powiązana z innym transferem.');
  const result = await db.run(
    `INSERT INTO statement_cross_transaction_links
      (left_kind, left_transaction_id, right_kind, right_transaction_id, left_was_excluded, right_was_excluded)
     VALUES (?, ?, ?, ?, ?, ?)`,
    // These legacy columns preserve the user's state for unlinking, while a
    // transfer itself never changes a manual analysis exclusion.
    [kind, transactionId, counterpartKind, counterpartId, isTrue(transaction.excluded_from_analysis) ? 1 : 0, isTrue(counterpart.excluded_from_analysis) ? 1 : 0],
  );
  return Number(result.lastID);
}

export async function unlinkImportedTransfer(db: Database, linkId: number): Promise<void> {
  const link = await db.get<{ left_kind: ImportedTransactionKind; left_transaction_id: number; right_kind: ImportedTransactionKind; right_transaction_id: number; left_was_excluded: unknown; right_was_excluded: unknown }>(
    'SELECT left_kind, left_transaction_id, right_kind, right_transaction_id, left_was_excluded, right_was_excluded FROM statement_cross_transaction_links WHERE id = ?',
    linkId,
  );
  if (!link) throw new StatementTransferError('Nie znaleziono powiązania transferu.');
  await db.run('DELETE FROM statement_cross_transaction_links WHERE id = ?', linkId);
  // This also repairs links made before transfer semantics were separated:
  // their original manual exclusion is restored when the link is removed.
  await Promise.all([
    db.run(`UPDATE ${tableFor(link.left_kind)} SET excluded_from_analysis = ? WHERE id = ?`, isTrue(link.left_was_excluded) ? 1 : 0, link.left_transaction_id),
    db.run(`UPDATE ${tableFor(link.right_kind)} SET excluded_from_analysis = ? WHERE id = ?`, isTrue(link.right_was_excluded) ? 1 : 0, link.right_transaction_id),
  ]);
}

export async function removeTransferLinkForTransaction(db: Database, kind: ImportedTransactionKind, transactionId: number): Promise<void> {
  const link = await db.get<{ id: number }>(
    `SELECT id FROM statement_cross_transaction_links
      WHERE (left_kind = ? AND left_transaction_id = ?) OR (right_kind = ? AND right_transaction_id = ?)`,
    [kind, transactionId, kind, transactionId],
  );
  if (link) await unlinkImportedTransfer(db, link.id);
}

export async function setImportedTransactionAnalysis(
  db: Database,
  kind: ImportedTransactionKind,
  transactionId: number,
  excluded: boolean,
): Promise<void> {
  const table = tableFor(kind);
  const transaction = await db.get<{ id: number; import_fingerprint: string | null }>(
    `SELECT id, import_fingerprint FROM ${table} WHERE id = ?`,
    transactionId,
  );
  if (!transaction?.import_fingerprint) throw new StatementTransferError('Tę opcję można zmieniać tylko dla zaimportowanej operacji.');
  const linked = await db.get(
    `SELECT id FROM statement_cross_transaction_links
      WHERE (left_kind = ? AND left_transaction_id = ?) OR (right_kind = ? AND right_transaction_id = ?)`,
    [kind, transactionId, kind, transactionId],
  );
  if (linked) throw new StatementTransferError('Najpierw usuń powiązanie transferu.');
  await db.run(`UPDATE ${table} SET excluded_from_analysis = ? WHERE id = ?`, excluded ? 1 : 0, transactionId);
}
