import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const reactRouter = (file: string) =>
  fileURLToPath(new URL(`./node_modules/react-router/dist/development/${file}`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      // Under Node's conditions react-router and react-router/dom load as separate CommonJS
      // builds with separate router contexts. Point both at the ESM builds, which share chunks.
      { find: /^react-router$/, replacement: reactRouter('index.mjs') },
      { find: /^react-router\/dom$/, replacement: reactRouter('dom-export.mjs') },
    ],
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
  },
});
