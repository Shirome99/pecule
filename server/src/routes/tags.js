// Tags des opérations : liste (autocomplétion) et bilan d'un tag.
const express = require('express');
const { db } = require('../db');
const { wrap, fromCents, auth } = require('../lib');
const { normalizeTag, summarizeTag } = require('../tags');

const router = express.Router();

router.get('/api/tags', auth, wrap((req, res) => {
  res.json(db.prepare(`
    SELECT g.name, COUNT(tt.transaction_id) AS count, MAX(t.date) AS last_date
    FROM tags g JOIN transaction_tags tt ON tt.tag_id = g.id JOIN transactions t ON t.id = tt.transaction_id
    WHERE g.user_id = ? GROUP BY g.id ORDER BY last_date DESC, g.name`).all(req.userId));
}));

router.get('/api/tags/:name', auth, wrap((req, res) => {
  const name = normalizeTag(req.params.name);
  const rows = db.prepare(`
    SELECT t.date, t.amount, t.category_id, c.name AS category_name, c.color AS category_color, c.icon AS category_icon
    FROM transactions t JOIN transaction_tags tt ON tt.transaction_id = t.id JOIN tags g ON g.id = tt.tag_id
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE g.user_id = ? AND g.name = ? AND t.transfer_id IS NULL`).all(req.userId, name);
  if (!rows.length) return res.status(404).json({ error: `Aucune opération avec #${name}` });
  const s = summarizeTag(rows);
  res.json({
    ...s, name, total: fromCents(s.total), income: fromCents(s.income),
    byCategory: s.byCategory.map((c) => ({ ...c, total: fromCents(c.total) })),
  });
}));

module.exports = router;
