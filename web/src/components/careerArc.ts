import * as Plot from '@observablehq/plot';
import type { CareerArcPoint } from '../types';

// Career arc: rank over time, axis inverted (1 at top). A thin confident ink
// line, peak weeks marked as small dots in the player's identity colour. No
// chart-junk gridlines — editorial, not Excel.
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

  // Display-only: clamp to the 2000+ era so the axis scales to the modern data
  // window (matching the match data) instead of squashing the plateau by a
  // pre-2000 tail. Does not alter the underlying slice or any computed value.
  const ERA_START = new Date('2000-01-01');
  const data = points
    .map((p) => ({ date: new Date(p.ranking_date), rank: p.rank }))
    .filter((d) => d.date >= ERA_START);

  if (data.length === 0) {
    root.insertAdjacentHTML(
      'beforeend',
      `<p class="muted">No ranking history in the 2000+ era.</p>`,
    );
    return root;
  }

  const peaks =
    careerHighRank == null ? [] : data.filter((d) => d.rank === careerHighRank);

  const chart = Plot.plot({
    width: 820,
    height: 320,
    marginLeft: 44,
    marginRight: 16,
    marginBottom: 30,
    style: {
      background: 'transparent',
      color: '#6f6453',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: '12px',
    },
    x: { type: 'utc', label: null, ticks: 6, tickSize: 0 },
    y: {
      reverse: true,
      label: null,
      ticks: 5,
      tickSize: 0,
      grid: false,
    },
    marks: [
      // a single faint baseline at #1 instead of a full grid
      Plot.ruleY([1], { stroke: '#e3d9c4', strokeWidth: 1 }),
      Plot.lineY(data, {
        x: 'date',
        y: 'rank',
        stroke: '#211d16',
        strokeWidth: 1.4,
        curve: 'step-after',
      }),
      Plot.dot(peaks, { x: 'date', y: 'rank', r: 2.6, fill: accent, stroke: 'none' }),
    ],
  });

  const cap = document.createElement('p');
  cap.className = 'career-arc__cap';
  cap.textContent =
    careerHighRank == null
      ? ''
      : `Coloured dots mark every week at the career-high rank, #${careerHighRank}.`;

  root.append(chart, cap);
  return root;
}
