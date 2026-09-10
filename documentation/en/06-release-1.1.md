# MyAnalyze 1.1

Release 1.1 completes the application as a simple, local personal-finance manager. The technical package and installer version is `1.1.0`.

## Key changes

- one Finance Manager with Deposits, Income, Expenses, Liabilities, Loans, and Summary tabs;
- a shared DataGrid with search, multi-select filters, profiles, range selection, inline editing, and export;
- one combined CSV export for accounts, recurring entries, planned transactions, and liabilities;
- a quick deposit `+/−` action with a choice between crediting or debiting the balance;
- a new **Virtual wallet** deposit type that cannot be linked to a credit product;
- automatic suggestions for loan and installment-plan debt with manual override;
- calculation of historically remaining installments, the next installment, and the end date;
- repayment schedules for loans, while retaining simplified manual payment marking;
- separation of actual and available funds in the period summary;
- atomic, repeat-safe completion of recurring entries;
- clearer activity logs and deposit history, including localized account-type and product-link labels;
- amount fields accepting both comma and period decimal separators;
- protection against accidentally closing forms by clicking the backdrop.

## Stabilization

- frontend and backend share the same meanings for product types and validation rules;
- linked balance, installment, and log operations use SQLite transactions;
- credit cards, installment plans, loans, recurring expenses, and deposits remain synchronized without double-counting debt;
- the installer contains a clean database template and does not overwrite existing user data.

Detailed behavior is described in [Business rules](02-business-rules.md), and release criteria in [Product decisions and QA](05-product-decisions-and-qa.md).
