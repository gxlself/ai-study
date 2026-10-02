import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['scripts/test/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    maxWorkers: 1,
  },
});
