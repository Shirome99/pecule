// Crée un compte démo avec 6 mois de transactions réalistes.
// Usage : npm run seed   →  demo@money.app / demo1234
const bcrypt = require('bcryptjs');
const { db, seedUser } = require('./db');
const { generateRecurring } = require('./recurring');

const EMAIL = 'demo@money.app';
db.prepare('DELETE FROM users WHERE email = ?').run(EMAIL);
const { lastInsertRowid: uid } = db
  .prepare('INSERT INTO users (email, name, password_hash) VALUES (?,?,?)')
  .run(EMAIL, 'Démo', bcrypt.hashSync('demo1234', 10));
seedUser(uid);

const acc = db.prepare('SELECT id FROM accounts WHERE user_id = ?').get(uid).id;
db.prepare('UPDATE accounts SET initial_balance = ? WHERE id = ?').run(150000, acc);
const livret = db.prepare('INSERT INTO accounts (user_id, name, type, initial_balance) VALUES (?,?,?,?)')
  .run(uid, 'Livret A', 'epargne', 500000).lastInsertRowid;

const cat = Object.fromEntries(
  db.prepare('SELECT id, name FROM categories WHERE user_id = ?').all(uid).map((c) => [c.name, c.id])
);
const ins = db.prepare('INSERT INTO transactions (user_id, account_id, category_id, amount, label, date) VALUES (?,?,?,?,?,?)');
const insTransfer = db.prepare('INSERT INTO transactions (user_id, account_id, amount, label, date, transfer_id) VALUES (?,?,?,?,?,?)');
const rnd = (a, b) => Math.round(a + Math.random() * (b - a));

const today = new Date();
const pad = (n) => String(n).padStart(2, '0');
const start = new Date(today.getFullYear(), today.getMonth() - 5, 1);
const startDate = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-01`;

// opérations fixes : des récurrences mensuelles, générées depuis 6 mois
const rec = db.prepare(`INSERT INTO recurring (user_id, account_id, category_id, amount, label, frequency, day, start_date)
  VALUES (?,?,?,?,?,'monthly',?,?)`);
rec.run(uid, acc, cat['Salaire'], 320000, 'Salaire', 1, startDate);
rec.run(uid, acc, cat['Transport'], -8640, 'Navigo', 2, startDate);
rec.run(uid, acc, cat['Logement'], -115000, 'Loyer', 3, startDate);
rec.run(uid, acc, cat['Abonnements'], -1399, 'Netflix', 5, startDate);
rec.run(uid, acc, cat['Abonnements'], -1999, 'Forfait mobile', 8, startDate);
rec.run(uid, acc, cat['Abonnements'], -3500, 'Salle de sport', 25, startDate);
generateRecurring(uid);

db.transaction(() => {
  for (let i = 5; i >= 0; i--) {
    const base = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const ym = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`;
    const lastDay = i === 0 ? today.getDate() : new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    const d = (day) => `${ym}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;

    const tid = crypto.randomUUID(); // virement mensuel vers l'épargne
    insTransfer.run(uid, acc, -30000, 'Épargne du mois', d(2), tid);
    insTransfer.run(uid, livret, 30000, 'Épargne du mois', d(2), tid);
    for (let k = 0; k < 6; k++) ins.run(uid, acc, cat['Courses'], -rnd(2500, 9500), ['Carrefour', 'Monoprix', 'Franprix', 'Lidl'][k % 4], d(rnd(1, 28)));
    for (let k = 0; k < rnd(3, 6); k++) ins.run(uid, acc, cat['Restaurants'], -rnd(1200, 5500), ['Brasserie', 'Sushi', 'Burger', 'Pizzeria', 'Café'][k % 5], d(rnd(1, 28)));
    for (let k = 0; k < rnd(1, 3); k++) ins.run(uid, acc, cat['Loisirs'], -rnd(1000, 6000), ['Cinéma', 'Concert', 'Bowling', 'Livres'][k % 4], d(rnd(1, 28)));
    if (Math.random() > 0.4) ins.run(uid, acc, cat['Shopping'], -rnd(3000, 15000), 'Vêtements', d(rnd(10, 25)));
    if (Math.random() > 0.6) ins.run(uid, acc, cat['Santé'], -rnd(1500, 6000), 'Pharmacie', d(rnd(1, 28)));
  }
})();

// objectifs : l'un suit le Livret A, l'autre est alimenté à la main
const inMonths = (n) => {
  const d = new Date(today.getFullYear(), today.getMonth() + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
};
const goal = db.prepare('INSERT INTO goals (user_id, name, target_amount, target_date, account_id, saved) VALUES (?,?,?,?,?,?)');
goal.run(uid, 'Apport appartement', 1500000, inMonths(24), livret, 0);
goal.run(uid, "Vacances d'été", 150000, inMonths(8), null, 45000);

const budget = db.prepare('INSERT INTO budgets (user_id, category_id, monthly_limit) VALUES (?,?,?)');
budget.run(uid, cat['Courses'], 40000);
budget.run(uid, cat['Restaurants'], 15000);
budget.run(uid, cat['Loisirs'], 10000);
budget.run(uid, cat['Shopping'], 10000);

console.log(`Compte démo prêt : ${EMAIL} / demo1234`);
