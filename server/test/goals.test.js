import { describe, it, expect } from 'vitest';
import { newUser } from './helpers.js';
import goals from '../src/goals.js';
import recurring from '../src/recurring.js';

const { goalPlan, monthsLeft } = goals;
const today = recurring.localToday();
const [y, m] = today.split('-').map(Number);
const inMonths = (n) => {
  const d = new Date(Date.UTC(y, m - 1 + n, 15));
  return d.toISOString().slice(0, 10);
};

describe('calcul du montant mensuel', () => {
  it('compte les mois restants', () => {
    expect(monthsLeft('2027-04-01', '2026-10-19')).toBe(6);
    expect(monthsLeft('2026-10-31', '2026-10-19')).toBe(1); // ce mois-ci
    expect(monthsLeft('2026-10-19', '2026-10-19')).toBe(1);
    expect(monthsLeft('2026-10-18', '2026-10-19')).toBe(0); // dépassée
  });

  it('répartit le reste sur les mois restants, arrondi au centime supérieur', () => {
    expect(goalPlan(100000, 400000, '2027-04-01', '2026-10-19')).toEqual({
      remaining: 300000, reached: false, overdue: false, months_left: 6, per_month: 50000, ratio: 0.25,
    });
    expect(goalPlan(0, 100000, '2027-01-05', '2026-10-19').per_month).toBe(33334); // 1000 € / 3 = 333,34 €
  });

  it('gère objectif atteint, date dépassée et absence de date', () => {
    expect(goalPlan(500000, 400000, '2027-04-01', '2026-10-19')).toMatchObject({ reached: true, per_month: 0, remaining: 0, ratio: 1 });
    expect(goalPlan(100000, 400000, '2026-01-01', '2026-10-19')).toMatchObject({ overdue: true, per_month: 300000, months_left: 0 });
    expect(goalPlan(100000, 400000, null, '2026-10-19')).toMatchObject({ per_month: null, months_left: null, remaining: 300000 });
    expect(goalPlan(-5000, 400000, null, '2026-10-19').ratio).toBe(0);
  });
});

describe('objectifs (API)', () => {
  it('crée, modifie et supprime un objectif à versements manuels', async () => {
    const u = await newUser();
    const created = await u.post('/api/goals', { name: 'Vacances', target_amount: 1200, target_date: inMonths(6), saved: 300 });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Vacances', target_amount: 1200, progress: 300, remaining: 900, months_left: 6, per_month: 150, account_id: null });

    const upd = await u.put(`/api/goals/${created.body.id}`, { name: 'Vacances Grèce', target_amount: 1500, target_date: inMonths(3) });
    expect(upd.status).toBe(200);
    expect(upd.body).toMatchObject({ name: 'Vacances Grèce', saved: 300, remaining: 1200, months_left: 3, per_month: 400 });

    // versements manuels
    expect((await u.post(`/api/goals/${created.body.id}/contributions`, { amount: 200 })).body.progress).toBe(500);
    expect((await u.post(`/api/goals/${created.body.id}/contributions`, { amount: -50 })).body.progress).toBe(450);
    const tooMuch = await u.post(`/api/goals/${created.body.id}/contributions`, { amount: -1000 });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.error).toMatch(/pas retirer plus que 450,00 €/);

    expect((await u.get('/api/goals')).body).toHaveLength(1);
    expect((await u.del(`/api/goals/${created.body.id}`)).status).toBe(200);
    expect((await u.get('/api/goals')).body).toHaveLength(0);
  });

  it('suit le solde du compte lié', async () => {
    const u = await newUser();
    const { body: { id: livret } } = await u.post('/api/accounts', { name: 'Livret', type: 'epargne', initial_balance: 1000 });
    const { body: goal } = await u.post('/api/goals', { name: 'Apport', target_amount: 5000, account_id: livret, target_date: inMonths(4) });
    expect(goal).toMatchObject({ account_name: 'Livret', progress: 1000, per_month: 1000 });

    await u.post('/api/transfers', { from_account_id: u.accounts[0].id, to_account_id: livret, amount: 1000, date: today });
    const [after] = (await u.get('/api/goals')).body;
    expect(after).toMatchObject({ progress: 2000, remaining: 3000, per_month: 750 });

    const contrib = await u.post(`/api/goals/${goal.id}/contributions`, { amount: 10 });
    expect(contrib.status).toBe(400);
    expect(contrib.body.error).toMatch(/suit le solde/);

    // supprimer le compte détache l'objectif
    await u.del(`/api/accounts/${livret}`);
    expect((await u.get('/api/goals')).body[0]).toMatchObject({ account_id: null, progress: 0 });
  });

  it('valide les entrées', async () => {
    const u = await newUser();
    expect((await u.post('/api/goals', { name: '', target_amount: 10 })).body.error).toBe('Nom requis');
    expect((await u.post('/api/goals', { name: 'x', target_amount: 0 })).body.error).toMatch(/montant cible doit être positif/);
    expect((await u.post('/api/goals', { name: 'x', target_amount: 10, target_date: '2026-02-30' })).body.error).toBe('Date cible invalide');
    expect((await u.post('/api/goals', { name: 'x', target_amount: 10, saved: -1 })).body.error).toMatch(/négatif/);
  });

  it('isole les objectifs entre utilisateurs', async () => {
    const alice = await newUser();
    const bob = await newUser();
    const { body: goal } = await alice.post('/api/goals', { name: 'Secret', target_amount: 100 });
    expect((await bob.get('/api/goals')).body).toHaveLength(0);
    expect((await bob.put(`/api/goals/${goal.id}`, { name: 'Hack', target_amount: 1 })).status).toBe(404);
    expect((await bob.post(`/api/goals/${goal.id}/contributions`, { amount: 1 })).status).toBe(404);
    expect((await bob.del(`/api/goals/${goal.id}`)).status).toBe(404);
    const steal = await bob.post('/api/goals', { name: 'x', target_amount: 1, account_id: alice.accounts[0].id });
    expect(steal.status).toBe(400);
    expect((await alice.get('/api/goals')).body[0]).toMatchObject({ name: 'Secret', progress: 0 });
  });
});
