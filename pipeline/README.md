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
