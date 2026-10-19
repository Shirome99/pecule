// Dépenses partagées : répartition au centime près, soldes des membres et remboursements à faire. Module pur, centimes.

/** Répartit `total` entre `weights` (≥ 0) au prorata, sans perdre un centime (méthode des plus forts restes). */
function prorata(total, weights) {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0) throw new Error('Répartition impossible : aucune part');
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let rest = total - out.reduce((s, v) => s + v, 0);
  // les centimes restants vont aux plus grands restes (à égalité : dans l'ordre des membres)
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) out[order[k][1]]++;
  return out;
}

/**
 * Parts de chaque membre pour une dépense de `total` centimes.
 * - equal : `values` = ids des membres qui participent ;
 * - percent : `values` = { [memberId]: pourcentage }, la somme doit faire 100 ;
 * - amounts : `values` = { [memberId]: centimes }, la somme doit faire `total`.
 * Renvoie { shares: { [memberId]: centimes } } ou { error }.
 */
function splitExpense(total, mode, values) {
  if (!Number.isInteger(total) || total <= 0) return { error: 'Le montant doit être positif' };
  if (mode === 'equal') {
    const ids = [...new Set(values)];
    if (!ids.length) return { error: 'Choisis au moins une personne qui participe' };
    const parts = prorata(total, ids.map(() => 1));
    return { shares: Object.fromEntries(ids.map((id, i) => [id, parts[i]])) };
  }
  const entries = Object.entries(values).map(([id, v]) => [Number(id), Number(v)]).filter(([, v]) => v > 0);
  if (!entries.length) return { error: 'Indique la part d’au moins une personne' };
  if (entries.some(([, v]) => !Number.isFinite(v) || v < 0)) return { error: 'Parts invalides' };
  if (mode === 'percent') {
    const sum = entries.reduce((s, [, v]) => s + v, 0);
    if (Math.abs(sum - 100) > 0.01) return { error: `Les pourcentages font ${sum.toLocaleString('fr-FR')} % au lieu de 100 %` };
    const parts = prorata(total, entries.map(([, v]) => v));
    return { shares: Object.fromEntries(entries.map(([id], i) => [id, parts[i]])) };
  }
  if (mode === 'amounts') {
    const sum = entries.reduce((s, [, v]) => s + v, 0);
    if (sum !== total) return { error: `Les parts font ${(sum / 100).toFixed(2).replace('.', ',')} € au lieu de ${(total / 100).toFixed(2).replace('.', ',')} €` };
    return { shares: Object.fromEntries(entries) };
  }
  return { error: 'Répartition : equal, percent ou amounts' };
}

/**
 * Solde de chaque membre : ce qu'il a payé − ce qu'il doit, corrigé des remboursements déjà faits.
 * Positif = on lui doit de l'argent ; négatif = il doit de l'argent. La somme fait toujours 0.
 * expenses : [{ paid_by, amount, shares: { [memberId]: centimes } }] ; settlements : [{ from, to, amount }]
 */
function balances(memberIds, expenses, settlements = []) {
  const b = Object.fromEntries(memberIds.map((id) => [id, 0]));
  for (const e of expenses) {
    b[e.paid_by] = (b[e.paid_by] ?? 0) + e.amount;
    for (const [id, share] of Object.entries(e.shares)) b[id] = (b[id] ?? 0) - share;
  }
  // « from » a remboursé « to » : sa dette baisse, la créance de « to » aussi
  for (const s of settlements) {
    b[s.from] = (b[s.from] ?? 0) + s.amount;
    b[s.to] = (b[s.to] ?? 0) - s.amount;
  }
  return b;
}

/**
 * Remboursements pour tout solder : le plus gros débiteur rembourse le plus gros créancier, et ainsi de suite.
 * Chaque étape solde au moins un membre : au plus (membres − 1) remboursements.
 * Renvoie [{ from, to, amount }].
 */
function settleUp(balanceById) {
  const debtors = Object.entries(balanceById).filter(([, v]) => v < 0).map(([id, v]) => ({ id: Number(id), v: -v }));
  const creditors = Object.entries(balanceById).filter(([, v]) => v > 0).map(([id, v]) => ({ id: Number(id), v }));
  const out = [];
  while (debtors.length && creditors.length) {
    debtors.sort((a, b) => b.v - a.v || a.id - b.id);
    creditors.sort((a, b) => b.v - a.v || a.id - b.id);
    const d = debtors[0];
    const c = creditors[0];
    const amount = Math.min(d.v, c.v);
    out.push({ from: d.id, to: c.id, amount });
    d.v -= amount;
    c.v -= amount;
    if (!d.v) debtors.shift();
    if (!c.v) creditors.shift();
  }
  return out;
}

module.exports = { prorata, splitExpense, balances, settleUp };
