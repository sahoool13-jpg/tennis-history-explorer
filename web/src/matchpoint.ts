// Match Point — the matches-focused companion to Rally. Its own front door and
// wordmark, built on the SAME design language (shared styles.css tokens, fonts,
// motion). Separate entry point (matchpoint.html); it does not touch Rally's
// main.ts. This is the STEP 0 shell: nav + a placeholder hero. Leaderboards land
// after the score-parser gate is approved.
import './styles.css';
import { route, setNotFound, startRouter } from './router';
import { prefersReducedMotion, STAGGER_MS } from './motion';
import {
  renderBlowouts, renderMarathons, renderTiebreaks, renderComebacks,
  renderRetirements,
} from './mpviews';
import { scoreline } from './mpkit';

// Base path differs in dev ('/') vs the GitHub Pages build
// ('/tennis-history-explorer/'); link to Rally's index relative to it.
const RALLY_URL = `${import.meta.env.BASE_URL}`;

// The views — declared once so the nav and the home board stay in sync. Order
// is the editorial running order, not a ranking.
const SECTIONS = [
  { slug: 'blowouts', label: 'Blowouts', blurb: 'The most lopsided scorelines, and the players who hand out shutouts.', render: renderBlowouts },
  { slug: 'marathons', label: 'Marathons', blurb: 'The longest matches by playing time, and how match length is distributed.', render: renderMarathons },
  { slug: 'tiebreaks', label: 'Tiebreaks', blurb: 'Who lives in the tiebreak, and who wins it.', render: renderTiebreaks },
  { slug: 'comebacks', label: 'Comebacks', blurb: 'Best-of-five matches won from two sets down.', render: renderComebacks },
  { slug: 'retirements', label: 'Retirements', blurb: 'Matches that ended early — kept out of the completed-match boards.', render: renderRetirements },
] as const;

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="topbar mp-topbar">
    <a class="brand mp-brand" href="#/" aria-label="Match Point — home">
      <span class="mp-word"><span>Match</span><span class="mp-word__pt">Point</span></span>
      <span class="mp-mark" aria-hidden="true">
        <i>6</i><i>4</i><b></b><i>3</i><i>6</i><b></b><i>7</i><i class="mp-mark__pt">6</i>
      </span>
      <span class="brand__tag">Tennis, by the scoreline</span>
    </a>
    <nav class="topnav mp-topnav" aria-label="Match Point sections">
      ${SECTIONS.map((s) => `<a href="#/${s.slug}">${s.label}</a>`).join('')}
      <a class="mp-crosslink" href="${RALLY_URL}">Rally&#8201;&#8599;</a>
    </nav>
  </header>
  <main id="content" class="content"></main>
  <footer class="sitefoot">
    Data by Jeff Sackmann · ATP singles · CC BY-NC-SA 4.0 ·
    <a class="mp-foot-link" href="${RALLY_URL}">Rally — tennis history, by surface &#8599;</a>
  </footer>
`;
const content = document.querySelector<HTMLElement>('#content')!;

// --- home -------------------------------------------------------------------
function renderHome(mount: HTMLElement): void {
  mount.replaceChildren();
  const wrap = document.createElement('div');
  wrap.className = 'mp-home';
  // Isner–Mahut, Wimbledon 2010 — the longest match ever played. A real
  // scoreline as the hero: it is exactly what this site is about.
  wrap.innerHTML = `
    <section class="mp-hero">
      <p class="eyebrow">The matches, by the score · companion to Rally</p>
      <h1 class="mp-hero__title">Every match is a<br /><em>number</em> first.</h1>
      <p class="mp-hero__lede">
        Rally reads tennis by <a href="${RALLY_URL}">surface and player</a>.
        Match Point reads it by the scoreline — the blowouts, the epics, the
        tiebreaks, the comebacks and the matches that never finished.
      </p>

      <figure class="mp-figure">
        ${scoreline('6-4 3-6 6-7(7) 7-6(3) 70-68')}
        <figcaption class="mp-figure__cap">
          Isner d. Mahut · Wimbledon 2010 · 11 hours, 5 minutes — the longest
          match ever played.
        </figcaption>
      </figure>
    </section>

    <section class="mp-coming">
      <p class="eyebrow">What's coming</p>
      <ul class="mp-board">
        ${SECTIONS.map((s) => `
          <li class="mp-board__row">
            <a class="mp-board__label" href="#/${s.slug}">${s.label}</a>
            <span class="mp-board__blurb">${s.blurb}</span>
          </li>`).join('')}
      </ul>
      <p class="mp-note">
        Built from the verified score dataset — completed matches, retirements
        and walkovers each counted honestly, never mixed.
      </p>
    </section>
  `;
  mount.appendChild(wrap);
  revealRows(mount.querySelectorAll<HTMLElement>('.mp-board__row'));
}

function revealRows(rows: NodeListOf<HTMLElement>): void {
  if (prefersReducedMotion()) {
    rows.forEach((r) => r.classList.add('in'));
    return;
  }
  rows.forEach((r, i) => {
    setTimeout(() => r.classList.add('in'), i * STAGGER_MS * 2);
  });
}

// --- routes -----------------------------------------------------------------
route(/^\/$/, () => renderHome(content));
for (const s of SECTIONS) {
  route(new RegExp(`^/${s.slug}$`), () => void s.render(content));
}
setNotFound(() => {
  content.innerHTML = `<p class="muted">Page not found. <a href="#/">Back to Match Point</a>.</p>`;
});

startRouter();
