import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const demo = loadEnv(mode, process.cwd(), '').VITE_SPROUT_DEMO === '1';
  return {
    base: demo ? '/ai-study/demo/' : './',
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5310,
      strictPort: true,
      proxy: Object.fromEntries(['/api', '/packs', '/plugins'].map((path) => [path, 'http://localhost:4310'])),
    },
    build: {
      target: ['chrome70', 'safari14'],
      cssTarget: ['chrome70', 'safari14'],
    },
  };
});
