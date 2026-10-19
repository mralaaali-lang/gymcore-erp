import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // 9000 is the project's one and only frontend port — `npm run dev` here, and
  // the nginx container from docker-compose.yml (`9000:80`). `preview` is pinned
  // to it too: left unset, Vite serves the static build on its own default 4173,
  // which looks like a different app on a different port.
  preview: {
    host: '0.0.0.0',
    port: 9000,
  },
  server: {
    host: '0.0.0.0',
    port: 9000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/platform': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
