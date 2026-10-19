import { writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { loginDemo } from './helpers';

const pdfPages = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) ?? []).length;

test('du 1er au 5 du mois, la bannière mène au récap, qui s’imprime en 2 pages A4 au plus', async ({ page }, info) => {
  const now = new Date();
  await page.clock.setFixedTime(new Date(now.getFullYear(), now.getMonth(), 3, 10));
  await loginDemo(page);
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString('fr-FR', { month: 'long' });
  const banner = page.getByRole('link', { name: `Ton récap de ${previous} est prêt` });
  await banner.click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(new RegExp(previous, 'i'));
  await expect(page.locator('.sheet-stat', { hasText: 'Patrimoine net' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Top 5 des catégories' })).toBeVisible();
  await expect(page.locator('.recap-table tbody tr')).toHaveCount(5);
  await expect(page.getByRole('heading', { name: 'Budgets' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Abonnements' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Télécharger en PDF' })).toBeVisible();

  // feuille d'impression : ni navigation ni bouton
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Télécharger en PDF' })).toBeHidden();

  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true });
    writeFileSync(info.outputPath(`recap-${theme}.pdf`), pdf);
    const pages = pdfPages(pdf);
    expect(pages, `pages (${theme})`).toBeGreaterThanOrEqual(1);
    expect(pages, `pages (${theme})`).toBeLessThanOrEqual(2);
  }
});

test('après le 5, pas de bannière ; un mois passé propose son récap', async ({ page }) => {
  const now = new Date();
  await page.clock.setFixedTime(new Date(now.getFullYear(), now.getMonth(), 12, 10));
  await loginDemo(page);
  await expect(page.getByRole('link', { name: /est prêt/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mois précédent' }).click();
  await page.getByRole('link', { name: /Voir le récap de/ }).click();
  await expect(page).toHaveURL(/\/recap\/\d{4}-\d{2}$/);
});
