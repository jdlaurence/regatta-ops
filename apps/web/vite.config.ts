import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// PocketBase listens on 127.0.0.1:8090 in development (`pnpm pb:serve`). The dev server proxies
// its API and admin UI so the app and PocketBase share one origin, as in production, where
// PocketBase serves the built app from backend/pb_public/.
const POCKETBASE = 'http://127.0.0.1:8090';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: POCKETBASE, changeOrigin: true },
      '/_': { target: POCKETBASE, changeOrigin: true },
    },
  },
  build: {
    outDir: '../../backend/pb_public',
    emptyOutDir: true,
    sourcemap: true,
  },
});
