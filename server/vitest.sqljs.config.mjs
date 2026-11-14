import { defineConfig } from 'vitest/config';

// Rejoue toute la suite d'API sur sql.js (la base embarquée de l'app mobile) au lieu de better-sqlite3.
// Prérequis : dépendances du client installées (cd client && npm ci).
export default defineConfig({
  test: {
    env: { DB_PATH: ':memory:', NODE_ENV: 'test', AUTH_RATE_LIMIT: '10000' },
    include: ['test/**/*.test.js', 'test-sqljs/**/*.test.js'],
    setupFiles: ['test/sqljs-setup.mjs'],
  },
});
