const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3");

const sourcePath = path.resolve(process.argv[2] || "");
const targetPath = path.resolve(process.argv[3] || "");

if (!process.argv[2] || !process.argv[3]) {
  throw new Error("Uzycie: node scripts/snapshot-database.cjs <baza-zrodlowa> <nowy-snapshot>");
}
if (sourcePath === targetPath) throw new Error("Snapshot musi miec inna sciezke niz baza zrodlowa.");
if (!fs.existsSync(sourcePath)) throw new Error(`Nie znaleziono bazy zrodlowej: ${sourcePath}`);
if (fs.existsSync(targetPath)) throw new Error(`Plik docelowy juz istnieje: ${targetPath}`);

const source = new sqlite3.Database(sourcePath, sqlite3.OPEN_READONLY, (openError) => {
  if (openError) throw openError;
  const backup = source.backup(targetPath);
  backup.step(-1, (stepError) => {
    backup.finish((finishError) => {
      source.close((closeError) => {
        const error = stepError || finishError || closeError;
        if (error) throw error;
        console.log(`Utworzono spojny snapshot: ${targetPath}`);
      });
    });
  });
});
