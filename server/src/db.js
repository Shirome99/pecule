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
