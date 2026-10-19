import { describe, it, expect } from 'vitest';
import { newUser } from './helpers.js';

const month = '2026-05';

async function setup() {
  const u = await newUser();
  const courant = u.accounts[0].id;
  const { body: { id: livret } } = await u.post('/api/accounts', { name: 'Livret A', type: 'epargne', initial_balance: 0 });
  await u.post('/api/transactions', { account_id: courant, amount: 2000, type: 'income', label: 'Salaire', date: `${month}-01`, category_id: u.cat('Salaire') });
  await u.post('/api/transactions', { account_id: courant, amount: 500, type: 'expense', label: 'Loyer', date: `${month}-02`, category_id: u.cat('Logement') });
  const balances = async () => Object.fromEntries((await u.get('/api/accounts')).body.map((a) => [a.id, a.balance]));
  return { u, courant, livret, balances };
}

describe('virements', () => {
  it('change les deux soldes sans bouger revenus ni dépenses du mois', async () => {
    const { u, courant, livret, balances } = await setup();
    const before = (await u.get(`/api/stats?month=${month}`)).body;

    const res = await u.post('/api/transfers', { from_account_id: courant, to_account_id: livret, amount: 300, date: `${month}-10` });
    expect(res.status).toBe(201);
    expect(res.body.transfer_id).toBeTruthy();

    expect(await balances()).toEqual({ [courant]: 1200, [livret]: 300 });
    const after = (await u.get(`/api/stats?month=${month}`)).body;
    expect(after.income).toBe(before.income);
    expect(after.expenses).toBe(before.expenses);
    expect(after.balance).toBe(before.balance);
    expect(after.byCategory).toEqual(before.byCategory);
    expect(after.trend).toEqual(before.trend);
  });

  it("n'apparaît qu'une fois sans filtre de compte, avec le compte d'en face", async () => {
    const { u, courant, livret } = await setup();
    await u.post('/api/transfers', { from_account_id: courant, to_account_id: livret, amount: 300, date: `${month}-10`, label: 'Épargne' });
    const all = (await u.get(`/api/transactions?month=${month}`)).body.filter((t) => t.transfer_id);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ amount: -300, label: 'Épargne', account_name: 'Compte courant', peer_account_name: 'Livret A', category_id: null });

    const onLivret = (await u.get(`/api/transactions?account_id=${livret}`)).body;
    expect(onLivret).toHaveLength(1);
    expect(onLivret[0]).toMatchObject({ amount: 300, peer_account_id: courant });
  });

  it("modifier l'une des lignes modifie l'autre", async () => {
    const { u, courant, livret, balances } = await setup();
    const { body: { transfer_id } } = await u.post('/api/transfers', { from_account_id: courant, to_account_id: livret, amount: 300, date: `${month}-10` });
    const line = (await u.get(`/api/transactions?account_id=${livret}`)).body[0];

    const res = await u.put(`/api/transactions/${line.id}`, { account_id: livret, amount: 450, type: 'income', label: 'Mise de côté', date: `${month}-12` });
    expect(res.status).toBe(200);
    expect(await balances()).toEqual({ [courant]: 1050, [livret]: 450 });
    const lines = (await u.get(`/api/transactions?month=${month}&account_id=${courant}`)).body.filter((t) => t.transfer_id);
    expect(lines[0]).toMatchObject({ amount: -450, label: 'Mise de côté', date: `${month}-12`, transfer_id });

    // via la route dédiée, en inversant le sens
    expect((await u.put(`/api/transfers/${transfer_id}`, { from_account_id: livret, to_account_id: courant, amount: 100, date: `${month}-12` })).status).toBe(200);
    expect(await balances()).toEqual({ [courant]: 1600, [livret]: -100 });
    expect((await u.get('/api/transactions')).body.find((t) => t.transfer_id).label).toBe('Virement');
  });

  it("supprimer l'une des lignes supprime l'autre", async () => {
    const { u, courant, livret, balances } = await setup();
    await u.post('/api/transfers', { from_account_id: courant, to_account_id: livret, amount: 300, date: `${month}-10` });
    const line = (await u.get(`/api/transactions?account_id=${livret}`)).body[0];
    expect((await u.del(`/api/transactions/${line.id}`)).status).toBe(200);
    expect(await balances()).toEqual({ [courant]: 1500, [livret]: 0 });
    expect((await u.get('/api/transactions')).body.some((t) => t.transfer_id)).toBe(false);
  });

  it('est exclu des budgets', async () => {
    const { u, courant, livret } = await setup();
    await u.post('/api/budgets', { category_id: u.cat('Logement'), monthly_limit: 1000 });
    await u.post('/api/transfers', { from_account_id: courant, to_account_id: livret, amount: 300, date: `${month}-10` });
    const [b] = (await u.get(`/api/budgets?month=${month}`)).body;
    expect(b.spent).toBe(500);
  });

  it('valide les comptes', async () => {
    const { u, courant, livret } = await setup();
    const same = await u.post('/api/transfers', { from_account_id: courant, to_account_id: courant, amount: 10, date: `${month}-10` });
    expect(same.status).toBe(400);
    expect(same.body.error).toMatch(/deux comptes différents/);
    const neg = await u.post('/api/transfers', { from_account_id: courant, to_account_id: livret, amount: -10, date: `${month}-10` });
    expect(neg.body.error).toMatch(/positif/);
    const missing = await u.post('/api/transfers', { to_account_id: livret, amount: 10, date: `${month}-10` });
    expect(missing.body.error).toMatch(/compte de départ/);
  });

  it("garde le solde de l'autre compte quand on supprime un compte", async () => {
    const { u, courant, livret, balances } = await setup();
    await u.post('/api/transfers', { from_account_id: courant, to_account_id: livret, amount: 300, date: `${month}-10` });
    expect((await u.del(`/api/accounts/${livret}`)).status).toBe(200);
    expect(await balances()).toEqual({ [courant]: 1200 });
    const t = (await u.get('/api/transactions')).body.find((x) => x.amount === -300);
    expect(t.transfer_id).toBeNull();
  });

  it("isole les virements entre utilisateurs", async () => {
    const alice = await setup();
    const bob = await setup();
    // Bob ne peut pas utiliser un compte d'Alice
    const res = await bob.u.post('/api/transfers', { from_account_id: alice.courant, to_account_id: bob.livret, amount: 10, date: `${month}-10` });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Compte invalide');

    const { body: { transfer_id } } = await alice.u.post('/api/transfers', { from_account_id: alice.courant, to_account_id: alice.livret, amount: 300, date: `${month}-10` });
    expect((await bob.u.put(`/api/transfers/${transfer_id}`, { from_account_id: bob.courant, to_account_id: bob.livret, amount: 1, date: `${month}-10` })).status).toBe(404);
    expect((await bob.u.del(`/api/transfers/${transfer_id}`)).status).toBe(404);
    // Alice ne peut pas rediriger son virement vers un compte de Bob
    expect((await alice.u.put(`/api/transfers/${transfer_id}`, { from_account_id: alice.courant, to_account_id: bob.livret, amount: 1, date: `${month}-10` })).status).toBe(400);
    expect(await alice.balances()).toEqual({ [alice.courant]: 1200, [alice.livret]: 300 });
  });
});
