// Catégories de dépenses et de revenus.
const express = require('express');
const { z } = require('zod');
const { db } = require('../db');
const { wrap, auth, owns } = require('../lib');

const router = express.Router();

const categorySchema = z.object({
  name: z.string().trim().min(1, 'Nom requis'),
  kind: z.enum(['expense', 'income']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6b7280'),
  icon: z.string().max(8).default('•'),
});

router.get('/api/categories', auth, wrap((req, res) => {
  res.json(db.prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY kind, name').all(req.userId));
}));

router.post('/api/categories', auth, wrap((req, res) => {
  const c = categorySchema.parse(req.body);
  const { lastInsertRowid } = db.prepare('INSERT INTO categories (user_id, name, kind, color, icon) VALUES (?,?,?,?,?)')
    .run(req.userId, c.name, c.kind, c.color, c.icon);
  res.status(201).json({ id: lastInsertRowid });
}));

router.delete('/api/categories/:id', auth, wrap((req, res) => {
  if (!owns('categories', req.params.id, req.userId)) return res.status(404).json({ error: 'Catégorie introuvable' });
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

module.exports = router;
