// Abonnements détectés : lit les données, la détection est dans le module pur subscriptions.js.
const express = require('express');
const { z } = require('zod');
const { db } = require('../db');
const { wrap, toCents, fromCents, auth, owns, view } = require('../lib');
const { localToday } = require('../dates');
const { detectSubscriptions, normalizeLabel } = require('../subscriptions');
const { FAMILIES, sqlList } = require('../accounts');

const router = express.Router();

function subscriptionsOf(userId) {
  const now = localToday();
  const transactions = db.prepare(`
    SELECT t.date, t.amount, t.label, t.category_id, t.account_id, t.transfer_id, t.recurring_id
    FROM transactions t JOIN accounts a ON a.id = t.account_id
    WHERE t.user_id = ? AND a.type IN ${sqlList(FAMILIES.liquid)} AND t.amount < 0 AND t.date >= date(?, '-760 days')`)
    .all(userId, now);
  const ignored = new Set(db.prepare('SELECT label_norm FROM subscription_ignores WHERE user_id = ?').all(userId).map((r) => r.label_norm));
  // ce qui est déjà une opération récurrente n'est pas proposé
  const tracked = new Set(db.prepare('SELECT label FROM recurring WHERE user_id = ? AND to_account_id IS NULL').all(userId)
    .map((r) => normalizeLabel(r.label)));
  return detectSubscriptions(transactions, { now, ignored, tracked });
}

/** Abonnements détectés, avec totaux mensuel et annuel. */
function subscriptionsView(userId, query = {}) {
  const cats = Object.fromEntries(db.prepare('SELECT * FROM categories WHERE user_id = ?').all(userId).map((c) => [c.id, c]));
  const accs = Object.fromEntries(db.prepare('SELECT id, name FROM accounts WHERE user_id = ?').all(userId).map((a) => [a.id, a.name]));
  const items = subscriptionsOf(userId).map((s) => ({
    ...s,
    amount: fromCents(s.amount),
    annual_cost: fromCents(s.annual_cost),
    category_name: cats[s.category_id]?.name ?? null,
    category_icon: cats[s.category_id]?.icon ?? null,
    category_color: cats[s.category_id]?.color ?? null,
    account_name: accs[s.account_id] ?? null,
    price_change: s.price_change && {
      ...s.price_change, old_amount: fromCents(s.price_change.old_amount), new_amount: fromCents(s.price_change.new_amount),
    },
  }));
  const annual = items.reduce((sum, s) => sum + toCents(s.annual_cost), 0);
  return { items, monthly_total: fromCents(Math.round(annual / 12)), annual_total: fromCents(annual) };
}

router.get('/api/subscriptions', auth, view(subscriptionsView));

const subscriptionKey = z.object({ key: z.string().trim().min(1, 'Abonnement manquant') });

router.post('/api/subscriptions/ignore', auth, wrap((req, res) => {
  const { key } = subscriptionKey.parse(req.body);
  db.prepare('INSERT OR IGNORE INTO subscription_ignores (user_id, label_norm) VALUES (?,?)').run(req.userId, normalizeLabel(key));
  res.status(201).json({ ok: true });
}));

// « Suivre comme récurrence » : crée la règle à partir de la prochaine échéance attendue (pas de doublon du passé)
router.post('/api/subscriptions/track', auth, wrap((req, res) => {
  const { key } = subscriptionKey.parse(req.body);
  const s = subscriptionsOf(req.userId).find((x) => x.key === key);
  if (!s) return res.status(404).json({ error: 'Abonnement introuvable' });
  if (!owns('accounts', s.account_id, req.userId)) return res.status(400).json({ error: 'Compte invalide' });
  const { lastInsertRowid: id } = db.prepare(`INSERT INTO recurring
    (user_id, account_id, category_id, amount, label, frequency, day, start_date) VALUES (?,?,?,?,?,?,?,?)`)
    .run(req.userId, s.account_id, s.category_id, -s.amount, s.label, s.frequency, Number(s.last_date.slice(8)), s.next_date);
  res.status(201).json({ id });
}));

module.exports = Object.assign(router, { subscriptionsView });
