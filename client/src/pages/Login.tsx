import { useState, type FormEvent } from 'react';
import { api, type User } from '../api';
import { useStore } from '../store';

export default function Login() {
  const { login } = useStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await api.post<{ token: string; user: User }>(
        `/auth/${mode}`,
        mode === 'login' ? { email, password } : { name, email, password }
      );
      login(res.token, res.user);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-side">
        <div className="brand light">
          <img src="/favicon.svg" alt="" width={32} height={32} />
          <span>Pécule</span>
        </div>
        <p className="auth-pitch">Sache chaque mois où part ton argent, et ce qu'il te reste.</p>
      </div>
      <form className="auth-form form" onSubmit={submit}>
        <h1>{mode === 'login' ? 'Connexion' : 'Créer un compte'}</h1>
        {mode === 'register' && (
          <label className="field"><span>Prénom</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" required />
          </label>
        )}
        <label className="field"><span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label className="field"><span>Mot de passe</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} required />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn primary wide" disabled={busy}>{mode === 'login' ? 'Se connecter' : 'Créer mon compte'}</button>
        <p className="muted small">
          {mode === 'login' ? 'Pas encore de compte ? ' : 'Déjà un compte ? '}
          <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
            {mode === 'login' ? 'Créer un compte' : 'Se connecter'}
          </button>
        </p>
        {mode === 'login' && <p className="muted small">Démo : demo@money.app / demo1234</p>}
      </form>
    </div>
  );
}
