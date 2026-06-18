// "Number of the day" — one deterministic surfaced fact that rotates daily.
// Same date-hash discipline as the puzzle (FNV-1a, identical JS/Python), salted
// so it doesn't track the puzzle's pick. Every entry reads an EXISTING gated
// leaderboard (no new precision); the pool order is fixed so the pick is stable.
import {
  lbWins, lbTitles, lbWeeksNo1, lbWinPct, lbSurface, lbRivalries,
  mpTiebreaksPlayed, mpTiebreakRate, mpBagelsDished,
} from '../db';
import { escapeHtml } from '../components/searchBox';
import { fnv1a } from './puzzle';

export interface NumberOfDay {
  fig: string; unit: string; who: string; href?: string; surface?: string;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

async function surfaceStat(s: string): Promise<NumberOfDay | null> {
  const r = (await lbSurface(s, 100, 1))[0];
  return r ? { fig: pct(r.value), unit: `win rate on ${s.toLowerCase()} · min 100`,
    who: r.player_name, href: `#/player/${r.player_id}`, surface: s } : null;
}

// Fixed order — the daily index is taken against this list (mirrored in Python).
const POOL: Array<() => Promise<NumberOfDay | null>> = [
  async () => { const r = (await lbWins(1))[0]; return r ? { fig: `${r.value}`, unit: 'career match wins', who: r.player_name, href: `#/player/${r.player_id}` } : null; },
  async () => { const r = (await lbTitles(1))[0]; return r ? { fig: `${r.value}`, unit: 'tour-level titles', who: r.player_name, href: `#/player/${r.player_id}` } : null; },
  async () => { const r = (await lbWeeksNo1(1))[0]; return r ? { fig: `${r.value}`, unit: 'weeks at world No. 1', who: r.player_name, href: `#/player/${r.player_id}` } : null; },
  async () => { const r = (await lbWinPct(200, 1))[0]; return r ? { fig: pct(r.value), unit: 'career win rate · min 200', who: r.player_name, href: `#/player/${r.player_id}` } : null; },
  () => surfaceStat('Clay'),
  () => surfaceStat('Grass'),
  () => surfaceStat('Hard'),
  async () => { const r = (await lbRivalries(1))[0]; return r ? { fig: `${r.meetings}`, unit: 'career meetings', who: `${r.a_name} v ${r.b_name}`, href: `#/h2h/${r.a_id}/${r.b_id}` } : null; },
  async () => { const r = (await mpTiebreaksPlayed(50, 1)).rows[0]; return r ? { fig: `${r.value}`, unit: 'tour tiebreaks played', who: r.player_name, href: `#/player/${r.player_id}` } : null; },
  async () => { const r = (await mpTiebreakRate(100, 1)).rows[0]; return r ? { fig: pct(r.value), unit: 'tiebreaks won · min 100', who: r.player_name, href: `#/player/${r.player_id}` } : null; },
  async () => { const r = (await mpBagelsDished(50, 1)).rows[0]; return r ? { fig: `${r.value}`, unit: 'bagels dished · 6–0 sets', who: r.player_name, href: `#/player/${r.player_id}` } : null; },
];

// Deterministic pick for the given date seed (e.g. "2026-06-18").
export function numberOfDayIndex(seed: string): number {
  return fnv1a(`number:${seed}`) % POOL.length;
}

export async function renderNumberOfDay(host: HTMLElement, seed: string): Promise<void> {
  let nd: NumberOfDay | null = null;
  try {
    nd = await POOL[numberOfDayIndex(seed)]();
  } catch (err) {
    console.error('Landing: number of the day failed —', err);
  }
  if (!nd) { host.remove(); return; }
  const whoLink = nd.href
    ? `<a href="${nd.href}">${escapeHtml(nd.who)}</a>` : escapeHtml(nd.who);
  host.innerHTML = `
    <p class="eyebrow">Number of the day</p>
    <p class="lp-number__fig tnum">${escapeHtml(nd.fig)}</p>
    <p class="lp-number__unit">${escapeHtml(nd.unit)}</p>
    <p class="lp-number__who">${whoLink}</p>`;
}
