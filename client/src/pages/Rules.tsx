import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, type Rule } from '../api';
import { useStore } from '../store';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';

/** Réglages › Règles : « libellé contenant X → catégorie Y », appliquées aux opérations sans catégorie. */
export default function Rules() {
  const { version, refresh } = useStore();
  const toast = useToast();
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [editing, setEditing] = useState<Rule | 'new' | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    api.get<Rule[]>('/rules').then(setRules).catch(() => setRules([]));
  }, [version]);

  async function apply() {
    setApplying(true);
    try {
      const { classified } = await api.post<{ classified: number }>('/rules/apply', {});
      refresh();
      toast({
        message: classified === 0 ? 'Aucune opération sans catégorie ne correspond à tes règles.'
          : `${classified} opération${classified > 1 ? 's' : ''} classée${classified > 1 ? 's' : ''}.`,
        kind: 'success',
      });
    } catch (err) {
      toast({ message: (err as Error).message, kind: 'error' });
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="page settings">
      <header className="page-head">
        <div>
          <Link to="/reglages" className="link small back-link">‹ Réglages</Link>
          <h1>Règles</h1>
        </div>
      </header>

      <p className="muted">
        Une règle classe toute seule une opération sans catégorie quand son libellé contient le motif : à la saisie, à l'import
        et pour les opérations récurrentes. Une catégorie choisie à la main n'est jamais remplacée.
      </p>

      <section className="panel">
        <div className="panel-head">
          <h2>Mes règles</h2>
          {rules && rules.length > 0 && <button className="link" onClick={() => setEditing('new')}>Ajouter</button>}
        </div>
        {rules === null ? <p className="muted">Chargement…</p> : rules.length === 0 ? (
          <>
            <p className="muted">Aucune règle. Pécule t'en propose une quand tu classes deux opérations semblables dans la même catégorie.</p>
            <button className="btn ghost" onClick={() => setEditing('new')}>+ Créer une règle</button>
          </>
        ) : (
          <ul className="account-list">
            {rules.map((r) => (
              <li key={r.id}>
                <button className="account-row" onClick={() => setEditing(r)}>
                  <span className="tx-main">
                    <span className="tx-label">« {r.pattern} »</span>
                    <span className="tx-meta">
                      → <span aria-hidden>{r.category_icon}</span> {r.category_name}{r.priority > 0 && ` · priorité ${r.priority}`}
                    </span>
                  </span>
                  <span className="muted small">Modifier</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {rules && rules.length > 0 && (
        <button className="btn primary" onClick={apply} disabled={applying}>Appliquer aux opérations sans catégorie</button>
      )}

      {editing && <RuleForm rule={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RuleForm({ rule, onClose }: { rule?: Rule; onClose: () => void }) {
  const { categories, refresh } = useStore();
  const toast = useToast();
  const [pattern, setPattern] = useState(rule?.pattern ?? '');
  const [categoryId, setCategoryId] = useState(rule?.category_id ?? categories.find((c) => c.kind === 'expense')?.id ?? 0);
  const [priority, setPriority] = useState(String(rule?.priority ?? 0));
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = { pattern, category_id: categoryId, priority: Number(priority) || 0 };
    try {
      if (rule) await api.put(`/rules/${rule.id}`, body);
      else await api.post('/rules', body);
      refresh();
      onClose();
    } catch (err) { setError((err as Error).message); }
  }

  async function remove() {
    if (!rule) return;
    try {
      await api.del(`/rules/${rule.id}`);
      refresh();
      onClose();
      toast({ message: 'Règle supprimée. Les opérations déjà classées gardent leur catégorie.', kind: 'success' });
    } catch (err) { setError((err as Error).message); }
  }

  return (
    <Modal title={rule ? 'Modifier la règle' : 'Nouvelle règle'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label className="field"><span>Si le libellé contient</span>
          <input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="Ex. BASIC FIT" required autoCapitalize="characters" />
        </label>
        <p className="muted small">Majuscules, accents, chiffres et mots bancaires (CB, PRLV…) sont ignorés.</p>
        <label className="field"><span>Classer en</span>
          <select value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))}>
            {(['expense', 'income'] as const).map((k) => (
              <optgroup key={k} label={k === 'expense' ? 'Dépenses' : 'Revenus'}>
                {categories.filter((c) => c.kind === k).map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="field"><span>Priorité (0 à 100, la plus haute gagne si deux règles correspondent)</span>
          <input inputMode="numeric" value={priority} onChange={(e) => setPriority(e.target.value)} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions">
          {rule && <button type="button" className="btn ghost danger" onClick={remove}>Supprimer</button>}
          <button className="btn primary">Enregistrer</button>
        </div>
      </form>
    </Modal>
  );
}
