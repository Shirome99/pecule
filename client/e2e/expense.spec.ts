import { test, expect } from '@playwright/test';
import { goTo, loginDemo, remaining } from './helpers';

test('une dépense ajoutée apparaît dans Opérations et diminue le reste du mois', async ({ page }) => {
  await loginDemo(page);
  const before = await remaining(page);
  const label = `Test e2e ${test.info().project.name} ${Date.now()}`;

  await page.getByRole('button', { name: /Nouvelle opération/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouvelle opération' });
  await dialog.getByLabel('Montant').fill('12,34');
  await dialog.getByLabel('Libellé').fill(label);
  await dialog.getByRole('button', { name: /Courses/ }).click();
  await dialog.getByRole('button', { name: 'Ajouter' }).click();
  await expect(dialog).toBeHidden();

  await expect.poll(() => remaining(page)).toBeCloseTo(before - 12.34, 2);

  await goTo(page, 'Opérations');
  const row = page.getByRole('button', { name: new RegExp(label) });
  await expect(row).toBeVisible();
  await expect(row).toContainText('-12,34');
});
