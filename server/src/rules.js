// Règles de catégorisation : un motif (texte contenu dans le libellé normalisé) → une catégorie. Module pur.
const { normalizeLabel } = require('./subscriptions');

/**
 * Règle qui s'applique à un libellé, ou null. Plusieurs règles possibles : la priorité la plus haute gagne,
 * puis le motif le plus long (le plus précis), puis la plus ancienne.
 * `kind` (expense | income) écarte les règles dont la catégorie n'est pas du même sens que l'opération.
 */
function matchRule(label, rules, kind = null) {
  const norm = normalizeLabel(label);
  if (!norm) return null;
  const hits = rules.filter((r) => r.pattern && norm.includes(r.pattern) && (!kind || !r.category_kind || r.category_kind === kind));
  hits.sort((a, b) => b.priority - a.priority || b.pattern.length - a.pattern.length || a.id - b.id);
  return hits[0] ?? null;
}

/** Début commun, mot par mot, de deux libellés normalisés : « BASIC FIT » pour « BASIC FIT » et « BASIC FIT PARIS ». */
function commonPrefix(a, b) {
  const wa = a.split(' ');
  const wb = b.split(' ');
  const out = [];
  for (let i = 0; i < Math.min(wa.length, wb.length, 3) && wa[i] === wb[i]; i++) out.push(wa[i]);
  const prefix = out.join(' ');
  return prefix.replace(/ /g, '').length >= 3 ? prefix : '';
}

/**
 * Suggestion de règle après avoir classé `label` dans `categoryId` : si une autre opération de la même catégorie
 * commence pareil (libellés normalisés), on propose ce début comme motif. Rien si une règle couvre déjà ce libellé.
 * `others` : [{ label, category_id }] (sans l'opération elle-même).
 */
function suggestRule(label, categoryId, others, rules) {
  const norm = normalizeLabel(label);
  if (!norm || !categoryId) return null;
  if (rules.some((r) => norm.includes(r.pattern))) return null;
  let best = '';
  for (const o of others) {
    if (o.category_id !== categoryId) continue;
    const p = commonPrefix(norm, normalizeLabel(o.label));
    if (p.length > best.length) best = p;
  }
  return best ? { pattern: best, category_id: categoryId } : null;
}

module.exports = { matchRule, commonPrefix, suggestRule, normalizeLabel };
