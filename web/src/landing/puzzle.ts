// Daily "guess the player" puzzle. Deterministic per calendar date — everyone
// gets the same mystery player on a given day, and it changes at local midnight.
// State is in-memory only (no localStorage in this environment); the share text
// encodes the result so a session needs no persistence.
import { escapeHtml } from '../components/searchBox';
import { getSurfaceSplits } from '../db';
import { surfaceColor } from '../palette';
import type { PuzzlePlayer, SurfaceSplit } from '../types';

const MAX_GUESSES = 6;
const EPOCH = Date.UTC(2000, 0, 1);

// Portable FNV-1a 32-bit hash — identical in Python (verified), so the daily
// pick is reproducible and checkable.
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface PuzzleDate { seed: string; dayNumber: number; }

// Local calendar date → stable seed + a Wordle-style day counter.
export function puzzleDate(now = new Date()): PuzzleDate {
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const seed = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dayNumber = Math.floor((Date.UTC(y, m, d) - EPOCH) / 86_400_000);
  return { seed, dayNumber };
}

type Status = 'hit' | 'near' | 'miss';
interface Cell { label: string; status: Status; arrow?: '▲' | '▼'; }

const EMOJI: Record<Status, string> = { hit: '🟩', near: '🟨', miss: '⬛' };
const COLS = ['Country', 'Hand', 'Debut', 'Peak', 'Titles'] as const;

// Numeric comparison cell. The status (hit/near/miss) is the comparison logic and
// is identical for every numeric attribute. `invertArrow` only flips the DISPLAYED
// direction — used for peak ranking, where a smaller number is the better rank, so
// "▲" should mean "a better ranking (closer to #1)" rather than "a higher number".
function numCell(label: string, mine: number | null, target: number | null,
                 nearWithin: number, invertArrow = false): Cell {
  if (mine == null || target == null) return { label: '—', status: 'miss' };
  const d = target - mine;
  const status: Status = d === 0 ? 'hit' : Math.abs(d) <= nearWithin ? 'near' : 'miss';
  let dir = d > 0 ? 1 : d < 0 ? -1 : 0;
  if (invertArrow) dir = -dir;
  const arrow = dir > 0 ? '▲' : dir < 0 ? '▼' : undefined;
  return { label, status, arrow };
}

function compare(guess: PuzzlePlayer, target: PuzzlePlayer): Cell[] {
  const country: Cell = {
    label: guess.ioc ?? '—',
    status: guess.ioc && guess.ioc === target.ioc ? 'hit' : 'miss',
  };
  const hand: Cell = {
    label: handLabel(guess.hand),
    status: guess.hand && guess.hand === target.hand ? 'hit' : 'miss',
  };
  const debut = numCell(String(guess.debut_year ?? '—'),
    guess.debut_year, target.debut_year, 3);
  // peak rank: a smaller NUMBER is a better peak, so flip the arrow — "▲" means the
  // answer is a BETTER ranking (closer to #1). Status logic is unchanged.
  const peak = numCell(`#${guess.career_high_rank ?? '—'}`,
    guess.career_high_rank, target.career_high_rank, 5, true);
  const titles = numCell(String(guess.titles),
    guess.titles, target.titles, 3);
  return [country, hand, debut, peak, titles];
}

const handLabel = (h: string | null): string =>
  h === 'R' ? 'Right' : h === 'L' ? 'Left' : h === 'U' ? 'Unknown' : '—';

// Spoken description of a tile — meaning without relying on colour. Mirrors the
// arrow convention: numbers say higher/lower; peak ranking says better/worse.
function cellAria(col: string, c: Cell): string {
  if (c.status === 'hit') return `${col}: exact match`;
  const close = c.status === 'near' ? 'close' : 'not close';
  if (!c.arrow) return `${col}: ${close}, no match`;
  const dir = col === 'Peak'
    ? (c.arrow === '▲' ? 'answer is a better ranking, closer to number 1' : 'answer is a worse ranking')
    : (c.arrow === '▲' ? 'answer is higher' : 'answer is lower');
  return `${col}: ${close}, ${dir}`;
}

// Always-visible legend. The thresholds here are TRUE to numCell's nearWithin
// arguments (debut 3, peak 5, titles 3) and country/hand being exact-only.
function keyHtml(): string {
  return `
    <div class="pz-key" aria-label="How to read each tile">
      <p class="pz-key__title">Key — how to read each tile</p>
      <ul class="pz-key__list pz-key__colors">
        <li><span class="pz-sw pz-sw--hit" aria-hidden="true">✓</span>
          <span><b>Green</b> — exact match.</span></li>
        <li><span class="pz-sw pz-sw--near" aria-hidden="true"></span>
          <span><b>Gold</b> — close: debut <b>within 3 years</b>, peak <b>within 5 spots</b>,
            titles <b>within 3</b>.</span></li>
        <li><span class="pz-sw pz-sw--miss" aria-hidden="true"></span>
          <span><b>Grey</b> — not close. The arrow still points the way.</span></li>
      </ul>
      <ul class="pz-key__list pz-key__arrows">
        <li><span class="pz-arr" aria-hidden="true">▲</span><span class="pz-arr" aria-hidden="true">▼</span>
          <span><b>Debut &amp; Titles:</b> <b>▲</b> the answer is higher than your guess,
            <b>▼</b> the answer is lower.</span></li>
        <li><span class="pz-arr" aria-hidden="true">▲</span><span class="pz-arr" aria-hidden="true">▼</span>
          <span><b>Peak ranking:</b> <b>▲</b> the answer is a better ranking (closer to #1),
            <b>▼</b> a worse ranking. A smaller number is better — #1 is the best.</span></li>
      </ul>
      <p class="pz-key__note faint">Country and Hand are exact-only — they show green or grey, never gold.</p>
    </div>`;
}

// --- puzzle widget ----------------------------------------------------------
export function renderPuzzle(
  mount: HTMLElement, pool: PuzzlePlayer[], date: PuzzleDate,
): void {
  if (pool.length === 0) {
    mount.innerHTML = `<p class="lb-error">Couldn't load today's puzzle. Try refreshing.</p>`;
    return;
  }
  const byId = new Map(pool.map((p) => [p.player_id, p]));
  const target = pool[fnv1a(date.seed) % pool.length];

  const guesses: PuzzlePlayer[] = [];
  let done = false;

  mount.replaceChildren();

  // one-line how-to-play, always at the top
  const how = document.createElement('p');
  how.className = 'pz-how';
  how.innerHTML = 'Guess the mystery player. After each guess, each tile shows how '
    + 'close you are — <b>green is exact</b>, <b>gold is close</b>, and the arrow '
    + 'points the way to the answer.';
  mount.appendChild(how);

  const board = document.createElement('div');
  board.className = 'pz-board';
  mount.appendChild(board);

  // always-visible legend, below the grid
  const key = document.createElement('div');
  key.innerHTML = keyHtml();
  mount.appendChild(key.firstElementChild!);

  const formWrap = document.createElement('div');
  formWrap.className = 'pz-form';
  mount.appendChild(formWrap);

  const endWrap = document.createElement('div');
  endWrap.className = 'pz-end';
  mount.appendChild(endWrap);

  function rowHtml(g: PuzzlePlayer): string {
    const cells = compare(g, target).map((c, i) => {
      // shape cue carries meaning without colour: ✓ for an exact match, else the
      // directional arrow (gold = close, grey = not close — both keep the arrow).
      const mark = c.status === 'hit'
        ? '<i class="pz-tick" aria-hidden="true">✓</i>'
        : c.arrow ? `<i class="pz-arr" aria-hidden="true">${c.arrow}</i>` : '';
      return `
      <span class="pz-cell pz-cell--${c.status}" role="img" aria-label="${cellAria(COLS[i], c)}">
        <span class="pz-cell__k">${COLS[i]}</span>
        <span class="pz-cell__v">${escapeHtml(c.label)}${mark}</span>
      </span>`;
    }).join('');
    return `<div class="pz-row"><span class="pz-row__who">${escapeHtml(g.player_name)}</span>
      <span class="pz-row__cells">${cells}</span></div>`;
  }

  function renderBoard(): void {
    const empties = Math.max(0, MAX_GUESSES - guesses.length - (done ? 0 : 1));
    board.innerHTML =
      guesses.map(rowHtml).join('')
      + (done ? '' : `<div class="pz-row pz-row--active"><span class="pz-row__who faint">Your guess…</span>
          <span class="pz-row__cells">${COLS.map((k) => `<span class="pz-cell pz-cell--blank"><span class="pz-cell__k">${k}</span><span class="pz-cell__v">·</span></span>`).join('')}</span></div>`)
      + Array.from({ length: empties }).map(() =>
          `<div class="pz-row pz-row--empty"><span class="pz-row__who"></span>
            <span class="pz-row__cells">${COLS.map(() => '<span class="pz-cell pz-cell--empty"></span>').join('')}</span></div>`).join('');
  }

  function submit(p: PuzzlePlayer): void {
    if (done || guesses.some((g) => g.player_id === p.player_id)) return;
    guesses.push(p);
    if (p.player_id === target.player_id || guesses.length >= MAX_GUESSES) {
      done = true;
      formWrap.replaceChildren();
      renderBoard();
      void renderEnd(p.player_id === target.player_id);
    } else {
      renderBoard();
    }
  }

  // --- guess input with pool-filtered autocomplete --------------------------
  function buildForm(): void {
    formWrap.innerHTML = `
      <label class="pz-label" for="pz-input">Guess (${MAX_GUESSES - guesses.length} left)</label>
      <div class="searchbox pz-search">
        <input id="pz-input" class="searchbox__input" type="text" autocomplete="off"
               placeholder="Name a player — e.g. Federer" aria-label="Guess the player" />
        <ul class="searchbox__results pz-results" role="listbox"></ul>
      </div>`;
    const input = formWrap.querySelector<HTMLInputElement>('#pz-input')!;
    const results = formWrap.querySelector<HTMLUListElement>('.pz-results')!;
    const guessedIds = new Set(guesses.map((g) => g.player_id));

    const renderMatches = () => {
      const t = input.value.trim().toLowerCase();
      results.innerHTML = '';
      if (!t) return;
      const hits = pool
        .filter((p) => !guessedIds.has(p.player_id) && p.player_name.toLowerCase().includes(t))
        .slice(0, 8);
      for (const p of hits) {
        const li = document.createElement('li');
        li.className = 'searchbox__item';
        li.setAttribute('role', 'option');
        li.innerHTML = `<span class="searchbox__name">${escapeHtml(p.player_name)}</span>
          <span class="searchbox__meta">${escapeHtml(p.ioc ?? '')}</span>`;
        li.addEventListener('click', () => { submit(byId.get(p.player_id)!); });
        results.appendChild(li);
      }
    };
    input.addEventListener('input', renderMatches);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = results.querySelector<HTMLElement>('.searchbox__item');
        if (first) first.click();
      }
    });
    requestAnimationFrame(() => input.focus());
  }

  async function renderEnd(won: boolean): Promise<void> {
    const rallyHref = `${import.meta.env.BASE_URL}#/player/${target.player_id}`;
    const grid = [`Unforced Error Daily #${date.dayNumber} ${won ? guesses.length : 'X'}/${MAX_GUESSES}`]
      .concat(guesses.map((g) => compare(g, target).map((c) => EMOJI[c.status]).join('')))
      .join('\n');
    endWrap.innerHTML = `
      <p class="pz-verdict">${won ? `Solved in ${guesses.length}.` : 'Out of guesses.'}</p>
      <p class="pz-reveal">Today's player —
        <a href="${rallyHref}">${escapeHtml(target.player_name)}</a>
        <span class="faint">(${escapeHtml(target.ioc ?? '—')}, peak #${target.career_high_rank ?? '—'},
        ${target.titles} titles, ${target.total_matches} tour matches, ${target.debut_year}–${target.last_year})</span></p>
      <div class="pz-surf" aria-label="surface record"></div>
      <button class="btn pz-share" type="button">Copy result</button>
      <p class="pz-share-note faint" hidden>Copied — paste it anywhere.</p>`;

    // surface win% reveal (reuses Rally's verified aggregate)
    try {
      const splits = (await getSurfaceSplits(target.player_id))
        .filter((s: SurfaceSplit) => s.matches >= 20)
        .sort((a, b) => b.win_pct - a.win_pct);
      const host = endWrap.querySelector<HTMLElement>('.pz-surf')!;
      host.innerHTML = splits.map((s) => `
        <span class="pz-surf__chip"><span class="mp-dot" style="--c:${surfaceColor(s.surface)}"></span>
          ${escapeHtml(s.surface)} <b>${Math.round(s.win_pct * 100)}%</b></span>`).join('');
    } catch { /* surface reveal is non-critical */ }

    const btn = endWrap.querySelector<HTMLButtonElement>('.pz-share')!;
    const note = endWrap.querySelector<HTMLElement>('.pz-share-note')!;
    btn.addEventListener('click', () => {
      void navigator.clipboard?.writeText(grid).then(() => { note.hidden = false; });
    });
  }

  renderBoard();
  buildForm();
}
