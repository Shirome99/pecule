// Comptes : liste avec leur valeur, création, modification, suppression.
const express = require('express');
const { z } = require('zod');
const { db } = require('../db');
const { wrap, toCents, fromCents, auth, owns } = require('../lib');
const { ACCOUNT_TYPES, familyOf } = require('../accounts');
const { accountValueAt, investmentDetails, loanOf } = require('../wealth');

const router = express.Router();

const accountSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis'),
  type: z.enum(ACCOUNT_TYPES, { error: 'Type de compte inconnu' }).default('courant'),
  initial_balance: z.coerce.number().default(0),
});

router.get('/api/accounts', auth, wrap((req, res) => {
  const rows = db.prepare(`
    SELECT a.*, a.initial_balance + COALESCE(SUM(t.amount), 0) AS balance
    FROM accounts a LEFT JOIN transactions t ON t.account_id = a.id
    WHERE a.user_id = ? GROUP BY a.id ORDER BY a.id`).all(req.userId);
  res.json(rows.map((r) => {
    const family = familyOf(r.type);
    const out = { ...r, family, initial_balance: fromCents(r.initial_balance), balance: fromCents(accountValueAt(r)) };
    if (family === 'investment') {
      const d = investmentDetails(r);
      Object.assign(out, { invested: fromCents(d.invested), gain: fromCents(d.gain), gain_pct: d.gain_pct, valued_at: d.valued_at });
    }
    if (family === 'debt') out.loan_id = loanOf(r.id)?.id ?? null;
    return out;
  }));
}));

router.post('/api/accounts', auth, wrap((req, res) => {
  const a = accountSchema.parse(req.body);
  const { lastInsertRowid } = db.prepare('INSERT INTO accounts (user_id, name, type, initial_balance) VALUES (?,?,?,?)')
    .run(req.userId, a.name, a.type, toCents(a.initial_balance));
  res.status(201).json({ id: lastInsertRowid });
}));

router.put('/api/accounts/:id', auth, wrap((req, res) => {
  if (!owns('accounts', req.params.id, req.userId)) return res.status(404).json({ error: 'Compte introuvable' });
  const a = accountSchema.parse(req.body);
  db.prepare('UPDATE accounts SET name=?, type=?, initial_balance=? WHERE id=?')
    .run(a.name, a.type, toCents(a.initial_balance), req.params.id);
  res.json({ ok: true });
}));

router.delete('/api/accounts/:id', auth, wrap((req, res) => {
  if (!owns('accounts', req.params.id, req.userId)) return res.status(404).json({ error: 'Compte introuvable' });
  const count = db.prepare('SELECT COUNT(*) n FROM accounts WHERE user_id = ?').get(req.userId).n;
  if (count <= 1) return res.status(400).json({ error: 'Il faut garder au moins un compte' });
  db.transaction(() => {
    // l'autre moitié des virements de ce compte devient une opération simple : son solde ne bouge pas
    db.prepare(`UPDATE transactions SET transfer_id = NULL WHERE user_id = ? AND account_id <> ? AND transfer_id IN
      (SELECT transfer_id FROM transactions WHERE account_id = ? AND transfer_id IS NOT NULL)`)
      .run(req.userId, req.params.id, req.params.id);
    db.prepare('DELETE FROM accounts WHERE id = ?').run(req.params.id);
  })();
  res.json({ ok: true });
}));

module.exports = router;
