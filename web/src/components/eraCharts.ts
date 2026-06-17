import { surfaceColor } from '../palette';
import { showTooltip, hideTooltip } from './tooltip';
import { EASE_ENTRANCE, prefersReducedMotion } from '../motion';
import type { EraStat } from '../types';

// Charts for the "How the game changed" view. Hand-rolled SVG, editorial
// palette, reusing motion.ts (rise-in entrance) and tooltip.ts (shared hover
// card). All metrics trace directly to era_stats.parquet columns.

const NS = 'http://www.w3.org/2000/svg';
const W = 820;
const M = { l: 46, r: 16, t: 14, b: 28 };
const IW = W - M.l - M.r;
const LOW_COV = 0.6; // below this, a year's match-length point is low-confidence

const el = (tag: string, attrs: Record<string, string | number>): SVGElement => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};
const surfaceOrder = ['Hard', 'Clay', 'Grass', 'Carpet', 'Unknown'] as const;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function frame(height: number): SVGSVGElement {
  return el('svg', {
    class: 'era-svg', viewBox: `0 0 ${W} ${height}`,
    preserveAspectRatio: 'xMidYMid meet',
  }) as SVGSVGElement;
}

function anchorAt(svg: SVGSVGElement, sx: number, sy: number): DOMRect {
  const box = svg.getBoundingClientRect();
  const sc = box.width / W;
  const cx = box.left + sx * sc;
  const cy = box.top + sy * sc;
  return { left: cx, right: cx, top: cy, bottom: cy, width: 0, height: 0, x: cx, y: cy,
    toJSON() {} } as DOMRect;
}

// rise-in entrance for a marks group (reuses the shared easing)
function riseIn(g: SVGGElement): void {
  if (prefersReducedMotion()) { g.classList.add('in'); return; }
  g.style.transition = `opacity var(--dur-med) ${EASE_ENTRANCE}, transform var(--dur-med) ${EASE_ENTRANCE}`;
  requestAnimationFrame(() => requestAnimationFrame(() => g.classList.add('in')));
}

// shared year hover: vertical guide + tooltip driven by a per-chart content fn
function attachHover(
  svg: SVGSVGElement, rows: EraStat[], xOf: (yr: number) => number,
  yTop: number, yBot: number, content: (i: number) => { html: string; y: number },
): void {
  const guide = el('line', { class: 'era-guide', x1: 0, y1: yTop, x2: 0, y2: yBot }) as SVGLineElement;
  guide.style.opacity = '0';
  svg.appendChild(guide);
  const overlay = el('rect', { class: 'era-overlay', x: M.l, y: yTop, width: IW, height: yBot - yTop, fill: 'transparent' }) as SVGRectElement;
  const n = rows.length;
  const move = (clientX: number) => {
    const box = svg.getBoundingClientRect();
    const sx = ((clientX - box.left) / box.width) * W;
    let i = Math.round(((sx - M.l) / IW) * (n - 1));
    i = Math.max(0, Math.min(n - 1, i));
    const gx = xOf(rows[i].year);
    guide.setAttribute('x1', String(gx));
    guide.setAttribute('x2', String(gx));
    guide.style.opacity = '1';
    const { html, y } = content(i);
    showTooltip(html, anchorAt(svg, gx, y));
  };
  overlay.addEventListener('pointermove', (e) => move(e.clientX));
  overlay.addEventListener('pointerdown', (e) => move(e.clientX));
  overlay.addEventListener('pointerleave', () => { guide.style.opacity = '0'; hideTooltip(); });
  svg.appendChild(overlay);
}

function xLabels(svg: SVGSVGElement, rows: EraStat[], xOf: (yr: number) => number, yBase: number): void {
  for (const r of rows) {
    if (r.year % 4 !== 0) continue;
    const t = el('text', { class: 'era-xlab', x: xOf(r.year), y: yBase, 'text-anchor': 'middle' });
    t.textContent = String(r.year);
    svg.appendChild(t);
  }
}

function section(eyebrow: string, headline: string, svg: SVGSVGElement, caption: string): HTMLElement {
  const s = document.createElement('section');
  s.className = 'panel era-chart';
  s.innerHTML = `<p class="eyebrow">${eyebrow}</p><h2 class="era-take">${headline}</h2>`;
  s.appendChild(svg);
  if (caption) {
    const c = document.createElement('p');
    c.className = 'era-cap faint';
    c.textContent = caption;
    s.appendChild(c);
  }
  return s;
}

// --------------------------------------------------------------------------- #
// 1) surface mix (hero) — stacked area of surface share per year
// --------------------------------------------------------------------------- #
export function surfaceMixChart(rows: EraStat[]): HTMLElement {
  const H = 300;
  const yTop = M.t, yBot = H - M.b, yH = yBot - yTop;
  const y0 = rows[0].year, yN = rows[rows.length - 1].year;
  const xOf = (yr: number) => M.l + ((yr - y0) / (yN - y0)) * IW;
  const yOf = (cum: number) => yTop + (1 - cum) * yH;

  const svg = frame(H);
  // y gridlines 0/50/100
  for (const f of [0, 0.5, 1]) {
    svg.appendChild(el('line', { class: 'era-grid', x1: M.l, y1: yOf(f), x2: W - M.r, y2: yOf(f) }));
    const t = el('text', { class: 'era-ylab', x: M.l - 8, y: yOf(f) + 4, 'text-anchor': 'end' });
    t.textContent = `${f * 100}%`;
    svg.appendChild(t);
  }

  const g = el('g', { class: 'era-rise' }) as SVGGElement;
  surfaceOrder.forEach((s, bi) => {
    const top: string[] = [], bot: string[] = [];
    for (const r of rows) {
      let before = 0;
      for (let k = 0; k < bi; k++) before += Number(r[`share_${surfaceOrder[k]}` as keyof EraStat]);
      const after = before + Number(r[`share_${s}` as keyof EraStat]);
      const x = xOf(r.year);
      top.push(`${x.toFixed(1)},${yOf(after).toFixed(1)}`);
      bot.push(`${x.toFixed(1)},${yOf(before).toFixed(1)}`);
    }
    const d = `M${top.join('L')}L${bot.reverse().join('L')}Z`;
    g.appendChild(el('path', { class: 'era-band', d, fill: surfaceColor(s) }));
  });
  svg.appendChild(g);

  xLabels(svg, rows, xOf, H - 6);
  attachHover(svg, rows, xOf, yTop, yBot, (i) => {
    const r = rows[i];
    const lines = surfaceOrder
      .filter((s) => Number(r[`share_${s}` as keyof EraStat]) > 0)
      .map((s) => `<div class="tt-row"><span class="tt-sw" style="background:${surfaceColor(s)}"></span>${s}<b class="tnum">${pct(Number(r[`share_${s}` as keyof EraStat]))}</b></div>`)
      .join('');
    return {
      html: `<div class="tt"><div class="tt__tourn tnum">${r.year}</div>${lines}
             <div class="tt__date faint tnum">${r.matches} matches</div></div>`,
      y: yTop,
    };
  });
  riseIn(g);

  return section(
    'Surface mix · share of tour matches',
    'Carpet courts vanished from the tour by the mid-2010s.',
    svg,
    'Share of ATP tour-level singles matches played on each surface, by year.',
  );
}

// --------------------------------------------------------------------------- #
// 2) competitive concentration — top player's share of the year's titles
// --------------------------------------------------------------------------- #
export function concentrationChart(rows: EraStat[]): HTMLElement {
  const H = 230;
  const yTop = M.t, yBot = H - M.b, yH = yBot - yTop;
  const y0 = rows[0].year, yN = rows[rows.length - 1].year;
  const xOf = (yr: number) => M.l + ((yr - y0) / (yN - y0)) * IW;
  const shareOf = (r: EraStat) => (r.total_titles ? r.titles_by_top_player / r.total_titles : 0);
  const yMax = Math.max(0.2, Math.ceil(Math.max(...rows.map(shareOf)) * 20) / 20);
  const yOf = (v: number) => yBot - (v / yMax) * yH;

  const svg = frame(H);
  for (const f of [0, 0.5, 1]) {
    const v = yMax * f;
    svg.appendChild(el('line', { class: 'era-grid', x1: M.l, y1: yOf(v), x2: W - M.r, y2: yOf(v) }));
    const t = el('text', { class: 'era-ylab', x: M.l - 8, y: yOf(v) + 4, 'text-anchor': 'end' });
    t.textContent = `${Math.round(v * 100)}%`;
    svg.appendChild(t);
  }

  const g = el('g', { class: 'era-rise' }) as SVGGElement;
  const d = rows.map((r, i) => `${i ? 'L' : 'M'}${xOf(r.year).toFixed(1)},${yOf(shareOf(r)).toFixed(1)}`).join(' ');
  g.appendChild(el('path', { class: 'era-line', d, fill: 'none' }));
  for (const r of rows) {
    g.appendChild(el('circle', { class: 'era-dot', cx: xOf(r.year), cy: yOf(shareOf(r)), r: 2.6 }));
  }
  svg.appendChild(g);

  xLabels(svg, rows, xOf, H - 6);
  attachHover(svg, rows, xOf, yTop, yBot, (i) => {
    const r = rows[i];
    return {
      html: `<div class="tt"><div class="tt__tourn tnum">${r.year}</div>
             <div class="tt__win tnum">${pct(shareOf(r))} of titles to one man</div>
             <div class="tt__date faint tnum">${r.titles_by_top_player} of ${r.total_titles} titles · ${r.distinct_champions} distinct champions</div></div>`,
      y: yOf(shareOf(r)),
    };
  });
  riseIn(g);

  return section(
    'Concentration · biggest title haul as a share',
    'In the Big Three’s peak seasons, one man won a far bigger slice of the titles.',
    svg,
    'Share of the year’s tour-level titles won by its single most prolific champion.',
  );
}

// --------------------------------------------------------------------------- #
// 3) match length — avg minutes, with coverage shown; 2015 flagged
// --------------------------------------------------------------------------- #
export function matchLengthChart(rows: EraStat[]): HTMLElement {
  const H = 240;
  const yTop = M.t, yBot = H - M.b, yH = yBot - yTop;
  const y0 = rows[0].year, yN = rows[rows.length - 1].year;
  const xOf = (yr: number) => M.l + ((yr - y0) / (yN - y0)) * IW;

  const valid = rows.filter((r) => r.avg_minutes != null);
  const mins = valid.map((r) => r.avg_minutes as number);
  const lo = Math.floor(Math.min(...mins) / 10) * 10;
  const hi = Math.ceil(Math.max(...mins) / 10) * 10;
  const yOf = (m: number) => yBot - ((m - lo) / (hi - lo)) * yH;

  const svg = frame(H);
  for (const m of [lo, (lo + hi) / 2, hi]) {
    svg.appendChild(el('line', { class: 'era-grid', x1: M.l, y1: yOf(m), x2: W - M.r, y2: yOf(m) }));
    const t = el('text', { class: 'era-ylab', x: M.l - 8, y: yOf(m) + 4, 'text-anchor': 'end' });
    t.textContent = `${m}m`;
    svg.appendChild(t);
  }

  const g = el('g', { class: 'era-rise' }) as SVGGElement;

  // faint coverage indicator: thin bars along the bottom (height ∝ coverage)
  const covBand = 16;
  for (const r of rows) {
    const h = r.minutes_coverage * covBand;
    g.appendChild(el('rect', {
      class: 'era-cov', x: xOf(r.year) - 2.2, y: yBot - h, width: 4.4, height: h,
    }));
  }

  // line, drawn segment-by-segment so segments touching a low-coverage year are dashed/grey
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    if (a.avg_minutes == null || b.avg_minutes == null) continue;
    const low = a.minutes_coverage < LOW_COV || b.minutes_coverage < LOW_COV;
    g.appendChild(el('line', {
      class: low ? 'era-line-seg era-line-seg--low' : 'era-line-seg',
      x1: xOf(a.year), y1: yOf(a.avg_minutes), x2: xOf(b.year), y2: yOf(b.avg_minutes),
    }));
  }
  // dots: low-coverage years rendered hollow + dashed + grey
  for (const r of rows) {
    if (r.avg_minutes == null) continue;
    const low = r.minutes_coverage < LOW_COV;
    g.appendChild(el('circle', {
      class: low ? 'era-dot era-dot--low' : 'era-dot',
      cx: xOf(r.year), cy: yOf(r.avg_minutes), r: low ? 4 : 2.6,
    }));
  }
  svg.appendChild(g);

  xLabels(svg, rows, xOf, H - 6);
  attachHover(svg, rows, xOf, yTop, yBot, (i) => {
    const r = rows[i];
    const low = r.minutes_coverage < LOW_COV;
    const avg = r.avg_minutes != null ? `${r.avg_minutes.toFixed(0)} min` : '—';
    return {
      html: `<div class="tt"><div class="tt__tourn tnum">${r.year}</div>
             <div class="tt__win tnum">avg ${avg}</div>
             <div class="tt__date faint tnum">${pct(r.minutes_coverage)} of matches timed${low ? ' · low coverage' : ''}</div></div>`,
      y: r.avg_minutes != null ? yOf(r.avg_minutes) : yTop,
    };
  });
  riseIn(g);

  return section(
    'Match length · average minutes',
    'Tour matches have edged longer since 2000 — by roughly twenty minutes.',
    svg,
    'Average match length depends on whether match time was recorded, which varies by year — the faint bars show each year’s coverage; 2015 (46%) is marked as low-confidence.',
  );
}

// --------------------------------------------------------------------------- #
// 4) volume (context) — matches per year
// --------------------------------------------------------------------------- #
export function volumeChart(rows: EraStat[]): HTMLElement {
  const H = 190;
  const yTop = M.t, yBot = H - M.b, yH = yBot - yTop;
  const y0 = rows[0].year, yN = rows[rows.length - 1].year;
  const xOf = (yr: number) => M.l + ((yr - y0) / (yN - y0)) * IW;
  const yMax = Math.ceil(Math.max(...rows.map((r) => r.matches)) / 500) * 500;
  const yOf = (v: number) => yBot - (v / yMax) * yH;
  const bw = (IW / rows.length) * 0.62;

  const svg = frame(H);
  for (const v of [0, yMax]) {
    svg.appendChild(el('line', { class: 'era-grid', x1: M.l, y1: yOf(v), x2: W - M.r, y2: yOf(v) }));
    const t = el('text', { class: 'era-ylab', x: M.l - 8, y: yOf(v) + 4, 'text-anchor': 'end' });
    t.textContent = v ? `${v / 1000}k` : '0';
    svg.appendChild(t);
  }

  const g = el('g', { class: 'era-rise' }) as SVGGElement;
  for (const r of rows) {
    g.appendChild(el('rect', {
      class: 'era-bar', x: xOf(r.year) - bw / 2, y: yOf(r.matches), width: bw, height: yBot - yOf(r.matches),
    }));
  }
  svg.appendChild(g);

  xLabels(svg, rows, xOf, H - 6);
  attachHover(svg, rows, xOf, yTop, yBot, (i) => {
    const r = rows[i];
    return {
      html: `<div class="tt"><div class="tt__tourn tnum">${r.year}</div>
             <div class="tt__win tnum">${r.matches} matches</div></div>`,
      y: yOf(r.matches),
    };
  });
  riseIn(g);

  return section(
    'Volume · matches per year',
    'Tour-level volume holds near 3,000 matches a year — bar the 2020 shutdown.',
    svg,
    'Counts include the current, partial season. The 2020 dip reflects the pandemic-shortened calendar.',
  );
}
