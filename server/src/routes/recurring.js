// Opérations récurrentes.
const express = require('express');
const { z } = require('zod');
const { db } = require('../db');
const { wrap, toCents, fromCents, isoDate, auth, owns, checkTxRefs } = require('../lib');
const { generateRecurring, nextOccurrence, localToday } = require('../recurring');

const router = express.Router();

const recurringSchema = z.object({
  account_id: z.coerce.number().int(),
  category_id: z.coerce.number().int().nullable().optional(),
  amount: z.coerce.number().positive('Le montant doit être positif'),
  type: z.enum(['expense', 'income', 'transfer']),
  to_account_id: z.coerce.number().int().nullable().optional(),
  label: z.string().trim().min(1, 'Libellé requis'),
  frequency: z.enum(['monthly', 'weekly', 'yearly'], { error: 'Fréquence : monthly, weekly ou yearly' }).default('monthly'),
  day: z.coerce.number().int().min(1).max(31).optional(),
  start_date: isoDate('Date de début invalide'),
  end_date: isoDate('Date de fin invalide').nullable().optional(),
});

const recurringOut = (r) => ({ ...r, amount: fromCents(r.amount), paused: !!r.paused, next_date: r.paused ? null : nextOccurrence(r) });

router.get('/api/recurring', auth, wrap((req, res) => {
  const rows = db.prepare(`
    SELECT r.*, a.name AS account_name, ta.name AS to_account_name,
      c.name AS category_name, c.color AS category_color, c.icon AS category_icon
    FROM recurring r JOIN accounts a ON a.id = r.account_id LEFT JOIN accounts ta ON ta.id = r.to_account_id
    LEFT JOIN categories c ON c.id = r.category_id
    WHERE r.user_id = ? ORDER BY r.paused, r.label`).all(req.userId);
  res.json(rows.map(recurringOut));
}));

router.post('/api/recurring', auth, wrap((req, res) => {
  const r = recurringSchema.parse(req.body);
  const err = checkTxRefs(r, req.userId);
  if (err) return res.status(400).json({ error: err });
  if (r.end_date && r.end_date < r.start_date) return res.status(400).json({ error: 'La date de fin doit être après la date de début' });
  const start = new Date(`${r.start_date}T00:00:00Z`);
  // par défaut : le jour de la date de début (jour du mois, ou jour de la semaine en hebdomadaire)
  const day = r.day ?? (r.frequency === 'weekly' ? start.getUTCDay() || 7 : start.getUTCDate());
  if (r.frequency === 'weekly' && day > 7) return res.status(400).json({ error: 'Jour de la semaine : de 1 (lundi) à 7 (dimanche)' });
  const transfer = r.type === 'transfer';
  if (transfer) {
    if (!r.to_account_id) return res.status(400).json({ error: "Choisis le compte d'arrivée" });
    if (r.to_account_id === r.account_id) return res.status(400).json({ error: 'Choisis deux comptes différents' });
    if (!owns('accounts', r.to_account_id, req.userId)) return res.status(400).json({ error: 'Compte invalide' });
  }
  const cents = toCents(r.amount) * (r.type === 'income' ? 1 : -1);
  const { lastInsertRowid: id } = db.prepare(`INSERT INTO recurring
    (user_id, account_id, to_account_id, category_id, amount, label, frequency, day, start_date, end_date) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(req.userId, r.account_id, transfer ? r.to_account_id : null, transfer ? null : r.category_id || null, cents,
      r.label, r.frequency, day, r.start_date, r.end_date || null);
  const generated = generateRecurring(req.userId);
  res.status(201).json({ id, generated });
}));

router.put('/api/recurring/:id', auth, wrap((req, res) => {
  if (!owns('recurring', req.params.id, req.userId)) return res.status(404).json({ error: 'Opération récurrente introuvable' });
  const { paused } = z.object({ paused: z.boolean({ error: 'Indique paused : true ou false' }) }).parse(req.body);
  // à la reprise, la période de pause n'est pas rattrapée
  if (paused) db.prepare('UPDATE recurring SET paused = 1 WHERE id = ?').run(req.params.id);
  else db.prepare('UPDATE recurring SET paused = 0, last_generated = MAX(COALESCE(last_generated, ?), ?) WHERE id = ?')
    .run(localToday(), localToday(), req.params.id);
  res.json({ ok: true });
}));

router.delete('/api/recurring/:id', auth, wrap((req, res) => {
  if (!owns('recurring', req.params.id, req.userId)) return res.status(404).json({ error: 'Opération récurrente introuvable' });
  // les opérations déjà générées restent (recurring_id passe à NULL)
  db.prepare('DELETE FROM recurring WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

module.exports = router;
