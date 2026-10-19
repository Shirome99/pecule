import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadExport, type User } from '../api';
import { useStore } from '../store';
import { useToast } from '../components/Toast';
import { getTheme, setTheme, type Theme } from '../theme';

const THEMES: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
  { value: 'system', label: 'Système' },
];

export default function Settings() {
  const { user, updateUser, logout } = useStore();
  const toast = useToast();
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const [name, setName] = useState(user?.name ?? '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [nameError, setNameError] = useState('');
  const [pwdError, setPwdError] = useState('');

  function chooseTheme(t: Theme) {
    setTheme(t);
    setThemeState(t);
  }

  async function saveName(e: FormEvent) {
    e.preventDefault();
    setNameError('');
    try {
      updateUser(await api.put<User>('/me', { name }));
      toast({ message: 'Prénom enregistré.', kind: 'success', duration: 3000 });
    } catch (err) { setNameError((err as Error).message); }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    setPwdError('');
    try {
      await api.put('/me/password', { current_password: current, new_password: next });
      setCurrent('');
      setNext('');
      toast({ message: 'Mot de passe modifié.', kind: 'success', duration: 3000 });
    } catch (err) { setPwdError((err as Error).message); }
  }

  async function exportCsv() {
    try { await downloadExport(); } catch (err) { toast({ message: (err as Error).message, kind: 'error' }); }
  }

  return (
    <div className="page settings">
      <header className="page-head">
        <div>
          <Link to="/comptes" className="link small back-link">‹ Comptes</Link>
          <h1>Réglages</h1>
        </div>
      </header>

      <section className="panel">
        <h2 id="theme-title">Apparence</h2>
        <div className="segmented" role="radiogroup" aria-labelledby="theme-title">
          {THEMES.map((t) => (
            <button type="button" key={t.value} role="radio" aria-checked={theme === t.value}
              className={theme === t.value ? 'on' : ''} onClick={() => chooseTheme(t.value)}>
              {t.label}
            </button>
          ))}
        </div>
        <p className="muted small">« Système » suit le réglage de ton téléphone ou de ton ordinateur.</p>
      </section>

      <section className="panel">
        <h2>Profil</h2>
        <form className="form" onSubmit={saveName}>
          <label className="field"><span>Prénom</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" required />
          </label>
          <p className="muted small">Email : {user?.email}</p>
          {nameError && <p className="form-error" role="alert">{nameError}</p>}
          <div className="form-actions"><button className="btn primary">Enregistrer</button></div>
        </form>
      </section>

      <section className="panel">
        <h2>Mot de passe</h2>
        <form className="form" onSubmit={savePassword}>
          <label className="field"><span>Mot de passe actuel</span>
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
          </label>
          <label className="field"><span>Nouveau mot de passe (6 caractères minimum)</span>
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={6} required />
          </label>
          {pwdError && <p className="form-error" role="alert">{pwdError}</p>}
          <div className="form-actions"><button className="btn primary">Changer le mot de passe</button></div>
        </form>
      </section>

      <section className="panel">
        <h2>Mes données</h2>
        <p className="muted">Toutes tes opérations dans un fichier CSV, lisible par un tableur et réimportable dans Pécule.</p>
        <button className="btn ghost" onClick={exportCsv}>Télécharger l'export CSV</button>
      </section>

      <button className="btn ghost danger" onClick={logout}>Se déconnecter</button>
    </div>
  );
}
