const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(process.env.DB_PATH || path.join(__dirname, '..', 'money.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'courant',      -- courant | epargne | especes | carte
  initial_balance INTEGER NOT NULL DEFAULT 0  -- en centimes
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('expense','income')),
  color TEXT NOT NULL DEFAULT '#6b7280',
  icon TEXT NOT NULL DEFAULT '•'
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL,          -- centimes ; négatif = dépense, positif = revenu
  label TEXT NOT NULL,
  date TEXT NOT NULL,               -- YYYY-MM-DD
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, date);

CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  monthly_limit INTEGER NOT NULL,   -- centimes
  UNIQUE(user_id, category_id)
);
`);

// ---------- migrations idempotentes (bases existantes) ----------
function addColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

// virements : les deux lignes partagent le même transfer_id
addColumn('transactions', 'transfer_id', 'TEXT');
db.exec('CREATE INDEX IF NOT EXISTS idx_tx_transfer ON transactions(transfer_id)');

// opérations récurrentes : une occurrence = une ligne transactions avec recurring_id
db.exec(`
CREATE TABLE IF NOT EXISTS recurring (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL,          -- centimes, signé comme une opération
  label TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('monthly','weekly','yearly')),
  day INTEGER NOT NULL,             -- jour du mois (monthly, yearly) ou de la semaine 1 = lundi … 7 = dimanche (weekly)
  start_date TEXT NOT NULL,         -- YYYY-MM-DD ; pour yearly, donne aussi le mois
  end_date TEXT,
  last_generated TEXT,              -- date jusqu'à laquelle les occurrences ont été générées
  paused INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);
addColumn('transactions', 'recurring_id', 'INTEGER REFERENCES recurring(id) ON DELETE SET NULL');
// virement récurrent : account_id = compte de départ, to_account_id = compte d'arrivée (amount négatif)
addColumn('recurring', 'to_account_id', 'INTEGER REFERENCES accounts(id) ON DELETE CASCADE');
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_recurring ON transactions(recurring_id, date)
  WHERE recurring_id IS NOT NULL`);

// patrimoine : valorisations manuelles des placements (dernière connue = valeur) et paramètres des crédits
db.exec(`
CREATE TABLE IF NOT EXISTS valuations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  value INTEGER NOT NULL,           -- centimes
  UNIQUE(account_id, date)
);
CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  principal INTEGER NOT NULL,       -- capital emprunté, centimes
  annual_rate REAL NOT NULL,        -- taux annuel en %, ex. 3.5
  duration_months INTEGER NOT NULL,
  first_payment_date TEXT NOT NULL,
  insurance_monthly INTEGER NOT NULL DEFAULT 0
);
`);

// abonnements détectés que l'utilisateur a choisi d'ignorer (libellé normalisé)
db.exec(`
CREATE TABLE IF NOT EXISTS subscription_ignores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label_norm TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, label_norm)
);
`);

// objectifs d'épargne : progression = solde du compte lié, sinon total des versements manuels (saved)
db.exec(`
CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount INTEGER NOT NULL,   -- centimes
  target_date TEXT,                 -- YYYY-MM-DD, facultative
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  saved INTEGER NOT NULL DEFAULT 0, -- centimes, versements manuels
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// premier lancement : date à laquelle le parcours d'accueil a été terminé ou passé
addColumn('users', 'onboarded_at', 'TEXT');

// règles de catégorisation (motif = texte contenu dans le libellé normalisé) et tags des opérations
db.exec(`
CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,            -- normalisé comme les libellés (majuscules, sans accents ni chiffres)
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 0, -- la plus haute gagne
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,               -- normalisé : minuscules, sans #, tirets à la place des espaces
  UNIQUE(user_id, name)
);
CREATE TABLE IF NOT EXISTS transaction_tags (
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_tx_tags_tag ON transaction_tags(tag_id);
`);

const DEFAULT_CATEGORIES = [
  ['Logement', 'expense', '#6366f1', '🏠'],
  ['Courses', 'expense', '#10b981', '🛒'],
  ['Transport', 'expense', '#f59e0b', '🚇'],
  ['Restaurants', 'expense', '#ef4444', '🍽️'],
  ['Loisirs', 'expense', '#ec4899', '🎬'],
  ['Santé', 'expense', '#14b8a6', '💊'],
  ['Abonnements', 'expense', '#8b5cf6', '📱'],
  ['Shopping', 'expense', '#f97316', '🛍️'],
  ['Autres dépenses', 'expense', '#6b7280', '•'],
  ['Salaire', 'income', '#22c55e', '💼'],
  ['Autres revenus', 'income', '#84cc16', '💶'],
];

function seedUser(userId) {
  const insCat = db.prepare('INSERT INTO categories (user_id, name, kind, color, icon) VALUES (?,?,?,?,?)');
  const insAcc = db.prepare('INSERT INTO accounts (user_id, name, type, initial_balance) VALUES (?,?,?,?)');
  db.transaction(() => {
    for (const c of DEFAULT_CATEGORIES) insCat.run(userId, ...c);
    insAcc.run(userId, 'Compte courant', 'courant', 0);
  })();
}

module.exports = { db, seedUser };
