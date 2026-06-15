"""Phase 1 pipeline: build unified ATP Parquet artifacts from Jeff Sackmann's raw CSVs.

ATP only, 2000+. Reads from data/raw/tennis_atp/ and writes three Parquet files
to data/built/:

    players.parquet   - player dimension
    matches.parquet   - player-long match fact (each source row -> two rows)
    rankings.parquet  - rankings (filtered to players appearing in matches)

Stat columns are detected by prefix (w_ / l_), never hardcoded from memory.

Run:  python pipeline/build.py
"""
from pathlib import Path
import glob
import sys

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "tennis_atp"
BUILT = ROOT / "data" / "built"

# Derived-column lookups (per the Phase 1 spec).
LEVEL_LABEL = {
    "G": "Grand Slam",
    "M": "Masters 1000",
    "A": "ATP Tour",
    "F": "Tour Finals",
    "D": "Davis Cup",
    "O": "Olympics",
}
COMPETITION_TYPE = {
    "G": "Tour", "M": "Tour", "A": "Tour", "F": "Tour",
    "D": "Davis Cup",
    "O": "Olympics",
}
ROUND_ORDER = {"R128": 1, "R64": 2, "R32": 3, "R16": 4, "QF": 5, "SF": 6, "F": 7}
SURFACES = {"Hard", "Clay", "Grass", "Carpet", "Unknown"}


def parse_date(series):
    """YYYYMMDD (int or str) -> python date, null-safe (invalid -> NaT)."""
    return pd.to_datetime(series, format="%Y%m%d", errors="coerce").dt.date


def to_int(series):
    """Coerce to nullable Int64 (null-safe)."""
    return pd.to_numeric(series, errors="coerce").astype("Int64")


# --------------------------------------------------------------------------- #
# players.parquet
# --------------------------------------------------------------------------- #
def build_players():
    p = pd.read_csv(RAW / "atp_players.csv", low_memory=False)
    p = p.drop_duplicates(subset="player_id")

    name = (
        p["name_first"].fillna("").astype(str).str.strip()
        + " "
        + p["name_last"].fillna("").astype(str).str.strip()
    ).str.strip()

    return pd.DataFrame(
        {
            "player_id": to_int(p["player_id"]),
            "name": name,
            "hand": p["hand"],
            "height": to_int(p["height"]),
            "ioc": p["ioc"],
            "dob": parse_date(p["dob"]),
        }
    )


# --------------------------------------------------------------------------- #
# matches.parquet
# --------------------------------------------------------------------------- #
def detect_stat_pairs(df):
    """Pair w_<stat> with l_<stat> by prefix. Returns list of stat names."""
    w_stats = [c[len("w_"):] for c in df.columns if c.startswith("w_")]
    pairs = [s for s in w_stats if f"l_{s}" in df.columns]
    unmatched = [s for s in w_stats if f"l_{s}" not in df.columns]
    if unmatched:
        print(f"WARNING: w_ stats without l_ counterpart (skipped): {unmatched}")
    return pairs


def _perspective_frame(df, stat_names, won):
    """Build one player-perspective frame (winner-oriented if won, else loser)."""
    me, opp = ("winner", "loser") if won else ("loser", "winner")
    my_pre, opp_pre = ("w_", "l_") if won else ("l_", "w_")

    data = {
        # shared context (carried once per source row, duplicated across frames)
        "match_id": df["match_id"],
        "tourney_id": df["tourney_id"].astype(str),
        "tourney_name": df["tourney_name"],
        "tourney_date": parse_date(df["tourney_date"]),
        "surface": df["surface"],
        "tourney_level": df["tourney_level"],
        "best_of": to_int(df["best_of"]),
        "round": df["round"],
        "score": df["score"],
        "minutes": to_int(df["minutes"]),
        # per-player identity
        "player_id": to_int(df[f"{me}_id"]),
        "player_name": df[f"{me}_name"],
        "player_rank": to_int(df[f"{me}_rank"]),
        "player_rank_points": to_int(df[f"{me}_rank_points"]),
        "opp_id": to_int(df[f"{opp}_id"]),
        "opp_name": df[f"{opp}_name"],
        "opp_rank": to_int(df[f"{opp}_rank"]),
        "opp_rank_points": to_int(df[f"{opp}_rank_points"]),
        "won": bool(won),
    }
    # programmatically paired stats
    for stat in stat_names:
        data[f"player_{stat}"] = to_int(df[f"{my_pre}{stat}"])
        data[f"opp_{stat}"] = to_int(df[f"{opp_pre}{stat}"])

    return pd.DataFrame(data)


def build_matches():
    files = sorted(glob.glob(str(RAW / "atp_matches_20*.csv")))
    df = pd.concat((pd.read_csv(f, low_memory=False) for f in files), ignore_index=True)
    source_count = len(df)

    if "match_num" not in df.columns:
        sys.exit("FATAL: match_num column missing — cannot build match_id. Stopping.")
    df["match_id"] = df["tourney_id"].astype(str) + "_" + df["match_num"].astype(str)

    stat_names = detect_stat_pairs(df)

    winner = _perspective_frame(df, stat_names, won=True)
    loser = _perspective_frame(df, stat_names, won=False)
    m = pd.concat([winner, loser], ignore_index=True)

    # derived columns
    m["surface"] = m["surface"].fillna("Unknown")
    m["level_label"] = m["tourney_level"].map(LEVEL_LABEL)
    m["competition_type"] = m["tourney_level"].map(COMPETITION_TYPE)
    m["round_order"] = m["round"].map(ROUND_ORDER).astype("Int64")

    # tidy column order: context, derived, identity, then paired stats
    lead = [
        "match_id", "tourney_id", "tourney_name", "tourney_date",
        "surface", "tourney_level", "level_label", "competition_type",
        "best_of", "round", "round_order", "score", "minutes",
        "player_id", "player_name", "player_rank", "player_rank_points",
        "opp_id", "opp_name", "opp_rank", "opp_rank_points", "won",
    ]
    stat_cols = [c for c in m.columns if c not in lead]
    m = m[lead + stat_cols]

    return m, source_count, stat_names


# --------------------------------------------------------------------------- #
# rankings.parquet
# --------------------------------------------------------------------------- #
def build_rankings(valid_ids):
    files = sorted(glob.glob(str(RAW / "atp_rankings_*.csv")))
    r = pd.concat((pd.read_csv(f, low_memory=False) for f in files), ignore_index=True)
    # raw column is 'player', not 'player_id'
    out = pd.DataFrame(
        {
            "ranking_date": parse_date(r["ranking_date"]),
            "player_id": to_int(r["player"]),
            "rank": to_int(r["rank"]),
            "points": to_int(r["points"]),
        }
    )
    return out[out["player_id"].isin(valid_ids)].reset_index(drop=True)


# --------------------------------------------------------------------------- #
# gate
# --------------------------------------------------------------------------- #
def run_gate(players, matches, source_count):
    print("\n===== PHASE 1 GATE =====")
    ok = True

    # 1) Fed-Nadal H2H rebuilt from matches.parquet
    fed, nad = 103819, 104745
    h2h = matches[
        (matches["player_id"] == fed) & (matches["opp_id"] == nad)
    ]
    total = len(h2h)
    fed_wins = int((h2h["won"] == True).sum())  # noqa: E712
    nad_wins = total - fed_wins
    c1 = (total == 41 and fed_wins == 17 and nad_wins == 24)
    ok &= c1
    print(f"[{'PASS' if c1 else 'FAIL'}] Fed-Nadal H2H: total={total} (exp 41), "
          f"Federer={fed_wins} (exp 17), Nadal={nad_wins} (exp 24)")

    # 2) matches rows == 2 x source match count
    c2 = (len(matches) == 2 * source_count)
    ok &= c2
    print(f"[{'PASS' if c2 else 'FAIL'}] rows == 2 x source: "
          f"{len(matches)} (exp {2 * source_count})")

    # 3) won.sum() == source match count
    won_sum = int(matches["won"].sum())
    c3 = (won_sum == source_count)
    ok &= c3
    print(f"[{'PASS' if c3 else 'FAIL'}] won.sum() == source: "
          f"{won_sum} (exp {source_count})")

    # 4) every player_id and opp_id in matches exists in players
    pids = set(players["player_id"].dropna().tolist())
    match_ids = set(matches["player_id"].dropna().tolist()) | set(
        matches["opp_id"].dropna().tolist()
    )
    missing = match_ids - pids
    c4 = (len(missing) == 0)
    ok &= c4
    print(f"[{'PASS' if c4 else 'FAIL'}] all match player/opp ids in players: "
          f"missing={len(missing)}"
          + (f" -> {sorted(missing)[:10]}" if missing else ""))

    print(f"===== GATE {'PASSED' if ok else 'FAILED'} =====\n")
    return ok


def describe(name, df, path):
    size = path.stat().st_size
    print(f"\n--- {name} ---")
    print(f"path: {path.relative_to(ROOT)}")
    print(f"rows: {len(df)}")
    print(f"size: {size / 1_000_000:.2f} MB ({size} bytes)")
    print(f"columns ({len(df.columns)}): {list(df.columns)}")
    return size


def main():
    BUILT.mkdir(parents=True, exist_ok=True)

    players = build_players()
    matches, source_count, stat_names = build_matches()
    print(f"detected stat columns (by prefix): {stat_names}")

    valid_ids = set(matches["player_id"].dropna().tolist()) | set(
        matches["opp_id"].dropna().tolist()
    )
    rankings = build_rankings(valid_ids)

    gate_ok = run_gate(players, matches, source_count)
    if not gate_ok:
        sys.exit("Gate failed — not writing artifacts.")

    players_path = BUILT / "players.parquet"
    matches_path = BUILT / "matches.parquet"
    rankings_path = BUILT / "rankings.parquet"

    players.to_parquet(players_path, index=False)
    matches.to_parquet(matches_path, index=False)
    rankings.to_parquet(rankings_path, index=False)

    describe("players.parquet", players, players_path)
    describe("matches.parquet", matches, matches_path)
    rank_size = describe("rankings.parquet", rankings, rankings_path)

    if rank_size > 25 * 1_000_000:
        print("\n*** rankings.parquet EXCEEDS 25MB — flagged, do NOT commit. ***")
    else:
        print("\nrankings.parquet under 25MB — OK to commit.")


if __name__ == "__main__":
    main()
