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
// virement mensuel de 300 € vers le Livret A
db.prepare(`INSERT INTO recurring (user_id, account_id, to_account_id, amount, label, frequency, day, start_date)
  VALUES (?,?,?,?,?,'monthly',?,?)`).run(uid, acc, livret, -30000, 'Épargne du mois', 2, startDate);
generateRecurring(uid);

db.transaction(() => {
  for (let i = 5; i >= 0; i--) {
    const base = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const ym = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`;
    const lastDay = i === 0 ? today.getDate() : new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    const d = (day) => `${ym}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;

    for (let k = 0; k < 6; k++) ins.run(uid, acc, cat['Courses'], -rnd(2500, 9500), ['Carrefour', 'Monoprix', 'Franprix', 'Lidl'][k % 4], d(rnd(1, 28)));
    for (let k = 0; k < rnd(3, 6); k++) ins.run(uid, acc, cat['Restaurants'], -rnd(1200, 5500), ['Brasserie', 'Sushi', 'Burger', 'Pizzeria', 'Café'][k % 5], d(rnd(1, 28)));
    for (let k = 0; k < rnd(1, 3); k++) ins.run(uid, acc, cat['Loisirs'], -rnd(1000, 6000), ['Cinéma', 'Concert', 'Bowling', 'Livres'][k % 4], d(rnd(1, 28)));
    if (Math.random() > 0.4) ins.run(uid, acc, cat['Shopping'], -rnd(3000, 15000), 'Vêtements', d(rnd(10, 25)));
    if (Math.random() > 0.6) ins.run(uid, acc, cat['Santé'], -rnd(1500, 6000), 'Pharmacie', d(rnd(1, 28)));
    // abonnements non suivis, sous des libellés bancaires réels : la page Abonnements les détecte
    ins.run(uid, acc, cat['Abonnements'], i <= 1 ? -1299 : -1099, `PRLV SEPA SPOTIFY P${i}A2B3`, d(7));
    ins.run(uid, acc, cat['Loisirs'], -2999, `CB BASIC FIT ${pad(12)}/${ym.slice(5)}`, d(12));
  }
})();

// assurance habitation annuelle : il y a 2 mois et il y a 14 mois
for (const n of [2, 14]) {
  const dt = new Date(today.getFullYear(), today.getMonth() - n, 15);
  ins.run(uid, acc, cat['Logement'], -18900, `PRLV SEPA MMA IARD ${880000 + n}`, `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-15`);
}

// règle de catégorisation et un week-end tagué le mois dernier
db.prepare('INSERT INTO rules (user_id, pattern, category_id, priority) VALUES (?,?,?,0)').run(uid, 'BASIC FIT', cat['Loisirs']);
{
  const dt = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const ym = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`;
  const tagId = db.prepare('INSERT INTO tags (user_id, name) VALUES (?,?)').run(uid, 'week-end-lyon').lastInsertRowid;
  const link = db.prepare('INSERT INTO transaction_tags (transaction_id, tag_id) VALUES (?,?)');
  for (const [label, category, cents, day] of [['SNCF Paris Lyon', 'Transport', -8900, 13], ['Hôtel Bellecour', 'Loisirs', -14200, 14], ['Bouchon lyonnais', 'Restaurants', -6450, 14]])
    link.run(ins.run(uid, acc, cat[category], cents, label, `${ym}-${day}`).lastInsertRowid, tagId);
}

// dépenses partagées : une coloc à trois
{
  const { splitExpense } = require('./settle');
  const gid = db.prepare('INSERT INTO groups (user_id, name) VALUES (?,?)').run(uid, 'Coloc').lastInsertRowid;
  const member = (name, me = 0) => db.prepare('INSERT INTO group_members (user_id, group_id, name, is_me) VALUES (?,?,?,?)').run(uid, gid, name, me).lastInsertRowid;
  const [me, sarah, leo] = [member('Démo', 1), member('Sarah'), member('Léo')];
  const day1 = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`;
  const expense = (label, cents, paidBy, txId = null) => {
    const id = db.prepare(`INSERT INTO group_expenses (user_id, group_id, label, date, amount, paid_by, split_mode, transaction_id)
      VALUES (?,?,?,?,?,?,'equal',?)`).run(uid, gid, label, day1, cents, paidBy, txId).lastInsertRowid;
    for (const [m, share] of Object.entries(splitExpense(cents, 'equal', [me, sarah, leo]).shares))
      db.prepare('INSERT INTO group_expense_shares (expense_id, member_id, share) VALUES (?,?,?)').run(id, m, share);
  };
  // payé par moi : seule ma part (1/3) est une dépense sur mon compte
  expense('Courses communes', 9000, me, ins.run(uid, acc, cat['Courses'], -3000, 'Courses communes (Coloc, ma part)', day1).lastInsertRowid);
  expense('Internet', 3000, sarah);
  expense('Électricité', 7500, leo);
}

// ---------- patrimoine : placements valorisés à la main et crédit immobilier ----------
const { cashAt } = require('./wealth');
const { iso, daysIn, addMonths, localToday } = require('./dates');
const newAccount = (name, type, initial) =>
  db.prepare('INSERT INTO accounts (user_id, name, type, initial_balance) VALUES (?,?,?,?)').run(uid, name, type, initial).lastInsertRowid;
const valuation = db.prepare('INSERT OR REPLACE INTO valuations (user_id, account_id, date, value) VALUES (?,?,?,?)');
const todayIso = localToday();
const monthEndAgo = (n) => {
  if (n === 0) return todayIso;
  const [y, m] = addMonths(`${todayIso.slice(0, 7)}-01`, -n).split('-').map(Number);
  return iso(y, m, daysIn(y, m));
};

// PEA : 8 000 € déjà versés, puis 200 € par mois (virement récurrent), valorisé chaque fin de mois
const pea = newAccount('PEA', 'pea', 800000);
db.prepare(`INSERT INTO recurring (user_id, account_id, to_account_id, amount, label, frequency, day, start_date)
  VALUES (?,?,?,?,?,'monthly',?,?)`).run(uid, acc, pea, -20000, 'Versement PEA', 10, startDate);
generateRecurring(uid);
for (let n = 23; n >= 0; n--) {
  const date = monthEndAgo(n);
  const years = (24 - n) / 12;
  const perf = 0.07 * years + 0.035 * Math.sin(n * 1.3); // tendance haussière avec des à-coups
  valuation.run(uid, pea, date, Math.round(cashAt(pea, date) * (1 + perf)));
}

// assurance-vie : 15 000 € placés, valorisation trimestrielle à ~2,5 %/an
const av = newAccount('Assurance-vie', 'assurance_vie', 1500000);
for (let n = 24; n >= 0; n -= 3) valuation.run(uid, av, monthEndAgo(n), Math.round(1500000 * 1.025 ** ((27 - n) / 12)));

// appartement locatif acheté il y a 3 ans, financé par un crédit de 200 000 € sur 20 ans à 3,5 %
const appart = newAccount('Appartement locatif', 'immobilier', 24000000);
[[36, 24000000], [24, 24500000], [12, 24800000], [0, 25200000]].forEach(([n, v]) => valuation.run(uid, appart, monthEndAgo(n), v));
const pret = newAccount('Prêt immobilier', 'credit_immo', 0);
const firstPayment = `${addMonths(`${todayIso.slice(0, 7)}-01`, -36).slice(0, 7)}-05`;
db.prepare(`INSERT INTO loans (user_id, account_id, principal, annual_rate, duration_months, first_payment_date, insurance_monthly)
  VALUES (?,?,?,?,?,?,0)`).run(uid, pret, 20000000, 3.5, 240, firstPayment);

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
budget.run(uid, cat['Loisirs'], 15000);
budget.run(uid, cat['Shopping'], 10000);

console.log(`Compte démo prêt : ${EMAIL} / demo1234`);
