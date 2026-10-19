import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type Group, type SplitMode } from '../api';
import { useStore } from '../store';
import { money, shortDate, today } from '../format';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';

const parse = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'));
const MODES: { value: SplitMode; label: string }[] = [
  { value: 'equal', label: 'Parts égales' }, { value: 'amounts', label: 'Montants' }, { value: 'percent', label: '%' },
];

/** Un groupe de dépenses partagées : soldes, remboursements à faire, dépenses. */
export default function GroupPage() {
  const { id } = useParams();
  const { refresh } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [group, setGroup] = useState<Group | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [newMember, setNewMember] = useState('');

  useEffect(() => {
    api.get<Group>(`/groups/${id}`).then(setGroup).catch((e) => setError((e as Error).message));
  }, [id]);

  if (error) return <div className="page"><p className="form-error" role="alert">{error}</p><Link to="/comptes" className="link">‹ Comptes</Link></div>;
  if (!group) return <div className="page"><p className="muted">Chargement…</p></div>;

  const name = (memberId: number) => {
    const m = group.members.find((x) => x.id === memberId);
    return m ? m.name : '?';
  };
  // l'utilisateur est désigné par son prénom, avec « toi » pour s'y retrouver
  const label = (memberId: number) => (group.members.find((x) => x.id === memberId)?.is_me ? `${name(memberId)} (toi)` : name(memberId));
  const act = async (p: Promise<Group>, message: string) => {
    try {
      setGroup(await p);
      refresh();
      toast({ message, kind: 'success', duration: 3000 });
    } catch (e) { toast({ message: (e as Error).message, kind: 'error' }); }
  };

  async function addMember(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post(`/groups/${group!.id}/members`, { name: newMember });
      setNewMember('');
      setGroup(await api.get<Group>(`/groups/${group!.id}`));
    } catch (err) { toast({ message: (err as Error).message, kind: 'error' }); }
  }

  async function removeGroup() {
    if (!confirm(`Supprimer le groupe ${group!.name} ? Les opérations déjà créées sur tes comptes restent.`)) return;
    await api.del(`/groups/${group!.id}`);
    navigate('/comptes#partages');
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <Link to="/comptes#partages" className="link small back-link">‹ Comptes</Link>
          <h1>{group.name}</h1>
        </div>
        <button className="btn primary" onClick={() => setAdding(true)}>+ Ajouter une dépense</button>
      </header>
      <p className="muted">{group.expenses.length} dépense{group.expenses.length > 1 ? 's' : ''} · {money(group.total)} en tout</p>

      <section className="panel">
        <h2>Pour tout solder</h2>
        {group.suggestions.length === 0 ? <p className="muted">Tout le monde est quitte.</p> : (
          <ul className="rec-list">
            {group.suggestions.map((s) => (
              <li key={`${s.from}-${s.to}`} className="rec-row">
                <span className="tx-main"><span className="tx-label">{name(s.from)} doit {money(s.amount)} à {name(s.to)}</span></span>
                <span className="rec-actions">
                  <button className="btn ghost" onClick={() => act(api.post<Group>(`/groups/${group.id}/settlements`, { ...s, date: today() }), 'Remboursement enregistré.')}>
                    Marquer comme remboursé
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Soldes</h2>
        <ul className="account-list">
          {group.members.map((m) => (
            <li key={m.id} className="balance-row">
              <span className="tx-label">{label(m.id)}</span>
              <span className={`tx-amount ${m.balance > 0 ? 'in' : m.balance < 0 ? 'out' : ''}`}>
                {m.balance > 0 ? `on lui doit ${money(m.balance)}` : m.balance < 0 ? `doit ${money(-m.balance)}` : 'quitte'}
              </span>
            </li>
          ))}
        </ul>
        <form className="row-2 add-member" onSubmit={addMember}>
          <label className="field"><span>Ajouter quelqu'un</span>
            <input value={newMember} onChange={(e) => setNewMember(e.target.value)} placeholder="Prénom" required />
          </label>
          <button className="btn ghost">Ajouter</button>
        </form>
      </section>

      <section className="panel">
        <h2>Dépenses</h2>
        {group.expenses.length === 0 ? <p className="muted">Aucune dépense. Ajoute la première : qui a payé, combien, et comment partager.</p> : (
          <ul className="rec-list">
            {group.expenses.map((e) => {
              const me = group.members.find((m) => m.is_me)!;
              const mine = e.shares.find((s) => s.member_id === me.id)?.share ?? 0;
              return (
                <li key={e.id} className="rec-row">
                  <span className="tx-main">
                    <span className="tx-label">{e.label}</span>
                    <span className="tx-meta">{shortDate(e.date)} · payé par {label(e.paid_by)} · ta part {money(mine)}</span>
                  </span>
                  <span className="tx-amount">{money(e.amount)}</span>
                  <span className="rec-actions">
                    <button className="btn ghost danger" aria-label={`Supprimer ${e.label}`}
                      onClick={() => act(api.del<Group>(`/groups/${group.id}/expenses/${e.id}`), 'Dépense supprimée.')}>Supprimer</button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {group.settlements.length > 0 && (
        <section className="panel">
          <h2>Remboursements faits</h2>
          <ul className="rec-list">
            {group.settlements.map((s) => (
              <li key={s.id} className="rec-row">
                <span className="tx-main">
                  <span className="tx-label">{name(s.from)} a remboursé {money(s.amount)} à {name(s.to)}</span>
                  <span className="tx-meta">{shortDate(s.date)}</span>
                </span>
                <span className="rec-actions">
                  <button className="btn ghost" onClick={() => act(api.del<Group>(`/groups/${group.id}/settlements/${s.id}`), 'Remboursement annulé.')}>Annuler</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button className="btn ghost danger" onClick={removeGroup}>Supprimer le groupe</button>

      {adding && <ExpenseForm group={group} onClose={() => setAdding(false)} onSaved={(g) => { setGroup(g); refresh(); setAdding(false); }} />}
    </div>
  );
}

function ExpenseForm({ group, onClose, onSaved }: { group: Group; onClose: () => void; onSaved: (g: Group) => void }) {
  const { accounts, categories } = useStore();
  const me = group.members.find((m) => m.is_me)!;
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [paidBy, setPaidBy] = useState(me.id);
  const [mode, setMode] = useState<SplitMode>('equal');
  const [participants, setParticipants] = useState(group.members.map((m) => m.id));
  const [values, setValues] = useState<Record<number, string>>({});
  const [accountId, setAccountId] = useState(accounts.find((a) => a.family === 'liquid')?.id ?? 0);
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const total = parse(amount);
    if (!total || total <= 0) return setError('Saisis un montant supérieur à 0.');
    const body = {
      label, date, amount: total, paid_by: paidBy, split_mode: mode,
      ...(mode === 'equal' ? { participants } : { values: Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()).map(([k, v]) => [k, parse(v)])) }),
      ...(paidBy === me.id ? { account_id: accountId, category_id: categoryId || null } : {}),
    };
    try { onSaved(await api.post<Group>(`/groups/${group.id}/expenses`, body)); } catch (err) { setError((err as Error).message); }
  }

  return (
    <Modal title="Nouvelle dépense partagée" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label className="field amount-field"><span>Montant total</span>
          <div className="amount-input">
            <input inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            <span>€</span>
          </div>
        </label>
        <label className="field"><span>Libellé</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. Courses, Airbnb" required />
        </label>
        <div className="row-2">
          <label className="field"><span>Payé par</span>
            <select value={paidBy} onChange={(e) => setPaidBy(Number(e.target.value))}>
              {group.members.map((m) => <option key={m.id} value={m.id}>{m.is_me ? `${m.name} (toi)` : m.name}</option>)}
            </select>
          </label>
          <label className="field"><span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
        </div>

        <div className="field">
          <span id="split-title">Partage</span>
          <div className="segmented" role="radiogroup" aria-labelledby="split-title">
            {MODES.map((m) => (
              <button type="button" key={m.value} role="radio" aria-checked={mode === m.value} className={mode === m.value ? 'on' : ''} onClick={() => setMode(m.value)}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <ul className="split-list">
          {group.members.map((m) => (
            <li key={m.id}>
              {mode === 'equal' ? (
                <label className="check">
                  <input type="checkbox" checked={participants.includes(m.id)}
                    onChange={(e) => setParticipants(e.target.checked ? [...participants, m.id] : participants.filter((x) => x !== m.id))} />
                  <span>{m.is_me ? `${m.name} (toi)` : m.name}</span>
                </label>
              ) : (
                <label className="split-value">
                  <span>{m.is_me ? `${m.name} (toi)` : m.name}</span>
                  <span className="amount-input">
                    <input inputMode="decimal" placeholder="0" value={values[m.id] ?? ''} aria-label={`Part de ${m.name}`}
                      onChange={(e) => setValues({ ...values, [m.id]: e.target.value })} />
                    <span>{mode === 'percent' ? '%' : '€'}</span>
                  </span>
                </label>
              )}
            </li>
          ))}
        </ul>

        {paidBy === me.id && (
          <>
            <p className="muted small">Tu as payé : seule ta part devient une dépense sur ton compte, le reste t'est dû.</p>
            <div className="row-2">
              <label className="field"><span>Payé depuis</span>
                <select value={accountId} onChange={(e) => setAccountId(Number(e.target.value))}>
                  {accounts.filter((a) => a.family === 'liquid').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
              <label className="field"><span>Catégorie de ta part</span>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">Sans catégorie</option>
                  {categories.filter((c) => c.kind === 'expense').map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              </label>
            </div>
          </>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions"><button className="btn primary">Ajouter</button></div>
      </form>
    </Modal>
  );
}
