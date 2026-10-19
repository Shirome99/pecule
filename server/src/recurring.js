// Opérations récurrentes : calcul des dates d'occurrence et génération idempotente des opérations dues.
const { db } = require('./db');

const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`; // m : 1-12
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Date du jour (heure locale du serveur) au format YYYY-MM-DD. */
function localToday() {
  const d = new Date();
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Dates d'occurrence d'une règle comprises entre from et to (inclus), bornées par start_date / end_date. */
function occurrences(rule, from, to) {
  const start = rule.start_date > from ? rule.start_date : from;
  const end = rule.end_date && rule.end_date < to ? rule.end_date : to;
  const out = [];
  if (start > end) return out;

  if (rule.frequency === 'weekly') {
    const d = new Date(`${start}T00:00:00Z`);
    const weekday = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + ((rule.day - weekday + 7) % 7));
    for (let s = d.toISOString().slice(0, 10); s <= end; s = d.toISOString().slice(0, 10)) {
      out.push(s);
      d.setUTCDate(d.getUTCDate() + 7);
    }
    return out;
  }

  // monthly : chaque mois ; yearly : le mois de start_date chaque année. Jour ramené au dernier jour du mois si besoin.
  const [sy, sm] = start.split('-').map(Number);
  const yearly = rule.frequency === 'yearly';
  const ruleMonth = Number(rule.start_date.slice(5, 7));
  let y = sy;
  let m = yearly ? ruleMonth : sm;
  if (yearly && m < sm) y++;
  while (iso(y, m, 1) <= end) {
    const date = iso(y, m, Math.min(rule.day, daysIn(y, m)));
    if (date >= start && date <= end) out.push(date);
    if (yearly) y++;
    else if (++m > 12) { m = 1; y++; }
  }
  return out;
}

/** Crée les occurrences dues jusqu'à `today` pour toutes les règles actives. Peut être relancée sans créer de doublon. */
function generateRecurring(userId, today = localToday()) {
  const rules = db.prepare('SELECT * FROM recurring WHERE user_id = ? AND paused = 0').all(userId);
  const ins = db.prepare(`INSERT OR IGNORE INTO transactions (user_id, account_id, category_id, amount, label, date, recurring_id)
    VALUES (?,?,?,?,?,?,?)`);
  const mark = db.prepare('UPDATE recurring SET last_generated = ? WHERE id = ?');
  let created = 0;
  db.transaction(() => {
    for (const r of rules) {
      if (r.start_date > today) continue;
      // les occurrences déjà générées (même supprimées ensuite par l'utilisateur) ne sont pas recréées
      const dates = occurrences(r, r.start_date, today).filter((d) => !r.last_generated || d > r.last_generated);
      for (const d of dates) created += ins.run(userId, r.account_id, r.category_id, r.amount, r.label, d, r.id).changes;
      if (!r.last_generated || r.last_generated < today) mark.run(today, r.id);
    }
  })();
  return created;
}

/** Somme (centimes, signée) et nombre des occurrences pas encore passées du mois `month` (YYYY-MM). */
function upcomingInMonth(userId, month, today = localToday()) {
  const [y, m] = month.split('-').map(Number);
  const from = `${month}-01`;
  const to = iso(y, m, daysIn(y, m));
  let total = 0;
  let count = 0;
  for (const r of db.prepare('SELECT * FROM recurring WHERE user_id = ? AND paused = 0').all(userId)) {
    for (const d of occurrences(r, from, to)) {
      if (d > today && (!r.last_generated || d > r.last_generated)) { total += r.amount; count++; }
    }
  }
  return { total, count };
}

/** Prochaine occurrence à venir (après `today`), ou null. */
function nextOccurrence(rule, today = localToday()) {
  const [y] = today.split('-').map(Number);
  const after = rule.last_generated && rule.last_generated > today ? rule.last_generated : today;
  return occurrences(rule, after, `${y + 2}-12-31`).find((d) => d > after) ?? null;
}

module.exports = { occurrences, generateRecurring, upcomingInMonth, nextOccurrence, localToday };
