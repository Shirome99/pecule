import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Subscription, type Subscriptions as Subs } from '../api';
import { useStore } from '../store';
import { money, moneyRound, shortDate } from '../format';

export default function Subscriptions() {
  const { version, refresh } = useStore();
  const [data, setData] = useState<Subs | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Subs>('/subscriptions').then(setData).catch((e) => setError((e as Error).message));
  }, [version]);

  async function act(path: 'ignore' | 'track', s: Subscription) {
    setError('');
    try {
      await api.post(`/subscriptions/${path}`, { key: s.key });
      refresh();
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <Link to="/" className="link small back-link">‹ Aperçu</Link>
          <h1>Abonnements</h1>
        </div>
      </header>

      {data && data.items.length > 0 && (
        <p className="totals">
          <span>Par mois <strong>{money(data.monthly_total)}</strong></span>
          <span>Par an <strong>{money(data.annual_total)}</strong></span>
        </p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}

      {data === null ? <p className="muted">Chargement…</p> : data.items.length === 0 ? (
        <div className="empty">
          <p>Aucun abonnement détecté.</p>
          <p className="muted small">
            Pécule repère les dépenses qui reviennent chaque mois (au moins 3 mois sur les 6 derniers) ou chaque année, avec un
            montant stable. Celles que tu suis déjà comme opérations récurrentes n’apparaissent pas ici.
          </p>
        </div>
      ) : (
        <ul className="sub-list">
          {data.items.map((s) => (
            <li key={s.key} className="panel sub-item">
              <div className="sub-top">
                <span className="tx-icon" style={{ background: `${s.category_color ?? '#9ca3af'}22`, color: s.category_color ?? '#6b7280' }} aria-hidden>
                  {s.category_icon ?? '•'}
                </span>
                <span className="tx-main">
                  <span className="tx-label">{s.label}</span>
                  <span className="tx-meta">
                    {s.frequency === 'monthly' ? 'Mensuel' : 'Annuel'} · prochain le {shortDate(s.next_date)}
                    {s.account_name && ` · ${s.account_name}`}
                  </span>
                </span>
                <span className="sub-cost">
                  <span><strong>{money(s.amount)}</strong>{s.frequency === 'monthly' ? '/mois' : '/an'}</span>
                  <span className="muted small">{moneyRound(s.annual_cost)}/an</span>
                </span>
              </div>
              {s.price_change && s.price_change.new_amount > s.price_change.old_amount && (
                <p className="sub-alert">
                  <span className="badge duplicate">Prix en hausse</span>
                  {money(s.price_change.old_amount)} → {money(s.price_change.new_amount)} depuis le {shortDate(s.price_change.date)}
                </p>
              )}
              <div className="rec-actions">
                <button className="btn ghost" onClick={() => act('track', s)}>Suivre comme récurrence</button>
                <button className="btn ghost" onClick={() => act('ignore', s)}>Ignorer</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
