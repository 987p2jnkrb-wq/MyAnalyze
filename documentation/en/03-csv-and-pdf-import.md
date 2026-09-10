# Importing bank history from CSV and PDF

## Role of import

CSV/PDF import is not a bank integration. The user downloads a statement, selects the file, and approves selected rows in the preview.

Import is used to:

- append completed income and expenses to history;
- compare actual operations with the monthly plan;
- categorize and filter history;
- reduce manual re-entry of many items.

## Flow

### Custom CSV layout

After selecting a file, the “Map CSV columns” panel lets the user choose the separator (automatic, semicolon, comma, tab, or `|`), the header row, and the meaning of columns. Rows are counted after empty records are skipped. An example based on the first operation helps verify the mapping. A date and either a signed amount or separate income/expense columns are required; description remains optional.

The mapping uses the existing parser and the same duplicate, plan, and transfer checks. Settings apply only to the current file and are not saved as a bank profile. “Apply and check preview” replaces earlier preview changes but does not save transactions. Final persistence happens only after “Import”.

Import expects amounts in PLN regardless of the application's global display currency. The PLN/EUR/USD switch does not convert the file or stored data. Dates still require YYYY-MM-DD or DD.MM.YYYY format (European dates may also use `/` or `-` separators). Mapping does not infer the US month/day order or exchange rates. A fee should be mapped only if it is not already included in the transaction amount. XLSX must first be saved as CSV.

### Text-layer PDF

A PDF is first read into rows and cells while preserving their positions on the page. The parser detects the date, description, and amount column, then passes candidates into the same classification, duplicate, transfer, and plan-matching pipeline as CSV. Layouts recognized by an adapter may provide more accurate descriptions; other text tables go through a conservative generic parser and require verification in the preview.

The parser does not use OCR. A scan without a selectable text layer cannot be read. Password-protected documents and statements where date and amount cannot be identified unambiguously are also unsupported. The PDF limit in the interface is 10 MB.

Statement content is used only to prepare a local preview and is not stored in the activity log. After approval, history stores individual transaction entries plus a short `Import PDF` summary with the file name. The name is limited to 120 characters.

### Persisting transactions

1. Import is started from the action of a specific deposit.
2. The CSV adapter or PDF parser reads the local file and normalizes the date, amount, currency, status, type, description/counterparty, and source instrument.
3. Pending operations remain available for saving with pending status. Canceled/rejected operations are skipped by default. Zero-value, invalid, or different-currency rows are sent for correction.
4. A negative amount creates an expense; a positive amount creates income.
5. Before showing the preview, the application checks hard duplicates on the selected account and looks for possible overlap with imports from other user-owned accounts.
6. The user sees the preview and chooses an import method for each row: new completed operation, settlement of a planned or recurring entry, linking to an already posted operation, own transfer, or skip. One unambiguous plan match is selected by default, but it can always be changed.
7. Approved entries are stored atomically — the whole import succeeds or is rolled back.
8. Re-importing the same existing operation into the same deposit is recognized as a duplicate during persistence as well. When an income or expense record is deleted, its fingerprint disappears with it, so the item can be imported again; the historical import log does not block import.
9. The result appears in Income/Expenses and in the activity log.

Every stored transaction creates a separate entry in the account history. Such an entry has an `IMPORT` marker, operation direction, amount, transaction type, and account name. “Before change” and “After change” fields remain empty because import does not change the balance. The timestamp of an individual operation comes from the file; when the statement contains only a date, the application uses a neutral 12:00 time. A separate summary entry for the full import keeps the actual time at which the import was performed. The details action on that log opens a list of items from the new import; older logs created before this feature show only the summary.

### Preview and decisions

The import preview uses the shared `DataGrid`. The most important fields are visible directly: date, direction, signed amount, name, account, label, and import decision. The table supports search, sorting, and pagination, while import selection is preserved independently of the current page and filter. Bank type, counterparty, status, inclusion in analysis, and other technical details are available after expanding “Details and settings”.

If the import finds a possible second side of a transfer, it is shown as a separate operation with its own account, date, and amount. The candidate list also uses `DataGrid`, so it can be searched, sorted, and paged. “Compare” opens the shared operation-details modal. Similarity alone does not exclude records from analysis; the cross-link is stored only after import confirmation.

## Most important balance rule

Imported entries are immediately marked as completed, but **they do not change the deposit balance**. A statement describes operation history that is already reflected in the current balance shown by the bank; subtracting or adding those amounts again would make the balance incorrect.

After import, the user still manually sets the current deposit state to the value matching the bank.

### Credit card

Import started from a `Credit card` deposit uses the same shared pipeline. For an export containing the columns `Type, Started Date, Completed Date, Description, Amount, Fee, Balance`, the following rules apply:

- `CARD_PAYMENT` with a negative amount is an expense with the “Card payment” type;
- `CARD_REFUND`, `CARD_CHARGEBACK`, refunds, and cashback with a positive amount are stored on the income side with the “Refund” type; this keeps them visible in analysis and filterable by type;
- a positive `TRANSFER` described as `To PLN` is treated as a probable repayment/top-up between the user's own accounts: it is imported by default and remains counted until the other side is confirmed;
- the completion date (`Completed Date`) is used, meaning the date on which the operation was actually executed.

Importing card history **does not change the available balance/available limit, actual balance, or card debt**. Those values already reflect the operations visible on the statement and continue to be managed the same way as before import was added.

The card form may optionally specify a **card repayment account**. The form is opened with the `Edit account` action next to the card in Deposits. This is a persistent informational product relationship, visible on the card and in the import preview. It does not create a transaction, execute a repayment, or change any balance. A cross-transaction suggestion still requires confirmation of the other side and may point to another user-owned account based on amount, date, and instrument type. Deleting the repayment account clears the relationship but leaves the card and its history intact.

## Transaction overlap between own accounts

Hard deduplication still works only within the selected deposit and against a reliable identifier/fingerprint. Additionally, the preview may mark an item as `Possible account overlap` when another user-owned account contains a previously imported operation:

- with the same direction, amount, normalized description, and a date no more than one day apart; or
- representing the opposite side of a transfer, with the same amount and a date no more than two days apart.

A transfer suggestion may involve different user-owned accounts. For ordinary accounts, opposite direction is preferred; for an account–credit-card pair, the same direction is also allowed when the operation is classified as card repayment. Date tolerance is configurable and defaults to ±3 days.

Matching a similar payment is only a warning: the row remains selected for import. Matching the two sides of an own transfer works differently — after confirmation, both sides remain in history but are excluded from analysis so they do not create artificial income and expense. The relationship is stored as `transaction A ↔ transaction B` of type `OWN_TRANSFER`; it may be confirmed from an automatic suggestion or selected manually from the operations of other accounts.

## Duplicate, transfer, and plan settlement

These are three independent analysis results even though the preview shows them in one `Import method` column:

- deduplication answers only whether the same bank row has already been imported;
- transfer detection suggests that an operation moves the user's own funds and should remain outside the budget;
- plan matching points to an incomplete one-off entry or a specific occurrence of a recurring entry.

Matching requires the same direction and primarily uses amount, date, and account. Name and category are only supporting signals. A partial income or expense may settle part of a plan, and later imports may settle the remainder. When exactly one credible match exists, it is selected by default; with several similar candidates, the application does not guess.

Import may also point to an operation that was already completed manually on the same account. In that case, a second income or expense entry is not created — the existing record receives the import identifier and becomes resistant to re-importing the same row.

Fundamental rule: **the period plan does not change because of import**. Import supplies actuals, while the forecast takes into account only the unsettled portion of the linked plan. Linking does not execute a transfer, change a balance, or delete the planned operation.

## Own transfers and top-ups

In the extended bank-export model, all `Topup` operations and recognized transfers between the user's own accounts are imported by default and counted in the budget. Only confirmation of the other side of the transfer excludes both operations from analyses.

This is an intentional compromise: without direct bank integration and owner data, it is not possible to reliably distinguish a transfer between the user's own accounts from an external incoming payment. It is safer to keep the item in history and require confirmation than to automatically classify every top-up as income.

## Supported format assumptions

The parser supports comma-, semicolon-, and tab-delimited files, quoted fields, UTF-8 encoding with Windows-1250 fallback, Polish and English date representations, and amounts using either a period or comma as the decimal separator.

A basic CSV must contain at least a date and amount, or separate debit and credit columns. Description is not required. The transaction name uses the fallback: `Description → Recipient/Sender → Transaction type → Bank transaction`. The supported extended export model may contain the columns:

`Type, Product, Started Date, Completed Date, Description, Amount, Fee, Currency, State, Balance`.

A file prepared according to the “Generate guidelines for GPT” action should use the complete header:

`Date;Amount;Currency;Description;Counterparty;Type;Status;Transaction ID;Account`

A compatible Polish-language variant with `Data`, `Kwota`, and `Instrument` columns is also accepted. `Account`/`Instrument` means the source instrument of the statement, not a destination account mentioned in the description. The generator requires plain CSV without Markdown tables, code blocks, or comments. Non-existent operations or identifiers must not be added; identical rows remain separate occurrences.

For such a file, the application primarily uses the operation completion date, amount sign, currency, status, and transaction type. Completed operations are eligible for import, while pending, reversed, rejected, or canceled entries are skipped. The format is not treated as integration with a specific institution — it is simply the accepted CSV model.

When a file contains a transaction identifier, such as `Transaction ID` or `ID transakcji`, it is used as the strongest basis for deduplication. Without such a column, the fingerprint is extended with occurrence count. For example, four identical records produce four importable occurrences; a later import containing five adds only the fifth. Repeated rows without IDs are marked with a warning but remain selected.

The CSV limit in the interface is 5 MB, the PDF limit is 10 MB, and one API request may contain at most 5,000 transactions.

## Intentional safeguards

- preview and manual selection before persistence;
- disabled import button while import is in progress;
- transactional persistence in SQLite;
- rejection of an invalid date, amount, or source identifier;
- unique row fingerprint for a given deposit;
- checking previously imported operations before approval;
- conservative suggestion of overlaps with imports from other user-owned accounts;
- marking repeated operations within the file;
- no partially persisted import after an error;
- no change to deposit balance, card available limit, or card debt.
