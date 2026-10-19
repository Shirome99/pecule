import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type TagSummary, type Transaction } from '../api';
import { useStore } from '../store';
import { money, moneyRound, periodLabel } from '../format';
import TxRow from '../components/TxRow';

/** Bilan d'un tag : « #vacances-maroc : 1 840 € du 2 au 16 août », répartition par catégorie et opérations. */
export default function TagPage() {
  const { name = '' } = useParams();
  const { version, accounts } = useStore();
  const [summary, setSummary] = useState<TagSummary | null>(null);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    api.get<TagSummary>(`/tags/${encodeURIComponent(name)}`).then(setSummary).catch((e) => { setSummary(null); setError((e as Error).message); });
    api.get<Transaction[]>(`/transactions?tag=${encodeURIComponent(name)}&limit=2000`).then(setTxs).catch(() => setTxs([]));
  }, [name, version]);

  const max = summary?.byCategory[0]?.total ?? 0;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <Link to={`/transactions?tag=${encodeURIComponent(name)}`} className="link small back-link">‹ Opérations</Link>
          <h1>#{name}</h1>
        </div>
      </header>

      {error && <div className="empty"><p>{error}</p><p className="muted small">Ajoute ce tag à une opération depuis son formulaire.</p></div>}
      {!summary && !error && <p className="muted">Chargement…</p>}

      {summary && (
        <>
          <section className="hero" aria-label="Bilan du tag">
            <p className="hero-label">Dépensé {periodLabel(summary.from, summary.to)}</p>
            <p className="hero-figure">{money(summary.total)}</p>
            <p className="muted">
              {summary.count} opération{summary.count > 1 ? 's' : ''}
              {summary.income > 0 && <> · <span className="in">{money(summary.income)}</span> reçus</>}
            </p>
          </section>

          {summary.byCategory.length > 0 && (
            <section className="panel">
              <h2>Par catégorie</h2>
              <ul className="nw-split">
                {summary.byCategory.map((c) => (
                  <li key={c.id ?? 'none'}>
                    <div className="nw-split-top">
                      <span><span aria-hidden>{c.icon}</span> {c.name}</span>
                      <strong>{moneyRound(c.total)}</strong>
                    </div>
                    <div className="budget-track" aria-hidden>
                      <div className="budget-fill" style={{ width: `${max ? (c.total / max) * 100 : 0}%`, background: c.color }} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="panel">
            <h2>Opérations</h2>
            <ul className="tx-list">{txs.map((t) => <TxRow key={t.id} tx={t} showAccount={accounts.length > 1} showDate />)}</ul>
          </section>
        </>
      )}
    </div>
  );
}
