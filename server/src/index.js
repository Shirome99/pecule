const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { z } = require('zod');
const { db, seedUser } = require('./db');
const { generateRecurring, upcomingInMonth, nextOccurrence, localToday } = require('./recurring');
const { goalPlan } = require('./goals');
const { forecast } = require('./forecast');
const { detectSubscriptions, normalizeLabel } = require('./subscriptions');
const { addMonths } = require('./dates');
const { FAMILIES, ACCOUNT_TYPES, SPENDABLE, SAVINGS, familyOf, sqlList } = require('./accounts');
const { accountValueAt, investmentDetails, networthSeries, loanOf } = require('./wealth');
const amortization = require('./amortization');

// seules les liquidités entrent dans les revenus, dépenses, budgets, prévisions et le « Solde total »
const liquidTypes = sqlList(FAMILIES.liquid);
const { configErrors, rateLimit, corsOptions, DEFAULT_JWT_SECRET } = require('./security');

// en production, on refuse de démarrer avec une configuration dangereuse
const problems = configErrors(process.env);
if (problems.length) {
  for (const p of problems) console.error(`Configuration invalide : ${p}`);
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
const PORT = process.env.PORT || 4000;

const app = express();
// derrière un reverse proxy (nginx, Traefik…), TRUST_PROXY=1 pour lire la vraie IP du client
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'connect-src': ["'self'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
      'upgrade-insecure-requests': null, // le HTTPS est géré par le reverse proxy
    },
  },
}));
app.use(cors(corsOptions(process.env)));
app.use(express.json({ limit: '2mb' })); // import CSV : jusqu'à 2000 lignes
app.use('/api/auth', rateLimit({
  windowMs: 60_000,
  max: Number(process.env.AUTH_RATE_LIMIT) || 5,
  message: 'Trop de tentatives : réessaie dans une minute.',
}));

// ---------- helpers ----------
const wrap = (fn) => (req, res) => {
  try { fn(req, res); }
  catch (e) {
    if (e instanceof z.ZodError) {
      const issue = e.issues[0];
      // erreur dans un tableau de lignes (import) : on indique la ligne fautive
      const line = issue?.path[0] === 'rows' && typeof issue.path[1] === 'number' ? `Ligne ${issue.path[1] + 1} : ` : '';
      return res.status(400).json({ error: line + (issue?.message || 'Données invalides') });
    }
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
const toCents = (n) => Math.round(Number(n) * 100);
// date réelle au format YYYY-MM-DD (refuse 2026-02-30)
const isoDate = (msg) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msg)
  .refine((s) => { const d = new Date(`${s}T00:00:00Z`); return !isNaN(d) && d.toISOString().startsWith(s); }, msg);
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
  generateRecurring(user.id);
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
  type: z.enum(ACCOUNT_TYPES, { error: 'Type de compte inconnu' }).default('courant'),
  initial_balance: z.coerce.number().default(0),
});

app.get('/api/accounts', auth, wrap((req, res) => {
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

// ---------- placements : valorisations ----------
const investmentOf = (id, userId) => {
  const a = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(id, userId);
  return a && familyOf(a.type) === 'investment' ? a : null;
};

app.get('/api/accounts/:id/valuations', auth, wrap((req, res) => {
  if (!investmentOf(req.params.id, req.userId)) return res.status(404).json({ error: 'Placement introuvable' });
  const rows = db.prepare('SELECT id, date, value FROM valuations WHERE account_id = ? ORDER BY date DESC').all(req.params.id);
  res.json(rows.map((v) => ({ ...v, value: fromCents(v.value) })));
}));

app.post('/api/accounts/:id/valuations', auth, wrap((req, res) => {
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

app.delete('/api/valuations/:id', auth, wrap((req, res) => {
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

app.get('/api/accounts/:id/loan', auth, wrap((req, res) => {
  const loan = db.prepare('SELECT * FROM loans WHERE account_id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!loan) return res.status(404).json({ error: 'Crédit introuvable' });
  res.json(loanOut(loan));
}));

app.put('/api/accounts/:id/loan', auth, wrap((req, res) => {
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

app.get('/api/loans/:id/schedule', auth, wrap((req, res) => {
  if (!owns('loans', req.params.id, req.userId)) return res.status(404).json({ error: 'Crédit introuvable' });
  const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(req.params.id);
  const rows = amortization.schedule(loan).map((r) => ({
    ...r, payment: fromCents(r.payment), interest: fromCents(r.interest), principal: fromCents(r.principal),
    insurance: fromCents(r.insurance), remaining: fromCents(r.remaining),
  }));
  res.json({ loan: loanOut(loan), schedule: rows });
}));

// ---------- patrimoine net ----------
app.get('/api/networth', auth, wrap((req, res) => {
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
  date: isoDate('Date invalide'),
});

function checkTxRefs(t, userId) {
  if (!owns('accounts', t.account_id, userId)) return 'Compte invalide';
  if (t.category_id && !owns('categories', t.category_id, userId)) return 'Catégorie invalide';
  return null;
}

app.get('/api/transactions', auth, wrap((req, res) => {
  const { month, account_id, category_id, q, limit, from, to } = req.query;
  const where = ['t.user_id = ?'];
  const params = [req.userId];
  if (month) { where.push("substr(t.date,1,7) = ?"); params.push(month); }
  if (from) { where.push('t.date >= ?'); params.push(from); }
  if (to) { where.push('t.date <= ?'); params.push(to); }
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
  // une occurrence récurrente déplacée à une autre date n'est plus rattachée à sa règle
  db.prepare(`UPDATE transactions SET account_id=?, category_id=?, amount=?, label=?, date=?,
    recurring_id = CASE WHEN date = ? THEN recurring_id ELSE NULL END WHERE id=?`)
    .run(t.account_id, t.category_id || null, cents, t.label, t.date, t.date, req.params.id);
  res.json({ ok: true });
}));

app.delete('/api/transactions/:id', auth, wrap((req, res) => {
  if (!owns('transactions', req.params.id, req.userId)) return res.status(404).json({ error: 'Opération introuvable' });
  const { transfer_id } = db.prepare('SELECT transfer_id FROM transactions WHERE id = ?').get(req.params.id);
  if (transfer_id) db.prepare('DELETE FROM transactions WHERE transfer_id = ? AND user_id = ?').run(transfer_id, req.userId);
  else db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
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

app.post('/api/transactions/bulk', auth, wrap((req, res) => {
  const { account_id, rows } = bulkSchema.parse(req.body);
  if (!owns('accounts', account_id, req.userId)) return res.status(400).json({ error: 'Compte invalide' });
  const cats = [...new Set(rows.map((r) => r.category_id).filter(Boolean))];
  if (cats.some((id) => !owns('categories', id, req.userId))) return res.status(400).json({ error: 'Catégorie invalide' });
  const ins = db.prepare('INSERT INTO transactions (user_id, account_id, category_id, amount, label, date) VALUES (?,?,?,?,?,?)');
  db.transaction(() => {
    for (const r of rows) ins.run(req.userId, account_id, r.category_id || null, toCents(r.amount), r.label, r.date);
  })();
  res.status(201).json({ inserted: rows.length });
}));

// ---------- virements ----------
const transferSchema = z.object({
  from_account_id: z.coerce.number({ error: 'Choisis le compte de départ' }).int(),
  to_account_id: z.coerce.number({ error: "Choisis le compte d'arrivée" }).int(),
  amount: z.coerce.number().positive('Le montant doit être positif'),
  date: isoDate('Date invalide'),
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

// ---------- opérations récurrentes ----------
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

app.get('/api/recurring', auth, wrap((req, res) => {
  const rows = db.prepare(`
    SELECT r.*, a.name AS account_name, ta.name AS to_account_name,
      c.name AS category_name, c.color AS category_color, c.icon AS category_icon
    FROM recurring r JOIN accounts a ON a.id = r.account_id LEFT JOIN accounts ta ON ta.id = r.to_account_id
    LEFT JOIN categories c ON c.id = r.category_id
    WHERE r.user_id = ? ORDER BY r.paused, r.label`).all(req.userId);
  res.json(rows.map(recurringOut));
}));

app.post('/api/recurring', auth, wrap((req, res) => {
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

app.put('/api/recurring/:id', auth, wrap((req, res) => {
  if (!owns('recurring', req.params.id, req.userId)) return res.status(404).json({ error: 'Opération récurrente introuvable' });
  const { paused } = z.object({ paused: z.boolean({ error: 'Indique paused : true ou false' }) }).parse(req.body);
  // à la reprise, la période de pause n'est pas rattrapée
  if (paused) db.prepare('UPDATE recurring SET paused = 1 WHERE id = ?').run(req.params.id);
  else db.prepare('UPDATE recurring SET paused = 0, last_generated = MAX(COALESCE(last_generated, ?), ?) WHERE id = ?')
    .run(localToday(), localToday(), req.params.id);
  res.json({ ok: true });
}));

app.delete('/api/recurring/:id', auth, wrap((req, res) => {
  if (!owns('recurring', req.params.id, req.userId)) return res.status(404).json({ error: 'Opération récurrente introuvable' });
  // les opérations déjà générées restent (recurring_id passe à NULL)
  db.prepare('DELETE FROM recurring WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

// ---------- prévision de fin de mois ----------
app.get('/api/forecast', auth, wrap((req, res) => {
  const uid = req.userId;
  const now = localToday();
  const month = req.query.month || now.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'Mois invalide (attendu AAAA-MM)' });
  if (month > now.slice(0, 7)) return res.status(400).json({ error: 'La prévision ne porte que sur le mois en cours' });
  generateRecurring(uid);

  const liquid = sqlList(FAMILIES.liquid);
  const from = addMonths(`${month}-01`, -3);
  const transactions = db.prepare(`
    SELECT t.date, t.amount, t.transfer_id, t.recurring_id FROM transactions t JOIN accounts a ON a.id = t.account_id
    WHERE t.user_id = ? AND a.type IN ${liquid} AND t.date >= ? AND substr(t.date,1,7) <= ?`).all(uid, from, month);
  const firstDate = db.prepare(`SELECT MIN(t.date) d FROM transactions t JOIN accounts a ON a.id = t.account_id
    WHERE t.user_id = ? AND a.type IN ${liquid}`).get(uid).d;
  const rules = db.prepare(`
    SELECT r.*, a.type AS from_type, ta.type AS to_type FROM recurring r
    JOIN accounts a ON a.id = r.account_id LEFT JOIN accounts ta ON ta.id = r.to_account_id
    WHERE r.user_id = ? AND r.paused = 0`).all(uid)
    // une récurrence (hors virement) sur un placement ou une dette ne compte pas dans le budget
    .filter((r) => r.to_account_id || FAMILIES.liquid.includes(r.from_type))
    .map((r) => ({
      ...r,
      from_spendable: SPENDABLE.includes(r.from_type),
      to_spendable: SPENDABLE.includes(r.to_type),
      to_savings: SAVINGS.includes(r.to_type),
    }));
  const spendableBalance = db.prepare(`
    SELECT COALESCE(SUM(a.initial_balance + (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE account_id = a.id)), 0) AS b
    FROM accounts a WHERE a.user_id = ? AND a.type IN ${sqlList(SPENDABLE)}`).get(uid).b;

  const f = forecast({ now, month, transactions, firstDate, rules, spendableBalance });
  const euros = Object.fromEntries(Object.entries(f).map(([k, v]) =>
    [k, typeof v === 'number' && !['days_in_month', 'days_remaining', 'history_months'].includes(k) ? fromCents(v) : v]));
  res.json(euros);
}));

// ---------- abonnements détectés ----------
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

app.get('/api/subscriptions', auth, wrap((req, res) => {
  const cats = Object.fromEntries(db.prepare('SELECT * FROM categories WHERE user_id = ?').all(req.userId).map((c) => [c.id, c]));
  const accs = Object.fromEntries(db.prepare('SELECT id, name FROM accounts WHERE user_id = ?').all(req.userId).map((a) => [a.id, a.name]));
  const items = subscriptionsOf(req.userId).map((s) => ({
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
  res.json({ items, monthly_total: fromCents(Math.round(annual / 12)), annual_total: fromCents(annual) });
}));

const subscriptionKey = z.object({ key: z.string().trim().min(1, 'Abonnement manquant') });

app.post('/api/subscriptions/ignore', auth, wrap((req, res) => {
  const { key } = subscriptionKey.parse(req.body);
  db.prepare('INSERT OR IGNORE INTO subscription_ignores (user_id, label_norm) VALUES (?,?)').run(req.userId, normalizeLabel(key));
  res.status(201).json({ ok: true });
}));

// « Suivre comme récurrence » : crée la règle à partir de la prochaine échéance attendue (pas de doublon du passé)
app.post('/api/subscriptions/track', auth, wrap((req, res) => {
  const { key } = subscriptionKey.parse(req.body);
  const s = subscriptionsOf(req.userId).find((x) => x.key === key);
  if (!s) return res.status(404).json({ error: 'Abonnement introuvable' });
  if (!owns('accounts', s.account_id, req.userId)) return res.status(400).json({ error: 'Compte invalide' });
  const { lastInsertRowid: id } = db.prepare(`INSERT INTO recurring
    (user_id, account_id, category_id, amount, label, frequency, day, start_date) VALUES (?,?,?,?,?,?,?,?)`)
    .run(req.userId, s.account_id, s.category_id, -s.amount, s.label, s.frequency, Number(s.last_date.slice(8)), s.next_date);
  res.status(201).json({ id });
}));

// ---------- objectifs d'épargne ----------
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

app.get('/api/goals', auth, wrap((req, res) => res.json(goalsOf(req.userId))));

app.post('/api/goals', auth, wrap((req, res) => {
  const g = goalSchema.parse(req.body);
  const err = checkGoal(g, req.userId);
  if (err) return res.status(400).json({ error: err });
  const { lastInsertRowid: id } = db.prepare(
    'INSERT INTO goals (user_id, name, target_amount, target_date, account_id, saved) VALUES (?,?,?,?,?,?)'
  ).run(req.userId, g.name, toCents(g.target_amount), g.target_date || null, g.account_id || null, toCents(g.saved || 0));
  res.status(201).json(goalsOf(req.userId, id)[0]);
}));

app.put('/api/goals/:id', auth, wrap((req, res) => {
  if (!owns('goals', req.params.id, req.userId)) return res.status(404).json({ error: 'Objectif introuvable' });
  const g = goalSchema.parse(req.body);
  const err = checkGoal(g, req.userId);
  if (err) return res.status(400).json({ error: err });
  db.prepare('UPDATE goals SET name=?, target_amount=?, target_date=?, account_id=?, saved=COALESCE(?, saved) WHERE id=?')
    .run(g.name, toCents(g.target_amount), g.target_date || null, g.account_id || null,
      g.saved === undefined ? null : toCents(g.saved), req.params.id);
  res.json(goalsOf(req.userId, req.params.id)[0]);
}));

app.post('/api/goals/:id/contributions', auth, wrap((req, res) => {
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

app.delete('/api/goals/:id', auth, wrap((req, res) => {
  if (!owns('goals', req.params.id, req.userId)) return res.status(404).json({ error: 'Objectif introuvable' });
  db.prepare('DELETE FROM goals WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

// ---------- budgets ----------
app.get('/api/budgets', auth, wrap((req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const rows = db.prepare(`
    SELECT b.id, b.category_id, b.monthly_limit, c.name, c.color, c.icon,
      COALESCE((SELECT -SUM(t.amount) FROM transactions t
        WHERE t.category_id = b.category_id AND t.user_id = b.user_id
          AND substr(t.date,1,7) = ? AND t.amount < 0 AND t.transfer_id IS NULL AND t.account_id IN (SELECT id FROM accounts WHERE type IN ${liquidTypes})), 0) AS spent
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

// ---------- export CSV ----------
app.get('/api/export.csv', auth, wrap((req, res) => {
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
