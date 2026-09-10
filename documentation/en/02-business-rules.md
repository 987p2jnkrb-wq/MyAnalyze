# Business rules

## 1. Deposits

A deposit may represent:

- a regular bank account;
- cash;
- a virtual wallet;
- a credit card.

For a regular account, cash, and a virtual wallet, the user edits the **available balance**. The actual balance is disabled and is expected to match the available balance; it is not a second independent field maintained manually. Editing is performed directly in a cell of the shared grid, and clicking outside the edited row saves the change only when the value actually changed.

A virtual wallet follows the same balance, transfer, import, and quick balance-change rules as a regular account. It cannot, however, be selected as a card repayment account or as the source for repaying a loan installment, mortgage, debt, or installment plan. Deposit types use muted, fixed visual markers: neutral for an account, green for cash, blue for a virtual wallet, and amber for a credit card.

The `+/−` action opens a single balance-change form with a **Credit / Debit** switch. The operation changes the balance and atomically records a completed income or expense entry as appropriate. Amounts may be entered with either a period or comma as the decimal separator.

### Credit card

A credit card links the **Deposits** tab with its corresponding entry in **Liabilities**. The rules are:

- `card limit` is set manually and does not change during transfers or expense completion;
- `available limit` in Liabilities is the same value as the card's `available balance` in Deposits;
- the card's `actual balance` is calculated as `available balance - card limit`;
- for example, with a PLN 3,000 limit and PLN 115.21 of available limit, the actual balance is PLN -2,884.79;
- an expense charged to a card cannot exceed its available limit;
- a badge showing the card limit is displayed next to the card name in the deposits grid;
- a card may optionally point to a regular account or cash as its `repayment account`; a virtual wallet is excluded. The relationship is informational, supports import analysis, and does not execute a transfer or change balances;
- a card cannot point to itself or to another card, and deleting the referenced account clears only the relationship;
- a card is created in one place — the **Liabilities** form; the form contains only the name, available limit, and card limit, while used limit is calculated;
- after saving, the card automatically appears as a read-only item in **Loans** and as available funds in **Deposits**;
- in Deposits, the name, available limit, and optional repayment account may be edited, but a regular account cannot be created as or converted into a card there;
- Liabilities remains the product data source, preventing two independent records of the same card.

### Transfers between deposits

A transfer is a manual movement of funds between two deposits:

- source and destination deposits must be different;
- the amount must be positive and cannot exceed the source's available balance;
- the source's available and actual balances are reduced by the transfer amount;
- the destination's available and actual balances are increased by the same amount;
- the credit-card limit does not change;
- a transfer does not automatically create a separate income and expense entry;
- the log records an outgoing operation for the source and an incoming operation for the destination.

For a credit card, changing the available limit changes the actual balance by the same amount, so the formula `actual balance = available balance - limit` remains valid.

### Deposit history

A deposit's history can be opened from its row. The modal uses the shared grid, allows limiting the date range, and can export the visible history to CSV. It shows balance and deposit-type changes, transfers, completions, and imports associated with that deposit.

## 2. Income and expenses

The Income and Expenses tabs open with the `Planned` filter active. Completed entries remain available after changing or clearing the filter, but by default they do not obscure the current plan.

A new entry is **planned** by default. Completing it requires selecting a deposit:

- completing income increases the deposit balance;
- completing an expense decreases the deposit balance;
- a completed entry may be deleted, but it cannot be edited;
- deleting a completed entry does not undo its completion and does not automatically correct the balance — this is an intentional product simplification;
- quick add creates a normal planned entry and does not itself change a balance.

Income and Expenses form a simplified, experimental transaction module intended for manual management and imported history. It is not a full accounting ledger: deleting a record removes it from analysis, while any correction to the current balance is made manually by the user in Deposits.

An imported transaction displays an `IMPORT` marker in the UI together with the account from which the history was loaded. This information is not assigned to ordinary manually entered records.

An imported own transfer may be stored as completed technical income or expense, but it is marked `Excluded from analysis` only after its link to the second operation is confirmed. It remains visible and filterable in history, but does not increase the plan, monthly actuals, or income/expense totals. A normal import of an external payment contributes to monthly actuals, but the import itself does not create a plan.

An `OWN_TRANSFER` cross-link is a relationship between two existing operations belonging to different user-owned deposits. It neither deletes nor creates operations and does not change deposit balances. The system may suggest a pair based on amount, date (default ±3 days), direction, and instrument type, but the user may manually select, change, or reject it. For regular accounts, the most common arrangement is expense ↔ income; for a credit card, expense ↔ expense is also allowed when the operation indicates card repayment.

Transaction type (e.g. card payment, outgoing transfer, top-up, loan repayment) is used for description, filtering, and analysis. The sign/direction of the amount determines whether the entry is placed under income or expenses.

### Quick add

Quick add creates planned income or expense without opening the full form. It remembers the last entry type, category, date, and up to three most recently used categories separately for income and expenses.

The remembered date is only the initial form value and may be changed before saving. **Repeat last expense** copies the name, amount, and category of the last expense but suggests the current date.

## 3. Recurring income

A recurring-income rule describes a name, amount, category, validity range, and day of the month. The application maintains one nearest planned one-off entry generated from the rule.

- The occurrence day is clamped to the last day of shorter months.
- After the current date passes, the next monthly occurrence is prepared.
- Deleting a generated entry means skipping that specific occurrence; it is not recreated in a loop.
- Manually changing a generated entry detaches that instance from automatic updates.
- The Month view does not count the generated entry a second time alongside the recurring rule.

## 4. Recurring expenses

A recurring expense works as a recurring-cost rule. It may have an end date or be indefinite.

The **Loan** category has integration significance: such an entry may be linked to an item in Liabilities and to a loan. The recurring-expense amount then represents the monthly installment, while dates and day of the month describe the period and payment due date.

Completing recurring income or expense is atomic: balance update, creation of the completed transaction, and log persistence either all succeed together or are rolled back. Re-sending the same completion is rejected to prevent posting the same entry twice.

## 5. Liabilities and Loans

These are two different views of the same area, not one merged form:

- **Liabilities** — simplified planning view: product, type, principal/debt, installment amount, installment count, available limit, and limit;
- **Loans** — detailed record: dates, principal, current debt, installment amount, installment count, repayment day, APR, interest rate, commission, and insurance.

A record created in either view should also appear in the other. If it was created in the simpler view, detailed fields may remain empty until filled in later.

### Types and calculations

- **Debt** and **Other** — debt remains a manually maintained value, including during inline editing.
- **Loan** — the form suggests debt as `remaining installment count × installment amount`. A manual correction is preserved until the installment amount or installment count changes; such a change intentionally recalculates the suggestion.
- **Mortgage** — debt/principal may be entered manually and should not be overwritten with a simple installment product.
- **Credit card** — uses limit and available limit; limit fields do not apply to other types.
- **Installment plan** — a simple 0% product linked to one credit card. Remaining amount is suggested as `installment × remaining installment count`, both in form editing and inline, and may then be manually corrected. The plan also stores an informational one-time fee.
- When adding a loan, the start date and total installment count determine how many installments have already elapsed. The form suggests the remaining count, next installment, and end date, but allows correcting the remaining number of installments.
- The end date is calculated from the next unpaid installment, remaining installment count, and repayment day; the backend recalculates it again when saving.
- The creation date is set automatically.
- Creating a loan or liability with an installment should create/link a recurring expense in the **Loan** category.

### Card installment plan

- A plan is added and edited in **Liabilities**; in **Loans** it is read-only.
- The plan amount is already included in the card's bank-reported balance. Adding a plan does not change the balance or available limit and must not double-count total debt.
- For a card, the interface shows the bank balance and the amount of debt outside installment plans: `actual balance + remaining plan amounts`.
- **Pay installment** requires selecting a regular account or cash; a virtual wallet cannot fund a credit product. The operation atomically debits the selected account, reduces the plan's remaining amount and installment count, and increases the card's available limit and actual balance by the same amount. The final installment may be lower than the standard installment.
- The selected account is remembered as the card's repayment account and is suggested by default for the next installment.
- Each repayment creates a history entry for both the debited account and the linked card. After the plan is fully repaid, the linked recurring expense is deleted.
- The one-time fee is informational and is not added to the balance again because it is already included in the debt reported by the bank.
- A card may optionally store a start date and interest rate; these fields are not required for daily operation.

The source field in Liabilities indicates a record created by **Loans**, **Deposits**, or **Recurring expenses**. For a liability created directly in the Liabilities tab, the source remains empty — an artificial “Agreement” value should not be displayed.

Loans support both inline editing of individual fields and full editing in a modal. This is an intentional exception to the other grids because of the number of related fields.

Credit products use one edit form regardless of where it is opened. A card opened from Deposits, Liabilities, or Loans shows the same card fields; similarly, a loan and installment plan each use one set of fields appropriate to their type.

### Repayment schedule — work in progress

The schedule stores the due date, principal portion, interest, and status of each installment. The user may manually mark an installment as paid; the operation sets the status and payment date but **does not withdraw funds from a deposit, reduce debt, or change the installment count**. This behavior is intentional at the current stage of the simplified transaction module.

The backend includes a mechanism for reading a schedule from PDF and retrieving the stored document, but the complete PDF import flow is not yet exposed and refined in the interface. The schedule should be treated as **work in progress**, not as a complete loan-settlement module.

### Intentional deletion asymmetry

Linked records are not always deleted symmetrically:

- deleting a Liability deletes the corresponding Loan and linked recurring expense;
- deleting a Loan deletes the linked Liability and the technically created recurring expense;
- deleting a recurring expense in the **Loan** category detaches the installment but leaves the Loan and Liability in place so debt information is not lost;
- deleting a deposit that is a credit card removes a purely technical Liability or detaches the account from a record that also has another data source;
- deleting a deposit does not delete historical income and expenses imported from its statement.

This asymmetry is intentional: deleting the primary product may clean up items created together with it, while deleting an auxiliary installment or deposit should not automatically remove information about an existing debt or analytical history.

## 6. Month

The **Month** view is read-only and shows plan and actuals for the selected month.

- The plan includes manually added entries for the month and occurrences of active recurring rules; history imported from CSV does not create a plan.
- A completed entry still belongs to the plan and is additionally counted in actuals.
- An entry generated from recurring income does not increase the plan a second time.
- Actuals include entries marked as completed, including history imported from CSV, except items explicitly marked `Excluded from analysis`.
- Results are grouped by category and show the difference between plan and actuals.

## 7. Summary

Summary is read-only and has two contexts:

### General

- own funds — actual balance of deposits excluding credit cards;
- recurring income and recurring expenses — sums from recurring rules;
- additional income and expenses — incomplete one-off entries;
- funds available including cards — sum of available balances across all deposits;
- daily budget — available funds divided by the number of days until the next salary payment.

### Period

The start of the salary period is configured in **Planning Settings** (default: the 10th day of the month), and the end falls on the day before the next start. The current-period view includes planned operations and occurrences of recurring entries, and calculates the estimated balance for the selected day.

The view separates actual funds from available funds. For the selected day it shows **Actual funds / balance** and the equivalent **Available funds / balance**, where available values include available credit-card limits. The current day does not add operations again when they are already included in the current balance; future days include operations due up to the selected date.

Arrows allow navigation to earlier periods. Their plan is reconstructed from dated one-off entries and validity ranges of recurring rules, while actuals come only from completed transactions. Historical liquidity, debt, and Goals state are shown only when the user saved a snapshot for that period; the application does not reconstruct them from today's balances.

## 8. Activity log

The log is an audit view without inline editing. It shows operation type, module, state before and after the change, and a readable comment. A single entry can be deleted from its row, and multiple entries after selection. Both operations require confirmation; the screen does not provide an action that automatically deletes all visible logs.

Technical module, field, and value names are translated into the user's language. This includes account types (`konto`, `gotowka`, `karta_kredytowa`, `wirtualny_portfel`), the repayment account, and linked card. Values `0/1` are interpreted as “no/yes” only for boolean fields; numeric identifiers remain identifiers.

## 9. Combined CSV export

The **Download CSV** button at the end of the Finance Manager tab bar creates one file with a `Section` column. The export includes current account states, recurring expenses, recurring income, incomplete planned income and expenses, and liabilities. For a card, debt does not duplicate an installment plan that is already listed separately.

## 10. Goals

Goals are an analytical layer and do not execute transfers or postings. `Real liquidity` includes actual balances of accounts, cash, and virtual wallets, but excludes credit cards entirely. `Safe surplus` uses the existing period forecast and the lowest projected balance above the configured financial floor, planned expenses, and the `Current budget / day` reserve. The reserve covers only the remaining days of the current salary period and does not create transactions. Goal progress may optionally use the actual balance of a linked deposit.

Recurring income is treated as certain. One-off planned income may be certain, expected, or potential. Certain income increases the conservative scenario, expected income increases the expected scenario, and potential income only the extended scenario. Liability installments affect the forecast only through linked recurring expenses and are not counted again from the debt record.

Linking a goal to a regular deposit does not execute transfers or change the account balance. By default, goal progress comes from the manually entered allocated amount. After enabling **Use deposit balance as goal progress**, progress is calculated live from the full actual balance of the linked deposit; the manual amount remains stored but is not used in calculations while the option is enabled. The new-funds calculator and recommendations are calculated temporarily and are not persisted.
