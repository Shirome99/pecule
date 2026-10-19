import { useState, type FormEvent } from 'react';
import { api, type AiAnswer } from '../api';
import { useStore } from '../store';
import Modal from './Modal';
import AiConsent from './AiConsent';

const TOOL_LABELS: Record<string, string> = {
  get_stats: 'stats du mois', search_transactions: 'opérations', get_budgets: 'budgets', get_forecast: 'prévision',
  get_networth: 'patrimoine', get_subscriptions: 'abonnements',
};
const EXAMPLES = ['Combien j’ai dépensé en resto depuis janvier ?', 'Je peux me permettre 1 200 € de vacances en décembre ?'];

/** « Poser une question » : l'assistant lit tes chiffres (lecture seule) et répond en les citant. */
export default function AssistantPanel({ onClose }: { onClose: () => void }) {
  const { ai, refreshAi } = useStore();
  const [question, setQuestion] = useState('');
  const [thread, setThread] = useState<{ q: string; a: AiAnswer }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const remaining = thread.length ? thread[thread.length - 1].a.remaining : ai.enabled ? ai.remaining : 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const a = await api.post<AiAnswer>('/ai/ask', { question });
      setThread([...thread, { q: question, a }]);
      setQuestion('');
      refreshAi();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Poser une question" onClose={onClose} wide>
      {ai.enabled && !ai.consented ? (
        <AiConsent onAccepted={() => {}} onCancel={onClose} />
      ) : (
        <div className="form">
          {thread.length === 0 && (
            <div className="chips">
              {EXAMPLES.map((x) => <button key={x} type="button" className="chip" onClick={() => setQuestion(x)}>{x}</button>)}
            </div>
          )}
          {thread.map((t, i) => (
            <div key={i} className="qa">
              <p className="qa-q">{t.q}</p>
              <p className="qa-a">{t.a.answer}</p>
              {t.a.tools.length > 0 && <p className="muted small">Chiffres tirés de : {t.a.tools.map((n) => TOOL_LABELS[n] ?? n).join(', ')}.</p>}
            </div>
          ))}
          <form className="form" onSubmit={submit}>
            <label className="field"><span>Ta question</span>
              <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} maxLength={500} required
                placeholder="Ex. combien j’ai dépensé en courses ce mois-ci ?" />
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="form-actions">
              <span className="muted small qa-left">{remaining} question{remaining > 1 ? 's' : ''} restante{remaining > 1 ? 's' : ''} aujourd'hui</span>
              <button className="btn primary" disabled={busy || remaining <= 0}>{busy ? 'Réflexion…' : 'Envoyer'}</button>
            </div>
          </form>
        </div>
      )}
    </Modal>
  );
}
