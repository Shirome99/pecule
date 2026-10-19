// Crée un compte démo avec 6 mois de transactions réalistes.
// Usage : npm run seed   →  demo@money.app / demo1234
const bcrypt = require('bcryptjs');
const { db, seedUser } = require('./db');

const EMAIL = 'demo@money.app';
db.prepare('DELETE FROM users WHERE email = ?').run(EMAIL);
const { lastInsertRowid: uid } = db
  .prepare('INSERT INTO users (email, name, password_hash) VALUES (?,?,?)')
  .run(EMAIL, 'Démo', bcrypt.hashSync('demo1234', 10));
seedUser(uid);

const acc = db.prepare('SELECT id FROM accounts WHERE user_id = ?').get(uid).id;
db.prepare('UPDATE accounts SET initial_balance = ? WHERE id = ?').run(150000, acc);
db.prepare('INSERT INTO accounts (user_id, name, type, initial_balance) VALUES (?,?,?,?)')
  .run(uid, 'Livret A', 'epargne', 500000).lastInsertRowid;

const cat = Object.fromEntries(
  db.prepare('SELECT id, name FROM categories WHERE user_id = ?').all(uid).map((c) => [c.name, c.id])
);
const ins = db.prepare('INSERT INTO transactions (user_id, account_id, category_id, amount, label, date) VALUES (?,?,?,?,?,?)');
const rnd = (a, b) => Math.round(a + Math.random() * (b - a));

const today = new Date();
db.transaction(() => {
  for (let i = 5; i >= 0; i--) {
    const base = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const ym = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`;
    const lastDay = i === 0 ? today.getDate() : new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    const d = (day) => `${ym}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;

    ins.run(uid, acc, cat['Salaire'], 320000, 'Salaire', d(1));
    ins.run(uid, acc, cat['Logement'], -115000, 'Loyer', d(3));
    ins.run(uid, acc, cat['Abonnements'], -1399, 'Netflix', d(5));
    ins.run(uid, acc, cat['Abonnements'], -1999, 'Forfait mobile', d(8));
    ins.run(uid, acc, cat['Transport'], -8640, 'Navigo', d(2));
    for (let k = 0; k < 6; k++) ins.run(uid, acc, cat['Courses'], -rnd(2500, 9500), ['Carrefour', 'Monoprix', 'Franprix', 'Lidl'][k % 4], d(rnd(1, 28)));
    for (let k = 0; k < rnd(3, 6); k++) ins.run(uid, acc, cat['Restaurants'], -rnd(1200, 5500), ['Brasserie', 'Sushi', 'Burger', 'Pizzeria', 'Café'][k % 5], d(rnd(1, 28)));
    for (let k = 0; k < rnd(1, 3); k++) ins.run(uid, acc, cat['Loisirs'], -rnd(1000, 6000), ['Cinéma', 'Concert', 'Salle de sport', 'Livres'][k % 4], d(rnd(1, 28)));
    if (Math.random() > 0.4) ins.run(uid, acc, cat['Shopping'], -rnd(3000, 15000), 'Vêtements', d(rnd(10, 25)));
    if (Math.random() > 0.6) ins.run(uid, acc, cat['Santé'], -rnd(1500, 6000), 'Pharmacie', d(rnd(1, 28)));
  }
})();

const budget = db.prepare('INSERT INTO budgets (user_id, category_id, monthly_limit) VALUES (?,?,?)');
budget.run(uid, cat['Courses'], 40000);
budget.run(uid, cat['Restaurants'], 15000);
budget.run(uid, cat['Loisirs'], 10000);
budget.run(uid, cat['Shopping'], 10000);

console.log(`Compte démo prêt : ${EMAIL} / demo1234`);
