# Import and cross-transaction data model

This document describes the simple model used by CSV import. It is not a banking or accounting data model.

## Normalized operation

A file adapter returns a shared operation containing at least:

- `sourceInstrument` — bank/provider, identifier from the file, and instrument type (`account`, `debit_card`, `credit_card`);
- transaction date and optionally settlement date;
- signed amount, currency, status, and `rawType`;
- description, counterparty, and raw auxiliary data;
- shared application classification, e.g. `normal_transaction`, `transfer_candidate`, `card_payment`, `card_repayment`, `refund`, or `unknown`.

Description, counterparty, and recognized type are not required for import. The name uses the following fallback: description → recipient/sender → transaction type → “Bank transaction”.

## CSV contract for external tools

Guidelines generated in the import window describe a simple shared semicolon-delimited format:

```text
Date;Amount;Currency;Description;Counterparty;Type;Status;Transaction ID;Account
```

Every row must contain all nine fields, even when some values are empty. `Account` identifies the account, card, or wallet from which the operation originated. `Transaction ID` may be empty only when the source does not provide one. Data that is absent from the source statement must not be invented, and repeated operations must not be removed. The parser also accepts Polish header aliases, including `Data` and `Instrument`; the generic format is not identified as a specific bank solely from the name of the transaction-type column.

## Instrument identifier

An account in the application is a user's financial object. An account, card, or wallet identifier found in CSV is technical source information.

The planned optional mapping may have the following form:

```text
account_import_identifiers
id
account_id
provider
external_identifier
instrument_type
label NULL
created_at
```

The mapping does not classify an operation and does not exclude it from the budget. With one match, the account may be selected automatically; with no match or a collision, the user selects it manually. Masked identifiers should not be globally unique — uniqueness within account, provider, identifier, and instrument type, together with UI handling of ambiguity, is safer.

`provider` is a stable technical adapter code, e.g. `millennium`, `revolut`, or `vinted`. Optional `konta.institution_name` is only a display name in the UI and does not participate in transaction identification or classification.

## Labels and import fallback

`custom_transaction_types` stores shared user labels. A single `custom_type_id`, e.g. `Vinted`, may represent both income and expense; direction still comes from the transaction. The label does not affect financial logic or exclusion from analyses.

`statement_import_classification` maps `provider + raw_type + kind` to a label and category. `kind` remains part of the mapping, allowing income and expense to use different categories while pointing to the same label. An empty `raw_type` is the provider fallback. An exact mapping takes precedence, and the absence of a mapping does not block import.

## Cross-transaction

A cross-transaction is an optional relationship:

```text
transaction A ↔ transaction B
link_type = OWN_TRANSFER
```

Both operations remain in their respective tables and histories. Only a confirmed link marks them as excluded from analysis. No candidate or rejection of the suggestion leaves the operation as normal income or expense.

In the current simple model, the relationship stores the type and identifier of both sides, which supports account ↔ account, account ↔ wallet, and account ↔ credit card. For normal accounts, opposite directions are preferred; for credit-card repayment, the same direction is also possible, but only when classification indicates `card_repayment`.

## Boundaries

Adapters may know the format of a specific bank. After normalization, matching, budgeting, and analysis use only the shared fields. Relationships between multiple cards and a single product, and an advanced rule engine, are not currently being designed.
