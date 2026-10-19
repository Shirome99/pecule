import { test, expect } from '@playwright/test';
import { registerNew } from './helpers';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test('constats : carte masquée sans historique, puis hausse d’une catégorie avec lien filtré', async ({ page }) => {
  await registerNew(page, 'Insight');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Passer' }).click();
  await expect(page.getByRole('heading', { name: 'Bonjour Insight' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'À retenir' })).toHaveCount(0);

  // historique : 100 € de restaurants le 1er de chacun des 3 mois précédents, puis 400 € ce mois-ci
  const token = await page.evaluate(() => localStorage.getItem('pecule_token'));
  const headers = { Authorization: `Bearer ${token}` };
  const accounts = await (await page.request.get('/api/accounts', { headers })).json();
  const cats = await (await page.request.get('/api/categories', { headers })).json();
  const resto = cats.find((c: { name: string }) => c.name === 'Restaurants').id;
  const now = new Date();
  for (let i = 3; i >= 0; i--) {
    const date = iso(new Date(now.getFullYear(), now.getMonth() - i, 1));
    await page.request.post('/api/transactions', {
      headers, data: { account_id: accounts[0].id, category_id: resto, amount: i ? 100 : 400, type: 'expense', label: 'Brasserie', date },
    });
  }

  await page.reload();
  const card = page.getByRole('region', { name: 'À retenir' });
  // \s : Intl sépare « 400 » et « € » par une espace insécable
  await expect(card).toContainText(/Restaurants : 400\s€ au \d+, \+300 % par rapport à ta moyenne de 100\s€/);
  await card.getByRole('link', { name: 'Voir les opérations' }).first().click();
  await expect(page).toHaveURL(/\/transactions\?month=\d{4}-\d{2}&category=\d+/);
  await expect(page.getByLabel('Catégorie')).toHaveValue(String(resto));
  await expect(page.locator('.tx-row')).toHaveCount(1);
  await expect(page.locator('.tx-row')).toContainText('-400,00');
});
