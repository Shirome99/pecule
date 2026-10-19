// Client HTTP minimal : ajoute le token, gère les erreurs et la déconnexion.
const TOKEN_KEY = 'pecule_token';
const USER_KEY = 'pecule_user';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) => {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }
};

/** Dernier utilisateur connu : permet d'ouvrir l'app hors ligne. */
export const getCachedUser = (): User | null => {
  try { return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null'); } catch { return null; }
};
export const cacheUser = (u: User) => localStorage.setItem(USER_KEY, JSON.stringify(u));

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`/api${url}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) {
    setToken(null);
    window.dispatchEvent(new Event('auth:logout'));
  }
  if (!res.ok) throw new ApiError(res.status, data.error || 'Une erreur est survenue');
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body: unknown) => request<T>('POST', url, body),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
};

// ---------- types ----------
export type User = { id: number; email: string; name: string; currency: string };
export type AccountType = 'courant' | 'epargne' | 'especes' | 'carte';
export type Account = { id: number; name: string; type: AccountType; initial_balance: number; balance: number };
export type Category = { id: number; name: string; kind: 'expense' | 'income'; color: string; icon: string };
export type Transaction = {
  id: number; account_id: number; category_id: number | null; amount: number; label: string; date: string;
  category_name: string | null; category_color: string | null; category_icon: string | null; account_name: string;
  /** virement : identifiant commun aux deux lignes + compte d'en face */
  transfer_id: string | null; peer_account_id: number | null; peer_account_name: string | null;
};
export type Budget = { id: number; category_id: number; monthly_limit: number; name: string; color: string; icon: string; spent: number };
export type Stats = {
  month: string; income: number; expenses: number; net: number; balance: number;
  byCategory: { id: number | null; name: string; color: string; icon: string; total: number }[];
  trend: { month: string; income: number; expenses: number }[];
  /** récurrences du mois pas encore passées (montant signé) */
  upcoming: number; upcoming_count: number;
};
export type Frequency = 'monthly' | 'weekly' | 'yearly';
export type Recurring = {
  id: number; account_id: number; category_id: number | null; amount: number; label: string;
  frequency: Frequency; day: number; start_date: string; end_date: string | null; last_generated: string | null;
  paused: boolean; next_date: string | null;
  /** virement récurrent : compte d'arrivée */
  to_account_id: number | null; to_account_name: string | null;
  account_name: string; category_name: string | null; category_color: string | null; category_icon: string | null;
};
export type Goal = {
  id: number; name: string; target_amount: number; target_date: string | null; account_id: number | null;
  account_name: string | null; saved: number; progress: number; remaining: number; ratio: number;
  reached: boolean; overdue: boolean; months_left: number | null; per_month: number | null;
};
export type Forecast = {
  month: string; is_past: boolean; income: number; expenses: number; net?: number;
  today: string; last_day: string; days_in_month: number; days_remaining: number;
  upcoming_income: number; upcoming_expenses: number; upcoming_savings_out: number; planned_savings: number;
  variable_daily_rate: number; rate_basis: 'history' | 'current_month'; history_months: number;
  spendable_balance: number; projected_end_balance: number; safe_to_spend: number; safe_per_day: number; overspend: number;
};
