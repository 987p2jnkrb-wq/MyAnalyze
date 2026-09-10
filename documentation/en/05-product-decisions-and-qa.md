# Product decisions and QA guidance

This document distinguishes defects from deliberately chosen behavior. Changing the rules below requires a new product decision, not merely a technical fix.

## Intentional behaviors

| Area | Decision |
| --- | --- |
| Bank import | It is a manual CSV/PDF import, not a connection to a bank. |
| Balance after import | Imported operations do not change the deposit balance because the bank balance already includes them. |
| Import status | Imported items are completed. |
| Recurring-entry matching | The suggestion uses direction, amount, and active month; matching the name is not required. |
| Own transfers in CSV | All top-ups and recognized own transfers remain visible, but are deselected by default. |
| Completed transaction | It may be deleted, but not edited. |
| Deleting a completed transaction | It does not undo completion or automatically reverse a balance change; any correction is manual. |
| Bulk deletion | It follows the same rules and relationships as individual deletion. It requires one confirmation, and changing tabs clears the selection beforehand. |
| Transaction module | It is simplified and experimental — it supports manual planning and history import, not full accounting. |
| Recurring income | The application prepares the next entry; a deleted occurrence is not recreated in the same month. |
| General summary | It sums all configured recurring entries regardless of their date ranges. |
| Period summary | It respects validity dates and the configurable period start day; historically it separates reconstructed plan from actuals. |
| Summaries above grids | `Available`, `Actual`, `Debt`, and `Installments` badges summarize active items. This also applies when a grid is filtered to `All`; inactive records are historical/zeroed and should not artificially affect current totals. |
| Salary day | The cycle start is configured in Planning Settings (default: day 10, range 1–31); the period end is calculated automatically. |
| Logs | Deleting an individual log or selected logs requires confirmation. There is no action that automatically clears all visible entries. |
| Currency | Currency presentation is controlled by one value in Configuration. The display setting changes formatting/symbols and does not perform currency conversion or alter stored amounts. |
| Credit card | The limit changes only manually; a transfer or expense changes the available limit/available balance, not the card limit. |
| Credit-product editing | The same popup and the same fields are used in Deposits, Liabilities, and Loans. |
| Liabilities and Loans | They remain separate modules/tabs. Their functional similarity is not currently a reason to merge the views. |
| Action density in grids | The application is small, so some actions remain directly available as icons or buttons in the grid. We do not add another menu layer without a concrete usability problem. |
| Operation confirmations | Confirmation messages may remain short and omit the record name. The user performs the action directly in the context of the selected row, so expanding every confirmation is not currently necessary. |
| Recurring income | Only newly generated current income receives the `Top-up` transaction type; existing data is not mass-synchronized. |
| Normal deposit balance | The user edits the available balance, and the disabled actual balance is expected to match it. |
| Virtual wallet | It behaves like a normal account but cannot be a repayment account or a source for repayment of a credit product. |
| Quick balance change | One `+/−` action selects either credit or debit and stores a completed transaction together with the balance change. |
| Transfer between deposits | It changes the balances of both deposits and creates logs, but does not create a separate income and expense entry. |
| Quick-entry date | The form suggests the most recently used date, which can be changed; repeating an expense suggests today's date. |
| Marking an installment | It changes only status and payment date; it does not withdraw funds or recalculate debt. |
| Loan schedule | It is work in progress; the backend supports PDF and installments, but the full import flow is not yet available in the UI. |
| Deleting relationships | The asymmetry is intentional: deleting a product may clean up dependent records, but deleting an installment or deposit preserves debt data and history. |
| Loan editing | Loans support both inline editing and a modal; other simple tables do not need two edit mechanisms. |
| Installment recalculation | Changing the installment amount or remaining installment count recalculates the suggested debt; a later manual correction of the amount itself is allowed. |
| Closing a form | Clicking the backdrop does not close a modal; this protects entered data from accidental loss. |
| Analytical views | Month, Summary, and Logs are read-only. |
| Investments | The module was deliberately removed from the active application. |

## What counts as a P0/P1 defect

The following in particular should be treated as critical or high-severity defects:

- failure to start the application or API;
- data loss, partial persistence of a transactional operation, or duplicate creation;
- a success message when the backend did not persist the change;
- inconsistent linked data after refresh, e.g. a different available limit for the same card in Deposits and Liabilities;
- the ability to spend more from a card than its available limit;
- incorrect calculation of `actual balance = available balance - limit`;
- missing record on the other side of Loans–Liabilities synchronization;
- failure to synchronize installment amount, installment count, dates, or repayment day between linked records;
- the ability to link a virtual wallet to a credit product;
- editing completed income or expense;
- importing duplicates when the same statement is loaded again;
- changing a deposit balance through CSV/PDF history import;
- existing records disappearing because of a hidden filter or incorrect pagination.

## What requires care during an audit

1. **Do not evaluate a module in isolation from its relationships.** A loan may have records in `loans`, `debt_plans`, and `wydatki_stale`, and a card may also exist in `konta`.
2. **Refresh data after saving.** Synchronization happens on the backend, so checking only local form state is insufficient.
3. **Test creation from both sides.** Add records separately from Loans, Liabilities, Recurring expenses with the Loan category, and Deposits with the credit-card type.
4. **Do not treat empty fields as data loss when a record was created in the simpler view.** Liabilities contain less information than Loans.
5. **For import, verify the resulting sets, not only the row count.** Compare description, amount, and date, and account for transfers intentionally deselected by the user.
6. **Do not change summary rules as part of an unrelated UI fix.** General and period summaries intentionally calculate data differently.

## Known limitations that are not current priorities

- full EUR, USD, and GBP support;
- automatic bank synchronization;
- an advanced correction ledger after deletion of a completed operation;
- automatic recognition of the owner of a `Topup`;
- completing the repayment-schedule UI and PDF import formats;
- restoring Investments;
- configurable salary day and different cycles for multiple income sources.

## Release checklist

- Backend and frontend TypeScript compile without errors.
- All UI/model tests and API smoke tests pass.
- Importing the same CSV a second time reports duplicates and adds nothing.
- Import does not change the balance of the selected deposit.
- Card balance and limit are consistent after changes in Deposits and Liabilities.
- A loan created from either view appears in the other view after refresh.
- A recurring expense with the Loan category remains linked to the installment.
- An installment plan recalculates the remaining amount after changing the installment amount or installment count, both in the form and inline.
- A virtual wallet works with transfers and balance changes but does not appear in the repayment-account list.
- Completed income and expenses cannot be edited.
- Month, Summary, and Logs views do not offer inline editing.
- The installer starts its own API without depending on a port left over from the development environment.
