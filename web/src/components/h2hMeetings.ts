// H2H deep-dive pieces: the full chronological meetings list (scoreline-as-hero,
// reusing the Match Point match card) and a context strip of honest facts. Reads
// only the meetings already loaded for the pair — no new data.
import { matchCard, fmtDuration, reveal } from '../mpkit';
import { escapeHtml } from './searchBox';
import type { Meeting, MpMatch } from '../types';

const ROUND_LABEL: Record<string, string> = {
  F: 'final', SF: 'semifinal', QF: 'quarterfinal', R16: 'round of 16',
  R32: 'round of 32', R64: 'round of 64', R128: 'round of 128', RR: 'round robin',
};
const TIER_RANK: Record<string, number> = { G: 5, F: 4, M: 3, O: 2, A: 1, D: 0 };
const ROUND_ORD: Record<string, number> = { F: 7, SF: 6, QF: 5, R16: 4, R32: 3, R64: 2, R128: 1, RR: 0 };
const pluralRound = (r: string | null) => {
  const base = roundLabel(r); // "final", "semifinal", "round of 16"…
  return base ? `${base}s` : 'matches';
};
const roundLabel = (r: string | null) => (r ? ROUND_LABEL[r] ?? r.toLowerCase() : '');
const yr = (d: string) => (d || '').slice(0, 4);

// Map one meeting (idA-perspective) to an MpMatch so matchCard can render it.
function toMatch(m: Meeting, idA: string, idB: string, nameA: string, nameB: string): MpMatch {
  const aWon = m.won;
  return {
    match_id: '', winner_id: Number(aWon ? idA : idB), winner_name: aWon ? nameA : nameB,
    loser_id: Number(aWon ? idB : idA), loser_name: aWon ? nameB : nameA,
    set_scores: m.score ?? '', tourney_name: m.tourney_name, surface: m.surface,
    date: m.date, round: m.round, level_label: m.level_label, best_of: null,
    minutes: m.minutes, loser_rank: null,
    games_won_winner: null, games_won_loser: null, sets_won_winner: null, sets_won_loser: null,
  };
}

// Full meetings list, most-recent first. Count equals the H2H total (walkovers
// and retirements are meetings too — they show as W/O / RET).
export function meetingsList(
  meetings: Meeting[], idA: string, idB: string, nameA: string, nameB: string,
): HTMLElement {
  const sec = document.createElement('section');
  sec.className = 'panel h2h-meetings';
  sec.innerHTML = `<p class="eyebrow">Every meeting · ${meetings.length} matches, most recent first</p>`;
  const list = document.createElement('div');
  list.className = 'mp-matchlist';
  [...meetings].reverse().forEach((m) => {
    list.appendChild(matchCard(toMatch(m, idA, idB, nameA, nameB), {
      badge: m.round === 'F' ? 'Final' : undefined,
    }));
  });
  sec.appendChild(list);
  // Match cards start at opacity:0 and only become visible once `.in` is added;
  // without this the whole list renders as a blank gap below the header.
  reveal(list.querySelectorAll<HTMLElement>('.mp-match'));
  return sec;
}

// A strip of honest, data-supported facts about the rivalry.
export function contextStrip(
  meetings: Meeting[], nameA: string, nameB: string,
): HTMLElement {
  const sec = document.createElement('section');
  sec.className = 'panel h2h-context';
  const chrono = [...meetings];           // oldest first (as loaded)
  const recent = [...meetings].reverse(); // newest first
  const winnerName = (m: Meeting) => (m.won ? nameA : nameB);

  const facts: Array<{ label: string; value: string; sub?: string }> = [];

  const first = chrono[0];
  facts.push({ label: 'First met', value: `${escapeHtml(first.tourney_name ?? '')} ${yr(first.date)}`,
    sub: `${escapeHtml(winnerName(first))} won` });

  const last = recent[0];
  facts.push({ label: 'Most recent', value: `${escapeHtml(last.tourney_name ?? '')} ${yr(last.date)}`,
    sub: `${escapeHtml(winnerName(last))} won` });

  // biggest stage: highest tier present, then highest round within that tier.
  // Count how many meetings happened at that top stage — if more than one
  // (e.g. nine Grand Slam finals), the count + breakdown IS the fact. Different
  // Slams at the same tier+round are equal: we list/count them, never rank them.
  const tierOf = (m: Meeting) => TIER_RANK[m.tourney_level ?? ''] ?? -1;
  const roundOf = (m: Meeting) => ROUND_ORD[m.round ?? ''] ?? -1;
  const topTier = Math.max(...meetings.map(tierOf));
  const inTier = meetings.filter((m) => tierOf(m) === topTier);
  const topRound = Math.max(...inTier.map(roundOf));
  const topStage = inTier.filter((m) => roundOf(m) === topRound);
  const lvl = topStage[0].level_label ?? '';
  if (topStage.length === 1) {
    const m = topStage[0];
    facts.push({ label: 'Biggest stage',
      value: `${escapeHtml(m.tourney_name ?? '')} ${yr(m.date)}`,
      sub: `${escapeHtml(lvl)} ${roundLabel(m.round)} · ${escapeHtml(winnerName(m))}` });
  } else {
    const byT = new Map<string, number>();
    for (const m of topStage) byT.set(m.tourney_name ?? '—', (byT.get(m.tourney_name ?? '—') ?? 0) + 1);
    const recent = yr(topStage.reduce((a, b) => ((b.date || '') > (a.date || '') ? b : a)).date);
    const parts = [...byT.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([t, n]) => `${escapeHtml(t)} ×${n}`);
    facts.push({ label: 'Biggest stage',
      value: `${topStage.length} ${escapeHtml(lvl)} ${pluralRound(topStage[0].round)}`,
      sub: `${parts.join(' · ')} — last ${recent}` });
  }

  // longest match by recorded time (coverage caveat)
  const timed = meetings.filter((m) => m.minutes != null && m.minutes > 0);
  if (timed.length) {
    const longest = timed.reduce((a, b) => ((b.minutes ?? 0) > (a.minutes ?? 0) ? b : a));
    const caveat = timed.length < meetings.length ? ` · ${timed.length}/${meetings.length} timed` : '';
    facts.push({ label: 'Longest match', value: fmtDuration(longest.minutes),
      sub: `${escapeHtml(longest.tourney_name ?? '')} ${yr(longest.date)}${caveat}` });
  }

  // current streak: consecutive most-recent wins by the same player
  let streak = 1;
  for (let i = 1; i < recent.length && recent[i].won === recent[0].won; i++) streak++;
  facts.push({ label: 'Current streak',
    value: `${escapeHtml(winnerName(recent[0]))}`,
    sub: streak > 1 ? `won the last ${streak}` : 'won the most recent' });

  sec.innerHTML = `<p class="eyebrow">The rivalry, in facts</p>`
    + `<div class="h2h-context__grid">${facts.map((f) => `
      <div class="h2h-fact">
        <span class="h2h-fact__label">${f.label}</span>
        <span class="h2h-fact__value">${f.value}</span>
        ${f.sub ? `<span class="h2h-fact__sub faint">${f.sub}</span>` : ''}
      </div>`).join('')}</div>`;
  return sec;
}
