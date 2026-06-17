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
  H2HBySurfaceRow, Meeting,
} from './types';

const TABLES = [
  'surface_splits', 'player_summary', 'h2h', 'h2h_by_surface', 'matches',
  'rankings',
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
