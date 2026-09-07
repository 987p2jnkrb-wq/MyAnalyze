import express from "express";
import { dbPromise } from "../db";

const router = express.Router();

// GET all logs, optionally filtered by entity_type and entity_id
router.get("/", async (req, res) => {
  try {
    const db = await dbPromise;
    let query = "SELECT * FROM app_activity_log";
    const params: any[] = [];
    if (req.query.entity_type && req.query.entity_id) {
      query += " WHERE entity_type = ? AND entity_id = ? ORDER BY timestamp DESC";
      params.push(req.query.entity_type, req.query.entity_id);
    } else if (req.query.entity_type) {
      query += " WHERE entity_type = ? ORDER BY timestamp DESC";
      params.push(req.query.entity_type);
    } else if (req.query.entity_id) {
      query += " WHERE entity_id = ? ORDER BY timestamp DESC";
      params.push(req.query.entity_id);
    } else {
      query += " ORDER BY timestamp DESC";
    }
    const rows = await db.all(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Błąd pobierania logów." });
  }
});

// GET log by id
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const db = await dbPromise;
    const row = await db.get("SELECT * FROM app_activity_log WHERE id = ?", [id]);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Błąd pobierania loga." });
  }
});

// POST create
router.post("/", async (req, res) => {
  const { user_id, action_type, entity_type, entity_id, old_data, new_data, ip_address, device_info, metadata } = req.body;
  try {
    const db = await dbPromise;
    const result = await db.run(
      `INSERT INTO app_activity_log (user_id, action_type, entity_type, entity_id, old_data, new_data, ip_address, device_info, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      user_id, action_type, entity_type, entity_id, old_data, new_data, ip_address, device_info, metadata
    );
    const inserted = await db.get("SELECT * FROM app_activity_log WHERE id = ?", result.lastID);
    res.json(inserted);
  } catch (err) {
    res.status(500).json({ error: "Błąd dodawania loga." });
  }
});

// DELETE
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const db = await dbPromise;
    const result = await db.run("DELETE FROM app_activity_log WHERE id = ?", id);
    if (!result.changes) return res.status(404).json({ error: "Nie znaleziono loga." });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Błąd usuwania loga." });
  }
});

export default router;
