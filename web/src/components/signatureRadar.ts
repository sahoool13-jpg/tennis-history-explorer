import { surfaceColor } from '../palette';
import { showTooltip, hideTooltip } from './tooltip';
import { EASE_ENTRANCE, prefersReducedMotion } from '../motion';
import { escapeHtml } from './searchBox';
import type { SurfaceSplit } from '../types';

// The player "signature" — a four-axis surface radar (Hard / Clay / Grass /
// Carpet). Each axis length = that player's win% on that surface, on a FIXED
// 50–100% scale so shapes are comparable between players. The filled shape
// distorts toward strong surfaces, giving each player a recognisable
// silhouette. Identity feel, not a measurement tool — exact numbers live in the
// surface-split bars beside it. Reuses motion.ts + tooltip.ts + the SVG idiom.

// Same threshold as the carpet de-emphasis work: below this many matches a
// surface is too noisy to plot as a real vertex (a 100%-over-3 would spike).
const LOW_SAMPLE = 25;
const SCALE_MIN = 0.5; // 50% win rate -> centre; 100% -> rim

const VB = 220;
const CX = 110, CY = 104, R = 66;
// axes clockwise from top, in palette order
const AXES: Array<{ surface: string; angle: number }> = [
  { surface: 'Hard', angle: -90 },
  { surface: 'Clay', angle: 0 },
  { surface: 'Grass', angle: 90 },
  { surface: 'Carpet', angle: 180 },
];

const NS = 'http://www.w3.org/2000/svg';
const el = (tag: string, attrs: Record<string, string | number>): SVGElement => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};
const rad = (deg: number) => (deg * Math.PI) / 180;
const radiusFor = (winPct: number) =>
  (Math.min(Math.max(winPct, SCALE_MIN), 1) - SCALE_MIN) / (1 - SCALE_MIN) * R;

export function signatureRadar(splits: SurfaceSplit[], accent: string): HTMLElement {
  const root = document.createElement('div');
  root.className = 'signature';
  root.innerHTML = `<p class="eyebrow">Surface signature</p>`;

  const by = new Map(splits.map((s) => [s.surface, s]));

  const svg = el('svg', {
    class: 'sig-svg', viewBox: `0 0 ${VB} ${VB}`,
    preserveAspectRatio: 'xMidYMid meet', role: 'img',
    'aria-label': 'Surface win-rate signature (50–100% scale)',
  }) as SVGSVGElement;

  // rings at 75% and 100% (centre is 50%)
  for (const frac of [0.5, 1]) {
    svg.appendChild(el('circle', { class: 'sig-ring', cx: CX, cy: CY, r: R * frac }));
  }

  // resolve each axis
  const nodes = AXES.map(({ surface, angle }) => {
    const s = by.get(surface);
    const matches = s ? s.matches : 0;
    const low = matches < LOW_SAMPLE; // includes zero/absent
    const winPct = s ? s.win_pct : 0;
    const r = low ? 0 : radiusFor(winPct); // low/zero collapse to centre — no spike
    const px = CX + r * Math.cos(rad(angle));
    const py = CY + r * Math.sin(rad(angle));
    const rimX = CX + R * Math.cos(rad(angle));
    const rimY = CY + R * Math.sin(rad(angle));
    return { surface, angle, s, matches, low, winPct, px, py, rimX, rimY };
  });

  // spokes (dashed + muted where low-sample)
  for (const n of nodes) {
    svg.appendChild(el('line', {
      class: n.low ? 'sig-spoke sig-spoke--low' : 'sig-spoke',
      x1: CX, y1: CY, x2: n.rimX, y2: n.rimY,
    }));
  }

  // animated shape group: filled polygon + vertices
  const shape = el('g', { class: 'sig-shape' });
  const polyPts = nodes.map((n) => `${n.px.toFixed(1)},${n.py.toFixed(1)}`).join(' ');
  shape.appendChild(el('polygon', {
    class: 'sig-poly', points: polyPts, fill: accent, stroke: accent,
  }));

  for (const n of nodes) {
    const color = surfaceColor(n.surface);
    const vtx = el('circle', {
      class: n.low ? 'sig-vertex sig-vertex--low' : 'sig-vertex',
      cx: n.px, cy: n.py, r: 4, fill: n.low ? 'var(--paper)' : color, stroke: color,
    });
    // generous invisible hit target for hover/focus
    const hit = el('circle', { class: 'sig-hit', cx: n.px, cy: n.py, r: 13, fill: 'transparent', tabindex: 0 }) as SVGCircleElement;
    const pct = n.s ? `${(n.winPct * 100).toFixed(1)}%` : '—';
    const wl = n.s ? `${n.s.wins}–${n.s.losses} · ${n.matches} matches` : 'no matches on record';
    const note = n.s && n.low ? `<div class="tt__date faint">small sample — see bars</div>` : '';
    const html =
      `<div class="tt">
         <div class="tt__head"><span class="tt__swatch" style="background:${color}"></span> ${escapeHtml(n.surface)}</div>
         <div class="tt__tourn tnum">${pct}</div>
         <div class="tt__win tnum">${escapeHtml(wl)}</div>${note}
       </div>`;
    const show = () => { vtx.classList.add('is-focus'); showTooltip(html, vtx.getBoundingClientRect()); };
    const hideF = () => { vtx.classList.remove('is-focus'); hideTooltip(); };
    hit.addEventListener('mouseenter', show);
    hit.addEventListener('mouseleave', hideF);
    hit.addEventListener('focus', show);
    hit.addEventListener('blur', hideF);
    shape.append(vtx, hit);
  }
  svg.appendChild(shape);

  // axis labels (muted where low-sample)
  const LO = R + 16;
  for (const n of nodes) {
    const lx = CX + LO * Math.cos(rad(n.angle));
    const ly = CY + LO * Math.sin(rad(n.angle)) + 4;
    const label = el('text', {
      class: n.low ? 'sig-label sig-label--low' : 'sig-label',
      x: lx, y: ly, 'text-anchor': 'middle',
    });
    label.textContent = n.surface;
    svg.appendChild(label);
  }

  root.appendChild(svg);
  const cap = document.createElement('p');
  cap.className = 'sig-cap faint';
  cap.textContent = 'Win rate by surface, 50–100% scale.';
  root.appendChild(cap);

  // entrance: scale the shape in from centre
  if (!prefersReducedMotion()) {
    shape.style.transition =
      `opacity var(--dur-med) ${EASE_ENTRANCE}, transform var(--dur-med) ${EASE_ENTRANCE}`;
    requestAnimationFrame(() => requestAnimationFrame(() => shape.classList.add('in')));
  } else {
    shape.classList.add('in');
  }

  return root;
}
