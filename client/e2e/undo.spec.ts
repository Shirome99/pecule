import { test, expect, type Page } from '@playwright/test';
import { goTo, loginDemo } from './helpers';

async function addExpense(page: Page, label: string, amount: string) {
  await page.getByRole('button', { name: /Nouvelle opération/ }).click();
  const form = page.getByRole('dialog', { name: 'Nouvelle opération' });
  await form.getByLabel('Montant').fill(amount);
  await form.getByLabel('Libellé').fill(label);
  await form.getByRole('button', { name: 'Ajouter' }).click();
  await expect(form).toBeHidden();
}

test('une opération supprimée peut être rétablie depuis le toast « Annuler »', async ({ page }) => {
  await loginDemo(page);
  const label = `Annulable ${test.info().project.name} ${Date.now()}`;
  await addExpense(page, label, '7,50');

  await goTo(page, 'Opérations');
  const row = page.getByRole('button', { name: new RegExp(label) });
  await row.click();
  await page.getByRole('dialog', { name: 'Modifier l’opération' }).getByRole('button', { name: 'Supprimer' }).click();

  const toast = page.locator('.toast');
  await expect(toast).toContainText('Opération supprimée.');
  await expect(row).toBeHidden();
  await toast.getByRole('button', { name: 'Annuler' }).click();
  await expect(row).toBeVisible();
  await expect(row).toContainText('-7,50');
  await expect(page.locator('.toast')).toContainText('C’est rétabli.');
});

test('un budget supprimé peut être rétabli', async ({ page }) => {
  await loginDemo(page);
  await goTo(page, 'Budgets');
  const first = page.locator('button.budget').first();
  const name = (await first.locator('.budget-top > span').first().textContent())?.trim() ?? '';
  await first.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.locator('.toast')).toContainText('supprimé');
  await expect(page.locator('button.budget', { hasText: name })).toHaveCount(0);
  await page.locator('.toast').getByRole('button', { name: 'Annuler' }).click();
  await expect(page.locator('button.budget', { hasText: name })).toHaveCount(1);
});

test('sans action, le toast d’annulation reste 6 secondes puis disparaît', async ({ page }) => {
  await loginDemo(page);
  const label = `Éphémère ${test.info().project.name} ${Date.now()}`;
  await addExpense(page, label, '1');
  await goTo(page, 'Opérations');
  await page.getByRole('button', { name: new RegExp(label) }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
  const toast = page.locator('.toast');
  await expect(toast).toBeVisible();
  await page.waitForTimeout(5000);
  await expect(toast).toBeVisible();
  await expect(toast).toBeHidden({ timeout: 3000 });
});
