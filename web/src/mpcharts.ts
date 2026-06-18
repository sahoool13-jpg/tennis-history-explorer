// Match Point overview charts — hand-rolled SVG (no chart lib), one per board,
// shown ABOVE the ranked list to vary the form. Every value comes from the
// existing gated data (validated via Python DuckDB); no new precision invented.
// Charts show the board's default scope (tour-level, all years) as a stable
// overview — they don't react to the live filters, like the list does.
import { escapeHtml } from './components/searchBox';
import { surfaceColor } from './palette';
import type { TbRateRow, MpScatterPoint, MpTierRow, MpSurfaceCount } from './types';

const NS = 'http://www.w3.org/2000/svg';

function svgEl(viewBox: string, label: string): SVGSVGElement {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', viewBox);
  s.setAttribute('class', 'mp-chart__svg');
  s.setAttribute('role', 'img');
  s.setAttribute('aria-label', label);
  return s;
}

export function chartPanel(
  eyebrow: string, svg: SVGSVGElement, captionHtml: string,
): HTMLElement {
  const sec = document.createElement('section');
  sec.className = 'panel mp-chart';
  sec.innerHTML = `<p class="eyebrow">${escapeHtml(eyebrow)}</p>`;
  sec.appendChild(svg);
  const cap = document.createElement('p');
  cap.className = 'mp-chart__cap faint';
  cap.innerHTML = captionHtml;
  sec.appendChild(cap);
  return sec;
}

const shortName = (full: string): string => {
  const parts = full.trim().split(/\s+/);
  return parts[parts.length - 1] || full;
};

// 1) TIEBREAKS — win-rate distribution across qualified players, leaders marked
export function tiebreakHistogram(rows: TbRateRow[]): SVGSVGElement {
  const W = 720, H = 220, ml = 14, mr = 14, mt = 26, mb = 26;
  const svg = svgEl(`0 0 ${W} ${H}`, 'Distribution of career tiebreak win rate');
  if (rows.length === 0) return svg;
  const step = 0.025;
  const vals = rows.map((r) => r.rate);
  const lo = Math.floor(Math.min(...vals) / step) * step;
  const hi = Math.ceil(Math.max(...vals) / step) * step;
  const nb = Math.round((hi - lo) / step);
  const counts = new Array(nb).fill(0);
  for (const v of vals) counts[Math.min(nb - 1, Math.floor((v - lo) / step))]++;
  const maxC = Math.max(...counts);
  const x = (v: number) => ml + ((v - lo) / (hi - lo)) * (W - ml - mr);
  const y = (c: number) => mt + (1 - c / maxC) * (H - mt - mb);

  let bars = '';
  for (let i = 0; i < nb; i++) {
    const bx = x(lo + i * step), bw = x(lo + (i + 1) * step) - bx - 1.5;
    const by = y(counts[i]);
    bars += `<rect class="mp-bar2" x="${bx.toFixed(1)}" y="${by.toFixed(1)}" `
      + `width="${Math.max(0.5, bw).toFixed(1)}" height="${(H - mb - by).toFixed(1)}"></rect>`;
  }
  // x-axis ticks at decile rates
  let ticks = `<line class="mp-axis-line" x1="${ml}" y1="${H - mb}" x2="${W - mr}" y2="${H - mb}"></line>`;
  for (let p = 0.40; p <= hi + 1e-9; p += 0.05) {
    if (p < lo - 1e-9) continue;
    const tx = x(p);
    ticks += `<text class="mp-axis" x="${tx.toFixed(1)}" y="${H - mb + 16}" text-anchor="middle">${Math.round(p * 100)}%</text>`;
  }
  // leaders (top 3) as optic-yellow markers, labels staggered to avoid overlap
  const leaders = rows.slice(0, 3);
  let marks = '';
  leaders.forEach((p, i) => {
    const lx = x(p.rate), ly = mt + 2 + i * 11;
    marks += `<line class="mp-mark-line" x1="${lx.toFixed(1)}" y1="${mt - 4}" x2="${lx.toFixed(1)}" y2="${H - mb}"></line>`
      + `<text class="mp-mark-lab" x="${(lx - 4).toFixed(1)}" y="${ly}" text-anchor="end">${escapeHtml(shortName(p.player_name))} ${Math.round(p.rate * 100)}%</text>`;
  });
  svg.innerHTML = bars + ticks + marks;
  return svg;
}

// 2) MARATHONS — duration over time; plausible-minute matches only, extremes labeled
export function marathonScatter(points: MpScatterPoint[]): SVGSVGElement {
  const W = 720, H = 260, ml = 38, mr = 14, mt = 18, mb = 28;
  const svg = svgEl(`0 0 ${W} ${H}`, 'Match duration over time (marathons)');
  if (points.length === 0) return svg;
  const years = points.map((p) => p.year);
  const x0 = Math.min(...years), x1 = Math.max(...years);
  const maxMin = Math.max(...points.map((p) => p.minutes));
  const minMin = Math.min(...points.map((p) => p.minutes));
  const x = (yr: number) => ml + ((yr - x0) / Math.max(1, x1 - x0)) * (W - ml - mr);
  const y = (m: number) => mt + (1 - (m - minMin) / (maxMin - minMin)) * (H - mt - mb);

  // y gridlines/labels at round hour marks
  let grid = '';
  for (let h = Math.ceil(minMin / 60) * 60; h <= maxMin; h += 60) {
    const gy = y(h);
    grid += `<line class="mp-grid" x1="${ml}" y1="${gy.toFixed(1)}" x2="${W - mr}" y2="${gy.toFixed(1)}"></line>`
      + `<text class="mp-axis" x="${ml - 6}" y="${(gy + 3).toFixed(1)}" text-anchor="end">${h / 60}h</text>`;
  }
  // x year labels (~5-year)
  let xlab = '';
  for (let yr = Math.ceil(x0 / 5) * 5; yr <= x1; yr += 5) {
    xlab += `<text class="mp-axis" x="${x(yr).toFixed(1)}" y="${H - mb + 16}" text-anchor="middle">${yr}</text>`;
  }
  // dots; extremes (top 2 by minutes — points come sorted desc) highlighted+labeled
  let dots = '', hi = '';
  points.forEach((p, i) => {
    const cx = x(p.year), cy = y(p.minutes);
    if (i < 2) {
      hi += `<circle class="mp-pt--hi" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.4"></circle>`
        + `<text class="mp-pt-lab" x="${(cx + 6).toFixed(1)}" y="${(cy + (i === 0 ? -6 : 12)).toFixed(1)}">${escapeHtml(shortName(p.label.split(' d. ')[0]))}–${escapeHtml(shortName(p.label.split(' d. ')[1] || ''))}</text>`;
    } else {
      dots += `<circle class="mp-pt" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="2.1"></circle>`;
    }
  });
  svg.innerHTML = grid + xlab + dots + hi;
  return svg;
}

// 3) COMEBACKS — by rank tier of the opponent fought past (horizontal bars)
const TIER_ORDER = ['Top 10', 'No. 11–30', 'No. 31–100', 'No. 100+', 'Unranked'];
export function comebackTierBars(rows: MpTierRow[]): SVGSVGElement {
  const byTier = new Map(rows.map((r) => [r.tier, r.n]));
  const tiers = TIER_ORDER.filter((t) => byTier.has(t));
  const W = 720, rowH = 30, ml = 96, mr = 48, mt = 6;
  const H = mt + tiers.length * rowH + 4;
  const svg = svgEl(`0 0 ${W} ${H}`, 'Comebacks by opponent rank tier');
  const maxN = Math.max(1, ...tiers.map((t) => byTier.get(t) || 0));
  const x = (n: number) => ml + (n / maxN) * (W - ml - mr);
  let out = '';
  tiers.forEach((t, i) => {
    const n = byTier.get(t) || 0;
    const cy = mt + i * rowH;
    const barH = 16;
    const hiTier = t === 'Top 10';
    out += `<text class="mp-axis mp-axis--row" x="${ml - 8}" y="${(cy + barH - 2).toFixed(1)}" text-anchor="end">${escapeHtml(t)}</text>`
      + `<rect class="${hiTier ? 'mp-cbar--hi' : 'mp-cbar'}" x="${ml}" y="${cy}" width="${(x(n) - ml).toFixed(1)}" height="${barH}"></rect>`
      + `<text class="mp-val2" x="${(x(n) + 6).toFixed(1)}" y="${(cy + barH - 2).toFixed(1)}">${n}</text>`;
  });
  svg.innerHTML = out;
  return svg;
}

// 4) BLOWOUTS — surface composition as a single 100%-stacked bar (surface colors)
const SURF_ORDER = ['Hard', 'Clay', 'Grass', 'Carpet'];
export function blowoutSurfaceStack(rows: MpSurfaceCount[]): SVGSVGElement {
  const byS = new Map(rows.map((r) => [r.surface, r.n]));
  const surfaces = SURF_ORDER.filter((s) => byS.has(s));
  const total = surfaces.reduce((a, s) => a + (byS.get(s) || 0), 0) || 1;
  const W = 720, H = 64, ml = 0, mr = 0, barY = 6, barH = 26;
  const svg = svgEl(`0 0 ${W} ${H}`, 'Surface mix of tour-level blowouts');
  let xc = ml, seg = '', leg = '';
  surfaces.forEach((s, i) => {
    const n = byS.get(s) || 0;
    const w = (n / total) * (W - ml - mr);
    const pct = Math.round((100 * n) / total);
    seg += `<rect x="${xc.toFixed(1)}" y="${barY}" width="${Math.max(0, w - 1).toFixed(1)}" height="${barH}" fill="${surfaceColor(s)}"></rect>`;
    // pct label inside segment when wide enough
    if (w > 46) seg += `<text class="mp-stack-pct" x="${(xc + w / 2).toFixed(1)}" y="${(barY + barH / 2 + 4).toFixed(1)}" text-anchor="middle">${pct}%</text>`;
    leg += `<g transform="translate(${(ml + i * 168).toFixed(1)}, ${barY + barH + 22})">`
      + `<rect x="0" y="-9" width="10" height="10" rx="1.5" fill="${surfaceColor(s)}"></rect>`
      + `<text class="mp-axis" x="16" y="0">${escapeHtml(s)} · ${n.toLocaleString()}</text></g>`;
    xc += w;
  });
  svg.innerHTML = seg + leg;
  return svg;
}
