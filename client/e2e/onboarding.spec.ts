import { test, expect } from '@playwright/test';
import { goTo, registerNew } from './helpers';

test('premier lancement : solde, salaire et budget, puis l’Aperçu', async ({ page }) => {
  await registerNew(page);
  await expect(page.getByRole('heading', { name: /Combien as-tu sur ton compte courant/ })).toBeVisible();
  await page.getByLabel('Solde actuel').fill('1 250,40');
  await page.getByRole('button', { name: 'Continuer' }).click();

  await expect(page.getByRole('heading', { name: 'Combien gagnes-tu par mois ?' })).toBeVisible();
  await page.getByLabel('Salaire net mensuel').fill('2100');
  await page.getByLabel('Versé le').selectOption('28');
  await page.getByRole('button', { name: 'Continuer' }).click();

  await expect(page.getByRole('heading', { name: 'Un premier budget pour commencer ?' })).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(3);
  await page.getByRole('radio', { name: /Courses/ }).click();
  await page.getByLabel('Plafond mensuel').fill('350');
  await page.getByRole('button', { name: 'Terminer' }).click();

  await expect(page.getByRole('heading', { name: 'Bonjour Camille' })).toBeVisible();
  await expect(page.locator('.budget', { hasText: 'Courses' })).toContainText('350');

  await goTo(page, 'Comptes');
  await expect(page.locator('.account-row', { hasText: 'Compte courant' })).toContainText('1 250,40');
  await expect(page.locator('.rec-row', { hasText: 'Salaire' })).toContainText('Chaque mois, le 28');

  // le parcours ne revient pas
  await page.reload();
  await goTo(page, 'Aperçu');
  await expect(page.getByRole('heading', { name: 'Bonjour Camille' })).toBeVisible();
});

test('premier lancement : chaque écran peut être passé', async ({ page }) => {
  await registerNew(page, 'Sam');
  for (let i = 0; i < 3; i++) {
    await expect(page.getByText(`Étape ${i + 1} sur 3`)).toBeVisible();
    await page.getByRole('button', { name: 'Passer' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Bonjour Sam' })).toBeVisible();
  await expect(page.getByText(/Aucune opération en/)).toBeVisible();
});
