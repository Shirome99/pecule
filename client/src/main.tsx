import { lazy, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import { StoreProvider, useStore } from './store';
import { ToastProvider } from './components/Toast';
import { applyTheme } from './theme';
import Layout from './components/Layout';
import Login from './pages/Login';
import OfflineBanner from './components/OfflineBanner';

// chaque page est un fichier JS à part, téléchargé à la première visite
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Budgets = lazy(() => import('./pages/Budgets'));
const Accounts = lazy(() => import('./pages/Accounts'));
const Subscriptions = lazy(() => import('./pages/Subscriptions'));
const Networth = lazy(() => import('./pages/Networth'));
const Settings = lazy(() => import('./pages/Settings'));

applyTheme();

function App() {
  const { user, ready } = useStore();
  if (!ready) return null;
  if (!user) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={user.onboarding ? <Onboarding /> : <Dashboard />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="budgets" element={<Budgets />} />
        <Route path="comptes" element={<Accounts />} />
        <Route path="abonnements" element={<Subscriptions />} />
        <Route path="patrimoine" element={<Networth />} />
        <Route path="reglages" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <StoreProvider>
        <ToastProvider>
          <OfflineBanner />
          <App />
        </ToastProvider>
      </StoreProvider>
    </BrowserRouter>
  </StrictMode>
);
