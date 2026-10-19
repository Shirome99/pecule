import { useState } from 'react';
import { api } from '../api';
import { useStore } from '../store';

/** Mention à accepter avant la première utilisation d'une fonction IA ; le choix est gardé côté serveur. */
export default function AiConsent({ onAccepted, onCancel }: { onAccepted: () => void; onCancel: () => void }) {
  const { refreshAi } = useStore();
  const [error, setError] = useState('');

  async function accept() {
    try {
      await api.post('/ai/consent', { accepted: true });
      refreshAi();
      onAccepted();
    } catch (err) { setError((err as Error).message); }
  }

  return (
    <div className="ai-consent" role="group" aria-labelledby="ai-consent-title">
      <p id="ai-consent-title"><strong>Avant d'utiliser l'IA</strong></p>
      <p>Tes données financières concernées sont envoyées à Anthropic pour générer la réponse.</p>
      <p className="muted small">Photo du ticket ou chiffres utiles à ta question. L'image n'est pas conservée par Pécule.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>Pas maintenant</button>
        <button type="button" className="btn primary" onClick={accept}>J'accepte</button>
      </div>
    </div>
  );
}
