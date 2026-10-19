// Objectifs d'épargne : combien mettre de côté chaque mois pour atteindre la cible à temps.

/** Nombre de mois restants jusqu'à la date cible (au moins 1 si la date n'est pas passée, 0 si elle l'est). */
function monthsLeft(targetDate, today) {
  if (targetDate < today) return 0;
  const [ty, tm] = targetDate.split('-').map(Number);
  const [y, m] = today.split('-').map(Number);
  return Math.max(1, (ty - y) * 12 + (tm - m));
}

/**
 * Plan d'un objectif, en centimes.
 * per_month : montant mensuel pour arriver à temps (arrondi au centime supérieur) ; null sans date cible.
 */
function goalPlan(progress, target, targetDate, today) {
  const remaining = Math.max(0, target - progress);
  const reached = remaining === 0;
  const months = targetDate ? monthsLeft(targetDate, today) : null;
  const overdue = !!targetDate && !reached && months === 0;
  let perMonth = null;
  if (targetDate) perMonth = reached ? 0 : overdue ? remaining : Math.ceil(remaining / months);
  return {
    remaining,
    reached,
    overdue,
    months_left: months,
    per_month: perMonth,
    ratio: target > 0 ? Math.min(Math.max(progress / target, 0), 1) : 0,
  };
}

module.exports = { goalPlan, monthsLeft };
