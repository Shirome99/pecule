import { test, expect } from '@playwright/test';
import { goTo, loginDemo } from './helpers';

test('les abonnements détectés sont visibles, suivis ou ignorés', async ({ page }, info) => {
  await loginDemo(page);
  const card = page.locator('.subs-card');
  await expect(card.getByRole('heading')).toContainText(/Abonnements : .+\/mois, .+\/an/);
  await expect(card).toContainText(/Spotify : 10,99\s€ → 12,99\s€/); // hausse dans les 60 derniers jours

  await card.getByRole('link', { name: 'Voir' }).click();
  await expect(page.getByRole('heading', { name: 'Abonnements', level: 1 })).toBeVisible();
  const spotify = page.locator('.sub-item', { hasText: 'Spotify' });
  await expect(spotify).toContainText('Prix en hausse');
  await expect(spotify).toContainText(/10,99\s€ → 12,99\s€ depuis le \d+ \S+/);
  await expect(spotify).toContainText(/156\s€\/an/); // 12,99 × 12 = 155,88 €
  await expect(page.locator('.sub-item', { hasText: 'Carrefour' })).toHaveCount(0); // courses : pas un abonnement

  // la base est partagée entre les deux viewports : chacun agit sur un abonnement différent
  if (info.project.name === 'desktop') {
    await page.locator('.sub-item', { hasText: 'Basic Fit' }).getByRole('button', { name: 'Suivre comme récurrence' }).click();
    await expect(page.locator('.sub-item', { hasText: 'Basic Fit' })).toHaveCount(0);
    await goTo(page, 'Comptes');
    await expect(page.locator('.rec-row', { hasText: 'Basic Fit' })).toContainText('Chaque mois, le 12');
    await page.getByRole('link', { name: 'Abonnements détectés' }).click();
    await expect(page.getByRole('heading', { name: 'Abonnements', level: 1 })).toBeVisible();
  } else {
    await page.locator('.sub-item', { hasText: 'Mma Iard' }).getByRole('button', { name: 'Ignorer' }).click();
    await expect(page.locator('.sub-item', { hasText: 'Mma Iard' })).toHaveCount(0);
  }
});
