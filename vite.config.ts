import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  build: {
    sourcemap: 'hidden',
    outDir: 'dist',
  },
  plugins: [react({
    babel: {
      plugins: ['react-dev-locator'],
    },
  }), tsconfigPaths(), cloudflare()],
  server: {
    port: 5173,
    // Proxy API + WebSocket to the backend during development.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7999',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:7999',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});