import { Router, Request, Response } from 'express';
import { dbPromise } from '../db';

const router = Router();

// Pobierz wszystkie moduły
router.get('/', async (req: Request, res: Response) => {
  try {
    const db = await dbPromise;
    const result = await db.all('SELECT * FROM modules_config ORDER BY order_index');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Błąd pobierania konfiguracji modułów' });
  }
});

// Pobierz jeden moduł
router.get('/:key', async (req: Request, res: Response) => {
  try {
    const db = await dbPromise;
    const { key } = req.params;
    const result = await db.get('SELECT * FROM modules_config WHERE key = ?', key);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Błąd pobierania modułu' });
  }
});

// Dodaj nowy moduł
router.post('/', async (req: Request, res: Response) => {
  try {
    const db = await dbPromise;
    const { key, name, icon, description, visible, order_index } = req.body;
    await db.run('INSERT INTO modules_config (key, name, icon, description, visible, order_index) VALUES (?, ?, ?, ?, ?, ?)', key, name, icon, description, visible, order_index);
    const inserted = await db.get('SELECT * FROM modules_config WHERE key = ?', key);
    res.status(201).json(inserted);
  } catch (err) {
    res.status(500).json({ error: 'Błąd dodawania modułu' });
  }
});

// Zapis kolejności jest jedną transakcją, więc nie może pozostać w połowie wykonany.
router.put('/order', async (req: Request, res: Response) => {
  const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
  const normalized: Array<{ key: string; order_index: number }> = updates.map((item: unknown) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return { key: String(record.key ?? '').trim(), order_index: Number(record.order_index) };
  });
  if (!normalized.length
    || normalized.some(({ key, order_index }) => !key || !Number.isInteger(order_index) || order_index < 0)
    || new Set(normalized.map(({ key }) => key)).size !== normalized.length
    || new Set(normalized.map(({ order_index }) => order_index)).size !== normalized.length) {
    return res.status(400).json({ error: 'Nieprawidłowa kolejność modułów.' });
  }

  const db = await dbPromise;
  await db.exec('BEGIN IMMEDIATE');
  try {
    for (const update of normalized) {
      const result = await db.run(
        'UPDATE modules_config SET order_index = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
        update.order_index, update.key,
      );
      if (result.changes !== 1) throw new Error(`Nie znaleziono modułu ${update.key}.`);
    }
    await db.exec('COMMIT');
    res.json(await db.all('SELECT * FROM modules_config ORDER BY order_index'));
  } catch (error) {
    await db.exec('ROLLBACK').catch(() => undefined);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Nie udało się zapisać kolejności modułów.' });
  }
});

// Zapisz moduł. Frontend uzupełnia brakujące rekordy definicjami domyślnymi,
// dlatego PUT musi również utworzyć rekord, jeśli nie ma go jeszcze w bazie.
router.put('/:key', async (req: Request, res: Response) => {
  try {
    const db = await dbPromise;
    const { key } = req.params;
    const { name, icon, description, visible, order_index } = req.body;
    const result = await db.run(
      'UPDATE modules_config SET name = ?, icon = ?, description = ?, visible = ?, order_index = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
      name, icon, description, visible, order_index, key,
    );
    if (result.changes === 0) {
      await db.run(
        'INSERT INTO modules_config (key, name, icon, description, visible, order_index) VALUES (?, ?, ?, ?, ?, ?)',
        key, name, icon, description, visible, order_index,
      );
    }
    const updated = await db.get('SELECT * FROM modules_config WHERE key = ?', key);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Błąd edycji modułu' });
  }
});

// Usuń moduł
router.delete('/:key', async (req: Request, res: Response) => {
  try {
    const db = await dbPromise;
    const { key } = req.params;
    const result = await db.run('DELETE FROM modules_config WHERE key = ?', key);
    if (!result.changes) return res.status(404).json({ error: 'Nie znaleziono modułu.' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Błąd usuwania modułu' });
  }
});

export default router;
