import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test-dom.ts'],
    maxWorkers: 1,
    fileParallelism: false,
    isolate: false,
    fsModuleCache: true,
    include: ['src/**/*.test.{ts,tsx}', 'dev/**/*.test.{ts,tsx}'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
