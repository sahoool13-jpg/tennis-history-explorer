import { surfaceColor } from '../palette';
import type { SurfaceSplit } from '../types';

// The hero element. Per-surface horizontal bars where the fill is the court
// colour (from surface_palette.json) and the bar width encodes win%. The match
// count rides alongside so a high win% over few matches reads differently from
// the same win% over many. Bars are ordered by matches played (most-played
// first = the player's surface identity).
export function surfaceSplit(splits: SurfaceSplit[]): HTMLElement {
  const root = document.createElement('section');
  root.className = 'surface-split';

  const h = document.createElement('h2');
  h.className = 'surface-split__title';
  h.textContent = 'Surface split';
  root.appendChild(h);

  if (splits.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No matches on record.';
    root.appendChild(empty);
    return root;
  }

  const maxMatches = Math.max(...splits.map((s) => s.matches));

  for (const s of splits) {
    const pct = s.win_pct * 100;
    const color = surfaceColor(s.surface);

    const row = document.createElement('div');
    row.className = 'surface-row';

    const label = document.createElement('div');
    label.className = 'surface-row__label';
    const dot = document.createElement('span');
    dot.className = 'surface-row__dot';
    dot.style.background = color;
    const name = document.createElement('span');
    name.textContent = s.surface;
    label.append(dot, name);

    const track = document.createElement('div');
    track.className = 'surface-row__track';
    const fill = document.createElement('div');
    fill.className = 'surface-row__fill';
    fill.style.width = `${pct.toFixed(1)}%`;
    fill.style.background = color;
    // weight bar height by relative volume so big samples feel weightier
    const weight = 0.45 + 0.55 * (s.matches / maxMatches);
    track.style.opacity = String(weight);
    track.appendChild(fill);

    const stat = document.createElement('div');
    stat.className = 'surface-row__stat';
    stat.innerHTML =
      `<span class="surface-row__pct">${pct.toFixed(1)}%</span>` +
      `<span class="surface-row__count">${s.wins}–${s.losses} · ${s.matches} matches</span>`;

    row.append(label, track, stat);
    root.appendChild(row);
  }

  return root;
}
