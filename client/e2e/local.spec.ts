// App mobile (vite --mode mobile) : données sur l'appareil, serveur embarqué, aucun appel réseau à une API.
import { test, expect, type Page } from '@playwright/test';
import { remaining } from './helpers';

/** Écran d'accueil → nouveau profil → parcours de premier lancement passé → Aperçu. */
async function newProfile(page: Page, name = 'Camille') {
  await page.goto('/');
  // premier démarrage : SQLite (WebAssembly) et le serveur embarqué se chargent
  await expect(page.getByRole('heading', { name: 'Bienvenue' })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Prénom').fill(name);
  await page.getByRole('button', { name: 'Commencer' }).click();
  const hello = page.getByRole('heading', { name: /Bonjour/ });
  for (let i = 0; i < 3 && !(await hello.isVisible()); i++) {
    await page.getByRole('button', { name: 'Passer' }).click();
  }
  await expect(hello).toBeVisible();
}

async function addExpense(page: Page, label: string, amount: string) {
  await page.getByRole('button', { name: 'Nouvelle opération' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouvelle opération' });
  await dialog.getByLabel('Montant').fill(amount);
  await dialog.getByLabel('Libellé').fill(label);
  await dialog.getByRole('button', { name: /Courses/ }).click();
  await dialog.getByRole('button', { name: 'Ajouter' }).click();
  await expect(dialog).toBeHidden();
}

async function openSettings(page: Page) {
  await page.getByRole('navigation').getByRole('link', { name: 'Comptes' }).click();
  await page.getByRole('link', { name: 'Réglages' }).click();
  await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  // l'app mobile ne doit jamais appeler d'API sur le réseau
  await page.route('**/api/**', (route) => { throw new Error(`Appel réseau inattendu : ${route.request().url()}`); });
});

test('premier lancement : un prénom suffit, et les opérations restent après redémarrage', async ({ page }) => {
  await newProfile(page);
  const before = await remaining(page);
  await addExpense(page, 'Boulangerie du coin', '4,20');
  await expect.poll(() => remaining(page)).toBeCloseTo(before - 4.2, 2);

  // « redémarrage » : la base est relue depuis le stockage de l'appareil
  await page.reload();
  await expect(page.getByRole('heading', { name: /Bonjour Camille/ })).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Opérations' }).click();
  await expect(page.getByRole('button', { name: /Boulangerie du coin/ })).toContainText('-4,20');

  // changer de profil ramène à l'accueil, qui propose de reprendre le profil
  await openSettings(page);
  await page.getByRole('button', { name: 'Changer de profil' }).click();
  await expect(page.getByRole('heading', { name: 'Content de te revoir' })).toBeVisible();
  await page.getByRole('button', { name: /Camille/ }).click();
  await expect(page.getByRole('heading', { name: /Bonjour Camille/ })).toBeVisible();
});

test('hors connexion : l’app reste utilisable', async ({ page, context }) => {
  await newProfile(page, 'Sam');
  // dans l'app, les écrans sont des fichiers locaux : on les charge avant de couper le réseau du navigateur de test
  for (const name of ['Opérations', 'Budgets', 'Aperçu']) await page.getByRole('navigation').getByRole('link', { name }).click();
  await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByText(/Hors ligne/)).toBeHidden(); // pas de bandeau : rien ne manque
  await addExpense(page, 'Marché sans réseau', '7');
  await page.getByRole('navigation').getByRole('link', { name: 'Opérations' }).click();
  await expect(page.getByRole('button', { name: /Marché sans réseau/ })).toContainText('-7,00');
  await page.getByRole('navigation').getByRole('link', { name: 'Budgets' }).click();
  await expect(page.locator('main h1')).toHaveText('Budgets');
  await context.setOffline(false);
});

test('démo, sauvegarde, effacement puis restauration', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explorer avec des données de démo' }).click({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: /Bonjour Démo/ })).toBeVisible();
  const before = await remaining(page);

  await openSettings(page);
  await expect(page.getByText('Aucune sauvegarde pour le moment.')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Enregistrer une sauvegarde' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^pecule-sauvegarde-\d{4}-\d{2}-\d{2}\.sqlite$/);
  const backup = test.info().outputPath('sauvegarde.sqlite');
  await download.saveAs(backup);
  await expect(page.getByText(/Dernière sauvegarde :/)).toBeVisible();

  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Tout effacer' }).click();
  await expect(page.getByRole('heading', { name: 'Bienvenue' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Explorer avec des données de démo' })).toBeVisible();

  // un fichier qui n'est pas une sauvegarde est refusé
  await page.getByLabel('Fichier de sauvegarde').setInputFiles({ name: 'faux.sqlite', mimeType: 'application/octet-stream', buffer: Buffer.from('pas une base') });
  await expect(page.getByRole('alert')).toHaveText('Ce fichier n’est pas une sauvegarde Pécule.');

  await page.getByLabel('Fichier de sauvegarde').setInputFiles(backup);
  await expect(page.getByRole('button', { name: 'Ouvrir la démo' })).toBeVisible();
  await page.getByRole('button', { name: 'Ouvrir la démo' }).click();
  await expect(page.getByRole('heading', { name: /Bonjour Démo/ })).toBeVisible();
  expect(await remaining(page)).toBeCloseTo(before, 2);
});

test('code de verrouillage demandé au lancement', async ({ page }) => {
  await newProfile(page, 'Lou');
  await openSettings(page);
  await page.getByRole('button', { name: 'Activer le code' }).click();
  const dialog = page.getByRole('dialog', { name: 'Code de verrouillage' });
  for (const d of '2580') await dialog.getByRole('button', { name: d, exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Confirme ton code' })).toBeVisible();
  for (const d of '2580') await dialog.getByRole('button', { name: d, exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Retirer le code' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Pécule est verrouillé' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeHidden();
  for (const d of '1111') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Code incorrect' })).toBeVisible();
  for (const d of '2580') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
});
