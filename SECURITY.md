# Security and privacy

MyAnalyze processes sensitive personal-finance data locally. The public repository must never contain real databases, bank statements, exports, loan documents, logs, backups, credentials, or environment files.

## Reporting a vulnerability

Please use a private GitHub security advisory instead of opening a public issue when a report could expose a vulnerability or sensitive data. Include only synthetic reproduction data.

## Before publishing a change

- Check the complete Git diff and the list of files about to be committed.
- Confirm that only `dbmigration/myanalyz.template.sqlite` is included from local database files.
- Use synthetic values in tests, screenshots, and examples.
- Attach installers to GitHub Releases rather than committing build artifacts.

If sensitive data is committed, removing it in a later commit is not sufficient because it remains in Git history. Revoke exposed credentials and rewrite the affected history before publishing.
