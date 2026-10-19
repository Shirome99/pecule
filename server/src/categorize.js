// Application des règles de catégorisation de l'utilisateur (lecture en base, calcul dans rules.js).
const { db } = require('./db');
const { matchRule, suggestRule } = require('./rules');

const rulesOf = (userId) => db.prepare(`
  SELECT r.*, c.kind AS category_kind FROM rules r JOIN categories c ON c.id = r.category_id
  WHERE r.user_id = ?`).all(userId);

/** Catégorie donnée par les règles à une opération sans catégorie (montant signé), ou null. */
function autoCategory(userId, label, amount, rules = rulesOf(userId)) {
  return matchRule(label, rules, amount < 0 ? 'expense' : 'income')?.category_id ?? null;
}

/** Classe les opérations sans catégorie (hors virements) ; renvoie le nombre d'opérations classées. */
function applyRules(userId) {
  const rules = rulesOf(userId);
  if (!rules.length) return 0;
  const rows = db.prepare('SELECT id, label, amount FROM transactions WHERE user_id = ? AND category_id IS NULL AND transfer_id IS NULL')
    .all(userId);
  const upd = db.prepare('UPDATE transactions SET category_id = ? WHERE id = ?');
  let n = 0;
  db.transaction(() => {
    for (const t of rows) {
      const cat = autoCategory(userId, t.label, t.amount, rules);
      if (cat) n += upd.run(cat, t.id).changes;
    }
  })();
  return n;
}

/** Suggestion « Toujours classer "X" en Y ? » après avoir donné une catégorie à l'opération `txId`. */
function ruleSuggestion(userId, txId) {
  const t = db.prepare('SELECT label, category_id FROM transactions WHERE id = ? AND user_id = ?').get(txId, userId);
  if (!t?.category_id) return null;
  const others = db.prepare(`SELECT label, category_id FROM transactions
    WHERE user_id = ? AND category_id = ? AND id <> ? AND transfer_id IS NULL ORDER BY date DESC LIMIT 500`).all(userId, t.category_id, txId);
  const s = suggestRule(t.label, t.category_id, others, rulesOf(userId));
  if (!s) return null;
  const c = db.prepare('SELECT name FROM categories WHERE id = ?').get(s.category_id);
  return { ...s, category_name: c.name };
}

module.exports = { rulesOf, autoCategory, applyRules, ruleSuggestion };
