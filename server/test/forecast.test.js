import { describe, it, expect } from 'vitest';
import { newUser } from './helpers.js';
import forecastModule from '../src/forecast.js';
import recurring from '../src/recurring.js';
import dates from '../src/dates.js';

const { forecast, median } = forecastModule;
const c = (euros) => Math.round(euros * 100);
const tx = (date, euros, extra = {}) => ({ date, amount: c(euros), transfer_id: null, recurring_id: null, ...extra });
const rule = (o) => ({ frequency: 'monthly', start_date: '2025-01-01', end_date: null, last_generated: null, to_account_id: null, ...o });

// historique : décembre 20 €/j, janvier 30 €/j, février 25 €/j de dépenses variables → médiane 25 €/j
const HISTORY = [
  tx('2025-12-10', -620), tx('2026-01-10', -930), tx('2026-02-10', -700),
  tx('2026-02-01', -1000, { recurring_id: 9 }), // récurrente : exclue du rythme variable
  tx('2026-02-15', -300, { transfer_id: 'x' }),  // virement : exclu partout
];

describe('prévision (module pur)', () => {
  it('médiane', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it('début de mois : rythme historique, loyer à venir', () => {
    const f = forecast({
      now: '2026-03-01', month: '2026-03', firstDate: '2025-11-15', spendableBalance: c(2000),
      transactions: [...HISTORY, tx('2026-03-01', 3000, { recurring_id: 1 })],
      rules: [rule({ amount: c(3000), day: 1, last_generated: '2026-03-01' }), rule({ amount: c(-1000), day: 5, last_generated: '2026-03-01' })],
    });
    expect(f).toMatchObject({
      is_past: false, days_in_month: 31, days_remaining: 31, income: c(3000), expenses: 0,
      upcoming_income: 0, upcoming_expenses: c(1000), variable_daily_rate: c(25), rate_basis: 'history', history_months: 3,
    });
    expect(f.projected_end_balance).toBe(c(2000) - c(1000) - c(25) * 31); // 225 €
    expect(f.safe_to_spend).toBe(c(2000));
    expect(f.safe_per_day).toBe(6451); // 2000 € / 31 jours, arrondi au centime inférieur
    expect(f.overspend).toBe(0);
  });

  it('dernier jour du mois : un seul jour restant', () => {
    const f = forecast({
      now: '2026-03-31', month: '2026-03', firstDate: '2025-11-15', spendableBalance: c(500),
      transactions: [...HISTORY, tx('2026-03-01', 3000), tx('2026-03-20', -2700)],
    });
    expect(f.days_remaining).toBe(1);
    expect(f.safe_to_spend).toBe(c(300));
    expect(f.safe_per_day).toBe(c(300));
    expect(f.projected_end_balance).toBe(c(500) - c(25));
  });

  it("sans historique : rythme du mois en cours jusqu'à aujourd'hui", () => {
    const f = forecast({
      now: '2026-03-20', month: '2026-03', firstDate: '2026-03-10', spendableBalance: c(1000),
      transactions: [tx('2026-03-10', 1500), tx('2026-03-12', -150), tx('2026-03-18', -250), tx('2026-03-25', -100)],
    });
    expect(f.rate_basis).toBe('current_month');
    expect(f.history_months).toBe(0);
    expect(f.variable_daily_rate).toBe(c(20)); // 400 € sur 20 jours (l'opération du 25 n'est pas encore passée)
    expect(f.days_remaining).toBe(12);
    expect(f.projected_end_balance).toBe(c(1000) - c(20) * 12);
    expect(f.expenses).toBe(c(500)); // les opérations du mois saisies à l'avance comptent comme réalisées
  });

  it('dépassement : renvoie le montant dépassé', () => {
    const f = forecast({
      now: '2026-03-15', month: '2026-03', firstDate: '2025-01-01', spendableBalance: c(-100),
      transactions: [tx('2026-03-01', 1500), tx('2026-03-05', -1800)],
    });
    expect(f.safe_to_spend).toBe(c(-300));
    expect(f.overspend).toBe(c(300));
    expect(f.safe_per_day).toBe(0);
  });

  it("récurrences et virements d'épargne", () => {
    const base = { frequency: 'monthly', start_date: '2025-01-01', last_generated: '2026-03-20' };
    const f = forecast({
      now: '2026-03-20', month: '2026-03', firstDate: '2025-11-15', spendableBalance: c(1200),
      transactions: [
        ...HISTORY,
        tx('2026-03-01', 500),
        tx('2026-03-02', -300, { transfer_id: 'r1', recurring_id: 7 }), tx('2026-03-02', 300, { transfer_id: 'r1' }),
        tx('2026-03-10', -200),
      ],
      rules: [
        rule({ ...base, amount: c(3000), day: 25 }),   // salaire à venir
        rule({ ...base, amount: c(-15), day: 28 }),    // abonnement à venir
        rule({ ...base, amount: c(-50), day: 5 }),     // déjà passé : pas « à venir »
        rule({ ...base, amount: c(-300), day: 2, to_account_id: 2, from_spendable: true, to_spendable: false, to_savings: true }),
        rule({ ...base, amount: c(-100), day: 27, to_account_id: 2, from_spendable: true, to_spendable: false, to_savings: true }),
        rule({ ...base, amount: c(-80), day: 26, to_account_id: 3, from_spendable: true, to_spendable: true, to_savings: false }),
      ],
    });
    expect(f).toMatchObject({
      income: c(500), expenses: c(200), upcoming_income: c(3000), upcoming_expenses: c(15),
      planned_savings: c(400), upcoming_savings_out: c(100),
    });
    expect(f.safe_to_spend).toBe(c(500 + 3000 - 200 - 15 - 400)); // 2885 €
    expect(f.days_remaining).toBe(12);
    expect(f.safe_per_day).toBe(Math.floor(c(2885) / 12));
    expect(f.projected_end_balance).toBe(c(1200 + 3000 - 15 - 100) - c(25) * 12);
  });

  it('mois passé : chiffres réels ; mois futur : refusé', () => {
    const f = forecast({ now: '2026-03-20', month: '2026-02', transactions: HISTORY });
    expect(f).toEqual({ month: '2026-02', is_past: true, income: 0, expenses: c(1700), net: c(-1700) });
    expect(() => forecast({ now: '2026-03-20', month: '2026-04', transactions: [] })).toThrow();
  });
});

describe('virements récurrents', () => {
  it('génèrent les deux lignes sans doublon', async () => {
    const u = await newUser();
    const { body: { id: livret } } = await u.post('/api/accounts', { name: 'Livret', type: 'epargne' });
    const start = dates.addMonths(recurring.localToday(), -2);
    const res = await u.post('/api/recurring', {
      account_id: u.accounts[0].id, to_account_id: livret, type: 'transfer', amount: 100, label: 'Épargne', start_date: start,
    });
    expect(res.status).toBe(201);
    await u.get('/api/stats');
    await u.get('/api/forecast');
    const balances = Object.fromEntries((await u.get('/api/accounts')).body.map((a) => [a.id, a.balance]));
    expect(balances).toEqual({ [u.accounts[0].id]: -300, [livret]: 300 });
    const [r] = (await u.get('/api/recurring')).body;
    expect(r).toMatchObject({ to_account_name: 'Livret', amount: -100 });
    // exclus des revenus / dépenses
    const s = (await u.get('/api/stats')).body;
    expect(s.trend.every((m) => m.income === 0 && m.expenses === 0)).toBe(true);
    const same = await u.post('/api/recurring', { account_id: livret, to_account_id: livret, type: 'transfer', amount: 1, label: 'x', start_date: start });
    expect(same.body.error).toMatch(/deux comptes différents/);
  });
});

describe('GET /api/forecast', () => {
  it('calcule la prévision du mois en cours et respecte les règles', async () => {
    const u = await newUser();
    const today = recurring.localToday();
    const month = today.slice(0, 7);
    const courant = u.accounts[0].id;
    const { body: { id: livret } } = await u.post('/api/accounts', { name: 'Livret', type: 'epargne', initial_balance: 5000 });
    await u.post('/api/transactions', { account_id: courant, amount: 2000, type: 'income', label: 'Salaire', date: `${month}-01` });
    await u.post('/api/transactions', { account_id: courant, amount: 300, type: 'expense', label: 'Courses', date: `${month}-01` });
    await u.post('/api/transfers', { from_account_id: courant, to_account_id: livret, amount: 200, date: `${month}-01` });
    await u.post('/api/recurring', {
      account_id: courant, to_account_id: livret, type: 'transfer', amount: 150, label: 'Épargne', start_date: `${month}-01`, day: 1,
    });

    const f = (await u.get('/api/forecast')).body;
    expect(f).toMatchObject({ month, is_past: false, income: 2000, expenses: 300, planned_savings: 150 });
    expect(f.spendable_balance).toBe(2000 - 300 - 200 - 150); // le livret n'est pas un compte du quotidien
    expect(f.safe_to_spend).toBeCloseTo(f.income + f.upcoming_income - f.expenses - f.upcoming_expenses - f.planned_savings, 2);
    expect(f.days_remaining).toBe(dates.daysIn(...month.split('-').map(Number)) - Number(today.slice(8)) + 1);
    expect(f.rate_basis).toBe('current_month');

    const past = (await u.get('/api/forecast?month=2020-01')).body;
    expect(past).toMatchObject({ is_past: true, income: 0, expenses: 0 });
    const future = await u.get(`/api/forecast?month=${dates.addMonths(today, 1).slice(0, 7)}`);
    expect(future.status).toBe(400);
    expect(future.body.error).toMatch(/mois en cours/);
    expect((await u.get('/api/forecast?month=mars')).body.error).toMatch(/Mois invalide/);

    // isolation
    const bob = await newUser();
    expect((await bob.get('/api/forecast')).body).toMatchObject({ income: 0, expenses: 0, planned_savings: 0, spendable_balance: 0 });
  });
});
