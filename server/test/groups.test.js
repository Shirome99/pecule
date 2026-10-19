import { describe, it, expect } from 'vitest';
import { newUser } from './helpers.js';
import { prorata, splitExpense, balances, settleUp } from '../src/settle.js';

const sum = (o) => Object.values(o).reduce((s, v) => s + v, 0);

describe('settle.js (pur)', () => {
  it('parts égales : les centimes restants sont répartis sans perte', () => {
    const { shares } = splitExpense(1000, 'equal', [1, 2, 3]);
    expect(shares).toEqual({ 1: 334, 2: 333, 3: 333 });
    expect(sum(shares)).toBe(1000);
    expect(prorata(100, [1, 1, 1, 1, 1, 1, 1])).toEqual([15, 15, 14, 14, 14, 14, 14]);
  });

  it('répartition inégale : pourcentages et montants', () => {
    const pct = splitExpense(9999, 'percent', { 1: 50, 2: 30, 3: 20 }).shares;
    expect(sum(pct)).toBe(9999);
    // 4999,5 / 2999,7 / 1999,8 : les 2 centimes restants vont aux plus forts restes (0,8 et 0,7)
    expect(pct).toEqual({ 1: 4999, 2: 3000, 3: 2000 });
    expect(splitExpense(9999, 'percent', { 1: 50, 2: 30 }).error).toMatch(/80 % au lieu de 100 %/);
    expect(splitExpense(5000, 'amounts', { 1: 3000, 2: 2000 }).shares).toEqual({ 1: 3000, 2: 2000 });
    expect(splitExpense(5000, 'amounts', { 1: 3000, 2: 1000 }).error).toBe('Les parts font 40,00 € au lieu de 50,00 €');
    expect(splitExpense(5000, 'equal', []).error).toMatch(/au moins une personne/);
  });

  it('la somme des soldes fait 0 au centime près, remboursements compris', () => {
    const expenses = [
      { paid_by: 1, amount: 10000, shares: splitExpense(10000, 'equal', [1, 2, 3]).shares },
      { paid_by: 2, amount: 4577, shares: splitExpense(4577, 'percent', { 1: 33.3, 2: 33.3, 3: 33.4 }).shares },
      { paid_by: 3, amount: 1999, shares: splitExpense(1999, 'equal', [2, 3]).shares },
    ];
    const b = balances([1, 2, 3, 4], expenses, [{ from: 3, to: 1, amount: 1500 }]);
    expect(sum(b)).toBe(0);
    expect(b[4]).toBe(0);
  });

  it('au plus (membres − 1) remboursements, qui soldent tout le monde', () => {
    for (let trial = 0; trial < 200; trial++) {
      const n = 2 + (trial % 7);
      const ids = Array.from({ length: n }, (_, i) => i + 1);
      const expenses = Array.from({ length: 1 + (trial % 5) }, (_, k) => {
        const amount = 100 + ((trial * 7919 + k * 104729) % 50000);
        return { paid_by: ids[(trial + k) % n], amount, shares: splitExpense(amount, 'equal', ids.filter((_, i) => (i + k) % 3 !== 0 || n < 3)).shares };
      });
      const b = balances(ids, expenses);
      const transfers = settleUp(b);
      expect(transfers.length).toBeLessThanOrEqual(n - 1);
      expect(sum(balances(ids, expenses, transfers))).toBe(0);
      expect(Object.values(balances(ids, expenses, transfers)).every((v) => v === 0)).toBe(true);
    }
  });

  it('cas simple : « Sarah doit 42 € à Yass »', () => {
    const shares = splitExpense(8400, 'equal', [1, 2]).shares;
    expect(settleUp(balances([1, 2], [{ paid_by: 1, amount: 8400, shares }]))).toEqual([{ from: 2, to: 1, amount: 4200 }]);
  });
});

describe('groupes (API)', () => {
  it('payé par moi : une opération pour ma part seulement, le reste est une créance', async () => {
    const u = await newUser('Yass');
    const { body: g } = await u.post('/api/groups', { name: 'Coloc', members: ['Sarah', 'Léo'] });
    const [me, sarah, leo] = g.members;
    expect(me).toMatchObject({ name: 'Yass', is_me: true });

    const r = await u.post(`/api/groups/${g.id}/expenses`, {
      label: 'Courses', date: '2026-05-04', amount: 90, paid_by: me.id, split_mode: 'equal',
      account_id: u.accounts[0].id, category_id: u.cat('Courses'),
    });
    expect(r.status).toBe(201);
    const [tx] = (await u.get('/api/transactions?month=2026-05')).body;
    expect(tx).toMatchObject({ amount: -30, category_id: u.cat('Courses'), label: 'Courses (Coloc, ma part)' });
    expect((await u.get('/api/stats?month=2026-05')).body.expenses).toBe(30);

    // payé par Sarah : pas d'opération pour moi
    const g2 = (await u.post(`/api/groups/${g.id}/expenses`, {
      label: 'Internet', date: '2026-05-10', amount: 30, paid_by: sarah.id, split_mode: 'amounts', values: { [me.id]: 10, [sarah.id]: 10, [leo.id]: 10 },
    })).body;
    expect((await u.get('/api/transactions?month=2026-05')).body).toHaveLength(1);
    const bal = Object.fromEntries(g2.members.map((m) => [m.name, m.balance]));
    expect(bal).toEqual({ Yass: 50, Sarah: -10, Léo: -40 });
    expect(g2.suggestions).toEqual([{ from: leo.id, to: me.id, amount: 40 }, { from: sarah.id, to: me.id, amount: 10 }]);

    // « Marquer comme remboursé »
    const g3 = (await u.post(`/api/groups/${g.id}/settlements`, { from: leo.id, to: me.id, amount: 40 })).body;
    expect(g3.suggestions).toEqual([{ from: sarah.id, to: me.id, amount: 10 }]);
    expect((await u.get('/api/groups')).body[0]).toMatchObject({ name: 'Coloc', my_balance: 10, total: 120 });

    // supprimer la dépense supprime l'opération de ma part
    const exp = g3.expenses.find((e) => e.label === 'Courses');
    await u.del(`/api/groups/${g.id}/expenses/${exp.id}`);
    expect((await u.get('/api/transactions?month=2026-05')).body).toHaveLength(0);
  });

  it('validations', async () => {
    const u = await newUser();
    expect((await u.post('/api/groups', { name: 'Solo', members: [] })).body.error).toBe('Ajoute au moins une autre personne');
    const { body: g } = await u.post('/api/groups', { name: 'Voyage', members: ['Ana'] });
    const [me, ana] = g.members;
    const base = { label: 'Hôtel', date: '2026-05-01', amount: 100, paid_by: me.id };
    expect((await u.post(`/api/groups/${g.id}/expenses`, base)).body.error).toBe('Choisis le compte qui a payé');
    expect((await u.post(`/api/groups/${g.id}/expenses`, { ...base, paid_by: ana.id, split_mode: 'percent', values: { [me.id]: 60 } })).body.error)
      .toMatch(/60 % au lieu de 100 %/);
    expect((await u.post(`/api/groups/${g.id}/expenses`, { ...base, paid_by: 999999 })).body.error).toMatch(/qui a payé/);
    expect((await u.del(`/api/groups/${g.id}/members/${me.id}`)).body.error).toMatch(/te retirer/);
  });

  it('isolation : un autre utilisateur ne voit ni ne modifie le groupe', async () => {
    const u = await newUser();
    const other = await newUser('Autre');
    const { body: g } = await u.post('/api/groups', { name: 'Couple', members: ['Sam'] });
    expect((await other.get(`/api/groups/${g.id}`)).status).toBe(404);
    expect((await other.get('/api/groups')).body).toHaveLength(0);
    expect((await other.post(`/api/groups/${g.id}/expenses`, { label: 'x', date: '2026-05-01', amount: 10, paid_by: g.members[1].id })).status).toBe(404);
    expect((await other.post(`/api/groups/${g.id}/settlements`, { from: g.members[1].id, to: g.members[0].id, amount: 1 })).status).toBe(404);
    expect((await other.del(`/api/groups/${g.id}`)).status).toBe(404);
    // mon compte ne peut pas payer pour le groupe d'un autre, ni l'inverse
    const { body: mine } = await other.post('/api/groups', { name: 'X', members: ['Y'] });
    expect((await other.post(`/api/groups/${mine.id}/expenses`, {
      label: 'x', date: '2026-05-01', amount: 10, paid_by: mine.members[0].id, account_id: u.accounts[0].id,
    })).body.error).toBe('Compte invalide');
  });
});
