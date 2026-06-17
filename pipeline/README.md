# Phase 1 — Pipeline

Reads Jeff Sackmann's raw ATP CSVs from `data/raw/tennis_atp/` (2000+) and
produces three unified, query-ready Parquet files in `data/built/`.

## Run

```bash
python pipeline/build.py
```

Requires the raw data already fetched (`./fetch_data.sh`) and the deps in
`requirements.txt` (pandas, pyarrow). ATP only — the WTA repo is not touched.

## Outputs

- **`players.parquet`** — player dimension: `player_id`, `name`, `hand`,
  `height`, `ioc`, `dob`. Deduped on `player_id`.
- **`matches.parquet`** — player-long match fact. Each source row (winner/loser
  oriented) is unpivoted into two rows, one per player perspective
  (`player_*` / `opp_*`, plus a `won` flag), so the table has ~2× the source
  rows. Stat columns are detected programmatically by `w_`/`l_` prefix — never
  hardcoded. Includes derived columns: `surface` (NaN → `Unknown`),
  `level_label`, `competition_type`, and `round_order` (raw `round` retained).
- **`rankings.parquet`** — `ranking_date`, `player_id`, `rank`, `points`,
  filtered to players appearing in `matches.parquet`. (Raw column `player` is
  renamed to `player_id`.)

## Gate

`build.py` refuses to write artifacts unless all checks pass: the Fed–Nadal
H2H rebuilt from `matches.parquet` returns 41 (17–24), match rows == 2× source,
`won.sum()` == source match count, and every `player_id`/`opp_id` in matches
exists in `players.parquet`.

# Phase 2 — Aggregates

`aggregate.py` reads the Phase 1 artifacts (read-only) and pre-computes
frontend tables into `data/built/`:

```bash
python pipeline/aggregate.py
```

- **`surface_splits.parquet`** — one row per `(player_id, surface)`: matches,
  wins, losses, win_pct. The hero table.
- **`player_summary.parquet`** — one row per player who appears in matches
  (not the full 66k dim). Totals, first/last match dates, career-high rank and
  its spells/weeks (a new spell starts after a gap > `SPELL_GAP_DAYS`),
  weeks at No.1, tour-level titles, Olympic golds, and primary surface.
- **`h2h.parquet`** — directed head-to-head pairs (both A→B and B→A).
- **`h2h_by_surface.parquet`** (Phase 2.5) — directed head-to-head split by
  surface, built from the player-long match fact (not derived from the
  surfaceless `h2h.parquet`). Gated by reconciling its per-surface sums back to
  `h2h.parquet` for a known pair (Federer–Djokovic: 51 meetings / 23 wins).
- **`surface_palette.json`** — design tokens (surface → hex) for Phase 3.

# Phase 3 data — eras

`era.py` builds **`era_stats.parquet`** (one row per year, 2000+) for the "How
the game changed" view, from `matches.parquet` (match-level rows recovered via
`won == True`):

```bash
python pipeline/era.py
```

Per year: match counts and surface mix (share per surface), `avg_minutes` with
its mandatory `minutes_coverage` (fraction of matches with a recorded time),
and competitive-concentration metrics (`distinct_champions`, `total_titles`,
`titles_by_top_player`). Gated by reconciling per-year surface counts to the
year total and the grand total to 79,299; sample surface-mix and minutes-
coverage are printed for review. No court-pace/speed metric is computed — the
dataset has no such column.

The Phase 2 gate cross-checks internal consistency (surface/h2h sums ==
summary totals), referential integrity against `players.parquet`, the Fed–Nadal
anchor in both directions, and smell tests (Nadal clay > .90, Federer peak == No.1).
