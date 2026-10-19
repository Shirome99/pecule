import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginDemo } from './helpers';

const PAGES = [
  ['Aperçu', '/'], ['Opérations', '/transactions'], ['Budgets', '/budgets'], ['Comptes', '/comptes'],
  ['Abonnements', '/abonnements'], ['Patrimoine', '/patrimoine'], ['Réglages', '/reglages'],
] as const;

for (const theme of ['light', 'dark'] as const) {
  test(`accessibilité (axe) en thème ${theme === 'light' ? 'clair' : 'sombre'} : aucune violation grave`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('pecule_theme', t), theme);
    await loginDemo(page);
    const problems: string[] = [];
    for (const [name, path] of PAGES) {
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      await expect(page.getByText('Chargement…')).toHaveCount(0);
      await page.waitForTimeout(800); // animations des barres et des graphiques
      const { violations } = await new AxeBuilder({ page }).analyze();
      for (const v of violations.filter((x) => x.impact === 'serious' || x.impact === 'critical'))
        problems.push(`${name} · ${v.id} (${v.impact}) : ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')}`);
    }
    expect(problems).toEqual([]);
  });
}
