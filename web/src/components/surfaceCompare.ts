import { surfaceColor, surfaceNames } from '../palette';
import { escapeHtml } from './searchBox';
import type { SurfaceSplit } from '../types';

// H2H surface comparison on a SHARED 0–100% x-axis: for each surface both
// players' win% bars sit on the same scale, so the crossover (e.g. Nadal's clay
// vs Federer's grass) reads at a glance. Presentation only — built from the
// per-player surface_splits already returned by the data layer.
export function surfaceCompare(
  splitsA: SurfaceSplit[],
  splitsB: SurfaceSplit[],
  nameA: string,
  nameB: string,
): HTMLElement {
  const root = document.createElement('section');
  root.className = 'panel compare';
  root.innerHTML =
    `<p class="eyebrow">Career surface record · shared scale</p>` +
    `<p class="subnote faint">Each player's overall win rate by surface — ` +
    `not just their meetings with each other.</p>`;

  const byA = new Map(splitsA.map((s) => [s.surface, s]));
  const byB = new Map(splitsB.map((s) => [s.surface, s]));

  // canonical order from the palette; keep only surfaces either player has played
  const order = surfaceNames();
  const surfaces = order.filter((s) => byA.has(s) || byB.has(s));

  const grid = document.createElement('div');
  grid.className = 'compare__grid';

  const bar = (s: SurfaceSplit | undefined, name: string, side: 'a' | 'b') => {
    if (!s) {
      return `
        <div class="cbar cbar--${side}">
          <div class="cbar__meta"><span class="cbar__name">${escapeHtml(name)}</span>
            <span class="cbar__cap">no matches</span></div>
          <div class="cbar__track"></div>
        </div>`;
    }
    const pct = s.win_pct * 100;
    return `
      <div class="cbar cbar--${side}">
        <div class="cbar__meta">
          <span class="cbar__name">${escapeHtml(name)}</span>
          <span class="cbar__pct tnum">${pct.toFixed(1)}%</span>
          <span class="cbar__cap tnum">${s.wins}–${s.losses} · ${s.matches}</span>
        </div>
        <div class="cbar__track"><div class="cbar__fill" style="width:${pct.toFixed(1)}%"></div></div>
      </div>`;
  };

  for (const surface of surfaces) {
    const row = document.createElement('div');
    row.className = 'crow';
    row.style.setProperty('--c', surfaceColor(surface));
    row.innerHTML = `
      <div class="crow__surface"><i class="swatch"></i>${surface}</div>
      ${bar(byA.get(surface), nameA, 'a')}
      ${bar(byB.get(surface), nameB, 'b')}
    `;
    grid.appendChild(row);
  }

  root.appendChild(grid);
  return root;
}
