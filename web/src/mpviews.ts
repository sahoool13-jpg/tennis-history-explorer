// Match Point views — score-led, now explorable. Each section opens with a
// one-line takeaway, then a filterable, paged board. Match boards (Blowouts,
// Marathons, Comebacks) filter by search + surface + era and re-rank within the
// filter; career player boards filter by player name. All integrity gates live
// in the db.ts base queries — filters only narrow them.
import {
  mpBagelsDished, mpBreadsticksDished, mpTiebreaksPlayed, mpTiebreakRate,
  mpMostRetired, mpWonByRetirement,
  mpTiebreakRates, mpMarathonScatter, mpMinutesCoverage,
  mpComebacksByTier, mpBlowoutSurfaceMix,
} from './db';
import { mpHeader, mpTakeaway, loadingLine, fmtDuration } from './mpkit';
import { matchExplorer, playerExplorer } from './mpexplore';
import type { PlayerBoardSpec } from './mpexplore';
import {
  chartPanel, tiebreakHistogram, marathonScatter, comebackTierBars, blowoutSurfaceStack,
} from './mpcharts';
import type { MpPlayerRow } from './types';

// floors, declared once so the UI copy and the query stay in lockstep
const FLOOR_BAGEL = 50;
const FLOOR_TB = 50;
const FLOOR_TB_RATE = 100;

const intFmt = (r: MpPlayerRow) => `${r.value}`;
const pctFmt = (r: MpPlayerRow) => `${(r.value * 100).toFixed(1)}%`;

function subhead(eyebrow: string, title: string): HTMLElement {
  const h = document.createElement('div');
  h.className = 'mp-subhead';
  h.innerHTML = `<p class="eyebrow">${eyebrow}</p><h2 class="lp-h2">${title}</h2>`;
  return h;
}

// Overview chart slot: append immediately, fill async; vanish quietly on error
// (the ranked list below is the source of truth, the chart is enrichment).
function chartSlot(mount: HTMLElement, build: () => Promise<HTMLElement>): void {
  const host = document.createElement('div');
  host.appendChild(loadingLine());
  mount.appendChild(host);
  build()
    .then((el) => host.replaceChildren(el))
    .catch((err) => { console.error('Match Point chart failed —', err); host.remove(); });
}

// 1) BLOWOUTS -----------------------------------------------------------------
export function renderBlowouts(mount: HTMLElement): Promise<void> {
  mount.replaceChildren();
  mount.style.removeProperty('--accent');
  mount.appendChild(mpHeader('Blowouts',
    'Tour-level blowouts, most lopsided first — ties broken by the quality of '
    + 'the player on the wrong end, so a top-20 getting bageled outranks a '
    + 'no-name. Completed matches only; a retirement is never a blowout. Davis '
    + 'Cup and Olympic ties are hidden by default — add them with the toggle.'));
  mount.appendChild(mpTakeaway('Fewest games dropped — and the bigger the name bageled, the higher it ranks.'));
  chartSlot(mount, async () => {
    const mix = await mpBlowoutSurfaceMix(false, 3);
    const total = mix.reduce((a, r) => a + r.n, 0);
    return chartPanel('Where blowouts happen', blowoutSurfaceStack(mix),
      `Surface mix of the <strong>${total.toLocaleString()}</strong> tour-level blowouts — completed matches won dropping ≤3 games.`);
  });
  mount.appendChild(matchExplorer({
    board: 'blowouts',
    badge: (m) => `${m.games_won_loser} games dropped`,
    showLoserRank: true,
    teamToggle: true,
  }));
  mount.appendChild(subhead('Who dishes them out', 'Bagels & breadsticks'));
  mount.appendChild(playerExplorer([
    { title: 'Most bagels dished', caption: `6–0 sets won · min ${FLOOR_BAGEL} matches`,
      fetch: (n, q) => mpBagelsDished(FLOOR_BAGEL, n, q), fmt: intFmt },
    { title: 'Most breadsticks dished', caption: `6–1 sets won · min ${FLOOR_BAGEL} matches`,
      fetch: (n, q) => mpBreadsticksDished(FLOOR_BAGEL, n, q), fmt: intFmt },
  ]));
  return Promise.resolve();
}

// 2) MARATHONS ----------------------------------------------------------------
export function renderMarathons(mount: HTMLElement): Promise<void> {
  mount.replaceChildren();
  mount.style.removeProperty('--accent');
  mount.appendChild(mpHeader('Marathons',
    'Tour-level matches, longest by playing time first. Minutes-based: duration '
    + 'depends on times being recorded, and implausible durations are filtered '
    + 'out — a filtered list is still "longest recorded, plausible only." The '
    + 'opponent rank is shown for context but never changes the order — minutes '
    + 'is the metric. Davis Cup / Olympics are hidden by default; add them with '
    + 'the toggle.'));
  mount.appendChild(mpTakeaway('The five-set marathons live at the top — almost all on the slow stuff or the grass.'));
  chartSlot(mount, async () => {
    const [pts, cov] = await Promise.all([mpMarathonScatter(false, 240), mpMinutesCoverage(false)]);
    const pct = cov.total ? Math.round((100 * cov.with_minutes) / cov.total) : 0;
    return chartPanel('Marathons over time', marathonScatter(pts),
      `Tour-level matches of <strong>4 hours or more</strong> (${pts.length}), by year. `
      + `Minutes-based: only matches with a recorded, plausible time are plotted — `
      + `times exist for ${pct}% of tour completed matches, so read the cloud as a sample, not a census.`);
  });
  mount.appendChild(matchExplorer({
    board: 'marathons',
    badge: (m) => fmtDuration(m.minutes),
    showLoserRank: true,
    teamToggle: true,
    emptyHint: 'No timed matches found for that filter — try widening it.',
  }));
  return Promise.resolve();
}

// 3) TIEBREAKS ----------------------------------------------------------------
export function renderTiebreaks(mount: HTMLElement): Promise<void> {
  mount.replaceChildren();
  mount.style.removeProperty('--accent');
  mount.appendChild(mpHeader('Tiebreaks',
    'Who lives in the tiebreak, and who wins it. Counts tour-level matches by '
    + 'default (so Davis Cup tiebreaks don’t pad the totals) — add team events '
    + 'with the toggle. Win rate applies a minimum so a few good breakers can’t '
    + 'top a career of them. Search by player to find anyone.'));
  mount.appendChild(mpTakeaway('The biggest servers play the most tiebreaks — but the best win rates belong to the all-court greats.'));
  chartSlot(mount, async () => {
    const rates = await mpTiebreakRates(FLOOR_TB_RATE, false);
    return chartPanel('Where the win rates sit', tiebreakHistogram(rates),
      `Career tiebreak win rate across the <strong>${rates.length}</strong> players with `
      + `${FLOOR_TB_RATE}+ tour tiebreaks. The field clusters near 50%; the leaders (marked) sit out on the right.`);
  });
  mount.appendChild(playerExplorer([
    { title: 'Most tiebreaks played', caption: `Set tiebreaks · min ${FLOOR_TB} matches`,
      fetch: (n, q, team) => mpTiebreaksPlayed(FLOOR_TB, n, q, team), fmt: intFmt },
    { title: 'Best tiebreak win rate', caption: `min ${FLOOR_TB_RATE} tiebreaks played`,
      fetch: (n, q, team) => mpTiebreakRate(FLOOR_TB_RATE, n, q, team), fmt: pctFmt },
  ], { teamToggle: true }));
  return Promise.resolve();
}

// 4) COMEBACKS ----------------------------------------------------------------
export function renderComebacks(mount: HTMLElement): Promise<void> {
  mount.replaceChildren();
  mount.style.removeProperty('--accent');
  mount.appendChild(mpHeader('Comebacks',
    'Best-of-five matches won after losing the first two sets — tennis’s '
    + 'deepest holes, climbed out of. Completed matches only, ordered by the '
    + 'quality of the opponent fought past (a comeback over a top seed ranks '
    + 'highest); recency breaks ties. Tour-level by default — add Davis Cup / '
    + 'Olympics with the toggle.'));
  mount.appendChild(mpTakeaway('Two sets to love down — and the bigger the name you beat, the higher it ranks.'));
  chartSlot(mount, async () => {
    const tiers = await mpComebacksByTier(false);
    const total = tiers.reduce((a, r) => a + r.n, 0);
    return chartPanel('Comebacks by opponent rank', comebackTierBars(tiers),
      `The <strong>${total.toLocaleString()}</strong> tour-level two-sets-down comebacks, by the rank of the player fought past. A comeback over a Top-10 (marked) is the rare one.`);
  });
  mount.appendChild(matchExplorer({
    board: 'comebacks',
    showLoserRank: true,
    teamToggle: true,
    emptyHint: 'No comebacks found for that filter — try widening it.',
  }));
  return Promise.resolve();
}

// 5) RETIREMENTS --------------------------------------------------------------
export function renderRetirements(mount: HTMLElement): Promise<void> {
  mount.replaceChildren();
  mount.style.removeProperty('--accent');
  mount.appendChild(mpHeader('Retirements',
    'A separate slice, kept out of every completed-match board. When a match '
    + 'ends early, the player who stops is the loser of record — these boards '
    + 'count those endings, not how anyone played. Search by player.'));
  mount.appendChild(mpTakeaway('Retirements are match outcomes, not scorelines — they sit on their own.'));
  mount.appendChild(playerExplorer([
    { title: 'Most retirements', caption: 'Matches the player retired from',
      fetch: (n, q) => mpMostRetired(n, q), fmt: intFmt },
    { title: 'Most wins by opponent retirement', caption: 'Matches won when the opponent retired',
      fetch: (n, q) => mpWonByRetirement(n, q), fmt: intFmt },
  ] as PlayerBoardSpec[]));
  return Promise.resolve();
}
