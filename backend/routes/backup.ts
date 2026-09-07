import { Router } from "express";
import fs from "fs";
import os from "os";
import path from "path";
import { dbPromise } from "../db";

const router = Router();

router.get("/", async (req, res) => {
  const remoteAddress = req.socket.remoteAddress || "";
  if (remoteAddress !== "::1" && remoteAddress !== "127.0.0.1" && !remoteAddress.endsWith(":127.0.0.1")) {
    return res.status(403).json({ error: "Kopia bazy jest dostępna tylko lokalnie." });
  }
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "myanalyze-backup-"));
  const snapshotPath = path.join(temporaryDirectory, "myanalyz.sqlite");
  const date = new Date().toISOString().slice(0, 10);
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    fs.rm(temporaryDirectory, { recursive: true, force: true }, () => undefined);
  };

  try {
    const db = await dbPromise;
    await db.run("VACUUM INTO ?", snapshotPath);
    res.download(snapshotPath, `MyAnalyze-backup-${date}.sqlite`, (error) => {
      cleanup();
      if (error) {
        if (!res.headersSent && !res.destroyed) res.status(500).json({ error: "Nie udało się pobrać kopii bazy danych." });
        else res.end(); // Complete the server-side request and release the SQLite queue after abort.
      }
    });
    res.once("close", cleanup);
  } catch (error) {
    cleanup();
    console.error("Nie udało się utworzyć kopii bazy danych:", error);
    res.status(500).json({ error: "Nie udało się utworzyć kopii bazy danych." });
  }
});

export default router;
