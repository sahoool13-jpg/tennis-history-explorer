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

  const pctFmt = (r: LeaderRow) => `${(r.value * 100).toFixed(1)}%`;
  const intFmt = (r: LeaderRow) => `${r.value}`;

  type Spec = {
    title: string; cap: string; p: Promise<LeaderRow[]>;
    fmt: (r: LeaderRow) => string; accent?: string;
  };
  const specs: Spec[] = [
    { title: 'Most titles', cap: '', p: lbTitles(10), fmt: intFmt },
    { title: 'Most match wins', cap: '', p: lbWins(10), fmt: intFmt },
    { title: 'Highest career win %', cap: 'Minimum 200 career matches.', p: lbWinPct(200, 10), fmt: pctFmt },
    { title: 'Most weeks at No. 1', cap: '', p: lbWeeksNo1(10), fmt: intFmt },
    { title: 'Best on hard', cap: 'Minimum 100 matches on hard.', p: lbSurface('Hard', 100, 8), fmt: pctFmt, accent: surfaceColor('Hard') },
    { title: 'Best on clay', cap: 'Minimum 100 matches on clay.', p: lbSurface('Clay', 100, 8), fmt: pctFmt, accent: surfaceColor('Clay') },
    { title: 'Best on grass', cap: 'Minimum 100 matches on grass.', p: lbSurface('Grass', 100, 8), fmt: pctFmt, accent: surfaceColor('Grass') },
  ];

  // settle independently so one bad board shows an error state, not a hung page
  const settled = await Promise.allSettled(specs.map((s) => s.p));
  const [riv] = await Promise.allSettled([lbRivalries(10)]);
  loading.remove();

  const grid = document.createElement('div');
  grid.className = 'records-grid';
  const built: HTMLElement[] = [];
  settled.forEach((res, i) => {
    const s = specs[i];
    let card: HTMLElement;
    if (res.status === 'fulfilled') {
      card = playerBoard(s.title, s.cap, res.value, s.fmt, s.accent);
    } else {
      console.error(`Records: "${s.title}" failed —`, res.reason);
      card = errorCard(s.title, s.cap, s.accent);
    }
    grid.appendChild(card);
    built.push(card);
  });
  mount.appendChild(grid);

  const rivWrap = document.createElement('div');
  rivWrap.className = 'records-grid records-grid--wide';
  let rivCard: HTMLElement;
  if (riv.status === 'fulfilled') {
    rivCard = rivalryBoard('Biggest rivalries', 'By total tour-level meetings, 2000+.', riv.value);
  } else {
    console.error('Records: "Biggest rivalries" failed —', riv.reason);
    rivCard = errorCard('Biggest rivalries', 'By total tour-level meetings, 2000+.');
  }
  rivWrap.appendChild(rivCard);
  mount.appendChild(rivWrap);
  built.push(rivCard);

  built.forEach(stagger);
}

function errorCard(title: string, caption: string, accent?: string): HTMLElement {
  const card = document.createElement('section');
  card.className = 'panel lb-card';
  if (accent) card.style.setProperty('--lb-accent', accent);
  card.innerHTML =
    `<div class="lb-head"><h2 class="lb-title">${escapeHtml(title)}</h2></div>` +
    (caption ? `<p class="lb-cap faint">${escapeHtml(caption)}</p>` : '') +
    `<p class="lb-error">Couldn't load this leaderboard. Try refreshing.</p>`;
  return card;
}
