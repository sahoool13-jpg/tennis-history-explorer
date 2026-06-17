import { surfaceColor } from '../palette';
import { showTooltip, hideTooltip } from './tooltip';
import { STAGGER_MS, prefersReducedMotion } from '../motion';
import { escapeHtml } from './searchBox';
import type { Meeting } from '../types';

// The rivalry timeline — the H2H hero. A horizontal time axis from first to
// last meeting; each meeting is a dot at its date, coloured by surface, placed
// above the line if player one won and below if player two won. Grand Slam
// meetings are larger and ringed (tourney_level === 'G'). Dots stagger in
// left-to-right; hovering one reveals an editorial card and dims the rest.

const ROUND_LABEL: Record<string, string> = {
  F: 'Final', SF: 'Semifinal', QF: 'Quarterfinal',
  R16: 'Round of 16', R32: 'Round of 32', R64: 'Round of 64', R128: 'Round of 128',
  RR: 'Round robin', BR: 'Bronze-medal match', ER: 'Early round',
};

const fullDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
const year = (d: string) => new Date(d).getUTCFullYear();

function cardHTML(m: Meeting, winner: string, loser: string): string {
  const round = m.round ? ROUND_LABEL[m.round] ?? m.round : '';
  const tier = m.level_label ? ` · ${m.level_label}` : '';
  const where = [m.surface, round].filter(Boolean).join(' · ');
  const score = m.score ? m.score.replace(/-/g, '–') : '';
  const tourn = m.tourney_name ? `${escapeHtml(m.tourney_name)} ${year(m.date)}` : `${year(m.date)}`;
  return `
    <div class="tt">
      <div class="tt__head"><span class="tt__swatch" style="background:${surfaceColor(m.surface)}"></span>
        <span>${escapeHtml(where)}${escapeHtml(tier)}</span></div>
      <div class="tt__tourn">${tourn}</div>
      <div class="tt__win"><strong>${escapeHtml(winner)}</strong> def. ${escapeHtml(loser)}</div>
      ${score ? `<div class="tt__score tnum">${escapeHtml(score)}</div>` : ''}
      <div class="tt__date faint">${fullDate(m.date)}</div>
    </div>`;
}

export function rivalryTimeline(
  meetings: Meeting[],
  nameA: string,
  nameB: string,
  colorA: string,
  colorB: string,
): HTMLElement {
  const root = document.createElement('section');
  root.className = 'panel rivalry-timeline-wrap';
  root.innerHTML = `<p class="eyebrow">The rivalry, match by match</p>`;

  if (meetings.length === 0) {
    root.insertAdjacentHTML('beforeend', `<p class="muted">No meetings on record.</p>`);
    return root;
  }

  // legend: who's above, who's below
  const legend = document.createElement('div');
  legend.className = 'tl-legend';
  legend.innerHTML =
    `<span class="tl-leg" style="color:${colorA}">▲ ${escapeHtml(nameA)} won</span>` +
    `<span class="tl-leg" style="color:${colorB}">▼ ${escapeHtml(nameB)} won</span>`;
  root.appendChild(legend);

  const tl = document.createElement('div');
  tl.className = 'timeline';
  const axis = document.createElement('div');
  axis.className = 'tl-axis';
  tl.appendChild(axis);

  const times = meetings.map((m) => +new Date(m.date));
  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = Math.max(max - min, 1);

  const UP = 'calc(50% - 34px)';
  const DOWN = 'calc(50% + 34px)';

  const dots: HTMLButtonElement[] = [];
  for (const m of meetings) {
    const x = ((+new Date(m.date) - min) / span) * 100;
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'dot' + (m.won ? ' dot--up' : ' dot--down') +
      (m.tourney_level === 'G' ? ' dot--gs' : '');
    dot.style.left = `${x}%`;
    dot.style.top = m.won ? UP : DOWN;
    dot.style.setProperty('--c', surfaceColor(m.surface));

    const winner = m.won ? nameA : nameB;
    const loser = m.won ? nameB : nameA;
    dot.setAttribute(
      'aria-label',
      `${fullDate(m.date)}, ${m.surface}, ${m.round ?? ''}: ${winner} beat ${loser}`,
    );
    const html = cardHTML(m, winner, loser);

    const enter = () => {
      tl.classList.add('focusing');
      dot.classList.add('is-focus');
      showTooltip(html, dot.getBoundingClientRect());
    };
    const leave = () => {
      tl.classList.remove('focusing');
      dot.classList.remove('is-focus');
      hideTooltip();
    };
    dot.addEventListener('mouseenter', enter);
    dot.addEventListener('mouseleave', leave);
    dot.addEventListener('focus', enter);
    dot.addEventListener('blur', leave);

    dots.push(dot);
    tl.appendChild(dot);
  }

  // axis end labels (first & last meeting year)
  const ends = document.createElement('div');
  ends.className = 'tl-ends faint tnum';
  ends.innerHTML = `<span>${year(meetings[0].date)}</span><span>${year(meetings[meetings.length - 1].date)}</span>`;

  root.append(tl, ends);

  // entrance: staggered left-to-right reveal (meetings are date-sorted)
  const reduced = prefersReducedMotion();
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      dots.forEach((d, i) => {
        if (!reduced) d.style.transitionDelay = `${i * STAGGER_MS}ms`;
        d.classList.add('in');
      });
    }),
  );

  return root;
}
