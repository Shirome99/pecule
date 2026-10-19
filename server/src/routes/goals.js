// Objectifs d'épargne : le calcul du montant mensuel est dans le module pur goals.js.
const express = require('express');
const { z } = require('zod');
const { db } = require('../db');
const { wrap, toCents, fromCents, isoDate, auth, owns } = require('../lib');
const { localToday } = require('../dates');
const { goalPlan } = require('../goals');
const { accountValueAt } = require('../wealth');

const router = express.Router();

const goalSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis'),
  target_amount: z.coerce.number({ error: 'Montant cible invalide' }).positive('Le montant cible doit être positif'),
  target_date: isoDate('Date cible invalide').nullable().optional(),
  account_id: z.coerce.number().int().nullable().optional(),
  saved: z.coerce.number().min(0, 'Le montant déjà épargné ne peut pas être négatif').optional(),
});

function goalsOf(userId, id = null) {
  const today = localToday();
  const rows = db.prepare(`
    SELECT g.*, a.name AS account_name,
      a.type AS account_type
    FROM goals g LEFT JOIN accounts a ON a.id = g.account_id
    WHERE g.user_id = ? ${id ? 'AND g.id = ?' : ''} ORDER BY g.target_date IS NULL, g.target_date, g.id`)
    .all(...(id ? [userId, id] : [userId]));
  return rows.map(({ account_type, ...g }) => {
    g.progress = g.account_id ? accountValueAt({ id: g.account_id, type: account_type }, today) : g.saved;
    const plan = goalPlan(g.progress, g.target_amount, g.target_date, today);
    return {
      ...g, ...plan,
      target_amount: fromCents(g.target_amount), saved: fromCents(g.saved), progress: fromCents(g.progress),
      remaining: fromCents(plan.remaining), per_month: plan.per_month === null ? null : fromCents(plan.per_month),
    };
  });
}

function checkGoal(g, userId) {
  if (g.account_id && !owns('accounts', g.account_id, userId)) return 'Compte invalide';
  return null;
}

router.get('/api/goals', auth, wrap((req, res) => res.json(goalsOf(req.userId))));

router.post('/api/goals', auth, wrap((req, res) => {
  const g = goalSchema.parse(req.body);
  const err = checkGoal(g, req.userId);
  if (err) return res.status(400).json({ error: err });
  const { lastInsertRowid: id } = db.prepare(
    'INSERT INTO goals (user_id, name, target_amount, target_date, account_id, saved) VALUES (?,?,?,?,?,?)'
  ).run(req.userId, g.name, toCents(g.target_amount), g.target_date || null, g.account_id || null, toCents(g.saved || 0));
  res.status(201).json(goalsOf(req.userId, id)[0]);
}));

router.put('/api/goals/:id', auth, wrap((req, res) => {
  if (!owns('goals', req.params.id, req.userId)) return res.status(404).json({ error: 'Objectif introuvable' });
  const g = goalSchema.parse(req.body);
  const err = checkGoal(g, req.userId);
  if (err) return res.status(400).json({ error: err });
  db.prepare('UPDATE goals SET name=?, target_amount=?, target_date=?, account_id=?, saved=COALESCE(?, saved) WHERE id=?')
    .run(g.name, toCents(g.target_amount), g.target_date || null, g.account_id || null,
      g.saved === undefined ? null : toCents(g.saved), req.params.id);
  res.json(goalsOf(req.userId, req.params.id)[0]);
}));

router.post('/api/goals/:id/contributions', auth, wrap((req, res) => {
  if (!owns('goals', req.params.id, req.userId)) return res.status(404).json({ error: 'Objectif introuvable' });
  const { amount } = z.object({
    amount: z.coerce.number({ error: 'Montant invalide' }).refine((n) => n !== 0, 'Le montant ne peut pas être nul'),
  }).parse(req.body);
  const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id);
  if (goal.account_id) return res.status(400).json({ error: 'Cet objectif suit le solde de son compte : ajoute plutôt une opération ou un virement' });
  if (goal.saved + toCents(amount) < 0) return res.status(400).json({ error: `Tu ne peux pas retirer plus que ${fromCents(goal.saved).toFixed(2).replace('.', ',')} €` });
  db.prepare('UPDATE goals SET saved = saved + ? WHERE id = ?').run(toCents(amount), req.params.id);
  res.status(201).json(goalsOf(req.userId, req.params.id)[0]);
}));

router.delete('/api/goals/:id', auth, wrap((req, res) => {
  if (!owns('goals', req.params.id, req.userId)) return res.status(404).json({ error: 'Objectif introuvable' });
  db.prepare('DELETE FROM goals WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

module.exports = router;
