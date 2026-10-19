// Valeur des comptes à une date selon leur famille, et patrimoine net mois par mois. Montants en centimes.
const { db } = require('./db');
const { familyOf } = require('./accounts');
const { outstandingAt } = require('./amortization');
const { iso, daysIn, localToday, addMonths } = require('./dates');

/** Solde de départ + opérations jusqu'à `date` incluse (pour un placement : le total versé). */
const cashAt = (accountId, date) => db.prepare(`
  SELECT a.initial_balance + COALESCE((SELECT SUM(amount) FROM transactions WHERE account_id = a.id AND date <= ?), 0) AS v
  FROM accounts a WHERE a.id = ?`).get(date, accountId).v;

const lastValuation = (accountId, date) =>
  db.prepare('SELECT value, date FROM valuations WHERE account_id = ? AND date <= ? ORDER BY date DESC LIMIT 1').get(accountId, date);

const loanOf = (accountId) => db.prepare('SELECT * FROM loans WHERE account_id = ?').get(accountId);

/**
 * Valeur d'un compte à une date :
 * - liquidités : solde reconstitué à partir des opérations ;
 * - placement : dernière valorisation connue, sinon le total versé ;
 * - dette : − capital restant dû si le crédit est renseigné, sinon le solde des opérations.
 */
function accountValueAt(account, date = localToday()) {
  const family = familyOf(account.type);
  if (family === 'investment') return lastValuation(account.id, date)?.value ?? cashAt(account.id, date);
  if (family === 'debt') {
    const loan = loanOf(account.id);
    return loan ? -outstandingAt(loan, date) : cashAt(account.id, date);
  }
  return cashAt(account.id, date);
}

/** Détail d'un placement : valeur, total versé, plus-value latente (centimes et %). */
function investmentDetails(account, date = localToday()) {
  const invested = cashAt(account.id, date);
  const valuation = lastValuation(account.id, date);
  const value = valuation?.value ?? invested;
  return {
    value,
    invested,
    gain: value - invested,
    gain_pct: invested > 0 ? Math.round(((value - invested) / invested) * 10000) / 100 : null,
    valued_at: valuation?.date ?? null,
  };
}

const monthEnd = (month) => {
  const [y, m] = month.split('-').map(Number);
  return iso(y, m, daysIn(y, m));
};

/** Patrimoine en fin de mois sur `months` mois (le mois en cours s'arrête à aujourd'hui). */
function networthSeries(userId, months = 24, today = localToday()) {
  const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ?').all(userId);
  const points = [];
  for (let i = months - 1; i >= 0; i--) {
    const month = addMonths(`${today.slice(0, 7)}-01`, -i).slice(0, 7);
    const date = i === 0 ? today : monthEnd(month);
    const point = { month, date, liquid: 0, investments: 0, debts: 0 };
    for (const a of accounts) {
      const v = accountValueAt(a, date);
      const family = familyOf(a.type);
      if (family === 'investment') point.investments += v;
      else if (family === 'debt') point.debts += v;
      else point.liquid += v;
    }
    point.net = point.liquid + point.investments + point.debts;
    points.push(point);
  }
  return points;
}

module.exports = { accountValueAt, investmentDetails, networthSeries, cashAt, loanOf };
