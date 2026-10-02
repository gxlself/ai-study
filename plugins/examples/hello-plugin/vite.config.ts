import { fileURLToPath } from 'node:url';
import type { UserConfig } from 'vite';

export default {
  root: fileURLToPath(new URL('.', import.meta.url)),
  cacheDir: '.cache',
  build: {
    target: 'es2022',
    outDir: 'dist',
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    sourcemap: false,
    minify: false,
    cssCodeSplit: false,
  },
} satisfies UserConfig;
