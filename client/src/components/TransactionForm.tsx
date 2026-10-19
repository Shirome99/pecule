import { useState, type FormEvent } from 'react';
import { api, type Transaction } from '../api';
import { useStore } from '../store';
import { today } from '../format';
import Modal from './Modal';

type Props = { tx?: Transaction; onClose: () => void };

export default function TransactionForm({ tx, onClose }: Props) {
  const { accounts, categories, refresh } = useStore();
  const [type, setType] = useState<'expense' | 'income'>(tx && tx.amount > 0 ? 'income' : 'expense');
  const [amount, setAmount] = useState(tx ? String(Math.abs(tx.amount)).replace('.', ',') : '');
  const [label, setLabel] = useState(tx?.label ?? '');
  const [date, setDate] = useState(tx?.date ?? today());
  const [accountId, setAccountId] = useState(tx?.account_id ?? accounts[0]?.id ?? 0);
  const [categoryId, setCategoryId] = useState<number | ''>(tx?.category_id ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const cats = categories.filter((c) => c.kind === type);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const value = Number(amount.replace(/\s/g, '').replace(',', '.'));
    if (!value || value <= 0) return setError('Saisis un montant supérieur à 0.');
    setSaving(true);
    const body = { type, amount: value, label, date, account_id: accountId, category_id: categoryId || null };
    try {
      if (tx) await api.put(`/transactions/${tx.id}`, body);
      else await api.post('/transactions', body);
      refresh();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  async function remove() {
    if (!tx || !confirm('Supprimer cette opération ?')) return;
    await api.del(`/transactions/${tx.id}`);
    refresh();
    onClose();
  }

  return (
    <Modal title={tx ? 'Modifier l’opération' : 'Nouvelle opération'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <div className="segmented" role="radiogroup" aria-label="Type">
          {(['expense', 'income'] as const).map((t) => (
            <button
              type="button" key={t} role="radio" aria-checked={type === t}
              className={type === t ? `on ${t}` : ''}
              onClick={() => { setType(t); setCategoryId(''); }}
            >
              {t === 'expense' ? 'Dépense' : 'Revenu'}
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
          <span>Libellé</span>
          <input placeholder={type === 'expense' ? 'Ex. Courses Monoprix' : 'Ex. Salaire octobre'} value={label} onChange={(e) => setLabel(e.target.value)} required />
        </label>

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

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="form-actions">
          {tx && <button type="button" className="btn ghost danger" onClick={remove}>Supprimer</button>}
          <button className="btn primary" disabled={saving}>{tx ? 'Enregistrer' : 'Ajouter'}</button>
        </div>
      </form>
    </Modal>
  );
}
