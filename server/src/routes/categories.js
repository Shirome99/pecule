// Catégories de dépenses et de revenus.
const express = require('express');
const { z } = require('zod');
const { db } = require('../db');
const { wrap, auth, owns } = require('../lib');
const { remember } = require('../undo');

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
  // annulation : la catégorie, ses budgets (supprimés en cascade) et le lien vers ses opérations et récurrences
  const id = Number(req.params.id);
  const ids = (table) => db.prepare(`SELECT id FROM ${table} WHERE category_id = ? AND user_id = ?`).all(id, req.userId).map((r) => r.id);
  const relink = (table, list) => ({
    sql: `UPDATE ${table} SET category_id = ? WHERE user_id = ? AND id IN (${list.map(() => '?').join(',') || 'NULL'})`,
    params: [id, req.userId, ...list],
  });
  const undo = remember(req.userId, {
    categories: db.prepare('SELECT * FROM categories WHERE id = ?').all(id),
    budgets: db.prepare('SELECT * FROM budgets WHERE category_id = ?').all(id),
  }, [relink('transactions', ids('transactions')), relink('recurring', ids('recurring'))]);
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  res.json({ ok: true, undo });
}));

module.exports = router;
