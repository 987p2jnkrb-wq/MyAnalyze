import { Router } from "express";
import { dbPromise } from "../db";

const router = Router();
const kind = (value: unknown) => value === "income" || value === "expense" ? value : null;
const text = (value: unknown, max = 100) => typeof value === "string" ? value.trim().slice(0, max) : "";

router.get("/", async (_req, res) => {
  const db = await dbPromise;
  res.json(await db.all("SELECT * FROM custom_transaction_types ORDER BY active DESC, name COLLATE NOCASE"));
});

router.post("/", async (req, res) => {
  const name = text(req.body?.name, 80);
  if (!name) return res.status(400).json({ error: "Podaj nazwę etykiety." });
  const db = await dbPromise;
  try {
    const result = await db.run("INSERT INTO custom_transaction_types (name) VALUES (?)", name);
    res.status(201).json(await db.get("SELECT * FROM custom_transaction_types WHERE id = ?", result.lastID));
  } catch { res.status(409).json({ error: "Taka etykieta już istnieje." }); }
});

router.put("/:id", async (req, res) => {
  const name = text(req.body?.name, 80);
  if (!name) return res.status(400).json({ error: "Podaj nazwę etykiety." });
  const db = await dbPromise;
  try {
    const result = await db.run("UPDATE custom_transaction_types SET name = ?, active = ? WHERE id = ?", name, req.body?.active === false || req.body?.active === 0 ? 0 : 1, req.params.id);
    if (!result.changes) return res.status(404).json({ error: "Nie znaleziono etykiety." });
    res.json(await db.get("SELECT * FROM custom_transaction_types WHERE id = ?", req.params.id));
  } catch { res.status(409).json({ error: "Taka etykieta już istnieje." }); }
});

router.get("/import-classification/:provider", async (req, res) => {
  const provider = text(req.params.provider, 60).toLowerCase();
  const db = await dbPromise;
  res.json(await db.all(`SELECT mapping.*, type.name AS custom_type_name
    FROM statement_import_classification mapping
    LEFT JOIN custom_transaction_types type ON type.id = mapping.custom_type_id
    WHERE mapping.provider = ? ORDER BY mapping.raw_type, mapping.kind`, provider));
});

router.put("/import-classification/:provider", async (req, res) => {
  const provider = text(req.params.provider, 60).toLowerCase();
  const typeKind = kind(req.body?.kind);
  const rawType = text(req.body?.raw_type, 160);
  const hasCustomType = Object.prototype.hasOwnProperty.call(req.body ?? {}, "custom_type_id");
  const hasCategory = Object.prototype.hasOwnProperty.call(req.body ?? {}, "category");
  const customTypeId = !hasCustomType ? undefined : req.body?.custom_type_id == null || req.body.custom_type_id === "" ? null : Number(req.body.custom_type_id);
  const category = !hasCategory ? undefined : text(req.body?.category, 80) || null;
  if (!provider || !/^[a-z0-9_-]+$/.test(provider) || !typeKind || (!hasCustomType && !hasCategory) || (customTypeId !== undefined && customTypeId !== null && !Number.isInteger(customTypeId))) {
    return res.status(400).json({ error: "Nieprawidłowe ustawienia klasyfikacji." });
  }
  const db = await dbPromise;
  if (customTypeId !== undefined && customTypeId !== null && !await db.get("SELECT id FROM custom_transaction_types WHERE id = ? AND active = 1", customTypeId)) {
    return res.status(400).json({ error: "Nieprawidłowa etykieta." });
  }
  const existing = await db.get<{ custom_type_id: number | null; category: string | null }>(
    "SELECT custom_type_id, category FROM statement_import_classification WHERE provider = ? AND raw_type = ? AND kind = ?",
    provider, rawType, typeKind,
  );
  const nextCustomTypeId = hasCustomType ? customTypeId ?? null : existing?.custom_type_id ?? null;
  const nextCategory = hasCategory ? category ?? null : existing?.category ?? null;
  await db.run(`INSERT INTO statement_import_classification (provider, raw_type, kind, custom_type_id, category)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(provider, raw_type, kind) DO UPDATE SET custom_type_id=excluded.custom_type_id, category=excluded.category, updated_at=datetime('now','localtime')`, provider, rawType, typeKind, nextCustomTypeId, nextCategory);
  res.json(await db.get("SELECT * FROM statement_import_classification WHERE provider = ? AND raw_type = ? AND kind = ?", provider, rawType, typeKind));
});

export default router;
