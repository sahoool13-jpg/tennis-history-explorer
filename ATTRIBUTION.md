# Attribution

This project is built on top of publicly available tennis datasets compiled and
maintained by **Jeff Sackmann**.

## Data sources

- **ATP data** — [JeffSackmann/tennis_atp](https://github.com/JeffSackmann/tennis_atp)
- **WTA data** — [JeffSackmann/tennis_wta](https://github.com/JeffSackmann/tennis_wta)

These repositories contain match results, player biographical data, and
historical rankings for the men's (ATP) and women's (WTA) professional tours.

## License & terms

Jeff Sackmann's tennis data is released under the
**Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License
(CC BY-NC-SA 4.0)**.

This means, in short:

- **Attribution** — you must give appropriate credit (this file).
- **NonCommercial** — you may not use the material for commercial purposes.
- **ShareAlike** — if you remix or build upon the material, you must distribute
  your contributions under the same license.

See the upstream repositories for the authoritative license text.

## How this project uses the data

The raw CSVs are downloaded into `data/raw/` (git-ignored — never committed) by
`fetch_data.sh`. The Phase 1 pipeline transforms them into a unified Parquet
store under `data/built/`, which is the only data artifact committed to this
repository. The exact upstream commit used for any build is recorded in
`data_manifest.txt`.

Please support Jeff Sackmann's work — see his site at
<https://www.tennisabstract.com/> for more.
