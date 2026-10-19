import { NavLink, Outlet } from 'react-router-dom';
import { useStore } from '../store';
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
  const { user, logout, newTxOpen, openNewTx, closeNewTx } = useStore();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/favicon.svg" alt="" width={28} height={28} />
          <span>Pécule</span>
        </div>
        <button className="btn primary add-desktop" onClick={openNewTx}>+ Nouvelle opération</button>
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
          <button className="link" onClick={logout}>Se déconnecter</button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>

      <button className="fab" onClick={openNewTx} aria-label="Nouvelle opération">+</button>
      {newTxOpen && <TransactionForm onClose={closeNewTx} />}
    </div>
  );
}
