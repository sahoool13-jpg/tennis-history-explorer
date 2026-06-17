import {
  lbTitles, lbWins, lbWinPct, lbWeeksNo1, lbSurface, lbRivalries,
} from '../db';
import { surfaceColor } from '../palette';
import { escapeHtml } from '../components/searchBox';
import { STAGGER_MS, prefersReducedMotion } from '../motion';
import type { LeaderRow, RivalryRow } from '../types';

const iocHtml = (ioc: string | null) =>
  ioc ? ` <span class="lb-ioc">${escapeHtml(ioc)}</span>` : '';

// stagger the rows of a card in, reusing the shared timing
function stagger(card: HTMLElement): void {
  const rows = card.querySelectorAll<HTMLElement>('.lb-row');
  const reduced = prefersReducedMotion();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    rows.forEach((r, i) => {
      if (!reduced) r.style.transitionDelay = `${i * STAGGER_MS}ms`;
      r.classList.add('in');
    });
  }));
}

function playerBoard(
  title: string, caption: string, rows: LeaderRow[],
  fmt: (r: LeaderRow) => string, accent?: string,
): HTMLElement {
  const card = document.createElement('section');
  card.className = 'panel lb-card';
  if (accent) card.style.setProperty('--lb-accent', accent);
  card.innerHTML =
    `<div class="lb-head"><h2 class="lb-title">${escapeHtml(title)}</h2></div>` +
    (caption ? `<p class="lb-cap faint">${escapeHtml(caption)}</p>` : '');

  const list = document.createElement('div');
  list.className = 'lb-list';
  rows.forEach((r, i) => {
    const a = document.createElement('a');
    a.className = 'lb-row' + (i === 0 ? ' lb-row--top' : '');
    a.href = `#/player/${r.player_id}`;
    a.innerHTML = `
      <span class="lb-rank tnum">${i + 1}</span>
      <span class="lb-who"><span class="lb-name">${escapeHtml(r.player_name)}</span>${iocHtml(r.ioc)}
        <span class="lb-sub tnum">${r.matches} matches</span></span>
      <span class="lb-val tnum">${fmt(r)}</span>`;
    list.appendChild(a);
  });
  card.appendChild(list);
  return card;
}

function rivalryBoard(title: string, caption: string, rows: RivalryRow[]): HTMLElement {
  const card = document.createElement('section');
  card.className = 'panel lb-card lb-card--wide';
  card.innerHTML =
    `<div class="lb-head"><h2 class="lb-title">${escapeHtml(title)}</h2></div>` +
    (caption ? `<p class="lb-cap faint">${escapeHtml(caption)}</p>` : '');
  const list = document.createElement('div');
  list.className = 'lb-list';
  rows.forEach((r, i) => {
    const a = document.createElement('a');
    a.className = 'lb-row' + (i === 0 ? ' lb-row--top' : '');
    a.href = `#/h2h/${r.a_id}/${r.b_id}`;
    a.innerHTML = `
      <span class="lb-rank tnum">${i + 1}</span>
      <span class="lb-who"><span class="lb-name">${escapeHtml(r.a_name)} <span class="lb-vs">vs</span> ${escapeHtml(r.b_name)}</span></span>
      <span class="lb-val tnum">${r.meetings}</span>`;
    list.appendChild(a);
  });
  card.appendChild(list);
  return card;
}

export async function renderRecords(mount: HTMLElement): Promise<void> {
  mount.replaceChildren();
  mount.style.removeProperty('--accent');

  const head = document.createElement('header');
  head.className = 'era-header';
  head.innerHTML = `
    <p class="era-scope">ATP · tour-level singles · 2000–present</p>
    <h1 class="era-title">Records</h1>
    <p class="era-standfirst">Leaderboards drawn from Rally's verified aggregates. Win-rate
      boards apply a minimum-match floor — shown on each — so a handful of matches at 100%
      can't top the list.</p>
  `;
  mount.appendChild(head);

  const loading = document.createElement('p');
  loading.className = 'loading';
  loading.textContent = 'Loading…';
  mount.appendChild(loading);

  const [titles, wins, winpct, weeks, hard, clay, grass, rivalries] = await Promise.all([
    lbTitles(10), lbWins(10), lbWinPct(200, 10), lbWeeksNo1(10),
    lbSurface('Hard', 100, 8), lbSurface('Clay', 100, 8), lbSurface('Grass', 100, 8),
    lbRivalries(10),
  ]);
  loading.remove();

  const pctFmt = (r: LeaderRow) => `${(r.value * 100).toFixed(1)}%`;
  const intFmt = (r: LeaderRow) => `${r.value}`;

  const grid = document.createElement('div');
  grid.className = 'records-grid';
  const cards = [
    playerBoard('Most titles', '', titles, intFmt),
    playerBoard('Most match wins', '', wins, intFmt),
    playerBoard('Highest career win %', 'Minimum 200 career matches.', winpct, pctFmt),
    playerBoard('Most weeks at No. 1', '', weeks, intFmt),
    playerBoard('Best on hard', 'Minimum 100 matches on hard.', hard, pctFmt, surfaceColor('Hard')),
    playerBoard('Best on clay', 'Minimum 100 matches on clay.', clay, pctFmt, surfaceColor('Clay')),
    playerBoard('Best on grass', 'Minimum 100 matches on grass.', grass, pctFmt, surfaceColor('Grass')),
  ];
  cards.forEach((c) => grid.appendChild(c));
  mount.appendChild(grid);

  const rivWrap = document.createElement('div');
  rivWrap.className = 'records-grid records-grid--wide';
  const riv = rivalryBoard('Biggest rivalries', 'By total tour-level meetings, 2000+.', rivalries);
  rivWrap.appendChild(riv);
  mount.appendChild(rivWrap);

  [...cards, riv].forEach(stagger);
}
