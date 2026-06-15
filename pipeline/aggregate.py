"""Phase 2 pipeline: pre-compute frontend aggregate tables from Phase 1 artifacts.

Reads data/built/{matches,players,rankings}.parquet and writes:

    surface_splits.parquet   - one row per (player_id, surface)
    player_summary.parquet   - one row per player who appears in matches
    h2h.parquet              - directed head-to-head pairs
    surface_palette.json     - design tokens for Phase 3

ATP only. Phase 1 artifacts (including rankings.parquet) are read-only here.

Run:  python pipeline/aggregate.py
"""
from pathlib import Path
import json
import sys

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
BUILT = ROOT / "data" / "built"

# A new career-high "spell" starts when the gap between consecutive weeks spent
# at the career-high rank exceeds this many days. Tunable.
SPELL_GAP_DAYS = 14

SURFACE_PALETTE = {
    "Hard":    "#3B7DD8",
    "Clay":    "#D9763C",
    "Grass":   "#4E9A51",
    "Carpet":  "#8E7CA3",
    "Unknown": "#AEB4BA",
}


def load_inputs():
    matches = pd.read_parquet(BUILT / "matches.parquet")
    players = pd.read_parquet(BUILT / "players.parquet")
    rankings = pd.read_parquet(BUILT / "rankings.parquet")
    # normalize date columns to Timestamps for reliable min/max/arithmetic
    matches["tourney_date"] = pd.to_datetime(matches["tourney_date"])
    rankings["ranking_date"] = pd.to_datetime(rankings["ranking_date"])
    return matches, players, rankings


# --------------------------------------------------------------------------- #
# 1) surface_splits.parquet
# --------------------------------------------------------------------------- #
def build_surface_splits(matches):
    g = matches.groupby(["player_id", "surface"], dropna=False)
    ss = g.agg(
        player_name=("player_name", "first"),
        matches=("won", "size"),
        wins=("won", "sum"),
    ).reset_index()
    ss["wins"] = ss["wins"].astype("int64")
    ss["losses"] = ss["matches"] - ss["wins"]
    ss["win_pct"] = ss["wins"] / ss["matches"]
    return ss[["player_id", "player_name", "surface",
               "matches", "wins", "losses", "win_pct"]]


# --------------------------------------------------------------------------- #
# career-high helpers (from rankings)
# --------------------------------------------------------------------------- #
def count_spells(dates):
    """Number of non-contiguous runs; a gap > SPELL_GAP_DAYS starts a new spell."""
    d = sorted(set(dates))
    if not d:
        return 0
    spells = 1
    for prev, cur in zip(d, d[1:]):
        if (cur - prev).days > SPELL_GAP_DAYS:
            spells += 1
    return spells


def build_career_high(rankings):
    r = rankings.dropna(subset=["rank"]).copy()

    career_high = r.groupby("player_id")["rank"].min().rename("career_high_rank")

    peak = r.merge(career_high, on="player_id")
    peak = peak[peak["rank"] == peak["career_high_rank"]]
    pg = peak.groupby("player_id")["ranking_date"]
    ch = pd.DataFrame({
        "career_high_rank": career_high,
        "weeks_at_career_high": pg.nunique(),
        "career_high_first_date": pg.min(),
        "career_high_last_date": pg.max(),
        "career_high_spells": pg.apply(count_spells),
    })

    no1 = r[r["rank"] == 1].groupby("player_id")["ranking_date"].nunique()
    ch["weeks_at_no1"] = no1
    ch["weeks_at_no1"] = ch["weeks_at_no1"].fillna(0).astype("int64")
    return ch


# --------------------------------------------------------------------------- #
# 2) player_summary.parquet
# --------------------------------------------------------------------------- #
def build_player_summary(matches, players, rankings, surface_splits):
    base = matches.groupby("player_id").agg(
        player_name=("player_name", "first"),
        total_matches=("won", "size"),
        total_wins=("won", "sum"),
        first_match_date=("tourney_date", "min"),
        last_match_date=("tourney_date", "max"),
    )
    base["total_wins"] = base["total_wins"].astype("int64")
    base["win_pct"] = base["total_wins"] / base["total_matches"]

    # titles: tour-level final wins (Davis Cup excluded). Olympic golds separate.
    title_mask = (matches["won"]) & (matches["round"] == "F") & \
                 (matches["competition_type"] == "Tour")
    titles = matches[title_mask].groupby("player_id").size().rename("titles")

    gold_mask = (matches["won"]) & (matches["round"] == "F") & \
                (matches["competition_type"] == "Olympics")
    golds = matches[gold_mask].groupby("player_id").size().rename("olympic_golds")

    # primary surface = surface with most matches for that player
    primary = (
        surface_splits.sort_values(["player_id", "matches"], ascending=[True, False])
        .drop_duplicates("player_id")
        .set_index("player_id")["surface"]
        .rename("primary_surface")
    )

    ch = build_career_high(rankings)
    pdim = players.set_index("player_id")[["ioc", "hand"]]

    s = base.join([titles, golds, primary, ch, pdim])
    s["titles"] = s["titles"].fillna(0).astype("int64")
    s["olympic_golds"] = s["olympic_golds"].fillna(0).astype("int64")
    s["weeks_at_no1"] = s["weeks_at_no1"].fillna(0).astype("int64")
    s["weeks_at_career_high"] = s["weeks_at_career_high"].fillna(0).astype("int64")
    s["career_high_spells"] = s["career_high_spells"].fillna(0).astype("int64")
    s = s.reset_index()

    cols = [
        "player_id", "player_name", "ioc", "hand",
        "total_matches", "total_wins", "win_pct",
        "first_match_date", "last_match_date",
        "career_high_rank", "career_high_first_date", "career_high_last_date",
        "weeks_at_career_high", "career_high_spells", "weeks_at_no1",
        "titles", "olympic_golds", "primary_surface",
    ]
    return s[cols]


# --------------------------------------------------------------------------- #
# 3) h2h.parquet
# --------------------------------------------------------------------------- #
def build_h2h(matches):
    g = matches.groupby(["player_id", "opp_id"])
    h = g.agg(
        opp_name=("opp_name", "first"),
        meetings=("won", "size"),
        player_wins=("won", "sum"),
        last_meeting_date=("tourney_date", "max"),
    ).reset_index()
    h["player_wins"] = h["player_wins"].astype("int64")
    h["opp_wins"] = h["meetings"] - h["player_wins"]
    return h[["player_id", "opp_id", "opp_name",
              "meetings", "player_wins", "opp_wins", "last_meeting_date"]]


# --------------------------------------------------------------------------- #
# dates -> date (match Phase 1 storage)
# --------------------------------------------------------------------------- #
def dates_to_date(df, cols):
    for c in cols:
        df[c] = df[c].dt.date
    return df


# --------------------------------------------------------------------------- #
# gate
# --------------------------------------------------------------------------- #
def run_gate(players, surface_splits, player_summary, h2h):
    print("\n===== PHASE 2 GATE =====")
    ok = True
    ps = player_summary.set_index("player_id")

    # internal consistency: surface_splits.matches sum == total_matches
    ss_sum = surface_splits.groupby("player_id")["matches"].sum()
    d1 = (ss_sum.reindex(ps.index).fillna(0).astype("int64")
          - ps["total_matches"].astype("int64"))
    m1 = int((d1 != 0).sum())
    ok &= (m1 == 0)
    print(f"[{'PASS' if m1 == 0 else 'FAIL'}] surface_splits matches sum == "
          f"total_matches: mismatches={m1}")

    # internal consistency: h2h meetings/wins sums == totals
    h_meet = h2h.groupby("player_id")["meetings"].sum()
    h_win = h2h.groupby("player_id")["player_wins"].sum()
    d2 = (h_meet.reindex(ps.index).fillna(0).astype("int64")
          - ps["total_matches"].astype("int64"))
    d3 = (h_win.reindex(ps.index).fillna(0).astype("int64")
          - ps["total_wins"].astype("int64"))
    m2, m3 = int((d2 != 0).sum()), int((d3 != 0).sum())
    ok &= (m2 == 0 and m3 == 0)
    print(f"[{'PASS' if m2 == 0 else 'FAIL'}] h2h meetings sum == total_matches: "
          f"mismatches={m2}")
    print(f"[{'PASS' if m3 == 0 else 'FAIL'}] h2h player_wins sum == total_wins: "
          f"mismatches={m3}")

    # referential integrity: all player_ids exist in players.parquet
    pid_set = set(players["player_id"].dropna().tolist())
    for name, df, col in [
        ("surface_splits", surface_splits, "player_id"),
        ("player_summary", player_summary, "player_id"),
        ("h2h.player_id", h2h, "player_id"),
        ("h2h.opp_id", h2h, "opp_id"),
    ]:
        missing = set(df[col].dropna().tolist()) - pid_set
        ok &= (len(missing) == 0)
        print(f"[{'PASS' if not missing else 'FAIL'}] {name} ids in players: "
              f"missing={len(missing)}")

    # external anchor: Fed-Nadal off h2h.parquet (both directions)
    fed, nad = 103819, 104745
    fn = h2h[(h2h["player_id"] == fed) & (h2h["opp_id"] == nad)].iloc[0]
    nf = h2h[(h2h["player_id"] == nad) & (h2h["opp_id"] == fed)].iloc[0]
    a1 = (int(fn["meetings"]) == 41 and int(fn["player_wins"]) == 17)
    a2 = (int(nf["meetings"]) == 41 and int(nf["player_wins"]) == 24)
    ok &= (a1 and a2)
    print(f"[{'PASS' if a1 else 'FAIL'}] h2h Fed->Nadal: meetings="
          f"{int(fn['meetings'])} (exp 41), player_wins={int(fn['player_wins'])} (exp 17)")
    print(f"[{'PASS' if a2 else 'FAIL'}] h2h Nadal->Fed: meetings="
          f"{int(nf['meetings'])} (exp 41), player_wins={int(nf['player_wins'])} (exp 24)")

    # smell test: Nadal clay win_pct
    nadal_clay = surface_splits[
        (surface_splits["player_id"] == nad) & (surface_splits["surface"] == "Clay")
    ]["win_pct"].iloc[0]
    a3 = nadal_clay > 0.90
    ok &= a3
    print(f"[{'PASS' if a3 else 'FAIL'}] Nadal Clay win_pct={nadal_clay:.4f} (> 0.90)")

    # smell test: Federer career-high cross-checks
    f = ps.loc[fed]
    chr_ = f["career_high_rank"]
    wch = int(f["weeks_at_career_high"])
    wn1 = int(f["weeks_at_no1"])
    a4 = (chr_ == 1)
    a5 = (wn1 > 0)
    a6 = (wch == wn1)
    a7 = (f["career_high_last_date"] >= f["career_high_first_date"])
    a8 = (int(f["career_high_spells"]) >= 1)
    ok &= all([a4, a5, a6, a7, a8])
    print(f"[{'PASS' if a4 else 'FAIL'}] Federer career_high_rank={chr_} (== 1)")
    print(f"[{'PASS' if a5 else 'FAIL'}] Federer weeks_at_no1={wn1} (> 0)")
    print(f"[{'PASS' if a6 else 'FAIL'}] Federer weeks_at_career_high({wch}) "
          f"== weeks_at_no1({wn1})")
    print(f"[{'PASS' if a7 else 'FAIL'}] Federer career_high_last_date "
          f"({f['career_high_last_date']}) >= first ({f['career_high_first_date']})")
    print(f"[{'PASS' if a8 else 'FAIL'}] Federer career_high_spells="
          f"{int(f['career_high_spells'])} (>= 1)")
    print(f"       Federer (print-only): weeks_at_career_high={wch}, "
          f"career_high_spells={int(f['career_high_spells'])}, "
          f"titles={int(f['titles'])}, olympic_golds={int(f['olympic_golds'])}")

    print(f"===== GATE {'PASSED' if ok else 'FAILED'} =====\n")
    return ok


def describe(name, df, path):
    size = path.stat().st_size
    print(f"\n--- {name} ---")
    print(f"path: {path.relative_to(ROOT)}")
    print(f"rows: {len(df)}")
    print(f"size: {size / 1_000_000:.2f} MB ({size} bytes)")
    print(f"columns ({len(df.columns)}): {list(df.columns)}")


def main():
    matches, players, rankings = load_inputs()

    surface_splits = build_surface_splits(matches)
    player_summary = build_player_summary(matches, players, rankings, surface_splits)
    h2h = build_h2h(matches)

    if not run_gate(players, surface_splits, player_summary, h2h):
        sys.exit("Gate failed — not writing artifacts.")

    # convert date columns back to date for storage (consistent with Phase 1)
    player_summary = dates_to_date(
        player_summary,
        ["first_match_date", "last_match_date",
         "career_high_first_date", "career_high_last_date"],
    )
    h2h = dates_to_date(h2h, ["last_meeting_date"])

    ss_path = BUILT / "surface_splits.parquet"
    ps_path = BUILT / "player_summary.parquet"
    h_path = BUILT / "h2h.parquet"
    palette_path = BUILT / "surface_palette.json"

    surface_splits.to_parquet(ss_path, index=False)
    player_summary.to_parquet(ps_path, index=False)
    h2h.to_parquet(h_path, index=False)
    with open(palette_path, "w") as fh:
        json.dump(SURFACE_PALETTE, fh, indent=2)
        fh.write("\n")

    describe("surface_splits.parquet", surface_splits, ss_path)
    describe("player_summary.parquet", player_summary, ps_path)
    describe("h2h.parquet", h2h, h_path)
    print(f"\n--- surface_palette.json ---")
    print(f"path: {palette_path.relative_to(ROOT)}")
    print(f"size: {palette_path.stat().st_size} bytes")
    print(f"keys: {list(SURFACE_PALETTE.keys())}")


if __name__ == "__main__":
    main()
