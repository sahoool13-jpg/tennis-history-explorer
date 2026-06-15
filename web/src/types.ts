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
