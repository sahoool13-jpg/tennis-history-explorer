import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// base must match the GitHub Pages project path so deployed asset URLs resolve.
export default defineConfig({
  base: '/tennis-history-explorer/',
  // duckdb-wasm ships its own wasm/worker; let Vite serve them via ?url imports
  // rather than trying to pre-bundle them.
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm'],
  },
  build: {
    rollupOptions: {
      // Two front doors in one repo: Rally (index.html) and its companion
      // Match Point (matchpoint.html). Both share the src/ design system.
      input: {
        main: resolve(__dirname, 'index.html'),
        matchpoint: resolve(__dirname, 'matchpoint.html'),
      },
    },
  },
});
