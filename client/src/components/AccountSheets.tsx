import { useEffect, useState, type FormEvent } from 'react';
import { api, type Account, type AccountType, type Loan, type ScheduleRow, type Valuation } from '../api';
import { useStore } from '../store';
import { ACCOUNT_TYPES, FAMILIES, familyOf, money, percent, shortDate, today } from '../format';
import Modal from './Modal';

const parseNumber = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'));
const fr = (n: number) => String(n).replace('.', ',');
const longDate = (d: string) => `${shortDate(d)} ${d.slice(0, 4)}`;

/** Création / modification d'un compte, avec les paramètres du crédit pour une dette. */
export function AccountForm({ account, onClose }: { account?: Account; onClose: () => void }) {
  const { refresh } = useStore();
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'courant');
  const [initial, setInitial] = useState(account ? fr(account.initial_balance) : '0');
  const [value, setValue] = useState('');
  const [loan, setLoan] = useState({ principal: '', annual_rate: '', duration_months: '', first_payment_date: '', insurance_monthly: '0' });
  const [error, setError] = useState('');
  const family = familyOf(type);

  // crédit existant : on préremplit ses paramètres
  useEffect(() => {
    if (!account || account.family !== 'debt') return;
    api.get<Loan>(`/accounts/${account.id}/loan`).then((l) => setLoan({
      principal: fr(l.principal), annual_rate: fr(l.annual_rate), duration_months: String(l.duration_months),
      first_payment_date: l.first_payment_date, insurance_monthly: fr(l.insurance_monthly),
    })).catch(() => {});
  }, [account]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const body = { name, type, initial_balance: family === 'debt' ? 0 : parseNumber(initial) || 0 };
    try {
      const id = account ? (await api.put(`/accounts/${account.id}`, body), account.id) : (await api.post<{ id: number }>('/accounts', body)).id;
      if (family === 'debt') {
        await api.put(`/accounts/${id}/loan`, {
          principal: parseNumber(loan.principal), annual_rate: parseNumber(loan.annual_rate), duration_months: parseNumber(loan.duration_months),
          first_payment_date: loan.first_payment_date, insurance_monthly: parseNumber(loan.insurance_monthly) || 0,
        });
      }
      if (family === 'investment' && !account && value.trim()) await api.post(`/accounts/${id}/valuations`, { date: today(), value: parseNumber(value) });
      refresh();
      onClose();
    } catch (err) { setError((err as Error).message); refresh(); }
  }

  async function remove() {
    if (!account || !confirm(`Supprimer ${account.name} et toutes ses opérations ?`)) return;
    try {
      await api.del(`/accounts/${account.id}`);
      refresh();
      onClose();
    } catch (err) { setError((err as Error).message); }
  }

  const amountField = (label: string, v: string, set: (s: string) => void, extra: { required?: boolean; unit?: string } = {}) => (
    <label className="field"><span>{label}</span>
      <div className="amount-input">
        <input inputMode="decimal" value={v} onChange={(e) => set(e.target.value)} required={extra.required} />
        <span>{extra.unit ?? '€'}</span>
      </div>
    </label>
  );

  return (
    <Modal title={account ? 'Modifier le compte' : 'Nouveau compte'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label className="field"><span>Nom</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Boursorama" required />
        </label>
        <label className="field"><span>Type</span>
          <select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {Object.values(FAMILIES).map((f) => (
              <optgroup key={f.label} label={f.label}>
                {f.types.map((t) => <option key={t} value={t}>{ACCOUNT_TYPES[t]}</option>)}
              </optgroup>
            ))}
          </select>
        </label>

        {family === 'liquid' && amountField('Solde de départ', initial, setInitial)}
        {family === 'investment' && (
          <>
            {amountField('Déjà versé avant le suivi', initial, setInitial)}
            {!account && amountField('Valeur actuelle (facultatif)', value, setValue)}
            <p className="muted small">Les versements suivants passent par un virement vers ce compte. La valeur se met à jour à la main.</p>
          </>
        )}
        {family === 'debt' && (
          <>
            <div className="row-2">
              {amountField('Capital emprunté', loan.principal, (s) => setLoan({ ...loan, principal: s }), { required: true })}
              {amountField('Taux annuel', loan.annual_rate, (s) => setLoan({ ...loan, annual_rate: s }), { required: true, unit: '%' })}
            </div>
            <div className="row-2">
              {amountField('Durée', loan.duration_months, (s) => setLoan({ ...loan, duration_months: s }), { required: true, unit: 'mois' })}
              <label className="field"><span>1re échéance</span>
                <input type="date" value={loan.first_payment_date} onChange={(e) => setLoan({ ...loan, first_payment_date: e.target.value })} required />
              </label>
            </div>
            {amountField('Assurance par mois', loan.insurance_monthly, (s) => setLoan({ ...loan, insurance_monthly: s }))}
          </>
        )}

        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions">
          {account && <button type="button" className="btn ghost danger" onClick={remove}>Supprimer</button>}
          <button className="btn primary">Enregistrer</button>
        </div>
      </form>
    </Modal>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'in' | 'out' }) {
  return (
    <div className="sheet-stat">
      <dt>{label}</dt>
      <dd className={tone}>{value}</dd>
    </div>
  );
}

/** Fiche placement : valeur, versé, plus-value, historique des valorisations. */
export function InvestmentSheet({ account, onEdit, onClose }: { account: Account; onEdit: () => void; onClose: () => void }) {
  const { refresh, version } = useStore();
  const [vals, setVals] = useState<Valuation[]>([]);
  const [date, setDate] = useState(today());
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Valuation[]>(`/accounts/${account.id}/valuations`).then(setVals).catch(() => setVals([]));
  }, [account.id, version]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.post(`/accounts/${account.id}/valuations`, { date, value: parseNumber(value) });
      setValue('');
      refresh();
    } catch (err) { setError((err as Error).message); }
  }

  async function remove(v: Valuation) {
    if (!confirm(`Supprimer la valorisation du ${longDate(v.date)} ?`)) return;
    await api.del(`/valuations/${v.id}`);
    refresh();
  }

  const gain = account.gain ?? 0;
  return (
    <Modal title={account.name} onClose={onClose}>
      <div className="form">
        <dl className="sheet-stats">
          <Stat label="Valeur" value={money(account.balance)} />
          <Stat label="Total versé" value={money(account.invested ?? 0)} />
          <Stat label="Plus-value latente" value={`${gain > 0 ? '+' : ''}${money(gain)}`} tone={gain >= 0 ? 'in' : 'out'} />
          <Stat label="Performance" value={account.gain_pct == null ? '—' : percent(account.gain_pct)} tone={gain >= 0 ? 'in' : 'out'} />
        </dl>

        <form className="valuation-form" onSubmit={save}>
          <h3>Mettre à jour la valeur</h3>
          <div className="row-2">
            <label className="field"><span>Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
            <label className="field"><span>Valeur</span>
              <div className="amount-input">
                <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" required />
                <span>€</span>
              </div>
            </label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="form-actions"><button className="btn primary">Mettre à jour la valeur</button></div>
        </form>

        <div>
          <h3>Historique des valorisations</h3>
          {vals.length === 0 ? <p className="muted small">Aucune valorisation : la valeur affichée est le total versé.</p> : (
            <ul className="val-list">
              {vals.map((v) => (
                <li key={v.id}>
                  <span>{longDate(v.date)}</span>
                  <strong>{money(v.value)}</strong>
                  <button className="icon-btn" onClick={() => remove(v)} aria-label={`Supprimer la valorisation du ${longDate(v.date)}`}>✕</button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="form-actions"><button className="btn ghost" onClick={onEdit}>Modifier le compte</button></div>
      </div>
    </Modal>
  );
}

/** Fiche crédit : capital restant dû, mensualité, fin, coût des intérêts, tableau d'amortissement repliable. */
export function LoanSheet({ account, onEdit, onClose }: { account: Account; onEdit: () => void; onClose: () => void }) {
  const { version } = useStore();
  const [data, setData] = useState<{ loan: Loan; schedule: ScheduleRow[] } | null | undefined>(undefined);

  useEffect(() => {
    if (!account.loan_id) { setData(null); return; }
    api.get<{ loan: Loan; schedule: ScheduleRow[] }>(`/loans/${account.loan_id}/schedule`).then(setData).catch(() => setData(null));
  }, [account.loan_id, version]);

  const now = today();
  return (
    <Modal title={account.name} onClose={onClose} wide>
      <div className="form">
        {data === undefined ? <p className="muted">Chargement…</p> : data === null ? (
          <p className="muted">Renseigne le capital, le taux et la durée du crédit pour calculer ce qu'il te reste à rembourser.</p>
        ) : (
          <>
            <dl className="sheet-stats">
              <Stat label="Capital restant dû" value={money(data.loan.outstanding)} tone="out" />
              <Stat label="Mensualité" value={money(data.loan.payment + data.loan.insurance_monthly)} />
              <Stat label="Fin du crédit" value={longDate(data.loan.end_date)} />
              <Stat label="Coût total des intérêts" value={money(data.loan.total_interest)} />
            </dl>
            <p className="muted small">
              {money(data.loan.principal)} sur {data.loan.duration_months} mois à {fr(data.loan.annual_rate)} %
              {data.loan.insurance_monthly > 0 && ` · dont ${money(data.loan.insurance_monthly)} d'assurance par mois`}
            </p>
            <details className="schedule">
              <summary>Tableau d'amortissement ({data.schedule.length} échéances)</summary>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>N°</th><th>Date</th><th>Échéance</th><th>Intérêts</th><th>Capital</th><th>Restant dû</th></tr></thead>
                  <tbody>
                    {data.schedule.map((r) => (
                      <tr key={r.n} className={r.date <= now ? 'past' : ''}>
                        <td>{r.n}</td><td>{shortDate(r.date)} {r.date.slice(2, 4)}</td><td>{money(r.payment)}</td>
                        <td>{money(r.interest)}</td><td>{money(r.principal)}</td><td>{money(r.remaining)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
        <div className="form-actions"><button className="btn ghost" onClick={onEdit}>Modifier le crédit</button></div>
      </div>
    </Modal>
  );
}
