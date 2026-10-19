// Statistiques du mois pour l'Aperçu.
const express = require('express');
const { db } = require('../db');
const { wrap, fromCents, auth } = require('../lib');
const { generateRecurring, upcomingInMonth } = require('../recurring');
const { FAMILIES, sqlList } = require('../accounts');
const { lastMonths } = require('../dates');

// seules les liquidités entrent dans les revenus, dépenses et le « Solde total »
const liquidTypes = sqlList(FAMILIES.liquid);

const router = express.Router();

router.get('/api/stats', auth, wrap((req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const uid = req.userId;
  generateRecurring(uid);
  const upcoming = upcomingInMonth(uid, month);

  const totals = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount END),0) AS income,
           COALESCE(-SUM(CASE WHEN amount < 0 THEN amount END),0) AS expenses
    FROM transactions WHERE user_id = ? AND substr(date,1,7) = ? AND transfer_id IS NULL AND account_id IN (SELECT id FROM accounts WHERE type IN ${liquidTypes})`).get(uid, month);

  const balance = db.prepare(`
    SELECT (SELECT COALESCE(SUM(initial_balance),0) FROM accounts WHERE user_id = ? AND type IN ${liquidTypes})
         + (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE user_id = ? AND account_id IN (SELECT id FROM accounts WHERE type IN ${liquidTypes})) AS total`).get(uid, uid).total;

  const byCategory = db.prepare(`
    SELECT c.id, COALESCE(c.name,'Sans catégorie') AS name, COALESCE(c.color,'#9ca3af') AS color,
           COALESCE(c.icon,'•') AS icon, -SUM(t.amount) AS total
    FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.user_id = ? AND substr(t.date,1,7) = ? AND t.amount < 0 AND t.transfer_id IS NULL AND t.account_id IN (SELECT id FROM accounts WHERE type IN ${liquidTypes})
    GROUP BY c.id ORDER BY total DESC`).all(uid, month);

  // 6 derniers mois glissants jusqu'au mois sélectionné
  const months = lastMonths(month, 6);
  const trendRows = db.prepare(`
    SELECT substr(date,1,7) AS month,
      COALESCE(SUM(CASE WHEN amount > 0 THEN amount END),0) AS income,
      COALESCE(-SUM(CASE WHEN amount < 0 THEN amount END),0) AS expenses
    FROM transactions WHERE user_id = ? AND substr(date,1,7) BETWEEN ? AND ? AND transfer_id IS NULL AND account_id IN (SELECT id FROM accounts WHERE type IN ${liquidTypes})
    GROUP BY month`).all(uid, months[0], months[5]);
  const trendMap = Object.fromEntries(trendRows.map((r) => [r.month, r]));
  const trend = months.map((mo) => ({
    month: mo,
    income: fromCents(trendMap[mo]?.income || 0),
    expenses: fromCents(trendMap[mo]?.expenses || 0),
  }));

  res.json({
    month,
    income: fromCents(totals.income),
    expenses: fromCents(totals.expenses),
    net: fromCents(totals.income - totals.expenses),
    balance: fromCents(balance),
    byCategory: byCategory.map((c) => ({ ...c, total: fromCents(c.total) })),
    trend,
    upcoming: fromCents(upcoming.total),
    upcoming_count: upcoming.count,
  });
}));

module.exports = router;
