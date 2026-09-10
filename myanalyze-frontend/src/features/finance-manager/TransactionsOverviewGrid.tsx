import React from "react";
import Button from "../../components/Button";
import ConfirmModal from "../../components/ConfirmModal";
import Modal from "../../components/Modal";
import ResourceLoadError from "../../components/ResourceLoadError";
import { useToast } from "../../context/ToastContext";
import { useAccountContext } from "../../context/useAccountContext";
import { useExpenseContext } from "../../context/useExpenseContext";
import { useIncomeContext } from "../../context/useIncomeContext";
import type { TransactionModel } from "../../context/useTransactionResource";
import { useCustomTransactionTypes } from "../../hooks/useCustomTransactionTypes";
import apiClient, { apiErrorMessage } from "../../utils/apiClient";
import { formatCurrency } from "../../utils/formatters";
import TransactionLinkDetailsModal from "./TransactionLinkDetailsModal";
import TransactionLinkPicker from "./TransactionLinkPicker";
import { buildSuggestedTransactionPairs, prepareSuggestedTransactionBatch, transactionDayDistance, type SuggestedTransactionBatch, type SuggestedTransactionPair, type TransactionSuggestionAccountRoles, type TransactionSuggestionRole } from "./transactionLinkCandidates";
import { removeTransactionLink, saveTransactionLink, transactionLinkDirectionIssue, type TransactionKind } from "./transactionLinks";
import { signedTransactionAmount } from "./transactionPresentation";
import { isTransactionInAmountRange, isTransactionInDateRange, lastNDaysRange } from "./transactionFilters";
import AllTransactionsGrid from "./transactions-overview/AllTransactionsGrid";
import LinkedTransactionsGrid from "./transactions-overview/LinkedTransactionsGrid";
import RejectedTransactionsGrid from "./transactions-overview/RejectedTransactionsGrid";
import ReviewTransactionsGrid from "./transactions-overview/ReviewTransactionsGrid";
import SuggestionAccountRolesModal from "./transactions-overview/SuggestionAccountRolesModal";
import TransactionsOverviewTabs from "./transactions-overview/TransactionsOverviewTabs";
import type { DirectionFilter, LinkedPairRow, LinkFilter, OverviewRow, TransactionsSubTab } from "./transactions-overview/types";

const DISMISSED_LINK_SUGGESTIONS_KEY = "myanalyze.dismissed-transaction-link-suggestions";
const LINK_SUGGESTION_ACCOUNT_ROLES_KEY = "myanalyze.transaction-link-suggestion-account-roles";
function suggestedPairKey(pair: SuggestedTransactionPair): string {
  return `${pair.expense.row.id}:${pair.income.row.id}`;
}

function savedDismissedSuggestionKeys(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(DISMISSED_LINK_SUGGESTIONS_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set();
  }
}

function savedSuggestionAccountRoles(): TransactionSuggestionAccountRoles {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LINK_SUGGESTION_ACCOUNT_ROLES_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const allowed = new Set<TransactionSuggestionRole>(["both", "income", "expense", "off"]);
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([, value]) => typeof value === "string" && allowed.has(value as TransactionSuggestionRole))
        .map(([key, value]) => [key, value as TransactionSuggestionRole]),
    );
  } catch {
    return {};
  }
}

export default function TransactionsOverviewGrid() {
  const incomeContext = useIncomeContext();
  const expenseContext = useExpenseContext();
  const { accounts, accountsLoaded, accountsError, fetchAccounts } = useAccountContext();
  const { activeRows: customTypes } = useCustomTransactionTypes();
  const { showToast } = useToast();
  const initialDateRange = React.useMemo(() => lastNDaysRange(30), []);
  const [subTab, setSubTab] = React.useState<TransactionsSubTab>("all");
  const [direction, setDirection] = React.useState<DirectionFilter>("all");
  const [linkFilter, setLinkFilter] = React.useState<LinkFilter>("all");
  const [dateFrom, setDateFrom] = React.useState(initialDateRange.from);
  const [dateTo, setDateTo] = React.useState(initialDateRange.to);
  const [amountFrom, setAmountFrom] = React.useState("");
  const [amountTo, setAmountTo] = React.useState("");
  const [linkRow, setLinkRow] = React.useState<OverviewRow | null>(null);
  const [detailsRow, setDetailsRow] = React.useState<OverviewRow | null>(null);
  const [unlinkRow, setUnlinkRow] = React.useState<OverviewRow | null>(null);
  const [batchUnlinkPairs, setBatchUnlinkPairs] = React.useState<LinkedPairRow[] | null>(null);
  const [batchUnlinking, setBatchUnlinking] = React.useState(false);
  const [reviewPair, setReviewPair] = React.useState<SuggestedTransactionPair | null>(null);
  const [batchPlan, setBatchPlan] = React.useState<SuggestedTransactionBatch | null>(null);
  const [batching, setBatching] = React.useState(false);
  const [dismissedSuggestionKeys, setDismissedSuggestionKeys] = React.useState<Set<string>>(savedDismissedSuggestionKeys);
  const [dropLink, setDropLink] = React.useState<{ source: OverviewRow; target: OverviewRow } | null>(null);
  const [dropNotice, setDropNotice] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [suggestionSettingsOpen, setSuggestionSettingsOpen] = React.useState(false);
  const [suggestionAccountRoles, setSuggestionAccountRoles] = React.useState<TransactionSuggestionAccountRoles>(savedSuggestionAccountRoles);

  const accountNames = React.useMemo(() => new Map(accounts.map((account) => [account.id, account.nazwa])), [accounts]);
  const accountTypes = React.useMemo(() => new Map(accounts.map((account) => [account.id, account.typ_depozytu])), [accounts]);
  const allRows = React.useMemo<OverviewRow[]>(() => [
    ...incomeContext.incomes.map((transaction) => ({ key: `income:${transaction.id}`, kind: "income" as const, transaction })),
    ...expenseContext.expenses.map((transaction) => ({ key: `expense:${transaction.id}`, kind: "expense" as const, transaction })),
  ], [expenseContext.expenses, incomeContext.incomes]);
  const transactionMap = React.useMemo(() => new Map(allRows.map((row) => [row.key, row.transaction])), [allRows]);
  const rows = React.useMemo(() => allRows
    .filter((row) => direction === "all" || row.kind === direction)
    .filter((row) => linkFilter === "all" || (linkFilter === "linked" ? row.transaction.transferLinkId != null : row.transaction.transferLinkId == null))
    .filter((row) => isTransactionInDateRange(row.transaction, dateFrom, dateTo))
    .filter((row) => isTransactionInAmountRange(row.transaction, amountFrom, amountTo)), [allRows, amountFrom, amountTo, dateFrom, dateTo, direction, linkFilter]);
  const counterpartFor = React.useCallback((row: OverviewRow): { kind: TransactionKind; transaction: TransactionModel } | null => {
    const kind = row.transaction.transferCounterpartKind;
    const id = row.transaction.transferCounterpartId;
    const transaction = kind && id != null ? transactionMap.get(`${kind}:${id}`) : null;
    return transaction && kind ? { kind, transaction } : null;
  }, [transactionMap]);
  const linkedPairs = React.useMemo<LinkedPairRow[]>(() => {
    const added = new Set<number>();
    const pairs: LinkedPairRow[] = [];
    allRows.forEach((row) => {
      const linkId = row.transaction.transferLinkId;
      const counterpart = linkId == null ? null : counterpartFor(row);
      if (linkId == null || !counterpart || added.has(linkId)) return;
      added.add(linkId);
      const current = { kind: row.kind, transaction: row.transaction };
      const other = counterpart;
      const expenseFirst = current.kind === "expense" && other.kind === "income";
      const orderByKey = `${current.kind}:${current.transaction.id}`.localeCompare(`${other.kind}:${other.transaction.id}`) <= 0;
      const left = expenseFirst || (current.kind === other.kind && orderByKey) ? current : other;
      const right = left === current ? other : current;
      pairs.push({ id: linkId, leftKind: left.kind, left: left.transaction, rightKind: right.kind, right: right.transaction, amountDifference: Math.abs(Number(left.transaction.amount) - Number(right.transaction.amount)), dateDifference: transactionDayDistance(left.transaction, right.transaction), sameAccount: left.transaction.accountId === right.transaction.accountId });
    });
    return pairs.sort((left, right) => right.id - left.id);
  }, [allRows, counterpartFor]);
  const suggestionIncomes = React.useMemo(
    () => incomeContext.incomes.filter((row) => isTransactionInDateRange(row, dateFrom, dateTo)),
    [dateFrom, dateTo, incomeContext.incomes],
  );
  const suggestionExpenses = React.useMemo(
    () => expenseContext.expenses.filter((row) => isTransactionInDateRange(row, dateFrom, dateTo)),
    [dateFrom, dateTo, expenseContext.expenses],
  );
  const suggestedPairs = React.useMemo(
    () => buildSuggestedTransactionPairs(suggestionIncomes, suggestionExpenses, suggestionAccountRoles),
    [suggestionAccountRoles, suggestionExpenses, suggestionIncomes],
  );
  const visibleSuggestedPairs = React.useMemo(
    () => suggestedPairs.filter((pair) => !dismissedSuggestionKeys.has(suggestedPairKey(pair))),
    [dismissedSuggestionKeys, suggestedPairs],
  );
  const dismissedSuggestedPairs = React.useMemo(
    () => suggestedPairs.filter((pair) => dismissedSuggestionKeys.has(suggestedPairKey(pair))),
    [dismissedSuggestionKeys, suggestedPairs],
  );
  const dateFilteredLinkedPairs = React.useMemo(
    () => linkedPairs.filter((pair) => (!dateFrom && !dateTo) || isTransactionInDateRange(pair.left, dateFrom, dateTo) || isTransactionInDateRange(pair.right, dateFrom, dateTo)),
    [dateFrom, dateTo, linkedPairs],
  );
  const dateFilteredSuggestedPairs = React.useMemo(
    () => visibleSuggestedPairs.filter((pair) => (!dateFrom && !dateTo) || isTransactionInDateRange(pair.expense.row, dateFrom, dateTo) || isTransactionInDateRange(pair.income.row, dateFrom, dateTo)),
    [dateFrom, dateTo, visibleSuggestedPairs],
  );
  const dateFilteredDismissedPairs = React.useMemo(
    () => dismissedSuggestedPairs.filter((pair) => (!dateFrom && !dateTo) || isTransactionInDateRange(pair.expense.row, dateFrom, dateTo) || isTransactionInDateRange(pair.income.row, dateFrom, dateTo)),
    [dateFrom, dateTo, dismissedSuggestedPairs],
  );
  const refreshAll = React.useCallback(async () => { await Promise.all([incomeContext.fetchIncomes(), expenseContext.fetchExpenses(), fetchAccounts()]); }, [expenseContext.fetchExpenses, fetchAccounts, incomeContext.fetchIncomes]);
  const refreshWithIndicator = React.useCallback(async () => {
    setRefreshing(true);
    try { await refreshAll(); }
    finally { setRefreshing(false); }
  }, [refreshAll]);

  const linkTransactions = async (source: OverviewRow, candidateKind: TransactionKind, candidate: TransactionModel) => {
    const changing = source.transaction.transferLinkId != null;
    try { const result = await saveTransactionLink(source.kind, source.transaction, candidateKind, candidate); await refreshAll(); setLinkRow(null); setDetailsRow(null); setDropLink(null); setReviewPair(null); showToast(result === "changed" || changing ? "Zmieniono powiązanie." : "Powiązano transakcje.", "success"); }
    catch (error) { showToast(apiErrorMessage(error, changing ? "Nie udało się zmienić powiązania." : "Nie udało się powiązać transakcji."), "error"); }
  };
  const linkSuggestedPair = async (pair: SuggestedTransactionPair) => linkTransactions({ key: `expense:${pair.expense.row.id}`, kind: "expense", transaction: pair.expense.row }, "income", pair.income.row);
  const dismissSuggestedPairs = (pairs: SuggestedTransactionPair[]) => {
    setDismissedSuggestionKeys((current) => {
      const next = new Set(current);
      pairs.forEach((pair) => next.add(suggestedPairKey(pair)));
      localStorage.setItem(DISMISSED_LINK_SUGGESTIONS_KEY, JSON.stringify([...next]));
      return next;
    });
    if (reviewPair && pairs.some((pair) => pair.id === reviewPair.id)) setReviewPair(null);
    showToast(pairs.length === 1 ? "Odrzucono sugestię powiązania." : `Odrzucono ${pairs.length} sugestii powiązania.`, "success");
  };
  const restoreDismissedPairs = (pairs: SuggestedTransactionPair[]) => {
    setDismissedSuggestionKeys((current) => {
      const next = new Set(current);
      pairs.forEach((pair) => next.delete(suggestedPairKey(pair)));
      if (next.size) localStorage.setItem(DISMISSED_LINK_SUGGESTIONS_KEY, JSON.stringify([...next]));
      else localStorage.removeItem(DISMISSED_LINK_SUGGESTIONS_KEY);
      return next;
    });
    showToast(pairs.length === 1 ? "Przywrócono sugestię powiązania." : `Przywrócono ${pairs.length} sugestii powiązania.`, "success");
  };
  const restoreDismissedSuggestions = () => {
    localStorage.removeItem(DISMISSED_LINK_SUGGESTIONS_KEY);
    setDismissedSuggestionKeys(new Set());
  };
  const selectCounterpart = async (candidateKind: TransactionKind, candidate: TransactionModel) => { if (linkRow) await linkTransactions(linkRow, candidateKind, candidate); };
  const requestDropLink = (source: OverviewRow, target: OverviewRow) => { if (source.key === target.key) return; if (source.transaction.transferLinkId != null && source.transaction.transferLinkId === target.transaction.transferLinkId) { setDropNotice("Te dwie operacje są już ze sobą powiązane."); return; } if (target.transaction.transferLinkId != null) { setDropNotice("Operacja docelowa jest już powiązana z inną transakcją. Najpierw świadomie usuń lub zmień jej obecne powiązanie."); return; } const directionIssue = transactionLinkDirectionIssue(source.kind, source.transaction, target.kind, target.transaction, accountTypes); if (directionIssue) { setDropNotice(directionIssue); return; } setDropLink({ source, target }); };
  const unlink = async () => { if (!unlinkRow) return; try { await removeTransactionLink(unlinkRow.transaction); await refreshAll(); setDetailsRow(null); setUnlinkRow(null); showToast("Usunięto powiązanie transferu.", "success"); } catch (error) { showToast(apiErrorMessage(error, "Nie udało się usunąć powiązania transferu."), "error"); } };
  const unlinkBatch = async () => {
    if (!batchUnlinkPairs?.length) return;
    setBatchUnlinking(true);
    let completed = 0;
    try {
      for (const pair of batchUnlinkPairs) { await removeTransactionLink(pair.left); completed += 1; }
      await refreshAll();
      showToast(`Usunięto ${completed} powiązań transferu.`, "success");
      setBatchUnlinkPairs(null);
    } catch (error) {
      await refreshAll();
      showToast(`Usunięto ${completed} z ${batchUnlinkPairs.length} powiązań. ${apiErrorMessage(error, "Kolejne powiązanie nie mogło zostać usunięte.")}`, "error");
      setBatchUnlinkPairs(null);
    } finally { setBatchUnlinking(false); }
  };
  const beginBatch = (selectedPairs: SuggestedTransactionPair[]) => {
    const plan = prepareSuggestedTransactionBatch(selectedPairs);
    if (!plan.pairs.length) { showToast("Zaznaczone sugestie używają tych samych transakcji. Wybierz dla nich jedną drugą stronę ręcznie.", "error"); return; }
    setBatchPlan(plan);
  };
  const confirmBatch = async () => {
    if (!batchPlan?.pairs.length) return;
    setBatching(true); let completed = 0;
    try { for (const pair of batchPlan.pairs) { await saveTransactionLink("expense", pair.expense.row, "income", pair.income.row); completed += 1; } await refreshAll(); showToast(`Powiązano ${completed} par jako transfery własne.${batchPlan.conflictCount ? ` Pominięto ${batchPlan.conflictCount} kolidujących sugestii.` : ""}`, "success"); setBatchPlan(null); }
    catch (error) { await refreshAll(); showToast(`Powiązano ${completed} z ${batchPlan.pairs.length} par. ${apiErrorMessage(error, "Kolejna para nie mogła zostać powiązana.")}`, "error"); setBatchPlan(null); }
    finally { setBatching(false); }
  };
  const saveInline = async (row: OverviewRow) => {
    const original = allRows.find((item) => item.key === row.key);
    if (!original) return;
    const labelChanged = original.transaction.customTypeId !== row.transaction.customTypeId;
    const accountChanged = original.transaction.accountId !== row.transaction.accountId;
    try { if (accountChanged && (!row.transaction.importSource || row.transaction.accountId == null)) throw new Error("Konto można zmienić tylko dla importowanej transakcji."); if (labelChanged) await apiClient.patch(`/${row.kind === "income" ? "przychody" : "wydatki"}/bulk-classification`, { ids: [row.transaction.id], custom_type_id: row.transaction.customTypeId }); if (accountChanged) await apiClient.patch(`/${row.kind === "income" ? "przychody" : "wydatki"}/bulk-account`, { ids: [row.transaction.id], account_id: row.transaction.accountId }); await refreshAll(); showToast("Zapisano zmianę transakcji.", "success"); }
    catch (error) { showToast(apiErrorMessage(error, "Nie udało się zapisać zmiany transakcji."), "error"); throw error; }
  };
  const bulkLabelChange = async (selectedRows: OverviewRow[], customTypeId: number | null) => {
    let updated = 0;
    let failure: unknown;
    try {
      for (const kind of ["income", "expense"] as const) {
        const ids = selectedRows.filter((row) => row.kind === kind).map((row) => row.transaction.id);
        if (!ids.length) continue;
        await apiClient.patch(`/${kind === "income" ? "przychody" : "wydatki"}/bulk-classification`, { ids, custom_type_id: customTypeId });
        updated += ids.length;
      }
    } catch (error) { failure = error; }
    try { await refreshAll(); }
    catch (error) { failure = failure ?? error; }
    if (failure) showToast(`Zmieniono etykietę ${updated} z ${selectedRows.length} operacji. ${apiErrorMessage(failure, "Nie udało się zakończyć aktualizacji.")}`, "error");
    else showToast(`Zmieniono etykietę ${updated} operacji.`, "success");
  };
  const toggleAnalysis = async (row: OverviewRow) => {
    if (!row.transaction.importSource || row.transaction.transferLinkId != null) return;
    try {
      await apiClient.patch(`/konta/import-transactions/${row.kind}/${row.transaction.id}/analysis`, { excluded: !row.transaction.excludedFromAnalysis });
      await refreshAll();
      showToast(row.transaction.excludedFromAnalysis ? "Operacja ponownie liczy się w analizach." : "Operacja została wyłączona z analiz.", "success");
    } catch (error) { showToast(apiErrorMessage(error, "Nie udało się zmienić udziału operacji w analizach."), "error"); }
  };

  if (!incomeContext.incomesLoaded || !expenseContext.expensesLoaded || !accountsLoaded) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Ładowanie transakcji…</div>;
  const loadError = incomeContext.incomesError ?? expenseContext.expensesError ?? accountsError;
  if (loadError) return <ResourceLoadError blocking message={loadError} onRetry={() => void refreshAll()} />;

  const detailsCounterpart = detailsRow ? counterpartFor(detailsRow) : null;
  const setSuggestionAccountRole = (accountId: number, role: TransactionSuggestionRole) => {
    setSuggestionAccountRoles((current) => {
      const next = { ...current };
      if (role === "both") delete next[String(accountId)];
      else next[String(accountId)] = role;
      localStorage.setItem(LINK_SUGGESTION_ACCOUNT_ROLES_KEY, JSON.stringify(next));
      return next;
    });
  };
  const resetSuggestionAccountRoles = () => { localStorage.removeItem(LINK_SUGGESTION_ACCOUNT_ROLES_KEY); setSuggestionAccountRoles({}); };
  const configuredSuggestionRoles = Object.keys(suggestionAccountRoles).length;
  const resetDateRange = () => { setDateFrom(""); setDateTo(""); };
  const resetAllFilters = () => { setDirection("all"); setLinkFilter("all"); resetDateRange(); setAmountFrom(""); setAmountTo(""); };

  return <div className="min-w-0 space-y-3">
    <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900"><strong>Transakcje i transfery własne.</strong> Sugestie wymagają Twojego potwierdzenia; ręczne powiązanie i jego cofnięcie pozostają dostępne zawsze.</div>
    <TransactionsOverviewTabs active={subTab} reviewCount={visibleSuggestedPairs.length} rejectedCount={dismissedSuggestedPairs.length} linkedCount={linkedPairs.length} onChange={setSubTab} />
    {subTab === "all" && <AllTransactionsGrid rows={rows} accounts={accounts} customTypes={customTypes} accountNames={accountNames} linkedPairCount={linkedPairs.length} direction={direction} linkFilter={linkFilter} dateFrom={dateFrom} dateTo={dateTo} amountFrom={amountFrom} amountTo={amountTo} initialDateRange={initialDateRange} refreshing={refreshing} onRefresh={refreshWithIndicator} onDirectionChange={setDirection} onLinkFilterChange={setLinkFilter} onDateFromChange={setDateFrom} onDateToChange={setDateTo} onAmountFromChange={setAmountFrom} onAmountToChange={setAmountTo} onResetFilters={resetAllFilters} counterpartFor={counterpartFor} onShowDetails={setDetailsRow} onLink={setLinkRow} onUnlink={setUnlinkRow} onToggleAnalysis={toggleAnalysis} onInlineSave={saveInline} onBulkLabelChange={bulkLabelChange} onDropLink={requestDropLink} />}
    {subTab === "review" && <ReviewTransactionsGrid rows={dateFilteredSuggestedPairs} accountNames={accountNames} dateFrom={dateFrom} dateTo={dateTo} dismissedCount={dismissedSuggestedPairs.length} configuredSuggestionRoles={configuredSuggestionRoles} refreshing={refreshing} onRefresh={refreshWithIndicator} onDateFromChange={setDateFrom} onDateToChange={setDateTo} onClearDates={resetDateRange} onOpenSettings={() => setSuggestionSettingsOpen(true)} onRestoreAllDismissed={restoreDismissedSuggestions} onBeginBatch={beginBatch} onDismiss={dismissSuggestedPairs} onReview={setReviewPair} onLink={linkSuggestedPair} />}
    {subTab === "rejected" && <RejectedTransactionsGrid rows={dateFilteredDismissedPairs} accountNames={accountNames} dateFrom={dateFrom} dateTo={dateTo} refreshing={refreshing} onRefresh={refreshWithIndicator} onDateFromChange={setDateFrom} onDateToChange={setDateTo} onClearDates={resetDateRange} onRestore={restoreDismissedPairs} onReview={setReviewPair} />}
    {subTab === "linked" && <LinkedTransactionsGrid rows={dateFilteredLinkedPairs} accountNames={accountNames} dateFrom={dateFrom} dateTo={dateTo} refreshing={refreshing} onRefresh={refreshWithIndicator} onDateFromChange={setDateFrom} onDateToChange={setDateTo} onClearDates={resetDateRange} onBatchUnlink={setBatchUnlinkPairs} onShowDetails={setDetailsRow} onLink={setLinkRow} onUnlink={setUnlinkRow} />}

    <SuggestionAccountRolesModal open={suggestionSettingsOpen} accounts={accounts} roles={suggestionAccountRoles} onChange={setSuggestionAccountRole} onReset={resetSuggestionAccountRoles} onClose={() => setSuggestionSettingsOpen(false)} />
    <TransactionLinkPicker open={Boolean(linkRow)} sourceKind={linkRow?.kind ?? "income"} sourceRow={linkRow?.transaction ?? null} incomes={incomeContext.incomes} expenses={expenseContext.expenses} accountNames={accountNames} accountTypes={accountTypes} onClose={() => setLinkRow(null)} onSelect={selectCounterpart} />
    <TransactionLinkDetailsModal open={Boolean(detailsRow)} sourceKind={detailsRow?.kind ?? "income"} source={detailsRow?.transaction ?? null} counterpartKind={detailsCounterpart?.kind ?? detailsRow?.transaction.transferCounterpartKind ?? null} counterpart={detailsCounterpart?.transaction ?? null} accountNames={accountNames} onClose={() => setDetailsRow(null)} onChange={() => { if (detailsRow) setLinkRow(detailsRow); setDetailsRow(null); }} onUnlink={() => { if (detailsRow) setUnlinkRow(detailsRow); setDetailsRow(null); }} />
    <TransactionLinkDetailsModal open={Boolean(reviewPair)} sourceKind="expense" source={reviewPair?.expense.row ?? null} counterpartKind="income" counterpart={reviewPair?.income.row ?? null} accountNames={accountNames} preview onClose={() => setReviewPair(null)} onChange={() => undefined} onUnlink={() => undefined} onConfirm={() => { if (reviewPair) void linkSuggestedPair(reviewPair); }} />
    <Modal open={Boolean(dropLink)} onClose={() => setDropLink(null)} title={dropLink?.source.transaction.transferLinkId == null ? "Powiąż transakcje" : "Zmień powiązanie transakcji"} size="sm" footer={<div className="flex justify-end gap-2"><Button tone="neutral" onClick={() => setDropLink(null)}>Anuluj</Button><Button tone="primary" onClick={() => { if (dropLink) void linkTransactions(dropLink.source, dropLink.target.kind, dropLink.target.transaction); }}>{dropLink?.source.transaction.transferLinkId == null ? "Powiąż" : "Zmień powiązanie"}</Button></div>}>{dropLink && <p className="text-sm leading-6 text-slate-700">{dropLink.source.transaction.transferLinkId == null ? "Powiązać" : "Zmienić powiązanie dla"} <strong>{dropLink.source.transaction.name}</strong> ({formatCurrency(signedTransactionAmount(dropLink.source.kind, dropLink.source.transaction.amount))}) z <strong>{dropLink.target.transaction.name}</strong> ({formatCurrency(signedTransactionAmount(dropLink.target.kind, dropLink.target.transaction.amount))})?</p>}</Modal>
    <Modal open={Boolean(dropNotice)} onClose={() => setDropNotice(null)} title="Powiązanie wymaga decyzji" size="sm" footer={<div className="flex justify-end"><Button tone="primary" onClick={() => setDropNotice(null)}>Rozumiem</Button></div>}><p className="text-sm leading-6 text-slate-700">{dropNotice}</p></Modal>
    <ConfirmModal open={Boolean(unlinkRow)} title="Usuń powiązanie transferu" message="Usunąć cross-link między tymi operacjami? Transakcje pozostaną w historii i wrócą do normalnego sposobu liczenia w analizach." onConfirm={() => void unlink()} onCancel={() => setUnlinkRow(null)} />
    <ConfirmModal open={Boolean(batchUnlinkPairs)} title="Usuń powiązania transferu" message={`Usunąć ${batchUnlinkPairs?.length ?? 0} powiązań? Transakcje pozostaną w historii i wrócą do normalnego sposobu liczenia w analizach.`} confirmLabel="Usuń powiązania" cancelLabel="Anuluj" busy={batchUnlinking} onConfirm={() => void unlinkBatch()} onCancel={() => { if (!batchUnlinking) setBatchUnlinkPairs(null); }} />
    <ConfirmModal open={Boolean(batchPlan)} title="Powiąż zaznaczone transfery" message={`Powiązać ${batchPlan?.pairs.length ?? 0} par jako transfery własne? Żadna z tych operacji nie będzie liczona jako przychód ani wydatek w analizach.${batchPlan?.conflictCount ? ` Pominięto ${batchPlan.conflictCount} zaznaczonych sugestii, bo używają tej samej transakcji co inna wybrana para - wybierz je ręcznie.` : ""}${batchPlan?.pairs.some((pair) => pair.confidence !== "strong") ? " Co najmniej jedna para jest tylko sugestią - potwierdzasz ją świadomie." : ""}`} confirmLabel="Powiąż zaznaczone" cancelLabel="Anuluj" busy={batching} onConfirm={() => void confirmBatch()} onCancel={() => { if (!batching) setBatchPlan(null); }} />
  </div>;
}
