// Rarity context — a tiny, curated set of "here's how rare this is" notes on the
// genuinely remarkable standout matches. NOT a count on every row: only a handful
// of entries carry a note, keyed by match_id so the line travels with the exact
// match wherever it renders (and never attaches to anything else).
//
// Every number below was computed in Python DuckDB under the EXACT rules of the
// board the note appears on — tour-level default (competition_type='Tour'),
// completed-only / minutes-plausible as the board requires, since-2000 ATP
// tour-level singles. Each claim states its own scope so the boundaries are
// always visible. The denominators match each board's default universe:
//
//   Blowouts  — FROM matches m ⋈ match_scores ms
//               WHERE m.won AND ms.is_completed AND competition_type='Tour'
//               44 double bagels (games_won_loser=0, sets_won_winner=2); 3 over a
//               top-10 (opp_rank<=10): Goffin d. Berdych (#8) 2016-M009_287,
//               Federer d. Gaudio (#9), Berrettini d. Medvedev (#10).
//               (0 completed tour-level TRIPLE bagels exist — so the note is
//               framed as the true double-bagel fact.)
//
//   Marathons — + ⋈ mp_match_facts WHERE … AND mf.minutes_plausible
//               #1 Isner–Mahut 665 min; #2 Anderson–Isner 396 min; gap 269 min.
//
//   Comebacks — + ⋈ mp_match_facts WHERE m.won AND mf.is_comeback AND Tour
//               517 total; 4 over the world No. 1 (opp_rank=1): Cerundolo d.
//               Sinner 2026-520_164, Alcaraz d. Sinner, Nalbandian d. Federer,
//               Robredo d. Hewitt.
//
// The <strong> spans hold the figures (tabular numerals). Text is a trusted
// constant — no user data — so matchCard renders it as HTML.
export const RARITY_NOTES: Record<string, string> = {
  // Marathons — longest recorded, by a country mile
  '2010-540_60':
    'The longest match recorded since 2000 — <strong>269 minutes</strong> longer '
    + 'than any other timed tour-level match.',
  // Blowouts — double bagel over a top-10
  '2016-M009_287':
    'One of just <strong>3</strong> completed tour-level double bagels — 6–0, 6–0 — '
    + 'over a top-10 player since 2000.',
  // Comebacks — from two sets down over the world No. 1
  '2026-520_164':
    'One of just <strong>4</strong> completed tour-level comebacks from two sets '
    + 'down over the world No. 1 since 2000.',
};

export const rarityNote = (matchId: string): string | undefined => RARITY_NOTES[matchId];
