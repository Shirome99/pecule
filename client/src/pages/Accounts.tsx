import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, type Account, type Goal, type Recurring } from '../api';
import { useStore } from '../store';
import { ACCOUNT_TYPES, FAMILIES, frequencyLabel, money, percent, shortDate, signed } from '../format';
import Modal from '../components/Modal';
import GoalCard from '../components/GoalCard';
import { AccountForm, InvestmentSheet, LoanSheet } from '../components/AccountSheets';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#8b5cf6', '#f97316', '#0ea5e9', '#6b7280'];

export default function Accounts() {
  const { accounts, categories, refresh } = useStore();
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const [viewing, setViewing] = useState<Account | null>(null);
  const [newCat, setNewCat] = useState(false);
  // la fiche ouverte suit les données rechargées (valeur mise à jour…)
  const viewed = viewing && accounts.find((a) => a.id === viewing.id);
  const open = (a: Account) => (a.family === 'liquid' ? setEditing(a) : setViewing(a));

  async function removeCategory(id: number, name: string) {
    if (!confirm(`Supprimer la catégorie ${name} ? Ses opérations deviendront « Sans catégorie ».`)) return;
    await api.del(`/categories/${id}`);
    refresh();
  }

  return (
    <div className="page">
      <header className="page-head"><h1>Comptes</h1></header>

      {(Object.keys(FAMILIES) as (keyof typeof FAMILIES)[]).map((family) => {
        const list = accounts.filter((a) => a.family === family);
        if (family !== 'liquid' && list.length === 0) return null;
        return (
          <section key={family} className="panel" aria-label={FAMILIES[family].label}>
            <div className="panel-head">
              <h2>{FAMILIES[family].label}</h2>
              <span className="muted">Total <strong className={family === 'debt' ? 'out' : 'ink'}>{money(list.reduce((t, a) => t + a.balance, 0))}</strong></span>
            </div>
            <ul className="account-list">
              {list.map((a) => (
                <li key={a.id}>
                  <button className="account-row" onClick={() => open(a)}>
                    <span>
                      <span className="tx-label">{a.name}</span>
                      <span className="tx-meta">
                        {ACCOUNT_TYPES[a.type]}
                        {a.family === 'investment' && a.gain_pct != null && <> · <span className={(a.gain ?? 0) >= 0 ? 'in' : 'out'}>{percent(a.gain_pct)}</span></>}
                      </span>
                    </span>
                    <span className={`tx-amount ${a.balance < 0 ? 'out' : ''}`}>{money(a.balance)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {family === 'liquid' && (
              <div className="row-actions">
                <button className="btn ghost" onClick={() => setEditing('new')}>+ Ajouter un compte</button>
                <Link to="/patrimoine" className="link">Voir mon patrimoine</Link>
              </div>
            )}
          </section>
        );
      })}

      <GoalsSection />

      <RecurringSection />

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
      {viewed && !editing && viewed.family === 'investment' && (
        <InvestmentSheet account={viewed} onEdit={() => setEditing(viewed)} onClose={() => setViewing(null)} />
      )}
      {viewed && !editing && viewed.family === 'debt' && (
        <LoanSheet account={viewed} onEdit={() => setEditing(viewed)} onClose={() => setViewing(null)} />
      )}
      {newCat && <CategoryForm onClose={() => setNewCat(false)} />}
    </div>
  );
}

function GoalsSection() {
  const { version } = useStore();
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [editing, setEditing] = useState<Goal | 'new' | null>(null);
  const [contributing, setContributing] = useState<Goal | null>(null);

  useEffect(() => {
    api.get<Goal[]>('/goals').then(setGoals).catch(() => setGoals([]));
  }, [version]);

  // lien « Gérer » depuis l'Aperçu (/comptes#objectifs)
  const loaded = goals !== null;
  useEffect(() => {
    if (loaded && window.location.hash === '#objectifs') document.getElementById('objectifs')?.scrollIntoView();
  }, [loaded]);

  return (
    <section className="panel" id="objectifs">
      <div className="panel-head">
        <h2>Objectifs d'épargne</h2>
        {goals && goals.length > 0 && <button className="link" onClick={() => setEditing('new')}>Ajouter</button>}
      </div>
      {goals === null ? <p className="muted">Chargement…</p> : goals.length === 0 ? (
        <>
          <p className="muted">Un voyage, un apport, un coussin de sécurité ? Fixe un montant et une date : Pécule te dit combien mettre de côté chaque mois.</p>
          <button className="btn ghost" onClick={() => setEditing('new')}>+ Créer un objectif</button>
        </>
      ) : (
        <div className="budget-list">
          {goals.map((g) => (
            <div key={g.id} className="goal-item">
              <GoalCard g={g} onEdit={() => setEditing(g)} />
              {!g.account_id && (
                <button className="btn ghost goal-add" onClick={() => setContributing(g)}>+ Ajouter un versement</button>
              )}
            </div>
          ))}
        </div>
      )}
      {editing && <GoalForm goal={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {contributing && <ContributionForm goal={contributing} onClose={() => setContributing(null)} />}
    </section>
  );
}

const parseNumber = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'));

function GoalForm({ goal, onClose }: { goal?: Goal; onClose: () => void }) {
  const { accounts, refresh } = useStore();
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(goal ? String(goal.target_amount).replace('.', ',') : '');
  const [date, setDate] = useState(goal?.target_date ?? '');
  const [accountId, setAccountId] = useState<number | ''>(goal?.account_id ?? '');
  const [saved, setSaved] = useState(goal ? String(goal.saved).replace('.', ',') : '0');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = {
      name, target_amount: parseNumber(target), target_date: date || null, account_id: accountId || null,
      ...(accountId ? {} : { saved: parseNumber(saved) || 0 }),
    };
    try {
      if (goal) await api.put(`/goals/${goal.id}`, body);
      else await api.post('/goals', body);
      refresh();
      onClose();
    } catch (err) { setError((err as Error).message); }
  }

  async function remove() {
    if (!goal || !confirm(`Supprimer l'objectif ${goal.name} ? Ton argent ne bouge pas.`)) return;
    await api.del(`/goals/${goal.id}`);
    refresh();
    onClose();
  }

  return (
    <Modal title={goal ? 'Modifier l’objectif' : 'Nouvel objectif'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label className="field"><span>Nom</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Vacances d'été" required />
        </label>
        <div className="row-2">
          <label className="field"><span>Montant cible</span>
            <div className="amount-input">
              <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0" required />
              <span>€</span>
            </div>
          </label>
          <label className="field"><span>Date cible (facultatif)</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <label className="field"><span>Progression</span>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Je note mes versements à la main</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>Solde de {a.name}</option>)}
          </select>
        </label>
        {!accountId && (
          <label className="field"><span>Déjà mis de côté</span>
            <div className="amount-input">
              <input inputMode="decimal" value={saved} onChange={(e) => setSaved(e.target.value)} />
              <span>€</span>
            </div>
          </label>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions">
          {goal && <button type="button" className="btn ghost danger" onClick={remove}>Supprimer</button>}
          <button className="btn primary">Enregistrer</button>
        </div>
      </form>
    </Modal>
  );
}

function ContributionForm({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const { refresh } = useStore();
  const [way, setWay] = useState<'in' | 'out'>('in');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = parseNumber(amount);
    if (!value || value <= 0) return setError('Saisis un montant supérieur à 0.');
    try {
      await api.post(`/goals/${goal.id}/contributions`, { amount: way === 'in' ? value : -value });
      refresh();
      onClose();
    } catch (err) { setError((err as Error).message); }
  }

  return (
    <Modal title={goal.name} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="segmented" role="radiogroup" aria-label="Sens">
          {(['in', 'out'] as const).map((w) => (
            <button type="button" key={w} role="radio" aria-checked={way === w}
              className={way === w ? `on ${w === 'in' ? 'income' : 'expense'}` : ''} onClick={() => setWay(w)}>
              {w === 'in' ? 'Verser' : 'Retirer'}
            </button>
          ))}
        </div>
        <label className="field amount-field"><span>Montant</span>
          <div className="amount-input">
            <input inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            <span>€</span>
          </div>
        </label>
        <p className="muted small">Déjà mis de côté : {money(goal.saved)}</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions"><button className="btn primary">Valider</button></div>
      </form>
    </Modal>
  );
}

function RecurringSection() {
  const { version, refresh } = useStore();
  const [items, setItems] = useState<Recurring[] | null>(null);

  useEffect(() => {
    api.get<Recurring[]>('/recurring').then(setItems).catch(() => setItems([]));
  }, [version]);

  async function togglePause(r: Recurring) {
    await api.put(`/recurring/${r.id}`, { paused: !r.paused });
    refresh();
  }

  async function remove(r: Recurring) {
    if (!confirm(`Arrêter « ${r.label} » ? Les opérations déjà passées sont conservées.`)) return;
    await api.del(`/recurring/${r.id}`);
    refresh();
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Opérations récurrentes</h2>
        <Link to="/abonnements" className="link">Abonnements détectés</Link>
      </div>
      {items === null ? <p className="muted">Chargement…</p> : items.length === 0 ? (
        <p className="muted">Aucune pour l'instant. Coche « Répéter chaque mois » en ajoutant une opération : loyer, salaire, abonnements…</p>
      ) : (
        <ul className="rec-list">
          {items.map((r) => (
            <li key={r.id} className={`rec-row ${r.paused ? 'paused' : ''}`}>
              {r.to_account_id ? <span className="tx-icon transfer" aria-hidden>⇄</span> : (
                <span className="tx-icon" style={{ background: `${r.category_color ?? '#9ca3af'}22`, color: r.category_color ?? '#6b7280' }} aria-hidden>
                  {r.category_icon ?? '•'}
                </span>
              )}
              <span className="tx-main">
                <span className="tx-label">{r.label}</span>
                <span className="tx-meta">
                  {frequencyLabel(r.frequency, r.day, r.start_date)} · {r.to_account_id ? `${r.account_name} → ${r.to_account_name}` : r.account_name}
                  {r.paused ? ' · En pause' : r.next_date && ` · prochaine le ${shortDate(r.next_date)}`}
                </span>
              </span>
              {r.to_account_id
                ? <span className="tx-amount transfer">{money(Math.abs(r.amount))}</span>
                : <span className={`tx-amount ${r.amount > 0 ? 'in' : ''}`}>{signed(r.amount)}</span>}
              <span className="rec-actions">
                <button className="btn ghost" onClick={() => togglePause(r)}>{r.paused ? 'Reprendre' : 'Mettre en pause'}</button>
                <button className="btn ghost danger" onClick={() => remove(r)} aria-label={`Supprimer ${r.label}`}>Supprimer</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
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
