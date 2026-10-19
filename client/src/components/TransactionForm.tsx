import { useRef, useState, type FormEvent } from 'react';
import { api, type ReceiptReading, type RuleSuggestion, type Transaction } from '../api';
import { useStore } from '../store';
import { today } from '../format';
import Modal from './Modal';
import { useUndoDelete } from '../useUndoDelete';
import { useToast } from './Toast';
import TagInput from './TagInput';
import AiConsent from './AiConsent';
import { resizeImage } from '../image';

type Props = { tx?: Transaction; onClose: () => void };
type Kind = 'expense' | 'income' | 'transfer';
const KIND_LABELS: Record<Kind, string> = { expense: 'Dépense', income: 'Revenu', transfer: 'Virement' };

export default function TransactionForm({ tx, onClose }: Props) {
  const { accounts, categories, refresh, ai } = useStore();
  const undoDelete = useUndoDelete();
  const toast = useToast();
  const [tags, setTags] = useState<string[]>(tx?.tags ?? []);
  // ticket en photo : préremplit le formulaire, n'enregistre jamais tout seul
  const fileRef = useRef<HTMLInputElement>(null);
  const [askConsent, setAskConsent] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState('');

  function scan() {
    if (ai.enabled && !ai.consented) return setAskConsent(true);
    fileRef.current?.click();
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setError('');
    setScanNote('');
    setScanning(true);
    try {
      const { data, media_type } = await resizeImage(file);
      const r = await api.post<ReceiptReading>('/ai/receipt', { image: data, media_type });
      if (r.amount) setAmount(String(r.amount).replace('.', ','));
      if (r.merchant) setLabel(r.merchant);
      if (r.date) setDate(r.date);
      if (r.category_id) setCategoryId(r.category_id);
      setScanNote(r.amount || r.merchant ? 'Prérempli à partir du ticket : vérifie avant d’ajouter.' : 'Ticket illisible : saisis l’opération à la main.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }
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
        let saved: { suggestion?: RuleSuggestion | null } = {};
        if (tx) saved = await api.put(`/transactions/${tx.id}`, { ...body, tags });
        // récurrence : le serveur crée la règle et génère l'occurrence si la date est passée
        else if (repeat) await api.post('/recurring', { ...body, frequency: 'monthly', start_date: date });
        else saved = await api.post('/transactions', { ...body, tags });
        if (saved.suggestion) suggestRule(saved.suggestion);
      }
      refresh();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  // même catégorie donnée à deux opérations semblables : proposer une règle
  function suggestRule(s: RuleSuggestion) {
    toast({
      message: `Toujours classer « ${s.pattern} » en ${s.category_name} ?`, kind: 'action', duration: 8000,
      action: {
        label: 'Créer la règle',
        onClick: () => api.post('/rules', { pattern: s.pattern, category_id: s.category_id })
          .then(() => toast({ message: `Règle créée : « ${s.pattern} » → ${s.category_name}.`, kind: 'success', duration: 3000 }))
          .catch((err: Error) => toast({ message: err.message, kind: 'error' })),
      },
    });
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

        {ai.enabled && !tx && type === 'expense' && (
          <>
            {/* sur mobile, ouvre directement l'appareil photo */}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onPhoto(e.target.files?.[0])} aria-label="Photo du ticket" />
            {askConsent ? (
              <AiConsent onAccepted={() => { setAskConsent(false); fileRef.current?.click(); }} onCancel={() => setAskConsent(false)} />
            ) : (
              <div className="scan-row">
                <button type="button" className="btn ghost" onClick={scan} disabled={scanning}>{scanning ? 'Lecture du ticket…' : '📷 Scanner un ticket'}</button>
                {scanNote && <p className="muted small" role="status">{scanNote}</p>}
              </div>
            )}
          </>
        )}

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

            {!repeat && <TagInput value={tags} onChange={setTags} />}
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
