import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, cacheUser, getCachedUser, getToken, setToken, type Account, type AiStatus, type Category, type User } from './api';
import { currentMonth } from './format';
import { OPEN_NEW_TX } from './reminders';

type Store = {
  user: User | null;
  ready: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  /** profil modifié (prénom, fin du parcours d'accueil) */
  updateUser: (u: User) => void;
  accounts: Account[];
  categories: Category[];
  month: string;
  setMonth: (m: string) => void;
  /** incrémenté à chaque mutation : les pages s'en servent pour recharger */
  version: number;
  refresh: () => void;
  openNewTx: () => void;
  newTxOpen: boolean;
  closeNewTx: () => void;
  /** fonctions IA (ticket, assistant) : affichées seulement si le serveur les propose */
  ai: AiStatus;
  refreshAi: () => void;
};

const Ctx = createContext<Store>(null!);
export const useStore = () => useContext(Ctx);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [month, setMonth] = useState(currentMonth());
  const [version, setVersion] = useState(0);
  const [newTxOpen, setNewTxOpen] = useState(false);
  const [ai, setAi] = useState<AiStatus>({ enabled: false });
  const refreshAi = useCallback(() => { api.get<AiStatus>('/ai/status').then(setAi).catch(() => setAi({ enabled: false })); }, []);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setAccounts([]);
    setCategories([]);
  }, []);

  const updateUser = useCallback((u: User) => {
    cacheUser(u);
    setUser(u);
  }, []);

  const login = useCallback((token: string, u: User) => {
    setToken(token);
    cacheUser(u);
    setUser(u);
  }, []);

  // restauration de session ; hors ligne, on garde le dernier utilisateur connu
  useEffect(() => {
    if (!getToken()) { setReady(true); return; }
    api.get<User>('/me')
      .then((u) => { cacheUser(u); setUser(u); })
      .catch((err) => {
        if (err instanceof ApiError) setToken(null);
        else setUser(getCachedUser());
      })
      .finally(() => setReady(true));
  }, []);

  // retour du réseau : on recharge tout
  useEffect(() => {
    window.addEventListener('online', refresh);
    return () => window.removeEventListener('online', refresh);
  }, [refresh]);

  // notification de rappel touchée : formulaire « Nouvelle opération »
  useEffect(() => {
    const open = () => setNewTxOpen(true);
    window.addEventListener(OPEN_NEW_TX, open);
    return () => window.removeEventListener(OPEN_NEW_TX, open);
  }, []);

  useEffect(() => {
    window.addEventListener('auth:logout', logout);
    return () => window.removeEventListener('auth:logout', logout);
  }, [logout]);

  // données partagées
  useEffect(() => {
    if (!user) return;
    api.get<Account[]>('/accounts').then(setAccounts).catch(() => {});
    api.get<Category[]>('/categories').then(setCategories).catch(() => {});
  }, [user, version]);

  useEffect(() => { if (user) refreshAi(); }, [user, refreshAi]);

  // compte neuf : la première opération (ajoutée sans finir l'accueil) remplace le parcours par l'Aperçu
  const onboarding = !!user?.onboarding;
  useEffect(() => {
    if (onboarding && version > 0) api.get<User>('/me').then(updateUser).catch(() => {});
  }, [onboarding, version, updateUser]);

  return (
    <Ctx.Provider
      value={{
        user, ready, login, logout, updateUser, accounts, categories, month, setMonth, version, refresh,
        newTxOpen, openNewTx: () => setNewTxOpen(true), closeNewTx: () => setNewTxOpen(false), ai, refreshAi,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
