# Tennis History Explorer

An explorer for professional tennis history, built on
[Jeff Sackmann's](https://github.com/JeffSackmann) public ATP and WTA datasets.
Raw CSVs are transformed into a unified columnar store and queried directly in
the browser with DuckDB-wasm — no backend required.

## Project layout

```
tennis-history-explorer/
├── data/
│   ├── raw/          # git-ignored — Sackmann's CSVs live here (via fetch_data.sh)
│   └── built/        # output artifact (Parquet) — committed
├── pipeline/         # Phase 1 — CSV → unified store
├── web/              # Phase 3 — DuckDB-wasm frontend
├── notebooks/        # Phase 0 exploration (deleted once the pipeline stabilizes)
├── fetch_data.sh     # downloads upstream CSVs into data/raw/
├── data_manifest.txt # what was fetched + when + upstream commit hash
├── requirements.txt  # pandas, duckdb, pyarrow
├── ATTRIBUTION.md     # data source & license credit
└── README.md
```

## Phases

- **Phase 0 — Exploration** (`notebooks/`): poke at the raw data, understand its
  shape and quirks. Throwaway; deleted once the pipeline is settled.
- **Phase 1 — Pipeline** (`pipeline/`): read the raw CSVs and produce a single
  unified, query-ready Parquet store under `data/built/`.
- **Phase 3 — Web** (`web/`): a DuckDB-wasm frontend that loads the built
  Parquet artifact and lets you explore tennis history entirely client-side.

## Getting started

1. **Set up a Python environment** and install dependencies:

   ```bash
   python -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Fetch the raw data** (downloads into `data/raw/`, which is git-ignored):

   ```bash
   ./fetch_data.sh
   ```

   This also records the upstream commit hashes in `data_manifest.txt` for
   reproducibility.

3. **Build the unified store** (Phase 1 — not yet implemented):

   ```bash
   # see pipeline/
   ```

4. **Run the explorer** (Phase 3 — not yet implemented):

   ```bash
   # see web/
   ```

## Data & attribution

All tennis data is © Jeff Sackmann and released under CC BY-NC-SA 4.0. See
[ATTRIBUTION.md](ATTRIBUTION.md) for full credit and license details. The raw
data is never committed; only the built Parquet artifact under `data/built/` is.

## Status

This repository is currently **scaffolding only**. `fetch_data.sh` is ready to
run, but the `pipeline/` and `web/` phases are empty stubs awaiting
implementation.
