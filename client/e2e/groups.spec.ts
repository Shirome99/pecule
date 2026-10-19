import { test, expect } from '@playwright/test';
import { goTo, loginDemo } from './helpers';

test('dépenses partagées : créer un groupe, ajouter une dépense, solder', async ({ page }) => {
  await loginDemo(page);
  await goTo(page, 'Comptes');
  await expect(page.locator('#partages')).toContainText('Coloc');
  await page.getByRole('button', { name: 'Nouveau groupe' }).click();
  const name = `Voyage ${test.info().project.name}`;
  const form = page.getByRole('dialog', { name: 'Nouveau groupe' });
  await form.getByLabel('Nom', { exact: true }).fill(name);
  await form.getByLabel(/Avec qui/).fill('Sarah');
  await form.getByRole('button', { name: 'Créer' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

  // 84 € payés par moi, à parts égales : Sarah me doit 42 €
  await page.getByRole('button', { name: '+ Ajouter une dépense' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouvelle dépense partagée' });
  await dialog.getByLabel('Montant total').fill('84');
  await dialog.getByLabel('Libellé').fill('Airbnb');
  await dialog.getByRole('button', { name: 'Ajouter' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Sarah doit 42,00 € à Démo')).toBeVisible();

  // une dépense inégale payée par Sarah : 30 € dont 20 € pour moi
  await page.getByRole('button', { name: '+ Ajouter une dépense' }).click();
  await dialog.getByLabel('Montant total').fill('30');
  await dialog.getByLabel('Libellé').fill('Taxi');
  await dialog.getByLabel('Payé par').selectOption({ label: 'Sarah' });
  await dialog.getByRole('radio', { name: 'Montants' }).click();
  await dialog.getByLabel('Part de Démo').fill('20');
  await dialog.getByLabel('Part de Sarah').fill('10');
  await dialog.getByRole('button', { name: 'Ajouter' }).click();
  await expect(page.getByText('Sarah doit 22,00 € à Démo')).toBeVisible();

  await page.getByRole('button', { name: 'Marquer comme remboursé' }).click();
  await expect(page.getByText('Tout le monde est quitte.')).toBeVisible();
  await expect(page.getByText('Sarah a remboursé 22,00 € à Démo')).toBeVisible();

  // ma part de l'Airbnb est une opération sur mon compte
  await goTo(page, 'Opérations');
  await expect(page.getByRole('button', { name: `Airbnb (${name}, ma part)` })).toContainText('-42,00');
});
