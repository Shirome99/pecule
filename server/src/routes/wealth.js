// Patrimoine : valorisations des placements, crédits (tableau d'amortissement) et patrimoine net.
const express = require('express');
const { z } = require('zod');
const { db } = require('../db');
const { wrap, toCents, fromCents, isoDate, auth, owns } = require('../lib');
const { familyOf } = require('../accounts');
const { networthSeries } = require('../wealth');
const { localToday } = require('../dates');
const amortization = require('../amortization');

const router = express.Router();

// ---------- placements : valorisations ----------
const investmentOf = (id, userId) => {
  const a = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(id, userId);
  return a && familyOf(a.type) === 'investment' ? a : null;
};

router.get('/api/accounts/:id/valuations', auth, wrap((req, res) => {
  if (!investmentOf(req.params.id, req.userId)) return res.status(404).json({ error: 'Placement introuvable' });
  const rows = db.prepare('SELECT id, date, value FROM valuations WHERE account_id = ? ORDER BY date DESC').all(req.params.id);
  res.json(rows.map((v) => ({ ...v, value: fromCents(v.value) })));
}));

router.post('/api/accounts/:id/valuations', auth, wrap((req, res) => {
  if (!owns('accounts', req.params.id, req.userId)) return res.status(404).json({ error: 'Compte introuvable' });
  if (!investmentOf(req.params.id, req.userId)) return res.status(400).json({ error: 'Les valorisations ne concernent que les placements' });
  const v = z.object({
    date: isoDate('Date invalide'),
    value: z.coerce.number({ error: 'Valeur invalide' }).min(0, 'La valeur ne peut pas être négative'),
  }).parse(req.body);
  // une seule valorisation par jour : la nouvelle remplace l'ancienne
  db.prepare(`INSERT INTO valuations (user_id, account_id, date, value) VALUES (?,?,?,?)
    ON CONFLICT(account_id, date) DO UPDATE SET value = excluded.value`).run(req.userId, req.params.id, v.date, toCents(v.value));
  res.status(201).json({ ok: true });
}));

router.delete('/api/valuations/:id', auth, wrap((req, res) => {
  if (!owns('valuations', req.params.id, req.userId)) return res.status(404).json({ error: 'Valorisation introuvable' });
  db.prepare('DELETE FROM valuations WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

// ---------- crédits ----------
const loanSchema = z.object({
  principal: z.coerce.number({ error: 'Capital invalide' }).positive('Le capital emprunté doit être positif'),
  annual_rate: z.coerce.number({ error: 'Taux invalide' }).min(0, 'Le taux ne peut pas être négatif').max(30, 'Taux trop élevé (30 % max)'),
  duration_months: z.coerce.number({ error: 'Durée invalide' }).int('Durée en mois entiers').min(1, 'Durée : 1 mois minimum').max(600, 'Durée : 600 mois maximum'),
  first_payment_date: isoDate('Date de 1re échéance invalide'),
  insurance_monthly: z.coerce.number().min(0, "L'assurance ne peut pas être négative").default(0),
});

const loanOut = (loan) => {
  const s = amortization.summary(loan);
  return {
    ...loan,
    principal: fromCents(loan.principal),
    insurance_monthly: fromCents(loan.insurance_monthly),
    outstanding: fromCents(amortization.outstandingAt(loan, localToday())),
    payment: fromCents(s.payment),
    end_date: s.end_date,
    total_interest: fromCents(s.total_interest),
    total_insurance: fromCents(s.total_insurance),
    total_cost: fromCents(s.total_cost),
  };
};

router.get('/api/accounts/:id/loan', auth, wrap((req, res) => {
  const loan = db.prepare('SELECT * FROM loans WHERE account_id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!loan) return res.status(404).json({ error: 'Crédit introuvable' });
  res.json(loanOut(loan));
}));

router.put('/api/accounts/:id/loan', auth, wrap((req, res) => {
  const a = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!a) return res.status(404).json({ error: 'Compte introuvable' });
  if (familyOf(a.type) !== 'debt') return res.status(400).json({ error: 'Seuls les comptes de crédit ont un tableau d’amortissement' });
  const l = loanSchema.parse(req.body);
  db.prepare(`INSERT INTO loans (user_id, account_id, principal, annual_rate, duration_months, first_payment_date, insurance_monthly)
    VALUES (?,?,?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET principal = excluded.principal, annual_rate = excluded.annual_rate,
    duration_months = excluded.duration_months, first_payment_date = excluded.first_payment_date, insurance_monthly = excluded.insurance_monthly`)
    .run(req.userId, a.id, toCents(l.principal), l.annual_rate, l.duration_months, l.first_payment_date, toCents(l.insurance_monthly));
  res.json(loanOut(db.prepare('SELECT * FROM loans WHERE account_id = ?').get(a.id)));
}));

router.get('/api/loans/:id/schedule', auth, wrap((req, res) => {
  if (!owns('loans', req.params.id, req.userId)) return res.status(404).json({ error: 'Crédit introuvable' });
  const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(req.params.id);
  const rows = amortization.schedule(loan).map((r) => ({
    ...r, payment: fromCents(r.payment), interest: fromCents(r.interest), principal: fromCents(r.principal),
    insurance: fromCents(r.insurance), remaining: fromCents(r.remaining),
  }));
  res.json({ loan: loanOut(loan), schedule: rows });
}));

// ---------- patrimoine net ----------
router.get('/api/networth', auth, wrap((req, res) => {
  const { months } = z.object({
    months: z.coerce.number().int().min(1, 'months : 1 minimum').max(120, 'months : 120 maximum').default(24),
  }).parse(req.query);
  const points = networthSeries(req.userId, months).map((p) => ({
    ...p, liquid: fromCents(p.liquid), investments: fromCents(p.investments), debts: fromCents(p.debts), net: fromCents(p.net),
  }));
  const current = points[points.length - 1];
  const ago = (n) => (points.length > n ? points[points.length - 1 - n].net : null);
  const change = (n) => (ago(n) === null ? null : Math.round((current.net - ago(n)) * 100) / 100);
  res.json({ current, change_1m: change(1), change_12m: change(12), months: points });
}));

module.exports = router;
