import { getPlayerSummary, getSurfaceSplits, getCareerArc, mpPlayerProfile } from '../db';
import { surfaceColor } from '../palette';
import { surfaceSplit } from '../components/surfaceSplit';
import { signatureRadar } from '../components/signatureRadar';
import { careerArc } from '../components/careerArc';
import { escapeHtml } from '../components/searchBox';
import { scoreline, fmtDuration } from '../mpkit';
import { navigate } from '../router';
import type { PlayerSummary, MpPlayerProfile, MpProfileMatch } from '../types';

const MP_BASE = `${import.meta.env.BASE_URL}matchpoint.html`;

const pct = (x: number) => `${(x * 100).toFixed(1)}`;
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) : '—';

function headerCard(s: PlayerSummary): HTMLElement {
  const card = document.createElement('header');
  card.className = 'player-header';

  const ioc = s.ioc ? `<span class="player-header__ioc">${escapeHtml(s.ioc)}</span>` : '';
  const hand = s.hand ? `${s.hand}-handed` : 'hand unknown';
  const chRank = s.career_high_rank == null ? '—' : `#${s.career_high_rank}`;

  const spellStory =
    s.career_high_rank == null
      ? 'No ranking history on record.'
      : `${s.weeks_at_career_high} weeks at peak, across ` +
        `${s.career_high_spells} spell${s.career_high_spells === 1 ? '' : 's'} — ` +
        `first reached ${fmtDate(s.career_high_first_date)}, ` +
        `last held ${fmtDate(s.career_high_last_date)}.`;

  const golds =
    s.olympic_golds > 0
      ? `<div><div class="stat__num tnum">${s.olympic_golds}</div><div class="stat__lab">Olympic gold</div></div>`
      : '';

  card.innerHTML = `
    <span class="player-header__accent" aria-hidden="true"></span>
    <h1 class="player-header__name">${escapeHtml(s.player_name)}${ioc}</h1>
    <p class="player-header__sub">${escapeHtml(hand)} · ${s.total_matches} matches ·
      ${fmtDate(s.first_match_date)} – ${fmtDate(s.last_match_date)}</p>
    <div class="player-header__stats">
      <div><div class="stat__num tnum">${pct(s.win_pct)}<span class="faint" style="font-size:.42em">%</span></div><div class="stat__lab">Win rate</div></div>
      <div><div class="stat__num tnum">${chRank}</div><div class="stat__lab">Career high</div></div>
      <div><div class="stat__num tnum">${s.titles}</div><div class="stat__lab">Titles</div></div>
      ${golds}
    </div>
    <p class="player-header__spell">${escapeHtml(spellStory)}</p>
  `;
  return card;
}

// --- cross-board "Match Point profile" --------------------------------------
function profLine(m: MpProfileMatch | null, showResult = false): string {
  if (!m) return '<span class="mp-prof__empty">—</span>';
  const dot = `<span class="mp-dot" style="--c:${surfaceColor(m.surface)}"></span>`;
  const rank = m.opp_rank != null ? ` <span class="mp-prof__seed tnum">#${m.opp_rank}</span>` : '';
  const res = showResult ? `<span class="mp-prof__res">${m.won ? 'W' : 'L'}</span> ` : '';
  return `${scoreline(m.set_scores)}<span class="mp-prof__ctx">${res}vs ${escapeHtml(m.opponent ?? '—')}${rank}`
    + ` · ${dot}${escapeHtml(m.tourney_name ?? '')} ${m.year ?? ''}</span>`;
}

function matchPointProfile(p: MpPlayerProfile, playerName: string): HTMLElement {
  const sec = document.createElement('section');
  sec.className = 'panel mp-prof';
  const noneAtAll = !p.top_blowout && !p.longest && p.tb_played === 0
    && p.comeback_count === 0 && p.retired === 0 && p.wins_by_retirement === 0;
  if (noneAtAll) {
    sec.innerHTML = `<p class="eyebrow">Across Match Point</p>`
      + `<p class="muted">No tour-level Match Point appearances for ${escapeHtml(playerName)}.</p>`;
    return sec;
  }
  const row = (board: string, slug: string, body: string) =>
    `<div class="mp-prof__row">
       <a class="mp-prof__board" href="${MP_BASE}#/${slug}">${board}</a>
       <div class="mp-prof__body">${body}</div></div>`;

  const blow = p.top_blowout
    ? `<span class="mp-prof__lead tnum">${p.blowout_wins}</span> wins dropping ≤3 games`
      + `<span class="mp-prof__sub">most lopsided: ${profLine(p.top_blowout)}</span>`
    : '<span class="mp-prof__empty">— no tour-level blowout wins</span>';

  const mar = p.longest
    ? `<span class="mp-prof__lead tnum">${fmtDuration(p.longest.minutes)}</span> longest`
      + `<span class="mp-prof__sub">${profLine(p.longest, true)}</span>`
    : '<span class="mp-prof__empty">— no timed tour matches</span>';

  const tb = p.tb_played > 0
    ? `<span class="mp-prof__lead tnum">${p.tb_rate != null ? (p.tb_rate * 100).toFixed(1) + '%' : '—'}</span> tiebreaks won`
      + `<span class="mp-prof__sub tnum">${p.tb_won} / ${p.tb_played}${p.tb_qualifies ? '' : ' · rate needs 100+ to rank'}</span>`
    : '<span class="mp-prof__empty">— no tour tiebreaks</span>';

  const cb = p.comeback_count > 0
    ? `<span class="mp-prof__lead tnum">${p.comeback_count}</span> from two sets down`
      + `<span class="mp-prof__sub">best: ${profLine(p.best_comeback)}</span>`
    : '<span class="mp-prof__empty">— none from two sets down</span>';

  // factual, non-judgmental match-ending counts (same figures the board ranks)
  const ret = `<span class="mp-prof__sub tnum">Retired from ${p.retired} `
    + `· ${p.wins_by_retirement} wins by opponent retirement</span>`;

  sec.innerHTML = `<p class="eyebrow">Across Match Point</p>`
    + row('Blowouts', 'blowouts', blow)
    + row('Marathons', 'marathons', mar)
    + row('Tiebreaks', 'tiebreaks', tb)
    + row('Comebacks', 'comebacks', cb)
    + row('Retirements', 'retirements', ret);
  return sec;
}

export async function renderPlayer(mount: HTMLElement, id: string): Promise<void> {
  mount.replaceChildren();
  const loading = document.createElement('p');
  loading.className = 'loading';
  loading.textContent = 'Loading…';
  mount.appendChild(loading);

  const [summary, splits, arc, profile] = await Promise.all([
    getPlayerSummary(id),
    getSurfaceSplits(id),
    getCareerArc(id),
    mpPlayerProfile(id),
  ]);

  mount.replaceChildren();

  if (!summary) {
    mount.innerHTML =
      `<p class="muted">No player found for id ${escapeHtml(id)}. <a href="#/">Back to search</a>.</p>`;
    return;
  }

  // identity accent from the player's primary surface
  const accent = surfaceColor(summary.primary_surface ?? 'Unknown');
  mount.style.setProperty('--accent', accent);

  const actions = document.createElement('div');
  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = 'Compare head-to-head →';
  btn.addEventListener('click', () => navigate(`/h2h/${summary.player_id}`));
  actions.appendChild(btn);

  // surface section: the signature radar (identity feel) beside the exact bars
  const surfaceSection = document.createElement('section');
  surfaceSection.className = 'panel surface-section';
  surfaceSection.append(signatureRadar(splits, accent), surfaceSplit(splits));

  mount.append(
    headerCard(summary),
    surfaceSection,
    careerArc(arc, summary.career_high_rank, accent),
    matchPointProfile(profile, summary.player_name),
    actions,
  );
}
