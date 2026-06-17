import { surfaceColor } from '../palette';
import type { SurfaceSplit } from '../types';

// Surfaces with fewer than this many matches are de-emphasized (subordinate to
// the main three) — a player's 6 carpet matches shouldn't read as loudly as
// their 200 hard-court matches.
const MINOR_THRESHOLD = 25;

// The hero. One row per surface: a big confident win% in the surface colour,
// a slim track, and a quiet "W–L · N matches" caption. Ordered by matches
// played (most-played first = the player's surface identity).
export function surfaceSplit(splits: SurfaceSplit[]): HTMLElement {
  const root = document.createElement('section');
  root.className = 'panel surface-split';
  root.innerHTML = `<p class="eyebrow">Surface split</p>`;

  if (splits.length === 0) {
    root.insertAdjacentHTML('beforeend', `<p class="muted">No matches on record.</p>`);
    return root;
  }

  const list = document.createElement('ul');
  list.className = 'bars';

  for (const s of splits) {
    const pct = s.win_pct * 100;
    const li = document.createElement('li');
    li.className = s.matches < MINOR_THRESHOLD ? 'bar bar--minor' : 'bar';
    li.style.setProperty('--c', surfaceColor(s.surface));
    li.innerHTML = `
      <div class="bar__head">
        <span class="bar__surface"><i class="swatch"></i>${s.surface}</span>
        <span class="bar__pct tnum">${pct.toFixed(1)}<small>%</small></span>
      </div>
      <div class="bar__track"><div class="bar__fill" style="width:${pct.toFixed(1)}%"></div></div>
      <div class="bar__cap tnum">${s.wins}–${s.losses} · ${s.matches} matches</div>
    `;
    list.appendChild(li);
  }

  root.appendChild(list);
  return root;
}
