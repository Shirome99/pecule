// Vue annuelle : revenus, dépenses, épargne, catégories × mois et plus grosses dépenses. Module pur, montants en centimes.
// Mêmes règles que les stats mensuelles : liquidités seulement, virements exclus (filtrés par l'appelant).

/**
 * @param {Array} transactions { id, date, amount, label, category_id, category_name, category_color, category_icon } de l'année
 * @param {number} year
 */
function yearSummary(transactions, year) {
  const months = Array.from({ length: 12 }, (_, i) => ({ month: `${year}-${String(i + 1).padStart(2, '0')}`, income: 0, expenses: 0 }));
  const cats = new Map();
  for (const t of transactions) {
    const i = Number(t.date.slice(5, 7)) - 1;
    if (t.amount > 0) { months[i].income += t.amount; continue; }
    months[i].expenses -= t.amount;
    const key = t.category_id ?? 0;
    if (!cats.has(key)) {
      cats.set(key, {
        id: t.category_id ?? null, name: t.category_name ?? 'Sans catégorie', color: t.category_color ?? '#9ca3af',
        icon: t.category_icon ?? '•', months: Array(12).fill(0), total: 0,
      });
    }
    const c = cats.get(key);
    c.months[i] -= t.amount;
    c.total -= t.amount;
  }
  const income = months.reduce((s, m) => s + m.income, 0);
  const expenses = months.reduce((s, m) => s + m.expenses, 0);
  const top = transactions.filter((t) => t.amount < 0)
    .sort((a, b) => a.amount - b.amount || a.date.localeCompare(b.date))
    .slice(0, 5);
  return {
    year, income, expenses, savings: income - expenses,
    // taux d'épargne : part des revenus non dépensée (null sans revenu)
    savings_rate: income > 0 ? Math.round(((income - expenses) / income) * 1000) / 10 : null,
    months,
    categories: [...cats.values()].sort((a, b) => b.total - a.total),
    top,
  };
}

module.exports = { yearSummary };
