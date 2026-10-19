import { useState, type FormEvent } from 'react';
import { api, type User } from '../api';
import { useStore } from '../store';
import { today } from '../format';

// les 3 catégories de dépense les plus courantes, proposées pour le premier budget
const COMMON = ['Courses', 'Restaurants', 'Transport'];
const parse = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'));

/** Prochaine date (strictement après aujourd'hui) qui tombe le `day` du mois, ramenée au dernier jour si besoin. */
function nextDay(day: number, from = today()) {
  const [y, m, d] = from.split('-').map(Number);
  const make = (yy: number, mm: number) => {
    const last = new Date(yy, mm, 0).getDate();
    return `${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
  };
  const thisMonth = make(y, m);
  if (Number(thisMonth.slice(8)) > d) return thisMonth;
  return m === 12 ? make(y + 1, 1) : make(y, m + 1);
}

/** Premier lancement : 3 écrans (solde, salaire, premier budget), chacun avec « Passer ». */
export default function Onboarding() {
  const { user, accounts, categories, refresh, updateUser } = useStore();
  const [step, setStep] = useState(0);
  const [balance, setBalance] = useState('');
  const [salary, setSalary] = useState('');
  const [payday, setPayday] = useState('1');
  const [budgetCat, setBudgetCat] = useState<number | ''>('');
  const [limit, setLimit] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const account = accounts.find((a) => a.type === 'courant') ?? accounts[0];
  const salaryCat = categories.find((c) => c.kind === 'income' && c.name === 'Salaire');
  const expense = categories.filter((c) => c.kind === 'expense');
  const common = COMMON.map((n) => expense.find((c) => c.name === n)).filter((c) => !!c);
  const choices = common.length ? common : expense.slice(0, 3);

  async function finish() {
    updateUser(await api.post<User>('/me/onboarding', {}));
    refresh();
  }

  async function next(save?: () => Promise<unknown>) {
    setError('');
    setSaving(true);
    try {
      if (save) await save();
      if (step < 2) setStep(step + 1);
      else await finish();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (step === 0) {
      const value = parse(balance);
      if (balance.trim() === '' || Number.isNaN(value)) return setError('Saisis ton solde, même 0.');
      return next(() => api.put(`/accounts/${account.id}`, { name: account.name, type: account.type, initial_balance: value }));
    }
    if (step === 1) {
      const value = parse(salary);
      const day = Number(payday);
      if (!value || value <= 0) return setError('Saisis un salaire supérieur à 0, ou passe cette étape.');
      if (!Number.isInteger(day) || day < 1 || day > 31) return setError('Jour de versement : entre 1 et 31.');
      // à partir du prochain versement : ton solde actuel compte déjà le dernier
      return next(() => api.post('/recurring', {
        type: 'income', account_id: account.id, category_id: salaryCat?.id ?? null, amount: value, label: 'Salaire',
        frequency: 'monthly', day, start_date: nextDay(day),
      }));
    }
    const value = parse(limit);
    if (!budgetCat) return setError('Choisis une catégorie, ou passe cette étape.');
    if (!value || value <= 0) return setError('Saisis un plafond supérieur à 0.');
    return next(() => api.post('/budgets', { category_id: budgetCat, monthly_limit: value }));
  }

  if (!account) return <div className="page"><p className="muted">Chargement…</p></div>;

  const titles = [
    `Bienvenue ${user?.name} ! Combien as-tu sur ton compte courant ?`,
    'Combien gagnes-tu par mois ?',
    'Un premier budget pour commencer ?',
  ];

  return (
    <div className="page onboarding">
      <section className="panel onboarding-card" aria-labelledby="onboarding-title">
        <p className="muted small" aria-live="polite">Étape {step + 1} sur 3</p>
        <div className="onboarding-dots" aria-hidden>{[0, 1, 2].map((i) => <span key={i} className={i <= step ? 'on' : ''} />)}</div>
        <h1 id="onboarding-title">{titles[step]}</h1>
        <form className="form" onSubmit={submit} key={step}>
          {step === 0 && (
            <>
              <p className="muted">Regarde ton appli bancaire et recopie le solde d'aujourd'hui. Pécule partira de là.</p>
              <label className="field amount-field"><span>Solde actuel</span>
                <div className="amount-input">
                  <input inputMode="decimal" placeholder="0,00" value={balance} onChange={(e) => setBalance(e.target.value)} autoFocus />
                  <span>€</span>
                </div>
              </label>
            </>
          )}
          {step === 1 && (
            <>
              <p className="muted">Ton salaire sera ajouté chaque mois, tout seul. Tu pourras le modifier dans Comptes.</p>
              <label className="field amount-field"><span>Salaire net mensuel</span>
                <div className="amount-input">
                  <input inputMode="decimal" placeholder="0,00" value={salary} onChange={(e) => setSalary(e.target.value)} autoFocus />
                  <span>€</span>
                </div>
              </label>
              <label className="field"><span>Versé le</span>
                <select value={payday} onChange={(e) => setPayday(e.target.value)}>
                  {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} du mois</option>)}
                </select>
              </label>
            </>
          )}
          {step === 2 && (
            <>
              <p className="muted">Fixe un plafond mensuel : la barre passe à l'orange à 80 %, au rouge au-delà.</p>
              <div className="field">
                <span id="budget-cat">Catégorie</span>
                <div className="chips" role="radiogroup" aria-labelledby="budget-cat">
                  {choices.map((c) => (
                    <button type="button" key={c.id} role="radio" aria-checked={budgetCat === c.id}
                      className={`chip ${budgetCat === c.id ? 'on' : ''}`} style={{ '--chip': c.color } as React.CSSProperties}
                      onClick={() => setBudgetCat(c.id)}>
                      <span aria-hidden>{c.icon}</span> {c.name}
                    </button>
                  ))}
                </div>
              </div>
              <label className="field"><span>Plafond mensuel</span>
                <div className="amount-input">
                  <input inputMode="decimal" placeholder="0" value={limit} onChange={(e) => setLimit(e.target.value)} />
                  <span>€</span>
                </div>
              </label>
            </>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="form-actions">
            <button type="button" className="btn ghost" onClick={() => next()} disabled={saving}>Passer</button>
            <button className="btn primary" disabled={saving}>{step < 2 ? 'Continuer' : 'Terminer'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
