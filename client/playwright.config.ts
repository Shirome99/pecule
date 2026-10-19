import { defineConfig } from '@playwright/test';

// Base dédiée aux tests e2e (ré-initialisée avec le compte démo à chaque lancement).
const API_PORT = 4100;
const WEB_PORT = 5180;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://localhost:${WEB_PORT}`, locale: 'fr-FR', timezoneId: 'Europe/Paris' },
  projects: [
    { name: 'desktop', testIgnore: /pwa\.spec/, use: { browserName: 'chromium', viewport: { width: 1366, height: 900 } } },
    { name: 'mobile', testIgnore: /pwa\.spec/, use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    // PWA : build de production (client/dist) servi par Express, comme en prod
    { name: 'pwa', testMatch: /pwa\.spec/, use: { browserName: 'chromium', baseURL: `http://localhost:${API_PORT}`, viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    {
      command: 'npm run seed && npm start',
      cwd: '../server',
      env: { PORT: String(API_PORT), DB_PATH: 'e2e.db', AUTH_RATE_LIMIT: '1000' },
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      env: { API_PROXY: `http://localhost:${API_PORT}` },
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
