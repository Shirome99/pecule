import { useEffect, useMemo, useState } from 'react';
import { api, getToken, type Transaction } from '../api';
import { useStore } from '../store';
import { dayLabel, money } from '../format';
import MonthPicker from '../components/MonthPicker';
import TxRow from '../components/TxRow';

export default function Transactions() {
  const { month, version, accounts, categories } = useStore();
  const [txs, setTxs] = useState<Transaction[] | null>(null);
  const [q, setQ] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');

  useEffect(() => {
    const p = new URLSearchParams({ month });
    if (q) p.set('q', q);
    if (accountId) p.set('account_id', accountId);
    if (categoryId) p.set('category_id', categoryId);
    const t = setTimeout(() => api.get<Transaction[]>(`/transactions?${p}`).then(setTxs), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [month, version, q, accountId, categoryId]);

  const groups = useMemo(() => {
    const m = new Map<string, Transaction[]>();
    for (const t of txs ?? []) m.set(t.date, [...(m.get(t.date) ?? []), t]);
    return [...m.entries()];
  }, [txs]);

  const totalIn = (txs ?? []).filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalOut = (txs ?? []).filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0);

  async function exportCsv() {
    const res = await fetch('/api/export.csv', { headers: { Authorization: `Bearer ${getToken()}` } });
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: 'operations.csv' });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Opérations</h1>
        <MonthPicker />
      </header>

      <div className="filters">
        <input type="search" placeholder="Rechercher un libellé" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" />
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Catégorie">
          <option value="">Toutes catégories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
        {accounts.length > 1 && (
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Compte">
            <option value="">Tous comptes</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        <button className="btn ghost" onClick={exportCsv}>Exporter en CSV</button>
      </div>

      <p className="totals">
        <span>Entrées <strong className="in">{money(totalIn)}</strong></span>
        <span>Sorties <strong className="out">{money(totalOut)}</strong></span>
      </p>

      {txs === null ? <p className="muted">Chargement…</p> : groups.length === 0 ? (
        <div className="empty">
          <p>Aucune opération ne correspond.</p>
          <p className="muted small">Change de mois, retire un filtre ou ajoute une opération avec le bouton +.</p>
        </div>
      ) : (
        groups.map(([date, list]) => (
          <section key={date} className="day">
            <h2 className="day-head">
              <span>{dayLabel(date)}</span>
              <span className="muted">{money(list.reduce((s, t) => s + t.amount, 0))}</span>
            </h2>
            <ul className="tx-list">{list.map((t) => <TxRow key={t.id} tx={t} showAccount={accounts.length > 1} />)}</ul>
          </section>
        ))
      )}
    </div>
  );
}
