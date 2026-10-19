import { test, expect } from '@playwright/test';
import { loginDemo } from './helpers';

test('raccourcis clavier : N, / et flèches, inactifs dans un champ', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile', 'raccourcis réservés au clavier (desktop)');
  await loginDemo(page);
  const monthLabel = page.locator('.month-picker-label');
  const current = (await monthLabel.textContent())!;

  await page.keyboard.press('ArrowLeft');
  await expect(monthLabel).not.toHaveText(current);
  await page.keyboard.press('ArrowRight');
  await expect(monthLabel).toHaveText(current);
  await page.keyboard.press('ArrowRight'); // pas au-delà du mois en cours
  await expect(monthLabel).toHaveText(current);

  await page.keyboard.press('n');
  const dialog = page.getByRole('dialog', { name: 'Nouvelle opération' });
  await expect(dialog).toBeVisible();
  // dans un champ, « n » s'écrit normalement
  await dialog.getByLabel('Libellé').press('n');
  await expect(dialog.getByLabel('Libellé')).toHaveValue('n');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.keyboard.press('/');
  await expect(page).toHaveURL(/\/transactions$/);
  const search = page.getByRole('searchbox', { name: 'Rechercher' });
  await expect(search).toBeFocused();
  await page.keyboard.type('/n');
  await expect(search).toHaveValue('/n');
  await expect(dialog).toBeHidden();
});
