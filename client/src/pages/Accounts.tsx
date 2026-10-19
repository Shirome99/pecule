import { useState, type FormEvent } from 'react';
import { api, type Account, type AccountType } from '../api';
import { useStore } from '../store';
import { ACCOUNT_TYPES, money } from '../format';
import Modal from '../components/Modal';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#8b5cf6', '#f97316', '#0ea5e9', '#6b7280'];

export default function Accounts() {
  const { accounts, categories, refresh } = useStore();
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const [newCat, setNewCat] = useState(false);
  const total = accounts.reduce((s, a) => s + a.balance, 0);

  async function removeCategory(id: number, name: string) {
    if (!confirm(`Supprimer la catégorie ${name} ? Ses opérations deviendront « Sans catégorie ».`)) return;
    await api.del(`/categories/${id}`);
    refresh();
  }

  return (
    <div className="page">
      <header className="page-head"><h1>Comptes</h1></header>

      <section className="panel">
        <div className="panel-head">
          <h2>Mes comptes</h2>
          <span className="muted">Total <strong className="ink">{money(total)}</strong></span>
        </div>
        <ul className="account-list">
          {accounts.map((a) => (
            <li key={a.id}>
              <button className="account-row" onClick={() => setEditing(a)}>
                <span>
                  <span className="tx-label">{a.name}</span>
                  <span className="tx-meta">{ACCOUNT_TYPES[a.type]}</span>
                </span>
                <span className={`tx-amount ${a.balance < 0 ? 'out' : ''}`}>{money(a.balance)}</span>
              </button>
            </li>
          ))}
        </ul>
        <button className="btn ghost" onClick={() => setEditing('new')}>+ Ajouter un compte</button>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Catégories</h2>
          <button className="link" onClick={() => setNewCat(true)}>Ajouter</button>
        </div>
        {(['expense', 'income'] as const).map((k) => (
          <div key={k} className="cat-group">
            <h3>{k === 'expense' ? 'Dépenses' : 'Revenus'}</h3>
            <div className="chips">
              {categories.filter((c) => c.kind === k).map((c) => (
                <span key={c.id} className="chip static" style={{ '--chip': c.color } as React.CSSProperties}>
                  <span aria-hidden>{c.icon}</span> {c.name}
                  <button className="chip-x" onClick={() => removeCategory(c.id, c.name)} aria-label={`Supprimer ${c.name}`}>✕</button>
                </span>
              ))}
            </div>
          </div>
        ))}
      </section>

      {editing && <AccountForm account={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {newCat && <CategoryForm onClose={() => setNewCat(false)} />}
    </div>
  );
}

function AccountForm({ account, onClose }: { account?: Account; onClose: () => void }) {
  const { refresh } = useStore();
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'courant');
  const [initial, setInitial] = useState(account ? String(account.initial_balance) : '0');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = { name, type, initial_balance: Number(initial.replace(',', '.')) || 0 };
    try {
      if (account) await api.put(`/accounts/${account.id}`, body);
      else await api.post('/accounts', body);
      refresh();
      onClose();
    } catch (err) { setError((err as Error).message); }
  }

  async function remove() {
    if (!account || !confirm(`Supprimer ${account.name} et toutes ses opérations ?`)) return;
    try {
      await api.del(`/accounts/${account.id}`);
      refresh();
      onClose();
    } catch (err) { setError((err as Error).message); }
  }

  return (
    <Modal title={account ? 'Modifier le compte' : 'Nouveau compte'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label className="field"><span>Nom</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Boursorama" required />
        </label>
        <label className="field"><span>Type</span>
          <select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {Object.entries(ACCOUNT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="field"><span>Solde de départ</span>
          <div className="amount-input">
            <input inputMode="decimal" value={initial} onChange={(e) => setInitial(e.target.value)} />
            <span>€</span>
          </div>
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions">
          {account && <button type="button" className="btn ghost danger" onClick={remove}>Supprimer</button>}
          <button className="btn primary">Enregistrer</button>
        </div>
      </form>
    </Modal>
  );
}

function CategoryForm({ onClose }: { onClose: () => void }) {
  const { refresh } = useStore();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [icon, setIcon] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post('/categories', { name, kind, color, icon: icon || '•' });
      refresh();
      onClose();
    } catch (err) { setError((err as Error).message); }
  }

  return (
    <Modal title="Nouvelle catégorie" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="segmented">
          {(['expense', 'income'] as const).map((k) => (
            <button type="button" key={k} className={kind === k ? `on ${k}` : ''} onClick={() => setKind(k)}>
              {k === 'expense' ? 'Dépense' : 'Revenu'}
            </button>
          ))}
        </div>
        <div className="row-2">
          <label className="field" style={{ flex: '0 0 5rem' }}><span>Emoji</span>
            <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} placeholder="🎁" />
          </label>
          <label className="field"><span>Nom</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
        </div>
        <div className="field"><span>Couleur</span>
          <div className="swatches">
            {COLORS.map((c) => (
              <button type="button" key={c} className={`swatch-btn ${c === color ? 'on' : ''}`}
                style={{ background: c }} onClick={() => setColor(c)} aria-label={c} aria-pressed={c === color} />
            ))}
          </div>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions"><button className="btn primary">Ajouter</button></div>
      </form>
    </Modal>
  );
}
