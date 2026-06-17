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

# Phase 2.6 data — structured scores (Match Point)

`parse_scores.py` reads `matches.parquet` and turns the free-text `score` string
into structured per-match data, written to **`match_scores.parquet`** (one row
per match, keyed by `match_id`). It is the load-bearing artifact for the **Match
Point** site (matches read by their scoreline).

```bash
python pipeline/parse_scores.py
```

Per match it extracts: `sets_won_winner`/`sets_won_loser`,
`games_won_winner`/`games_won_loser` (total across sets), `num_tiebreaks`,
`num_match_tiebreaks`, `bagels_winner`/`bagels_loser` (6–0 sets won/lost),
`breadsticks_winner`/`breadsticks_loser` (6–1), per-set detail as JSON
(`sets_detail`: games, tiebreak flag, tiebreak loser points, match-tiebreak
flag) plus a compact `set_scores` string, and status flags `is_retirement`,
`is_walkover`, `is_default`, `is_incomplete`, `is_completed`, `is_unparseable`.

Handling rules:
- The raw score is winner-first per set (`winner_games-loser_games`).
- Status outcomes (RET / W/O / DEF / "played and abandoned/unfinished") are
  **flagged, never forced into a games count**. A walkover with no games keeps
  null counts; a retirement keeps the real partial games actually played.
- A deciding match/super-tiebreak (bracketed, e.g. `[10-8]`) is credited to the
  match winner — the brackets are not reliably winner-first in the source.
- A score we cannot parse, or a clean-status score where the winner did not win
  more sets, is flagged `is_unparseable` with null numeric fields — **never
  guessed or silently zeroed**.

Gate (must pass before writing): parse coverage (total / completed / flagged /
unparseable, with the unparseable %), known-match spot checks (2008 RG final
straight sets + bagel, Isner–Mahut tiebreaks & 92–91 games, a retirement), an
internal-consistency assertion that **every completed match has winner
sets_won > loser sets_won** (violations printed), and a row reconciliation to
79,299 unique `match_id`s.
