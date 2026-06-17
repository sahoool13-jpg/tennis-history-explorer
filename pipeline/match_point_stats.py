"""Phase 2.7 pipeline: Match Point stat aggregates from the verified scores.

Reads the gated Step-0 artifact match_scores.parquet (NEVER re-parses raw
scores) joined to matches.parquet for player identity, and writes two aggregates
for the Match Point leaderboards:

    mp_player_stats.parquet  - one row per player: bagels/breadsticks dished &
                               received, tiebreaks played & won, retirements
                               (suffered) and wins by opponent retirement.
    mp_match_facts.parquet   - one row per match: derived per-match flags the
                               browser shouldn't compute — minutes plausibility
                               (the raw `minutes` column has data-entry errors)
                               and the best-of-5 two-sets-down comeback flag.

All set-level facts come from match_scores (sets_won/games_won/bagels/tiebreaks
and the structured `sets_detail`); we only attribute them to players here.

Run:  python pipeline/match_point_stats.py
"""
from pathlib import Path
import json
import sys

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
BUILT = ROOT / "data" / "built"

EXPECTED_MATCHES = 79_299

# Minutes plausibility band. The raw `minutes` column contains data-entry errors
# (e.g. a straight-sets match logged at 1146 min). A match's pace in minutes per
# game is physically bounded: real matches sit ~3-7 min/game; we keep a generous
# 1.5-12.0 band and treat anything outside it (or with no/zero minutes) as not
# plausible, so the "longest matches" board can never surface a corrupt row.
MPG_LO, MPG_HI = 1.5, 12.0


def load():
    m = pd.read_parquet(BUILT / "matches.parquet")
    ms = pd.read_parquet(BUILT / "match_scores.parquet")
    w = m[m["won"] == True][[  # noqa: E712  winner rows carry winner-first score
        "match_id", "player_id", "player_name", "opp_id", "opp_name",
        "best_of", "minutes",
    ]].copy()
    df = w.merge(ms, on="match_id", how="left", validate="one_to_one")
    return df


# --------------------------------------------------------------------------- #
# per-match: tiebreaks won by each side (from structured sets_detail)
# --------------------------------------------------------------------------- #
def tiebreaks_won_by_side(sets_detail_json: str):
    """(winner_tb_won, loser_tb_won) from the parsed per-set detail. Only set
    tiebreaks (7-6) count — match/super-tiebreaks are excluded, matching
    num_tiebreaks."""
    wn = ln = 0
    for s in json.loads(sets_detail_json):
        if s.get("tiebreak"):
            if s["w_games"] > s["l_games"]:
                wn += 1
            else:
                ln += 1
    return wn, ln


def lost_first_two_sets(sets_detail_json: str) -> bool:
    s = json.loads(sets_detail_json)
    if len(s) < 3:
        return False
    return (s[0]["l_games"] > s[0]["w_games"]
            and s[1]["l_games"] > s[1]["w_games"])


# --------------------------------------------------------------------------- #
# mp_match_facts.parquet
# --------------------------------------------------------------------------- #
def build_match_facts(df):
    total_games = (df["games_won_winner"].astype("Float64")
                   + df["games_won_loser"].astype("Float64"))
    minutes = df["minutes"].astype("Float64")
    mpg = minutes / total_games
    minutes_plausible = (
        minutes.notna() & (minutes > 0)
        & total_games.notna() & (total_games > 0)
        & (mpg >= MPG_LO) & (mpg <= MPG_HI)
    ).fillna(False)

    # comeback: completed best-of-5 won from two sets down
    is_comeback = (
        (df["best_of"] == 5) & (df["is_completed"])
        & df["sets_detail"].map(lost_first_two_sets)
    ).fillna(False)

    return pd.DataFrame({
        "match_id": df["match_id"].values,
        "total_games": total_games.astype("Int64").values,
        "minutes_per_game": mpg.round(3).values,
        "minutes_plausible": minutes_plausible.astype(bool).values,
        "is_comeback": is_comeback.astype(bool).values,
    })


# --------------------------------------------------------------------------- #
# mp_player_stats.parquet
# --------------------------------------------------------------------------- #
def build_player_stats(df):
    # population for set-level career stats: anything we could parse into sets.
    # (A 6-0 set or a tiebreak is a real event even if the match later retired;
    # only genuinely unparseable rows are excluded.)
    pop = df[(~df["is_unparseable"]) & (df["num_sets"] > 0)].copy()
    tb = pop["sets_detail"].map(tiebreaks_won_by_side)
    pop["tbw_w"] = [t[0] for t in tb]
    pop["tbw_l"] = [t[1] for t in tb]
    pop["ntb"] = pop["num_tiebreaks"].fillna(0).astype("int64")

    # retirements use ALL matches (a retirement is a match outcome, not a set).
    ret = df[df["is_retirement"] == True]  # noqa: E712

    def winner_side():
        return pd.DataFrame({
            "player_id": pop["player_id"], "name": pop["player_name"],
            "bagels_dished": pop["bagels_winner"], "bagels_received": pop["bagels_loser"],
            "breadsticks_dished": pop["breadsticks_winner"], "breadsticks_received": pop["breadsticks_loser"],
            "tiebreaks_played": pop["ntb"], "tiebreaks_won": pop["tbw_w"],
            "matches": 1,
        })

    def loser_side():
        return pd.DataFrame({
            "player_id": pop["opp_id"], "name": pop["opp_name"],
            "bagels_dished": pop["bagels_loser"], "bagels_received": pop["bagels_winner"],
            "breadsticks_dished": pop["breadsticks_loser"], "breadsticks_received": pop["breadsticks_winner"],
            "tiebreaks_played": pop["ntb"], "tiebreaks_won": pop["tbw_l"],
            "matches": 1,
        })

    long = pd.concat([winner_side(), loser_side()], ignore_index=True)
    for c in ["bagels_dished", "bagels_received", "breadsticks_dished",
              "breadsticks_received", "tiebreaks_played", "tiebreaks_won"]:
        long[c] = long[c].fillna(0).astype("int64")

    agg = long.groupby("player_id").agg(
        player_name=("name", "first"),
        matches=("matches", "sum"),
        bagels_dished=("bagels_dished", "sum"),
        bagels_received=("bagels_received", "sum"),
        breadsticks_dished=("breadsticks_dished", "sum"),
        breadsticks_received=("breadsticks_received", "sum"),
        tiebreaks_played=("tiebreaks_played", "sum"),
        tiebreaks_won=("tiebreaks_won", "sum"),
    )

    # retirements: the retiring player is the match loser; the beneficiary wins.
    retired = ret.groupby("opp_id").size().rename("retired")            # suffered
    won_by_ret = ret.groupby("player_id").size().rename("wins_by_retirement")
    agg = agg.join(retired).join(won_by_ret)
    agg["retired"] = agg["retired"].fillna(0).astype("int64")
    agg["wins_by_retirement"] = agg["wins_by_retirement"].fillna(0).astype("int64")

    agg = agg.reset_index()
    agg["player_id"] = agg["player_id"].astype("int64")
    return agg, pop, ret


# --------------------------------------------------------------------------- #
# gate
# --------------------------------------------------------------------------- #
def run_gate(df, stats, facts, pop, ret):
    print("\n===== PHASE 2.7 GATE (Match Point aggregates) =====")
    ok = True

    def check(cond, label):
        nonlocal ok
        ok &= bool(cond)
        print(f"[{'PASS' if cond else 'FAIL'}] {label}")

    # --- reconciliation: per-player sums == direct totals ------------------
    print("\n-- RECONCILIATION --")
    direct_bagels = int((pop["bagels_winner"] + pop["bagels_loser"]).sum())
    sum_bd = int(stats["bagels_dished"].sum())
    sum_br = int(stats["bagels_received"].sum())
    check(sum_bd == direct_bagels == sum_br,
          f"bagels: dished {sum_bd} == direct {direct_bagels} == received {sum_br}")

    direct_bread = int((pop["breadsticks_winner"] + pop["breadsticks_loser"]).sum())
    sum_brd = int(stats["breadsticks_dished"].sum())
    sum_brr = int(stats["breadsticks_received"].sum())
    check(sum_brd == direct_bread == sum_brr,
          f"breadsticks: dished {sum_brd} == direct {direct_bread} == received {sum_brr}")

    direct_tb = int(pop["num_tiebreaks"].fillna(0).sum())
    sum_tbp = int(stats["tiebreaks_played"].sum())
    sum_tbw = int(stats["tiebreaks_won"].sum())
    check(sum_tbp == 2 * direct_tb,
          f"tiebreaks played: sum {sum_tbp} == 2 x direct {2 * direct_tb} "
          f"(every tiebreak has two players)")
    check(sum_tbw == direct_tb,
          f"tiebreaks won: sum {sum_tbw} == direct {direct_tb} "
          f"(every tiebreak has one winner)")

    n_ret = int((df["is_retirement"] == True).sum())  # noqa: E712
    sum_retired = int(stats["retired"].sum())
    sum_wbr = int(stats["wins_by_retirement"].sum())
    check(sum_retired == sum_wbr == n_ret,
          f"retirements: suffered {sum_retired} == won-via {sum_wbr} == total RET {n_ret}")

    # --- spot checks (eyeball) ---------------------------------------------
    print("\n-- SPOT CHECKS --")
    s = stats.set_index("player_id")
    isner = s.loc[104545]
    print(f"  John Isner: matches={int(isner['matches'])}, "
          f"tiebreaks {int(isner['tiebreaks_won'])}/{int(isner['tiebreaks_played'])} "
          f"({100 * isner['tiebreaks_won'] / isner['tiebreaks_played']:.1f}%), "
          f"bagels dished={int(isner['bagels_dished'])}")
    check(int(isner["tiebreaks_played"]) > 700,
          f"Isner played >700 tiebreaks ({int(isner['tiebreaks_played'])}) — most on tour")
    top_bag = stats.sort_values("bagels_dished", ascending=False).iloc[0]
    print(f"  most bagels dished: {top_bag['player_name']} "
          f"({int(top_bag['bagels_dished'])})")

    # single longest plausible match
    fj = df.merge(facts, on="match_id")
    longest = fj[fj["minutes_plausible"]].sort_values("minutes", ascending=False).iloc[0]
    print(f"  longest plausible match: {int(longest['minutes'])} min — "
          f"{longest['set_scores']} — {longest['player_name']} d. {longest['opp_name']}")
    check(640 <= int(longest["minutes"]) <= 700,
          f"longest plausible match in record range (~665 min): {int(longest['minutes'])}")
    # the famous corrupt row (Muller-Chardy 7-6 6-3 @ 1146 min) must be excluded
    corrupt = fj[fj["minutes"] >= 1000]
    check((~corrupt["minutes_plausible"]).all(),
          f"all {len(corrupt)} matches with minutes>=1000 flagged NOT plausible")

    n_comeback = int(facts["is_comeback"].sum())
    print(f"  comebacks (bo5, two sets down, completed): {n_comeback}")
    check(n_comeback > 0, f"comebacks found: {n_comeback}")

    # --- completed-board integrity -----------------------------------------
    print("\n-- COMPLETED-BOARD INTEGRITY --")
    bad = int((df["is_completed"] & df["is_retirement"]).sum())
    check(bad == 0, f"no completed match is a retirement: {bad}")

    cb = fj[fj["is_comeback"]]
    check(bool((~cb["is_retirement"]).all()),
          f"zero comebacks are retirements ({int(cb['is_retirement'].sum())} bad)")
    check(bool((cb["is_completed"]).all()) and bool((cb["best_of"] == 5).all()),
          "every comeback is a completed best-of-5")
    check(bool((cb["sets_won_winner"].eq(3) & cb["sets_won_loser"].eq(2)).all()),
          "every comeback finished 3-2 in sets")

    # --- row reconciliation ------------------------------------------------
    print("\n-- ROW RECONCILIATION --")
    check(len(facts) == EXPECTED_MATCHES,
          f"mp_match_facts rows == {EXPECTED_MATCHES}: {len(facts)}")
    check(facts["match_id"].nunique() == len(facts),
          f"mp_match_facts match_id unique: {facts['match_id'].nunique()}/{len(facts)}")
    expected_players = pd.unique(pd.concat([
        pop["player_id"], pop["opp_id"],
        ret["opp_id"], ret["player_id"],
    ]).dropna())
    check(len(stats) == len(expected_players),
          f"mp_player_stats rows == distinct players in population: "
          f"{len(stats)} (exp {len(expected_players)})")
    check(stats["player_id"].nunique() == len(stats),
          f"mp_player_stats player_id unique: {stats['player_id'].nunique()}/{len(stats)}")

    print(f"\n===== GATE {'PASSED' if ok else 'FAILED'} =====\n")
    return ok


def describe(name, df, path):
    size = path.stat().st_size
    print(f"--- {name} ---")
    print(f"path: {path.relative_to(ROOT)}  rows: {len(df)}  "
          f"size: {size / 1_000_000:.2f} MB")
    print(f"columns ({len(df.columns)}): {list(df.columns)}")


def main():
    df = load()
    stats, pop, ret = build_player_stats(df)
    facts = build_match_facts(df)

    if not run_gate(df, stats, facts, pop, ret):
        sys.exit("Gate failed — not writing Match Point aggregates.")

    stats_path = BUILT / "mp_player_stats.parquet"
    facts_path = BUILT / "mp_match_facts.parquet"
    stats.to_parquet(stats_path, index=False)
    facts.to_parquet(facts_path, index=False)
    describe("mp_player_stats.parquet", stats, stats_path)
    describe("mp_match_facts.parquet", facts, facts_path)


if __name__ == "__main__":
    main()
