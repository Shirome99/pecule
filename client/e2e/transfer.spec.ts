import { test, expect } from '@playwright/test';
import { accountBalance, goTo, loginDemo, monthTotals } from './helpers';

test('un virement change les deux soldes sans bouger revenus ni dépenses', async ({ page }) => {
  await loginDemo(page);
  const totals = await monthTotals(page);
  await goTo(page, 'Comptes');
  const courant = await accountBalance(page, 'Compte courant');
  const livret = await accountBalance(page, 'Livret A');

  await page.getByRole('button', { name: /Nouvelle opération/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouvelle opération' });
  await dialog.getByRole('radio', { name: 'Virement' }).click();
  await dialog.getByLabel('Montant').fill('50');
  await dialog.getByLabel('De').selectOption({ label: 'Compte courant' });
  await dialog.getByLabel('Vers').selectOption({ label: 'Livret A' });
  await dialog.getByRole('button', { name: 'Ajouter' }).click();
  await expect(dialog).toBeHidden();

  await expect.poll(() => accountBalance(page, 'Compte courant')).toBeCloseTo(courant - 50, 2);
  expect(await accountBalance(page, 'Livret A')).toBeCloseTo(livret + 50, 2);

  await goTo(page, 'Opérations');
  await expect(page.locator('.tx-row', { hasText: 'Compte courant → Livret A' }).first()).toBeVisible();

  await goTo(page, 'Aperçu');
  await expect(page.locator('.hero-split')).toBeVisible();
  expect(await monthTotals(page)).toEqual(totals);
});
