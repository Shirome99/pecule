const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const eur0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export const money = (n: number) => eur.format(n);
export const moneyRound = (n: number) => eur0.format(n);
export const signed = (n: number) => (n > 0 ? '+' : '') + eur.format(n);

export const currentMonth = () => new Date().toISOString().slice(0, 7);
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(ym: string, short = false) {
  const [y, m] = ym.split('-').map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString('fr-FR', short ? { month: 'short' } : { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function dayLabel(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  const s = new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function shortDate(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/** « Chaque mois, le 5 » · « Chaque lundi » · « Chaque année, le 14 juillet » */
export function frequencyLabel(frequency: 'monthly' | 'weekly' | 'yearly', day: number, startDate: string) {
  if (frequency === 'weekly') return `Chaque ${WEEKDAYS[day - 1]}`;
  if (frequency === 'yearly') {
    const month = new Date(2000, Number(startDate.slice(5, 7)) - 1, 1).toLocaleDateString('fr-FR', { month: 'long' });
    return `Chaque année, le ${day} ${month}`;
  }
  return `Chaque mois, le ${day}`;
}

export const ACCOUNT_TYPES = {
  courant: 'Compte courant',
  epargne: 'Épargne',
  especes: 'Espèces',
  carte: 'Carte',
  pea: 'PEA',
  assurance_vie: 'Assurance-vie',
  cto: 'Compte-titres',
  crypto: 'Crypto',
  immobilier: 'Immobilier',
  autre_placement: 'Autre placement',
  credit_immo: 'Crédit immobilier',
  credit_conso: 'Crédit conso',
} as const;

export const FAMILIES = {
  liquid: { label: 'Liquidités', types: ['courant', 'epargne', 'especes', 'carte'] },
  investment: { label: 'Placements', types: ['pea', 'assurance_vie', 'cto', 'crypto', 'immobilier', 'autre_placement'] },
  debt: { label: 'Dettes', types: ['credit_immo', 'credit_conso'] },
} as const;

export const familyOf = (type: string): keyof typeof FAMILIES =>
  (Object.keys(FAMILIES) as (keyof typeof FAMILIES)[]).find((f) => (FAMILIES[f].types as readonly string[]).includes(type)) ?? 'liquid';

export const percent = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;

/** « du 2 au 16 août » · « du 28 juillet au 3 août » · « le 5 mars » (année ajoutée si ce n'est pas l'année en cours). */
export function periodLabel(from: string, to: string) {
  const fmt = (s: string, opts: Intl.DateTimeFormatOptions) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('fr-FR', opts);
  };
  const year = to.slice(0, 4) !== String(new Date().getFullYear()) ? ' ' + to.slice(0, 4) : '';
  if (from === to) return `le ${fmt(from, { day: 'numeric', month: 'long' })}${year}`;
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const start = sameMonth ? fmt(from, { day: 'numeric' }) : fmt(from, { day: 'numeric', month: 'long', ...(from.slice(0, 4) !== to.slice(0, 4) ? { year: 'numeric' } : {}) });
  return `du ${start} au ${fmt(to, { day: 'numeric', month: 'long' })}${year}`;
}
