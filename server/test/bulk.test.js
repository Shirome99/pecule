import { describe, it, expect } from 'vitest';
import { newUser } from './helpers.js';

describe('import en masse', () => {
  it('insère toutes les lignes avec leur signe et leur catégorie', async () => {
    const u = await newUser();
    const acc = u.accounts[0].id;
    const res = await u.post('/api/transactions/bulk', {
      account_id: acc,
      rows: [
        { date: '2026-03-01', label: 'Salaire', amount: 2500, category_id: u.cat('Salaire') },
        { date: '2026-03-02', label: 'CB Carrefour', amount: -54.32, category_id: u.cat('Courses') },
        { date: '2026-03-03', label: 'Sans catégorie', amount: -0.1 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.inserted).toBe(3);
    const s = (await u.get('/api/stats?month=2026-03')).body;
    expect(s.income).toBe(2500);
    expect(s.expenses).toBe(54.42);
    expect((await u.get('/api/accounts')).body[0].balance).toBe(2445.58);
  });

  it("refuse tout le lot si une ligne est invalide, en indiquant laquelle", async () => {
    const u = await newUser();
    const res = await u.post('/api/transactions/bulk', {
      account_id: u.accounts[0].id,
      rows: [
        { date: '2026-03-01', label: 'OK', amount: -1 },
        { date: '2026-02-30', label: 'KO', amount: -1 },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Ligne 2 : Date invalide (attendu AAAA-MM-JJ)');
    expect((await u.get('/api/transactions')).body).toHaveLength(0);

    const zero = await u.post('/api/transactions/bulk', { account_id: u.accounts[0].id, rows: [{ date: '2026-03-01', label: 'x', amount: 0 }] });
    expect(zero.body.error).toMatch(/Ligne 1 : Montant nul/);
    const empty = await u.post('/api/transactions/bulk', { account_id: u.accounts[0].id, rows: [] });
    expect(empty.body.error).toMatch(/Aucune ligne/);
  });

  it('limite à 2000 lignes', async () => {
    const u = await newUser();
    const rows = Array.from({ length: 2001 }, (_, i) => ({ date: '2026-03-01', label: `L${i}`, amount: -1 }));
    const res = await u.post('/api/transactions/bulk', { account_id: u.accounts[0].id, rows });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/2000 lignes maximum/);
    const ok = await u.post('/api/transactions/bulk', { account_id: u.accounts[0].id, rows: rows.slice(0, 2000) });
    expect(ok.body.inserted).toBe(2000);
  });

  it("refuse le compte ou les catégories d'un autre utilisateur", async () => {
    const alice = await newUser();
    const bob = await newUser();
    const row = { date: '2026-03-01', label: 'x', amount: -1 };
    expect((await bob.post('/api/transactions/bulk', { account_id: alice.accounts[0].id, rows: [row] })).status).toBe(400);
    const cat = await bob.post('/api/transactions/bulk', { account_id: bob.accounts[0].id, rows: [{ ...row, category_id: alice.cat('Courses') }] });
    expect(cat.status).toBe(400);
    expect(cat.body.error).toBe('Catégorie invalide');
    expect((await alice.get('/api/transactions')).body).toHaveLength(0);
    expect((await bob.get('/api/transactions')).body).toHaveLength(0);
  });

  it('filtre les opérations par période (détection des doublons)', async () => {
    const u = await newUser();
    await u.post('/api/transactions/bulk', {
      account_id: u.accounts[0].id,
      rows: ['2026-01-31', '2026-02-01', '2026-02-28', '2026-03-01'].map((date) => ({ date, label: date, amount: -1 })),
    });
    const list = (await u.get('/api/transactions?from=2026-02-01&to=2026-02-28')).body;
    expect(list.map((t) => t.date).sort()).toEqual(['2026-02-01', '2026-02-28']);
  });

  it("marque les virements dans l'export", async () => {
    const u = await newUser();
    const { body: { id: livret } } = await u.post('/api/accounts', { name: 'Livret', type: 'epargne' });
    await u.post('/api/transfers', { from_account_id: u.accounts[0].id, to_account_id: livret, amount: 10, date: '2026-03-01' });
    const lines = (await u.get('/api/export.csv')).text.split('\n').slice(1);
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.includes(';"Virement";'))).toBe(true);
  });
});
