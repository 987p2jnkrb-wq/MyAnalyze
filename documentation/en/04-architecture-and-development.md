# Architecture and safe development

## Technology stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, and Lucide icons.
- **Backend:** Node.js, Express, and TypeScript.
- **Database:** local SQLite file.
- **Desktop:** Electron; the backend is started as a local process together with the application.
- **Tests:** Jest/Testing Library for UI and models, plus API smoke tests for the backend.

In development mode, the frontend runs by default on `127.0.0.1:4173`, while the API runs on `127.0.0.1:3003`. In the installed version, Electron starts its own backend, waits for `/api/health`, and only then opens the interface.

## Data and privacy

The desktop version stores the database in the Windows user-data directory. The installer ships with a clean database template containing the schema but none of the private entities used during application development.

The application is local and offline. Imported CSV files are processed on the user's computer; the current architecture has no external server and no user accounts.

The database file is named `myanalyz.sqlite` and is stored in the `userData` directory determined by Electron — on a typical Windows installation this is the application directory under `%APPDATA%`. On first launch, a clean template is copied; subsequent launches and updates should not overwrite the existing database.

At startup, the backend opens the database, enables WAL mode and a timeout, and performs only small, idempotent schema extensions required by newer versions. It does not rebuild tables or remove existing data.

### Backup and restore

1. Close the application so the backend releases the SQLite file.
2. Copy `myanalyz.sqlite` from the application data directory to a safe location.
3. To restore data, close the application and replace the file in the data directory with the backup copy.
4. Do not replace the database with `dbmigration/myanalyz.sqlite` from the project source — that file is a clean template for new installations.

## Shared UI elements

### DataGrid

The shared `DataGrid` is responsible for:

- responsive layout and scrolling of wide tables;
- sorting, filtering, and search;
- selecting visible columns;
- layout profiles;
- CSV export;
- pagination;
- optional inline editing;
- optional actions pinned to the right side.

Search, filters, sorting, column visibility and order, and profiles are stored locally in `localStorage`, separately for each grid. They are not part of the SQLite database and are not transferred automatically to another computer. CSV export includes the currently visible columns; when records are selected, only selected rows are exported, otherwise all rows in the current filtered and sorted result are exported.

Grid interaction rules:

- Right-clicking a column header marked as filterable and clicking the filter icon in that header open the same multi-select filter. Multiple values within one column are combined with an “or” condition, while filters from different columns are combined with “and”.
- An active filter is visible both in the column header and on the main filters button. Older single-select filters stored in `localStorage` are automatically interpreted as a one-value selection.
- Clicking a row or its checkbox sets the start point of a selection. Shift+clicking a later row or checkbox selects the full range according to the current filtering and sorting. The header checkbox selects all records matching the current search and filters, including records on other pages; operation confirmation shows the total number of selected records.
- The bulk `Delete selected (N)` button appears only after at least one record has been selected and only in tables that support deletion. The operation requires one confirmation showing the number of records.
- Bulk deletion applies only to selected records in the current result. After complete success, the selection is cleared. If the operation partially fails, records that were not deleted remain selected and the operation may be retried.
- Changing the main Finance Manager tab or subtab always clears the selection in all grids. This prevents actions from being performed on records selected earlier in a now-hidden view.
- Selection is transient UI state and is not persisted in `localStorage` or SQLite.

Business rules remain in the model of the specific module. The grid provides mechanics but should not know how to calculate a credit-card balance or loan debt.

Inline editing is enabled only where users actually edit data. Summaries, the Month view, and the activity log are read-only. Loans are the exception: in addition to inline editing, they retain a full edit modal because of the large number of related fields.

The grid stores a copy of the initial value of the edited row. Clicking outside a row without an actual change closes the editor without an API request and without a misleading success message. The shared decimal field accepts both comma and period separators. Amount forms use one `MoneyInput` overlay that displays the currency code read from Configuration.

### Modal and module header

Forms and confirmations should use the shared modal, and pages should use the shared module header. Local overlays, custom backdrops, or separate versions of the back button should not be created.

Clicking the dimmed backdrop does not close the modal, preventing accidental loss of entered data. The user closes a form deliberately with the `×` button, **Cancel**, or the Escape key.

## Application configuration

The Configuration screen uses the shared `DataGrid` to present language, theme, currency, alias, and the entry point for module management. The “Save settings” button stores the full set locally, applies the selected theme, and shows the application's shared toast. The default theme is light.

Module management opens a modal containing a second `DataGrid`. Module configuration is persisted through the API in SQLite and allows changing the name, description, icon, visibility, and order of home-page modules. The home page and configuration screen use one module catalog, one icon catalog, and one function that merges defaults with the API response. The interface is available in Polish and English. Currency presentation is centrally configured; the selected code is read by formatters, amount fields, and exports so currency display remains controlled from one place.

## Responsibility split

- grid components render data and invoke context/API operations;
- pure models (`financeSummary`, `monthViewModel`, loan models) perform calculations that can be tested without UI;
- the Goals model reuses `buildPeriodSummary` for the conservative forecast, while recommendations and allocation of new funds remain pure functions without side effects;
- frontend contexts fetch and refresh shared resources;
- backend routes validate requests and execute transactional operations;
- shared validators for amounts, dates, and account types reduce repeated rules across routes;
- completion of recurring entries and quick credit/debit actions wrap all dependent writes in a single SQLite transaction;
- synchronization services maintain the Loans–Liabilities–Recurring expenses–Credit cards relationships;
- an installment plan points to a card through `debt_plans.linked_card_account_id`; paying an installment updates the plan, card, and history log in one SQLite transaction;
- the audit log describes operations in the user's language.

## Change rules

Before modifying a financial rule, check [Product decisions and QA](05-product-decisions-and-qa.md). Not every unusual rule is a bug; many simplifications were deliberately chosen to keep the application predictable.

Safe workflow:

1. Describe the expected behavior with one numeric example.
2. Locate the single source of the rule and its existing relationships.
3. Add or modify a model/API test.
4. Make the smallest change without introducing parallel logic.
5. Run TypeScript, UI tests, API tests, and the desktop build as appropriate for the scope.
6. Test record creation from both sides of a relationship, not only editing.

## Development direction

The safest next improvements are better analysis of existing data, filters, and reports based on the same entities. Bank integrations, full multi-currency support, automatic posting, or an advanced investment module should be separate product decisions because they change the application's simple, local character.
