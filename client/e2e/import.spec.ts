import { writeFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { goTo, loginDemo } from './helpers';

type Stats = { balance: number; trend: { month: string; income: number; expenses: number }[] };
type Account = { initial_balance: number };

const token = (page: Page) => page.evaluate(() => localStorage.getItem('pecule_token'));

async function apiGet<T>(page: Page, url: string): Promise<T> {
  const res = await page.request.get(`/api${url}`, { headers: { Authorization: `Bearer ${await token(page)}` } });
  expect(res.ok()).toBe(true);
  return url.endsWith('.csv') ? ((await res.text()) as T) : res.json();
}

/** Tendance 6 mois + somme des opérations (solde total hors soldes de départ). */
async function totals(page: Page) {
  const stats = await apiGet<Stats>(page, '/stats');
  const accounts = await apiGet<Account[]>(page, '/accounts');
  const initial = accounts.reduce((s, a) => s + a.initial_balance, 0);
  return { trend: stats.trend, operations: Math.round((stats.balance - initial) * 100) / 100 };
}

test("l'export CSV réimporté dans un compte vide donne les mêmes totaux", async ({ page }, info) => {
  await loginDemo(page);
  const csv = await apiGet<string>(page, '/export.csv');
  const expected = await totals(page);
  const file = info.outputPath('export.csv');
  writeFileSync(file, csv);

  // nouvel utilisateur, compte vide
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await page.getByRole('button', { name: 'Créer un compte' }).click();
  await page.getByLabel('Prénom').fill('Import');
  await page.getByLabel('Email').fill(`import-${info.project.name}-${Date.now()}@test.fr`);
  await page.getByLabel('Mot de passe').fill('secret12');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();

  await goTo(page, 'Opérations');
  await page.getByRole('button', { name: 'Importer' }).click();
  const dialog = page.getByRole('dialog', { name: 'Importer un relevé' });
  await dialog.getByLabel('Fichier CSV de ta banque').setInputFiles(file);
  await expect(dialog).toContainText('séparateur « ; » · UTF-8');
  await expect(dialog.locator('.import-row').first()).toBeVisible();
  await expect(dialog.locator('.import-row')).toHaveCount(20);
  await expect(dialog).toContainText('virements internes ignorés');
  await expect(dialog.locator('.badge.duplicate')).toHaveCount(0);
  await dialog.getByRole('button', { name: /^Importer \d+ opérations$/ }).click();
  await expect(dialog.getByRole('status')).toContainText('importées');

  const got = await totals(page);
  expect(got.trend).toEqual(expected.trend);
  expect(got.operations).toBeCloseTo(expected.operations, 2);

  // réimporter le même fichier : tout est détecté comme doublon et ignoré
  await dialog.getByLabel('Fichier CSV de ta banque').setInputFiles([]);
  await dialog.getByLabel('Fichier CSV de ta banque').setInputFiles(file);
  await expect(dialog.locator('.import-summary')).toContainText(/^0 à importer · \d+ doublons ignorés/);
  await expect(dialog.getByRole('button', { name: /^Importer 0 opération$/ })).toBeDisabled();
});
