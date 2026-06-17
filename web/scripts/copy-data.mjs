import { mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Copies the Phase 1/2 Parquet artifacts + palette from the single source of
// truth (../data/built) into web/public/data so they're served identically in
// dev and in the production build. public/data is git-ignored — we never
// duplicate the committed artifacts into the web app.
const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..', 'data', 'built');
const dest = join(here, '..', 'public', 'data');

mkdirSync(dest, { recursive: true });
// Only the artifacts the frontend actually queries (the aggregates + rankings
// for the career arc) plus the palette. matches/players stay out of the app.
const WANTED = new Set([
  'surface_splits.parquet',
  'player_summary.parquet',
  'h2h.parquet',
  'h2h_by_surface.parquet',
  'matches.parquet', // per-meeting fact, for the rivalry timeline
  'rankings.parquet',
  'era_stats.parquet', // tour-evolution aggregates for the eras view
  'match_scores.parquet', // Step 0 structured scores, for Match Point
  'mp_player_stats.parquet', // Match Point per-player aggregates
  'mp_match_facts.parquet', // Match Point per-match derived flags
  'surface_palette.json',
]);
let n = 0;
for (const f of readdirSync(src).filter((f) => WANTED.has(f))) {
  copyFileSync(join(src, f), join(dest, f));
  console.log('copied', f);
  n++;
}
console.log(`copy-data: ${n} files -> public/data`);
