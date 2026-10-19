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

/** Télécharge toutes les opérations en CSV (le fichier se réimporte tel quel). */
export async function downloadExport() {
  const res = await fetch('/api/export.csv', { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError(res.status, 'Export impossible pour le moment');
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: 'operations.csv' });
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- types ----------
/** `onboarding` : compte neuf sans opération, le parcours de premier lancement remplace l'Aperçu */
export type User = { id: number; email: string; name: string; currency: string; onboarding?: boolean };
export type AccountType =
  | 'courant' | 'epargne' | 'especes' | 'carte'
  | 'pea' | 'assurance_vie' | 'cto' | 'crypto' | 'immobilier' | 'autre_placement'
  | 'credit_immo' | 'credit_conso';
export type Family = 'liquid' | 'investment' | 'debt';
/** `balance` = valeur actuelle : solde (liquidités), dernière valorisation (placement), − capital restant dû (crédit) */
export type Account = {
  id: number; name: string; type: AccountType; family: Family; initial_balance: number; balance: number;
  invested?: number; gain?: number; gain_pct?: number | null; valued_at?: string | null; loan_id?: number | null;
};
export type Valuation = { id: number; date: string; value: number };
export type Loan = {
  id: number; account_id: number; principal: number; annual_rate: number; duration_months: number; first_payment_date: string;
  insurance_monthly: number; outstanding: number; payment: number; end_date: string;
  total_interest: number; total_insurance: number; total_cost: number;
};
export type ScheduleRow = { n: number; date: string; payment: number; interest: number; principal: number; insurance: number; remaining: number };
export type NetworthPoint = { month: string; date: string; liquid: number; investments: number; debts: number; net: number };
export type Networth = { current: NetworthPoint; change_1m: number | null; change_12m: number | null; months: NetworthPoint[] };
export type Category = { id: number; name: string; kind: 'expense' | 'income'; color: string; icon: string };
export type Transaction = {
  id: number; account_id: number; category_id: number | null; amount: number; label: string; date: string;
  category_name: string | null; category_color: string | null; category_icon: string | null; account_name: string;
  /** virement : identifiant commun aux deux lignes + compte d'en face */
  transfer_id: string | null; peer_account_id: number | null; peer_account_name: string | null;
  /** tags normalisés, sans # */
  tags: string[];
};
/** Proposée après avoir classé une opération : « Toujours classer "BASIC FIT" en Loisirs ? » */
export type RuleSuggestion = { pattern: string; category_id: number; category_name: string };
export type Rule = {
  id: number; pattern: string; category_id: number; priority: number;
  category_name: string; category_icon: string; category_color: string; category_kind: 'expense' | 'income';
};
export type Tag = { name: string; count: number; last_date: string };
export type TagSummary = {
  name: string; count: number; total: number; income: number; from: string; to: string;
  byCategory: { id: number | null; name: string; color: string; icon: string; total: number }[];
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
export type Subscription = {
  key: string; label: string; frequency: 'monthly' | 'yearly'; amount: number; annual_cost: number;
  category_id: number | null; category_name: string | null; category_icon: string | null; category_color: string | null;
  account_id: number | null; account_name: string | null; occurrences: number; last_date: string; next_date: string;
  price_change: { old_amount: number; new_amount: number; date: string } | null;
};
export type Subscriptions = { items: Subscription[]; monthly_total: number; annual_total: number };
