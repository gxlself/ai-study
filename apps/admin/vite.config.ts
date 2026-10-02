import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5311,
    strictPort: true,
    proxy: Object.fromEntries(
      ['/api', '/packs', '/plugins'].map((path) => [
        path,
        { target: process.env.SPROUT_API_TARGET || 'http://localhost:4310', changeOrigin: true },
      ]),
    ),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/\/(?:antd|@ant-design|@rc-component)\//.test(id)) return 'ui';
          if (/\/(?:react|react-dom|react-router)\//.test(id)) return 'react';
        },
      },
    },
  },
});
