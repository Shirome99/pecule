import { expect, type Page } from '@playwright/test';

/** Lit un montant affiché en fr-FR (« 1 234,56 € ») et le renvoie en nombre. */
export const parseEuros = (s: string) => Number(s.replace(/[^\d,-]/g, '').replace(',', '.'));

export async function loginDemo(page: Page) {
  await page.goto('/');
  await page.getByLabel('Email').fill('demo@money.app');
  await page.getByLabel('Mot de passe').fill('demo1234');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
}

/** « Reste ce mois-ci » signé (négatif si « Dépassement »). */
export async function remaining(page: Page) {
  const hero = page.getByRole('region', { name: 'Résumé du mois' });
  const label = await hero.locator('.hero-label').textContent();
  const value = parseEuros((await hero.locator('.hero-figure').textContent()) ?? '');
  return label?.startsWith('Dépassement') ? -value : value;
}

export async function goTo(page: Page, name: string) {
  await page.getByRole('navigation').getByRole('link', { name }).click();
}
