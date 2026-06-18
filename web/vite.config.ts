import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Served at the root of the custom domain (unforcederror.app), so assets and
// data resolve from '/'. The CNAME in public/ is copied to dist/ to keep the
// custom domain attached across Actions deploys.
export default defineConfig({
  base: '/',
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
