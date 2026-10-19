import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: { DB_PATH: ':memory:', NODE_ENV: 'test' },
    include: ['test/**/*.test.js'],
  },
});
