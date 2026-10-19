import type { Budget } from '../api';
import { money, moneyRound } from '../format';

export default function BudgetBar({ b, onEdit }: { b: Budget; onEdit?: () => void }) {
  const ratio = b.monthly_limit > 0 ? b.spent / b.monthly_limit : 0;
  const state = ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok';
  const left = b.monthly_limit - b.spent;
  const Tag = onEdit ? 'button' : 'div';
  return (
    <Tag className={`budget ${state}`} onClick={onEdit}>
      <div className="budget-top">
        <span><span aria-hidden>{b.icon}</span> {b.name}</span>
        <span className="budget-nums">{moneyRound(b.spent)} / {moneyRound(b.monthly_limit)}</span>
      </div>
      <div className="budget-track" role="progressbar" aria-valuemin={0} aria-valuemax={b.monthly_limit}
        aria-valuenow={b.spent} aria-label={`${b.name} : ${Math.round(ratio * 100)} %`}>
        <div className="budget-fill" style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
      </div>
      <p className="budget-left">
        {left >= 0 ? `${money(left)} disponibles` : `Dépassé de ${money(-left)}`}
      </p>
    </Tag>
  );
}
