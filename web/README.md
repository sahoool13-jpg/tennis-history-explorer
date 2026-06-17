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

## Match Point (companion site)

A second front door in the same app: **Match Point** (`matchpoint.html` →
`src/matchpoint.ts`), the matches-focused companion to Rally — tennis read by
the scoreline. It reuses the shared design system (`styles.css` tokens, fonts,
`motion.ts`) so it is clearly the same family, but has its own wordmark, its own
accent (the deciding-point crimson, never a surface colour), its own tagline
("Tennis, by the scoreline"), and cross-links to Rally (and Rally back to it).
`vite.config.ts` declares both `index.html` and `matchpoint.html` as build
inputs.

Match Point's views (`src/mpviews.ts`, built from the `src/mpkit.ts` UI kit)
read the verified `match_scores.parquet` joined to `matches.parquet` for context
and the gated `mp_player_stats` / `mp_match_facts` aggregates — **no score is
re-parsed in the browser**. `db.ts` gained additive table registrations and
query functions only. The views:

- **Blowouts** — most lopsided completed matches (fewest games conceded) +
  most bagels / breadsticks dished (min 50 matches, shown).
- **Marathons** — longest completed matches by plausible minutes + a
  match-length distribution with per-surface minutes coverage shown (honesty
  rule: minutes depend on recording).
- **Tiebreaks** — most tiebreaks played (min 50 matches) + best tiebreak win
  rate (min 100 tiebreaks, shown).
- **Comebacks** — best-of-5 matches won from two sets down.
- **Retirements** — its own slice (most retired; most wins by opponent
  retirement), kept out of every completed-match board.

Completed-match boards use the `is_completed` flag, so retirements/walkovers
never leak in; player names cross-link to Rally player pages.

## Status

Functional pass: correct data, correct architecture, three views rendering real
data. Visual polish is a deliberate next step — this pass keeps styling neutral.
