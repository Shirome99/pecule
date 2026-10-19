import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { goTo, loginDemo } from './helpers';

test('sans clé API sur le serveur, aucun bouton IA n’est affiché', async ({ page }) => {
  await loginDemo(page);
  await expect(page.getByRole('button', { name: 'Poser une question' })).toHaveCount(0);
  await page.getByRole('button', { name: /Nouvelle opération/ }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /Scanner un ticket/ })).toHaveCount(0);
});

test('ticket en photo (API simulée) : consentement, puis formulaire prérempli sans enregistrement', async ({ page }) => {
  let consented = false;
  let receiptBody: { image?: string; media_type?: string } = {};
  await page.route('**/api/ai/status', (r) => r.fulfill({ json: { enabled: true, consented, remaining: 20, daily_limit: 20 } }));
  await page.route('**/api/ai/consent', (r) => { consented = true; return r.fulfill({ json: { consented: true } }); });
  await page.route('**/api/ai/receipt', (r) => {
    receiptBody = r.request().postDataJSON();
    return r.fulfill({ json: { amount: 23.4, date: '2026-10-12', merchant: 'Monoprix', category_id: null } });
  });
  await loginDemo(page);
  await expect(page.getByRole('button', { name: 'Poser une question' })).toBeVisible();

  await page.getByRole('button', { name: /Nouvelle opération/ }).click();
  const form = page.getByRole('dialog', { name: 'Nouvelle opération' });
  await form.getByRole('button', { name: /Scanner un ticket/ }).click();
  await expect(form).toContainText('Tes données financières concernées sont envoyées à Anthropic pour générer la réponse.');
  const chooser = page.waitForEvent('filechooser');
  await form.getByRole('button', { name: "J'accepte" }).click();
  await (await chooser).setFiles(join(import.meta.dirname, '..', 'public', 'pwa-512x512.png'));

  await expect(form.getByRole('status')).toContainText('vérifie avant d’ajouter');
  await expect(form.getByLabel('Montant')).toHaveValue('23,4');
  await expect(form.getByLabel('Libellé')).toHaveValue('Monoprix');
  await expect(form.getByLabel('Date')).toHaveValue('2026-10-12');
  // l'image envoyée est redimensionnée (512 px ici) en JPEG
  expect(receiptBody.media_type).toBe('image/jpeg');
  expect(receiptBody.image?.length).toBeGreaterThan(1000);

  // rien n'est enregistré tant qu'on ne clique pas sur « Ajouter »
  await form.getByRole('button', { name: 'Fermer' }).click();
  await goTo(page, 'Opérations');
  await expect(page.getByRole('button', { name: /Monoprix/ }).filter({ hasText: '23,40' })).toHaveCount(0);
});
