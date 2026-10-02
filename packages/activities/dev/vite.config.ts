import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import react from '@vitejs/plugin-react';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  publicDir: false,
  plugins: [
    react(),
    {
      name: 'sprout-local-web-fixture',
      async generateBundle() {
        this.emitFile({
          type: 'asset', fileName: 'assets/web-fixture.html',
          source: await readFile(new URL('./assets/web-fixture.html', import.meta.url), 'utf8'),
        });
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    port: 5312,
    strictPort: true,
    fs: { allow: [searchForWorkspaceRoot(root)] },
  },
  build: { outDir: fileURLToPath(new URL('./dist', import.meta.url)) },
});
