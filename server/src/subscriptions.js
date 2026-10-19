// Détection automatique des abonnements à partir des opérations. Module pur : aucune base de données.
// Montants en centimes (dépenses négatives en entrée, montants positifs en sortie).
const { addMonths, daysBetween } = require('./dates');

// mots bancaires sans valeur pour reconnaître un commerçant
const NOISE = new Set(['CB', 'PRLV', 'SEPA', 'CARTE', 'FACT', 'FACTURE', 'PAIEMENT', 'ACHAT', 'ECH', 'ECHEANCE', 'REF', 'MANDAT', 'DU', 'LE', 'LA', 'DE']);

/** « PRLV SEPA Spotify P1A2B3 » → « SPOTIFY » ; « CB BASIC-FIT 12/09 » → « BASIC FIT ». */
function normalizeLabel(label) {
  return String(label)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((w) => w && !/\d/.test(w) && !NOISE.has(w)) // références, dates, numéros de carte : tout mot contenant un chiffre
    .join(' ');
}

/** « BASIC FIT » → « Basic Fit » */
const displayLabel = (key) => key.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Montant stable : chaque occurrence à ≤ 15 % ou ≤ 2 € de la médiane. */
const stable = (amounts) => {
  const med = median(amounts);
  return amounts.every((a) => Math.abs(a - med) <= Math.max(med * 0.15, 200));
};

const intervals = (occ) => occ.slice(1).map((o, i) => daysBetween(occ[i].date, o.date));

const mostFrequent = (values) => {
  const counts = new Map();
  for (const v of values) if (v != null) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

/** Hausse ou baisse de prix : dernier montant vs le montant qui précédait la série actuelle, si l'écart dépasse 5 %. */
function priceChange(occ) {
  const last = occ[occ.length - 1].amount;
  let i = occ.length - 1;
  while (i >= 0 && occ[i].amount === last) i--;
  if (i < 0) return null;
  const previous = occ[i].amount;
  if (Math.abs(last - previous) / previous <= 0.05) return null;
  return { old_amount: previous, new_amount: last, date: occ[i + 1].date };
}

/**
 * @param {Array} transactions { date, amount, label, category_id, account_id, transfer_id, recurring_id }
 * @param {object} opts
 * @param {string} opts.now          date du jour AAAA-MM-JJ
 * @param {Set<string>} opts.ignored libellés normalisés ignorés par l'utilisateur
 * @param {Set<string>} opts.tracked libellés normalisés déjà suivis comme opérations récurrentes
 */
function detectSubscriptions(transactions, { now, ignored = new Set(), tracked = new Set() }) {
  const sixMonthsAgo = addMonths(now, -6);
  const groups = new Map();
  for (const t of transactions) {
    // dépenses passées uniquement, hors virements et hors opérations déjà générées par une récurrence
    if (t.amount >= 0 || t.transfer_id || t.recurring_id || t.date > now || daysBetween(t.date, now) > 760) continue; // 2 échéances annuelles + marge
    const key = normalizeLabel(t.label);
    if (!key || ignored.has(key) || tracked.has(key)) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...t, amount: -t.amount });
  }

  const found = [];
  for (const [key, all] of groups) {
    all.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let frequency = null;
    let occ = all;

    // mensuel : au moins 3 mois distincts sur les 6 derniers, intervalle médian de 25 à 35 jours, encore actif
    const recent = all.filter((o) => o.date > sixMonthsAgo);
    const months = new Set(recent.map((o) => o.date.slice(0, 7)));
    if (months.size >= 3 && recent.length >= 3) {
      const gap = median(intervals(recent));
      if (gap >= 25 && gap <= 35 && stable(recent.map((o) => o.amount)) && daysBetween(recent[recent.length - 1].date, now) <= 45) {
        frequency = 'monthly';
        occ = recent;
      }
    }
    // annuel : 2 occurrences suffisent, chaque intervalle de 350 à 380 jours, encore actif
    if (!frequency && all.length >= 2) {
      const gaps = intervals(all);
      if (gaps.every((g) => g >= 350 && g <= 380) && stable(all.map((o) => o.amount)) && daysBetween(all[all.length - 1].date, now) <= 380) {
        frequency = 'yearly';
      }
    }
    if (!frequency) continue;

    const last = occ[occ.length - 1];
    found.push({
      key,
      label: displayLabel(key),
      frequency,
      amount: last.amount,
      annual_cost: frequency === 'monthly' ? last.amount * 12 : last.amount,
      category_id: mostFrequent(occ.map((o) => o.category_id)),
      account_id: mostFrequent(occ.map((o) => o.account_id)),
      occurrences: occ.length,
      first_date: all[0].date, // plus ancienne échéance connue (fenêtre de 760 jours)
      last_date: last.date,
      next_date: addMonths(last.date, frequency === 'monthly' ? 1 : 12),
      price_change: priceChange(occ),
    });
  }
  return found.sort((a, b) => b.annual_cost - a.annual_cost);
}

module.exports = { normalizeLabel, displayLabel, detectSubscriptions };
