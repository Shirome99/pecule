import { test, expect } from '@playwright/test';
import { goTo, loginDemo } from './helpers';

test('tags : saisie avec autocomplétion, filtre dans Opérations et bilan du tag', async ({ page }) => {
  await loginDemo(page);
  const tag = `e2e-${test.info().project.name}-${Date.now()}`;
  await page.getByRole('button', { name: /Nouvelle opération/ }).click();
  const form = page.getByRole('dialog', { name: 'Nouvelle opération' });
  await form.getByLabel('Montant').fill('42');
  await form.getByLabel('Libellé').fill('Musée des Confluences');
  await form.getByRole('button', { name: /Loisirs/ }).click();
  const tags = form.getByLabel('Tags (facultatif)');
  await tags.fill(`#${tag}`);
  await tags.press('Enter');
  await expect(form.locator('.tag')).toHaveText([`#${tag}✕`]);
  await form.getByRole('button', { name: 'Ajouter' }).click();
  await expect(form).toBeHidden();

  await goTo(page, 'Opérations');
  await page.getByLabel('Tag', { exact: true }).selectOption(tag);
  await expect(page.locator('.tx-row')).toHaveCount(1);
  await expect(page.locator('.tx-row')).toContainText(`#${tag}`);
  await page.getByRole('link', { name: `Bilan de #${tag}, tous mois confondus` }).click();
  await expect(page.getByRole('heading', { name: `#${tag}` })).toBeVisible();
  await expect(page.locator('.hero-figure')).toHaveText('42,00 €');
  await expect(page.locator('.nw-split')).toContainText('Loisirs');

  // le tag du seed couvre plusieurs jours
  await page.goto('/tags/week-end-lyon');
  await expect(page.locator('.hero-label')).toContainText(/Dépensé du 13 au 14/);
  await expect(page.locator('.hero-figure')).toHaveText('295,50 €');
});

test('règles : suggestion après avoir classé une opération semblable, puis écran Règles', async ({ page }) => {
  await loginDemo(page);
  await page.getByRole('button', { name: /Nouvelle opération/ }).click();
  const form = page.getByRole('dialog', { name: 'Nouvelle opération' });
  await form.getByLabel('Montant').fill('11,50');
  await form.getByLabel('Libellé').fill(`Cinéma ${test.info().project.name}`); // début commun avec « Cinéma » du seed
  await form.getByRole('button', { name: /Loisirs/ }).click();
  await form.getByRole('button', { name: 'Ajouter' }).click();

  const toast = page.locator('.toast');
  await expect(toast).toContainText('Toujours classer « CINEMA » en Loisirs ?');
  await toast.getByRole('button', { name: 'Créer la règle' }).click();
  await expect(page.locator('.toast')).toContainText('Règle créée');

  await page.goto('/reglages/regles');
  const rule = page.locator('.account-row', { hasText: '« CINEMA »' });
  await expect(rule).toContainText('Loisirs');
  await expect(page.locator('.account-row', { hasText: '« BASIC FIT »' })).toBeVisible();

  await page.getByRole('button', { name: 'Appliquer aux opérations sans catégorie' }).click();
  await expect(page.locator('.toast')).toContainText(/classée|Aucune opération/);

  // nettoyage : la règle créée ici ne doit pas gêner le projet suivant
  await rule.click();
  await page.getByRole('dialog', { name: 'Modifier la règle' }).getByRole('button', { name: 'Supprimer' }).click();
  await expect(rule).toHaveCount(0);
});
