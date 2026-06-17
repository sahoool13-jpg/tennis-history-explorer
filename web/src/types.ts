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
