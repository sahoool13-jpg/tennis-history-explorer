# Phase 3 — Web app

A client-side explorer for the built ATP artifacts. **Vite + vanilla TS**,
**DuckDB-wasm** for all data access, **Observable Plot** for charts. No backend —
everything runs in the browser.

## Run

```bash
cd web
npm install
npm run dev      # http://localhost:5173/tennis-history-explorer/
npm run build    # type-check + production build into dist/
npm run preview  # serve the production build
```

`predev`/`prebuild` copy the four artifacts (`surface_splits`, `player_summary`,
`h2h`, `rankings`) plus `surface_palette.json` from `../data/built` into
`public/data`. That copy is the only place the app reads data from — the single
source of truth stays in `data/built` and is never duplicated into git
(`web/public/data` is git-ignored).

## Architecture

- **`src/db.ts`** — the single DuckDB-wasm data path. Initializes the engine once
  using the official Vite manual-bundle pattern (`?url` imports so Vite serves
  the wasm + worker with correct MIME), registers the four Parquet files as
  HTTP-backed views, and exposes typed query functions. No view touches DuckDB
  directly. The 1.2M-row `rankings` table is live-sliced by `player_id` for the
  career arc.
- **`src/palette.ts`** — loads `surface_palette.json` once; the single source of
  surface colours. No surface colour is hardcoded anywhere else.
- **`src/router.ts`** — hash routing (`#/`, `#/player/:id`, `#/h2h/:a/:b`) so
  player and H2H state live in shareable URLs and work on GitHub Pages with no
  server rewrites.
- **`src/views/`** — `search`, `player`, `h2h`. **`src/components/`** —
  `searchBox`, `surfaceSplit` (the hero), `careerArc`.

## Config notes

- `vite.config.ts` sets `base: '/tennis-history-explorer/'` for the eventual
  Pages deploy, and excludes `@duckdb/duckdb-wasm` from dep pre-bundling.
- The build emits both DuckDB bundles (mvp + eh ~73 MB of wasm); `selectBundle`
  picks one at runtime based on browser features.

## Status

Functional pass: correct data, correct architecture, three views rendering real
data. Visual polish is a deliberate next step — this pass keeps styling neutral.
