import type { Goal } from '../api';
import { money, moneyRound, shortDate } from '../format';

/** Ce qu'il faut retenir d'un objectif, en une phrase. */
function advice(g: Goal) {
  if (g.reached) return 'Objectif atteint, bravo !';
  if (g.overdue) return `Date dépassée : il manque ${money(g.remaining)}`;
  if (g.per_month !== null) return `${money(g.per_month)} par mois pour y arriver à temps`;
  return `Il reste ${money(g.remaining)}`;
}

export default function GoalCard({ g, onEdit }: { g: Goal; onEdit?: () => void }) {
  const Tag = onEdit ? 'button' : 'div';
  const state = g.reached ? 'ok reached' : g.overdue ? 'over' : 'ok';
  return (
    <Tag className={`budget goal ${state}`} onClick={onEdit}>
      <div className="budget-top">
        <span>{g.name}</span>
        <span className="budget-nums">{moneyRound(g.progress)} / {moneyRound(g.target_amount)}</span>
      </div>
      <div className="budget-track" role="progressbar" aria-valuemin={0} aria-valuemax={g.target_amount}
        aria-valuenow={g.progress} aria-label={`${g.name} : ${Math.round(g.ratio * 100)} %`}>
        <div className="budget-fill" style={{ width: `${g.ratio * 100}%` }} />
      </div>
      <p className="goal-advice">{advice(g)}</p>
      <p className="budget-left">
        {g.account_name ?? 'Versements manuels'}
        {g.target_date && ` · d'ici le ${shortDate(g.target_date)} ${g.target_date.slice(0, 4)}`}
      </p>
    </Tag>
  );
}
