import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5310,
    strictPort: true,
    proxy: Object.fromEntries(['/api', '/packs', '/plugins'].map((path) => [path, 'http://localhost:4310'])),
  },
  build: { target: 'es2022' },
});
