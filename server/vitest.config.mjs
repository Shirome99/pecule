import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: { DB_PATH: ':memory:', NODE_ENV: 'test', AUTH_RATE_LIMIT: '10000' },
    include: ['test/**/*.test.js'],
  },
});
