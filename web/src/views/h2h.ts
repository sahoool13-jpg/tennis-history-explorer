import { getPlayerSummary, getSurfaceSplits, getH2H } from '../db';
import { searchBox, escapeHtml } from '../components/searchBox';
import { surfaceCompare } from '../components/surfaceCompare';
import { navigate } from '../router';
import type { H2HRow } from '../types';

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

function picker(idA?: string, idB?: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'h2h-picker';
  const goto = (a?: string, b?: string) =>
    navigate(a && b ? `/h2h/${a}/${b}` : a ? `/h2h/${a}` : '/h2h');
  wrap.append(
    searchBox('Player one', (p) => goto(String(p.player_id), idB)),
    searchBox('Player two', (p) => goto(idA, String(p.player_id))),
  );
  return wrap;
}

function scoreboard(nameA: string, nameB: string, h: H2HRow): HTMLElement {
  const el = document.createElement('section');
  el.className = 'panel';
  const total = Math.max(h.meetings, 1);
  const aw = (h.player_wins / total) * 100;
  const bw = (h.opp_wins / total) * 100;
  el.innerHTML = `
    <div class="h2h-score">
      <div class="h2h-score__side">
        <div class="h2h-score__name">${escapeHtml(nameA)}</div>
        <div class="h2h-score__num tnum">${h.player_wins}</div>
      </div>
      <div class="h2h-score__dash">–</div>
      <div class="h2h-score__side h2h-score__side--right">
        <div class="h2h-score__name">${escapeHtml(nameB)}</div>
        <div class="h2h-score__num tnum">${h.opp_wins}</div>
      </div>
    </div>
    <div class="winshare" role="img"
         aria-label="${escapeHtml(nameA)} ${h.player_wins}, ${escapeHtml(nameB)} ${h.opp_wins}">
      <div class="winshare__a" style="width:${aw.toFixed(2)}%"></div>
      <div class="winshare__b" style="width:${bw.toFixed(2)}%"></div>
    </div>
    <p class="h2h-meta tnum">${h.meetings} meetings · last met ${fmtDate(h.last_meeting_date)}</p>
  `;
  return el;
}

export async function renderH2H(
  mount: HTMLElement,
  idA?: string,
  idB?: string,
): Promise<void> {
  mount.replaceChildren();
  const title = document.createElement('h1');
  title.className = 'h2h__title';
  title.textContent = 'Head to head';
  mount.append(title, picker(idA, idB));

  if (!idA || !idB) {
    mount.insertAdjacentHTML(
      'beforeend',
      `<p class="muted">Pick two players to compare their record and surface splits.</p>`,
    );
    return;
  }

  const loading = document.createElement('p');
  loading.className = 'loading';
  loading.textContent = 'Loading…';
  mount.appendChild(loading);

  const [sumA, sumB, h2h, splitsA, splitsB] = await Promise.all([
    getPlayerSummary(idA),
    getPlayerSummary(idB),
    getH2H(idA, idB),
    getSurfaceSplits(idA),
    getSurfaceSplits(idB),
  ]);
  loading.remove();

  if (!sumA || !sumB) {
    mount.insertAdjacentHTML('beforeend', `<p class="muted">One of those players could not be found.</p>`);
    return;
  }

  const nameA = sumA.player_name;
  const nameB = sumB.player_name;

  if (!h2h) {
    mount.insertAdjacentHTML(
      'beforeend',
      `<p class="h2h-none">${escapeHtml(nameA)} and ${escapeHtml(nameB)} have not met in this dataset.</p>`,
    );
  } else {
    mount.appendChild(scoreboard(nameA, nameB, h2h));
  }

  mount.appendChild(surfaceCompare(splitsA, splitsB, nameA, nameB));
}
