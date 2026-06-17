// Explorable Match Point boards: a filter bar over a live-queried, paged list.
// Match boards (Blowouts, Marathons, Comebacks) filter by search + surface +
// era and re-rank within the filter; career player boards (bagels, tiebreaks,
// retirements) filter by player name. Integrity gates live in db.ts, inside the
// base query — filters only narrow, never relax them.
import { mpMatchBoard } from './db';
import type { MpBoard } from './db';
import { matchCard, rallyPlayer, reveal } from './mpkit';
import { escapeHtml } from './components/searchBox';
import { surfaceColor } from './palette';
import { prefersReducedMotion } from './motion';
import type { MpMatch, MpPlayerRow, MpPlayerPage } from './types';

const DEFAULT_DEPTH = 15;
const MAX_DEPTH = 50;
const SURFACES = ['Hard', 'Clay', 'Grass', 'Carpet'];
const ERAS: Array<{ key: string; label: string }> = [
  { key: '2000', label: '2000–09' },
  { key: '2010', label: '2010–19' },
  { key: '2020', label: '2020–now' },
];

function debounce<T extends (...a: never[]) => void>(fn: T, ms = 200): T {
  let t: ReturnType<typeof setTimeout> | undefined;
  return ((...a: never[]) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }) as T;
}

const emptyState = (hint: string): HTMLElement => {
  const p = document.createElement('p');
  p.className = 'mp-empty';
  p.textContent = hint;
  return p;
};

// "Show more" + count footer. Returns the element (or null when nothing to add).
function resultFoot(
  shown: number, total: number, depth: number, filtered: boolean,
  onMore: () => void,
): HTMLElement | null {
  if (shown === 0) return null;
  const foot = document.createElement('div');
  foot.className = 'mp-result-foot';
  const count = document.createElement('span');
  count.className = 'mp-result-count faint tnum';
  count.textContent = filtered
    ? `Showing top ${shown} of ${total.toLocaleString()} matching`
    : `Top ${shown} of ${total.toLocaleString()}`;
  foot.appendChild(count);
  if (shown < total && depth < MAX_DEPTH) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn mp-more';
    btn.textContent = `Show more`;
    btn.addEventListener('click', onMore);
    foot.appendChild(btn);
  }
  return foot;
}

// ---- match boards (search + surface + era) ---------------------------------
export interface MatchExplorerOpts {
  board: MpBoard;
  badge?: (m: MpMatch) => string;
  emptyHint?: string;
}

export function matchExplorer(opts: MatchExplorerOpts): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'mp-explore';
  let q = '';
  const surfaces = new Set<string>();
  let era: string | null = null;
  let depth = DEFAULT_DEPTH;
  let reqId = 0;

  const results = document.createElement('div');
  results.className = 'mp-explore__results';

  const filtered = () => q.trim() !== '' || surfaces.size > 0 || era !== null;

  // --- filter bar (built once; events mutate state then refresh) ----------
  const bar = document.createElement('div');
  bar.className = 'mp-filterbar';
  const search = document.createElement('input');
  search.type = 'text';
  search.className = 'searchbox__input mp-filter__search';
  search.placeholder = 'Search player or tournament…';
  search.setAttribute('aria-label', 'Search player or tournament');

  const surfWrap = document.createElement('div');
  surfWrap.className = 'mp-chips';
  SURFACES.forEach((s) => {
    const c = document.createElement('button');
    c.type = 'button';
    c.className = 'mp-chip';
    c.style.setProperty('--c', surfaceColor(s));
    c.innerHTML = `<span class="mp-dot" style="--c:${surfaceColor(s)}"></span>${s}`;
    c.addEventListener('click', () => {
      if (surfaces.has(s)) { surfaces.delete(s); c.classList.remove('is-on'); }
      else { surfaces.add(s); c.classList.add('is-on'); }
      depth = DEFAULT_DEPTH; refresh();
    });
    surfWrap.appendChild(c);
  });

  const eraWrap = document.createElement('div');
  eraWrap.className = 'mp-chips';
  ERAS.forEach((e) => {
    const c = document.createElement('button');
    c.type = 'button';
    c.className = 'mp-chip mp-chip--era';
    c.textContent = e.label;
    c.addEventListener('click', () => {
      era = era === e.key ? null : e.key;
      eraWrap.querySelectorAll('.mp-chip').forEach((b) => b.classList.remove('is-on'));
      if (era) c.classList.add('is-on');
      depth = DEFAULT_DEPTH; refresh();
    });
    eraWrap.appendChild(c);
  });

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'mp-filter__reset';
  reset.textContent = 'Reset';
  reset.addEventListener('click', () => {
    q = ''; search.value = ''; era = null; surfaces.clear(); depth = DEFAULT_DEPTH;
    surfWrap.querySelectorAll('.mp-chip').forEach((b) => b.classList.remove('is-on'));
    eraWrap.querySelectorAll('.mp-chip').forEach((b) => b.classList.remove('is-on'));
    refresh();
  });

  const runSearch = debounce(() => { q = search.value; depth = DEFAULT_DEPTH; refresh(); });
  search.addEventListener('input', runSearch);

  bar.append(search, surfWrap, eraWrap, reset);
  wrap.append(bar, results);

  async function refresh(): Promise<void> {
    const id = ++reqId;
    reset.hidden = !filtered();
    let page;
    try {
      page = await mpMatchBoard(opts.board, { q, surfaces: [...surfaces], era }, depth);
    } catch (err) {
      console.error('Match Point filter query failed —', err);
      if (id === reqId) results.replaceChildren(emptyState('Couldn’t run that filter. Try again.'));
      return;
    }
    if (id !== reqId) return; // a newer request superseded this one
    results.replaceChildren();
    if (page.rows.length === 0) {
      results.appendChild(emptyState(opts.emptyHint ?? 'No matches found — try widening your filter.'));
      return;
    }
    const list = document.createElement('div');
    list.className = 'mp-matchlist';
    page.rows.forEach((m, i) => list.appendChild(
      matchCard(m, { rank: i + 1, badge: opts.badge ? opts.badge(m) : undefined })));
    results.appendChild(list);
    const foot = resultFoot(page.rows.length, page.total, depth, filtered(),
      () => { depth = MAX_DEPTH; refresh(); });
    if (foot) results.appendChild(foot);
    if (!prefersReducedMotion()) {
      requestAnimationFrame(() => reveal(list.querySelectorAll<HTMLElement>('.mp-match')));
    } else {
      list.querySelectorAll('.mp-match').forEach((n) => n.classList.add('in'));
    }
  }

  void refresh();
  return wrap;
}

// ---- career player boards (search by name) ---------------------------------
export interface PlayerBoardSpec {
  title: string;
  caption: string;
  fetch: (limit: number, q?: string) => Promise<MpPlayerPage>;
  fmt: (r: MpPlayerRow) => string;
}

export function playerExplorer(
  boards: PlayerBoardSpec[], placeholder = 'Search player…',
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'mp-explore';
  let q = '';
  const depths = boards.map(() => DEFAULT_DEPTH);
  const reqIds = boards.map(() => 0);

  const bar = document.createElement('div');
  bar.className = 'mp-filterbar mp-filterbar--name';
  const search = document.createElement('input');
  search.type = 'text';
  search.className = 'searchbox__input mp-filter__search';
  search.placeholder = placeholder;
  search.setAttribute('aria-label', placeholder);
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'mp-filter__reset';
  reset.textContent = 'Reset';
  reset.hidden = true;
  bar.append(search, reset);

  const grid = document.createElement('div');
  grid.className = 'records-grid';
  const slots = boards.map(() => {
    const s = document.createElement('div');
    s.className = 'mp-board-slot';
    grid.appendChild(s);
    return s;
  });
  wrap.append(bar, grid);

  async function refreshOne(i: number): Promise<void> {
    const id = ++reqIds[i];
    const spec = boards[i];
    let page: MpPlayerPage;
    try {
      page = await spec.fetch(depths[i], q);
    } catch (err) {
      console.error(`Match Point board "${spec.title}" failed —`, err);
      if (id === reqIds[i]) slots[i].replaceChildren(buildErrorCard(spec.title, spec.caption));
      return;
    }
    if (id !== reqIds[i]) return;
    slots[i].replaceChildren(buildPlayerCard(spec, page, depths[i], q.trim() !== '',
      () => { depths[i] = MAX_DEPTH; void refreshOne(i); }));
  }

  const refreshAll = () => boards.forEach((_, i) => { void refreshOne(i); });
  const runSearch = debounce(() => {
    q = search.value; reset.hidden = q.trim() === '';
    depths.forEach((_, i) => { depths[i] = DEFAULT_DEPTH; });
    refreshAll();
  });
  search.addEventListener('input', runSearch);
  reset.addEventListener('click', () => {
    q = ''; search.value = ''; reset.hidden = true;
    depths.forEach((_, i) => { depths[i] = DEFAULT_DEPTH; });
    refreshAll();
  });

  refreshAll();
  return wrap;
}

const iocHtml = (ioc: string | null) =>
  ioc ? ` <span class="lb-ioc">${escapeHtml(ioc)}</span>` : '';

function buildPlayerCard(
  spec: PlayerBoardSpec, page: MpPlayerPage, depth: number, filtered: boolean,
  onMore: () => void,
): HTMLElement {
  const card = document.createElement('section');
  card.className = 'panel lb-card mp-lb';
  card.innerHTML =
    `<div class="lb-head"><h2 class="lb-title">${escapeHtml(spec.title)}</h2></div>`
    + (spec.caption ? `<p class="lb-cap faint">${escapeHtml(spec.caption)}</p>` : '');
  const list = document.createElement('div');
  list.className = 'lb-list';
  if (page.rows.length === 0) {
    list.appendChild(emptyState('No players match — try another name.'));
  }
  page.rows.forEach((r, i) => {
    const a = document.createElement('a');
    a.className = 'lb-row' + (i === 0 ? ' lb-row--top' : '');
    a.href = rallyPlayer(r.player_id);
    const sub = r.detail ? escapeHtml(r.detail) : `${r.matches} matches`;
    a.innerHTML = `
      <span class="lb-rank tnum">${i + 1}</span>
      <span class="lb-who"><span class="lb-name">${escapeHtml(r.player_name)}</span>${iocHtml(r.ioc)}
        <span class="lb-sub tnum">${sub}</span></span>
      <span class="lb-val tnum">${spec.fmt(r)}</span>`;
    list.appendChild(a);
  });
  card.appendChild(list);
  const foot = resultFoot(page.rows.length, page.total, depth, filtered, onMore);
  if (foot) card.appendChild(foot);
  if (!prefersReducedMotion()) {
    requestAnimationFrame(() => reveal(list.querySelectorAll<HTMLElement>('.lb-row')));
  } else {
    list.querySelectorAll('.lb-row').forEach((n) => n.classList.add('in'));
  }
  return card;
}

function buildErrorCard(title: string, caption: string): HTMLElement {
  const card = document.createElement('section');
  card.className = 'panel lb-card mp-lb';
  card.innerHTML =
    `<div class="lb-head"><h2 class="lb-title">${escapeHtml(title)}</h2></div>`
    + (caption ? `<p class="lb-cap faint">${escapeHtml(caption)}</p>` : '')
    + `<p class="lb-error">Couldn’t load this board. Try refreshing.</p>`;
  return card;
}
