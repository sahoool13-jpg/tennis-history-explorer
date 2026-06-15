import { getPlayerSummary, getSurfaceSplits, getH2H } from '../db';
import { searchBox } from '../components/searchBox';
import { surfaceSplit } from '../components/surfaceSplit';
import { escapeHtml } from '../components/searchBox';
import { navigate } from '../router';

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

function picker(idA?: string, idB?: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'h2h-picker';

  const goto = (a?: string, b?: string) => {
    if (a && b) navigate(`/h2h/${a}/${b}`);
    else if (a) navigate(`/h2h/${a}`);
    else navigate('/h2h');
  };

  const a = searchBox('Player one', (p) => goto(String(p.player_id), idB));
  const b = searchBox('Player two', (p) => goto(idA, String(p.player_id)));
  wrap.append(a, b);
  return wrap;
}

export async function renderH2H(
  mount: HTMLElement,
  idA?: string,
  idB?: string,
): Promise<void> {
  mount.replaceChildren();

  const title = document.createElement('h1');
  title.className = 'home-title';
  title.textContent = 'Head-to-head';
  mount.append(title, picker(idA, idB));

  if (!idA || !idB) {
    const hint = document.createElement('p');
    hint.className = 'muted';
    hint.textContent = 'Pick two players to compare their record and surface splits.';
    mount.appendChild(hint);
    return;
  }

  const loading = document.createElement('p');
  loading.className = 'muted';
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
    const err = document.createElement('p');
    err.className = 'muted';
    err.textContent = 'One of those players could not be found.';
    mount.appendChild(err);
    return;
  }

  const nameA = sumA.player_name;
  const nameB = sumB.player_name;

  const record = document.createElement('section');
  record.className = 'h2h-record';
  if (!h2h) {
    record.innerHTML =
      `<p class="muted">${escapeHtml(nameA)} and ${escapeHtml(nameB)} have not met ` +
      `in this dataset.</p>`;
  } else {
    record.innerHTML = `
      <div class="h2h-score">
        <div class="h2h-score__side">
          <div class="h2h-score__name">${escapeHtml(nameA)}</div>
          <div class="h2h-score__wins">${h2h.player_wins}</div>
        </div>
        <div class="h2h-score__mid">
          <div class="h2h-score__meetings">${h2h.meetings} meetings</div>
          <div class="muted">last met ${fmtDate(h2h.last_meeting_date)}</div>
        </div>
        <div class="h2h-score__side">
          <div class="h2h-score__name">${escapeHtml(nameB)}</div>
          <div class="h2h-score__wins">${h2h.opp_wins}</div>
        </div>
      </div>`;
  }
  mount.appendChild(record);

  const cols = document.createElement('div');
  cols.className = 'h2h-cols';
  for (const [name, splits] of [[nameA, splitsA], [nameB, splitsB]] as const) {
    const col = document.createElement('div');
    col.className = 'h2h-col';
    const head = document.createElement('h3');
    head.className = 'h2h-col__name';
    head.textContent = name;
    col.append(head, surfaceSplit(splits));
    cols.appendChild(col);
  }
  mount.appendChild(cols);
}
