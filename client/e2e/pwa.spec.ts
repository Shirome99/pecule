import { test, expect } from '@playwright/test';
import { loginDemo } from './helpers';

test('le manifest et les icônes rendent l’app installable', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const manifest = await (await request.get(href!)).json();
  expect(manifest).toMatchObject({ name: 'Pécule', short_name: 'Pécule', display: 'standalone', start_url: '/', theme_color: '#123b3a', lang: 'fr' });
  const sizes = manifest.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}${i.purpose ? ` ${i.purpose}` : ''}`);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512', '512x512 maskable']));
  for (const icon of manifest.icons) {
    const res = await request.get(`/${icon.src}`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('image/png');
  }
  expect((await request.get('/apple-touch-icon-180x180.png')).status()).toBe(200);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon-180x180.png');
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');

  // critères d'installation de Chrome : service worker actif, qui contrôle la page et gère les requêtes (fetch)
  // (Page.getInstallabilityErrors de CDP ne remonte rien en headless : on vérifie les critères un par un)
  const state = await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state);
  expect(state).toBe('activated');
  await page.reload();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const sw = await (await request.get('/sw.js')).text();
  expect(sw).toMatch(/registerRoute|addEventListener\("fetch"/);
  expect(sw).toContain('index.html');
});

test('hors ligne, l’app s’ouvre et affiche le bandeau', async ({ page, context }) => {
  await loginDemo(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); // la page est maintenant contrôlée par le service worker
  await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
  await expect(page.getByText('Hors ligne')).toBeHidden();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'Hors ligne : tes données s\'afficheront au retour du réseau' })).toBeVisible();
  await expect(page.getByRole('navigation')).toBeVisible(); // le shell est là, la session est conservée
  await page.screenshot({ path: '../docs/screenshots/mobile-08-hors-ligne.png' });

  await context.setOffline(false);
  await expect(page.getByText('Hors ligne')).toBeHidden();
  await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
});
