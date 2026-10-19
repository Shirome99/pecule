import { test, expect } from '@playwright/test';
import { goTo, loginDemo } from './helpers';

test('une opération répétée chaque mois apparaît dans les récurrences et peut être mise en pause', async ({ page }) => {
  await loginDemo(page);
  const label = `Abonnement e2e ${test.info().project.name} ${Date.now()}`;

  await page.getByRole('button', { name: /Nouvelle opération/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouvelle opération' });
  await dialog.getByLabel('Montant').fill('9,99');
  await dialog.getByLabel('Libellé').fill(label);
  await dialog.getByRole('checkbox', { name: /Répéter chaque mois/ }).check();
  await dialog.getByRole('button', { name: 'Ajouter' }).click();
  await expect(dialog).toBeHidden();

  // l'occurrence du jour est générée tout de suite
  await goTo(page, 'Opérations');
  await expect(page.getByRole('button', { name: new RegExp(label) })).toBeVisible();

  await goTo(page, 'Comptes');
  const row = page.locator('.rec-row', { hasText: label });
  await expect(row).toContainText('Chaque mois, le');
  await expect(row).toContainText('-9,99');
  await row.getByRole('button', { name: 'Mettre en pause' }).click();
  await expect(row).toContainText('En pause');
  await row.getByRole('button', { name: 'Reprendre' }).click();
  await expect(row).not.toContainText('En pause');

  page.once('dialog', (d) => d.accept());
  await row.getByRole('button', { name: /Supprimer/ }).click();
  await expect(row).toBeHidden();
});
