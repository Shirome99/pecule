// Comparaisons automatiques (« constats ») pour un mois. Module pur : tout arrive en paramètre, montants en centimes.
// Seules les dépenses comptent (amount < 0), virements déjà exclus par l'appelant.
const { daysIn, addMonths, lastMonths } = require('./dates');

const CHANGE_PCT = 0.30;   // catégorie en hausse ou en baisse : écart > 30 %…
const CHANGE_MIN = 4000;   // … et > 40 €
const UNUSUAL_FACTOR = 3;  // dépense > 3 fois la médiane de sa catégorie
const UNUSUAL_MIN_SAMPLES = 3;
const MAX_INSIGHTS = 3;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const money = (cents) => eur.format(Math.round(cents / 100));
const pct = (r) => `${r > 0 ? '+' : '−'}${Math.round(Math.abs(r) * 100)} %`;
/** « 1er octobre », « 12 juin » */
const dayMonth = (date) => {
  const [y, m, d] = date.split('-').map(Number);
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('fr-FR', { month: 'long', timeZone: 'UTC' });
  return `${d === 1 ? '1er' : d} ${month}`;
};

/** Nombre de mois complets d'historique avant `month` (un mois compte si la 1re opération date d'avant son 1er jour). */
function historyMonths(month, firstDate) {
  if (!firstDate) return 0;
  let n = 0;
  for (let m = addMonths(`${month}-01`, -1).slice(0, 7); `${m}-01` >= firstDate; m = addMonths(`${m}-01`, -1).slice(0, 7)) n++;
  return n;
}

/**
 * @param {object} input
 * @param {string} input.month       mois analysé AAAA-MM
 * @param {string} input.now         date du jour AAAA-MM-JJ
 * @param {Array}  input.transactions { id, date, amount, label, category_id } : le mois et les 6 précédents
 * @param {object} input.categories  { [id]: { name } }
 * @param {Array}  input.budgets     { category_id, monthly_limit }
 * @param {string|null} input.firstDate date de la toute première opération
 * @returns {Array} au plus 3 constats { type, amount (importance en centimes), text, link: { month, category_id?, q? } }
 */
function insights({ month, now, transactions, categories = {}, budgets = [], firstDate = null }) {
  const current = now.slice(0, 7);
  if (month > current || historyMonths(month, firstDate) < 2) return [];

  const ongoing = month === current;
  // mois en cours : on compare « à date équivalente » (jusqu'au même jour du mois)
  const day = ongoing ? Number(now.slice(8, 10)) : 31;
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = daysIn(y, m);
  const expenses = transactions.filter((t) => t.amount < 0);
  const upToDay = (t) => Number(t.date.slice(8, 10)) <= day;
  const spentIn = (mo, filter = () => true) => expenses
    .filter((t) => t.date.slice(0, 7) === mo && upToDay(t) && filter(t))
    .reduce((s, t) => s - t.amount, 0);
  const catName = (id) => categories[id]?.name ?? 'Sans catégorie';
  const out = [];

  // 1. catégories en hausse ou en baisse par rapport à la moyenne des 3 mois précédents (ceux de l'historique)
  const prev3 = lastMonths(month, 4).slice(0, 3).filter((mo) => !firstDate || `${mo}-01` >= firstDate);
  if (prev3.length >= 2) {
    const ids = new Set(expenses.filter((t) => t.category_id).map((t) => t.category_id));
    for (const id of ids) {
      const spent = spentIn(month, (t) => t.category_id === id);
      const avg = prev3.reduce((s, mo) => s + spentIn(mo, (t) => t.category_id === id), 0) / prev3.length;
      const diff = spent - avg;
      if (avg === 0 || Math.abs(diff) <= CHANGE_MIN || Math.abs(diff) / avg <= CHANGE_PCT) continue;
      const when = ongoing ? `au ${day}` : 'ce mois-là';
      out.push({
        type: diff > 0 ? 'category_up' : 'category_down',
        amount: Math.abs(diff),
        text: `${catName(id)} : ${money(spent)} ${when}, ${pct(diff / avg)} par rapport à ta moyenne de ${money(avg)}${ongoing ? ' à la même date' : ''}.`,
        link: { month, category_id: id },
      });
    }
  }

  // 2. dépense inhabituelle : plus de 3 fois la médiane de sa catégorie sur 6 mois
  const sixMonths = new Set(lastMonths(month, 6));
  for (const t of expenses.filter((x) => x.date.slice(0, 7) === month && x.category_id)) {
    const others = expenses
      .filter((x) => x.id !== t.id && x.category_id === t.category_id && sixMonths.has(x.date.slice(0, 7)))
      .map((x) => -x.amount);
    if (others.length < UNUSUAL_MIN_SAMPLES) continue;
    const med = median(others);
    if (-t.amount <= UNUSUAL_FACTOR * med) continue;
    out.push({
      type: 'unusual',
      amount: -t.amount - med,
      text: `Dépense inhabituelle : « ${t.label} », ${money(-t.amount)} le ${dayMonth(t.date)}, ${Math.round(-t.amount / med)} fois ta dépense habituelle en ${catName(t.category_id)} (${money(med)}).`,
      link: { month, q: t.label },
    });
  }

  if (ongoing) {
    // 3. budget en voie de dépassement : au rythme actuel, dépassé avant la fin du mois
    for (const b of budgets) {
      const spent = spentIn(month, (t) => t.category_id === b.category_id);
      if (spent === 0 || spent >= b.monthly_limit) continue; // déjà dépassé : la barre du budget le montre
      const perDay = spent / day;
      const projected = perDay * daysInMonth;
      if (projected <= b.monthly_limit) continue;
      const overDay = Math.ceil(b.monthly_limit / perDay);
      out.push({
        type: 'budget_pace',
        amount: projected - b.monthly_limit,
        text: `Budget ${catName(b.category_id)} : à ce rythme, il sera dépassé vers le ${dayMonth(`${month}-${String(overDay).padStart(2, '0')}`)} (${money(projected)} prévus pour ${money(b.monthly_limit)}).`,
        link: { month, category_id: b.category_id },
      });
    }

    // 4. bonne nouvelle : le mois le moins dépensier des 6 derniers, à date équivalente
    const before = lastMonths(month, 6).slice(0, 5).filter((mo) => !firstDate || `${mo}-01` >= firstDate);
    if (before.length >= 2) {
      const total = spentIn(month);
      const others = before.map((mo) => spentIn(mo));
      if (others.every((o) => total < o)) {
        const avg = others.reduce((s, o) => s + o, 0) / others.length;
        out.push({
          type: 'good_news',
          amount: avg - total,
          text: `Bonne nouvelle : ${money(total)} dépensés au ${day}, ton mois le plus économe des ${before.length + 1} derniers à la même date (moyenne ${money(avg)}).`,
          link: { month },
        });
      }
    }
  }

  return out
    .map((i) => ({ ...i, amount: Math.round(i.amount) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, MAX_INSIGHTS);
}

module.exports = { insights, historyMonths, CHANGE_PCT, CHANGE_MIN };
