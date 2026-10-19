import { describe, it, expect } from 'vitest';
import { newUser } from './helpers.js';

const month = '2026-03';

describe('annuler une suppression', () => {
  it('une opération supprimée revient à l’identique (même id)', async () => {
    const u = await newUser();
    const { body: { id } } = await u.post('/api/transactions', {
      account_id: u.accounts[0].id, category_id: u.cat('Courses'), amount: 42.5, type: 'expense', label: 'Marché', date: `${month}-04`,
    });
    const del = await u.del(`/api/transactions/${id}`);
    expect(del.body.undo).toBeTruthy();
    expect((await u.get(`/api/stats?month=${month}`)).body.expenses).toBe(0);

    expect((await u.post('/api/undo', { token: del.body.undo })).status).toBe(200);
    const [tx] = (await u.get(`/api/transactions?month=${month}`)).body;
    expect(tx).toMatchObject({ id, amount: -42.5, label: 'Marché', category_id: u.cat('Courses') });
    // le jeton ne sert qu'une fois
    expect((await u.post('/api/undo', { token: del.body.undo })).status).toBe(410);
  });

  it('un virement supprimé revient sur les deux comptes', async () => {
    const u = await newUser();
    const { body: { id: livret } } = await u.post('/api/accounts', { name: 'Livret', type: 'epargne' });
    await u.post('/api/transfers', { from_account_id: u.accounts[0].id, to_account_id: livret, amount: 100, date: `${month}-02` });
    const [line] = (await u.get(`/api/transactions?month=${month}`)).body;
    const del = await u.del(`/api/transactions/${line.id}`);
    await u.post('/api/undo', { token: del.body.undo });
    const balances = Object.fromEntries((await u.get('/api/accounts')).body.map((a) => [a.id, a.balance]));
    expect(balances[livret]).toBe(100);
    expect(balances[u.accounts[0].id]).toBe(-100);
  });

  it('une catégorie supprimée retrouve son budget, ses opérations et ses récurrences', async () => {
    const u = await newUser();
    const cat = u.cat('Loisirs');
    await u.post('/api/budgets', { category_id: cat, monthly_limit: 80 });
    await u.post('/api/transactions', { account_id: u.accounts[0].id, category_id: cat, amount: 15, type: 'expense', label: 'Cinéma', date: `${month}-10` });
    await u.post('/api/recurring', { account_id: u.accounts[0].id, category_id: cat, amount: 9, type: 'expense', label: 'Club', start_date: '2099-01-01' });

    const del = await u.del(`/api/categories/${cat}`);
    expect((await u.get(`/api/transactions?month=${month}`)).body[0].category_id).toBeNull();
    expect((await u.get('/api/budgets')).body).toHaveLength(0);

    await u.post('/api/undo', { token: del.body.undo });
    expect((await u.get('/api/categories')).body.some((c) => c.id === cat)).toBe(true);
    expect((await u.get(`/api/transactions?month=${month}`)).body[0].category_id).toBe(cat);
    expect((await u.get('/api/budgets')).body[0]).toMatchObject({ category_id: cat, monthly_limit: 80 });
    expect((await u.get('/api/recurring')).body[0].category_id).toBe(cat);
  });

  it('un budget supprimé revient ; le jeton d’un autre utilisateur est refusé', async () => {
    const u = await newUser();
    const other = await newUser('Autre');
    await u.post('/api/budgets', { category_id: u.cat('Courses'), monthly_limit: 300 });
    const [b] = (await u.get('/api/budgets')).body;
    const del = await u.del(`/api/budgets/${b.id}`);
    expect((await other.post('/api/undo', { token: del.body.undo })).status).toBe(410);
    expect((await other.get('/api/budgets')).body).toHaveLength(0);
    expect((await u.post('/api/undo', { token: del.body.undo })).status).toBe(200);
    expect((await u.get('/api/budgets')).body[0]).toMatchObject({ id: b.id, monthly_limit: 300 });
  });
});

describe('profil et premier lancement', () => {
  it('un compte neuf a le parcours d’accueil, qui disparaît une fois terminé', async () => {
    const u = await newUser();
    expect(u.user.onboarding).toBe(true);
    expect((await u.post('/api/me/onboarding', {})).body.onboarding).toBe(false);
    expect((await u.get('/api/me')).body.onboarding).toBe(false);
  });

  it('un compte qui a déjà des opérations n’a pas de parcours d’accueil', async () => {
    const u = await newUser();
    await u.post('/api/transactions', { account_id: u.accounts[0].id, amount: 5, type: 'expense', label: 'Café', date: `${month}-01` });
    expect((await u.get('/api/me')).body.onboarding).toBe(false);
  });

  it('modifier son prénom et son mot de passe', async () => {
    const u = await newUser();
    expect((await u.put('/api/me', { name: '  Yass ' })).body.name).toBe('Yass');
    expect((await u.put('/api/me', { name: '' })).body.error).toMatch(/prénom/);

    const bad = await u.put('/api/me/password', { current_password: 'faux', new_password: 'nouveau1' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('Mot de passe actuel incorrect');
    expect((await u.put('/api/me/password', { current_password: 'secret12', new_password: 'nouveau1' })).status).toBe(200);

    const { request, app } = await import('./helpers.js');
    expect((await request(app).post('/api/auth/login').send({ email: u.email, password: 'secret12' })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: u.email, password: 'nouveau1' })).status).toBe(200);
  });
});
