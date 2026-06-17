"""Phase 2.6 pipeline: parse raw match scorelines into structured per-match data.

Reads data/built/matches.parquet and writes:

    match_scores.parquet  - one row per match (keyed by match_id)

This is the load-bearing artifact for the "Match Point" site (matches by their
scoreline). It turns Sackmann's free-text `score` string into structured fields:
sets won, games won, per-set detail, tiebreaks, bagels/breadsticks, and clean
status flags (retirement / walkover / default / incomplete / unparseable).

Design rules:
  * The raw `score` is winner-first per set: "winner_games-loser_games", e.g.
    "6-3 4-6 7-6(5)" is from the match winner's perspective.
  * We NEVER guess. A score we cannot parse is flagged `is_unparseable` and its
    numeric fields are left null — not silently zeroed.
  * Status outcomes (RET / W/O / DEF / abandoned) are flagged, never forced into
    a games count. A walkover with no games keeps null game counts.
  * Counts are computed only from sets actually recorded. A retirement with a
    partial scoreline keeps the real partial games it played.

Run:  python pipeline/parse_scores.py
"""
from pathlib import Path
import json
import re
import sys

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
BUILT = ROOT / "data" / "built"

EXPECTED_MATCHES = 79_299

# Status markers, matched case-insensitively against whole tokens / phrases.
RE_RET = re.compile(r"\bRET\b", re.IGNORECASE)
RE_WO = re.compile(r"\bW\s*/?\s*O\b|\bWALKOVER\b", re.IGNORECASE)
RE_DEF = re.compile(r"\bDEF\b|\bDEFAULT\b|\bDEF\.", re.IGNORECASE)
RE_INCOMPLETE = re.compile(r"UNFINISHED|ABANDONED|ABD", re.IGNORECASE)

# A normal set token: "a-b" with an optional tiebreak note "(n)" or "(a-b)".
RE_SET = re.compile(r"^(\d{1,2})-(\d{1,2})(?:\((\d{1,2})(?:-(\d{1,2}))?\))?$")
# A deciding match/super-tiebreak token, bracketed: "[10-8]".
RE_MTB = re.compile(r"^\[(\d{1,3})-(\d{1,3})\]$")

# Phrase fragments to drop before tokenising (so "Played and unfinished" etc.
# don't masquerade as score tokens).
RE_STRIP_PHRASES = re.compile(
    r"\bPlayed and (?:unfinished|abandoned)\b|\bWalkover\b|\bDefault\b|"
    r"\bunfinished\b|\babandoned\b|\bABD\b",
    re.IGNORECASE,
)
# Trailing status tokens we drop per-token after splitting.
STATUS_TOKENS = {"RET", "W/O", "WO", "DEF", "DEF.", "PLAYED", "AND"}


def _classify_status(raw: str) -> dict:
    return {
        "is_retirement": bool(RE_RET.search(raw)),
        "is_walkover": bool(RE_WO.search(raw)),
        "is_default": bool(RE_DEF.search(raw)),
        "is_incomplete": bool(RE_INCOMPLETE.search(raw)),
    }


def _tokenize_sets(raw: str):
    """Return the score tokens with status words/phrases removed."""
    cleaned = RE_STRIP_PHRASES.sub(" ", raw)
    toks = []
    for tok in cleaned.split():
        up = tok.upper().strip(".")
        if up in STATUS_TOKENS or up == "W/O":
            continue
        if RE_RET.fullmatch(tok) or RE_WO.fullmatch(tok) or RE_DEF.fullmatch(tok):
            continue
        toks.append(tok)
    return toks


def parse_one(raw_score, match_winner_won=True) -> dict:
    """Parse a single raw score string into a structured record.

    `match_winner_won` is always True here (we parse from the winner row), kept
    explicit so the deciding-tiebreak credit rule reads clearly.
    """
    raw = "" if raw_score is None else str(raw_score)
    status = _classify_status(raw)
    flagged = (
        status["is_retirement"] or status["is_walkover"]
        or status["is_default"] or status["is_incomplete"]
    )

    sets = []          # list of per-set dicts
    parse_failed = False

    for tok in _tokenize_sets(raw):
        m = RE_SET.match(tok)
        if m:
            wg, lg = int(m.group(1)), int(m.group(2))
            tb_inner = m.group(3)
            tb_inner2 = m.group(4)
            went_tb = tb_inner is not None
            if tb_inner2 is not None:
                # "(a-b)" full tiebreak score -> loser points = the smaller
                tb_loser_pts = min(int(tb_inner), int(tb_inner2))
            elif tb_inner is not None:
                tb_loser_pts = int(tb_inner)
            else:
                tb_loser_pts = None
            sets.append({
                "w": wg, "l": lg,
                "tb": went_tb,
                "tb_loser_pts": tb_loser_pts,
                "mtb": False,
            })
            continue
        mb = RE_MTB.match(tok)
        if mb:
            # Deciding super-tiebreak. Brackets are NOT reliably winner-first in
            # the data (e.g. some Davis Cup rows are "[12-14]" for a winner), and
            # a match tiebreak by definition decides the match -> credit the set
            # to the match winner. Points stored sorted (winner, loser).
            a, b = int(mb.group(1)), int(mb.group(2))
            hi, lo = max(a, b), min(a, b)
            sets.append({
                "w": hi, "l": lo,
                "tb": False,
                "tb_loser_pts": lo,
                "mtb": True,
            })
            continue
        # An unrecognised, non-status token -> we cannot trust this score.
        parse_failed = True

    num_sets = len(sets)

    rec = {
        "raw_score": raw,
        **status,
        "is_unparseable": False,
        "is_completed": False,
        "num_sets": num_sets,
        "sets_won_winner": pd.NA,
        "sets_won_loser": pd.NA,
        "games_won_winner": pd.NA,
        "games_won_loser": pd.NA,
        "num_tiebreaks": pd.NA,
        "num_match_tiebreaks": pd.NA,
        "bagels_winner": pd.NA,
        "bagels_loser": pd.NA,
        "breadsticks_winner": pd.NA,
        "breadsticks_loser": pd.NA,
        "set_scores": "",
        "sets_detail": "[]",
    }

    # Unparseable: a token we couldn't read, OR a score with no status flag and
    # no parseable sets (genuinely empty/garbage). A flagged W/O legitimately has
    # no sets, so that is NOT unparseable.
    if parse_failed or (num_sets == 0 and not flagged):
        rec["is_unparseable"] = True
        return rec

    if num_sets == 0:
        # Flagged outcome with no recorded games (e.g. walkover). Leave counts
        # null — do not force a games count. Nothing more to compute.
        return rec

    # --- derive counts from the sets actually recorded ----------------------
    sets_w = sum(1 for s in sets if s["w"] > s["l"])
    sets_l = sum(1 for s in sets if s["l"] > s["w"])
    # games exclude match-tiebreak brackets (those are points, not games)
    games_w = sum(s["w"] for s in sets if not s["mtb"])
    games_l = sum(s["l"] for s in sets if not s["mtb"])
    num_tb = sum(1 for s in sets if s["tb"])
    num_mtb = sum(1 for s in sets if s["mtb"])
    bagels_w = sum(1 for s in sets if s["w"] == 6 and s["l"] == 0 and not s["mtb"])
    bagels_l = sum(1 for s in sets if s["l"] == 6 and s["w"] == 0 and not s["mtb"])
    bread_w = sum(1 for s in sets if s["w"] == 6 and s["l"] == 1 and not s["mtb"])
    bread_l = sum(1 for s in sets if s["l"] == 6 and s["w"] == 1 and not s["mtb"])

    def fmt(s):
        base = f"{s['w']}-{s['l']}"
        if s["mtb"]:
            return f"[{s['w']}-{s['l']}]"
        if s["tb"] and s["tb_loser_pts"] is not None:
            return f"{base}({s['tb_loser_pts']})"
        return base

    rec.update({
        "num_sets": num_sets,
        "sets_won_winner": sets_w,
        "sets_won_loser": sets_l,
        "games_won_winner": games_w,
        "games_won_loser": games_l,
        "num_tiebreaks": num_tb,
        "num_match_tiebreaks": num_mtb,
        "bagels_winner": bagels_w,
        "bagels_loser": bagels_l,
        "breadsticks_winner": bread_w,
        "breadsticks_loser": bread_l,
        "set_scores": " ".join(fmt(s) for s in sets),
        "sets_detail": json.dumps([
            {
                "set_no": i + 1,
                "w_games": s["w"],
                "l_games": s["l"],
                "tiebreak": s["tb"],
                "tb_loser_points": s["tb_loser_pts"],
                "match_tiebreak": s["mtb"],
            }
            for i, s in enumerate(sets)
        ]),
    })

    # is_completed: a normal finished match with parseable sets where the match
    # winner won more sets than the loser. Flagged outcomes are never completed.
    if not flagged and sets_w > sets_l:
        rec["is_completed"] = True
    elif not flagged and sets_w <= sets_l:
        # Clean status but the winner didn't win more sets -> the score can't be
        # trusted (parse error or a perspective oddity). Surface it, don't fake
        # a completed match. Keep the parsed counts for inspection.
        rec["is_unparseable"] = True

    return rec


def build_match_scores(matches: pd.DataFrame) -> pd.DataFrame:
    # one row per match: the winner-perspective rows carry the winner-first score
    w = matches[matches["won"] == True].copy()  # noqa: E712
    if w["match_id"].duplicated().any():
        sys.exit("FATAL: duplicate match_id among winner rows — cannot key on it.")

    records = [parse_one(sc) for sc in w["score"].tolist()]
    out = pd.DataFrame.from_records(records)
    out.insert(0, "match_id", w["match_id"].values)

    int_cols = [
        "num_sets", "sets_won_winner", "sets_won_loser",
        "games_won_winner", "games_won_loser",
        "num_tiebreaks", "num_match_tiebreaks",
        "bagels_winner", "bagels_loser",
        "breadsticks_winner", "breadsticks_loser",
    ]
    for c in int_cols:
        out[c] = out[c].astype("Int64")
    return out


# --------------------------------------------------------------------------- #
# gate
# --------------------------------------------------------------------------- #
def run_gate(matches: pd.DataFrame, scores: pd.DataFrame) -> bool:
    print("\n===== PHASE 2.6 GATE (score parser) =====")
    ok = True
    total = len(scores)

    # --- parse coverage ----------------------------------------------------
    n_completed = int(scores["is_completed"].sum())
    n_ret = int(scores["is_retirement"].sum())
    n_wo = int(scores["is_walkover"].sum())
    n_def = int(scores["is_default"].sum())
    n_inc = int(scores["is_incomplete"].sum())
    n_unpar = int(scores["is_unparseable"].sum())
    # matches with any status flag (RET/WO/DEF/incomplete), de-duplicated
    flagged_mask = (
        scores["is_retirement"] | scores["is_walkover"]
        | scores["is_default"] | scores["is_incomplete"]
    )
    n_flagged = int(flagged_mask.sum())
    unpar_pct = 100.0 * n_unpar / total

    print("\n-- PARSE COVERAGE --")
    print(f"  total matches              : {total}")
    print(f"  parsed completed           : {n_completed} "
          f"({100.0 * n_completed / total:.2f}%)")
    print(f"  retirements / walkovers / incomplete (any flag): {n_flagged}")
    print(f"      retirements (RET)      : {n_ret}")
    print(f"      walkovers   (W/O)      : {n_wo}")
    print(f"      defaults    (DEF)      : {n_def}")
    print(f"      incomplete/abandoned   : {n_inc}")
    print(f"  unparseable                : {n_unpar}")
    print(f"  >>> UNPARSEABLE %          : {unpar_pct:.4f}%  ({n_unpar}/{total})")
    # accounting identity: completed + flagged + unparseable should cover all,
    # with no overlap between completed/flagged/unparseable.
    covered = n_completed + n_flagged + n_unpar
    c_cover = (covered == total)
    ok &= c_cover
    print(f"[{'PASS' if c_cover else 'FAIL'}] accounting: completed({n_completed}) + "
          f"flagged({n_flagged}) + unparseable({n_unpar}) = {covered} (exp {total})")

    s = scores.set_index("match_id")

    # --- known-match spot checks -------------------------------------------
    print("\n-- KNOWN-MATCH SPOT CHECKS --")

    def check(cond, label):
        nonlocal ok
        ok &= bool(cond)
        print(f"[{'PASS' if cond else 'FAIL'}] {label}")

    # 1) straight-sets win parses to 3-0 (Nadal d. Federer, 2008 RG final, 6-1 6-3 6-0)
    r = s.loc["2008-520_127"]
    check(int(r["sets_won_winner"]) == 3 and int(r["sets_won_loser"]) == 0
          and bool(r["is_completed"]),
          f"straight sets 2008 RG final: {r['set_scores']} -> "
          f"sets {int(r['sets_won_winner'])}-{int(r['sets_won_loser'])}, completed")

    # 2) tiebreak match (Isner-Mahut, 2010 Wimbledon): >=1 tiebreak, sets 3-2
    r = s.loc["2010-540_60"]
    check(int(r["num_tiebreaks"]) >= 1 and int(r["sets_won_winner"]) == 3
          and int(r["sets_won_loser"]) == 2,
          f"Isner-Mahut tiebreaks: {r['set_scores']} -> num_tiebreaks="
          f"{int(r['num_tiebreaks'])}, sets {int(r['sets_won_winner'])}-"
          f"{int(r['sets_won_loser'])}")
    # the recorded games match the famous 92-91 (incl. 70-68 final set)
    check(int(r["games_won_winner"]) == 92 and int(r["games_won_loser"]) == 91,
          f"Isner-Mahut games: winner {int(r['games_won_winner'])} - "
          f"{int(r['games_won_loser'])} loser (exp 92-91)")

    # 3) retirement (Chang d. Gustafsson, Auckland 2000, 7-5 3-6 1-0 RET)
    r = s.loc["2000-301_26"]
    check(bool(r["is_retirement"]) and not bool(r["is_completed"]),
          f"retirement: {r['raw_score']} -> is_retirement="
          f"{bool(r['is_retirement'])}, is_completed={bool(r['is_completed'])}")

    # 4) bagel + breadstick (same 2008 RG final: 6-1 6-3 6-0)
    r = s.loc["2008-520_127"]
    check(int(r["bagels_winner"]) == 1 and int(r["breadsticks_winner"]) == 1,
          f"bagel/breadstick: {r['set_scores']} -> bagels_winner="
          f"{int(r['bagels_winner'])}, breadsticks_winner="
          f"{int(r['breadsticks_winner'])}")

    # --- internal consistency ----------------------------------------------
    print("\n-- INTERNAL CONSISTENCY --")
    comp = scores[scores["is_completed"]]
    viol = comp[comp["sets_won_winner"] <= comp["sets_won_loser"]]
    c_cons = (len(viol) == 0)
    ok &= c_cons
    print(f"[{'PASS' if c_cons else 'FAIL'}] completed matches with winner "
          f"sets_won > loser sets_won: {len(comp) - len(viol)}/{len(comp)} "
          f"(violations={len(viol)})")
    if len(viol):
        print("    VIOLATIONS (first 20):")
        for mid, row in viol.head(20).iterrows():
            print(f"      {mid}: {row['raw_score']!r} -> "
                  f"{int(row['sets_won_winner'])}-{int(row['sets_won_loser'])}")

    # completed matches must never carry a status flag
    bad_flag = int((scores["is_completed"] & flagged_mask).sum())
    ok &= (bad_flag == 0)
    print(f"[{'PASS' if bad_flag == 0 else 'FAIL'}] no completed match also "
          f"flagged RET/WO/DEF/incomplete: bad={bad_flag}")

    # --- row reconciliation ------------------------------------------------
    print("\n-- ROW RECONCILIATION --")
    c_rows = (total == EXPECTED_MATCHES)
    ok &= c_rows
    print(f"[{'PASS' if c_rows else 'FAIL'}] match_scores rows == {EXPECTED_MATCHES}: "
          f"{total}")
    c_key = (scores["match_id"].nunique() == total)
    ok &= c_key
    print(f"[{'PASS' if c_key else 'FAIL'}] match_id unique (one row per match): "
          f"{scores['match_id'].nunique()}/{total}")

    print(f"\n===== GATE {'PASSED' if ok else 'FAILED'} =====\n")
    return ok


def describe(name, df, path):
    size = path.stat().st_size
    print(f"--- {name} ---")
    print(f"path: {path.relative_to(ROOT)}")
    print(f"rows: {len(df)}")
    print(f"size: {size / 1_000_000:.2f} MB ({size} bytes)")
    print(f"columns ({len(df.columns)}): {list(df.columns)}")


def main():
    matches = pd.read_parquet(BUILT / "matches.parquet")
    scores = build_match_scores(matches)

    if not run_gate(matches, scores):
        sys.exit("Gate failed — not writing match_scores.parquet.")

    out_path = BUILT / "match_scores.parquet"
    scores.to_parquet(out_path, index=False)
    describe("match_scores.parquet", scores, out_path)


if __name__ == "__main__":
    main()
