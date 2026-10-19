// Tags des opérations (#vacances-maroc) : normalisation et bilan d'un tag. Module pur, montants en centimes.

/** « #Vacances Maroc » → « vacances-maroc » ; renvoie '' si rien d'utilisable. */
function normalizeTag(s) {
  return String(s)
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

/** Liste de tags dédoublonnée et normalisée. */
const normalizeTags = (list) => [...new Set(list.map(normalizeTag).filter(Boolean))];

/**
 * Bilan d'un tag à partir de ses opérations (virements exclus) :
 * total des dépenses, revenus, période couverte et répartition des dépenses par catégorie.
 * rows : [{ date, amount, category_id, category_name, category_color, category_icon }]
 */
function summarizeTag(rows) {
  const expenses = rows.filter((r) => r.amount < 0);
  const byCat = new Map();
  for (const r of expenses) {
    const key = r.category_id ?? 0;
    const c = byCat.get(key) ?? {
      id: r.category_id ?? null, name: r.category_name ?? 'Sans catégorie',
      color: r.category_color ?? '#9ca3af', icon: r.category_icon ?? '•', total: 0,
    };
    c.total -= r.amount;
    byCat.set(key, c);
  }
  const dates = rows.map((r) => r.date).sort();
  return {
    count: rows.length,
    total: -expenses.reduce((s, r) => s + r.amount, 0),
    income: rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0),
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
    byCategory: [...byCat.values()].sort((a, b) => b.total - a.total),
  };
}

module.exports = { normalizeTag, normalizeTags, summarizeTag };
