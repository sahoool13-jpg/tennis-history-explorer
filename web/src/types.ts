export interface PlayerSearchRow {
  player_id: number;
  player_name: string;
  ioc: string | null;
  total_matches: number;
}

export interface PlayerSummary {
  player_id: number;
  player_name: string;
  ioc: string | null;
  hand: string | null;
  total_matches: number;
  total_wins: number;
  win_pct: number;
  first_match_date: string | null;
  last_match_date: string | null;
  career_high_rank: number | null;
  career_high_first_date: string | null;
  career_high_last_date: string | null;
  weeks_at_career_high: number;
  career_high_spells: number;
  weeks_at_no1: number;
  titles: number;
  olympic_golds: number;
  primary_surface: string | null;
}

export interface SurfaceSplit {
  player_id: number;
  player_name: string;
  surface: string;
  matches: number;
  wins: number;
  losses: number;
  win_pct: number;
}

export interface CareerArcPoint {
  ranking_date: string;
  rank: number;
  points: number | null;
}

export interface H2HRow {
  player_id: number;
  opp_id: number;
  opp_name: string | null;
  meetings: number;
  player_wins: number;
  opp_wins: number;
  last_meeting_date: string | null;
}

export interface H2HBySurfaceRow {
  player_id: number;
  opp_id: number;
  surface: string;
  opp_name: string | null;
  meetings: number;
  player_wins: number;
  opp_wins: number;
}

export interface EraStat {
  year: number;
  matches: number;
  n_Hard: number; n_Clay: number; n_Grass: number; n_Carpet: number; n_Unknown: number;
  share_Hard: number; share_Clay: number; share_Grass: number;
  share_Carpet: number; share_Unknown: number;
  avg_minutes: number | null;
  minutes_coverage: number;
  distinct_champions: number;
  total_titles: number;
  titles_by_top_player: number;
}

// Leaderboard rows for the Records view (all from existing aggregates).
export interface LeaderRow {
  player_id: number;
  player_name: string;
  ioc: string | null;
  value: number;
  matches: number;
}

export interface RivalryRow {
  a_id: number; a_name: string; a_ioc: string | null;
  b_id: number; b_name: string; b_ioc: string | null;
  meetings: number;
}

// --- Match Point ------------------------------------------------------------
// A single match with its scoreline + context (match_scores ⋈ matches ⋈ facts).
export interface MpMatch {
  match_id: string;
  winner_id: number; winner_name: string;
  loser_id: number; loser_name: string;
  set_scores: string;
  tourney_name: string | null;
  surface: string;
  date: string;
  round: string | null;
  level_label: string | null;
  best_of: number | null;
  minutes: number | null;
  games_won_winner: number | null;
  games_won_loser: number | null;
  sets_won_winner: number | null;
  sets_won_loser: number | null;
}

// A per-player leaderboard row for Match Point boards (mp_player_stats).
export interface MpPlayerRow {
  player_id: number;
  player_name: string;
  ioc: string | null;
  matches: number;
  value: number;       // the ranked quantity
  detail?: string;     // optional secondary readout (e.g. "505 / 839 won")
}

// Match-length by surface, carrying its own minutes coverage (honesty rule).
export interface MpSurfaceLength {
  surface: string;
  total: number;
  with_minutes: number;
  avg_minutes: number | null;
}

// One bucket of the match-length distribution histogram.
export interface MpLengthBucket {
  bucket: number; // lower edge, minutes
  n: number;
}

// A candidate for the daily "guess the player" puzzle (notable, guessable).
export interface PuzzlePlayer {
  player_id: number;
  player_name: string;
  ioc: string | null;
  hand: string | null;
  career_high_rank: number | null;
  titles: number;
  total_matches: number;
  win_pct: number;
  primary_surface: string | null;
  debut_year: number | null;
  last_year: number | null;
}

// One individual meeting between two players (from matches.parquet).
export interface Meeting {
  date: string;
  tourney_name: string | null;
  surface: string;
  tourney_level: string | null;
  level_label: string | null;
  round: string | null;
  score: string | null;
  won: boolean; // true => the first (queried) player won
}
