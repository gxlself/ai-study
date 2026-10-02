import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: fileURLToPath(new URL('.', import.meta.url)),
    include: ['*.test.ts'],
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://localhost:5312/' } },
    restoreMocks: true,
    unstubGlobals: true,
  },
});
