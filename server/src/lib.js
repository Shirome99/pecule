// Helpers partagés par toutes les routes : erreurs, conversion des montants, validation des dates, authentification.
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { db } = require('./db');
const { DEFAULT_JWT_SECRET } = require('./security');

const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;

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

/** Compte et catégorie d'une opération (ou d'une récurrence) : doivent appartenir à l'utilisateur. */
function checkTxRefs(t, userId) {
  if (!owns('accounts', t.account_id, userId)) return 'Compte invalide';
  if (t.category_id && !owns('categories', t.category_id, userId)) return 'Catégorie invalide';
  return null;
}

module.exports = { wrap, toCents, fromCents, isoDate, sign, publicUser, auth, owns, checkTxRefs };
