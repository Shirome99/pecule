import { describe, it, expect } from 'vitest';
import { newUser } from './helpers.js';
import { yearSummary } from '../src/yearly.js';

const cents = (n) => Math.round(n * 100);

describe('vue annuelle', () => {
  it('les totaux de l’année sont égaux à la somme des 12 /api/stats mensuels', async () => {
    const u = await newUser();
    const acc = u.accounts[0].id;
    const { body: { id: livret } } = await u.post('/api/accounts', { name: 'Livret', type: 'epargne' });
    const { body: { id: pea } } = await u.post('/api/accounts', { name: 'PEA', type: 'pea' });
    const add = (amount, type, category, date, account = acc) =>
      u.post('/api/transactions', { account_id: account, category_id: category && u.cat(category), amount, type, label: `${category ?? 'x'} ${date}`, date });
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0');
      await add(2400.5, 'income', 'Salaire', `2025-${mm}-01`);
      await add(812.37 + m, 'expense', 'Logement', `2025-${mm}-03`);
      await add(63.21 * m, 'expense', 'Courses', `2025-${mm}-15`);
      if (m % 3 === 0) await add(19.99, 'expense', null, `2025-${mm}-20`);
      await u.post('/api/transfers', { from_account_id: acc, to_account_id: livret, amount: 150, date: `2025-${mm}-05` });
    }
    await add(30, 'expense', 'Loisirs', '2025-06-10', livret); // dépense depuis un livret : liquidités, compte
    await add(500, 'expense', 'Shopping', '2025-06-10', pea); // placement : exclu partout
    await add(1000, 'expense', 'Logement', '2024-12-31'); // autre année
    await add(1000, 'expense', 'Logement', '2026-01-01');

    const year = (await u.get('/api/stats/year?year=2025')).body;
    let income = 0;
    let expenses = 0;
    for (let m = 1; m <= 12; m++) {
      const month = `2025-${String(m).padStart(2, '0')}`;
      const s = (await u.get(`/api/stats?month=${month}`)).body;
      income += cents(s.income);
      expenses += cents(s.expenses);
      const ym = year.months[m - 1];
      expect([ym.month, cents(ym.income), cents(ym.expenses)]).toEqual([month, cents(s.income), cents(s.expenses)]);
      // par catégorie aussi
      for (const c of s.byCategory) {
        const yc = year.categories.find((x) => x.id === c.id);
        expect(cents(yc.months[m - 1])).toBe(cents(c.total));
      }
    }
    expect(cents(year.income)).toBe(income);
    expect(cents(year.expenses)).toBe(expenses);
    expect(cents(year.savings)).toBe(income - expenses);
    expect(cents(year.categories.reduce((s, c) => s + c.total, 0))).toBe(expenses);
    expect(year.savings_rate).toBeCloseTo(((income - expenses) / income) * 100, 1);
    expect(year.top).toHaveLength(5);
    expect(year.top[0].amount).toBeCloseTo(-(812.37 + 12), 2);
  });

  it('année invalide, et isolation', async () => {
    const u = await newUser();
    const other = await newUser('Autre');
    await u.post('/api/transactions', { account_id: u.accounts[0].id, amount: 10, type: 'expense', label: 'x', date: '2025-05-05' });
    expect((await u.get('/api/stats/year?year=abc')).body.error).toMatch(/Année invalide/);
    expect((await other.get('/api/stats/year?year=2025')).body.expenses).toBe(0);
  });

  it('yearSummary (pur) : taux d’épargne nul sans revenu, sans catégorie regroupé', () => {
    const y = yearSummary([
      { id: 1, date: '2025-02-01', amount: -1000, label: 'a', category_id: null },
      { id: 2, date: '2025-02-03', amount: -500, label: 'b', category_id: null },
    ], 2025);
    expect(y.savings_rate).toBeNull();
    expect(y.categories).toHaveLength(1);
    expect(y.categories[0]).toMatchObject({ name: 'Sans catégorie', total: 1500 });
    expect(y.categories[0].months[1]).toBe(1500);
  });
});
