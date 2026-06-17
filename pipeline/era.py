"""Phase 3 data: era_stats.parquet — tour-evolution aggregates for the "How the
game changed" view. ATP, tour-level singles, 2000+.

Built in Python from matches.parquet. matches.parquet is player-long (two rows
per match); match-level rows are recovered by filtering won == True (exactly one
winner row per match, all per-match fields intact). One row per year.

Gate (must pass before writing): per-year surface counts reconcile to the year
total; grand total == 79,299; sample surface-mix + minutes-coverage printed.

Run:  python pipeline/era.py
"""
from pathlib import Path
import sys

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
BUILT = ROOT / "data" / "built"

SURFACES = ["Hard", "Clay", "Grass", "Carpet", "Unknown"]
TOTAL_MATCHES = 79299  # known tour-level singles total (2000+)


def build_era_stats():
    m = pd.read_parquet(BUILT / "matches.parquet")
    m = m[m["won"] == True].copy()  # noqa: E712 -> match-level (one winner row/match)
    m["year"] = pd.to_datetime(m["tourney_date"]).dt.year.astype("int64")

    years = sorted(m["year"].unique())
    rows = []
    for yr in years:
        g = m[m["year"] == yr]
        total = len(g)

        counts = {s: int((g["surface"] == s).sum()) for s in SURFACES}
        shares = {s: counts[s] / total for s in SURFACES}

        minutes = pd.to_numeric(g["minutes"], errors="coerce")
        cov = float(minutes.notna().mean())
        avg_min = float(minutes.dropna().mean()) if minutes.notna().any() else None

        finals = g[(g["round"] == "F") & (g["competition_type"] == "Tour")]
        distinct_champs = int(finals["player_id"].nunique())
        total_titles = int(len(finals))
        titles_by_top = int(finals["player_id"].value_counts().max()) if total_titles else 0

        row = {
            "year": yr,
            "matches": total,
            "avg_minutes": avg_min,
            "minutes_coverage": cov,
            "distinct_champions": distinct_champs,
            "total_titles": total_titles,
            "titles_by_top_player": titles_by_top,
        }
        for s in SURFACES:
            row[f"n_{s}"] = counts[s]
            row[f"share_{s}"] = shares[s]
        rows.append(row)

    cols = (["year", "matches"]
            + [f"n_{s}" for s in SURFACES]
            + [f"share_{s}" for s in SURFACES]
            + ["avg_minutes", "minutes_coverage",
               "distinct_champions", "total_titles", "titles_by_top_player"])
    return pd.DataFrame(rows)[cols]


def run_gate(era):
    print("\n===== PHASE 3 GATE (era_stats) =====")
    ok = True

    # per-year: surface counts sum to the year total
    n_cols = [f"n_{s}" for s in SURFACES]
    surf_sum = era[n_cols].sum(axis=1)
    mismatches = int((surf_sum != era["matches"]).sum())
    c1 = mismatches == 0
    ok &= c1
    print(f"[{'PASS' if c1 else 'FAIL'}] per-year surface counts == matches: "
          f"mismatches={mismatches}")

    # grand total
    grand = int(era["matches"].sum())
    c2 = grand == TOTAL_MATCHES
    ok &= c2
    print(f"[{'PASS' if c2 else 'FAIL'}] total matches all years ({grand}) == {TOTAL_MATCHES}")

    # sample surface mix
    print("\nSurface mix (share) — sample years:")
    print(f"  {'year':>4}  {'Hard':>6} {'Clay':>6} {'Grass':>6} {'Carpet':>6} {'Unknown':>7}  matches")
    for yr in [2002, 2008, 2015, 2023]:
        r = era[era["year"] == yr]
        if r.empty:
            continue
        r = r.iloc[0]
        print(f"  {yr:>4}  {r['share_Hard']*100:5.1f}% {r['share_Clay']*100:5.1f}% "
              f"{r['share_Grass']*100:5.1f}% {r['share_Carpet']*100:5.1f}% "
              f"{r['share_Unknown']*100:6.1f}%  {int(r['matches'])}")

    # minutes coverage — the chart-3 decision input
    print("\nMatch-length data coverage (minutes non-null) — ALL years:")
    print(f"  {'year':>4}  {'coverage':>9}  {'avg_min':>8}")
    for _, r in era.iterrows():
        avg = f"{r['avg_minutes']:.1f}" if pd.notna(r["avg_minutes"]) else "—"
        print(f"  {int(r['year']):>4}  {r['minutes_coverage']*100:7.1f}%  {avg:>8}")

    print(f"\n===== GATE {'PASSED' if ok else 'FAILED'} =====\n")
    return ok


def main():
    era = build_era_stats()
    if not run_gate(era):
        sys.exit("Gate failed — not writing era_stats.parquet.")
    path = BUILT / "era_stats.parquet"
    era.to_parquet(path, index=False)
    size = path.stat().st_size
    print(f"--- era_stats.parquet ---")
    print(f"path: {path.relative_to(ROOT)}")
    print(f"rows: {len(era)} (years {int(era['year'].min())}–{int(era['year'].max())})")
    print(f"size: {size / 1000:.1f} KB")
    print(f"columns ({len(era.columns)}): {list(era.columns)}")


if __name__ == "__main__":
    main()
