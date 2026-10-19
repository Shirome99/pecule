// Dépenses partagées : groupes, membres (noms libres), dépenses réparties, soldes et remboursements.
const express = require('express');
const { z } = require('zod');
const { db } = require('../db');
const { wrap, toCents, fromCents, isoDate, auth, owns, checkTxRefs } = require('../lib');
const { localToday } = require('../dates');
const { splitExpense, balances, settleUp } = require('../settle');

const router = express.Router();

const memberName = z.string().trim().min(1, 'Prénom requis').max(40, 'Prénom trop long (40 caractères max)');

const groupOf = (id, userId) => db.prepare('SELECT * FROM groups WHERE id = ? AND user_id = ?').get(id, userId);
const membersOf = (groupId) => db.prepare('SELECT id, name, is_me FROM group_members WHERE group_id = ? ORDER BY is_me DESC, id').all(groupId);

/** Groupe complet : membres et soldes, dépenses avec parts, remboursements faits et à faire (centimes → euros). */
function groupDetail(group) {
  const members = membersOf(group.id);
  const expenses = db.prepare('SELECT * FROM group_expenses WHERE group_id = ? ORDER BY date DESC, id DESC').all(group.id);
  const shares = db.prepare('SELECT s.* FROM group_expense_shares s JOIN group_expenses e ON e.id = s.expense_id WHERE e.group_id = ?').all(group.id);
  const byExpense = new Map();
  for (const s of shares) byExpense.set(s.expense_id, { ...byExpense.get(s.expense_id), [s.member_id]: s.share });
  const settlements = db.prepare('SELECT * FROM group_settlements WHERE group_id = ? ORDER BY date DESC, id DESC').all(group.id);
  const bal = balances(
    members.map((m) => m.id),
    expenses.map((e) => ({ paid_by: e.paid_by, amount: e.amount, shares: byExpense.get(e.id) ?? {} })),
    settlements.map((s) => ({ from: s.from_member, to: s.to_member, amount: s.amount })),
  );
  return {
    id: group.id, name: group.name,
    members: members.map((m) => ({ ...m, is_me: !!m.is_me, balance: fromCents(bal[m.id] ?? 0) })),
    expenses: expenses.map((e) => ({
      id: e.id, label: e.label, date: e.date, amount: fromCents(e.amount), paid_by: e.paid_by, split_mode: e.split_mode,
      transaction_id: e.transaction_id,
      shares: Object.entries(byExpense.get(e.id) ?? {}).map(([member_id, share]) => ({ member_id: Number(member_id), share: fromCents(share) })),
    })),
    settlements: settlements.map((s) => ({ id: s.id, from: s.from_member, to: s.to_member, amount: fromCents(s.amount), date: s.date })),
    suggestions: settleUp(bal).map((t) => ({ ...t, amount: fromCents(t.amount) })),
    total: fromCents(expenses.reduce((s, e) => s + e.amount, 0)),
  };
}

router.get('/api/groups', auth, wrap((req, res) => {
  const groups = db.prepare('SELECT * FROM groups WHERE user_id = ? ORDER BY id DESC').all(req.userId);
  res.json(groups.map((g) => {
    const d = groupDetail(g);
    return { id: d.id, name: d.name, members: d.members.map((m) => m.name), my_balance: d.members.find((m) => m.is_me)?.balance ?? 0, total: d.total };
  }));
}));

router.post('/api/groups', auth, wrap((req, res) => {
  const g = z.object({
    name: z.string().trim().min(1, 'Donne un nom au groupe (ex. Coloc, Vacances Maroc)').max(60, 'Nom trop long (60 caractères max)'),
    members: z.array(memberName, { error: 'Ajoute les prénoms des autres membres' }).min(1, 'Ajoute au moins une autre personne').max(30, '30 membres maximum'),
  }).parse(req.body);
  const me = db.prepare('SELECT name FROM users WHERE id = ?').get(req.userId).name;
  const insMember = db.prepare('INSERT INTO group_members (user_id, group_id, name, is_me) VALUES (?,?,?,?)');
  let id;
  db.transaction(() => {
    id = db.prepare('INSERT INTO groups (user_id, name) VALUES (?,?)').run(req.userId, g.name).lastInsertRowid;
    insMember.run(req.userId, id, me, 1);
    for (const name of new Set(g.members)) insMember.run(req.userId, id, name, 0);
  })();
  res.status(201).json(groupDetail(groupOf(id, req.userId)));
}));

router.get('/api/groups/:id', auth, wrap((req, res) => {
  const g = groupOf(req.params.id, req.userId);
  if (!g) return res.status(404).json({ error: 'Groupe introuvable' });
  res.json(groupDetail(g));
}));

router.put('/api/groups/:id', auth, wrap((req, res) => {
  if (!owns('groups', req.params.id, req.userId)) return res.status(404).json({ error: 'Groupe introuvable' });
  const { name } = z.object({ name: z.string().trim().min(1, 'Nom requis').max(60, 'Nom trop long (60 caractères max)') }).parse(req.body);
  db.prepare('UPDATE groups SET name = ? WHERE id = ?').run(name, req.params.id);
  res.json({ ok: true });
}));

// supprimer un groupe garde les opérations déjà créées sur tes comptes (ta part a bien été dépensée)
router.delete('/api/groups/:id', auth, wrap((req, res) => {
  if (!owns('groups', req.params.id, req.userId)) return res.status(404).json({ error: 'Groupe introuvable' });
  db.prepare('DELETE FROM groups WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

router.post('/api/groups/:id/members', auth, wrap((req, res) => {
  if (!owns('groups', req.params.id, req.userId)) return res.status(404).json({ error: 'Groupe introuvable' });
  const { name } = z.object({ name: memberName }).parse(req.body);
  const { lastInsertRowid: id } = db.prepare('INSERT INTO group_members (user_id, group_id, name) VALUES (?,?,?)').run(req.userId, req.params.id, name);
  res.status(201).json({ id });
}));

router.delete('/api/groups/:id/members/:memberId', auth, wrap((req, res) => {
  const m = db.prepare('SELECT * FROM group_members WHERE id = ? AND group_id = ? AND user_id = ?').get(req.params.memberId, req.params.id, req.userId);
  if (!m) return res.status(404).json({ error: 'Membre introuvable' });
  if (m.is_me) return res.status(400).json({ error: 'Tu ne peux pas te retirer de ton propre groupe' });
  const used = db.prepare(`SELECT 1 FROM group_expenses WHERE paid_by = ? UNION SELECT 1 FROM group_expense_shares WHERE member_id = ?
    UNION SELECT 1 FROM group_settlements WHERE from_member = ? OR to_member = ?`).get(m.id, m.id, m.id, m.id);
  if (used) return res.status(400).json({ error: `${m.name} a des dépenses dans ce groupe : supprime-les d'abord` });
  db.prepare('DELETE FROM group_members WHERE id = ?').run(m.id);
  res.json({ ok: true });
}));

const expenseSchema = z.object({
  label: z.string().trim().min(1, 'Libellé requis').max(120, 'Libellé trop long (120 caractères max)'),
  date: isoDate('Date invalide'),
  amount: z.coerce.number({ error: 'Montant invalide' }).positive('Le montant doit être positif'),
  paid_by: z.coerce.number({ error: 'Indique qui a payé' }).int(),
  split_mode: z.enum(['equal', 'percent', 'amounts'], { error: 'Répartition : parts égales, pourcentages ou montants' }).default('equal'),
  // equal : ids des participants ; percent : { id: % } ; amounts : { id: euros }
  participants: z.array(z.coerce.number().int()).optional(),
  values: z.record(z.string(), z.coerce.number({ error: 'Part invalide' })).optional(),
  account_id: z.coerce.number().int().nullable().optional(),
  category_id: z.coerce.number().int().nullable().optional(),
});

router.post('/api/groups/:id/expenses', auth, wrap((req, res) => {
  const g = groupOf(req.params.id, req.userId);
  if (!g) return res.status(404).json({ error: 'Groupe introuvable' });
  const e = expenseSchema.parse(req.body);
  const members = membersOf(g.id);
  const ids = new Set(members.map((m) => m.id));
  const me = members.find((m) => m.is_me);
  if (!ids.has(e.paid_by)) return res.status(400).json({ error: 'Choisis qui a payé parmi les membres du groupe' });
  const total = toCents(e.amount);
  const values = e.split_mode === 'equal'
    ? (e.participants ?? [...ids])
    : Object.fromEntries(Object.entries(e.values ?? {}).map(([id, v]) => [id, e.split_mode === 'amounts' ? toCents(v) : v]));
  const memberIds = e.split_mode === 'equal' ? values : Object.keys(values).map(Number);
  if (memberIds.some((id) => !ids.has(Number(id)))) return res.status(400).json({ error: 'Une part concerne quelqu’un qui n’est pas dans le groupe' });
  const split = splitExpense(total, e.split_mode, values);
  if (split.error) return res.status(400).json({ error: split.error });

  // payé par moi : une opération normale sur mon compte, pour ma part seulement ; le reste est une créance
  const myShare = split.shares[me.id] ?? 0;
  const iPaid = e.paid_by === me.id;
  if (iPaid && myShare > 0) {
    if (!e.account_id) return res.status(400).json({ error: 'Choisis le compte qui a payé' });
    const err = checkTxRefs(e, req.userId);
    if (err) return res.status(400).json({ error: err });
  }
  let id;
  db.transaction(() => {
    const txId = iPaid && myShare > 0
      ? db.prepare('INSERT INTO transactions (user_id, account_id, category_id, amount, label, date) VALUES (?,?,?,?,?,?)')
        .run(req.userId, e.account_id, e.category_id || null, -myShare, `${e.label} (${g.name}, ma part)`, e.date).lastInsertRowid
      : null;
    id = db.prepare(`INSERT INTO group_expenses (user_id, group_id, label, date, amount, paid_by, split_mode, transaction_id)
      VALUES (?,?,?,?,?,?,?,?)`).run(req.userId, g.id, e.label, e.date, total, e.paid_by, e.split_mode, txId).lastInsertRowid;
    const ins = db.prepare('INSERT INTO group_expense_shares (expense_id, member_id, share) VALUES (?,?,?)');
    for (const [memberId, share] of Object.entries(split.shares)) ins.run(id, memberId, share);
  })();
  res.status(201).json(groupDetail(g));
}));

// supprimer une dépense supprime aussi l'opération de ma part qu'elle avait créée
router.delete('/api/groups/:id/expenses/:expenseId', auth, wrap((req, res) => {
  const g = groupOf(req.params.id, req.userId);
  const e = g && db.prepare('SELECT * FROM group_expenses WHERE id = ? AND group_id = ?').get(req.params.expenseId, g.id);
  if (!e) return res.status(404).json({ error: 'Dépense introuvable' });
  db.transaction(() => {
    db.prepare('DELETE FROM group_expenses WHERE id = ?').run(e.id);
    if (e.transaction_id) db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(e.transaction_id, req.userId);
  })();
  res.json(groupDetail(g));
}));

// « Marquer comme remboursé »
router.post('/api/groups/:id/settlements', auth, wrap((req, res) => {
  const g = groupOf(req.params.id, req.userId);
  if (!g) return res.status(404).json({ error: 'Groupe introuvable' });
  const s = z.object({
    from: z.coerce.number().int(),
    to: z.coerce.number().int(),
    amount: z.coerce.number({ error: 'Montant invalide' }).positive('Le montant doit être positif'),
    date: isoDate('Date invalide').optional(),
  }).parse(req.body);
  const ids = new Set(membersOf(g.id).map((m) => m.id));
  if (!ids.has(s.from) || !ids.has(s.to)) return res.status(400).json({ error: 'Membre invalide' });
  if (s.from === s.to) return res.status(400).json({ error: 'Choisis deux personnes différentes' });
  db.prepare('INSERT INTO group_settlements (user_id, group_id, from_member, to_member, amount, date) VALUES (?,?,?,?,?,?)')
    .run(req.userId, g.id, s.from, s.to, toCents(s.amount), s.date ?? localToday());
  res.status(201).json(groupDetail(g));
}));

router.delete('/api/groups/:id/settlements/:settlementId', auth, wrap((req, res) => {
  const g = groupOf(req.params.id, req.userId);
  const { changes } = g ? db.prepare('DELETE FROM group_settlements WHERE id = ? AND group_id = ?').run(req.params.settlementId, g.id) : { changes: 0 };
  if (!changes) return res.status(404).json({ error: 'Remboursement introuvable' });
  res.json(groupDetail(g));
}));

module.exports = router;
