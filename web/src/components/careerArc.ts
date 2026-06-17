import { showTooltip, hideTooltip } from './tooltip';
import { EASE_ENTRANCE, DUR, prefersReducedMotion } from '../motion';
import type { CareerArcPoint } from '../types';

// Career arc: rank over time, axis inverted (1 at top). Confident ink line over
// a gradient area in the player's identity colour, faint shading over the #1
// plateau spells, and peak-week dots. The line draws in left-to-right on load;
// hovering anywhere reveals that week's rank via the shared tooltip with a
// cursor-tracking guide. Reuses motion.ts easings/durations + tooltip.ts.

const NS = 'http://www.w3.org/2000/svg';
const W = 820, H = 320;
const M = { l: 40, r: 16, t: 18, b: 28 };
const IW = W - M.l - M.r;
const IH = H - M.t - M.b;
const DRAW_MS = 850; // line-draw reads better a touch longer than a fade; same easing
const SPELL_GAP_DAYS = 30; // group peak weeks into contiguous plateau bands

const fullDate = (d: Date) =>
  d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

function niceMax(max: number): number {
  if (max <= 10) return 10;
  const step = max <= 100 ? 10 : max <= 500 ? 50 : 100;
  return Math.ceil(max / step) * step;
}

function el(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export function careerArc(
  points: CareerArcPoint[],
  careerHighRank: number | null,
  accent: string,
): HTMLElement {
  const root = document.createElement('section');
  root.className = 'panel career-arc';
  root.innerHTML = `<p class="eyebrow">Career arc</p>`;

  if (points.length === 0) {
    root.insertAdjacentHTML('beforeend', `<p class="muted">No ranking history on record.</p>`);
    return root;
  }

  // Display-only clamp to the 2000+ era (matches the match-data window); does
  // not alter the slice or any computed value.
  const ERA_START = new Date('2000-01-01');
  const data = points
    .map((p) => ({ date: new Date(p.ranking_date), rank: p.rank }))
    .filter((d) => d.date >= ERA_START);

  if (data.length === 0) {
    root.insertAdjacentHTML('beforeend', `<p class="muted">No ranking history in the 2000+ era.</p>`);
    return root;
  }

  const t0 = +data[0].date;
  const t1 = +data[data.length - 1].date;
  const tSpan = Math.max(t1 - t0, 1);
  const yMax = niceMax(Math.max(...data.map((d) => d.rank)));

  const x = (t: number) => M.l + ((t - t0) / tSpan) * IW;
  const y = (rank: number) => M.t + ((rank - 1) / (yMax - 1)) * IH;
  const baseY = M.t + IH;

  const pts = data.map((d) => ({ ...d, px: x(+d.date), py: y(d.rank) }));

  const svg = el('svg', {
    class: 'arc-svg', viewBox: `0 0 ${W} ${H}`,
    preserveAspectRatio: 'xMidYMid meet', role: 'img',
    'aria-label': 'Career rank over time',
  }) as SVGSVGElement;

  const gradId = `arcgrad-${Math.random().toString(36).slice(2)}`;
  const defs = el('defs', {});
  const grad = el('linearGradient', { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.appendChild(el('stop', { offset: '0%', 'stop-color': accent, 'stop-opacity': 0.30 }));
  grad.appendChild(el('stop', { offset: '100%', 'stop-color': accent, 'stop-opacity': 0 }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  // --- #1 plateau spell bands (faint, behind everything) -------------------
  if (careerHighRank != null) {
    const peakDates = pts.filter((p) => p.rank === careerHighRank).map((p) => +p.date).sort((a, b) => a - b);
    let s = 0;
    for (let i = 1; i <= peakDates.length; i++) {
      const gap = i < peakDates.length && (peakDates[i] - peakDates[i - 1]) > SPELL_GAP_DAYS * 864e5;
      if (i === peakDates.length || gap) {
        const xa = x(peakDates[s]);
        const xb = x(peakDates[i - 1]);
        svg.appendChild(el('rect', {
          class: 'arc-band', x: xa, y: M.t, width: Math.max(xb - xa, 2), height: IH, fill: accent,
        }));
        s = i;
      }
    }
  }

  // --- y gridlines + labels (1, mid, max) ----------------------------------
  const yTicks = Array.from(new Set([1, Math.round(yMax / 2), yMax]));
  for (const r of yTicks) {
    const yy = y(r);
    svg.appendChild(el('line', { class: 'arc-grid', x1: M.l, y1: yy, x2: W - M.r, y2: yy }));
    const label = el('text', { class: 'arc-ylab', x: M.l - 8, y: yy + 4, 'text-anchor': 'end' });
    label.textContent = `#${r}`;
    svg.appendChild(label);
  }

  // --- x year labels (~6) --------------------------------------------------
  const y0 = data[0].date.getUTCFullYear();
  const y1y = data[data.length - 1].date.getUTCFullYear();
  const yrSpan = Math.max(y1y - y0, 1);
  const stepY = Math.max(1, Math.ceil(yrSpan / 6));
  for (let yr = y0; yr <= y1y; yr += stepY) {
    const tx = Math.min(Math.max(+new Date(Date.UTC(yr, 0, 1)), t0), t1);
    const label = el('text', { class: 'arc-xlab', x: x(tx), y: H - 6, 'text-anchor': 'middle' });
    label.textContent = String(yr);
    svg.appendChild(label);
  }

  // --- area + line ---------------------------------------------------------
  const lineD = pts.map((p, i) => `${i ? 'L' : 'M'}${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(' ');
  const areaD = `${lineD} L${pts[pts.length - 1].px.toFixed(1)},${baseY} L${pts[0].px.toFixed(1)},${baseY} Z`;
  svg.appendChild(el('path', { class: 'arc-area', d: areaD, fill: `url(#${gradId})` }));
  const line = el('path', { class: 'arc-line', d: lineD, fill: 'none' }) as SVGPathElement;
  svg.appendChild(line);

  // --- peak-week dots ------------------------------------------------------
  if (careerHighRank != null) {
    for (const p of pts) {
      if (p.rank === careerHighRank) {
        svg.appendChild(el('circle', { class: 'arc-peak', cx: p.px, cy: p.py, r: 2.4, fill: accent }));
      }
    }
  }

  // --- hover guide + tracking dot + overlay --------------------------------
  const guide = el('line', { class: 'arc-guide', x1: 0, y1: M.t, x2: 0, y2: baseY }) as SVGLineElement;
  const cursor = el('circle', { class: 'arc-cursor', cx: 0, cy: 0, r: 4, fill: accent }) as SVGCircleElement;
  guide.style.opacity = '0';
  cursor.style.opacity = '0';
  svg.append(guide, cursor);

  const overlay = el('rect', {
    class: 'arc-overlay', x: M.l, y: M.t, width: IW, height: IH, fill: 'transparent',
  }) as SVGRectElement;

  const pxs = pts.map((p) => p.px);
  const nearest = (mx: number): number => {
    let lo = 0, hi = pxs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pxs[mid] < mx) lo = mid + 1; else hi = mid;
    }
    if (lo > 0 && Math.abs(pxs[lo - 1] - mx) <= Math.abs(pxs[lo] - mx)) return lo - 1;
    return lo;
  };

  const move = (clientX: number) => {
    const box = svg.getBoundingClientRect();
    const mx = ((clientX - box.left) / box.width) * W;
    const p = pts[nearest(mx)];
    guide.setAttribute('x1', String(p.px));
    guide.setAttribute('x2', String(p.px));
    cursor.setAttribute('cx', String(p.px));
    cursor.setAttribute('cy', String(p.py));
    guide.style.opacity = '1';
    cursor.style.opacity = '1';
    showTooltip(
      `<div class="tt">
         <div class="tt__head"><span class="tt__swatch" style="background:${accent}"></span> Ranking</div>
         <div class="tt__tourn tnum">#${p.rank}</div>
         <div class="tt__date faint">week of ${fullDate(p.date)}</div>
       </div>`,
      cursor.getBoundingClientRect(),
    );
  };
  const leave = () => { guide.style.opacity = '0'; cursor.style.opacity = '0'; hideTooltip(); };

  overlay.addEventListener('pointermove', (e) => move(e.clientX));
  overlay.addEventListener('pointerdown', (e) => move(e.clientX));
  overlay.addEventListener('pointerleave', leave);
  svg.appendChild(overlay);

  // --- entrance: draw the line left-to-right, fade the area in -------------
  if (!prefersReducedMotion()) {
    const len = line.getTotalLength();
    line.style.strokeDasharray = String(len);
    line.style.strokeDashoffset = String(len);
    svg.classList.add('is-entering');
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        line.style.transition = `stroke-dashoffset ${DRAW_MS}ms ${EASE_ENTRANCE}`;
        line.style.strokeDashoffset = '0';
        svg.classList.remove('is-entering');
      }),
    );
  }

  const cap = document.createElement('p');
  cap.className = 'career-arc__cap';
  cap.textContent =
    careerHighRank == null ? '' : `Shaded bands mark spells at the career-high rank, #${careerHighRank}.`;

  root.append(svg, cap);
  return root;
}
