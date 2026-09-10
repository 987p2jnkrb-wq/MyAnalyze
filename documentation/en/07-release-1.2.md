# MyAnalyze 1.2

Release 1.2 extends the stable 1.1 release without rebuilding the core product logic. The technical package and installer version is `1.2.0`.

Key changes:

- a full configuration screen based on the shared `DataGrid`, with light and dark themes, alias settings, and module configuration in a popup;
- light theme as the default and shared toast notifications;
- all main table-based modules use the shared `DataGrid`;
- safe deletion of individual and selected activity logs with confirmation;
- clear, distinguishable colors for financial product types;
- consistent unit indicators: the currency from Configuration for amounts and `%` only for APR and interest rate;
- previous/next-day navigation for the forecast date in Period Summary;
- further unification of validation, credit-product forms, liabilities, and repayment schedules.

The source package is available in two variants: a copy containing the owner's current data and a version with a clean starter database for a new user. The Electron installer always uses the clean database template and contains no private data.
