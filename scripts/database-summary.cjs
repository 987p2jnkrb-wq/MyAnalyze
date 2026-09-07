const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

const databasePath = path.resolve(process.argv[2] || "");
if (!process.argv[2]) throw new Error("Uzycie: node scripts/database-summary.cjs <baza>");

(async () => {
  const db = await open({ filename: databasePath, driver: sqlite3.Database });
  const integrity = await db.get("PRAGMA integrity_check");
  const tables = await db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const counts = {};
  for (const { name } of tables) {
    const escapedName = name.replaceAll('"', '""');
    counts[name] = (await db.get(`SELECT COUNT(*) AS count FROM "${escapedName}"`)).count;
  }
  await db.close();
  const nonEmpty = Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0));
  console.log(JSON.stringify({
    databasePath,
    integrity: integrity.integrity_check,
    tableCount: tables.length,
    totalRows: Object.values(counts).reduce((sum, count) => sum + count, 0),
    nonEmpty,
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
