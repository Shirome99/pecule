import { describe, it, expect } from 'vitest';
import { insights, historyMonths } from '../src/insights.js';
import { newUser } from './helpers.js';

const CAT = { 1: { name: 'Restaurants' }, 2: { name: 'Shopping' }, 3: { name: 'Courses' } };
let nextId = 1;
/** Une dépense de `euros` dans la catégorie, à la date donnée. */
const tx = (date, euros, category_id, label = 'Dépense') => ({ id: nextId++, date, amount: -Math.round(euros * 100), label, category_id });
/** 100 € par mois en Restaurants de mars à mai (4 × 25 €). */
const baseline = () => ['03', '04', '05'].flatMap((m) => [5, 10, 15, 20].map((d) => tx(`2026-${m}-${String(d).padStart(2, '0')}`, 25, 1)));
const run = (transactions, extra = {}) =>
  insights({ month: '2026-06', now: '2026-07-10', transactions, categories: CAT, firstDate: '2026-01-01', ...extra });
const ofType = (list, type) => list.filter((i) => i.type === type);
// Intl sépare les milliers et « € » par des espaces insécables
const plain = (s) => s.replace(/[  ]/g, ' ');

describe('insights.js : catégories en hausse ou en baisse', () => {
  it('hausse de plus de 30 % et de plus de 40 €', () => {
    const [up] = ofType(run([...baseline(), tx('2026-06-10', 200, 1)]), 'category_up');
    expect(up).toMatchObject({ amount: 10000, link: { month: '2026-06', category_id: 1 } });
    expect(plain(up.text)).toMatch(/^Restaurants : 200 € ce mois-là, \+100 % par rapport à ta moyenne de 100 €\.$/);
  });

  it('baisse de plus de 30 % et de plus de 40 €', () => {
    const [down] = ofType(run([...baseline(), tx('2026-06-10', 40, 1)]), 'category_down');
    expect(down.amount).toBe(6000);
    expect(down.text).toContain('−60 %');
  });

  it('rien sous les seuils (+25 %, ou +35 % mais seulement 35 €)', () => {
    expect(ofType(run([...baseline(), tx('2026-06-10', 125, 1)]), 'category_up')).toHaveLength(0);
    expect(ofType(run([...baseline(), tx('2026-06-10', 135, 1)]), 'category_up')).toHaveLength(0);
  });

  it('mois en cours : comparaison à date équivalente', () => {
    // au 10 juin, 60 € contre 25 € (5 et 10 de chaque mois) en moyenne à la même date : +140 %, +35 € → sous 40 €
    const list = insights({ month: '2026-06', now: '2026-06-10', transactions: [...baseline(), tx('2026-06-02', 60, 1)], categories: CAT, firstDate: '2026-01-01' });
    expect(ofType(list, 'category_up')).toHaveLength(0);
    const list2 = insights({ month: '2026-06', now: '2026-06-10', transactions: [...baseline(), tx('2026-06-02', 120, 1)], categories: CAT, firstDate: '2026-01-01' });
    expect(ofType(list2, 'category_up')[0].text).toContain('au 10');
  });
});

describe('insights.js : dépense inhabituelle', () => {
  const shopping = () => ['01', '02', '03', '04', '05'].map((m) => tx(`2026-${m}-12`, 40, 2, 'Vêtements'));

  it('une opération plus de 3 fois la médiane de sa catégorie sur 6 mois', () => {
    const [u] = ofType(run([...shopping(), tx('2026-06-12', 150, 2, 'Manteau')]), 'unusual');
    expect(u.amount).toBe(11000);
    expect(plain(u.text)).toBe('Dépense inhabituelle : « Manteau », 150 € le 12 juin, 4 fois ta dépense habituelle en Shopping (40 €).');
    expect(u.link).toEqual({ month: '2026-06', q: 'Manteau' });
  });

  it('rien à 2,75 fois la médiane, ni sans assez d’historique dans la catégorie', () => {
    expect(ofType(run([...shopping(), tx('2026-06-12', 110, 2)]), 'unusual')).toHaveLength(0);
    expect(ofType(run([tx('2026-05-12', 40, 2), tx('2026-04-12', 40, 2), tx('2026-06-12', 500, 2)]), 'unusual')).toHaveLength(0);
  });
});

describe('insights.js : budget en voie de dépassement', () => {
  const now = '2026-06-10';
  const run10 = (spent) => insights({
    month: '2026-06', now, transactions: [tx('2026-06-03', spent, 3)], categories: CAT,
    budgets: [{ category_id: 3, monthly_limit: 30000 }], firstDate: '2026-01-01',
  });

  it('au rythme actuel, le budget sera dépassé : date estimée', () => {
    const [b] = ofType(run10(150), 'budget_pace');
    expect(b.amount).toBe(15000); // 15 €/jour × 30 jours = 450 € pour 300 €
    expect(plain(b.text)).toBe('Budget Courses : à ce rythme, il sera dépassé vers le 20 juin (450 € prévus pour 300 €).');
  });

  it('rien si le rythme tient dans le budget, ou si le budget est déjà dépassé', () => {
    expect(ofType(run10(90), 'budget_pace')).toHaveLength(0);
    expect(ofType(run10(320), 'budget_pace')).toHaveLength(0);
  });

  it('jamais pour un mois passé', () => {
    expect(ofType(run([tx('2026-06-03', 290, 3)], { budgets: [{ category_id: 3, monthly_limit: 30000 }] }), 'budget_pace')).toHaveLength(0);
  });
});

describe('insights.js : bonne nouvelle', () => {
  const months = ['01', '02', '03', '04', '05'];
  const history = () => months.map((m) => tx(`2026-${m}-05`, 500, 3)).concat(months.map((m) => tx(`2026-${m}-25`, 900, 3)));
  const run15 = (extra) => insights({ month: '2026-06', now: '2026-06-15', transactions: [...history(), ...extra], categories: CAT, firstDate: '2026-01-01' });

  it('mois en cours le moins dépensier des 6 derniers à date équivalente', () => {
    const [g] = ofType(run15([tx('2026-06-04', 300, 3)]), 'good_news');
    expect(g.amount).toBe(20000);
    expect(plain(g.text)).toBe('Bonne nouvelle : 300 € dépensés au 15, ton mois le plus économe des 6 derniers à la même date (moyenne 500 €).');
  });

  it('rien si un mois précédent était plus économe à la même date', () => {
    expect(ofType(run15([tx('2026-06-04', 550, 3)]), 'good_news')).toHaveLength(0);
  });
});

describe('insights.js : général', () => {
  it('aucun constat avec moins de 2 mois d’historique', () => {
    expect(historyMonths('2026-06', '2026-05-01')).toBe(1);
    expect(historyMonths('2026-06', '2026-04-01')).toBe(2);
    expect(run([...baseline(), tx('2026-06-10', 400, 1)], { firstDate: '2026-04-15' })).toEqual([]);
    expect(run([], { firstDate: null })).toEqual([]);
  });

  it('au plus 3 constats, triés par importance en euros', () => {
    const shopping = ['01', '02', '03', '04', '05'].map((m) => tx(`2026-${m}-12`, 40, 2));
    const courses = ['03', '04', '05'].map((m) => tx(`2026-${m}-08`, 200, 3));
    const list = run([...baseline(), ...shopping, ...courses, tx('2026-06-10', 300, 1), tx('2026-06-12', 400, 2), tx('2026-06-08', 20, 3)]);
    expect(list).toHaveLength(3);
    expect(list.map((i) => i.amount)).toEqual([...list.map((i) => i.amount)].sort((a, b) => b - a));
    expect(list[0].type).toBe('category_up'); // Shopping : +400 € environ
  });
});

describe('GET /api/insights', () => {
  it('renvoie une liste (vide sans historique) et refuse un mois futur', async () => {
    const u = await newUser();
    expect((await u.get('/api/insights')).body).toEqual([]);
    expect((await u.get('/api/insights?month=2999-01')).status).toBe(400);
    expect((await u.get('/api/insights?month=juin')).body.error).toMatch(/Mois invalide/);
  });

  it('ne lit que les opérations de l’utilisateur', async () => {
    const u = await newUser();
    const other = await newUser('Autre');
    const acc = u.accounts[0].id;
    const add = (date, amount) => u.post('/api/transactions', { account_id: acc, category_id: u.cat('Restaurants'), amount, type: 'expense', label: 'Resto', date });
    for (const m of ['2026-01', '2026-02', '2026-03']) await add(`${m}-10`, 100);
    await add('2026-04-10', 400);
    const list = (await u.get('/api/insights?month=2026-04')).body;
    expect(list[0]).toMatchObject({ type: 'category_up', amount: 300, link: { month: '2026-04', category_id: u.cat('Restaurants') } });
    expect((await other.get('/api/insights?month=2026-04')).body).toEqual([]);
  });
});
