// Prévision de fin de mois et « reste à dépenser par jour ». Module pur : aucune base de données, tout arrive en paramètre.
// Montants en centimes. Les virements (transfer_id) ne sont jamais des revenus ni des dépenses.
const { daysIn, occurrences, addMonths, iso } = require('./dates');

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const inMonth = (date, month) => date.slice(0, 7) === month;
const monthBounds = (month) => {
  const [y, m] = month.split('-').map(Number);
  return { from: `${month}-01`, to: iso(y, m, daysIn(y, m)), days: daysIn(y, m) };
};

/** Revenus et dépenses (hors virements) d'un mois. */
function totals(transactions, month) {
  let income = 0;
  let expenses = 0;
  for (const t of transactions) {
    if (t.transfer_id || !inMonth(t.date, month)) continue;
    if (t.amount > 0) income += t.amount;
    else expenses -= t.amount;
  }
  return { income, expenses };
}

/** Dépenses non récurrentes et hors virements d'un mois, éventuellement jusqu'à une date. */
const variableSpending = (transactions, month, until = null) => transactions
  .filter((t) => t.amount < 0 && !t.transfer_id && !t.recurring_id && inMonth(t.date, month) && (!until || t.date <= until))
  .reduce((s, t) => s - t.amount, 0);

/**
 * @param {object} input
 * @param {string} input.now            date du jour AAAA-MM-JJ
 * @param {string} input.month          mois demandé AAAA-MM
 * @param {Array}  input.transactions   { date, amount, transfer_id, recurring_id } : au moins les 3 mois précédents + le mois
 * @param {string|null} input.firstDate date de la toute première opération de l'utilisateur
 * @param {Array}  input.rules          récurrences actives { amount, frequency, day, start_date, end_date, last_generated,
 *                                      to_account_id, from_spendable, to_spendable, to_savings }
 * @param {number} input.spendableBalance solde actuel des comptes courant / espèces / carte
 */
function forecast({ now, month, transactions, firstDate = null, rules = [], spendableBalance = 0 }) {
  const currentMonth = now.slice(0, 7);
  const real = totals(transactions, month);
  if (month < currentMonth) return { month, is_past: true, ...real, net: real.income - real.expenses };
  if (month > currentMonth) throw new Error('Prévision impossible pour un mois futur');

  const { from, to, days } = monthBounds(month);
  const day = Number(now.slice(8, 10));
  const daysRemaining = days - day + 1; // aujourd'hui inclus

  // récurrences du mois : à venir (après aujourd'hui, pas encore générées) et épargne prévue (tout le mois)
  let upcomingIncome = 0;
  let upcomingExpenses = 0;
  let upcomingSavingsOut = 0;
  let plannedSavings = 0;
  for (const r of rules) {
    for (const d of occurrences(r, from, to)) {
      const upcoming = d > now && (!r.last_generated || d > r.last_generated);
      const cents = Math.abs(r.amount);
      if (r.to_account_id) {
        if (r.to_savings) plannedSavings += cents;
        // l'argent qui quitte (ou rejoint) les comptes du quotidien change le solde de fin de mois
        if (upcoming && r.from_spendable && !r.to_spendable) upcomingSavingsOut += cents;
        if (upcoming && !r.from_spendable && r.to_spendable) upcomingSavingsOut -= cents;
      } else if (upcoming) {
        if (r.amount > 0) upcomingIncome += cents;
        else upcomingExpenses += cents;
      }
    }
  }

  // rythme des dépenses variables : médiane des 3 derniers mois complets, sinon rythme du mois en cours
  const history = [1, 2, 3]
    .map((n) => addMonths(`${month}-01`, -n).slice(0, 7))
    .filter((mo) => firstDate && firstDate <= `${mo}-01`)
    .map((mo) => variableSpending(transactions, mo) / monthBounds(mo).days);
  const rateBasis = history.length ? 'history' : 'current_month';
  const dailyRate = Math.round(history.length ? median(history) : variableSpending(transactions, month, now) / day);

  const projectedEnd = spendableBalance + upcomingIncome - upcomingExpenses - upcomingSavingsOut - dailyRate * daysRemaining;
  const safeToSpend = real.income + upcomingIncome - real.expenses - upcomingExpenses - plannedSavings;

  return {
    month,
    is_past: false,
    today: now,
    last_day: to,
    days_in_month: days,
    days_remaining: daysRemaining,
    income: real.income,
    expenses: real.expenses,
    upcoming_income: upcomingIncome,
    upcoming_expenses: upcomingExpenses,
    upcoming_savings_out: upcomingSavingsOut,
    planned_savings: plannedSavings,
    variable_daily_rate: dailyRate,
    rate_basis: rateBasis,
    history_months: history.length,
    spendable_balance: spendableBalance,
    projected_end_balance: projectedEnd,
    safe_to_spend: safeToSpend,
    safe_per_day: safeToSpend >= 0 ? Math.floor(safeToSpend / daysRemaining) : 0,
    overspend: safeToSpend < 0 ? -safeToSpend : 0,
  };
}

module.exports = { forecast, median };
