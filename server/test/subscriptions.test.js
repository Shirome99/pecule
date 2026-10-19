import { describe, it, expect } from 'vitest';
import { newUser } from './helpers.js';
import subs from '../src/subscriptions.js';
import dates from '../src/dates.js';
import recurring from '../src/recurring.js';

const { normalizeLabel, detectSubscriptions } = subs;
const NOW = '2026-10-19';
const t = (date, euros, label, extra = {}) =>
  ({ date, amount: -Math.round(euros * 100), label, category_id: 7, account_id: 1, transfer_id: null, recurring_id: null, ...extra });
const monthly = (day, label, amounts, lastMonth = 10) =>
  amounts.map((a, i) => t(`2026-${String(lastMonth - amounts.length + 1 + i).padStart(2, '0')}-${day}`, a, typeof label === 'function' ? label(i) : label));

describe('normalisation des libellés', () => {
  it('retire préfixes bancaires, références, dates, accents et espaces', () => {
    expect(normalizeLabel('PRLV SEPA SPOTIFY P1A2B3')).toBe('SPOTIFY');
    expect(normalizeLabel('CB BASIC FIT 12/09')).toBe('BASIC FIT');
    expect(normalizeLabel('CB  Basic-Fit   03/10 X1234')).toBe('BASIC FIT');
    expect(normalizeLabel('Prlv Sépa Électricité EDF 0042')).toBe('ELECTRICITE EDF');
    expect(normalizeLabel('CB 12/09 4521')).toBe('');
  });
});

describe('détection des abonnements', () => {
  const spotify = monthly('07', (i) => `PRLV SEPA SPOTIFY P${i}A2B3`, [10.99, 10.99, 10.99, 10.99, 12.99, 12.99]);
  const basicFit = monthly('12', (i) => `CB BASIC FIT 12/0${i + 5}`, [29.99, 29.99, 29.99, 29.99, 29.99, 29.99]);
  const assurance = [t('2025-08-15', 189, 'PRLV SEPA MMA IARD 884512'), t('2026-08-15', 189, 'PRLV SEPA MMA IARD 993120')];

  it('détecte un abonnement mensuel et sa hausse de prix', () => {
    const [s] = detectSubscriptions(spotify, { now: NOW });
    expect(s).toMatchObject({
      key: 'SPOTIFY', label: 'Spotify', frequency: 'monthly', amount: 1299, annual_cost: 15588, category_id: 7, account_id: 1,
      occurrences: 6, last_date: '2026-10-07', next_date: '2026-11-07',
      price_change: { old_amount: 1099, new_amount: 1299, date: '2026-09-07' },
    });
  });

  it('détecte un abonnement annuel avec 2 occurrences', () => {
    const [s] = detectSubscriptions(assurance, { now: NOW });
    expect(s).toMatchObject({ key: 'MMA IARD', frequency: 'yearly', amount: 18900, annual_cost: 18900, next_date: '2027-08-15', price_change: null });
  });

  it('ignore les faux positifs : courses fréquentes à montant variable, montant instable, abonnement arrêté', () => {
    const courses = [];
    for (let d = 0; d < 180; d += 6) {
      const date = new Date(Date.UTC(2026, 3, 20 + d)).toISOString().slice(0, 10); // tous les 6 jours depuis le 20 avril
      courses.push(t(date, 20 + ((d * 7) % 60), `CB CARREFOUR CITY ${d}`));
    }
    const resto = monthly('15', 'CB BRASSERIE DU COIN', [18, 64, 25, 90, 41, 33]);
    const stopped = monthly('03', 'PRLV SEPA DEEZER', [9.99, 9.99, 9.99, 9.99], 7); // dernier prélèvement en juillet
    expect(detectSubscriptions([...courses, ...resto, ...stopped], { now: NOW })).toEqual([]);
  });

  it("tolère un écart de 2 € mais pas au-delà de 15 % et 2 €", () => {
    expect(detectSubscriptions(monthly('05', 'NETFLIX', [13.49, 13.49, 15.49]), { now: NOW })).toHaveLength(1);
    expect(detectSubscriptions(monthly('05', 'NETFLIX', [13.49, 13.49, 19.99]), { now: NOW })).toHaveLength(0);
  });

  it('exclut virements, opérations déjà récurrentes, libellés ignorés ou suivis', () => {
    const all = [...spotify, ...basicFit, ...assurance];
    expect(detectSubscriptions(all, { now: NOW }).map((s) => s.key)).toEqual(['BASIC FIT', 'MMA IARD', 'SPOTIFY']); // tri par coût annuel
    expect(detectSubscriptions(all, { now: NOW, ignored: new Set(['SPOTIFY']), tracked: new Set(['MMA IARD']) }).map((s) => s.key))
      .toEqual(['BASIC FIT']);
    const viaRecurrence = basicFit.map((x) => ({ ...x, recurring_id: 3 }));
    const viaTransfer = spotify.map((x) => ({ ...x, transfer_id: 'abc' }));
    expect(detectSubscriptions([...viaRecurrence, ...viaTransfer], { now: NOW })).toEqual([]);
  });
});

describe('API abonnements', () => {
  async function withSpotify(u) {
    const today = recurring.localToday();
    const rows = [5, 4, 3, 2, 1, 0].map((n) => ({
      date: dates.addMonths(today, -n), label: `PRLV SEPA SPOTIFY P${n}X`, amount: n < 2 ? -12.99 : -10.99, category_id: u.cat('Abonnements'),
    }));
    await u.post('/api/transactions/bulk', { account_id: u.accounts[0].id, rows });
  }

  it('liste, ignore et suit comme récurrence', async () => {
    const u = await newUser();
    await withSpotify(u);
    let res = (await u.get('/api/subscriptions')).body;
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({ key: 'SPOTIFY', amount: 12.99, annual_cost: 155.88, category_name: 'Abonnements', account_name: 'Compte courant' });
    expect(res.items[0].price_change).toMatchObject({ old_amount: 10.99, new_amount: 12.99 });
    expect(res).toMatchObject({ monthly_total: 12.99, annual_total: 155.88 });

    // suivre comme récurrence : la règle démarre à la prochaine échéance, l'abonnement sort de la liste
    const tracked = await u.post('/api/subscriptions/track', { key: 'SPOTIFY' });
    expect(tracked.status).toBe(201);
    const [r] = (await u.get('/api/recurring')).body;
    expect(r).toMatchObject({ label: 'Spotify', amount: -12.99, frequency: 'monthly', start_date: res.items[0].next_date });
    expect((await u.get('/api/subscriptions')).body.items).toHaveLength(0);
    expect((await u.get('/api/transactions')).body).toHaveLength(6); // aucune opération en double

    // ignorer
    const v = await newUser();
    await withSpotify(v);
    expect((await v.post('/api/subscriptions/ignore', { key: 'SPOTIFY' })).status).toBe(201);
    res = (await v.get('/api/subscriptions')).body;
    expect(res).toMatchObject({ items: [], monthly_total: 0, annual_total: 0 });
    expect((await v.post('/api/subscriptions/ignore', { key: '' })).body.error).toBe('Abonnement manquant');
  });

  it('isole les abonnements entre utilisateurs', async () => {
    const alice = await newUser();
    const bob = await newUser();
    await withSpotify(alice);
    expect((await bob.get('/api/subscriptions')).body.items).toHaveLength(0);
    expect((await bob.post('/api/subscriptions/track', { key: 'SPOTIFY' })).status).toBe(404);
    await bob.post('/api/subscriptions/ignore', { key: 'SPOTIFY' });
    expect((await alice.get('/api/subscriptions')).body.items).toHaveLength(1);
  });
});
