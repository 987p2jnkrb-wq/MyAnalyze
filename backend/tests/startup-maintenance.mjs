import assert from 'node:assert/strict';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import http from 'node:http';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const temporaryDir = await mkdtemp(path.join(tmpdir(), 'myanalyze-maintenance-'));
process.env.MYANALYZE_DB_PATH = path.join(temporaryDir, 'test.sqlite');
await copyFile(path.join(root, 'dbmigration/myanalyz.template.sqlite'), process.env.MYANALYZE_DB_PATH);
const require = createRequire(import.meta.url);
let db;
let server;
try {
  db = await require('../../backend-dist/db.js').dbPromise;
  const { syncRecurringOccurrenceRule } = require('../../backend-dist/services/recurringOccurrenceQueue.js');
  const now = new Date(2026, 8, 5);
  for (const kind of ['income', 'expense']) {
    const table = kind === 'income' ? 'przychody' : 'wydatki';
    const rules = `${table}_stale`;
    const queue = `recurring_${kind}_queue`;
    const ruleId = `recurring_${kind}_id`;
    const transactionId = `${kind}_id`;
    const inserted = await db.run(`INSERT INTO ${rules} (nazwa, kwota, kategoria, data_od, dzien_miesiaca) VALUES ('TEST queue', 100, 'Inne', '2026-09-01', 10)`);
    const rule = await db.get(`SELECT * FROM ${rules} WHERE id = ?`, inserted.lastID);
    await syncRecurringOccurrenceRule(db, kind, rule, now);
    const first = await db.get(`SELECT * FROM ${queue} WHERE ${ruleId} = ?`, rule.id);
    // An existing actual with stale scheduled status must not be detached or duplicated.
    await db.run(`UPDATE ${table} SET zrealizowany = 1 WHERE id = ?`, first[transactionId]);
    await syncRecurringOccurrenceRule(db, kind, rule, now);
    await syncRecurringOccurrenceRule(db, kind, rule, now);
    const preserved = await db.get(`SELECT * FROM ${queue} WHERE id = ?`, first.id);
    assert.equal(preserved[transactionId], first[transactionId]);
    assert.equal(preserved.status, 'customized');
    assert.equal((await db.get(`SELECT COUNT(*) AS total FROM ${table} WHERE nazwa = 'TEST queue'`)).total, 1);
    // A genuinely missing pending row is repaired, once.
    await db.run(`DELETE FROM ${table} WHERE id = ?`, first[transactionId]);
    await db.run(`UPDATE ${queue} SET status = 'scheduled' WHERE id = ?`, first.id);
    await syncRecurringOccurrenceRule(db, kind, rule, now);
    await syncRecurringOccurrenceRule(db, kind, rule, now);
    const repaired = await db.get(`SELECT * FROM ${queue} WHERE id = ?`, first.id);
    assert.ok(await db.get(`SELECT id FROM ${table} WHERE id = ?`, repaired[transactionId]));
    assert.equal((await db.get(`SELECT COUNT(*) AS total FROM ${table} WHERE nazwa = 'TEST queue'`)).total, 1);
    // Failure after creating a transaction rolls back both records, even inside a caller transaction.
    await db.run(`DELETE FROM ${table} WHERE id = ?`, repaired[transactionId]);
    await db.run(`DELETE FROM ${queue} WHERE id = ?`, first.id);
    await db.exec(`CREATE TEMP TRIGGER fail_queue BEFORE UPDATE ON ${queue} BEGIN SELECT RAISE(ABORT, 'TEST queue failure'); END; BEGIN IMMEDIATE;`);
    await assert.rejects(syncRecurringOccurrenceRule(db, kind, rule, now), /TEST queue failure/);
    assert.equal((await db.get(`SELECT COUNT(*) AS total FROM ${queue} WHERE ${ruleId} = ?`, rule.id)).total, 0);
    assert.equal((await db.get(`SELECT COUNT(*) AS total FROM ${table} WHERE nazwa = 'TEST queue'`)).total, 0);
    await db.exec('COMMIT; DROP TRIGGER fail_queue;');
    await db.run(`DELETE FROM ${rules} WHERE id = ?`, rule.id);
  }
  process.stdout.write('✓ recurring: actual zachowany, orphan naprawiony, savepoint atomowy dla obu kierunków\n');

  const { default: app, initializeStartupData } = require('../../backend-dist/index.js');
  await initializeStartupData();
  server = await new Promise(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (url, options = {}) => fetch(base + url, { ...options, signal: AbortSignal.timeout(5000) });
  const abortDownload = url => new Promise((resolve, reject) => {
    const req = http.get(base + url, response => {
      response.once('data', () => { response.destroy(); resolve(); });
      response.on('error', error => { if (error.code !== 'ECONNRESET') reject(error); });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('Download timeout')));
  });
  // Large enough that the client disconnects before the response finishes.
  await db.exec('CREATE TABLE test_backup_payload (payload BLOB); INSERT INTO test_backup_payload VALUES (randomblob(8388608));');
  await abortDownload('/backup');
  assert.equal((await request('/modules-config')).status, 200, 'aborted backup blocked SQLite queue');
  const loan = await db.run("INSERT INTO loans (nazwa, typ) VALUES ('TEST download', 'Kredyt')");
  const pdfPath = path.join(temporaryDir, 'test.pdf');
  await writeFile(pdfPath, Buffer.alloc(8 * 1024 * 1024, 32));
  await db.run('INSERT INTO loan_documents (loan_id, file_path) VALUES (?, ?)', loan.lastID, pdfPath);
  await abortDownload(`/loans/${loan.lastID}/schedule-pdf`);
  assert.equal((await request('/modules-config')).status, 200, 'aborted PDF blocked SQLite queue');
  await db.run('UPDATE loan_documents SET file_path = ? WHERE loan_id = ?', path.join(temporaryDir, 'missing.pdf'), loan.lastID);
  assert.equal((await request(`/loans/${loan.lastID}/schedule-pdf`)).status, 400);
  assert.equal((await request('/modules-config')).status, 200);
  process.stdout.write('✓ abort backup/PDF i brak pliku nie blokują kolejnych requestów\n');
} finally {
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  if (db) await db.close();
  await rm(temporaryDir, { recursive: true, force: true });
}
