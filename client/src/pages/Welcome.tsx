// Accueil de l'app mobile (remplace la connexion) : tout reste sur l'appareil, pas d'email ni de mot de passe.
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type LocalProfile, type User } from '../api';
import { useStore } from '../store';
import { haptic } from '../native';
import { restoreFromFile } from '../backup';

type Session = { token: string; user: User };

export default function Welcome() {
  const { login } = useStore();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<LocalProfile[] | null>(null);
  const [broken, setBroken] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<LocalProfile[]>('/local/profiles')
      .then(setProfiles)
      .catch((err) => { setBroken((err as Error).message); setProfiles([]); });
  }, []);

  async function open(run: () => Promise<Session>) {
    setError('');
    setBusy(true);
    try {
      const { token, user } = await run();
      void haptic('success');
      // un profil s'ouvre toujours sur l'Aperçu (pas sur l'écran où l'on a changé de profil)
      navigate('/', { replace: true });
      login(token, user);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  function create(e: FormEvent) {
    e.preventDefault();
    void open(() => api.post<Session>('/local/profiles', { name }));
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try { await restoreFromFile(file, !!profiles?.length); }
    catch (err) { setError((err as Error).message); }
  }

  async function startOver() {
    if (!window.confirm('Effacer les données illisibles et repartir de zéro ?')) return;
    const { eraseAll } = await import('@pecule/local');
    await eraseAll();
    window.location.replace('/');
  }

  const others = profiles?.filter((p) => !p.is_demo) ?? [];
  const demo = profiles?.find((p) => p.is_demo);

  return (
    <div className="auth welcome">
      <div className="auth-side">
        <div className="brand light">
          <img src="/favicon.svg" alt="" width={32} height={32} />
          <span>Pécule</span>
        </div>
        <p className="auth-pitch">Sache chaque mois où part ton argent, et ce qu'il te reste.</p>
        <ul className="welcome-points">
          <li>Tout reste sur ton téléphone, même sans connexion.</li>
          <li>Pas de compte à créer, pas de publicité.</li>
        </ul>
      </div>

      <div className="auth-form form">
        {broken && (
          <div className="panel welcome-broken" role="alert">
            <h2>Tes données n’ont pas pu être ouvertes</h2>
            <p className="muted small">{broken}</p>
            <button className="btn primary" onClick={() => fileRef.current?.click()}>Restaurer une sauvegarde</button>
            <button className="btn ghost danger" onClick={startOver}>Repartir de zéro</button>
          </div>
        )}

        {others.length > 0 && (
          <section className="welcome-profiles" aria-labelledby="profiles-title">
            <h1 id="profiles-title">Content de te revoir</h1>
            {others.map((p) => (
              <button key={p.id} className="profile-card" disabled={busy}
                onClick={() => open(() => api.post<Session>('/local/session', { user_id: p.id }))}>
                <span className="avatar" aria-hidden>{p.name.slice(0, 1).toUpperCase()}</span>
                <span className="profile-text">
                  <strong>{p.name}</strong>
                  <span className="muted small">{p.operations} opération{p.operations > 1 ? 's' : ''}</span>
                </span>
                <span aria-hidden className="chev">›</span>
              </button>
            ))}
          </section>
        )}

        {profiles && !broken && (
          <form className="form" onSubmit={create}>
            <h1>{others.length ? 'Nouveau profil' : 'Bienvenue'}</h1>
            {!others.length && <p className="muted">Pour commencer, dis-nous juste comment t’appeler.</p>}
            <label className="field"><span>Prénom</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={60} required />
            </label>
            <button className="btn primary wide" disabled={busy}>{others.length ? 'Créer ce profil' : 'Commencer'}</button>
          </form>
        )}

        {error && <p className="form-error" role="alert">{error}</p>}

        {profiles && !broken && (
          <div className="welcome-more">
            <button className="btn ghost wide" disabled={busy}
              onClick={() => open(() => api.post<Session>('/local/demo', {}))}>
              {demo ? 'Ouvrir la démo' : 'Explorer avec des données de démo'}
            </button>
            <button className="link" onClick={() => fileRef.current?.click()}>Restaurer une sauvegarde</button>
          </div>
        )}
        <input ref={fileRef} type="file" hidden onChange={onFile} aria-label="Fichier de sauvegarde" />
      </div>
    </div>
  );
}
