// « Serveur » embarqué de l'app mobile : les routeurs de server/src, inchangés, exécutés dans l'app sur sql.js.
// Construit par esbuild (voir vite.config.ts, plugin peculeBackend) avec des substituts pour express,
// better-sqlite3, jsonwebtoken, path et le SDK Anthropic (src/local/shims).
//
// En plus des routes du serveur, quelques routes propres à l'app (/api/local/*) : sur l'appareil, il n'y a ni
// email ni mot de passe, on choisit simplement son profil (l'app peut être protégée par un code).

const { createApp, Router } = require('./shims/express.cjs');
const { db, seedUser } = require('../../../server/src/db');
const { wrap, sign, publicUser } = require('../../../server/src/lib');
const { generateRecurring } = require('../../../server/src/recurring');
const ai = require('../../../server/src/ai');

const LOCAL_DOMAIN = '@pecule.local';
const DEMO_EMAIL = 'demo@money.app';

/** Même profil que /api/me (routes/auth.js) : `onboarding` tant que le compte est neuf. */
const profile = (u) => ({
  ...publicUser(u),
  onboarding: !u.onboarded_at && !db.prepare('SELECT 1 FROM transactions WHERE user_id = ? LIMIT 1').get(u.id),
});
const userById = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
const session = (u) => { generateRecurring(u.id); return { token: sign(u), user: profile(userById(u.id)) }; };

const local = Router();

local.get('/api/health', (req, res) => res.json({ ok: true, local: true }));

/** Profils présents sur l'appareil (écran d'accueil). */
local.get('/api/local/profiles', wrap((req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.name, u.email, u.created_at,
      (SELECT COUNT(*) FROM transactions t WHERE t.user_id = u.id) AS operations
    FROM users u ORDER BY u.id`).all();
  res.json(rows.map((r) => ({ ...r, is_demo: r.email === DEMO_EMAIL })));
}));

/** Nouveau profil : seulement un prénom. */
local.post('/api/local/profiles', wrap((req, res) => {
  const name = String(req.body?.name ?? '').trim();
  if (!name) return res.status(400).json({ error: 'Indique ton prénom' });
  if (name.length > 60) return res.status(400).json({ error: 'Prénom trop long (60 caractères max)' });
  const email = `profil-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${LOCAL_DOMAIN}`;
  const { lastInsertRowid: id } = db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?,?,?)').run(email, name, '');
  seedUser(id);
  res.status(201).json(session(userById(id)));
}));

/** Ouvre un profil de l'appareil. */
local.post('/api/local/session', wrap((req, res) => {
  const user = userById(Number(req.body?.user_id));
  if (!user) return res.status(404).json({ error: 'Profil introuvable' });
  res.json(session(user));
}));

/** Supprime un profil et toutes ses données (cascade). */
local.delete('/api/local/profiles/:id', wrap((req, res) => {
  const { changes } = db.prepare('DELETE FROM users WHERE id = ?').run(Number(req.params.id));
  if (!changes) return res.status(404).json({ error: 'Profil introuvable' });
  res.json({ ok: true });
}));

/** Profil de démonstration : 6 mois de données réalistes (server/src/seed-demo.js). */
let seeded = false;
local.post('/api/local/demo', wrap((req, res) => {
  const demo = () => db.prepare('SELECT * FROM users WHERE email = ?').get(DEMO_EMAIL);
  if (!demo()) {
    // le module de démo ne s'exécute qu'à son premier chargement : après suppression, il faut relancer l'app
    if (seeded) return res.status(409).json({ error: 'Relance l’app pour recréer la démo' });
    require('../../../server/src/seed-demo.js');
    seeded = true;
  }
  res.json(session(demo()));
}));

const app = createApp([
  local,
  ...['auth', 'accounts', 'wealth', 'categories', 'transactions', 'transfers', 'recurring', 'forecast',
    'subscriptions', 'goals', 'budgets', 'stats', 'undo', 'rules', 'tags', 'insights', 'groups', 'ai'].map(load),
]);

// require statiques : esbuild doit voir chaque fichier
function load(name) {
  switch (name) {
    case 'auth': return require('../../../server/src/routes/auth.js');
    case 'accounts': return require('../../../server/src/routes/accounts.js');
    case 'wealth': return require('../../../server/src/routes/wealth.js');
    case 'categories': return require('../../../server/src/routes/categories.js');
    case 'transactions': return require('../../../server/src/routes/transactions.js');
    case 'transfers': return require('../../../server/src/routes/transfers.js');
    case 'recurring': return require('../../../server/src/routes/recurring.js');
    case 'forecast': return require('../../../server/src/routes/forecast.js');
    case 'subscriptions': return require('../../../server/src/routes/subscriptions.js');
    case 'goals': return require('../../../server/src/routes/goals.js');
    case 'budgets': return require('../../../server/src/routes/budgets.js');
    case 'stats': return require('../../../server/src/routes/stats.js');
    case 'undo': return require('../../../server/src/routes/undo.js');
    case 'rules': return require('../../../server/src/routes/rules.js');
    case 'tags': return require('../../../server/src/routes/tags.js');
    case 'insights': return require('../../../server/src/routes/insights.js');
    case 'groups': return require('../../../server/src/routes/groups.js');
    case 'ai': return require('../../../server/src/routes/ai.js');
    default: throw new Error(`Routeur inconnu : ${name}`);
  }
}

module.exports = {
  /** Exécute une requête de l'API : { method, url: '/api/...', headers, body } → { status, headers, body } */
  handle: (request) => app.handle(request),
  /** Contenu de la base (Uint8Array), pour l'enregistrer ou la sauvegarder */
  serialize: () => db.serialize(),
  /** Vrai si la base a changé depuis le dernier appel */
  takeDirty: () => db.takeDirty(),
  /** Clé API Anthropic saisie dans les Réglages (vide = fonctions IA masquées) */
  setAiKey(key) {
    globalThis.__peculeEnv.ANTHROPIC_API_KEY = key || '';
    ai.setClient(null); // le prochain appel recrée le client avec la nouvelle clé
  },
};
