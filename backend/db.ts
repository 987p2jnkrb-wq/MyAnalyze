import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const defaultDatabasePath = path.resolve(__dirname, '../dbmigration/myanalyz.sqlite');
const cleanTemplatePath = path.resolve(__dirname, '../dbmigration/myanalyz.template.sqlite');
const databasePath = process.env.MYANALYZE_DB_PATH
  ? path.resolve(process.env.MYANALYZE_DB_PATH)
  : defaultDatabasePath;

if (!fs.existsSync(databasePath) && fs.existsSync(cleanTemplatePath)) {
  fs.copyFileSync(cleanTemplatePath, databasePath);
}
if (!fs.existsSync(databasePath)) {
  throw new Error(`Nie znaleziono aktualnego szablonu bazy: ${cleanTemplatePath}`);
}

export const dbPromise = open({
  filename: databasePath,
  driver: sqlite3.Database
}).then(async (db) => {
  await db.exec('PRAGMA journal_mode = WAL;');
  await db.exec('PRAGMA busy_timeout = 5000;');
  // Powiązanie jest rozliczeniem planu, nie zmianą samego planu. Tabela jest
  // tworzona idempotentnie również dla istniejących baz użytkowników.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS transaction_plan_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actual_kind TEXT NOT NULL CHECK (actual_kind IN ('income', 'expense')),
      actual_id INTEGER NOT NULL,
      plan_source TEXT NOT NULL CHECK (plan_source IN ('one_time', 'recurring')),
      plan_id INTEGER NOT NULL,
      occurrence_date TEXT NOT NULL DEFAULT '',
      allocated_amount REAL NOT NULL CHECK (allocated_amount > 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      UNIQUE (actual_kind, actual_id, plan_source, plan_id, occurrence_date)
    );
    CREATE INDEX IF NOT EXISTS idx_transaction_plan_allocations_target
      ON transaction_plan_allocations(actual_kind, plan_source, plan_id, occurrence_date);
    CREATE INDEX IF NOT EXISTS idx_transaction_plan_allocations_actual
      ON transaction_plan_allocations(actual_kind, actual_id);

    CREATE TABLE IF NOT EXISTS statement_cross_transaction_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      left_kind TEXT NOT NULL CHECK (left_kind IN ('income', 'expense')),
      left_transaction_id INTEGER NOT NULL,
      right_kind TEXT NOT NULL CHECK (right_kind IN ('income', 'expense')),
      right_transaction_id INTEGER NOT NULL,
      link_type TEXT NOT NULL DEFAULT 'OWN_TRANSFER' CHECK (link_type = 'OWN_TRANSFER'),
      left_was_excluded INTEGER NOT NULL DEFAULT 0 CHECK (left_was_excluded IN (0, 1)),
      right_was_excluded INTEGER NOT NULL DEFAULT 0 CHECK (right_was_excluded IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_cross_transaction_left
      ON statement_cross_transaction_links(left_kind, left_transaction_id);
    CREATE INDEX IF NOT EXISTS idx_cross_transaction_right
      ON statement_cross_transaction_links(right_kind, right_transaction_id);

    CREATE TABLE IF NOT EXISTS account_import_identifiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      external_identifier TEXT NOT NULL,
      instrument_type TEXT NOT NULL CHECK (instrument_type IN ('account', 'credit_card')),
      label TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      UNIQUE (account_id, provider, external_identifier, instrument_type)
    );
    CREATE INDEX IF NOT EXISTS idx_account_import_identifier_lookup
      ON account_import_identifiers(provider, external_identifier, instrument_type);

    CREATE TABLE IF NOT EXISTS custom_transaction_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      UNIQUE (name)
    );

    CREATE TABLE IF NOT EXISTS statement_import_classification (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      raw_type TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
      custom_type_id INTEGER,
      category TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      UNIQUE (provider, raw_type, kind)
    );

    CREATE TABLE IF NOT EXISTS statement_import_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      detect_transfer_suggestions INTEGER NOT NULL DEFAULT 1 CHECK (detect_transfer_suggestions IN (0, 1)),
      transfer_date_tolerance INTEGER NOT NULL DEFAULT 3 CHECK (transfer_date_tolerance BETWEEN 0 AND 7),
      auto_select_plan_match INTEGER NOT NULL DEFAULT 1 CHECK (auto_select_plan_match IN (0, 1)),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    INSERT OR IGNORE INTO statement_import_settings
      (id, detect_transfer_suggestions, transfer_date_tolerance, auto_select_plan_match)
    VALUES (1, 1, 3, 1);

    CREATE TABLE IF NOT EXISTS recurring_expense_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recurring_expense_id INTEGER NOT NULL,
      occurrence_date TEXT NOT NULL,
      expense_id INTEGER,
      status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'dismissed', 'customized')),
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      UNIQUE (recurring_expense_id, occurrence_date)
    );
    CREATE INDEX IF NOT EXISTS idx_recurring_expense_queue_expense
      ON recurring_expense_queue(expense_id);
    CREATE TRIGGER IF NOT EXISTS cleanup_recurring_expense_occurrences
      BEFORE DELETE ON wydatki_stale
      BEGIN
        DELETE FROM wydatki
         WHERE id IN (
           SELECT expense_id FROM recurring_expense_queue
            WHERE recurring_expense_id = OLD.id AND status = 'scheduled' AND expense_id IS NOT NULL
         )
           AND COALESCE(zrealizowany, 0) NOT IN (1, '1', 'true');
        DELETE FROM recurring_expense_queue WHERE recurring_expense_id = OLD.id;
      END;
  `);
  const customTypeColumns = await db.all<Array<{ name: string }>>('PRAGMA table_info(custom_transaction_types)');
  if (customTypeColumns.some((column) => column.name === 'kind')) {
    await db.exec(`
      BEGIN;
      UPDATE przychody
         SET custom_type_id = (
           SELECT MIN(same_name.id)
             FROM custom_transaction_types current_type
             JOIN custom_transaction_types same_name
               ON lower(trim(same_name.name)) = lower(trim(current_type.name))
            WHERE current_type.id = przychody.custom_type_id
         )
       WHERE custom_type_id IS NOT NULL;
      UPDATE wydatki
         SET custom_type_id = (
           SELECT MIN(same_name.id)
             FROM custom_transaction_types current_type
             JOIN custom_transaction_types same_name
               ON lower(trim(same_name.name)) = lower(trim(current_type.name))
            WHERE current_type.id = wydatki.custom_type_id
         )
       WHERE custom_type_id IS NOT NULL;
      UPDATE statement_import_classification
         SET custom_type_id = (
           SELECT MIN(same_name.id)
             FROM custom_transaction_types current_type
             JOIN custom_transaction_types same_name
               ON lower(trim(same_name.name)) = lower(trim(current_type.name))
            WHERE current_type.id = statement_import_classification.custom_type_id
         )
       WHERE custom_type_id IS NOT NULL;
      CREATE TABLE custom_transaction_types_shared (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
      INSERT INTO custom_transaction_types_shared (id, name, active, created_at)
      SELECT MIN(id), MIN(name), MAX(active), MIN(created_at)
        FROM custom_transaction_types
       GROUP BY lower(trim(name));
      DROP TABLE custom_transaction_types;
      ALTER TABLE custom_transaction_types_shared RENAME TO custom_transaction_types;
      COMMIT;
    `);
  }
  const accountColumns = await db.all<Array<{ name: string }>>('PRAGMA table_info(konta)');
  if (!accountColumns.some((column) => column.name === 'institution_name')) {
    await db.exec('ALTER TABLE konta ADD COLUMN institution_name TEXT');
  }
  if (!accountColumns.some((column) => column.name === 'active')) {
    await db.exec('ALTER TABLE konta ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))');
  }
  const debtPlanColumns = await db.all<Array<{ name: string }>>('PRAGMA table_info(debt_plans)');
  if (!debtPlanColumns.some((column) => column.name === 'active')) {
    await db.exec('ALTER TABLE debt_plans ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))');
  }
  const goalSettingsColumns = await db.all<Array<{ name: string }>>('PRAGMA table_info(financial_goal_settings)');
  if (goalSettingsColumns.length > 0 && !goalSettingsColumns.some((column) => column.name === 'new_funds_strategy')) {
    await db.exec('ALTER TABLE financial_goal_settings ADD COLUMN new_funds_strategy TEXT');
  }
  for (const table of ['przychody', 'wydatki'] as const) {
    const columns = await db.all<Array<{ name: string }>>(`PRAGMA table_info(${table})`);
    if (!columns.some((column) => column.name === 'import_status')) {
      await db.exec(`ALTER TABLE ${table} ADD COLUMN import_status TEXT`);
    }
    if (!columns.some((column) => column.name === 'custom_type_id')) {
      await db.exec(`ALTER TABLE ${table} ADD COLUMN custom_type_id INTEGER`);
    }
    await db.run(`UPDATE ${table} SET import_status = 'completed' WHERE import_fingerprint IS NOT NULL AND import_status IS NULL`);
  }
  for (const table of ['przychody_stale', 'wydatki_stale'] as const) {
    const columns = await db.all<Array<{ name: string }>>(`PRAGMA table_info(${table})`);
    if (!columns.some((column) => column.name === 'custom_type_id')) {
      await db.exec(`ALTER TABLE ${table} ADD COLUMN custom_type_id INTEGER`);
    }
  }

  // Kategorie są od tej wersji polem legacy. Zachowujemy kolumny dla zgodności ze
  // starszymi bazami/API, ale istniejącą klasyfikację przenosimy do wspólnych etykiet.
  for (const table of ['przychody', 'wydatki', 'przychody_stale', 'wydatki_stale'] as const) {
    await db.exec(`
      INSERT OR IGNORE INTO custom_transaction_types (name, active)
      SELECT DISTINCT trim(kategoria), 1
        FROM ${table}
       WHERE custom_type_id IS NULL
         AND trim(COALESCE(kategoria, '')) <> ''
         AND lower(trim(kategoria)) <> 'inne';
      UPDATE ${table}
         SET custom_type_id = (
           SELECT type.id
             FROM custom_transaction_types type
            WHERE lower(trim(type.name)) = lower(trim(${table}.kategoria))
            ORDER BY type.id
            LIMIT 1
         )
       WHERE custom_type_id IS NULL
         AND trim(COALESCE(kategoria, '')) <> ''
         AND lower(trim(kategoria)) <> 'inne';
    `);
  }
  await db.exec(`
    INSERT OR IGNORE INTO custom_transaction_types (name, active)
    SELECT DISTINCT trim(category), 1
      FROM statement_import_classification
     WHERE custom_type_id IS NULL
       AND trim(COALESCE(category, '')) <> ''
       AND lower(trim(category)) <> 'inne';
    UPDATE statement_import_classification
       SET custom_type_id = (
         SELECT type.id
           FROM custom_transaction_types type
          WHERE lower(trim(type.name)) = lower(trim(statement_import_classification.category))
          ORDER BY type.id
          LIMIT 1
       )
     WHERE custom_type_id IS NULL
       AND trim(COALESCE(category, '')) <> ''
       AND lower(trim(category)) <> 'inne';
  `);
  const legacyMatchTable = await db.get<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'transaction_plan_matches'");
  if (legacyMatchTable) {
    await db.exec(`
      INSERT OR IGNORE INTO transaction_plan_allocations
        (actual_kind, actual_id, plan_source, plan_id, occurrence_date, allocated_amount, created_at)
      SELECT actual_kind, actual_id, plan_source, plan_id, COALESCE(occurrence_date, ''), allocated_amount, created_at
      FROM transaction_plan_matches;
      DROP TABLE transaction_plan_matches;
    `);
  }
  return db;
});
