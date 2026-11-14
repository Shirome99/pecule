import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import { StoreProvider, useStore } from './store';
import { ToastProvider } from './components/Toast';
import { applyTheme } from './theme';
import { LOCAL } from './api';
import Layout from './components/Layout';
import Login from './pages/Login';
import OfflineBanner from './components/OfflineBanner';
import AppLock from './components/AppLock';

// chaque page est un fichier JS à part, téléchargé à la première visite
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Budgets = lazy(() => import('./pages/Budgets'));
const Accounts = lazy(() => import('./pages/Accounts'));
const Subscriptions = lazy(() => import('./pages/Subscriptions'));
const Networth = lazy(() => import('./pages/Networth'));
const Settings = lazy(() => import('./pages/Settings'));
const Rules = lazy(() => import('./pages/Rules'));
const TagPage = lazy(() => import('./pages/TagPage'));
const Year = lazy(() => import('./pages/Year'));
const Recap = lazy(() => import('./pages/Recap'));
const GroupPage = lazy(() => import('./pages/GroupPage'));
const Welcome = lazy(() => import('./pages/Welcome'));

applyTheme();

// app mobile : police embarquée, intégration native, enregistrement de la base en arrière-plan
if (LOCAL) void import('@pecule/local').then((m) => m.initMobile());

function App() {
  const { user, ready } = useStore();
  if (!ready) return null;
  if (!user) return LOCAL ? <Welcome /> : <Login />;
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
        <Route path="reglages/regles" element={<Rules />} />
        <Route path="tags/:name" element={<TagPage />} />
        <Route path="annee" element={<Year />} />
        <Route path="recap/:month" element={<Recap />} />
        <Route path="partages/:id" element={<GroupPage />} />
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
          <AppLock>
            <OfflineBanner />
            <Suspense fallback={null}>
              <App />
            </Suspense>
          </AppLock>
        </ToastProvider>
      </StoreProvider>
    </BrowserRouter>
  </StrictMode>
);
