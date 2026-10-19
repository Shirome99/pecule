import { useState, type FormEvent } from 'react';
import { api, type Transaction } from '../api';
import { useStore } from '../store';
import { today } from '../format';
import Modal from './Modal';
import { useUndoDelete } from '../useUndoDelete';

type Props = { tx?: Transaction; onClose: () => void };
type Kind = 'expense' | 'income' | 'transfer';
const KIND_LABELS: Record<Kind, string> = { expense: 'Dépense', income: 'Revenu', transfer: 'Virement' };

export default function TransactionForm({ tx, onClose }: Props) {
  const { accounts, categories, refresh } = useStore();
  const undoDelete = useUndoDelete();
  const [type, setType] = useState<Kind>(tx?.transfer_id ? 'transfer' : tx && tx.amount > 0 ? 'income' : 'expense');
  const [amount, setAmount] = useState(tx ? String(Math.abs(tx.amount)).replace('.', ',') : '');
  const [label, setLabel] = useState(tx?.label ?? '');
  const [date, setDate] = useState(tx?.date ?? today());
  const [accountId, setAccountId] = useState(tx?.account_id ?? accounts[0]?.id ?? 0);
  const [categoryId, setCategoryId] = useState<number | ''>(tx?.category_id ?? '');
  // virement : la ligne négative est le compte de départ
  const [fromId, setFromId] = useState(tx?.transfer_id ? (tx.amount < 0 ? tx.account_id : tx.peer_account_id!) : accounts[0]?.id ?? 0);
  const [toId, setToId] = useState(tx?.transfer_id ? (tx.amount < 0 ? tx.peer_account_id! : tx.account_id) : accounts[1]?.id ?? 0);
  const [repeat, setRepeat] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const cats = categories.filter((c) => c.kind === type);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const value = Number(amount.replace(/\s/g, '').replace(',', '.'));
    if (!value || value <= 0) return setError('Saisis un montant supérieur à 0.');
    if (type === 'transfer' && fromId === toId) return setError('Choisis deux comptes différents.');
    setSaving(true);
    try {
      if (type === 'transfer') {
        const body = { from_account_id: fromId, to_account_id: toId, amount: value, label, date };
        if (tx?.transfer_id) await api.put(`/transfers/${tx.transfer_id}`, body);
        else if (repeat) await api.post('/recurring', {
          type, account_id: fromId, to_account_id: toId, amount: value, label: label || 'Virement', frequency: 'monthly', start_date: date,
        });
        else await api.post('/transfers', body);
      } else {
        const body = { type, amount: value, label, date, account_id: accountId, category_id: categoryId || null };
        if (tx) await api.put(`/transactions/${tx.id}`, body);
        // récurrence : le serveur crée la règle et génère l'occurrence si la date est passée
        else if (repeat) await api.post('/recurring', { ...body, frequency: 'monthly', start_date: date });
        else await api.post('/transactions', body);
      }
      refresh();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  // pas de confirmation : le toast propose « Annuler » pendant 6 s
  async function remove() {
    if (!tx) return;
    onClose();
    await undoDelete(`/transactions/${tx.id}`, tx.transfer_id ? 'Virement supprimé.' : 'Opération supprimée.');
  }

  return (
    <Modal title={tx ? 'Modifier l’opération' : 'Nouvelle opération'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <div className="segmented" role="radiogroup" aria-label="Type">
          {(['expense', 'income', 'transfer'] as const).map((t) => (
            <button
              type="button" key={t} role="radio" aria-checked={type === t}
              className={type === t ? `on ${t}` : ''}
              // une opération existante ne change pas de nature (virement ↔ dépense/revenu)
              disabled={!!tx && (t === 'transfer') !== !!tx.transfer_id}
              onClick={() => { setType(t); setCategoryId(''); }}
            >
              {KIND_LABELS[t]}
            </button>
          ))}
        </div>

        <label className="field amount-field">
          <span>Montant</span>
          <div className="amount-input">
            <input inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            <span>€</span>
          </div>
        </label>

        <label className="field">
          <span>Libellé{type === 'transfer' && ' (facultatif)'}</span>
          <input
            placeholder={type === 'expense' ? 'Ex. Courses Monoprix' : type === 'income' ? 'Ex. Salaire octobre' : 'Virement'}
            value={label} onChange={(e) => setLabel(e.target.value)} required={type !== 'transfer'}
          />
        </label>

        {type === 'transfer' ? (
          accounts.length < 2 ? (
            <p className="muted small">Ajoute un deuxième compte (page Comptes) pour faire un virement.</p>
          ) : (
            <>
              <div className="row-2">
                <label className="field">
                  <span>De</span>
                  <select value={fromId} onChange={(e) => setFromId(Number(e.target.value))}>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Vers</span>
                  <select value={toId} onChange={(e) => setToId(Number(e.target.value))}>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
              </div>
              <label className="field">
                <span>Date</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </label>
            </>
          )
        ) : (
          <>
            <div className="field">
              <span>Catégorie</span>
              <div className="chips">
                {cats.map((c) => (
                  <button
                    type="button" key={c.id}
                    className={`chip ${categoryId === c.id ? 'on' : ''}`}
                    style={{ '--chip': c.color } as React.CSSProperties}
                    onClick={() => setCategoryId(categoryId === c.id ? '' : c.id)}
                  >
                    <span aria-hidden>{c.icon}</span> {c.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="row-2">
              <label className="field">
                <span>Date</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </label>
              <label className="field">
                <span>Compte</span>
                <select value={accountId} onChange={(e) => setAccountId(Number(e.target.value))}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
            </div>
          </>
        )}

        {!tx && !(type === 'transfer' && accounts.length < 2) && (
          <label className="check">
            <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
            <span>Répéter chaque mois{repeat && date && ` (le ${Number(date.slice(8))})`}</span>
          </label>
        )}

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="form-actions">
          {tx && <button type="button" className="btn ghost danger" onClick={remove}>Supprimer</button>}
          <button className="btn primary" disabled={saving || (type === 'transfer' && accounts.length < 2)}>{tx ? 'Enregistrer' : 'Ajouter'}</button>
        </div>
      </form>
    </Modal>
  );
}
