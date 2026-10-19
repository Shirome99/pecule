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

/** Revenus et Dépenses du mois affichés sur l'Aperçu. */
export async function monthTotals(page: Page) {
  const split = page.locator('.hero-split');
  const read = async (name: string) => parseEuros((await split.locator('div', { hasText: name }).locator('strong').textContent()) ?? '');
  return { income: await read('Revenus'), expenses: await read('Dépenses') };
}

export async function accountBalance(page: Page, name: string) {
  const row = page.locator('.account-row', { hasText: name });
  return parseEuros((await row.locator('.tx-amount').textContent()) ?? '');
}

/** Crée un compte neuf par l'interface (parcours de premier lancement affiché ensuite). */
export async function registerNew(page: Page, name = 'Camille') {
  await page.goto('/');
  await page.getByRole('button', { name: 'Créer un compte' }).click();
  await page.getByLabel('Prénom').fill(name);
  await page.getByLabel('Email').fill(`neuf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.fr`);
  await page.getByLabel('Mot de passe').fill('secret12');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
}
