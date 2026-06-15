import { getPlayerSummary, getSurfaceSplits, getCareerArc } from '../db';
import { surfaceSplit } from '../components/surfaceSplit';
import { careerArc } from '../components/careerArc';
import { escapeHtml } from '../components/searchBox';
import { navigate } from '../router';
import type { PlayerSummary } from '../types';

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) : '—';

function headerCard(s: PlayerSummary): HTMLElement {
  const card = document.createElement('header');
  card.className = 'player-header';

  const ioc = s.ioc ? `<span class="player-header__ioc">${escapeHtml(s.ioc)}</span>` : '';
  const hand = s.hand ? `${s.hand}-handed` : 'hand unknown';

  const chRank =
    s.career_high_rank == null ? '—' : `#${s.career_high_rank}`;
  const spellStory =
    s.career_high_rank == null
      ? 'No ranking history on record.'
      : `${s.weeks_at_career_high} weeks at peak across ` +
        `${s.career_high_spells} spell${s.career_high_spells === 1 ? '' : 's'} · ` +
        `first reached ${fmtDate(s.career_high_first_date)}, ` +
        `last held ${fmtDate(s.career_high_last_date)}`;

  const golds =
    s.olympic_golds > 0
      ? `<div class="stat"><div class="stat__num">${s.olympic_golds}</div><div class="stat__lab">Olympic gold</div></div>`
      : '';

  card.innerHTML = `
    <div class="player-header__id">
      <h1 class="player-header__name">${escapeHtml(s.player_name)} ${ioc}</h1>
      <p class="muted">${escapeHtml(hand)} · ${s.total_matches} matches · played
        ${fmtDate(s.first_match_date)} – ${fmtDate(s.last_match_date)}</p>
    </div>
    <div class="player-header__stats">
      <div class="stat"><div class="stat__num">${pct(s.win_pct)}</div><div class="stat__lab">Win rate</div></div>
      <div class="stat"><div class="stat__num">${chRank}</div><div class="stat__lab">Career high</div></div>
      <div class="stat"><div class="stat__num">${s.titles}</div><div class="stat__lab">Titles</div></div>
      ${golds}
    </div>
    <p class="player-header__spell muted">${escapeHtml(spellStory)}</p>
  `;
  return card;
}

export async function renderPlayer(mount: HTMLElement, id: string): Promise<void> {
  mount.replaceChildren();
  const loading = document.createElement('p');
  loading.className = 'muted';
  loading.textContent = 'Loading…';
  mount.appendChild(loading);

  const [summary, splits, arc] = await Promise.all([
    getPlayerSummary(id),
    getSurfaceSplits(id),
    getCareerArc(id),
  ]);

  mount.replaceChildren();

  if (!summary) {
    const err = document.createElement('p');
    err.className = 'muted';
    err.innerHTML = `No player found for id ${escapeHtml(id)}. <a href="#/">Back to search</a>.`;
    mount.appendChild(err);
    return;
  }

  const compare = document.createElement('div');
  compare.className = 'player-actions';
  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = 'Compare head-to-head →';
  btn.addEventListener('click', () => navigate(`/h2h/${summary.player_id}`));
  compare.appendChild(btn);

  mount.append(
    headerCard(summary),
    surfaceSplit(splits),
    careerArc(arc, summary.career_high_rank),
    compare,
  );
}
