import { describe, it, expect } from 'vitest';
import { newUser } from './helpers.js';
import { matchRule, commonPrefix, suggestRule } from '../src/rules.js';
import { normalizeTag, summarizeTag } from '../src/tags.js';

const month = '2026-04';
const d = (day) => `${month}-${String(day).padStart(2, '0')}`;

describe('rules.js (pur)', () => {
  const rules = [
    { id: 1, pattern: 'CARREFOUR', category_id: 10, priority: 0, category_kind: 'expense' },
    { id: 2, pattern: 'CARREFOUR CITY', category_id: 11, priority: 0, category_kind: 'expense' },
    { id: 3, pattern: 'CITY', category_id: 12, priority: 5, category_kind: 'expense' },
    { id: 4, pattern: 'REMBOURSEMENT', category_id: 20, priority: 0, category_kind: 'income' },
  ];

  it('la priorité la plus haute gagne, puis le motif le plus long', () => {
    expect(matchRule('CB CARREFOUR CITY 12/04', rules).category_id).toBe(12); // priorité 5
    expect(matchRule('CB CARREFOUR CITY 12/04', rules.filter((r) => r.id !== 3)).category_id).toBe(11); // plus précis
    expect(matchRule('CB CARREFOUR MARKET', rules).category_id).toBe(10);
    expect(matchRule('Boulangerie', rules)).toBeNull();
  });

  it('une règle ne s’applique qu’à des opérations du même sens que sa catégorie', () => {
    expect(matchRule('REMBOURSEMENT SECU', rules, 'expense')).toBeNull();
    expect(matchRule('REMBOURSEMENT SECU', rules, 'income').category_id).toBe(20);
  });

  it('suggestion : début commun mot par mot, rien si une règle couvre déjà le libellé', () => {
    expect(commonPrefix('BASIC FIT', 'BASIC FIT PARIS')).toBe('BASIC FIT');
    expect(commonPrefix('LE', 'LE')).toBe(''); // trop court
    const others = [{ label: 'PRLV BASIC FIT 10/03', category_id: 5 }, { label: 'Cinéma', category_id: 5 }];
    expect(suggestRule('CB BASIC FIT 12/04', 5, others, [])).toEqual({ pattern: 'BASIC FIT', category_id: 5 });
    expect(suggestRule('CB BASIC FIT 12/04', 6, others, [])).toBeNull(); // autre catégorie
    expect(suggestRule('CB BASIC FIT 12/04', 5, others, [{ pattern: 'BASIC' }])).toBeNull();
  });
});

describe('tags.js (pur)', () => {
  it('normalise les tags', () => {
    expect(normalizeTag('#Vacances Maroc')).toBe('vacances-maroc');
    expect(normalizeTag('  ##été!  ')).toBe('été');
    expect(normalizeTag('#')).toBe('');
  });

  it('bilan : total des dépenses, revenus, période et répartition', () => {
    const s = summarizeTag([
      { date: '2026-08-02', amount: -120000, category_id: 1, category_name: 'Logement' },
      { date: '2026-08-16', amount: -40000, category_id: 2, category_name: 'Restaurants' },
      { date: '2026-08-10', amount: -24000, category_id: 1, category_name: 'Logement' },
      { date: '2026-08-12', amount: 5000, category_id: 3, category_name: 'Autres revenus' },
    ]);
    expect(s).toMatchObject({ count: 4, total: 184000, income: 5000, from: '2026-08-02', to: '2026-08-16' });
    expect(s.byCategory.map((c) => [c.name, c.total])).toEqual([['Logement', 144000], ['Restaurants', 40000]]);
  });
});

describe('règles (API)', () => {
  it('une opération sans catégorie est classée par les règles, une catégorie choisie n’est jamais écrasée', async () => {
    const u = await newUser();
    const acc = u.accounts[0].id;
    expect((await u.post('/api/rules', { pattern: 'cb Basic-Fit 12/09', category_id: u.cat('Loisirs') })).body.pattern).toBe('BASIC FIT');

    const auto = await u.post('/api/transactions', { account_id: acc, amount: 29.99, type: 'expense', label: 'CB BASIC FIT 12/04', date: d(12) });
    expect(auto.body.category_id).toBe(u.cat('Loisirs'));

    const manual = await u.post('/api/transactions', { account_id: acc, category_id: u.cat('Santé'), amount: 29.99, type: 'expense', label: 'BASIC FIT coaching', date: d(13) });
    expect(manual.body.category_id).toBe(u.cat('Santé'));

    // « Appliquer » ne touche que les opérations sans catégorie
    await u.put(`/api/transactions/${auto.body.id}`, { account_id: acc, category_id: null, amount: 29.99, type: 'expense', label: 'CB BASIC FIT 12/04', date: d(12) });
    expect((await u.post('/api/rules/apply', {})).body.classified).toBe(1);
    const txs = Object.fromEntries((await u.get(`/api/transactions?month=${month}`)).body.map((t) => [t.id, t.category_id]));
    expect(txs[auto.body.id]).toBe(u.cat('Loisirs'));
    expect(txs[manual.body.id]).toBe(u.cat('Santé'));
  });

  it('priorité entre deux règles qui reconnaissent le même libellé', async () => {
    const u = await newUser();
    await u.post('/api/rules', { pattern: 'AMAZON', category_id: u.cat('Shopping'), priority: 0 });
    const { body: { id } } = await u.post('/api/rules', { pattern: 'PRIME', category_id: u.cat('Abonnements'), priority: 0 });
    const label = 'AMAZON PRIME FR';
    const create = () => u.post('/api/transactions', { account_id: u.accounts[0].id, amount: 6.99, type: 'expense', label, date: d(1) });
    // même priorité : le motif le plus long gagne (AMAZON, 6 lettres > PRIME, 5 lettres)
    expect((await create()).body.category_id).toBe(u.cat('Shopping'));
    await u.put(`/api/rules/${id}`, { pattern: 'PRIME', category_id: u.cat('Abonnements'), priority: 10 });
    expect((await create()).body.category_id).toBe(u.cat('Abonnements'));
  });

  it('les règles s’appliquent à l’import CSV et aux récurrences', async () => {
    const u = await newUser();
    await u.post('/api/rules', { pattern: 'SPOTIFY', category_id: u.cat('Abonnements') });
    await u.post('/api/transactions/bulk', { account_id: u.accounts[0].id, rows: [
      { date: d(7), label: 'PRLV SEPA SPOTIFY P1', amount: -12.99 },
      { date: d(8), label: 'PRLV SEPA SPOTIFY P2', amount: -12.99, category_id: u.cat('Loisirs') },
    ] });
    const cats = (await u.get(`/api/transactions?month=${month}`)).body.map((t) => t.category_id).sort();
    expect(cats).toEqual([u.cat('Abonnements'), u.cat('Loisirs')].sort());

    await u.post('/api/recurring', { account_id: u.accounts[0].id, amount: 12.99, type: 'expense', label: 'Spotify', start_date: '2099-01-07' });
    expect((await u.get('/api/recurring')).body[0].category_id).toBe(u.cat('Abonnements'));
  });

  it('propose une règle quand deux opérations semblables reçoivent la même catégorie', async () => {
    const u = await newUser();
    const acc = u.accounts[0].id;
    const first = await u.post('/api/transactions', { account_id: acc, category_id: u.cat('Loisirs'), amount: 29.99, type: 'expense', label: 'CB BASIC FIT 12/03', date: d(2) });
    expect(first.body.suggestion).toBeNull();
    const second = await u.post('/api/transactions', { account_id: acc, amount: 29.99, type: 'expense', label: 'CB BASIC FIT 12/04', date: d(3) });
    expect(second.body.suggestion).toBeNull(); // pas de catégorie choisie
    const edit = await u.put(`/api/transactions/${second.body.id}`, { account_id: acc, category_id: u.cat('Loisirs'), amount: 29.99, type: 'expense', label: 'CB BASIC FIT 12/04', date: d(3) });
    expect(edit.body.suggestion).toEqual({ pattern: 'BASIC FIT', category_id: u.cat('Loisirs'), category_name: 'Loisirs' });
  });

  it('validation et isolation', async () => {
    const u = await newUser();
    const other = await newUser('Autre');
    expect((await u.post('/api/rules', { pattern: '12/09 4521', category_id: u.cat('Loisirs') })).body.error).toMatch(/au moins un mot/);
    expect((await u.post('/api/rules', { pattern: 'X', category_id: other.cat('Loisirs') })).body.error).toBe('Catégorie invalide');
    const { body: { id } } = await u.post('/api/rules', { pattern: 'NETFLIX', category_id: u.cat('Abonnements') });
    expect((await other.del(`/api/rules/${id}`)).status).toBe(404);
    expect((await other.get('/api/rules')).body).toHaveLength(0);
  });
});

describe('tags (API)', () => {
  it('total par tag, période couverte et répartition ; filtre de la liste', async () => {
    const u = await newUser();
    const acc = u.accounts[0].id;
    const add = (amount, type, label, day, category, tags) =>
      u.post('/api/transactions', { account_id: acc, amount, type, label, date: `2026-08-${day}`, category_id: u.cat(category), tags });
    await add(1200, 'expense', 'Riad Marrakech', '02', 'Logement', ['#Vacances Maroc']);
    await add(400, 'expense', 'Restaurants', '16', 'Restaurants', ['vacances-maroc', 'resto']);
    await add(240, 'expense', 'Hammam', '10', 'Loisirs', ['#vacances-maroc']);
    await add(50, 'expense', 'Courses', '20', 'Courses', ['resto']);

    const sum = (await u.get('/api/tags/vacances-maroc')).body;
    expect(sum).toMatchObject({ name: 'vacances-maroc', count: 3, total: 1840, from: '2026-08-02', to: '2026-08-16' });
    expect(sum.byCategory.map((c) => c.name)).toEqual(['Logement', 'Restaurants', 'Loisirs']);

    const list = (await u.get('/api/transactions?month=2026-08&tag=vacances-maroc')).body;
    expect(list).toHaveLength(3);
    expect(list.find((t) => t.label === 'Restaurants').tags).toEqual(['resto', 'vacances-maroc']);
    expect((await u.get('/api/tags')).body.map((t) => t.name).sort()).toEqual(['resto', 'vacances-maroc']);
  });

  it('modifier les tags, et un utilisateur ne voit pas les tags d’un autre', async () => {
    const u = await newUser();
    const other = await newUser('Autre');
    const { body: { id } } = await u.post('/api/transactions', { account_id: u.accounts[0].id, amount: 10, type: 'expense', label: 'Taxi', date: d(4), tags: ['pro'] });
    await u.put(`/api/transactions/${id}`, { account_id: u.accounts[0].id, amount: 10, type: 'expense', label: 'Taxi', date: d(4), tags: ['note-de-frais'] });
    expect((await u.get(`/api/transactions?month=${month}`)).body[0].tags).toEqual(['note-de-frais']);
    expect((await other.get('/api/tags/note-de-frais')).status).toBe(404);
    expect((await other.get(`/api/transactions?month=${month}&tag=note-de-frais`)).body).toHaveLength(0);
    expect((await u.post('/api/transactions', { account_id: u.accounts[0].id, amount: 1, type: 'expense', label: 'x', date: d(4), tags: Array(11).fill('a') })).body.error)
      .toBe('10 tags maximum par opération');
  });

  it('une opération supprimée puis rétablie retrouve ses tags', async () => {
    const u = await newUser();
    const { body: { id } } = await u.post('/api/transactions', { account_id: u.accounts[0].id, amount: 10, type: 'expense', label: 'Taxi', date: d(4), tags: ['pro'] });
    const del = await u.del(`/api/transactions/${id}`);
    await u.post('/api/undo', { token: del.body.undo });
    expect((await u.get(`/api/transactions?month=${month}`)).body[0].tags).toEqual(['pro']);
  });
});
