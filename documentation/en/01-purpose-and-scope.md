# Application purpose and scope

## Purpose

MyAnalyze is intended to be a simpler and more pleasant-to-use version of the personal `BudgetPlaner` spreadsheet. The core of the application is the **Finance Manager**, where users can quickly switch between data without opening many separate modules.

Product priorities:

- fast manual updates of the current financial position;
- a clear distinction between plan and actuals;
- simple forecasts without automatically posting every transaction;
- local data storage and offline operation;
- few UI exceptions and one shared grid and modal;
- predictability over extensive automation.

## Main views

The home page contains three modules:

- **Finance Manager** — the main workspace;
- **Application Logs** — history of changes and operations;
- **Configuration** — names, descriptions, icons, visibility, and ordering of home-page modules.

The Finance Manager contains the following tabs:

| Tab | Responsibility |
| --- | --- |
| Deposits | Bank accounts, cash, virtual wallets, and credit cards together with their current balances. |
| Income | **Current** subtab for one-off income and **Recurring** for recurring rules. |
| Expenses | **Current** subtab for one-off expenses and **Recurring** for recurring rules. |
| Liabilities | Lightweight overview of debts, installments, and credit cards. |
| Loans | Detailed credit-product data and repayment schedules. |
| Goals | Real liquidity, financial floor, user goals, recommendations, and a new-funds calculator. |
| Summary | **General**, **Period**, **Month**, and **History** subtabs: financial position, forecast for the current pay period, reconstruction of plan and actuals for past periods, monthly plan and actuals, and manual state snapshots. |

## Intentional product boundaries

MyAnalyze is not a banking or accounting system. It does not log in to banks, synchronize accounts in the background, use Open Banking, or automatically reconcile balances.

The following are also outside the current scope:

- full multi-currency support — PLN remains the base operating mode;
- automatic posting of salary and all recurring entries;
- an advanced rule engine, correction ledger, and reversal of every operation;
- an investments module — it was intentionally removed to keep the product focused on household budgeting;
- separate pages for accounts, income, expenses, and loans — these functions are concentrated in the Finance Manager;
- cloud synchronization of data between computers.

## Operating model

The application is based on manual control. The user decides when to change a balance, when to mark an entry as completed, and which rows from a bank file to import. Automation is intended to reduce repetitive data entry, not to make financial decisions for the user.

The transaction module is intentionally simplified and experimental. Its primary purpose is manual planning and reviewing history imported from a bank, not maintaining a full accounting ledger with automatic corrections and reversals.
