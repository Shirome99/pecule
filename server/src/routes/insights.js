// Constats du mois pour l'Aperçu : lit les données, le calcul est dans le module pur insights.js.
const express = require('express');
const { db } = require('../db');
const { wrap, fromCents, auth } = require('../lib');
const { localToday, addMonths } = require('../dates');
const { insights } = require('../insights');
const { FAMILIES, sqlList } = require('../accounts');

const router = express.Router();

router.get('/api/insights', auth, wrap((req, res) => {
  const uid = req.userId;
  const now = localToday();
  const month = req.query.month || now.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'Mois invalide (attendu AAAA-MM)' });
  if (month > now.slice(0, 7)) return res.status(400).json({ error: 'Pas de constat pour un mois futur' });
  const liquid = sqlList(FAMILIES.liquid);
  const transactions = db.prepare(`
    SELECT t.id, t.date, t.amount, t.label, t.category_id FROM transactions t JOIN accounts a ON a.id = t.account_id
    WHERE t.user_id = ? AND a.type IN ${liquid} AND t.transfer_id IS NULL AND t.amount < 0
      AND t.date >= ? AND substr(t.date,1,7) <= ?`).all(uid, addMonths(`${month}-01`, -6), month);
  const firstDate = db.prepare(`SELECT MIN(t.date) d FROM transactions t JOIN accounts a ON a.id = t.account_id
    WHERE t.user_id = ? AND a.type IN ${liquid}`).get(uid).d;
  const categories = Object.fromEntries(db.prepare('SELECT id, name FROM categories WHERE user_id = ?').all(uid).map((c) => [c.id, c]));
  const budgets = db.prepare('SELECT category_id, monthly_limit FROM budgets WHERE user_id = ?').all(uid);
  const items = insights({ month, now, transactions, categories, budgets, firstDate });
  res.json(items.map((i) => ({ ...i, amount: fromCents(i.amount) })));
}));

module.exports = router;
