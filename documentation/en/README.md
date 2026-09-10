# MyAnalyze — product documentation

> **Language:** English · [Polski](../pl/README.md)

MyAnalyze 1.5 is a local application for managing and analyzing a personal budget. The user manually maintains deposits, income, expenses, recurring entries, and liabilities, while the application helps plan the month and the period until the next salary payment. The application has no direct bank integration; a CSV file or text-based PDF can be imported only to supplement the history of completed operations and compare the plan with actual spending.

## Documents

- [Purpose and scope](01-purpose-and-scope.md) — what the application is, which modules it contains, and what it intentionally does not do.
- [Business rules](02-business-rules.md) — balances, credit cards, transactions, recurring entries, liabilities, loans, and summaries.
- [CSV and PDF import](03-csv-and-pdf-import.md) — statement import flow, safeguards, and intentional simplifications.
- [Import data model](08-import-data-model.md) — normalized operations, instrument identifiers, and `OWN_TRANSFER` relationships.
- [Architecture and development](04-architecture-and-development.md) — technical structure, shared components, testing, and a safe direction for development.
- [Product decisions and QA](05-product-decisions-and-qa.md) — behaviors that should not be reported as bugs without a new product decision.
- [Release 1.1](06-release-1.1.md) — key features and stabilizing changes from the previous release.
- [Release 1.2](07-release-1.2.md) — application configuration, unified tables, and final UX improvements.
- [DataGrid model](datagrid-model.md) — shared grid responsibilities and extension boundaries.

Instructions for running, testing, and building the installer are available in [Instrukcja/KOMENDY-URUCHAMIANIE-I-BUILD.md](../../Instrukcja/KOMENDY-URUCHAMIANIE-I-BUILD.md).

## Shortest description of how it works

1. In **Deposits**, the user enters the current balances of accounts, cash, virtual wallets, and credit cards.
2. In **Income** and **Expenses**, the user plans one-off operations and later completes them against a selected deposit.
3. **Recurring** subtabs in Income and Expenses describe recurring operations.
4. **Liabilities** provide a lightweight overview of debts, installments, and limits, while **Loans** store detailed credit-product data.
5. **General**, **Period**, and **Month** subtabs in Summary are read-only and calculate plan, actuals, and forecasts from the same data.
6. **Goals** use the same data to calculate real liquidity, a safe surplus, and manually managed goals, and can prepare an anonymized prompt for GPT analysis.
7. CSV/PDF import appends completed operations to history but does not replace manual balance control.
8. The **Download CSV** button on the Manager bar creates a combined export of accounts, recurring entries, planned transactions, and liabilities.
9. The interface is available in Polish and English. The global PLN/EUR/USD setting changes only the displayed currency symbol and does not convert or modify stored amounts.
10. Allocation of new funds between goals can be set by the user as percentages; the algorithm remains a recommendation and does not execute decisions automatically.
