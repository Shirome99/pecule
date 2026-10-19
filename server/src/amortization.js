// Crédits à mensualité constante : mensualité, tableau d'amortissement, capital restant dû. Module pur, montants en centimes.
const { addMonths } = require('./dates');

/** Mensualité hors assurance, arrondie au centime. `annualRate` en % (3.5 pour 3,5 %). */
function monthlyPayment(principal, annualRate, months) {
  const r = annualRate / 100 / 12;
  if (r === 0) return Math.round(principal / months);
  return Math.round((principal * r) / (1 - (1 + r) ** -months));
}

/**
 * Tableau d'amortissement : une ligne par échéance. La dernière échéance solde exactement le capital.
 * @param {{ principal: number, annual_rate: number, duration_months: number, first_payment_date: string, insurance_monthly?: number }} loan
 */
function schedule(loan) {
  const r = loan.annual_rate / 100 / 12;
  const payment = monthlyPayment(loan.principal, loan.annual_rate, loan.duration_months);
  const insurance = loan.insurance_monthly || 0;
  const day = Number(loan.first_payment_date.slice(8, 10));
  const rows = [];
  let remaining = loan.principal;
  for (let n = 1; n <= loan.duration_months; n++) {
    const interest = Math.round(remaining * r);
    const last = n === loan.duration_months;
    const capital = last ? remaining : Math.min(payment - interest, remaining);
    remaining -= capital;
    rows.push({
      n,
      date: addMonths(loan.first_payment_date, n - 1, day),
      payment: capital + interest,
      interest,
      principal: capital,
      insurance,
      remaining,
    });
  }
  return rows;
}

/** Synthèse : mensualité, date de fin, coût total des intérêts et de l'assurance. */
function summary(loan) {
  const rows = schedule(loan);
  const interest = rows.reduce((s, x) => s + x.interest, 0);
  const insurance = rows.reduce((s, x) => s + x.insurance, 0);
  return {
    payment: monthlyPayment(loan.principal, loan.annual_rate, loan.duration_months),
    insurance_monthly: loan.insurance_monthly || 0,
    end_date: rows[rows.length - 1].date,
    total_interest: interest,
    total_insurance: insurance,
    total_cost: interest + insurance,
  };
}

/**
 * Capital restant dû à une date : 0 avant le déblocage (supposé un mois avant la 1re échéance),
 * le capital emprunté jusqu'à la 1re échéance, puis le restant dû après la dernière échéance passée.
 */
function outstandingAt(loan, date) {
  if (date < addMonths(loan.first_payment_date, -1)) return 0;
  let remaining = loan.principal;
  for (const row of schedule(loan)) {
    if (row.date > date) break;
    remaining = row.remaining;
  }
  return remaining;
}

module.exports = { monthlyPayment, schedule, summary, outstandingAt };
