// Match Point views — the score-led leaderboards. Each reads verified data via
// db.ts (no re-parsing), opens with a one-line editorial takeaway, and reuses
// the shared design language. Player names cross-link to Rally.
import {
  mpLongestMatches, mpBiggestBlowouts, mpComebacks,
  mpBagelsDished, mpBreadsticksDished, mpTiebreaksPlayed, mpTiebreakRate,
  mpMostRetired, mpWonByRetirement, mpLengthBySurface, mpLengthHistogram,
} from './db';
import {
  mpHeader, mpTakeaway, loadingLine, matchCard, playerBoard, errorCard,
  fmtDuration, reveal,
} from './mpkit';
import { surfaceColor } from './palette';
import type { MpMatch, MpPlayerRow, MpLengthBucket, MpSurfaceLength } from './types';

// thresholds, declared once so the UI copy and the query stay in lockstep
const FLOOR_BAGEL = 50;
const FLOOR_TB = 50;
const FLOOR_TB_RATE = 100;

const intFmt = (r: MpPlayerRow) => `${r.value}`;
const pctFmt = (r: MpPlayerRow) => `${(r.value * 100).toFixed(1)}%`;

function matchList(matches: MpMatch[], badge?: (m: MpMatch) => string): HTMLElement {
  const list = document.createElement('div');
  list.className = 'mp-matchlist';
  matches.forEach((m, i) => {
    list.appendChild(matchCard(m, { rank: i + 1, badge: badge ? badge(m) : undefined }));
  });
  return list;
}

async function withLoading(
  mount: HTMLElement, title: string, standfirst: string,
  build: () => Promise<HTMLElement[]>,
): Promise<void> {
  mount.replaceChildren();
  mount.style.removeProperty('--accent');
  mount.appendChild(mpHeader(title, standfirst));
  const loading = loadingLine();
  mount.appendChild(loading);
  let nodes: HTMLElement[];
  try {
    nodes = await build();
  } catch (err) {
    console.error(`Match Point: "${title}" failed —`, err);
    loading.remove();
    mount.appendChild(errorCard(title));
    return;
  }
  loading.remove();
  nodes.forEach((n) => mount.appendChild(n));
}

// 1) BLOWOUTS -----------------------------------------------------------------
export function renderBlowouts(mount: HTMLElement): Promise<void> {
  return withLoading(mount, 'Blowouts',
    'The most lopsided matches on tour, and the players who hand out the '
    + 'shutouts. Completed matches only — a retirement is never a blowout.',
    async () => {
      const [blow, bagels, bread] = await Promise.all([
        mpBiggestBlowouts(12), mpBagelsDished(FLOOR_BAGEL, 10),
        mpBreadsticksDished(FLOOR_BAGEL, 10),
      ]);
      const out: HTMLElement[] = [];
      out.push(mpTakeaway('Fewest games dropped: a clean double bagel concedes nothing at all.'));
      out.push(matchList(blow, (m) => `${m.games_won_loser} games dropped`));
      const grid = document.createElement('div');
      grid.className = 'records-grid';
      grid.append(
        playerBoard('Most bagels dished', `6–0 sets won · min ${FLOOR_BAGEL} matches`, bagels, intFmt),
        playerBoard('Most breadsticks dished', `6–1 sets won · min ${FLOOR_BAGEL} matches`, bread, intFmt),
      );
      out.push(grid);
      queueReveal(mount);
      return out;
    });
}

// 2) MARATHONS ----------------------------------------------------------------
export function renderMarathons(mount: HTMLElement): Promise<void> {
  return withLoading(mount, 'Marathons',
    'The longest matches by playing time, and how match length is distributed. '
    + 'These are minutes-based: duration depends on times being recorded, and '
    + 'coverage is shown throughout. Implausible durations (the raw data has a '
    + 'few) are filtered out.',
    async () => {
      const [longest, bySurface, hist] = await Promise.all([
        mpLongestMatches(12), mpLengthBySurface(), mpLengthHistogram(30),
      ]);
      const out: HTMLElement[] = [];
      out.push(mpTakeaway('The five-set marathons live at the top — and they are almost all on the slow stuff or the grass.'));
      out.push(matchList(longest, (m) => fmtDuration(m.minutes)));
      out.push(lengthDistribution(hist, bySurface));
      queueReveal(mount);
      return out;
    });
}

// 3) TIEBREAKS ----------------------------------------------------------------
export function renderTiebreaks(mount: HTMLElement): Promise<void> {
  return withLoading(mount, 'Tiebreaks',
    'Who lives in the tiebreak, and who wins it. Win rate applies a minimum so a '
    + 'few good breakers can\'t top a career of them.',
    async () => {
      const [played, rate] = await Promise.all([
        mpTiebreaksPlayed(FLOOR_TB, 10), mpTiebreakRate(FLOOR_TB_RATE, 10),
      ]);
      const out: HTMLElement[] = [];
      out.push(mpTakeaway('The biggest servers play the most tiebreaks — but the best win rates belong to the all-court greats.'));
      const grid = document.createElement('div');
      grid.className = 'records-grid';
      grid.append(
        playerBoard('Most tiebreaks played', `Set tiebreaks · min ${FLOOR_TB} matches`, played, intFmt),
        playerBoard('Best tiebreak win rate', `min ${FLOOR_TB_RATE} tiebreaks played`, rate, pctFmt),
      );
      out.push(grid);
      queueReveal(mount);
      return out;
    });
}

// 4) COMEBACKS ----------------------------------------------------------------
export function renderComebacks(mount: HTMLElement): Promise<void> {
  return withLoading(mount, 'Comebacks',
    'Best-of-five matches won after losing the first two sets — tennis\'s deepest '
    + 'holes, climbed out of. Completed matches only.',
    async () => {
      const matches = await mpComebacks(16);
      const out: HTMLElement[] = [];
      out.push(mpTakeaway('Two sets to love down, and still won in five. Most recent first.'));
      out.push(matchList(matches));
      queueReveal(mount);
      return out;
    });
}

// 5) RETIREMENTS --------------------------------------------------------------
export function renderRetirements(mount: HTMLElement): Promise<void> {
  return withLoading(mount, 'Retirements',
    'A separate slice, kept out of every completed-match board. When a match '
    + 'ends early, the player who stops is the loser of record — these boards '
    + 'count those endings, not how anyone played.',
    async () => {
      const [retired, byRet] = await Promise.all([
        mpMostRetired(10), mpWonByRetirement(10),
      ]);
      const out: HTMLElement[] = [];
      out.push(mpTakeaway('Retirements are match outcomes, not scorelines — they sit on their own.'));
      const grid = document.createElement('div');
      grid.className = 'records-grid';
      grid.append(
        playerBoard('Most retirements', 'Matches the player retired from', retired, intFmt),
        playerBoard('Most wins by opponent retirement', 'Matches won when the opponent retired', byRet, intFmt),
      );
      out.push(grid);
      queueReveal(mount);
      return out;
    });
}

// reveal once the mount has its children appended
function queueReveal(mount: HTMLElement): void {
  requestAnimationFrame(() => {
    reveal(mount.querySelectorAll<HTMLElement>('.mp-match, .lb-row, .mp-rise'));
  });
}

// --- match-length distribution: histogram + per-surface coverage ------------
function lengthDistribution(
  hist: MpLengthBucket[], bySurface: MpSurfaceLength[],
): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'panel mp-dist';
  const totalAll = bySurface.reduce((a, s) => a + s.total, 0);
  const withMin = bySurface.reduce((a, s) => a + s.with_minutes, 0);
  const cov = totalAll > 0 ? Math.round((100 * withMin) / totalAll) : 0;

  wrap.innerHTML = `
    <div class="lb-head"><h2 class="lb-title">How long matches run</h2></div>
    <p class="lb-cap faint">Completed matches with a plausible recorded time.
      Times recorded for ${cov}% of completed matches — duration data depends on
      recording, so read these as a sample, not a census.</p>`;
  wrap.appendChild(histogramSvg(hist));

  // per-surface average with its own coverage, so no surface looks authoritative
  // on thin data
  const rows = document.createElement('div');
  rows.className = 'mp-surf-cov';
  bySurface.forEach((s) => {
    const c = surfaceColor(s.surface);
    const scov = s.total > 0 ? Math.round((100 * s.with_minutes) / s.total) : 0;
    const avg = s.avg_minutes != null ? fmtDuration(Math.round(s.avg_minutes)) : '—';
    const row = document.createElement('div');
    row.className = 'mp-surf-cov__row mp-rise';
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
    bars += `<rect class="mp-bar mp-rise" x="${bx.toFixed(1)}" y="${by.toFixed(1)}" `
      + `width="${bw.toFixed(1)}" height="${Math.max(0, bh).toFixed(1)}" `
      + `rx="1.5" fill="${accent}"></rect>`;
  }
  // hour gridlines/labels
  let ticks = '';
  for (let t = Math.ceil(minB / 60) * 60; t <= maxB; t += 60) {
    const tx = x(t);
    ticks += `<line class="mp-hist-grid" x1="${tx.toFixed(1)}" y1="${mt}" x2="${tx.toFixed(1)}" y2="${H - mb}"></line>`
      + `<text class="mp-hist-lab" x="${tx.toFixed(1)}" y="${H - mb + 18}" text-anchor="middle">${t / 60}h</text>`;
  }
  svg.innerHTML = ticks + bars;
  return svg;
}
