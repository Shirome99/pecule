const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { z } = require('zod');
const { db, seedUser } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.use(express.json());

// ---------- helpers ----------
const wrap = (fn) => (req, res) => {
  try { fn(req, res); }
  catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues[0]?.message || 'Données invalides' });
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
const toCents = (n) => Math.round(Number(n) * 100);
const fromCents = (c) => c / 100;
const sign = (u) => jwt.sign({ id: u.id }, JWT_SECRET, { expiresIn: '30d' });
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, currency: u.currency });

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  try {
    req.userId = jwt.verify(token, JWT_SECRET).id;
    next();
  } catch {
    res.status(401).json({ error: 'Session expirée' });
  }
}

// vérifie qu'une ressource appartient bien à l'utilisateur
const owns = (table, id, userId) =>
  !!db.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND user_id = ?`).get(id, userId);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---------- auth ----------
const registerSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis'),
  email: z.string().trim().toLowerCase().email('Email invalide'),
  password: z.string().min(6, 'Mot de passe : 6 caractères minimum'),
});

app.post('/api/auth/register', wrap((req, res) => {
  const { name, email, password } = registerSchema.parse(req.body);
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email))
    return res.status(409).json({ error: 'Cet email est déjà utilisé' });
  const hash = bcrypt.hashSync(password, 10);
  const { lastInsertRowid: id } = db
    .prepare('INSERT INTO users (email, name, password_hash) VALUES (?,?,?)')
    .run(email, name, hash);
  seedUser(id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.status(201).json({ token: sign(user), user: publicUser(user) });
}));

app.post('/api/auth/login', wrap((req, res) => {
  const { email, password } = z.object({
    email: z.string().trim().toLowerCase(),
    password: z.string(),
  }).parse(req.body);
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  res.json({ token: sign(user), user: publicUser(user) });
}));

app.get('/api/me', auth, wrap((req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
  res.json(publicUser(user));
}));

// ---------- accounts ----------
const accountSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis'),
  type: z.enum(['courant', 'epargne', 'especes', 'carte']).default('courant'),
  initial_balance: z.coerce.number().default(0),
});

app.get('/api/accounts', auth, wrap((req, res) => {
  const rows = db.prepare(`
    SELECT a.*, a.initial_balance + COALESCE(SUM(t.amount), 0) AS balance
    FROM accounts a LEFT JOIN transactions t ON t.account_id = a.id
    WHERE a.user_id = ? GROUP BY a.id ORDER BY a.id`).all(req.userId);
  res.json(rows.map((r) => ({ ...r, initial_balance: fromCents(r.initial_balance), balance: fromCents(r.balance) })));
}));

app.post('/api/accounts', auth, wrap((req, res) => {
  const a = accountSchema.parse(req.body);
  const { lastInsertRowid } = db.prepare('INSERT INTO accounts (user_id, name, type, initial_balance) VALUES (?,?,?,?)')
    .run(req.userId, a.name, a.type, toCents(a.initial_balance));
  res.status(201).json({ id: lastInsertRowid });
}));

app.put('/api/accounts/:id', auth, wrap((req, res) => {
  if (!owns('accounts', req.params.id, req.userId)) return res.status(404).json({ error: 'Compte introuvable' });
  const a = accountSchema.parse(req.body);
  db.prepare('UPDATE accounts SET name=?, type=?, initial_balance=? WHERE id=?')
    .run(a.name, a.type, toCents(a.initial_balance), req.params.id);
  res.json({ ok: true });
}));

app.delete('/api/accounts/:id', auth, wrap((req, res) => {
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

// ---------- categories ----------
const categorySchema = z.object({
  name: z.string().trim().min(1, 'Nom requis'),
  kind: z.enum(['expense', 'income']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6b7280'),
  icon: z.string().max(8).default('•'),
});

app.get('/api/categories', auth, wrap((req, res) => {
  res.json(db.prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY kind, name').all(req.userId));
}));

app.post('/api/categories', auth, wrap((req, res) => {
  const c = categorySchema.parse(req.body);
  const { lastInsertRowid } = db.prepare('INSERT INTO categories (user_id, name, kind, color, icon) VALUES (?,?,?,?,?)')
    .run(req.userId, c.name, c.kind, c.color, c.icon);
  res.status(201).json({ id: lastInsertRowid });
}));

app.delete('/api/categories/:id', auth, wrap((req, res) => {
  if (!owns('categories', req.params.id, req.userId)) return res.status(404).json({ error: 'Catégorie introuvable' });
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

// ---------- transactions ----------
const txSchema = z.object({
  account_id: z.coerce.number().int(),
  category_id: z.coerce.number().int().nullable().optional(),
  amount: z.coerce.number().positive('Le montant doit être positif'),
  type: z.enum(['expense', 'income']),
  label: z.string().trim().min(1, 'Libellé requis'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide'),
});

function checkTxRefs(t, userId) {
  if (!owns('accounts', t.account_id, userId)) return 'Compte invalide';
  if (t.category_id && !owns('categories', t.category_id, userId)) return 'Catégorie invalide';
  return null;
}

app.get('/api/transactions', auth, wrap((req, res) => {
  const { month, account_id, category_id, q, limit } = req.query;
  const where = ['t.user_id = ?'];
  const params = [req.userId];
  if (month) { where.push("substr(t.date,1,7) = ?"); params.push(month); }
  if (account_id) { where.push('t.account_id = ?'); params.push(account_id); }
  // sans filtre de compte, un virement n'apparaît qu'une fois (ligne de sortie)
  else where.push('(t.transfer_id IS NULL OR t.amount < 0)');
  if (category_id) { where.push('t.category_id = ?'); params.push(category_id); }
  if (q) { where.push('t.label LIKE ?'); params.push(`%${q}%`); }
  const rows = db.prepare(`
    SELECT t.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon, a.name AS account_name,
      p.account_id AS peer_account_id, pa.name AS peer_account_name
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    JOIN accounts a ON a.id = t.account_id
    LEFT JOIN transactions p ON p.transfer_id = t.transfer_id AND p.id <> t.id
    LEFT JOIN accounts pa ON pa.id = p.account_id
    WHERE ${where.join(' AND ')}
    ORDER BY t.date DESC, t.id DESC
    LIMIT ?`).all(...params, Math.min(Number(limit) || 500, 2000));
  res.json(rows.map((r) => ({ ...r, amount: fromCents(r.amount) })));
}));

app.post('/api/transactions', auth, wrap((req, res) => {
  const t = txSchema.parse(req.body);
  const err = checkTxRefs(t, req.userId);
  if (err) return res.status(400).json({ error: err });
  const cents = toCents(t.amount) * (t.type === 'expense' ? -1 : 1);
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO transactions (user_id, account_id, category_id, amount, label, date) VALUES (?,?,?,?,?,?)'
  ).run(req.userId, t.account_id, t.category_id || null, cents, t.label, t.date);
  res.status(201).json({ id: lastInsertRowid });
}));

app.put('/api/transactions/:id', auth, wrap((req, res) => {
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
  db.prepare('UPDATE transactions SET account_id=?, category_id=?, amount=?, label=?, date=? WHERE id=?')
    .run(t.account_id, t.category_id || null, cents, t.label, t.date, req.params.id);
  res.json({ ok: true });
}));

app.delete('/api/transactions/:id', auth, wrap((req, res) => {
  if (!owns('transactions', req.params.id, req.userId)) return res.status(404).json({ error: 'Opération introuvable' });
  const { transfer_id } = db.prepare('SELECT transfer_id FROM transactions WHERE id = ?').get(req.params.id);
  if (transfer_id) db.prepare('DELETE FROM transactions WHERE transfer_id = ? AND user_id = ?').run(transfer_id, req.userId);
  else db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

// ---------- virements ----------
const transferSchema = z.object({
  from_account_id: z.coerce.number({ error: 'Choisis le compte de départ' }).int(),
  to_account_id: z.coerce.number({ error: "Choisis le compte d'arrivée" }).int(),
  amount: z.coerce.number().positive('Le montant doit être positif'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide'),
  label: z.string().trim().optional(),
});

const getTransferLines = (transferId, userId) =>
  db.prepare('SELECT * FROM transactions WHERE transfer_id = ? AND user_id = ? ORDER BY amount').all(transferId, userId);

/** Crée (ou remplace si transferId est fourni) les deux lignes d'un virement, dans une transaction SQL. */
function saveTransfer(userId, t, transferId = null) {
  if (t.from_account_id === t.to_account_id) return { error: 'Choisis deux comptes différents' };
  if (!owns('accounts', t.from_account_id, userId) || !owns('accounts', t.to_account_id, userId))
    return { error: 'Compte invalide' };
  const cents = toCents(t.amount);
  const label = t.label || 'Virement';
  if (transferId) {
    const [out, inc] = getTransferLines(transferId, userId); // triées par montant : sortie puis entrée
    const upd = db.prepare('UPDATE transactions SET account_id=?, category_id=NULL, amount=?, label=?, date=? WHERE id=?');
    db.transaction(() => {
      upd.run(t.from_account_id, -cents, label, t.date, out.id);
      upd.run(t.to_account_id, cents, label, t.date, inc.id);
    })();
    return { transfer_id: transferId };
  }
  const id = crypto.randomUUID();
  const ins = db.prepare(
    'INSERT INTO transactions (user_id, account_id, category_id, amount, label, date, transfer_id) VALUES (?,?,NULL,?,?,?,?)'
  );
  db.transaction(() => {
    ins.run(userId, t.from_account_id, -cents, label, t.date, id);
    ins.run(userId, t.to_account_id, cents, label, t.date, id);
  })();
  return { transfer_id: id };
}

app.post('/api/transfers', auth, wrap((req, res) => {
  const result = saveTransfer(req.userId, transferSchema.parse(req.body));
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json(result);
}));

app.put('/api/transfers/:transferId', auth, wrap((req, res) => {
  if (getTransferLines(req.params.transferId, req.userId).length === 0)
    return res.status(404).json({ error: 'Virement introuvable' });
  const result = saveTransfer(req.userId, transferSchema.parse(req.body), req.params.transferId);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ ok: true });
}));

app.delete('/api/transfers/:transferId', auth, wrap((req, res) => {
  const { changes } = db.prepare('DELETE FROM transactions WHERE transfer_id = ? AND user_id = ?')
    .run(req.params.transferId, req.userId);
  if (!changes) return res.status(404).json({ error: 'Virement introuvable' });
  res.json({ ok: true });
}));

// ---------- budgets ----------
app.get('/api/budgets', auth, wrap((req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const rows = db.prepare(`
    SELECT b.id, b.category_id, b.monthly_limit, c.name, c.color, c.icon,
      COALESCE((SELECT -SUM(t.amount) FROM transactions t
        WHERE t.category_id = b.category_id AND t.user_id = b.user_id
          AND substr(t.date,1,7) = ? AND t.amount < 0 AND t.transfer_id IS NULL), 0) AS spent
    FROM budgets b JOIN categories c ON c.id = b.category_id
    WHERE b.user_id = ? ORDER BY c.name`).all(month, req.userId);
  res.json(rows.map((r) => ({ ...r, monthly_limit: fromCents(r.monthly_limit), spent: fromCents(r.spent) })));
}));

app.post('/api/budgets', auth, wrap((req, res) => {
  const b = z.object({
    category_id: z.coerce.number().int(),
    monthly_limit: z.coerce.number().positive('Le plafond doit être positif'),
  }).parse(req.body);
  if (!owns('categories', b.category_id, req.userId)) return res.status(400).json({ error: 'Catégorie invalide' });
  db.prepare(`INSERT INTO budgets (user_id, category_id, monthly_limit) VALUES (?,?,?)
    ON CONFLICT(user_id, category_id) DO UPDATE SET monthly_limit = excluded.monthly_limit`)
    .run(req.userId, b.category_id, toCents(b.monthly_limit));
  res.status(201).json({ ok: true });
}));

app.delete('/api/budgets/:id', auth, wrap((req, res) => {
  if (!owns('budgets', req.params.id, req.userId)) return res.status(404).json({ error: 'Budget introuvable' });
  db.prepare('DELETE FROM budgets WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

// ---------- stats (dashboard) ----------
app.get('/api/stats', auth, wrap((req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const uid = req.userId;

  const totals = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount END),0) AS income,
           COALESCE(-SUM(CASE WHEN amount < 0 THEN amount END),0) AS expenses
    FROM transactions WHERE user_id = ? AND substr(date,1,7) = ? AND transfer_id IS NULL`).get(uid, month);

  const balance = db.prepare(`
    SELECT (SELECT COALESCE(SUM(initial_balance),0) FROM accounts WHERE user_id = ?)
         + (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE user_id = ?) AS total`).get(uid, uid).total;

  const byCategory = db.prepare(`
    SELECT c.id, COALESCE(c.name,'Sans catégorie') AS name, COALESCE(c.color,'#9ca3af') AS color,
           COALESCE(c.icon,'•') AS icon, -SUM(t.amount) AS total
    FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.user_id = ? AND substr(t.date,1,7) = ? AND t.amount < 0 AND t.transfer_id IS NULL
    GROUP BY c.id ORDER BY total DESC`).all(uid, month);

  // 6 derniers mois glissants jusqu'au mois sélectionné
  const [y, m] = month.split('-').map(Number);
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    months.push(d.toISOString().slice(0, 7));
  }
  const trendRows = db.prepare(`
    SELECT substr(date,1,7) AS month,
      COALESCE(SUM(CASE WHEN amount > 0 THEN amount END),0) AS income,
      COALESCE(-SUM(CASE WHEN amount < 0 THEN amount END),0) AS expenses
    FROM transactions WHERE user_id = ? AND substr(date,1,7) BETWEEN ? AND ? AND transfer_id IS NULL
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
  });
}));

// ---------- export CSV ----------
app.get('/api/export.csv', auth, wrap((req, res) => {
  const rows = db.prepare(`
    SELECT t.date, t.label, t.amount, c.name AS category, a.name AS account
    FROM transactions t LEFT JOIN categories c ON c.id = t.category_id JOIN accounts a ON a.id = t.account_id
    WHERE t.user_id = ? ORDER BY t.date DESC`).all(req.userId);
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const csv = ['date;libelle;montant;categorie;compte']
    .concat(rows.map((r) => [r.date, esc(r.label), fromCents(r.amount).toFixed(2).replace('.', ','), esc(r.category), esc(r.account)].join(';')))
    .join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
  res.send('﻿' + csv);
}));

// ---------- front buildé (prod) ----------
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get(/^\/(?!api).*/, (req, res, next) => {
  res.sendFile(path.join(clientDist, 'index.html'), (err) => err && next());
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`API sur http://localhost:${PORT}`));
}
module.exports = app;
