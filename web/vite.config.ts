import { defineConfig } from 'vite';

// base must match the GitHub Pages project path so deployed asset URLs resolve.
export default defineConfig({
  base: '/tennis-history-explorer/',
  // duckdb-wasm ships its own wasm/worker; let Vite serve them via ?url imports
  // rather than trying to pre-bundle them.
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm'],
  },
});
