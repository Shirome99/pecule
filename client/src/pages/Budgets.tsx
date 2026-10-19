import { useEffect, useState, type FormEvent } from 'react';
import { api, type Budget } from '../api';
import { useStore } from '../store';
import { money } from '../format';
import MonthPicker from '../components/MonthPicker';
import BudgetBar from '../components/BudgetBar';
import Modal from '../components/Modal';

export default function Budgets() {
  const { month, version, categories, refresh } = useStore();
  const [budgets, setBudgets] = useState<Budget[] | null>(null);
  const [editing, setEditing] = useState<Budget | 'new' | null>(null);

  useEffect(() => {
    api.get<Budget[]>(`/budgets?month=${month}`).then(setBudgets);
  }, [month, version]);

  const totalLimit = (budgets ?? []).reduce((s, b) => s + b.monthly_limit, 0);
  const totalSpent = (budgets ?? []).reduce((s, b) => s + b.spent, 0);
  const free = categories.filter((c) => c.kind === 'expense' && !budgets?.some((b) => b.category_id === c.id));

  return (
    <div className="page">
      <header className="page-head">
        <h1>Budgets</h1>
        <MonthPicker />
      </header>

      {budgets && budgets.length > 0 && (
        <p className="totals">
          <span>Plafonds <strong>{money(totalLimit)}</strong></span>
          <span>Dépensé <strong>{money(totalSpent)}</strong></span>
        </p>
      )}

      {budgets === null ? <p className="muted">Chargement…</p> : budgets.length === 0 ? (
        <div className="empty">
          <p>Aucun budget pour l'instant.</p>
          <p className="muted small">Un budget fixe un plafond mensuel pour une catégorie. La barre passe à l'orange à 80 % et au rouge au-delà.</p>
          <button className="btn primary" onClick={() => setEditing('new')}>Créer un budget</button>
        </div>
      ) : (
        <>
          <div className="budget-list">
            {budgets.map((b) => <BudgetBar key={b.id} b={b} onEdit={() => setEditing(b)} />)}
          </div>
          {free.length > 0 && <button className="btn ghost" onClick={() => setEditing('new')}>+ Ajouter un budget</button>}
        </>
      )}

      {editing && (
        <BudgetForm
          budget={editing === 'new' ? undefined : editing}
          options={editing === 'new' ? free : []}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}
    </div>
  );
}

function BudgetForm({ budget, options, onClose, onSaved }: {
  budget?: Budget; options: { id: number; name: string; icon: string }[]; onClose: () => void; onSaved: () => void;
}) {
  const [categoryId, setCategoryId] = useState(budget?.category_id ?? options[0]?.id ?? 0);
  const [limit, setLimit] = useState(budget ? String(budget.monthly_limit) : '');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post('/budgets', { category_id: categoryId, monthly_limit: Number(limit.replace(',', '.')) });
      onSaved();
    } catch (err) { setError((err as Error).message); }
  }

  async function remove() {
    if (!budget || !confirm(`Supprimer le budget ${budget.name} ?`)) return;
    await api.del(`/budgets/${budget.id}`);
    onSaved();
  }

  return (
    <Modal title={budget ? `Budget ${budget.name}` : 'Nouveau budget'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {!budget && (
          <label className="field"><span>Catégorie</span>
            <select value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))}>
              {options.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </label>
        )}
        <label className="field"><span>Plafond mensuel</span>
          <div className="amount-input">
            <input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="0" required />
            <span>€</span>
          </div>
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions">
          {budget && <button type="button" className="btn ghost danger" onClick={remove}>Supprimer</button>}
          <button className="btn primary">Enregistrer</button>
        </div>
      </form>
    </Modal>
  );
}
