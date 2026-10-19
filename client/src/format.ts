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
} as const;
