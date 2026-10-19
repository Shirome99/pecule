// Calculs de dates purs (sans base de données) : partagés par les récurrences, la prévision, les abonnements…

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

/** Décale une date AAAA-MM-JJ de n mois, en ramenant le jour au dernier jour du mois si besoin. */
function addMonths(date, n, day = Number(date.slice(8, 10))) {
  const [y, m] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const ty = t.getUTCFullYear();
  const tm = t.getUTCMonth() + 1;
  return iso(ty, tm, Math.min(day, daysIn(ty, tm)));
}

/** Nombre de jours entre deux dates AAAA-MM-JJ (b − a). */
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Les n mois (AAAA-MM) qui se terminent par `month`, du plus ancien au plus récent. */
function lastMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
  return out;
}

module.exports = { pad, iso, daysIn, localToday, occurrences, addMonths, daysBetween, lastMonths };
