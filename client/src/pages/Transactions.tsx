import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { api, downloadExport, type Tag, type Transaction } from '../api';
import { useStore } from '../store';
import { dayLabel, money } from '../format';
import MonthPicker from '../components/MonthPicker';
import TxRow from '../components/TxRow';
import ImportModal from '../components/ImportModal';

export default function Transactions() {
  const { month, version, accounts, categories } = useStore();
  const [txs, setTxs] = useState<Transaction[] | null>(null);
  const [q, setQ] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [importing, setImporting] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  // filtre par tag dans l'URL (?tag=…) : lien depuis la page d'un tag
  const [params, setParams] = useSearchParams();
  const tag = params.get('tag') ?? '';
  const setTag = (t: string) => setParams(t ? { tag: t } : {}, { replace: true });
  // raccourci « / » depuis une autre page : le curseur arrive dans la recherche
  const focusSearch = !!(useLocation().state as { focusSearch?: boolean } | null)?.focusSearch;

  useEffect(() => {
    const p = new URLSearchParams({ month });
    if (q) p.set('q', q);
    if (accountId) p.set('account_id', accountId);
    if (categoryId) p.set('category_id', categoryId);
    if (tag) p.set('tag', tag);
    const t = setTimeout(() => api.get<Transaction[]>(`/transactions?${p}`).then(setTxs), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [month, version, q, accountId, categoryId, tag]);

  useEffect(() => { api.get<Tag[]>('/tags').then(setTags).catch(() => {}); }, [version]);

  const groups = useMemo(() => {
    const m = new Map<string, Transaction[]>();
    for (const t of txs ?? []) m.set(t.date, [...(m.get(t.date) ?? []), t]);
    return [...m.entries()];
  }, [txs]);

  // les virements ne sont ni des entrées ni des sorties (sauf vus depuis un compte précis)
  const counted = (t: Transaction) => !t.transfer_id || !!accountId;
  const totalIn = (txs ?? []).filter((t) => counted(t) && t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalOut = (txs ?? []).filter((t) => counted(t) && t.amount < 0).reduce((s, t) => s - t.amount, 0);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Opérations</h1>
        <MonthPicker />
      </header>

      <div className="filters">
        <input type="search" placeholder="Rechercher un libellé" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" aria-keyshortcuts="/" autoFocus={focusSearch} />
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
        {(tags.length > 0 || tag) && (
          <select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tag">
            <option value="">Tous les tags</option>
            {tag && !tags.some((t) => t.name === tag) && <option value={tag}>#{tag}</option>}
            {tags.map((t) => <option key={t.name} value={t.name}>#{t.name}</option>)}
          </select>
        )}
        <span className="filters-actions">
          <button className="btn ghost" onClick={() => setImporting(true)}>Importer</button>
          <button className="btn ghost" onClick={downloadExport}>Exporter en CSV</button>
        </span>
      </div>

      <p className="totals">
        <span>Entrées <strong className="in">{money(totalIn)}</strong></span>
        <span>Sorties <strong className="out">{money(totalOut)}</strong></span>
        {tag && <Link to={`/tags/${encodeURIComponent(tag)}`} className="link">Bilan de #{tag}, tous mois confondus</Link>}
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
              <span className="muted">{money(list.filter(counted).reduce((s, t) => s + t.amount, 0))}</span>
            </h2>
            <ul className="tx-list">{list.map((t) => <TxRow key={t.id} tx={t} showAccount={accounts.length > 1} />)}</ul>
          </section>
        ))
      )}

      {importing && <ImportModal onClose={() => setImporting(false)} />}
    </div>
  );
}
