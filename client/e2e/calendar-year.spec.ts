import { test, expect } from '@playwright/test';
import { goTo, loginDemo } from './helpers';

test('calendrier du mois : intensité, total et opérations du jour', async ({ page }) => {
  await loginDemo(page);
  await goTo(page, 'Opérations');
  await page.getByRole('radio', { name: 'Calendrier' }).click();
  const grid = page.getByRole('grid', { name: /Dépenses par jour/ });
  await expect(grid).toBeVisible();
  const day3 = grid.getByRole('button', { name: /^\S+ 3 .*dépensés/ });
  // le loyer du 3 : parmi les jours les plus dépensiers, intensité maximale
  await expect(day3).toHaveClass(/lvl-4/);
  await day3.click();
  const mobile = test.info().project.name === 'mobile';
  const detail = mobile ? page.getByRole('dialog') : page.locator('.cal-detail');
  await expect(detail.getByRole('button', { name: /Loyer/ })).toBeVisible();
  if (!mobile) await expect(grid.locator('.cal-total').first()).toBeVisible();
  else await expect(grid.locator('.cal-total')).toHaveCount(0);

  // le choix est gardé
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Calendrier' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: 'Liste' }).click();
});

test('vue annuelle depuis l’Aperçu : chiffres, tableau catégories × mois et top 5', async ({ page }) => {
  await loginDemo(page);
  await page.getByRole('link', { name: 'Vue annuelle' }).click();
  await expect(page.getByRole('heading', { name: 'Vue annuelle' })).toBeVisible();
  await expect(page.locator('.sheet-stat', { hasText: "Taux d'épargne" })).toContainText('%');
  const table = page.getByRole('table');
  await expect(table.getByRole('rowheader', { name: /Logement/ })).toBeVisible();
  await expect(table.locator('thead th')).toHaveCount(14);
  await expect(page.locator('.top-list li')).toHaveCount(5);
  // la colonne Catégorie reste visible quand on fait défiler le tableau
  await page.locator('.year-table').evaluate((el) => { el.scrollLeft = 2000; });
  await expect(table.getByRole('rowheader', { name: /Logement/ })).toBeInViewport();
  await page.getByRole('button', { name: 'Année précédente' }).click();
  await expect(page.locator('.month-picker-label')).toHaveText(String(new Date().getFullYear() - 1));
});
