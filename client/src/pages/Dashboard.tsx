import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, type Budget, type Forecast, type Goal, type Stats, type Transaction } from '../api';
import { useStore } from '../store';
import { currentMonth, money, moneyRound, monthLabel, signed } from '../format';
import MonthPicker from '../components/MonthPicker';
import TxRow from '../components/TxRow';
import BudgetBar from '../components/BudgetBar';
import GoalCard from '../components/GoalCard';
import ForecastLine from '../components/ForecastLine';
import SubscriptionsCard from '../components/SubscriptionsCard';

export default function Dashboard() {
  const { month, version, user } = useStore();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [forecast, setForecast] = useState<Forecast | null>(null);

  useEffect(() => {
    api.get<Stats>(`/stats?month=${month}`).then(setStats);
    api.get<Transaction[]>(`/transactions?month=${month}&limit=6`).then(setRecent);
    api.get<Budget[]>(`/budgets?month=${month}`).then(setBudgets);
    api.get<Goal[]>('/goals').then(setGoals);
    // prévision : mois en cours uniquement
    if (month === currentMonth()) api.get<Forecast>(`/forecast?month=${month}`).then(setForecast).catch(() => setForecast(null));
    else setForecast(null);
  }, [month, version]);

  if (!stats) return <div className="page"><p className="muted">Chargement…</p></div>;

  const remaining = stats.income - stats.expenses;
  const spentShare = stats.income > 0 ? Math.min(stats.expenses / stats.income, 1) : 1;
  const empty = stats.income === 0 && stats.expenses === 0;

  return (
    <div className="page">
      <header className="page-head">
        <h1>Bonjour {user?.name}</h1>
        <MonthPicker />
      </header>

      {/* L'élément fort : le reste du mois + où est passé l'argent */}
      <section className="hero" aria-label="Résumé du mois">
        <p className="hero-label">{remaining >= 0 ? 'Reste ce mois-ci' : 'Dépassement ce mois-ci'}</p>
        <p className={`hero-figure ${remaining < 0 ? 'neg' : ''}`}>{money(Math.abs(remaining))}</p>
        {forecast && !forecast.is_past && <ForecastLine f={forecast} />}

        {empty ? (
          <p className="hero-empty">Aucune opération en {monthLabel(month).toLowerCase()}. Ajoute ton salaire et tes premières dépenses pour voir ton mois prendre forme.</p>
        ) : (
          <>
            <div className="spend-strip" role="img"
              aria-label={`Dépensé ${money(stats.expenses)} sur ${money(stats.income)} de revenus`}>
              <div className="spend-strip-used" style={{ width: `${spentShare * 100}%` }}>
                {stats.byCategory.map((c) => (
                  <span key={c.id ?? 'none'} title={`${c.name} : ${money(c.total)}`}
                    style={{ flexGrow: c.total, background: c.color }} />
                ))}
              </div>
            </div>
            <div className="hero-split">
              <div><span className="dot in" />Revenus <strong>{money(stats.income)}</strong></div>
              <div><span className="dot out" />Dépenses <strong>{money(stats.expenses)}</strong></div>
              <div className="hero-total">Solde total <strong>{money(stats.balance)}</strong></div>
            </div>
            <ul className="legend">
              {stats.byCategory.slice(0, 6).map((c) => (
                <li key={c.id ?? 'none'}>
                  <span className="swatch" style={{ background: c.color }} />
                  {c.name}
                  <span className="legend-val">{moneyRound(c.total)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {stats.upcoming_count > 0 && (
          <p className="hero-upcoming">
            À venir ce mois-ci : <strong className={stats.upcoming > 0 ? 'in' : ''}>{signed(stats.upcoming)}</strong>
            <span className="muted small"> · {stats.upcoming_count} opération{stats.upcoming_count > 1 ? 's' : ''} récurrente{stats.upcoming_count > 1 ? 's' : ''}</span>
          </p>
        )}
      </section>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <h2>Six derniers mois</h2>
          </div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={stats.trend.map((t) => ({ ...t, label: monthLabel(t.month, true) }))} barGap={2}>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="var(--ink-2)" />
                <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--ink-2)" width={48}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}k` : v)} />
                <Tooltip formatter={(v) => money(Number(v))} cursor={{ fill: 'var(--wash)' }}
                  contentStyle={{ borderRadius: 10, border: '1px solid var(--line)', fontFamily: 'inherit' }} />
                <Bar dataKey="income" name="Revenus" fill="var(--in)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="Dépenses" fill="var(--out)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Budgets</h2>
            <Link to="/budgets" className="link">Gérer</Link>
          </div>
          {budgets.length === 0 ? (
            <p className="muted">Fixe un plafond mensuel par catégorie pour être alerté avant de le dépasser. <Link to="/budgets" className="link">Créer un budget</Link></p>
          ) : (
            <div className="budget-list compact">
              {budgets.slice(0, 4).map((b) => <BudgetBar key={b.id} b={b} />)}
            </div>
          )}
        </section>
      </div>

      <SubscriptionsCard version={version} />

      {goals.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2>Objectifs d'épargne</h2>
            <Link to="/comptes#objectifs" className="link">Gérer</Link>
          </div>
          <div className="budget-list compact goals">
            {goals.map((g) => <GoalCard key={g.id} g={g} />)}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>Dernières opérations</h2>
          <Link to="/transactions" className="link">Tout voir</Link>
        </div>
        {recent.length === 0 ? <p className="muted">Rien pour ce mois.</p> : (
          <ul className="tx-list">{recent.map((t) => <TxRow key={t.id} tx={t} />)}</ul>
        )}
        {stats.net !== 0 && <p className="muted small net-line">Solde net du mois : {signed(stats.net)}</p>}
      </section>
    </div>
  );
}
