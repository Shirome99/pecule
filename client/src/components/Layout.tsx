import { Suspense, useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { currentMonth, shiftMonth } from '../format';
import TransactionForm from './TransactionForm';

const NAV = [
  { to: '/', label: 'Aperçu', icon: (
    <path d="M3 13h4v8H3zM10 8h4v13h-4zM17 3h4v18h-4z" />
  ) },
  { to: '/transactions', label: 'Opérations', icon: (
    <path d="M4 6h16M4 12h16M4 18h10" strokeWidth="2" strokeLinecap="round" fill="none" />
  ) },
  { to: '/budgets', label: 'Budgets', icon: (
    <path d="M12 3a9 9 0 1 0 9 9h-9z M14 2v8h8a8 8 0 0 0-8-8z" />
  ) },
  { to: '/comptes', label: 'Comptes', icon: (
    <path d="M3 7h18v12H3zM3 7l2-3h14l2 3M16 13h2" strokeWidth="2" fill="none" strokeLinejoin="round" />
  ) },
];

export default function Layout() {
  const { user, logout, newTxOpen, openNewTx, closeNewTx, month, setMonth } = useStore();
  const navigate = useNavigate();

  // raccourcis clavier (desktop) : N nouvelle opération, / recherche, ← → mois. Inactifs dans un champ ou une modale.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('.modal')) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        openNewTx();
      } else if (e.key === '/') {
        e.preventDefault();
        const search = document.querySelector<HTMLInputElement>('input[type="search"]');
        if (search) search.focus();
        else navigate('/transactions', { state: { focusSearch: true } });
      } else if (document.querySelector('.month-picker')) {
        if (e.key === 'ArrowLeft') setMonth(shiftMonth(month, -1));
        else if (e.key === 'ArrowRight' && month < currentMonth()) setMonth(shiftMonth(month, 1));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [month, setMonth, openNewTx, navigate]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/favicon.svg" alt="" width={28} height={28} />
          <span>Pécule</span>
        </div>
        <button className="btn primary add-desktop" onClick={openNewTx} aria-keyshortcuts="N">+ Nouvelle opération</button>
        <nav className="nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className="nav-link">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" stroke="currentColor" aria-hidden>{n.icon}</svg>
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="who">{user?.name}</span>
          <Link to="/reglages" className="link">Réglages</Link>
          <button className="link" onClick={logout}>Se déconnecter</button>
        </div>
      </aside>

      <main className="main">
        <Suspense fallback={<div className="page"><p className="muted">Chargement…</p></div>}>
          <Outlet />
        </Suspense>
      </main>

      <button className="fab" onClick={openNewTx} aria-label="Nouvelle opération">+</button>
      {newTxOpen && <TransactionForm onClose={closeNewTx} />}
    </div>
  );
}
