// Le découpage en routeurs ne doit perdre aucune route.
import { describe, it, expect } from 'vitest';
import { newUser } from './helpers.js';
import { lastMonths } from '../src/dates.js';

describe('structure', () => {
  it('toutes les routes GET répondent (aucune ne tombe sur le 404 par défaut)', async () => {
    const u = await newUser();
    const id = u.accounts[0].id;
    const urls = ['/api/health', '/api/me', '/api/accounts', `/api/accounts/${id}/valuations`, `/api/accounts/${id}/loan`,
      '/api/loans/999/schedule', '/api/networth', '/api/categories', '/api/transactions', '/api/recurring', '/api/forecast',
      '/api/subscriptions', '/api/goals', '/api/budgets', '/api/stats', '/api/export.csv'];
    for (const url of urls) {
      const res = await u.get(url);
      // un 404 métier renvoie du JSON { error } ; le 404 d'Express (route inconnue) renvoie du HTML
      expect(res.headers['content-type'], url).not.toMatch(/html/);
    }
  });

  it('lastMonths renvoie les n mois glissants, changement d’année compris', () => {
    expect(lastMonths('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});
