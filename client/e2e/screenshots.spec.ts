import { test } from '@playwright/test';
import { goTo, loginDemo } from './helpers';

// Captures de chaque écran : SCREENSHOTS=1 npm run test:e2e -- screenshots
test.skip(!process.env.SCREENSHOTS, 'captures uniquement sur demande (SCREENSHOTS=1)');

const dir = '../docs/screenshots';

test('captures de tous les écrans', async ({ page }) => {
  const p = test.info().project.name;
  const shot = (name: string, fullPage = true) => page.screenshot({ path: `${dir}/${p}-${name}.png`, fullPage });
  // modale : on attend la fin de l'animation et on capture l'écran visible
  const modalShot = async (name: string) => { await page.waitForTimeout(400); await shot(name, false); };

  await page.goto('/');
  await shot('01-connexion');
  await loginDemo(page);
  await page.waitForTimeout(800); // animations du graphique
  await shot('02-apercu');
  await page.getByRole('button', { name: "Comment c'est calculé ?" }).click();
  await modalShot('02b-prevision');
  await page.getByRole('button', { name: 'Fermer' }).click();

  await page.getByRole('button', { name: /Nouvelle opération/ }).click();
  await modalShot('03-nouvelle-operation');
  await page.getByRole('dialog').getByRole('radio', { name: 'Virement' }).click();
  await modalShot('04-nouveau-virement');
  await page.getByRole('button', { name: 'Fermer' }).click();

  await goTo(page, 'Opérations');
  await page.locator('.day').first().waitFor();
  await shot('05-operations');
  await page.getByRole('button', { name: 'Importer' }).click();
  await page.getByLabel('Fichier CSV de ta banque').setInputFiles('../docs/exemple-releve.csv');
  await page.locator('.import-row').first().waitFor();
  await modalShot('05b-import');
  await page.getByRole('button', { name: 'Fermer' }).click();

  await goTo(page, 'Budgets');
  await page.locator('.budget').first().waitFor();
  await shot('06-budgets');

  await goTo(page, 'Comptes');
  await page.locator('.rec-row').first().waitFor();
  await shot('07-comptes');

  await page.getByRole('link', { name: 'Abonnements détectés' }).click();
  await page.locator('.sub-item').first().waitFor();
  await shot('07b-abonnements');
});
