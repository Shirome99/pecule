import { test, expect } from '@playwright/test';
import { goTo, loginDemo } from './helpers';

test("un objectif créé s'affiche sur l'Aperçu avec le montant mensuel", async ({ page }) => {
  await loginDemo(page);
  const name = `Vélo ${test.info().project.name} ${Date.now()}`;
  const d = new Date();
  const target = new Date(d.getFullYear(), d.getMonth() + 4, 15);
  const iso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-15`;

  await goTo(page, 'Comptes');
  await page.locator('#objectifs').getByRole('button', { name: 'Ajouter', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouvel objectif' });
  await dialog.getByLabel('Nom').fill(name);
  await dialog.getByLabel('Montant cible').fill('1000');
  await dialog.getByLabel('Date cible').fill(iso);
  await dialog.getByLabel('Déjà mis de côté').fill('200');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toBeHidden();

  const item = page.locator('.goal-item', { hasText: name });
  await expect(item).toContainText('200 € / 1 000 €');
  await expect(item).toContainText('200,00 € par mois pour y arriver à temps'); // 800 € sur 4 mois

  await item.getByRole('button', { name: '+ Ajouter un versement' }).click();
  const contrib = page.getByRole('dialog', { name });
  await contrib.getByLabel('Montant').fill('400');
  await contrib.getByRole('button', { name: 'Valider' }).click();
  await expect(item).toContainText('600 € / 1 000 €');
  await expect(item).toContainText('100,00 € par mois');

  await goTo(page, 'Aperçu');
  const card = page.locator('.goal', { hasText: name });
  await expect(card).toContainText('100,00 € par mois pour y arriver à temps');
  await expect(card.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '600');

  // nettoyage : suppression depuis la page Comptes
  await page.locator('.panel', { has: page.getByRole('heading', { name: "Objectifs d'épargne" }) }).getByRole('link', { name: 'Gérer' }).click();
  await expect(page.getByRole('heading', { name: 'Comptes', level: 1 })).toBeVisible();
  await page.locator('.goal-item', { hasText: name }).locator('.goal').click();
  page.once('dialog', (dl) => dl.accept());
  await page.getByRole('dialog', { name: 'Modifier l’objectif' }).getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.locator('.goal-item', { hasText: name })).toBeHidden();
});
