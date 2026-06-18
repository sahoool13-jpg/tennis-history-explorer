// Match Point views — score-led, now explorable. Each section opens with a
// one-line takeaway, then a filterable, paged board. Match boards (Blowouts,
// Marathons, Comebacks) filter by search + surface + era and re-rank within the
// filter; career player boards filter by player name. All integrity gates live
// in the db.ts base queries — filters only narrow them.
import {
  mpBagelsDished, mpBreadsticksDished, mpTiebreaksPlayed, mpTiebreakRate,
  mpMostRetired, mpWonByRetirement, mpLengthBySurface, mpLengthHistogram,
} from './db';
import { mpHeader, mpTakeaway, loadingLine, fmtDuration, errorCard } from './mpkit';
import { matchExplorer, playerExplorer } from './mpexplore';
import type { PlayerBoardSpec } from './mpexplore';
import { surfaceColor } from './palette';
import type { MpPlayerRow, MpLengthBucket, MpSurfaceLength } from './types';

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
    'The longest matches by playing time. Minutes-based: duration depends on '
    + 'times being recorded, and implausible durations are filtered out — so '
    + 'a filtered list is still "longest recorded, plausible only." '
    + 'Search or filter by surface or era; the list re-ranks by minutes.'));
  mount.appendChild(mpTakeaway('The five-set marathons live at the top — almost all on the slow stuff or the grass.'));
  mount.appendChild(matchExplorer({
    board: 'marathons',
    badge: (m) => fmtDuration(m.minutes),
    emptyHint: 'No timed matches found for that filter — try widening it.',
  }));

  // global match-length distribution (overview, not part of the filtered list)
  mount.appendChild(subhead('Overview', 'How long matches run'));
  const distHost = document.createElement('div');
  distHost.appendChild(loadingLine());
  mount.appendChild(distHost);
  void (async () => {
    try {
      const [bySurface, hist] = await Promise.all([mpLengthBySurface(), mpLengthHistogram(30)]);
      distHost.replaceChildren(lengthDistribution(hist, bySurface));
    } catch (err) {
      console.error('Match Point: length distribution failed —', err);
      distHost.replaceChildren(errorCard('How long matches run'));
    }
  })();
  return Promise.resolve();
}

// 3) TIEBREAKS ----------------------------------------------------------------
export function renderTiebreaks(mount: HTMLElement): Promise<void> {
  mount.replaceChildren();
  mount.style.removeProperty('--accent');
  mount.appendChild(mpHeader('Tiebreaks',
    'Who lives in the tiebreak, and who wins it. Win rate applies a minimum so '
    + 'a few good breakers can’t top a career of them. Search by player to find '
    + 'anyone; the boards re-rank within your search.'));
  mount.appendChild(mpTakeaway('The biggest servers play the most tiebreaks — but the best win rates belong to the all-court greats.'));
  mount.appendChild(playerExplorer([
    { title: 'Most tiebreaks played', caption: `Set tiebreaks · min ${FLOOR_TB} matches`,
      fetch: (n, q) => mpTiebreaksPlayed(FLOOR_TB, n, q), fmt: intFmt },
    { title: 'Best tiebreak win rate', caption: `min ${FLOOR_TB_RATE} tiebreaks played`,
      fetch: (n, q) => mpTiebreakRate(FLOOR_TB_RATE, n, q), fmt: pctFmt },
  ]));
  return Promise.resolve();
}

// 4) COMEBACKS ----------------------------------------------------------------
export function renderComebacks(mount: HTMLElement): Promise<void> {
  mount.replaceChildren();
  mount.style.removeProperty('--accent');
  mount.appendChild(mpHeader('Comebacks',
    'Best-of-five matches won after losing the first two sets — tennis’s '
    + 'deepest holes, climbed out of. Completed matches only. Search a player '
    + 'or tournament, or filter by surface or era.'));
  mount.appendChild(mpTakeaway('Two sets to love down, and still won in five. Most recent first.'));
  mount.appendChild(matchExplorer({
    board: 'comebacks',
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

// --- global match-length distribution: histogram + per-surface coverage -----
function lengthDistribution(
  hist: MpLengthBucket[], bySurface: MpSurfaceLength[],
): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'panel mp-dist';
  const totalAll = bySurface.reduce((a, s) => a + s.total, 0);
  const withMin = bySurface.reduce((a, s) => a + s.with_minutes, 0);
  const cov = totalAll > 0 ? Math.round((100 * withMin) / totalAll) : 0;

  wrap.innerHTML = `
    <p class="lb-cap faint">All completed matches with a plausible recorded time
      (the full data, not your filter above). Times recorded for ${cov}% of
      completed matches — duration data depends on recording, so read these as a
      sample, not a census.</p>`;
  wrap.appendChild(histogramSvg(hist));

  const rows = document.createElement('div');
  rows.className = 'mp-surf-cov';
  bySurface.forEach((s) => {
    const c = surfaceColor(s.surface);
    const scov = s.total > 0 ? Math.round((100 * s.with_minutes) / s.total) : 0;
    const avg = s.avg_minutes != null ? fmtDuration(Math.round(s.avg_minutes)) : '—';
    const row = document.createElement('div');
    row.className = 'mp-surf-cov__row mp-rise in';
    row.innerHTML = `
      <span class="mp-surf-cov__name"><span class="mp-dot" style="--c:${c}"></span>${s.surface}</span>
      <span class="mp-surf-cov__avg tnum">${avg}<small> avg</small></span>
      <span class="mp-surf-cov__cov faint tnum">${scov}% timed · ${s.total.toLocaleString()} matches</span>`;
    rows.appendChild(row);
  });
  wrap.appendChild(rows);
  return wrap;
}

function histogramSvg(hist: MpLengthBucket[]): SVGSVGElement {
  const W = 720, H = 240, ml = 16, mr = 16, mt = 12, mb = 28;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'mp-hist-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Distribution of completed match durations');
  if (hist.length === 0) return svg;

  const width = hist.length > 1 ? hist[1].bucket - hist[0].bucket : 30;
  const minB = hist[0].bucket;
  const maxB = hist[hist.length - 1].bucket + width;
  const maxN = Math.max(...hist.map((b) => b.n));
  const x = (v: number) => ml + ((v - minB) / (maxB - minB)) * (W - ml - mr);
  const y = (v: number) => mt + (1 - v / maxN) * (H - mt - mb);

  const accent = 'var(--mp-accent)';
  let bars = '';
  for (const b of hist) {
    const bx = x(b.bucket), bw = Math.max(1, x(b.bucket + width) - bx - 1.5);
    const by = y(b.n), bh = H - mb - by;
    bars += `<rect class="mp-bar in" x="${bx.toFixed(1)}" y="${by.toFixed(1)}" `
      + `width="${bw.toFixed(1)}" height="${Math.max(0, bh).toFixed(1)}" `
      + `rx="1.5" fill="${accent}"></rect>`;
  }
  let ticks = '';
  for (let t = Math.ceil(minB / 60) * 60; t <= maxB; t += 60) {
    const tx = x(t);
    ticks += `<line class="mp-hist-grid" x1="${tx.toFixed(1)}" y1="${mt}" x2="${tx.toFixed(1)}" y2="${H - mb}"></line>`
      + `<text class="mp-hist-lab" x="${tx.toFixed(1)}" y="${H - mb + 18}" text-anchor="middle">${t / 60}h</text>`;
  }
  svg.innerHTML = ticks + bars;
  return svg;
}
