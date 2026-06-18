// Family front door — a tennis almanac that refreshes daily. Leads with two
// living features (On This Day, and the daily puzzle), then the doors into
// Rally, Match Point, Records and the eras view. Reads only verified data; no
// number is recomputed here.
import { matchesOnDates, puzzlePool } from '../db';
import { matchCard, scoreline, reveal, rallyPlayer } from '../mpkit';
import { escapeHtml } from '../components/searchBox';
import { surfaceColor } from '../palette';
import { renderPuzzle, puzzleDate } from '../landing/puzzle';
import { renderNumberOfDay } from '../landing/numberOfDay';
import type { MpMatch } from '../types';

const ROUND_LABEL: Record<string, string> = {
  F: 'final', SF: 'semifinal', QF: 'quarterfinal', R16: 'round of 16',
  R32: 'round of 32', R64: 'round of 64', R128: 'round of 128', RR: 'round robin',
};

const BASE = import.meta.env.BASE_URL;
const PUZZLE_FLOOR = 'top-30 peak ranking and 300+ tour matches';
const PUZZLE_POOL_NOTE = '149 players';

// build the month-day key (month*100 + day) for a date offset from today
function mmddOffset(base: Date, days: number): number {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return (d.getMonth() + 1) * 100 + d.getDate();
}

export async function renderLanding(mount: HTMLElement): Promise<void> {
  mount.replaceChildren();
  mount.style.removeProperty('--accent');
  const now = new Date();

  mount.appendChild(masthead());

  // --- hero: On This Day --------------------------------------------------
  const hero = document.createElement('section');
  hero.className = 'lp-hero';
  const longDate = now.toLocaleDateString('en-GB',
    { weekday: 'long', day: 'numeric', month: 'long' });
  hero.innerHTML = `
    <p class="eyebrow">On this day · ATP tour-level singles · 2000–present</p>
    <h1 class="lp-hero__title">${escapeHtml(longDate)}</h1>
    <p class="lp-hero__lede">The biggest matches from tournaments dated to this day
      across the seasons — Grand Slam stage first. (Dates follow each event's start.)</p>
    <div class="lp-otd"><p class="loading">Loading the almanac…</p></div>`;
  mount.appendChild(hero);
  void fillOnThisDay(hero.querySelector<HTMLElement>('.lp-otd')!, now);

  // --- daily puzzle -------------------------------------------------------
  const pz = document.createElement('section');
  pz.className = 'lp-puzzle panel';
  const pd = puzzleDate(now);
  pz.innerHTML = `
    <p class="eyebrow">The daily · puzzle #${pd.dayNumber}</p>
    <h2 class="lp-h2">Guess the player</h2>
    <p class="lp-puzzle__sub">Six guesses. Each one shows how close you are on
      country, hand, debut year, peak ranking and titles. Drawn from
      ${PUZZLE_POOL_NOTE} who reached a ${PUZZLE_FLOOR}. New player every day.</p>
    <div class="lp-puzzle__mount"><p class="loading">Loading today's player…</p></div>`;
  mount.appendChild(pz);
  void fillPuzzle(pz.querySelector<HTMLElement>('.lp-puzzle__mount')!, pd);

  // --- number of the day --------------------------------------------------
  const num = document.createElement('section');
  num.className = 'lp-number panel';
  num.innerHTML = `<p class="loading">…</p>`;
  mount.appendChild(num);
  void renderNumberOfDay(num, pd.seed);

  // --- doors --------------------------------------------------------------
  mount.appendChild(doors());

  // --- footer -------------------------------------------------------------
  const foot = document.createElement('footer');
  foot.className = 'sitefoot lp-foot';
  foot.innerHTML = `<strong>Unforced Error</strong> — Rally &amp; Match Point ·
    Data by Jeff Sackmann · ATP singles · CC BY-NC-SA 4.0 ·
    “On this day” and the daily puzzle read only recorded tour-level matches, 2000–present.`;
  mount.appendChild(foot);
}

function masthead(): HTMLElement {
  const m = document.createElement('header');
  m.className = 'lp-masthead';
  m.innerHTML = `
    <div class="lp-umbrella">
      <span class="lp-brand">Unforced&nbsp;Error</span>
      <p class="lp-brand__tag">A quarter-century of men's tennis, read two ways.</p>
    </div>
    <div class="lp-family" role="list">
      <span class="lp-fam lp-fam--rally" role="listitem">
        <span class="lp-fam__head"><span class="brand__word">Rally</span>
          <span class="brand__mark" aria-hidden="true"><i></i><i></i><i></i></span></span>
        <span class="lp-fam__desc">Players &amp; surfaces</span>
      </span>
      <span class="lp-fam lp-fam--mp" role="listitem">
        <span class="lp-fam__head"><span class="mp-word"><span>Match</span><span class="mp-word__pt">Point</span></span></span>
        <span class="lp-fam__desc">By the scoreline</span>
      </span>
    </div>`;
  return m;
}

async function fillOnThisDay(host: HTMLElement, now: Date): Promise<void> {
  try {
    const today = mmddOffset(now, 0);
    let matches = await matchesOnDates([today], 7);
    let widened = false;
    if (matches.length < 4) {
      const week = [-3, -2, -1, 0, 1, 2, 3].map((o) => mmddOffset(now, o));
      matches = await matchesOnDates(week, 7);
      widened = true;
    }
    host.replaceChildren();
    if (matches.length === 0) {
      host.innerHTML = `<p class="muted">No tour-level matches are recorded around
        this date in the 2000–present data. Try a door below.</p>`;
      return;
    }
    if (widened) {
      const note = document.createElement('p');
      note.className = 'lp-otd__note faint';
      note.textContent = 'A quiet day on this exact date — showing this week in tennis instead.';
      host.appendChild(note);
    }
    // headline: the single most significant match (biggest stage first)
    host.appendChild(headlineResult(matches[0]));
    // the rest, as a tighter list
    if (matches.length > 1) {
      const more = document.createElement('p');
      more.className = 'eyebrow lp-otd__more';
      more.textContent = 'Also on this day';
      host.appendChild(more);
      const list = document.createElement('div');
      list.className = 'mp-matchlist';
      matches.slice(1).forEach((m: MpMatch) => {
        list.appendChild(matchCard(m, {
          yearOnly: true,
          badge: m.round === 'F' ? 'Final' : undefined,
        }));
      });
      host.appendChild(list);
    }
    requestAnimationFrame(() => reveal(host.querySelectorAll<HTMLElement>('.mp-match')));
  } catch (err) {
    console.error('Landing: On This Day failed —', err);
    host.innerHTML = `<p class="lb-error">Couldn't load the almanac. Try refreshing.</p>`;
  }
}

// The day's headline match, presented prominently (scoreline-as-hero).
function headlineResult(m: MpMatch): HTMLElement {
  const el = document.createElement('article');
  el.className = 'lp-headline';
  const c = surfaceColor(m.surface);
  const round = m.round ? (ROUND_LABEL[m.round] ?? m.round.toLowerCase()) : '';
  const stage = [m.level_label, round].filter(Boolean).map((s) => escapeHtml(String(s))).join(' ');
  const rank = m.loser_rank != null ? ` <span class="lp-headline__seed tnum">#${m.loser_rank}</span>` : '';
  const year = (m.date || '').slice(0, 4);
  el.innerHTML = `
    <p class="eyebrow lp-headline__eyebrow">${escapeHtml(stage)} · ${escapeHtml(m.tourney_name ?? '')} ${escapeHtml(year)}</p>
    <div class="lp-headline__score">${scoreline(m.set_scores)}</div>
    <p class="lp-headline__who">
      <a href="${rallyPlayer(m.winner_id)}">${escapeHtml(m.winner_name)}</a>
      <span class="lp-headline__beat">def.</span>
      <a href="${rallyPlayer(m.loser_id)}">${escapeHtml(m.loser_name)}</a>${rank}
      <span class="lp-headline__surface"><span class="mp-dot" style="--c:${c}"></span>${escapeHtml(m.surface)}</span>
    </p>`;
  return el;
}

async function fillPuzzle(host: HTMLElement, pd: ReturnType<typeof puzzleDate>): Promise<void> {
  try {
    const pool = await puzzlePool();
    renderPuzzle(host, pool, pd);
  } catch (err) {
    console.error('Landing: puzzle failed —', err);
    host.innerHTML = `<p class="lb-error">Couldn't load today's puzzle. Try refreshing.</p>`;
  }
}

interface Door { href: string; eyebrow: string; title: string; blurb: string; cls: string; }
function doors(): HTMLElement {
  const sec = document.createElement('section');
  sec.className = 'lp-doors';
  const items: Door[] = [
    { href: '#/players', eyebrow: 'Rally', title: 'Players & surfaces',
      blurb: 'Search any player: surface identity, career arc, head-to-heads.', cls: 'lp-door--rally' },
    { href: `${BASE}matchpoint.html`, eyebrow: 'Match Point', title: 'By the scoreline',
      blurb: 'Blowouts, marathons, tiebreaks, comebacks and how matches end.', cls: 'lp-door--mp' },
    { href: '#/records', eyebrow: 'Rally', title: 'Records',
      blurb: 'Leaderboards: titles, wins, weeks at No. 1, best by surface.', cls: 'lp-door--rec' },
    { href: '#/eras', eyebrow: 'Rally', title: 'How the game changed',
      blurb: 'Four readings of how the men’s tour has shifted since 2000.', cls: 'lp-door--era' },
  ];
  sec.innerHTML = `<p class="eyebrow">Explore</p>
    <div class="lp-doorgrid">${items.map((d) => `
      <a class="lp-door ${d.cls}" href="${d.href}">
        <span class="lp-door__eyebrow">${escapeHtml(d.eyebrow)}</span>
        <span class="lp-door__title">${escapeHtml(d.title)}</span>
        <span class="lp-door__blurb">${escapeHtml(d.blurb)}</span>
        <span class="lp-door__go" aria-hidden="true">→</span>
      </a>`).join('')}</div>`;
  return sec;
}
