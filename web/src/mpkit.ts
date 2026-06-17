// Match Point UI kit — shared building blocks for the score-led views. Reuses
// Rally's design tokens (.lb-* boards, editorial header, surface palette) and
// motion/tooltip language; adds the scoreline-as-hero device.
import { escapeHtml } from './components/searchBox';
import { surfaceColor } from './palette';
import { STAGGER_MS, prefersReducedMotion } from './motion';
import type { MpMatch, MpPlayerRow } from './types';

// Cross-site link: Match Point lives at matchpoint.html; player pages live on
// Rally (index.html). BASE_URL handles the dev '/' vs Pages-subpath difference.
export const rallyPlayer = (id: number): string =>
  `${import.meta.env.BASE_URL}#/player/${id}`;

const FRAMING = 'ATP · tour-level singles · 2000–present';

// Editorial page header with the framing pill (same as Rally's records/eras).
export function mpHeader(title: string, standfirst: string): HTMLElement {
  const head = document.createElement('header');
  head.className = 'era-header';
  head.innerHTML = `
    <p class="era-scope">${escapeHtml(FRAMING)}</p>
    <h1 class="era-title">${escapeHtml(title)}</h1>
    <p class="era-standfirst">${standfirst}</p>`;
  return head;
}

// A one-line editorial takeaway above a board/section.
export function mpTakeaway(text: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'mp-take';
  p.textContent = text;
  return p;
}

export function loadingLine(): HTMLElement {
  const p = document.createElement('p');
  p.className = 'loading';
  p.textContent = 'Loading…';
  return p;
}

// --- scoreline -------------------------------------------------------------
// Typesets the ALREADY-STRUCTURED set_scores string (e.g. "6-4 7-6(3) 70-68").
// This is display formatting of verified data, not score parsing — every stat
// shown comes from the gated columns, never recomputed here.
const SET_RE = /^(\d{1,3})-(\d{1,3})(?:\((\d{1,2})(?:-\d{1,2})?\))?$/;
const MTB_RE = /^\[(\d{1,3})-(\d{1,3})\]$/;

export function scoreline(setScores: string): string {
  const tokens = (setScores || '').trim().split(/\s+/).filter(Boolean);
  const cells = tokens.map((tok) => {
    const mtb = MTB_RE.exec(tok);
    if (mtb) {
      return `<span class="mp-set mp-set--mtb"><b>${mtb[1]}</b><i>${mtb[2]}</i></span>`;
    }
    const m = SET_RE.exec(tok);
    if (m) {
      const tb = m[3] !== undefined ? `<sup class="mp-tb">${m[3]}</sup>` : '';
      return `<span class="mp-set"><b>${m[1]}</b><i>${m[2]}</i>${tb}</span>`;
    }
    return `<span class="mp-set mp-set--raw">${escapeHtml(tok)}</span>`;
  });
  return `<span class="mp-scoreline">${cells.join('')}</span>`;
}

// --- match card ------------------------------------------------------------
const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

export interface MatchCardOpts {
  rank?: number;
  // extra stat shown at the right of the meta line, e.g. "4h 25m"
  badge?: string;
}

export function matchCard(m: MpMatch, opts: MatchCardOpts = {}): HTMLElement {
  const el = document.createElement('article');
  el.className = 'mp-match';
  const c = surfaceColor(m.surface);
  const rank = opts.rank !== undefined
    ? `<span class="mp-match__rank tnum">${opts.rank}</span>` : '';
  const badge = opts.badge
    ? `<span class="mp-match__badge tnum">${escapeHtml(opts.badge)}</span>` : '';
  const where = [m.tourney_name, m.round && roundLabel(m.round)]
    .filter(Boolean).map((s) => escapeHtml(String(s))).join(' · ');
  el.innerHTML = `
    ${rank}
    <div class="mp-match__body">
      <div class="mp-match__score">${scoreline(m.set_scores)}</div>
      <p class="mp-match__players">
        <a href="${rallyPlayer(m.winner_id)}">${escapeHtml(m.winner_name)}</a>
        <span class="mp-match__beat">def.</span>
        <a href="${rallyPlayer(m.loser_id)}">${escapeHtml(m.loser_name)}</a>
      </p>
      <p class="mp-match__meta">
        <span class="mp-dot" style="--c:${c}"></span>${escapeHtml(m.surface)}
        <span class="mp-sep">·</span>${where}
        <span class="mp-sep">·</span>${fmtDate(m.date)}
        ${badge ? `<span class="mp-sep">·</span>${badge}` : ''}
      </p>
    </div>`;
  return el;
}

const ROUNDS: Record<string, string> = {
  F: 'Final', SF: 'Semifinal', QF: 'Quarterfinal', R16: 'Round of 16',
  R32: 'Round of 32', R64: 'Round of 64', R128: 'Round of 128', RR: 'Round robin',
};
const roundLabel = (r: string): string => ROUNDS[r] ?? r;

export function fmtDuration(minutes: number | null): string {
  if (minutes == null || minutes <= 0) return '—';
  const h = Math.floor(minutes / 60);
  const mm = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${mm.toString().padStart(2, '0')}m` : `${mm}m`;
}

// --- player leaderboard (cross-links to Rally) -----------------------------
const iocHtml = (ioc: string | null) =>
  ioc ? ` <span class="lb-ioc">${escapeHtml(ioc)}</span>` : '';

export function playerBoard(
  title: string, caption: string, rows: MpPlayerRow[],
  fmt: (r: MpPlayerRow) => string,
): HTMLElement {
  const card = document.createElement('section');
  card.className = 'panel lb-card mp-lb';
  card.innerHTML =
    `<div class="lb-head"><h2 class="lb-title">${escapeHtml(title)}</h2></div>` +
    (caption ? `<p class="lb-cap faint">${escapeHtml(caption)}</p>` : '');
  const list = document.createElement('div');
  list.className = 'lb-list';
  if (rows.length === 0) {
    list.innerHTML = `<p class="lb-error">No players meet this threshold.</p>`;
  }
  rows.forEach((r, i) => {
    const a = document.createElement('a');
    a.className = 'lb-row' + (i === 0 ? ' lb-row--top' : '');
    a.href = rallyPlayer(r.player_id);
    const sub = r.detail ? escapeHtml(r.detail) : `${r.matches} matches`;
    a.innerHTML = `
      <span class="lb-rank tnum">${i + 1}</span>
      <span class="lb-who"><span class="lb-name">${escapeHtml(r.player_name)}</span>${iocHtml(r.ioc)}
        <span class="lb-sub tnum">${sub}</span></span>
      <span class="lb-val tnum">${fmt(r)}</span>`;
    list.appendChild(a);
  });
  card.appendChild(list);
  return card;
}

export function errorCard(title: string, caption = ''): HTMLElement {
  const card = document.createElement('section');
  card.className = 'panel lb-card mp-lb';
  card.innerHTML =
    `<div class="lb-head"><h2 class="lb-title">${escapeHtml(title)}</h2></div>` +
    (caption ? `<p class="lb-cap faint">${escapeHtml(caption)}</p>` : '') +
    `<p class="lb-error">Couldn't load this board. Try refreshing.</p>`;
  return card;
}

// stagger reveal for a set of rows/cards, honouring reduced motion
export function reveal(nodes: NodeListOf<HTMLElement> | HTMLElement[]): void {
  const arr = Array.from(nodes as ArrayLike<HTMLElement>);
  const reduced = prefersReducedMotion();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    arr.forEach((r, i) => {
      if (!reduced) r.style.transitionDelay = `${i * STAGGER_MS}ms`;
      r.classList.add('in');
    });
  }));
}
