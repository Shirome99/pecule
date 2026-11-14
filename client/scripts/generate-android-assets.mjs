// Génère les icônes et l'écran de démarrage Android depuis public/favicon.svg (Chromium de Playwright, comme
// generate-icons.mjs) et règle les couleurs de l'icône adaptative et du démarrage Android 12+.
// Usage : npm run icons:android   (les images générées sont versionnées dans android/)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const BG = '#123b3a';
const res = (p) => fileURLToPath(new URL(`../android/app/src/main/res/${p}`, import.meta.url));
const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
// les barres seules (sans le carré de fond)
const bars = svg.replace(/^<svg[^>]*>|<\/svg>$/g, '').replace(/<rect width="32" height="32"[^>]*\/>/, '');

/** Logo (barres) centré sur une toile, à `scale` du plus petit côté ; fond plein, rond ou transparent. */
function canvas(w, h, scale, background) {
  const s = Math.min(w, h) * scale;
  const bg = background === 'round'
    ? `<circle cx="${w / 2}" cy="${h / 2}" r="${w / 2}" fill="${BG}"/>`
    : background === 'rounded'
      ? `<rect width="${w}" height="${h}" rx="${w * 0.22}" fill="${BG}"/>`
      : background === 'full' ? `<rect width="${w}" height="${h}" fill="${BG}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${bg}
    <svg x="${(w - s) / 2}" y="${(h - s) / 2}" width="${s}" height="${s}" viewBox="4 4 24 24">${bars}</svg></svg>`;
}

const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const images = [];
for (const [d, k] of Object.entries(densities)) {
  images.push([`mipmap-${d}/ic_launcher.png`, canvas(48 * k, 48 * k, 0.62, 'rounded')]);
  images.push([`mipmap-${d}/ic_launcher_round.png`, canvas(48 * k, 48 * k, 0.56, 'round')]);
  // icône adaptative : 108 dp dont 66 dp visibles au centre ; le fond est une couleur (values/ic_launcher_background.xml)
  images.push([`mipmap-${d}/ic_launcher_foreground.png`, canvas(108 * k, 108 * k, 0.4, 'none')]);
}
const splash = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
for (const [d, [w, h]] of Object.entries(splash)) {
  images.push([`drawable-port-${d}/splash.png`, canvas(w, h, 0.28, 'full')]);
  images.push([`drawable-land-${d}/splash.png`, canvas(h, w, 0.28, 'full')]);
}
images.push(['drawable/splash.png', canvas(480, 320, 0.28, 'full')]);

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [path, markup] of images) {
  const [, w, h] = markup.match(/width="([\d.]+)" height="([\d.]+)"/);
  await page.setViewportSize({ width: Math.round(w), height: Math.round(h) });
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup}</body></html>`);
  await page.locator('svg').first().screenshot({ path: res(path), omitBackground: true });
}
await browser.close();
console.log(`${images.length} images Android générées`);

// couleurs : fond de l'icône adaptative, barre d'état du thème, démarrage Android 12+
writeFileSync(res('values/ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`);
const styles = res('values/styles.xml');
let xml = readFileSync(styles, 'utf8');
if (!xml.includes('windowSplashScreenBackground')) {
  xml = xml.replace(
    '<item name="android:background">@drawable/splash</item>',
    `<item name="android:background">@drawable/splash</item>
        <item name="windowSplashScreenBackground">${BG}</item>
        <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher_foreground</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>`,
  );
  writeFileSync(styles, xml);
}
const colors = res('values/colors.xml');
try {
  writeFileSync(colors, readFileSync(colors, 'utf8')
    .replace(/(name="colorPrimary">)[^<]+/, `$1${BG}`)
    .replace(/(name="colorPrimaryDark">)[^<]+/, `$1${BG}`)
    .replace(/(name="colorAccent">)[^<]+/, '$1#d9902f'));
} catch { /* pas de colors.xml : les couleurs du thème restent celles de Capacitor */ }
