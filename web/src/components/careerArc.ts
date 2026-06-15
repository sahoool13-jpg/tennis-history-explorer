import * as Plot from '@observablehq/plot';
import type { CareerArcPoint } from '../types';

// Career arc: rank over time, axis inverted (1 at top). Every week spent at the
// career-high rank is marked (all spells, not just the first). Live-sliced from
// rankings.parquet upstream.
export function careerArc(
  points: CareerArcPoint[],
  careerHighRank: number | null,
): HTMLElement {
  const root = document.createElement('section');
  root.className = 'career-arc';

  const h = document.createElement('h2');
  h.className = 'career-arc__title';
  h.textContent = 'Career arc';
  root.appendChild(h);

  if (points.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No ranking history on record.';
    root.appendChild(empty);
    return root;
  }

  const data = points.map((p) => ({ date: new Date(p.ranking_date), rank: p.rank }));
  const peaks =
    careerHighRank == null ? [] : data.filter((d) => d.rank === careerHighRank);

  const chart = Plot.plot({
    width: 820,
    height: 340,
    marginLeft: 52,
    marginBottom: 34,
    style: { fontSize: '12px', background: 'transparent' },
    x: { type: 'utc', label: null, grid: false },
    y: { reverse: true, label: '↑ Rank', grid: true, nice: true },
    marks: [
      Plot.ruleY([1], { stroke: '#e6e6e6' }),
      Plot.lineY(data, {
        x: 'date',
        y: 'rank',
        stroke: 'var(--ink)',
        strokeWidth: 1.5,
        curve: 'step-after',
      }),
      Plot.dot(peaks, {
        x: 'date',
        y: 'rank',
        r: 2.5,
        fill: 'var(--accent)',
        stroke: 'white',
        strokeWidth: 0.5,
      }),
    ],
  });

  const caption = document.createElement('p');
  caption.className = 'career-arc__caption muted';
  caption.textContent =
    careerHighRank == null
      ? ''
      : `Marked points: every week at career-high rank #${careerHighRank}.`;

  root.append(chart, caption);
  return root;
}
