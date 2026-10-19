// Familles de comptes : liquidités (comptent dans le budget), placements (valorisés à la main), dettes (crédits).
const FAMILIES = {
  liquid: ['courant', 'epargne', 'especes', 'carte'],
  investment: ['pea', 'assurance_vie', 'cto', 'crypto', 'immobilier', 'autre_placement'],
  debt: ['credit_immo', 'credit_conso'],
};
const ACCOUNT_TYPES = [...FAMILIES.liquid, ...FAMILIES.investment, ...FAMILIES.debt];
// comptes du quotidien : base du « reste à dépenser »
const SPENDABLE = ['courant', 'especes', 'carte'];
// destinations d'épargne : un virement vers ces comptes est de l'argent mis de côté
const SAVINGS = ['epargne', ...FAMILIES.investment];

const familyOf = (type) => Object.keys(FAMILIES).find((f) => FAMILIES[f].includes(type)) ?? 'liquid';
/** Liste SQL de types, ex. `('courant','epargne')`, pour filtrer les requêtes. */
const sqlList = (types) => `(${types.map((t) => `'${t}'`).join(',')})`;

module.exports = { FAMILIES, ACCOUNT_TYPES, SPENDABLE, SAVINGS, familyOf, sqlList };
