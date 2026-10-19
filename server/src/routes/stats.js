// Statistiques du mois pour l'Aperçu.
const express = require('express');
const { db } = require('../db');
const { wrap, fromCents, auth, view } = require('../lib');
const { generateRecurring, upcomingInMonth } = require('../recurring');
const { FAMILIES, sqlList } = require('../accounts');
const { lastMonths, localToday } = require('../dates');
const { yearSummary } = require('../yearly');

// seules les liquidités entrent dans les revenus, dépenses et le « Solde total »
const liquidTypes = sqlList(FAMILIES.liquid);

const router = express.Router();

/** Revenus, dépenses, solde des liquidités, répartition et tendance 6 mois d'un mois. */
function monthStats(userId, query = {}) {
  const month = query.month || new Date().toISOString().slice(0, 7);
  const uid = userId;
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

  return {
    month,
    income: fromCents(totals.income),
    expenses: fromCents(totals.expenses),
    net: fromCents(totals.income - totals.expenses),
    balance: fromCents(balance),
    byCategory: byCategory.map((c) => ({ ...c, total: fromCents(c.total) })),
    trend,
    upcoming: fromCents(upcoming.total),
    upcoming_count: upcoming.count,
  };
}

router.get('/api/stats', auth, view(monthStats));

// ---------- vue annuelle ----------
router.get('/api/stats/year', auth, wrap((req, res) => {
  const year = Number(req.query.year || localToday().slice(0, 4));
  if (!Number.isInteger(year) || year < 1970 || year > 2200) return res.status(400).json({ error: 'Année invalide (ex. 2026)' });
  generateRecurring(req.userId);
  const rows = db.prepare(`
    SELECT t.id, t.date, t.amount, t.label, t.category_id, c.name AS category_name, c.color AS category_color, c.icon AS category_icon
    FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.user_id = ? AND substr(t.date,1,4) = ? AND t.transfer_id IS NULL
      AND t.account_id IN (SELECT id FROM accounts WHERE type IN ${liquidTypes})`).all(req.userId, String(year));
  const y = yearSummary(rows, year);
  res.json({
    ...y,
    income: fromCents(y.income), expenses: fromCents(y.expenses), savings: fromCents(y.savings),
    months: y.months.map((m) => ({ ...m, income: fromCents(m.income), expenses: fromCents(m.expenses) })),
    categories: y.categories.map((c) => ({ ...c, months: c.months.map(fromCents), total: fromCents(c.total) })),
    top: y.top.map((t) => ({ ...t, amount: fromCents(t.amount) })),
  });
}));

module.exports = Object.assign(router, { monthStats });
