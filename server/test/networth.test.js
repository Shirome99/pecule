import { describe, it, expect } from 'vitest';
import { newUser } from './helpers.js';
import amortization from '../src/amortization.js';
import recurring from '../src/recurring.js';

const { monthlyPayment, schedule, summary, outstandingAt } = amortization;
const LOAN = { principal: 20_000_000, annual_rate: 3.5, duration_months: 240, first_payment_date: '2023-10-05' };

describe("tableau d'amortissement", () => {
  it('200 000 € sur 240 mois à 3,5 % : mensualité de 1 159,92 €', () => {
    expect(Math.abs(monthlyPayment(LOAN.principal, 3.5, 240) - 115_992)).toBeLessThanOrEqual(1);
  });

  it('la dernière échéance ramène le capital à 0', () => {
    const rows = schedule(LOAN);
    expect(rows).toHaveLength(240);
    expect(rows[0]).toMatchObject({ n: 1, date: '2023-10-05', payment: 115_992, interest: 58_333, principal: 57_659 });
    expect(rows[239].remaining).toBe(0);
    expect(rows[239].date).toBe('2043-09-05');
    expect(rows.reduce((s, r) => s + r.principal, 0)).toBe(LOAN.principal);
    expect(rows.slice(0, -1).every((r) => r.payment === 115_992)).toBe(true);
  });

  it('synthèse et capital restant dû', () => {
    const s = summary({ ...LOAN, insurance_monthly: 2000 });
    expect(s).toMatchObject({ payment: 115_992, end_date: '2043-09-05', total_insurance: 240 * 2000 });
    expect(s.total_interest).toBe(schedule(LOAN).reduce((t, r) => t + r.interest, 0));
    expect(outstandingAt(LOAN, '2023-08-01')).toBe(0);              // avant le déblocage
    expect(outstandingAt(LOAN, '2023-09-20')).toBe(LOAN.principal); // débloqué, aucune échéance passée
    expect(outstandingAt(LOAN, '2023-10-05')).toBe(19_942_341);
    expect(outstandingAt(LOAN, '2050-01-01')).toBe(0);
    expect(monthlyPayment(1200, 0, 12)).toBe(100); // taux zéro
  });
});

describe('placements et crédits', () => {
  async function setup() {
    const u = await newUser();
    const courant = u.accounts[0].id;
    const pea = (await u.post('/api/accounts', { name: 'PEA', type: 'pea', initial_balance: 1000 })).body.id;
    const credit = (await u.post('/api/accounts', { name: 'Prêt immo', type: 'credit_immo' })).body.id;
    return { u, courant, pea, credit };
  }

  it('ne modifient ni les stats mensuelles, ni les budgets, ni le solde total', async () => {
    const { u, courant, pea, credit } = await setup();
    const month = '2025-06';
    await u.post('/api/budgets', { category_id: u.cat('Autres dépenses'), monthly_limit: 100 });
    await u.post('/api/transactions', { account_id: courant, amount: 2000, type: 'income', label: 'Salaire', date: `${month}-01` });
    await u.post('/api/transactions', { account_id: courant, amount: 40, type: 'expense', label: 'Divers', date: `${month}-02`, category_id: u.cat('Autres dépenses') });
    const before = (await u.get(`/api/stats?month=${month}`)).body;
    const budgetBefore = (await u.get(`/api/budgets?month=${month}`)).body[0].spent;

    await u.post('/api/transfers', { from_account_id: courant, to_account_id: pea, amount: 500, date: `${month}-05` });
    await u.post('/api/transactions', { account_id: pea, amount: 30, type: 'income', label: 'Dividendes', date: `${month}-10` });
    await u.post('/api/transactions', { account_id: credit, amount: 80, type: 'expense', label: 'Frais de dossier', date: `${month}-11`, category_id: u.cat('Autres dépenses') });
    await u.post('/api/accounts/' + pea + '/valuations', { date: `${month}-30`, value: 1700 });
    await u.put(`/api/accounts/${credit}/loan`, { principal: 100000, annual_rate: 2, duration_months: 120, first_payment_date: '2025-01-05' });
    await u.post('/api/recurring', { account_id: pea, amount: 5, type: 'expense', label: 'Frais PEA', start_date: '2020-01-01', day: 28 });

    const after = (await u.get(`/api/stats?month=${month}`)).body;
    expect(after.income).toBe(before.income);
    expect(after.expenses).toBe(before.expenses);
    expect(after.byCategory).toEqual(before.byCategory);
    expect(after.trend).toEqual(before.trend);
    expect(after.balance).toBe(before.balance - 500); // le virement vers le PEA sort des liquidités
    expect(after.upcoming).toBe(0);
    expect((await u.get(`/api/budgets?month=${month}`)).body[0].spent).toBe(budgetBefore);

    const f = (await u.get('/api/forecast')).body;
    expect(f.upcoming_expenses).toBe(0);
  });

  it('valorise un placement : dernière valeur, total versé, plus-value', async () => {
    const { u, courant, pea } = await setup();
    await u.post('/api/transfers', { from_account_id: courant, to_account_id: pea, amount: 1000, date: '2025-01-10' });
    expect((await u.post(`/api/accounts/${pea}/valuations`, { date: '2025-01-31', value: 2100 })).status).toBe(201);
    await u.post(`/api/accounts/${pea}/valuations`, { date: '2025-02-28', value: 2300 });
    await u.post(`/api/accounts/${pea}/valuations`, { date: '2025-02-28', value: 2500 }); // même date : remplace
    const acc = (await u.get('/api/accounts')).body.find((a) => a.id === pea);
    expect(acc).toMatchObject({ family: 'investment', balance: 2500, invested: 2000, gain: 500, gain_pct: 25, valued_at: '2025-02-28' });

    const vals = (await u.get(`/api/accounts/${pea}/valuations`)).body;
    expect(vals.map((v) => [v.date, v.value])).toEqual([['2025-02-28', 2500], ['2025-01-31', 2100]]);
    expect((await u.del(`/api/valuations/${vals[0].id}`)).status).toBe(200);
    expect((await u.get('/api/accounts')).body.find((a) => a.id === pea).balance).toBe(2100);

    const bad = await u.post(`/api/accounts/${courant}/valuations`, { date: '2025-01-31', value: 1 });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/que les placements/);
    expect((await u.post(`/api/accounts/${pea}/valuations`, { date: '2025-01-31', value: -1 })).body.error).toMatch(/négative/);
  });

  it("calcule la dette d'un crédit et son tableau", async () => {
    const { u, courant, credit } = await setup();
    const res = await u.put(`/api/accounts/${credit}/loan`, { principal: 200000, annual_rate: 3.5, duration_months: 240, first_payment_date: '2023-10-05', insurance_monthly: 20 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ payment: 1159.92, end_date: '2043-09-05', insurance_monthly: 20 });
    const acc = (await u.get('/api/accounts')).body.find((a) => a.id === credit);
    expect(acc.family).toBe('debt');
    expect(acc.balance).toBe(-res.body.outstanding);
    expect(acc.balance).toBe(-outstandingAt(LOAN, recurring.localToday()) / 100);

    const sched = (await u.get(`/api/loans/${acc.loan_id}/schedule`)).body;
    expect(sched.schedule).toHaveLength(240);
    expect(sched.schedule[239].remaining).toBe(0);

    expect((await u.put(`/api/accounts/${courant}/loan`, { principal: 1, annual_rate: 1, duration_months: 1, first_payment_date: '2025-01-01' })).status).toBe(400);
    expect((await u.put(`/api/accounts/${credit}/loan`, { principal: 1000, annual_rate: 1, duration_months: 0, first_payment_date: '2025-01-01' })).body.error).toMatch(/1 mois minimum/);
    expect((await u.post('/api/accounts', { name: 'x', type: 'livret_magique' })).body.error).toBe('Type de compte inconnu');
  });

  it('isole placements et crédits entre utilisateurs', async () => {
    const alice = await setup();
    const bob = await newUser();
    await alice.u.post(`/api/accounts/${alice.pea}/valuations`, { date: '2025-01-31', value: 5000 });
    await alice.u.put(`/api/accounts/${alice.credit}/loan`, { principal: 1000, annual_rate: 1, duration_months: 10, first_payment_date: '2025-01-05' });
    const val = (await alice.u.get(`/api/accounts/${alice.pea}/valuations`)).body[0];
    const loanId = (await alice.u.get('/api/accounts')).body.find((a) => a.id === alice.credit).loan_id;

    expect((await bob.get(`/api/accounts/${alice.pea}/valuations`)).status).toBe(404);
    expect((await bob.post(`/api/accounts/${alice.pea}/valuations`, { date: '2025-02-01', value: 1 })).status).toBe(404);
    expect((await bob.del(`/api/valuations/${val.id}`)).status).toBe(404);
    expect((await bob.get(`/api/accounts/${alice.credit}/loan`)).status).toBe(404);
    expect((await bob.put(`/api/accounts/${alice.credit}/loan`, { principal: 1, annual_rate: 1, duration_months: 1, first_payment_date: '2025-01-01' })).status).toBe(404);
    expect((await bob.get(`/api/loans/${loanId}/schedule`)).status).toBe(404);
    expect((await bob.get('/api/networth?months=1')).body.current.net).toBe(0);
    expect((await alice.u.get('/api/accounts')).body.find((a) => a.id === alice.pea).balance).toBe(5000);
  });
});

describe('GET /api/networth', () => {
  it('reconstitue liquidités, placements, dettes et patrimoine net en fin de mois', async () => {
    const u = await newUser();
    const courant = u.accounts[0].id;
    await u.put(`/api/accounts/${courant}`, { name: 'Compte courant', type: 'courant', initial_balance: 1000 });
    const pea = (await u.post('/api/accounts', { name: 'PEA', type: 'pea' })).body.id;
    const credit = (await u.post('/api/accounts', { name: 'Crédit', type: 'credit_conso' })).body.id;
    await u.post('/api/transactions', { account_id: courant, amount: 500, type: 'income', label: 'Prime', date: '2025-03-15' });
    await u.post('/api/transfers', { from_account_id: courant, to_account_id: pea, amount: 300, date: '2025-04-10' });
    await u.post(`/api/accounts/${pea}/valuations`, { date: '2025-04-30', value: 320 });
    await u.put(`/api/accounts/${credit}/loan`, { principal: 1200, annual_rate: 0, duration_months: 12, first_payment_date: '2025-04-05' });

    const res = await u.get('/api/networth?months=120');
    expect(res.status).toBe(200);
    const byMonth = Object.fromEntries(res.body.months.map((p) => [p.month, p]));
    expect(res.body.months).toHaveLength(120);
    expect(byMonth['2025-02']).toMatchObject({ date: '2025-02-28', liquid: 1000, investments: 0, debts: 0, net: 1000 });
    expect(byMonth['2025-03']).toMatchObject({ liquid: 1500, investments: 0, debts: -1200, net: 300 }); // crédit débloqué
    expect(byMonth['2025-04']).toMatchObject({ liquid: 1200, investments: 320, debts: -1100, net: 420 });
    const last = res.body.months[119];
    expect(res.body.current).toEqual(last);
    expect(last.debts).toBe(0); // remboursé
    expect(res.body.change_1m).toBeCloseTo(last.net - res.body.months[118].net, 2);
    expect(res.body.change_12m).toBeCloseTo(last.net - res.body.months[107].net, 2);
    expect((await u.get('/api/networth?months=500')).body.error).toMatch(/120 maximum/);
  });
});
