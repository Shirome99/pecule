import { describe, it, expect } from 'vitest';
import { newUser, app, request } from './helpers.js';

const month = '2026-03';

describe('auth', () => {
  it('inscrit puis connecte un utilisateur', async () => {
    const reg = await request(app).post('/api/auth/register')
      .send({ name: 'Alice', email: 'Alice@Test.fr', password: 'secret12' });
    expect(reg.status).toBe(201);
    expect(reg.body.token).toBeTruthy();
    expect(reg.body.user.email).toBe('alice@test.fr');

    const login = await request(app).post('/api/auth/login').send({ email: 'alice@test.fr', password: 'secret12' });
    expect(login.status).toBe(200);
    expect(login.body.user.name).toBe('Alice');
  });

  it('refuse un email déjà pris, un mauvais mot de passe et des données invalides', async () => {
    await request(app).post('/api/auth/register').send({ name: 'B', email: 'b@test.fr', password: 'secret12' });
    const dup = await request(app).post('/api/auth/register').send({ name: 'B', email: 'b@test.fr', password: 'secret12' });
    expect(dup.status).toBe(409);
    const bad = await request(app).post('/api/auth/login').send({ email: 'b@test.fr', password: 'mauvais' });
    expect(bad.status).toBe(401);
    const short = await request(app).post('/api/auth/register').send({ name: 'C', email: 'c@test.fr', password: '123' });
    expect(short.status).toBe(400);
    expect(short.body.error).toMatch(/6 caractères/);
  });

  it('crée les catégories et le compte par défaut', async () => {
    const u = await newUser();
    expect(u.accounts).toHaveLength(1);
    expect(u.categories.length).toBe(11);
  });

  it('refuse les routes protégées sans token ou avec un token invalide', async () => {
    for (const url of ['/api/me', '/api/accounts', '/api/transactions', '/api/stats', '/api/budgets', '/api/export.csv']) {
      expect((await request(app).get(url)).status).toBe(401);
    }
    const res = await request(app).get('/api/me').set('Authorization', 'Bearer pas-un-jwt');
    expect(res.status).toBe(401);
  });
});

describe('opérations', () => {
  it('CRUD complet avec le bon signe', async () => {
    const u = await newUser();
    const acc = u.accounts[0].id;
    const created = await u.post('/api/transactions', {
      account_id: acc, category_id: u.cat('Courses'), amount: 42.5, type: 'expense', label: 'Monoprix', date: `${month}-10`,
    });
    expect(created.status).toBe(201);
    const id = created.body.id;

    let list = (await u.get(`/api/transactions?month=${month}`)).body;
    expect(list).toHaveLength(1);
    expect(list[0].amount).toBe(-42.5);
    expect(list[0].category_name).toBe('Courses');

    const upd = await u.put(`/api/transactions/${id}`, {
      account_id: acc, category_id: null, amount: 1000, type: 'income', label: 'Prime', date: `${month}-11`,
    });
    expect(upd.status).toBe(200);
    list = (await u.get(`/api/transactions?month=${month}`)).body;
    expect(list[0]).toMatchObject({ amount: 1000, label: 'Prime', category_id: null });

    expect((await u.del(`/api/transactions/${id}`)).status).toBe(200);
    expect((await u.get(`/api/transactions?month=${month}`)).body).toHaveLength(0);
  });

  it('valide les entrées avec des messages en français', async () => {
    const u = await newUser();
    const res = await u.post('/api/transactions', {
      account_id: u.accounts[0].id, amount: -3, type: 'expense', label: 'x', date: `${month}-01`,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/positif/);
    const res2 = await u.post('/api/transactions', {
      account_id: u.accounts[0].id, amount: 3, type: 'expense', label: '', date: `${month}-01`,
    });
    expect(res2.body.error).toMatch(/Libellé/);
  });

  it('filtre par recherche, compte et catégorie', async () => {
    const u = await newUser();
    const acc = u.accounts[0].id;
    await u.post('/api/transactions', { account_id: acc, category_id: u.cat('Courses'), amount: 10, type: 'expense', label: 'Lidl', date: `${month}-02` });
    await u.post('/api/transactions', { account_id: acc, category_id: u.cat('Transport'), amount: 20, type: 'expense', label: 'Navigo', date: `${month}-03` });
    expect((await u.get('/api/transactions?q=lid')).body).toHaveLength(1);
    expect((await u.get(`/api/transactions?category_id=${u.cat('Transport')}`)).body[0].label).toBe('Navigo');
    expect((await u.get(`/api/transactions?account_id=${acc}`)).body).toHaveLength(2);
  });
});

describe('isolation entre utilisateurs', () => {
  it("un utilisateur ne peut ni lire ni modifier les données d'un autre", async () => {
    const alice = await newUser('Alice');
    const bob = await newUser('Bob');
    const aliceAcc = alice.accounts[0].id;
    const { body: { id: txId } } = await alice.post('/api/transactions', {
      account_id: aliceAcc, amount: 50, type: 'expense', label: 'Secret', date: `${month}-05`,
    });
    await alice.post('/api/budgets', { category_id: alice.cat('Courses'), monthly_limit: 100 });
    const aliceBudget = (await alice.get(`/api/budgets?month=${month}`)).body[0];

    // lecture
    expect((await bob.get('/api/transactions')).body).toHaveLength(0);
    expect((await bob.get(`/api/transactions?account_id=${aliceAcc}`)).body).toHaveLength(0);
    expect((await bob.get('/api/accounts')).body.map((a) => a.id)).not.toContain(aliceAcc);
    expect((await bob.get(`/api/budgets?month=${month}`)).body).toHaveLength(0);
    expect((await bob.get(`/api/stats?month=${month}`)).body.expenses).toBe(0);
    expect((await bob.get('/api/export.csv')).text).not.toContain('Secret');

    // écriture sur les ressources d'Alice
    const body = { account_id: bob.accounts[0].id, amount: 1, type: 'expense', label: 'Hack', date: `${month}-05` };
    expect((await bob.put(`/api/transactions/${txId}`, body)).status).toBe(404);
    expect((await bob.del(`/api/transactions/${txId}`)).status).toBe(404);
    expect((await bob.put(`/api/accounts/${aliceAcc}`, { name: 'Hack' })).status).toBe(404);
    expect((await bob.del(`/api/accounts/${aliceAcc}`)).status).toBe(404);
    expect((await bob.del(`/api/categories/${alice.cat('Courses')}`)).status).toBe(404);
    expect((await bob.del(`/api/budgets/${aliceBudget.id}`)).status).toBe(404);

    // utilisation des références d'Alice dans ses propres données
    expect((await bob.post('/api/transactions', { ...body, account_id: aliceAcc })).status).toBe(400);
    expect((await bob.post('/api/transactions', { ...body, category_id: alice.cat('Courses') })).status).toBe(400);
    expect((await bob.post('/api/budgets', { category_id: alice.cat('Courses'), monthly_limit: 10 })).status).toBe(400);

    // rien n'a bougé chez Alice
    const tx = (await alice.get('/api/transactions')).body;
    expect(tx).toHaveLength(1);
    expect(tx[0].label).toBe('Secret');
    expect((await alice.get('/api/accounts')).body[0].name).toBe('Compte courant');
  });
});

describe('comptes et soldes', () => {
  it('calcule le solde = solde initial + opérations', async () => {
    const u = await newUser();
    const { body: { id: livret } } = await u.post('/api/accounts', { name: 'Livret', type: 'epargne', initial_balance: 1000.5 });
    await u.post('/api/transactions', { account_id: livret, amount: 200.25, type: 'income', label: 'Dépôt', date: `${month}-01` });
    await u.post('/api/transactions', { account_id: livret, amount: 0.75, type: 'expense', label: 'Frais', date: `${month}-02` });
    const acc = (await u.get('/api/accounts')).body.find((a) => a.id === livret);
    expect(acc.balance).toBe(1200);
    expect(acc.initial_balance).toBe(1000.5);
  });

  it('interdit de supprimer le dernier compte', async () => {
    const u = await newUser();
    const res = await u.del(`/api/accounts/${u.accounts[0].id}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/au moins un compte/);
  });
});

describe('stats', () => {
  it('additionne revenus, dépenses, répartition et tendance', async () => {
    const u = await newUser();
    const acc = u.accounts[0].id;
    const add = (amount, type, label, date, cat) =>
      u.post('/api/transactions', { account_id: acc, amount, type, label, date, category_id: cat ? u.cat(cat) : null });
    await add(3000, 'income', 'Salaire', `${month}-01`, 'Salaire');
    await add(1000, 'expense', 'Loyer', `${month}-03`, 'Logement');
    await add(150.4, 'expense', 'Courses', `${month}-04`, 'Courses');
    await add(50, 'expense', 'Divers', `${month}-05`);
    await add(80, 'expense', 'Mois précédent', '2026-02-15', 'Courses');

    const s = (await u.get(`/api/stats?month=${month}`)).body;
    expect(s.income).toBe(3000);
    expect(s.expenses).toBe(1200.4);
    expect(s.net).toBe(1799.6);
    expect(s.balance).toBe(1719.6);
    expect(s.byCategory.map((c) => [c.name, c.total])).toEqual([['Logement', 1000], ['Courses', 150.4], ['Sans catégorie', 50]]);
    expect(s.trend).toHaveLength(6);
    expect(s.trend[5]).toEqual({ month, income: 3000, expenses: 1200.4 });
    expect(s.trend[4]).toEqual({ month: '2026-02', income: 0, expenses: 80 });
    expect(s.trend[0].month).toBe('2025-10');
  });
});

describe('budgets', () => {
  it('crée, met à jour, calcule le dépensé du mois et supprime', async () => {
    const u = await newUser();
    const acc = u.accounts[0].id;
    const courses = u.cat('Courses');
    expect((await u.post('/api/budgets', { category_id: courses, monthly_limit: 300 })).status).toBe(201);
    await u.post('/api/budgets', { category_id: courses, monthly_limit: 400 }); // upsert
    await u.post('/api/transactions', { account_id: acc, category_id: courses, amount: 120, type: 'expense', label: 'Lidl', date: `${month}-08` });
    await u.post('/api/transactions', { account_id: acc, category_id: courses, amount: 99, type: 'expense', label: 'Lidl', date: '2026-04-01' });

    const list = (await u.get(`/api/budgets?month=${month}`)).body;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ category_id: courses, monthly_limit: 400, spent: 120 });

    const bad = await u.post('/api/budgets', { category_id: courses, monthly_limit: 0 });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/positif/);

    expect((await u.del(`/api/budgets/${list[0].id}`)).status).toBe(200);
    expect((await u.get(`/api/budgets?month=${month}`)).body).toHaveLength(0);
  });
});

describe('export CSV', () => {
  it('exporte au format Excel FR', async () => {
    const u = await newUser();
    await u.post('/api/transactions', { account_id: u.accounts[0].id, amount: 12.3, type: 'expense', label: 'Café "noir"', date: `${month}-01` });
    const res = await u.get('/api/export.csv');
    expect(res.status).toBe(200);
    const lines = res.text.replace(/^﻿/, '').split('\n');
    expect(lines[0]).toBe('date;libelle;montant;categorie;compte');
    expect(lines[1]).toBe(`${month}-01;"Café ""noir""";-12,30;"";"Compte courant"`);
  });
});
