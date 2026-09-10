# Shared DataGrid — model and responsibility boundaries

## Purpose

`DataGrid` is the shared mechanism for presenting lists in the application. It provides consistent table appearance and behavior, but it does not contain financial rules or API calls specific to individual modules.

The domain module is responsible for data, persistence, and column meaning. The grid is responsible only for table behavior.

## Code structure

- `myanalyze-frontend/src/components/DataGrid.tsx` — table coordination component: pagination, selection, inline editing, and row rendering.
- `myanalyze-frontend/src/components/data-grid/types.ts` — public contract for `DataGridProps<T>`, `DataGridColumn<T>`, views, and profiles.
- `myanalyze-frontend/src/components/data-grid/model.ts` — pure functions: filter normalization, compatibility of saved layouts, comparison, and CSV cells.
- `myanalyze-frontend/src/components/data-grid/useDataGridView.ts` — view state: search, filters, sorting, column order and visibility, profiles, and `localStorage` persistence.
- `myanalyze-frontend/src/hooks/useResizableColumns.ts` — column resizing and width persistence.

Public imports remain compatible:

```ts
import DataGrid, { type DataGridColumn } from "../../components/DataGrid";
```

## Shared grid responsibilities

The grid may implement features that have the same meaning across all tables:

- search, filtering, and sorting;
- pagination;
- column visibility, order, and width;
- locally saved view profiles;
- export of visible data to CSV;
- selection and bulk deletion when the module provides a delete operation;
- the technical inline-editing flow: start, draft, validation supplied by the module, and save invocation;
- shared header, row, action, and footer layout.

## Domain-module responsibilities

Every screen using the grid keeps the following responsibilities locally:

- data retrieval and API handling;
- business rules and data validation;
- column definitions and formatting of amounts, dates, and statuses;
- deciding which fields are editable;
- add forms and more advanced edit modals;
- actions specific to a particular record;
- local UI elements that are not generic table functionality.

Example: module configuration uses `DataGrid` for rendering, name and description editing, and shared layout. Icon selection remains a local configuration selector. It was not added to the grid core because other modules do not need it.

A column may provide static `filterOptions` when a valid filter value should remain available even when it is absent from the current dataset. Income and Expenses use this for “Planned” and “Completed” statuses, so an empty view of planned items does not automatically switch the user to history.

## Extension rule

A new option should be added to `DataGrid` only when:

1. it has the same meaning in several modules;
2. it does not require knowledge of the financial model or a specific endpoint;
3. it can be described with a generic type contract;
4. it has a test protecting the shared behavior.

A feature needed by one low-importance screen should remain in that screen. Conditions checking `gridId` or a module name should not be added inside the shared grid.

## Module configuration

`ModulesConfigTable` uses the shared grid without special extensions:

- name and description — standard inline editing;
- visibility — custom cell renderer and the existing configuration endpoint;
- order — standard row actions;
- icon — local selector rendered above the modal so it is not clipped by the scrollable table area;
- record ordering — `preserveRowOrder`, because it represents configuration business meaning rather than view sorting.

Changing the order sends the full sequence in one request and stores it in one SQLite transaction. On error, the UI restores the previous unmutated order, and the database is not left with a partially changed sequence.

## Regression protection

`DataGrid.test.tsx` tests protect, among other things:

- inline editing and saving after clicking outside the row;
- filters, search, and compatibility with older saved layouts;
- separate grid-configuration panels;
- selection, ranges, and bulk deletion;
- prevention of selecting protected records;
- sorting without mutating source data;
- pagination;
- saving and reapplying profiles.

`ModulesConfigTable.test.tsx` additionally protects:

- use of the shared grid in configuration;
- name persistence through inline editing;
- visibility toggling;
- atomic persistence of the full module order.

After changing the shared grid, run the complete frontend test suite, TypeScript, ESLint, and the production build. Testing only one module is insufficient because `DataGrid` is shared across many screens.
