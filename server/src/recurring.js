// Opérations récurrentes : calcul des dates d'occurrence et génération idempotente des opérations dues.
const { db } = require('./db');
const { iso, daysIn, localToday, occurrences } = require('./dates');

/** Crée les occurrences dues jusqu'à `today` pour toutes les règles actives. Peut être relancée sans créer de doublon. */
function generateRecurring(userId, today = localToday()) {
  const rules = db.prepare('SELECT * FROM recurring WHERE user_id = ? AND paused = 0').all(userId);
  const ins = db.prepare(`INSERT OR IGNORE INTO transactions (user_id, account_id, category_id, amount, label, date, recurring_id, transfer_id)
    VALUES (?,?,?,?,?,?,?,?)`);
  const mark = db.prepare('UPDATE recurring SET last_generated = ? WHERE id = ?');
  let created = 0;
  db.transaction(() => {
    for (const r of rules) {
      if (r.start_date > today) continue;
      // les occurrences déjà générées (même supprimées ensuite par l'utilisateur) ne sont pas recréées
      const dates = occurrences(r, r.start_date, today).filter((d) => !r.last_generated || d > r.last_generated);
      for (const d of dates) {
        if (!r.to_account_id) { created += ins.run(userId, r.account_id, r.category_id, r.amount, r.label, d, r.id, null).changes; continue; }
        // virement : la ligne de sortie porte recurring_id (unicité), la ligne d'entrée partage le transfer_id
        const tid = `r${r.id}-${d}`;
        const cents = Math.abs(r.amount);
        if (ins.run(userId, r.account_id, null, -cents, r.label, d, r.id, tid).changes) {
          ins.run(userId, r.to_account_id, null, cents, r.label, d, null, tid);
          created++;
        }
      }
      if (!r.last_generated || r.last_generated < today) mark.run(today, r.id);
    }
  })();
  return created;
}

/** Somme (centimes, signée) et nombre des occurrences pas encore passées du mois `month` (YYYY-MM), virements exclus. */
function upcomingInMonth(userId, month, today = localToday()) {
  const [y, m] = month.split('-').map(Number);
  const from = `${month}-01`;
  const to = iso(y, m, daysIn(y, m));
  let total = 0;
  let count = 0;
  for (const r of db.prepare('SELECT * FROM recurring WHERE user_id = ? AND paused = 0 AND to_account_id IS NULL').all(userId)) {
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
