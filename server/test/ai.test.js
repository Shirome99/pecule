// Fonctions IA : le SDK Anthropic est remplacé par un faux client, aucune clé réelle n'est utilisée.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { newUser } from './helpers.js';
import { createRequire } from 'node:module';

// même instance du module que celle chargée par l'application (require CommonJS)
const ai = createRequire(import.meta.url)('../src/ai.js');

const IMAGE = 'A'.repeat(200); // base64 factice
const text = (t) => ({ type: 'text', text: t });
const reply = (content, stop_reason = 'end_turn') => ({ content, stop_reason });
let create;

function mockSdk() {
  create = vi.fn();
  ai.setClient({ beta: { messages: { create } } });
}

describe('sans ANTHROPIC_API_KEY', () => {
  it('les fonctions IA sont absentes et rien ne plante', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const u = await newUser();
    expect((await u.get('/api/ai/status')).body).toEqual({ enabled: false });
    expect((await u.post('/api/ai/consent', { accepted: true })).status).toBe(404);
    expect((await u.post('/api/ai/receipt', { image: IMAGE, media_type: 'image/jpeg' })).status).toBe(404);
    const ask = await u.post('/api/ai/ask', { question: 'Combien en resto ?' });
    expect(ask.status).toBe(404);
    expect(ask.body.error).toBe('Fonctions IA désactivées sur ce serveur');
  });
});

describe('avec une clé (SDK simulé)', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    mockSdk();
  });
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_MODEL;
  });

  const consented = async (name) => {
    const u = await newUser(name);
    await u.post('/api/ai/consent', { accepted: true });
    return u;
  };

  it('le consentement est demandé avant la première utilisation, et mémorisé', async () => {
    const u = await newUser();
    expect((await u.get('/api/ai/status')).body).toMatchObject({ enabled: true, consented: false, remaining: 20 });
    expect((await u.post('/api/ai/receipt', { image: IMAGE, media_type: 'image/jpeg' })).status).toBe(403);
    await u.post('/api/ai/consent', { accepted: true });
    expect((await u.get('/api/ai/status')).body.consented).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });

  it('ticket : JSON valide → formulaire prérempli ; catégorie d’un autre utilisateur écartée', async () => {
    const u = await consented();
    const other = await newUser('Autre');
    create.mockResolvedValueOnce(reply([text(JSON.stringify({ amount: 23.456, date: '2026-10-12', merchant: ' Monoprix ', category_id: u.cat('Courses') }))]));
    const r = await u.post('/api/ai/receipt', { image: IMAGE, media_type: 'image/jpeg' });
    expect(r.body).toEqual({ amount: 23.46, date: '2026-10-12', merchant: 'Monoprix', category_id: u.cat('Courses') });
    const params = create.mock.calls[0][0];
    expect(params.model).toBe('claude-sonnet-5-5');
    expect(params.output_config.format.type).toBe('json_schema');
    expect(params.messages[0].content[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: IMAGE } });
    // rien n'est enregistré automatiquement
    expect((await u.get('/api/transactions')).body).toHaveLength(0);

    create.mockResolvedValueOnce(reply([text(JSON.stringify({ amount: 0, date: '2026-02-30', merchant: '', category_id: other.cat('Courses') }))]));
    expect((await u.post('/api/ai/receipt', { image: IMAGE, media_type: 'image/png' })).body)
      .toEqual({ amount: null, date: null, merchant: null, category_id: null });
  });

  it('ticket : une réponse mal formée est refusée par la validation Zod', async () => {
    const u = await consented();
    for (const bad of ['pas du JSON', JSON.stringify({ amount: '12', date: '2026-10-12', merchant: 'x', category_id: 1 }), JSON.stringify({ amount: 12 }),
      JSON.stringify({ amount: 1, date: 'x', merchant: 'x', category_id: 1, sql: 'DROP TABLE' })]) {
      create.mockResolvedValueOnce(reply([text(bad)]));
      const r = await u.post('/api/ai/receipt', { image: IMAGE, media_type: 'image/jpeg' });
      expect(r.status).toBe(502);
      expect(r.body.error).toMatch(/n’a pas pu être lu/);
    }
    create.mockResolvedValueOnce(reply([], 'refusal'));
    expect((await u.post('/api/ai/receipt', { image: IMAGE, media_type: 'image/jpeg' })).status).toBe(422);
    expect((await u.post('/api/ai/receipt', { image: 'pas$une$image'.repeat(20), media_type: 'image/jpeg' })).body.error).toMatch(/base64/);
  });

  it('assistant : les outils ne lisent que les données de l’utilisateur de la session', async () => {
    const u = await consented('Yass');
    const other = await consented('Autre');
    const add = (c, label) => c.post('/api/transactions', { account_id: c.accounts[0].id, category_id: c.cat('Restaurants'), amount: 30, type: 'expense', label, date: '2026-03-10' });
    await add(u, 'Pizzeria de Yass');
    await add(other, 'Resto secret de Autre');

    // le modèle essaie de passer un user_id : refusé ; puis une recherche normale
    create
      .mockResolvedValueOnce(reply([
        { type: 'tool_use', id: 't1', name: 'search_transactions', input: { query: 'Resto', user_id: other.user.id } },
        { type: 'tool_use', id: 't2', name: 'search_transactions', input: { from: '2026-01-01' } },
        { type: 'tool_use', id: 't3', name: 'get_stats', input: { month: '2026-03' } },
      ], 'tool_use'))
      .mockResolvedValueOnce(reply([text('Tu as dépensé 30 € en Restaurants en mars 2026 (1 opération).')]));
    const r = await u.post('/api/ai/ask', { question: 'Combien j’ai dépensé en resto depuis janvier ?' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ answer: 'Tu as dépensé 30 € en Restaurants en mars 2026 (1 opération).', tools: ['search_transactions', 'get_stats'], remaining: 19 });

    const second = create.mock.calls[1][0];
    const results = second.messages[second.messages.length - 1].content;
    expect(results).toHaveLength(3); // tous les résultats dans un seul message
    expect(results[0]).toMatchObject({ tool_use_id: 't1', is_error: true });
    const found = JSON.parse(results[1].content);
    expect(found).toMatchObject({ count: 1, total: -30 });
    expect(found.transactions[0].label).toBe('Pizzeria de Yass');
    expect(JSON.stringify(results)).not.toContain('Resto secret');
    expect(JSON.parse(results[2].content).expenses).toBe(30);
    // outils en lecture seule uniquement
    expect(second.tools.map((t) => t.name).sort()).toEqual(['get_budgets', 'get_forecast', 'get_networth', 'get_stats', 'get_subscriptions', 'search_transactions']);
    expect(second.system).toContain('Yass');
  });

  it('assistant : 20 questions par jour et par utilisateur', async () => {
    const u = await consented();
    const other = await consented('Autre');
    create.mockResolvedValue(reply([text('Réponse.')]));
    for (let i = 0; i < 20; i++) expect((await u.post('/api/ai/ask', { question: `Question ${i}` })).status).toBe(200);
    const r = await u.post('/api/ai/ask', { question: 'Encore une ?' });
    expect(r.status).toBe(429);
    expect(r.body.error).toMatch(/20 questions du jour/);
    expect((await other.post('/api/ai/ask', { question: 'Et moi ?' })).status).toBe(200);
  });

  it('le modèle se configure avec ANTHROPIC_MODEL', async () => {
    process.env.ANTHROPIC_MODEL = 'claude-haiku-5-5';
    const u = await consented();
    create.mockResolvedValueOnce(reply([text('OK.')]));
    await u.post('/api/ai/ask', { question: 'Un test ?' });
    expect(create.mock.calls[0][0]).toMatchObject({ model: 'claude-haiku-5-5' });
    expect(create.mock.calls[0][0].fallbacks).toBeUndefined();
  });
});
