import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { api, type Budget, type Goal, type Insight, type Networth, type Stats, type Subscriptions } from '../api';
import { currentMonth, money, moneyRound, monthLabel, percent, shiftMonth, shortDate } from '../format';
import BudgetBar from '../components/BudgetBar';
import GoalCard from '../components/GoalCard';
import { isNative } from '../native';

type Data = {
  stats: Stats; previous: Stats; budgets: Budget[]; networth: Networth | null;
  subscriptions: Subscriptions | null; goals: Goal[]; insights: Insight[];
};

/** Récap mensuel imprimable (« Imprimer → Enregistrer en PDF » donne un A4 de 2 pages au plus). */
export default function Recap() {
  const { month = '' } = useParams();
  const valid = /^\d{4}-\d{2}$/.test(month) && month <= currentMonth();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!valid) return;
    const soft = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
    Promise.all([
      api.get<Stats>(`/stats?month=${month}`),
      api.get<Stats>(`/stats?month=${shiftMonth(month, -1)}`),
      api.get<Budget[]>(`/budgets?month=${month}`),
      soft(api.get<Networth>('/networth?months=24'), null),
      soft(api.get<Subscriptions>('/subscriptions'), null),
      soft(api.get<Goal[]>('/goals'), []),
      soft(api.get<Insight[]>(`/insights?month=${month}`), []),
    ]).then(([stats, previous, budgets, networth, subscriptions, goals, insights]) =>
      setData({ stats, previous, budgets, networth, subscriptions, goals, insights }))
      .catch((e) => setError((e as Error).message));
  }, [month, valid]);

  if (!valid) return <Navigate to="/" replace />;
  const title = monthLabel(month);
  if (error) return <div className="page"><p className="form-error" role="alert">{error}</p></div>;
  if (!data) return <div className="page"><p className="muted">Chargement…</p></div>;

  const { stats, previous, budgets, networth, subscriptions, goals, insights } = data;
  const net = stats.income - stats.expenses;
  const rate = stats.income > 0 ? (net / stats.income) * 100 : null;
  const point = networth?.months.find((p) => p.month === month);
  const before = networth?.months.find((p) => p.month === shiftMonth(month, -1));
  const prevByCat = new Map(previous.byCategory.map((c) => [c.id, c.total]));
  const kept = budgets.filter((b) => b.spent <= b.monthly_limit);
  const over = budgets.filter((b) => b.spent > b.monthly_limit);
  // nouveau : première échéance repérée dans ce mois ou les deux précédents (il faut 3 mois pour reconnaître un abonnement)
  const newSubs = (subscriptions?.items ?? []).filter((s) => s.first_date >= `${shiftMonth(month, -2)}-01` && s.first_date.slice(0, 7) <= month);
  const hikes = (subscriptions?.items ?? []).filter((s) => s.price_change && s.price_change.date.slice(0, 7) === month);

  return (
    <div className="page recap">
      <header className="page-head">
        <div>
          <Link to="/" className="link small back-link no-print">‹ Aperçu</Link>
          <p className="muted recap-brand">Pécule · récap mensuel</p>
          <h1>{title}</h1>
        </div>
        {/* l'impression n'existe pas dans l'app Android : le récap reste consultable à l'écran */}
        {!isNative && <button className="btn primary no-print" onClick={() => window.print()}>Télécharger en PDF</button>}
      </header>

      <dl className="sheet-stats recap-stats">
        <div className="sheet-stat"><dt>Revenus</dt><dd className="in">{moneyRound(stats.income)}</dd></div>
        <div className="sheet-stat"><dt>Dépenses</dt><dd>{moneyRound(stats.expenses)}</dd></div>
        <div className="sheet-stat"><dt>Épargne du mois</dt><dd className={net < 0 ? 'out' : 'in'}>{net > 0 ? '+' : ''}{moneyRound(net)}</dd></div>
        <div className="sheet-stat"><dt>Taux d'épargne</dt><dd>{rate === null ? '–' : `${rate.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`}</dd></div>
        {point && (
          <div className="sheet-stat"><dt>Patrimoine net</dt>
            <dd>{moneyRound(point.net)}{before && <span className={`recap-delta ${point.net >= before.net ? 'in' : 'out'}`}> {point.net >= before.net ? '+' : ''}{moneyRound(point.net - before.net)} sur le mois</span>}</dd>
          </div>
        )}
      </dl>

      {insights.length > 0 && (
        <section className="panel recap-block">
          <h2>À retenir</h2>
          <ul className="recap-list">{insights.map((i) => <li key={i.text}>{i.text}</li>)}</ul>
        </section>
      )}

      <section className="panel recap-block">
        <h2>Top 5 des catégories</h2>
        {stats.byCategory.length === 0 ? <p className="muted">Aucune dépense ce mois-ci.</p> : (
          <table className="recap-table">
            <thead><tr><th scope="col">Catégorie</th><th scope="col">Dépensé</th><th scope="col">vs {monthLabel(shiftMonth(month, -1)).split(' ')[0].toLowerCase()}</th></tr></thead>
            <tbody>
              {stats.byCategory.slice(0, 5).map((c) => {
                const p = prevByCat.get(c.id);
                return (
                  <tr key={c.id ?? 'none'}>
                    <th scope="row"><span aria-hidden>{c.icon}</span> {c.name}</th>
                    <td>{money(c.total)}</td>
                    <td className={p && c.total > p ? 'out' : 'in'}>{p ? percent(((c.total - p) / p) * 100) : 'nouveau'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {budgets.length > 0 && (
        <section className="panel recap-block">
          <div className="panel-head">
            <h2>Budgets</h2>
            <span className="muted">{kept.length} tenu{kept.length > 1 ? 's' : ''} · <span className={over.length ? 'out' : ''}>{over.length} dépassé{over.length > 1 ? 's' : ''}</span></span>
          </div>
          <div className="budget-list compact recap-budgets">{budgets.map((b) => <BudgetBar key={b.id} b={b} />)}</div>
        </section>
      )}

      <section className="panel recap-block">
        <h2>Abonnements</h2>
        {newSubs.length === 0 && hikes.length === 0 ? (
          <p className="muted">Rien de nouveau : pas de nouvel abonnement ni de hausse de prix.</p>
        ) : (
          <ul className="recap-list">
            {newSubs.map((s) => <li key={`n-${s.key}`}>Nouveau : <strong>{s.label}</strong>, {money(s.amount)} {s.frequency === 'monthly' ? 'par mois' : 'par an'}</li>)}
            {hikes.map((s) => (
              <li key={`h-${s.key}`}>Prix en hausse : <strong>{s.label}</strong>, {money(s.price_change!.old_amount)} → {money(s.price_change!.new_amount)} depuis le {shortDate(s.price_change!.date)}</li>
            ))}
          </ul>
        )}
        {subscriptions && subscriptions.items.length > 0 && (
          <p className="muted small">En tout : {money(subscriptions.monthly_total)} par mois, {moneyRound(subscriptions.annual_total)} par an.</p>
        )}
      </section>

      {goals.length > 0 && (
        <section className="panel recap-block">
          <h2>Objectifs d'épargne</h2>
          <div className="budget-list compact goals">{goals.map((g) => <GoalCard key={g.id} g={g} />)}</div>
        </section>
      )}

      <p className="muted small recap-foot">Édité le {shortDate(new Date().toISOString().slice(0, 10))} · virements entre comptes exclus des revenus et dépenses.</p>
    </div>
  );
}
