import { test } from '@playwright/test';
import { goTo, loginDemo, registerNew } from './helpers';

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

  await goTo(page, 'Comptes');
  await page.getByRole('region', { name: 'Placements' }).getByRole('button', { name: /PEA/ }).click();
  await modalShot('07c-fiche-placement');
  await page.getByRole('button', { name: 'Fermer' }).click();
  await page.getByRole('region', { name: 'Dettes' }).getByRole('button', { name: /Prêt immobilier/ }).click();
  await page.getByText(/Tableau d'amortissement/).click();
  await modalShot('07d-fiche-credit');
  await page.getByRole('button', { name: 'Fermer' }).click();

  await page.getByRole('link', { name: 'Voir mon patrimoine' }).click();
  await page.locator('.recharts-area').first().waitFor();
  await shot('09-patrimoine');

  // phase 2
  await goTo(page, 'Opérations');
  await page.getByRole('radio', { name: 'Calendrier' }).click();
  await page.getByRole('grid').waitFor();
  await shot('10-calendrier');
  await page.getByRole('radio', { name: 'Liste' }).click();

  await page.goto('/annee');
  await page.locator('.year-table').waitFor();
  await shot('11-vue-annuelle');

  const d = new Date();
  await page.goto(`/recap/${new Date(d.getFullYear(), d.getMonth() - 1, 15).toISOString().slice(0, 7)}`);
  await page.locator('.recap-table').waitFor();
  await shot('12-recap');

  await page.goto('/reglages');
  await page.locator('main h1').waitFor();
  await shot('13-reglages');
  await page.getByRole('link', { name: 'Gérer' }).click();
  await page.locator('.account-row').first().waitFor();
  await shot('13b-regles');

  await page.goto('/tags/week-end-lyon');
  await page.locator('.hero-figure').waitFor();
  await shot('14-tag');

  await goTo(page, 'Comptes');
  await page.locator('#partages').getByRole('link', { name: /Coloc/ }).click();
  await page.getByRole('heading', { level: 1, name: 'Coloc' }).waitFor();
  await shot('15-partages');

  // thème sombre choisi dans Réglages
  await page.goto('/reglages');
  await page.getByRole('radio', { name: 'Sombre' }).click();
  await goTo(page, 'Aperçu');
  await page.waitForTimeout(800);
  await shot('16-apercu-sombre');
  await page.goto('/reglages');
  await page.getByRole('radio', { name: 'Système' }).click();

  // compte neuf : parcours de premier lancement
  await page.evaluate(() => localStorage.removeItem('pecule_token'));
  await registerNew(page, 'Camille');
  await page.getByText('Étape 1 sur 3').waitFor();
  await shot('17-premier-lancement');
});
