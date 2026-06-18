// Single DuckDB-wasm data path. Every view queries through the functions here;
// no view talks to DuckDB directly. Uses the official Vite manual-bundle
// pattern (?url imports) so Vite serves the wasm + worker with correct MIME.
import * as duckdb from '@duckdb/duckdb-wasm';
import mvp_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import eh_wasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

import type {
  PlayerSearchRow, PlayerSummary, SurfaceSplit, CareerArcPoint, H2HRow,
  H2HBySurfaceRow, Meeting, EraStat, LeaderRow, RivalryRow,
  MpMatch, MpPlayerRow, MpSurfaceLength, MpLengthBucket, PuzzlePlayer,
  MpFilter, MpMatchPage, MpPlayerPage,
} from './types';

const TABLES = [
  'surface_splits', 'player_summary', 'h2h', 'h2h_by_surface', 'matches',
  'rankings', 'era_stats',
  // Match Point artifacts (Step 0 scores + gated aggregates). Registered here
  // additively; Rally's views don't query them.
  'match_scores', 'mp_player_stats', 'mp_match_facts',
] as const;

let connPromise: Promise<duckdb.AsyncDuckDBConnection> | null = null;

async function connect(): Promise<duckdb.AsyncDuckDBConnection> {
  const bundle = await duckdb.selectBundle({
    mvp: { mainModule: mvp_wasm, mainWorker: mvp_worker },
    eh: { mainModule: eh_wasm, mainWorker: eh_worker },
  });
  const worker = new Worker(bundle.mainWorker!);
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

  const base = import.meta.env.BASE_URL;
  for (const name of TABLES) {
    await db.registerFileURL(
      `${name}.parquet`,
      `${location.origin}${base}data/${name}.parquet`,
      duckdb.DuckDBDataProtocol.HTTP,
      false,
    );
  }
  const conn = await db.connect();
  for (const name of TABLES) {
    await conn.query(
      `CREATE VIEW ${name} AS SELECT * FROM read_parquet('${name}.parquet')`,
    );
  }
  return conn;
}

export function initDB(): Promise<duckdb.AsyncDuckDBConnection> {
  if (!connPromise) connPromise = connect();
  return connPromise;
}

// --- result marshalling: Arrow rows -> plain objects, BigInt -> number ------
async function query<T>(sql: string): Promise<T[]> {
  const conn = await initDB();
  const res = await conn.query(sql);
  const fields = res.schema.fields.map((f) => f.name);
  return res.toArray().map((row: any) => {
    const o: Record<string, unknown> = {};
    for (const f of fields) {
      const v = row[f];
      o[f] = typeof v === 'bigint' ? Number(v) : v;
    }
    return o as T;
  });
}

const intId = (id: number | string): number => {
  const n = Math.trunc(Number(id));
  if (!Number.isFinite(n)) throw new Error(`Invalid player id: ${id}`);
  return n;
};

const esc = (s: string): string => s.replace(/'/g, "''");

// --- typed query functions --------------------------------------------------
export function searchPlayers(term: string): Promise<PlayerSearchRow[]> {
  const t = esc(term.trim().toLowerCase());
  if (!t) return Promise.resolve([]);
  return query<PlayerSearchRow>(
    `SELECT player_id, player_name, ioc, total_matches
       FROM player_summary
      WHERE lower(player_name) LIKE '%${t}%'
      ORDER BY total_matches DESC
      LIMIT 50`,
  );
}

export async function getPlayerSummary(id: number | string): Promise<PlayerSummary | null> {
  const rows = await query<PlayerSummary>(
    `SELECT player_id, player_name, ioc, hand,
            total_matches, total_wins, win_pct,
            CAST(first_match_date AS VARCHAR) AS first_match_date,
            CAST(last_match_date  AS VARCHAR) AS last_match_date,
            career_high_rank,
            CAST(career_high_first_date AS VARCHAR) AS career_high_first_date,
            CAST(career_high_last_date  AS VARCHAR) AS career_high_last_date,
            weeks_at_career_high, career_high_spells, weeks_at_no1,
            titles, olympic_golds, primary_surface
       FROM player_summary
      WHERE player_id = ${intId(id)}`,
  );
  return rows[0] ?? null;
}

export function getSurfaceSplits(id: number | string): Promise<SurfaceSplit[]> {
  return query<SurfaceSplit>(
    `SELECT player_id, player_name, surface, matches, wins, losses, win_pct
       FROM surface_splits
      WHERE player_id = ${intId(id)}
      ORDER BY matches DESC`,
  );
}

// Heavy table (1.2M rows) live-sliced by player_id — the WHERE must feel instant.
export function getCareerArc(id: number | string): Promise<CareerArcPoint[]> {
  return query<CareerArcPoint>(
    `SELECT CAST(ranking_date AS VARCHAR) AS ranking_date, rank, points
       FROM rankings
      WHERE player_id = ${intId(id)}
      ORDER BY ranking_date`,
  );
}

export async function getH2H(
  id1: number | string,
  id2: number | string,
): Promise<H2HRow | null> {
  const rows = await query<H2HRow>(
    `SELECT player_id, opp_id, opp_name, meetings, player_wins, opp_wins,
            CAST(last_meeting_date AS VARCHAR) AS last_meeting_date
       FROM h2h
      WHERE player_id = ${intId(id1)} AND opp_id = ${intId(id2)}`,
  );
  return rows[0] ?? null;
}

// Every individual meeting between two players, oldest first — one row per
// match (queried live from the player-long match fact). `won` is from id1's
// perspective. Reconciles in count to the h2h aggregate for the pair.
export function getMeetings(
  id1: number | string,
  id2: number | string,
): Promise<Meeting[]> {
  return query<Meeting>(
    `SELECT CAST(tourney_date AS VARCHAR) AS date, tourney_name, surface,
            tourney_level, level_label, round, score, won
       FROM matches
      WHERE player_id = ${intId(id1)} AND opp_id = ${intId(id2)}
      ORDER BY tourney_date, match_id`,
  );
}

// Tour-evolution aggregates, one row per year (2000+).
export function getEraStats(): Promise<EraStat[]> {
  return query<EraStat>(`SELECT * FROM era_stats ORDER BY year`);
}

// --- leaderboards for the Records view (all from existing aggregates) -------
const SURFACE_SET = new Set(['Hard', 'Clay', 'Grass', 'Carpet', 'Unknown']);

export function lbTitles(n = 10): Promise<LeaderRow[]> {
  return query<LeaderRow>(
    `SELECT player_id, player_name, ioc, titles AS value, total_matches AS matches
       FROM player_summary ORDER BY titles DESC, total_wins DESC LIMIT ${n | 0}`);
}
export function lbWins(n = 10): Promise<LeaderRow[]> {
  return query<LeaderRow>(
    `SELECT player_id, player_name, ioc, total_wins AS value, total_matches AS matches
       FROM player_summary ORDER BY total_wins DESC LIMIT ${n | 0}`);
}
export function lbWinPct(floor = 200, n = 10): Promise<LeaderRow[]> {
  return query<LeaderRow>(
    `SELECT player_id, player_name, ioc, win_pct AS value, total_matches AS matches
       FROM player_summary WHERE total_matches >= ${floor | 0}
      ORDER BY win_pct DESC LIMIT ${n | 0}`);
}
export function lbWeeksNo1(n = 10): Promise<LeaderRow[]> {
  return query<LeaderRow>(
    `SELECT player_id, player_name, ioc, weeks_at_no1 AS value, total_matches AS matches
       FROM player_summary WHERE weeks_at_no1 > 0
      ORDER BY weeks_at_no1 DESC LIMIT ${n | 0}`);
}
export function lbSurface(surface: string, floor = 100, n = 8): Promise<LeaderRow[]> {
  if (!SURFACE_SET.has(surface)) return Promise.resolve([]);
  // ioc lives in player_summary, not surface_splits — join for it.
  return query<LeaderRow>(
    `SELECT s.player_id AS player_id, s.player_name AS player_name, p.ioc AS ioc,
            s.win_pct AS value, s.matches AS matches
       FROM surface_splits s
       JOIN player_summary p ON s.player_id = p.player_id
      WHERE s.surface = '${surface}' AND s.matches >= ${floor | 0}
      ORDER BY s.win_pct DESC LIMIT ${n | 0}`);
}
export function lbRivalries(n = 10): Promise<RivalryRow[]> {
  return query<RivalryRow>(
    `SELECT a.player_id AS a_id, a.player_name AS a_name, a.ioc AS a_ioc,
            b.player_id AS b_id, b.player_name AS b_name, b.ioc AS b_ioc,
            h.meetings AS meetings
       FROM h2h h
       JOIN player_summary a ON h.player_id = a.player_id
       JOIN player_summary b ON h.opp_id = b.player_id
      WHERE h.player_id < h.opp_id
      ORDER BY h.meetings DESC LIMIT ${n | 0}`);
}

// --- Match Point: matches read by their scoreline ---------------------------
// Every query reads the verified match_scores columns and the gated
// mp_* aggregates — no score is re-parsed here. The winner-perspective rows of
// `matches` (won = TRUE) carry winner-first scores and both players' identity.
const MP_MATCH_COLS = `
  m.match_id AS match_id,
  m.player_id AS winner_id, m.player_name AS winner_name,
  m.opp_id AS loser_id, m.opp_name AS loser_name,
  ms.set_scores AS set_scores,
  m.tourney_name AS tourney_name, m.surface AS surface,
  CAST(m.tourney_date AS VARCHAR) AS date,
  m.round AS round, m.level_label AS level_label, m.best_of AS best_of,
  m.minutes AS minutes, m.opp_rank AS loser_rank,
  ms.games_won_winner AS games_won_winner, ms.games_won_loser AS games_won_loser,
  ms.sets_won_winner AS sets_won_winner, ms.sets_won_loser AS sets_won_loser`;

// --- explorable match boards: filtered live over the full match-level data --
// Each board's base predicate carries its integrity gate (is_completed for the
// completed-match boards; minutes_plausible for marathons; is_comeback for
// comebacks). The user filter only ADDS AND-clauses, so search/surface/era can
// never become a backdoor around those gates.
export type MpBoard = 'blowouts' | 'marathons' | 'comebacks';

interface BoardDef {
  joins: string;
  where: string;
  order: string;
  // when true, the DEFAULT view restricts to tour-level events (G/M/A/F);
  // Davis Cup (D) / Olympics (O) team ties are default-hidden but reachable
  // via the includeTeamEvents toggle.
  tourDefault?: boolean;
}

const BOARD_SQL: Record<MpBoard, BoardDef> = {
  blowouts: {
    joins: '',
    where: 'm.won AND ms.is_completed',
    // Most lopsided first; ties broken by the QUALITY of the player on the wrong
    // end (better rank = lower number sorts first), so "bageled a top-20" beats
    // "bageled #600" and you never get a wall of identical unknowns. Unranked
    // losers sort last.
    order: 'ms.games_won_loser ASC, ms.sets_won_winner DESC, '
         + 'm.opp_rank ASC NULLS LAST, ms.games_won_winner ASC, '
         + 'm.tourney_date DESC, m.match_id',
    tourDefault: true,
  },
  marathons: {
    joins: 'JOIN mp_match_facts mf ON m.match_id = mf.match_id',
    where: 'm.won AND ms.is_completed AND mf.minutes_plausible',
    order: 'm.minutes DESC, m.match_id',
  },
  comebacks: {
    // is_comeback already implies a completed best-of-5 (see the gate).
    joins: 'JOIN mp_match_facts mf ON m.match_id = mf.match_id',
    where: 'm.won AND mf.is_comeback',
    order: 'm.tourney_date DESC, m.match_id',
  },
};

function likeClause(col: string, term: string): string {
  return `lower(${col}) LIKE '%${esc(term)}%'`;
}

// AND-clauses for the user filter (never relaxes the board's base gate).
function filterClauses(f: MpFilter): string {
  const out: string[] = [];
  const q = (f.q ?? '').trim().toLowerCase();
  if (q) {
    out.push(`(${likeClause('m.player_name', q)} OR ${likeClause('m.opp_name', q)} `
      + `OR ${likeClause('m.tourney_name', q)})`);
  }
  const surfs = (f.surfaces ?? []).filter((s) => REAL_SURFACES.has(s));
  if (surfs.length) {
    out.push(`m.surface IN (${surfs.map((s) => `'${esc(s)}'`).join(', ')})`);
  }
  if (f.era) {
    const start = Math.trunc(Number(f.era));
    if (Number.isFinite(start) && start > 0) {
      out.push(`EXTRACT(year FROM m.tourney_date) BETWEEN ${start} AND ${start + 9}`);
    }
  }
  return out.length ? ' AND ' + out.join(' AND ') : '';
}

export interface MpBoardOpts { includeTeamEvents?: boolean }

// Returns the top `limit` rows for a board under the filter, plus the full
// matching count (for "showing top N of M"). For tour-default boards, team
// events (Davis Cup / Olympics) are excluded unless includeTeamEvents is set.
export async function mpMatchBoard(
  board: MpBoard, filter: MpFilter, limit: number, opts: MpBoardOpts = {},
): Promise<MpMatchPage> {
  const b = BOARD_SQL[board];
  const from = `FROM matches m JOIN match_scores ms ON m.match_id = ms.match_id ${b.joins}`;
  const tour = b.tourDefault && !opts.includeTeamEvents
    ? " AND m.competition_type = 'Tour'" : '';
  const where = `${b.where}${tour}${filterClauses(filter)}`;
  const lim = Math.max(1, Math.min(200, limit | 0));
  const [rows, counted] = await Promise.all([
    query<MpMatch>(`SELECT ${MP_MATCH_COLS} ${from} WHERE ${where} `
      + `ORDER BY ${b.order} LIMIT ${lim}`),
    query<{ total: number }>(`SELECT COUNT(*) AS total ${from} WHERE ${where}`),
  ]);
  return { rows, total: Number(counted[0]?.total ?? 0) };
}

// --- per-player Match Point boards (mp_player_stats, ioc joined for display) -
// Career totals come straight from the gated aggregate (values unchanged). A
// player-name search narrows + re-ranks within the board; surface/era don't
// apply to career totals, so these boards take name only. Returns a page + the
// full matching count.
async function mpBoard(
  valueExpr: string, whereExpr: string, orderExpr: string,
  detailExpr: string, limit: number, nameQ?: string,
): Promise<MpPlayerPage> {
  let where = whereExpr;
  const q = (nameQ ?? '').trim().toLowerCase();
  if (q) where += ` AND lower(s.player_name) LIKE '%${esc(q)}%'`;
  const lim = Math.max(1, Math.min(200, limit | 0));
  const [rows, counted] = await Promise.all([
    query<MpPlayerRow>(
      `SELECT s.player_id AS player_id, s.player_name AS player_name,
              p.ioc AS ioc, s.matches AS matches,
              ${valueExpr} AS value, ${detailExpr} AS detail
         FROM mp_player_stats s
         LEFT JOIN player_summary p ON s.player_id = p.player_id
        WHERE ${where}
        ORDER BY ${orderExpr} LIMIT ${lim}`),
    query<{ total: number }>(
      `SELECT COUNT(*) AS total FROM mp_player_stats s WHERE ${where}`),
  ]);
  return { rows, total: Number(counted[0]?.total ?? 0) };
}

export const mpBagelsDished = (floor = 50, n = 15, q?: string) =>
  mpBoard('s.bagels_dished', `s.matches >= ${floor | 0} AND s.bagels_dished > 0`,
          's.bagels_dished DESC, s.matches ASC', 'NULL', n, q);
export const mpBreadsticksDished = (floor = 50, n = 15, q?: string) =>
  mpBoard('s.breadsticks_dished', `s.matches >= ${floor | 0} AND s.breadsticks_dished > 0`,
          's.breadsticks_dished DESC, s.matches ASC', 'NULL', n, q);
export const mpTiebreaksPlayed = (floor = 50, n = 15, q?: string) =>
  mpBoard('s.tiebreaks_played', `s.matches >= ${floor | 0} AND s.tiebreaks_played > 0`,
          's.tiebreaks_played DESC',
          `CAST(s.tiebreaks_won AS VARCHAR) || ' won'`, n, q);
export const mpTiebreakRate = (floor = 100, n = 15, q?: string) =>
  mpBoard('s.tiebreaks_won * 1.0 / s.tiebreaks_played',
          `s.tiebreaks_played >= ${floor | 0}`,
          's.tiebreaks_won * 1.0 / s.tiebreaks_played DESC',
          `CAST(s.tiebreaks_won AS VARCHAR) || ' / ' || CAST(s.tiebreaks_played AS VARCHAR)`, n, q);
export const mpMostRetired = (n = 15, q?: string) =>
  mpBoard('s.retired', 's.retired > 0', 's.retired DESC, s.matches DESC', 'NULL', n, q);
export const mpWonByRetirement = (n = 15, q?: string) =>
  mpBoard('s.wins_by_retirement', 's.wins_by_retirement > 0',
          's.wins_by_retirement DESC, s.matches DESC', 'NULL', n, q);

// --- match-length distribution (minutes-based → coverage carried) -----------
const REAL_SURFACES = new Set(['Hard', 'Clay', 'Grass', 'Carpet']);
export async function mpLengthBySurface(): Promise<MpSurfaceLength[]> {
  const rows = await query<MpSurfaceLength>(
    `SELECT m.surface AS surface,
            COUNT(*) AS total,
            COUNT(CASE WHEN mf.minutes_plausible THEN 1 END) AS with_minutes,
            AVG(CASE WHEN mf.minutes_plausible THEN m.minutes END) AS avg_minutes
       FROM matches m
       JOIN match_scores ms ON m.match_id = ms.match_id
       JOIN mp_match_facts mf ON m.match_id = mf.match_id
      WHERE m.won AND ms.is_completed
      GROUP BY m.surface ORDER BY total DESC`);
  return rows.filter((r) => REAL_SURFACES.has(r.surface));
}

// Distribution of completed-match durations in fixed-width minute buckets,
// over plausible-minutes matches only.
export function mpLengthHistogram(width = 30): Promise<MpLengthBucket[]> {
  const w = Math.max(5, width | 0);
  return query<MpLengthBucket>(
    `SELECT CAST(FLOOR(m.minutes / ${w}) * ${w} AS INTEGER) AS bucket,
            COUNT(*) AS n
       FROM matches m
       JOIN match_scores ms ON m.match_id = ms.match_id
       JOIN mp_match_facts mf ON m.match_id = mf.match_id
      WHERE m.won AND ms.is_completed AND mf.minutes_plausible
      GROUP BY bucket ORDER BY bucket`);
}

// --- family landing: "On this day" + daily puzzle --------------------------
// Matches whose tourney_date falls on any of the given month-day keys
// (month*100 + day), across all years (2000+). Curated server-side: finals
// first, then tournament prestige, then round depth, then most recent.
export function matchesOnDates(mmdds: number[], limit = 8): Promise<MpMatch[]> {
  const set = Array.from(new Set(mmdds.filter((n) => Number.isFinite(n)).map((n) => n | 0)));
  if (set.length === 0) return Promise.resolve([]);
  return query<MpMatch>(
    `SELECT ${MP_MATCH_COLS}
       FROM matches m
       JOIN match_scores ms ON m.match_id = ms.match_id
      WHERE m.won
        AND (EXTRACT(month FROM m.tourney_date) * 100
             + EXTRACT(day FROM m.tourney_date)) IN (${set.join(',')})
      ORDER BY (m.round = 'F') DESC,
        CASE m.tourney_level WHEN 'G' THEN 4 WHEN 'M' THEN 3 WHEN 'F' THEN 2
                             WHEN 'O' THEN 2 WHEN 'A' THEN 1 ELSE 0 END DESC,
        m.round_order DESC, m.tourney_date DESC, m.match_id
      LIMIT ${limit | 0}`);
}

// The daily-puzzle candidate pool: notable, guessable players. Floor stated in
// the UI. Ordered by player_id so the deterministic daily pick is stable.
export function puzzlePool(): Promise<PuzzlePlayer[]> {
  return query<PuzzlePlayer>(
    `SELECT player_id, player_name, ioc, hand,
            career_high_rank, titles, total_matches, win_pct, primary_surface,
            CAST(EXTRACT(year FROM first_match_date) AS INTEGER) AS debut_year,
            CAST(EXTRACT(year FROM last_match_date)  AS INTEGER) AS last_year
       FROM player_summary
      WHERE career_high_rank <= 30 AND total_matches >= 300
      ORDER BY player_id`);
}

// Per-surface breakdown of one directed rivalry (their actual meetings).
export function getH2HBySurface(
  id1: number | string,
  id2: number | string,
): Promise<H2HBySurfaceRow[]> {
  return query<H2HBySurfaceRow>(
    `SELECT player_id, opp_id, surface, opp_name, meetings, player_wins, opp_wins
       FROM h2h_by_surface
      WHERE player_id = ${intId(id1)} AND opp_id = ${intId(id2)}
      ORDER BY meetings DESC`,
  );
}
