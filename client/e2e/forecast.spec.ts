import { test, expect, type Page } from '@playwright/test';
import { loginDemo, parseEuros } from './helpers';

async function safeToSpend(page: Page) {
  await page.getByRole('button', { name: "Comment c'est calculé ?" }).click();
  const dialog = page.getByRole('dialog', { name: "Comment c'est calculé ?" });
  const value = parseEuros((await dialog.locator('.calc-row', { hasText: 'Reste à dépenser' }).locator('dd').textContent()) ?? '');
  // 300 € vers le Livret A + 200 € vers le PEA (un placement est aussi de l'épargne)
  await expect(dialog.locator('.calc-row', { hasText: 'Épargne prévue' })).toContainText('500,00');
  await dialog.getByRole('button', { name: 'Fermer' }).click();
  return value;
}

test('la prévision du mois affiche le reste par jour et se met à jour après une dépense', async ({ page }) => {
  await loginDemo(page);
  const hero = page.getByRole('region', { name: 'Résumé du mois' });
  await expect(hero.locator('.forecast-main')).toContainText(/Tu peux dépenser .+\/jour jusqu'au \d+|Tu dépasses de/);
  await expect(hero.locator('.forecast-sub')).toContainText('Fin de mois estimée');
  const before = await safeToSpend(page);

  await page.getByRole('button', { name: /Nouvelle opération/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouvelle opération' });
  await dialog.getByLabel('Montant').fill('100');
  await dialog.getByLabel('Libellé').fill(`Prévision ${test.info().project.name}`);
  await dialog.getByRole('button', { name: 'Ajouter' }).click();
  await expect(dialog).toBeHidden();

  await expect.poll(() => safeToSpend(page)).toBeCloseTo(before - 100, 2);
});
