import { test, expect } from '@playwright/test';
import { goTo, loginDemo, parseEuros } from './helpers';

test('patrimoine : sections de comptes, fiches placement et crédit, vue Patrimoine', async ({ page }, info) => {
  await loginDemo(page);

  // Aperçu → vue Patrimoine
  const card = page.locator('.nw-card');
  await expect(card).toContainText('Patrimoine net');
  await card.getByRole('link', { name: 'Voir' }).click();
  await expect(page.getByRole('heading', { name: 'Patrimoine', level: 1 })).toBeVisible();
  const net = parseEuros((await page.locator('.hero-figure').textContent()) ?? '');
  expect(net).toBeGreaterThan(0);
  await expect(page.locator('.nw-legend')).toContainText('Liquidités');
  await expect(page.locator('.nw-legend')).toContainText('Dettes');
  await expect(page.locator('.recharts-area')).toHaveCount(3);
  await expect(page.locator('.hero-split')).toContainText('Sur 12 mois');

  // Comptes : trois familles avec leur total
  await goTo(page, 'Comptes');
  for (const name of ['Liquidités', 'Placements', 'Dettes']) await expect(page.getByRole('region', { name })).toBeVisible();
  const debts = page.getByRole('region', { name: 'Dettes' });
  await expect(debts).toContainText('Prêt immobilier');

  // fiche crédit
  await debts.getByRole('button', { name: /Prêt immobilier/ }).click();
  const loan = page.getByRole('dialog', { name: 'Prêt immobilier' });
  await expect(loan).toContainText('Capital restant dû');
  await expect(loan.locator('.sheet-stat', { hasText: 'Mensualité' })).toContainText(/1\s159,92/);
  await loan.getByText(/Tableau d'amortissement \(240 échéances\)/).click();
  await expect(loan.locator('tbody tr')).toHaveCount(240);
  await loan.getByRole('button', { name: 'Fermer' }).click();

  // fiche placement : mettre à jour la valeur
  const investments = page.getByRole('region', { name: 'Placements' });
  await investments.getByRole('button', { name: /PEA/ }).click();
  const sheet = page.getByRole('dialog', { name: 'PEA' });
  await expect(sheet).toContainText('Plus-value latente');
  const value = info.project.name === 'desktop' ? '12345' : '12400';
  await sheet.getByLabel('Valeur').fill(value);
  await sheet.getByRole('button', { name: 'Mettre à jour la valeur' }).click();
  await expect(sheet.locator('.sheet-stat', { hasText: 'Valeur' }).first()).toContainText(value.replace(/(\d{2})(\d{3})/, '$1 $2'));
  await sheet.getByRole('button', { name: 'Fermer' }).click();
  await expect(investments.getByRole('button', { name: /PEA/ })).toContainText(value.replace(/(\d{2})(\d{3})/, '$1 $2'));
});
