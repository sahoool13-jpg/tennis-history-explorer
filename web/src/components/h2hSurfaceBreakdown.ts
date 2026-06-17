import { surfaceColor } from '../palette';
import { escapeHtml } from './searchBox';
import type { H2HBySurfaceRow } from '../types';

// Item 4 frontend: who won the actual meetings on each surface. Distinct from
// the "career surface record" comparison — labelled clearly so the two surface
// sections aren't confused. Rows are surface-coloured (surface identity); the
// win split uses the surface colour (full) vs a lighter shade of it, with names
// labelling each side.
export function h2hSurfaceBreakdown(
  rows: H2HBySurfaceRow[],
  nameA: string,
  nameB: string,
): HTMLElement {
  const root = document.createElement('section');
  root.className = 'panel rivalry-surface';
  root.innerHTML =
    `<p class="eyebrow">This rivalry, by surface</p>` +
    `<p class="subnote faint">Who won their actual meetings on each surface — ` +
    `not the players' overall surface records below.</p>`;

  if (rows.length === 0) {
    root.insertAdjacentHTML('beforeend', `<p class="muted">No meetings on record.</p>`);
    return root;
  }

  const grid = document.createElement('div');
  grid.className = 'rs-grid';

  for (const r of rows) {
    const total = Math.max(r.meetings, 1);
    const aw = (r.player_wins / total) * 100;
    const bw = (r.opp_wins / total) * 100;
    const row = document.createElement('div');
    row.className = 'rs-row';
    row.style.setProperty('--c', surfaceColor(r.surface));
    row.innerHTML = `
      <div class="rs-row__head">
        <span class="rs-surface"><i class="swatch"></i>${r.surface}</span>
        <span class="rs-count tnum">${r.meetings} meeting${r.meetings === 1 ? '' : 's'}</span>
      </div>
      <div class="rs-bar">
        <div class="rs-bar__a" style="width:${aw.toFixed(2)}%"></div>
        <div class="rs-bar__b" style="width:${bw.toFixed(2)}%"></div>
      </div>
      <div class="rs-split tnum">
        <span>${escapeHtml(nameA)} <strong>${r.player_wins}</strong></span>
        <span><strong>${r.opp_wins}</strong> ${escapeHtml(nameB)}</span>
      </div>
    `;
    grid.appendChild(row);
  }

  root.appendChild(grid);
  return root;
}
