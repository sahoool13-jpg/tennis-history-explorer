// Match Point — the matches-focused companion to Rally. Its own front door and
// wordmark, built on the SAME design language (shared styles.css tokens, fonts,
// motion). Separate entry point (matchpoint.html); it does not touch Rally's
// main.ts. This is the STEP 0 shell: nav + a placeholder hero. Leaderboards land
// after the score-parser gate is approved.
import './styles.css';
import { route, setNotFound, startRouter } from './router';
import { prefersReducedMotion, STAGGER_MS } from './motion';

// Base path differs in dev ('/') vs the GitHub Pages build
// ('/tennis-history-explorer/'); link to Rally's index relative to it.
const RALLY_URL = `${import.meta.env.BASE_URL}`;

// The planned views — declared here so the nav and the "what's coming" board
// stay in sync. Order is the editorial running order, not a ranking. No view is
// built yet; each routes to the same placeholder until the gate is approved.
const SECTIONS = [
  { slug: 'blowouts', label: 'Blowouts', blurb: 'Bagels, breadsticks and the most lopsided scorelines.' },
  { slug: 'epics', label: 'Epics', blurb: 'The longest, the closest — matches that refused to end.' },
  { slug: 'tiebreaks', label: 'Tiebreaks', blurb: 'Sets settled at the brink, and the players who lived there.' },
  { slug: 'comebacks', label: 'Comebacks', blurb: 'Two sets down and back from the dead.' },
  { slug: 'endings', label: 'Endings', blurb: 'Retirements, walkovers and matches left unfinished.' },
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

// --- scoreline typesetting --------------------------------------------------
// The signature device of the whole site: a set is games with the tiebreak
// loser's points set as a superscript, exactly how a results page prints it.
type SetCell = { w: number; l: number; tb?: number };

function scoreline(sets: SetCell[]): string {
  const cell = (s: SetCell) => {
    const tb = s.tb !== undefined ? `<sup class="mp-tb">${s.tb}</sup>` : '';
    return `<span class="mp-set"><b>${s.w}</b><i>${s.l}</i>${tb}</span>`;
  };
  return `<span class="mp-scoreline">${sets.map(cell).join('')}</span>`;
}

// --- placeholder home -------------------------------------------------------
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
        ${scoreline([
          { w: 6, l: 4 }, { w: 3, l: 6 }, { w: 6, l: 7, tb: 7 },
          { w: 7, l: 6, tb: 3 }, { w: 70, l: 68 },
        ])}
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
        The structured score dataset is built and verified. The boards above
        arrive next.
      </p>
    </section>
  `;
  mount.appendChild(wrap);
  revealRows(mount.querySelectorAll<HTMLElement>('.mp-board__row'));
}

// Placeholder for a not-yet-built section. Names the section and points home.
function renderComingSoon(mount: HTMLElement, slug: string): void {
  const sec = SECTIONS.find((s) => s.slug === slug);
  mount.replaceChildren();
  const el = document.createElement('div');
  el.className = 'mp-soon';
  el.innerHTML = `
    <p class="eyebrow">Match Point</p>
    <h1 class="mp-hero__title">${sec ? sec.label : 'Coming soon'}</h1>
    <p class="mp-hero__lede">${sec ? sec.blurb : ''}
      This board isn't built yet — the score dataset behind it is ready and
      verified.</p>
    <p class="mp-note"><a href="#/">Back to Match Point</a></p>
  `;
  mount.appendChild(el);
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
  route(new RegExp(`^/${s.slug}$`), () => renderComingSoon(content, s.slug));
}
setNotFound(() => {
  content.innerHTML = `<p class="muted">Page not found. <a href="#/">Back to Match Point</a>.</p>`;
});

startRouter();
