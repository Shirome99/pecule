import { describe, it, expect } from 'vitest';
import { newUser, app, request } from './helpers.js';
import recurring from '../src/recurring.js';

const { occurrences, localToday } = recurring;

const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** date locale décalée de `months` mois par rapport à aujourd'hui */
const monthsAgo = (months, day) => {
  const t = new Date();
  return fmt(new Date(t.getFullYear(), t.getMonth() - months, day ?? t.getDate()));
};

describe('calcul des occurrences', () => {
  const rule = (o) => ({ frequency: 'monthly', day: 1, start_date: '2026-01-01', end_date: null, ...o });

  it('mensuel : ramène le jour au dernier jour du mois', () => {
    expect(occurrences(rule({ day: 31, start_date: '2026-01-15' }), '2026-01-01', '2026-04-30'))
      .toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('mensuel : respecte la date de début et la date de fin', () => {
    expect(occurrences(rule({ day: 10, start_date: '2026-01-11', end_date: '2026-04-09' }), '2025-01-01', '2026-12-31'))
      .toEqual(['2026-02-10', '2026-03-10']);
  });

  it('hebdomadaire : chaque lundi', () => {
    // 2026-03-04 est un mercredi
    expect(occurrences(rule({ frequency: 'weekly', day: 1, start_date: '2026-03-04' }), '2026-03-01', '2026-03-31'))
      .toEqual(['2026-03-09', '2026-03-16', '2026-03-23', '2026-03-30']);
  });

  it('annuel : même mois chaque année', () => {
    expect(occurrences(rule({ frequency: 'yearly', day: 15, start_date: '2024-06-15' }), '2025-01-01', '2027-12-31'))
      .toEqual(['2025-06-15', '2026-06-15', '2027-06-15']);
    expect(occurrences(rule({ frequency: 'yearly', day: 29, start_date: '2024-02-29' }), '2024-01-01', '2025-12-31'))
      .toEqual(['2024-02-29', '2025-02-28']);
  });
});

describe('opérations récurrentes', () => {
  async function createMonthly(u, start, extra = {}) {
    return u.post('/api/recurring', {
      account_id: u.accounts[0].id, category_id: u.cat('Logement'), amount: 800, type: 'expense',
      label: 'Loyer', frequency: 'monthly', start_date: start, ...extra,
    });
  }
  const generated = async (u) => (await u.get('/api/transactions?limit=2000')).body.filter((t) => t.recurring_id);

  it('début 3 mois en arrière : 3 ou 4 opérations, même après plusieurs rechargements', async () => {
    const u = await newUser();
    const res = await createMonthly(u, monthsAgo(3));
    expect(res.status).toBe(201);
    const first = await generated(u);
    expect([3, 4]).toContain(first.length);
    expect(first.length).toBe(4); // le jour de début est aujourd'hui moins 3 mois : 4 échéances dont aujourd'hui
    expect(first.every((t) => t.amount === -800 && t.category_name === 'Logement')).toBe(true);

    // rechargements : stats (déclencheur) + reconnexion (déclencheur)
    for (let i = 0; i < 3; i++) await u.get('/api/stats');
    await request(app).post('/api/auth/login').send({ email: u.email, password: 'secret12' });
    expect(await generated(u)).toHaveLength(first.length);
  });

  it('jour du mois déjà passé ou pas encore : 3 ou 4 occurrences', async () => {
    const u = await newUser();
    const t = new Date();
    const day = t.getDate() < 28 ? 28 : 1; // un jour « à venir » si possible
    await createMonthly(u, monthsAgo(3, 1), { day });
    const n = (await generated(u)).length;
    expect([3, 4]).toContain(n);
  });

  it("ne recrée pas une occurrence supprimée par l'utilisateur", async () => {
    const u = await newUser();
    await createMonthly(u, monthsAgo(2));
    const [one] = await generated(u);
    await u.del(`/api/transactions/${one.id}`);
    await u.get('/api/stats');
    expect(await generated(u)).toHaveLength(2);
  });

  it('liste, met en pause, reprend sans rattraper, et supprime', async () => {
    const u = await newUser();
    const { body: { id } } = await createMonthly(u, monthsAgo(1));
    let [r] = (await u.get('/api/recurring')).body;
    expect(r).toMatchObject({ id, label: 'Loyer', amount: -800, frequency: 'monthly', paused: false, account_name: 'Compte courant', last_generated: localToday() });
    expect(r.next_date > localToday()).toBe(true);

    expect((await u.put(`/api/recurring/${id}`, { paused: true })).status).toBe(200);
    [r] = (await u.get('/api/recurring')).body;
    expect(r.paused).toBe(true);
    expect(r.next_date).toBeNull();
    expect((await u.get('/api/stats')).body.upcoming).toBe(0);

    await u.put(`/api/recurring/${id}`, { paused: false });
    expect((await u.get('/api/recurring')).body[0].paused).toBe(false);
    expect(await generated(u)).toHaveLength(2);

    expect((await u.del(`/api/recurring/${id}`)).status).toBe(200);
    expect((await u.get('/api/recurring')).body).toHaveLength(0);
    // les opérations déjà passées restent
    expect((await u.get('/api/transactions')).body).toHaveLength(2);
  });

  it('additionne les occurrences à venir du mois dans les stats', async () => {
    const u = await newUser();
    const t = new Date();
    const lastDay = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    const month = localToday().slice(0, 7);
    if (t.getDate() === lastDay) return; // dernier jour du mois : plus rien « à venir »
    await createMonthly(u, `${month}-01`, { day: lastDay, amount: 50 });
    await u.post('/api/recurring', {
      account_id: u.accounts[0].id, amount: 20, type: 'income', label: 'Remboursement', start_date: `${month}-01`, day: lastDay,
    });
    const s = (await u.get(`/api/stats?month=${month}`)).body;
    expect(s.upcoming).toBe(-30);
    expect(s.upcoming_count).toBe(2);
    // pas d'« à venir » sur un mois passé
    expect((await u.get('/api/stats?month=2020-01')).body.upcoming).toBe(0);
  });

  it('valide les entrées', async () => {
    const u = await newUser();
    const bad = await createMonthly(u, '2026-13-45');
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/Date de début/);
    const end = await createMonthly(u, '2026-05-01', { end_date: '2026-04-01' });
    expect(end.body.error).toMatch(/date de fin/);
    const freq = await createMonthly(u, '2026-05-01', { frequency: 'daily' });
    expect(freq.body.error).toMatch(/Fréquence/);
  });

  it('isole les récurrences entre utilisateurs', async () => {
    const alice = await newUser();
    const bob = await newUser();
    const { body: { id } } = await createMonthly(alice, monthsAgo(1));
    expect((await bob.get('/api/recurring')).body).toHaveLength(0);
    expect((await bob.put(`/api/recurring/${id}`, { paused: true })).status).toBe(404);
    expect((await bob.del(`/api/recurring/${id}`)).status).toBe(404);
    const steal = await bob.post('/api/recurring', {
      account_id: alice.accounts[0].id, amount: 1, type: 'expense', label: 'x', start_date: monthsAgo(1),
    });
    expect(steal.status).toBe(400);
    await bob.get('/api/stats');
    expect((await bob.get('/api/transactions')).body).toHaveLength(0);
    expect((await alice.get('/api/recurring')).body[0].paused).toBe(false);
  });
});
