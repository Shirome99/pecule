// Opérations : liste filtrée, création, modification, suppression, import en masse et export CSV.
const express = require('express');
const { z } = require('zod');
const { db } = require('../db');
const { wrap, toCents, fromCents, isoDate, auth, owns, checkTxRefs, view } = require('../lib');
const { getTransferLines, saveTransfer } = require('../transfers');
const { remember } = require('../undo');
const { rulesOf, autoCategory, ruleSuggestion } = require('../categorize');
const { normalizeTags } = require('../tags');

const router = express.Router();

const txSchema = z.object({
  account_id: z.coerce.number().int(),
  category_id: z.coerce.number().int().nullable().optional(),
  amount: z.coerce.number().positive('Le montant doit être positif'),
  type: z.enum(['expense', 'income']),
  label: z.string().trim().min(1, 'Libellé requis'),
  date: isoDate('Date invalide'),
  tags: z.array(z.string().max(40, 'Tag trop long (40 caractères max)'), { error: 'Tags : une liste de mots' })
    .max(10, '10 tags maximum par opération').optional(),
});

/** Remplace les tags d'une opération (créés au besoin, noms normalisés). */
function setTags(userId, txId, names) {
  const tags = normalizeTags(names);
  const insTag = db.prepare('INSERT OR IGNORE INTO tags (user_id, name) VALUES (?,?)');
  const tagId = db.prepare('SELECT id FROM tags WHERE user_id = ? AND name = ?');
  const link = db.prepare('INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?,?)');
  db.transaction(() => {
    db.prepare('DELETE FROM transaction_tags WHERE transaction_id = ?').run(txId);
    for (const name of tags) {
      insTag.run(userId, name);
      link.run(txId, tagId.get(userId, name).id);
    }
  })();
}

/** Opérations filtrées (mois, période, compte, catégorie, tag, texte). */
function listTransactions(userId, query = {}) {
  const { month, account_id, category_id, q, limit, from, to, tag } = query;
  const where = ['t.user_id = ?'];
  const params = [userId];
  if (month) { where.push("substr(t.date,1,7) = ?"); params.push(month); }
  if (from) { where.push('t.date >= ?'); params.push(from); }
  if (to) { where.push('t.date <= ?'); params.push(to); }
  if (account_id) { where.push('t.account_id = ?'); params.push(account_id); }
  // sans filtre de compte, un virement n'apparaît qu'une fois (ligne de sortie)
  else where.push('(t.transfer_id IS NULL OR t.amount < 0)');
  if (category_id) { where.push('t.category_id = ?'); params.push(category_id); }
  if (q) { where.push('t.label LIKE ?'); params.push(`%${q}%`); }
  if (tag) {
    where.push('t.id IN (SELECT tt.transaction_id FROM transaction_tags tt JOIN tags g ON g.id = tt.tag_id WHERE g.user_id = ? AND g.name = ?)');
    params.push(userId, String(tag));
  }
  const rows = db.prepare(`
    SELECT t.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon, a.name AS account_name,
      p.account_id AS peer_account_id, pa.name AS peer_account_name,
      (SELECT group_concat(g.name, ' ') FROM transaction_tags tt JOIN tags g ON g.id = tt.tag_id WHERE tt.transaction_id = t.id) AS tag_list
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    JOIN accounts a ON a.id = t.account_id
    LEFT JOIN transactions p ON p.transfer_id = t.transfer_id AND p.id <> t.id
    LEFT JOIN accounts pa ON pa.id = p.account_id
    WHERE ${where.join(' AND ')}
    ORDER BY t.date DESC, t.id DESC
    LIMIT ?`).all(...params, Math.min(Number(limit) || 500, 2000));
  return rows.map(({ tag_list, ...r }) => ({ ...r, amount: fromCents(r.amount), tags: tag_list ? tag_list.split(' ').sort() : [] }));
}

router.get('/api/transactions', auth, view(listTransactions));

router.post('/api/transactions', auth, wrap((req, res) => {
  const t = txSchema.parse(req.body);
  const err = checkTxRefs(t, req.userId);
  if (err) return res.status(400).json({ error: err });
  const cents = toCents(t.amount) * (t.type === 'expense' ? -1 : 1);
  // sans catégorie choisie, les règles de l'utilisateur en proposent une
  const categoryId = t.category_id || autoCategory(req.userId, t.label, cents);
  const { lastInsertRowid: id } = db.prepare(
    'INSERT INTO transactions (user_id, account_id, category_id, amount, label, date) VALUES (?,?,?,?,?,?)'
  ).run(req.userId, t.account_id, categoryId, cents, t.label, t.date);
  if (t.tags) setTags(req.userId, id, t.tags);
  // catégorie choisie à la main : proposer d'en faire une règle si une opération semblable a la même
  res.status(201).json({ id, category_id: categoryId, suggestion: t.category_id ? ruleSuggestion(req.userId, id) : null });
}));

router.put('/api/transactions/:id', auth, wrap((req, res) => {
  if (!owns('transactions', req.params.id, req.userId)) return res.status(404).json({ error: 'Opération introuvable' });
  const t = txSchema.parse(req.body);
  const err = checkTxRefs(t, req.userId);
  if (err) return res.status(400).json({ error: err });
  const current = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  if (current.transfer_id) {
    // ligne d'un virement : on répercute sur les deux lignes, le type est ignoré
    const peer = getTransferLines(current.transfer_id, req.userId).find((l) => l.id !== current.id);
    const isSource = current.amount < 0;
    const result = saveTransfer(req.userId, {
      from_account_id: isSource ? t.account_id : peer.account_id,
      to_account_id: isSource ? peer.account_id : t.account_id,
      amount: t.amount, date: t.date, label: t.label,
    }, current.transfer_id);
    if (result.error) return res.status(400).json({ error: result.error });
    return res.json({ ok: true });
  }
  const cents = toCents(t.amount) * (t.type === 'expense' ? -1 : 1);
  // une occurrence récurrente déplacée à une autre date n'est plus rattachée à sa règle
  db.prepare(`UPDATE transactions SET account_id=?, category_id=?, amount=?, label=?, date=?,
    recurring_id = CASE WHEN date = ? THEN recurring_id ELSE NULL END WHERE id=?`)
    .run(t.account_id, t.category_id || null, cents, t.label, t.date, t.date, req.params.id);
  if (t.tags) setTags(req.userId, current.id, t.tags);
  const recategorized = t.category_id && t.category_id !== current.category_id;
  res.json({ ok: true, suggestion: recategorized ? ruleSuggestion(req.userId, current.id) : null });
}));

router.delete('/api/transactions/:id', auth, wrap((req, res) => {
  if (!owns('transactions', req.params.id, req.userId)) return res.status(404).json({ error: 'Opération introuvable' });
  const { transfer_id } = db.prepare('SELECT transfer_id FROM transactions WHERE id = ?').get(req.params.id);
  // annulation : les lignes supprimées (les deux d'un virement) sont gardées pour être réinsérées à l'identique
  const lines = transfer_id
    ? db.prepare('SELECT * FROM transactions WHERE transfer_id = ? AND user_id = ?').all(transfer_id, req.userId)
    : db.prepare('SELECT * FROM transactions WHERE id = ?').all(req.params.id);
  const undo = remember(req.userId, {
    transactions: lines,
    transaction_tags: db.prepare(`SELECT * FROM transaction_tags WHERE transaction_id IN (${lines.map(() => '?').join(',')})`).all(...lines.map((l) => l.id)),
  });
  if (transfer_id) db.prepare('DELETE FROM transactions WHERE transfer_id = ? AND user_id = ?').run(transfer_id, req.userId);
  else db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
  res.json({ ok: true, undo });
}));

// import en masse (CSV analysé côté client) : montants signés en euros, une seule transaction SQL
const bulkSchema = z.object({
  account_id: z.coerce.number().int(),
  rows: z.array(z.object({
    date: isoDate('Date invalide (attendu AAAA-MM-JJ)'),
    label: z.string().trim().min(1, 'Libellé requis').max(300, 'Libellé trop long (300 caractères max)'),
    amount: z.number({ error: 'Montant invalide' }).refine((n) => Number.isFinite(n) && n !== 0, 'Montant nul ou invalide'),
    category_id: z.number().int().nullable().optional(),
  })).min(1, 'Aucune ligne à importer').max(2000, '2000 lignes maximum par import : découpe ton fichier'),
});

router.post('/api/transactions/bulk', auth, wrap((req, res) => {
  const { account_id, rows } = bulkSchema.parse(req.body);
  if (!owns('accounts', account_id, req.userId)) return res.status(400).json({ error: 'Compte invalide' });
  const cats = [...new Set(rows.map((r) => r.category_id).filter(Boolean))];
  if (cats.some((id) => !owns('categories', id, req.userId))) return res.status(400).json({ error: 'Catégorie invalide' });
  const ins = db.prepare('INSERT INTO transactions (user_id, account_id, category_id, amount, label, date) VALUES (?,?,?,?,?,?)');
  db.transaction(() => {
    // lignes sans catégorie : les règles de l'utilisateur s'appliquent
    const rules = rulesOf(req.userId);
    for (const r of rows) {
      const cents = toCents(r.amount);
      ins.run(req.userId, account_id, r.category_id || autoCategory(req.userId, r.label, cents, rules), cents, r.label, r.date);
    }
  })();
  res.status(201).json({ inserted: rows.length });
}));

// ---------- export CSV ----------
router.get('/api/export.csv', auth, wrap((req, res) => {
  const rows = db.prepare(`
    SELECT t.date, t.label, t.amount, CASE WHEN t.transfer_id IS NOT NULL THEN 'Virement' ELSE c.name END AS category,
      a.name AS account
    FROM transactions t LEFT JOIN categories c ON c.id = t.category_id JOIN accounts a ON a.id = t.account_id
    WHERE t.user_id = ? ORDER BY t.date DESC, t.id DESC`).all(req.userId);
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const csv = ['date;libelle;montant;categorie;compte']
    .concat(rows.map((r) => [r.date, esc(r.label), fromCents(r.amount).toFixed(2).replace('.', ','), esc(r.category), esc(r.account)].join(';')))
    .join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
  res.send('﻿' + csv);
}));

module.exports = Object.assign(router, { listTransactions });
