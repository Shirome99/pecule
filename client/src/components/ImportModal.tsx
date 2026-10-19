import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { api, type Transaction } from '../api';
import { useStore } from '../store';
import { money, shortDate } from '../format';
import {
  buildCategoryIndex, buildRows, decodeBytes, detectSeparator, dupKey, guessColumns, guessColumnsFromData, hasHeader,
  parseCsv, type Columns, type Encoding, type ImportRow, type Separator,
} from '../csv';
import Modal from './Modal';

type Parsed = { name: string; encoding: Encoding; sep: Separator; header: string[]; data: string[][]; hasHeader: boolean };

const MAX_ROWS = 2000;
const STATUS_LABEL = { new: 'Nouveau', duplicate: 'Doublon', transfer: 'Virement', invalid: 'Illisible' } as const;

export default function ImportModal({ onClose }: { onClose: () => void }) {
  const { accounts, categories, refresh } = useStore();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? 0);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [cols, setCols] = useState<Columns | null>(null);
  const [mode, setMode] = useState<'single' | 'split'>('single');
  const [history, setHistory] = useState<Transaction[]>([]);
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [withDuplicates, setWithDuplicates] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  // opérations déjà catégorisées : base de la catégorisation automatique
  useEffect(() => {
    api.get<Transaction[]>('/transactions?limit=2000').then(setHistory).catch(() => {});
  }, []);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setError('');
    setDone(null);
    if (!file) return;
    const { text, encoding } = decodeBytes(await file.arrayBuffer());
    const sep = detectSeparator(text);
    const rows = parseCsv(text, sep);
    if (rows.length === 0) { setParsed(null); return setError('Ce fichier est vide.'); }
    const withHeader = hasHeader(rows);
    const header = withHeader ? rows[0] : rows[0].map((_, i) => `Colonne ${i + 1}`);
    const data = withHeader ? rows.slice(1) : rows;
    const guess = withHeader ? guessColumns(header) : guessColumnsFromData(data);
    setMode(guess.amount < 0 && guess.debit >= 0 && guess.credit >= 0 ? 'split' : 'single');
    setCols(guess);
    setParsed({ name: file.name, encoding, sep, header, data, hasHeader: withHeader });
  }

  const index = useMemo(() => buildCategoryIndex(history), [history]);

  const rows = useMemo(() => {
    if (!parsed || !cols) return [];
    return buildRows(parsed.data, cols, { mode, categories, index, existing, firstLine: parsed.hasHeader ? 2 : 1 });
  }, [parsed, cols, mode, categories, index, existing]);

  // période couverte par le fichier : on ne charge que les opérations existantes de cette période
  const dates = rows.filter((r) => r.status !== 'invalid').map((r) => r.date).sort();
  const from = dates[0];
  const to = dates[dates.length - 1];

  useEffect(() => {
    if (!from || !to || !accountId) { setExisting(new Set()); return; }
    api.get<Transaction[]>(`/transactions?account_id=${accountId}&from=${from}&to=${to}&limit=2000`)
      .then((txs) => setExisting(new Set(txs.map((t) => dupKey(t.date, t.amount, t.label)))))
      .catch(() => setExisting(new Set()));
  }, [accountId, from, to]);

  const count = (s: ImportRow['status']) => rows.filter((r) => r.status === s).length;
  const toImport = rows.filter((r) => r.status === 'new' || (withDuplicates && r.status === 'duplicate'));
  const catName = (id: number | null) => categories.find((c) => c.id === id);
  const missingCols = cols && (cols.date < 0 || cols.label < 0 || (mode === 'single' ? cols.amount < 0 : cols.debit < 0 && cols.credit < 0));

  async function submit() {
    setError('');
    if (toImport.length === 0) return setError('Aucune opération à importer.');
    if (toImport.length > MAX_ROWS) return setError(`${MAX_ROWS} lignes maximum par import : découpe ton fichier.`);
    setBusy(true);
    try {
      const body = { account_id: accountId, rows: toImport.map(({ date, label, amount, category_id }) => ({ date, label, amount, category_id })) };
      const res = await api.post<{ inserted: number }>('/transactions/bulk', body);
      setDone(res.inserted);
      setParsed(null);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const colSelect = (key: keyof Columns, label: string, optional = false) => (
    <label className="field">
      <span>{label}</span>
      <select value={cols?.[key] ?? -1} onChange={(e) => setCols({ ...cols!, [key]: Number(e.target.value) })}>
        <option value={-1}>{optional ? 'Aucune' : 'Choisir…'}</option>
        {parsed!.header.map((h, i) => <option key={i} value={i}>{h || `Colonne ${i + 1}`}</option>)}
      </select>
    </label>
  );

  return (
    <Modal title="Importer un relevé" onClose={onClose} wide>
      <div className="form">
        <div className="row-2">
          <label className="field">
            <span>Dans le compte</span>
            <select value={accountId} onChange={(e) => setAccountId(Number(e.target.value))}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Fichier CSV de ta banque</span>
            <input type="file" accept=".csv,text/csv,text/plain" onChange={onFile} />
          </label>
        </div>

        {done !== null && (
          <div className="import-done" role="status">
            <p><strong>{done} opération{done > 1 ? 's' : ''} importée{done > 1 ? 's' : ''}.</strong></p>
            <button className="btn primary" onClick={onClose}>Terminer</button>
          </div>
        )}

        {parsed && cols && (
          <>
            <p className="muted small">
              {parsed.name} · séparateur « {parsed.sep} » · {parsed.encoding} · {parsed.data.length} ligne{parsed.data.length > 1 ? 's' : ''}
            </p>

            <div className="segmented" role="radiogroup" aria-label="Format des montants">
              {(['single', 'split'] as const).map((m) => (
                <button type="button" key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
                  {m === 'single' ? 'Une colonne montant' : 'Débit + crédit'}
                </button>
              ))}
            </div>

            <div className="import-cols">
              {colSelect('date', 'Date')}
              {colSelect('label', 'Libellé')}
              {mode === 'single' ? colSelect('amount', 'Montant') : (<>{colSelect('debit', 'Débit')}{colSelect('credit', 'Crédit')}</>)}
              {colSelect('category', 'Catégorie', true)}
            </div>

            {missingCols ? (
              <p className="form-error">Choisis les colonnes date, libellé et montant.</p>
            ) : (
              <>
                <div>
                  <h3>Aperçu des 20 premières lignes</h3>
                  <ul className="import-preview">
                    {rows.slice(0, 20).map((r) => {
                      const cat = catName(r.category_id);
                      return (
                        <li key={r.line} className={`import-row ${r.status}`}>
                          <span className="tx-main">
                            <span className="tx-label">{r.label || '—'}</span>
                            <span className="tx-meta">
                              {r.date ? shortDate(r.date) : '—'} · {r.status === 'invalid' ? r.error : cat ? `${cat.icon} ${cat.name}` : 'Sans catégorie'}
                            </span>
                          </span>
                          <span className="import-right">
                            <span className={`tx-amount ${r.amount > 0 ? 'in' : ''}`}>{r.status === 'invalid' ? '' : money(r.amount)}</span>
                            <span className={`badge ${r.status}`}>{STATUS_LABEL[r.status]}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <p className="import-summary">
                  <strong>{toImport.length}</strong> à importer
                  {count('duplicate') > 0 && <> · {count('duplicate')} doublon{count('duplicate') > 1 ? 's' : ''}{withDuplicates ? ' inclus' : ' ignoré' + (count('duplicate') > 1 ? 's' : '')}</>}
                  {count('transfer') > 0 && <> · {count('transfer')} virement{count('transfer') > 1 ? 's' : ''} interne{count('transfer') > 1 ? 's' : ''} ignoré{count('transfer') > 1 ? 's' : ''}</>}
                  {count('invalid') > 0 && <> · {count('invalid')} ligne{count('invalid') > 1 ? 's' : ''} illisible{count('invalid') > 1 ? 's' : ''}</>}
                </p>
                {count('duplicate') > 0 && (
                  <label className="check">
                    <input type="checkbox" checked={withDuplicates} onChange={(e) => setWithDuplicates(e.target.checked)} />
                    <span>Importer quand même les doublons</span>
                  </label>
                )}
              </>
            )}
          </>
        )}

        {error && <p className="form-error" role="alert">{error}</p>}

        {parsed && (
          <div className="form-actions">
            <button className="btn primary" onClick={submit} disabled={busy || !!missingCols || toImport.length === 0}>
              Importer {toImport.length} opération{toImport.length > 1 ? 's' : ''}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
