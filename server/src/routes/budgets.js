// Budgets mensuels par catégorie.
const express = require('express');
const { z } = require('zod');
const { db } = require('../db');
const { wrap, toCents, fromCents, auth, owns } = require('../lib');
const { FAMILIES, sqlList } = require('../accounts');

// seules les liquidités entrent dans les budgets
const liquidTypes = sqlList(FAMILIES.liquid);

const router = express.Router();

router.get('/api/budgets', auth, wrap((req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const rows = db.prepare(`
    SELECT b.id, b.category_id, b.monthly_limit, c.name, c.color, c.icon,
      COALESCE((SELECT -SUM(t.amount) FROM transactions t
        WHERE t.category_id = b.category_id AND t.user_id = b.user_id
          AND substr(t.date,1,7) = ? AND t.amount < 0 AND t.transfer_id IS NULL AND t.account_id IN (SELECT id FROM accounts WHERE type IN ${liquidTypes})), 0) AS spent
    FROM budgets b JOIN categories c ON c.id = b.category_id
    WHERE b.user_id = ? ORDER BY c.name`).all(month, req.userId);
  res.json(rows.map((r) => ({ ...r, monthly_limit: fromCents(r.monthly_limit), spent: fromCents(r.spent) })));
}));

router.post('/api/budgets', auth, wrap((req, res) => {
  const b = z.object({
    category_id: z.coerce.number().int(),
    monthly_limit: z.coerce.number().positive('Le plafond doit être positif'),
  }).parse(req.body);
  if (!owns('categories', b.category_id, req.userId)) return res.status(400).json({ error: 'Catégorie invalide' });
  db.prepare(`INSERT INTO budgets (user_id, category_id, monthly_limit) VALUES (?,?,?)
    ON CONFLICT(user_id, category_id) DO UPDATE SET monthly_limit = excluded.monthly_limit`)
    .run(req.userId, b.category_id, toCents(b.monthly_limit));
  res.status(201).json({ ok: true });
}));

router.delete('/api/budgets/:id', auth, wrap((req, res) => {
  if (!owns('budgets', req.params.id, req.userId)) return res.status(404).json({ error: 'Budget introuvable' });
  db.prepare('DELETE FROM budgets WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

module.exports = router;
