// Génère les icônes PWA (PNG) depuis public/favicon.svg avec le Chromium de Playwright.
// Usage : npm run icons  (les PNG générés sont versionnés dans public/)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const inner = svg.replace(/^<svg[^>]*>|<\/svg>$/g, '');
const BG = '#123b3a';

// « any » : le favicon tel quel (coins arrondis transparents)
const plain = (size) => svg.replace('<svg ', `<svg width="${size}" height="${size}" `);
// « maskable » / iOS : fond plein et logo dans la zone sûre (80 % centraux)
const fullBleed = (size, scale) => {
  const s = size * scale;
  const o = (size - s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" fill="${BG}"/>
    <svg x="${o}" y="${o}" width="${s}" height="${s}" viewBox="0 0 32 32">${inner}</svg></svg>`;
};

const icons = [
  ['pwa-192x192.png', plain(192), 192],
  ['pwa-512x512.png', plain(512), 512],
  ['maskable-icon-512x512.png', fullBleed(512, 0.7), 512],
  ['apple-touch-icon-180x180.png', fullBleed(180, 0.86), 180],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, markup, size] of icons) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup}</body></html>`);
  await page.locator('svg').first().screenshot({ path: fileURLToPath(new URL(`../public/${name}`, import.meta.url)), omitBackground: true });
  console.log(`public/${name}`);
}
await browser.close();
