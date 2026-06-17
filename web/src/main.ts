import './styles.css';
import { route, setNotFound, startRouter } from './router';
import { loadPalette } from './palette';
import { initDB } from './db';
import { renderSearch } from './views/search';
import { renderPlayer } from './views/player';
import { renderH2H } from './views/h2h';
import { renderEras } from './views/eras';
import { renderRecords } from './views/records';
import { renderLanding } from './views/landing';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#/" aria-label="Rally — home">
      <span class="brand__word">Rally</span>
      <span class="brand__mark" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="brand__tag">Tennis history, by surface</span>
    </a>
    <nav class="topnav">
      <a href="#/players">Players</a>
      <a href="#/h2h">Head to head</a>
      <a href="#/records">Records</a>
      <a href="#/eras">How the game changed</a>
      <a class="topnav__sib" href="${import.meta.env.BASE_URL}matchpoint.html">Match Point&#8201;&#8599;</a>
    </nav>
  </header>
  <main id="content" class="content"></main>
  <footer class="sitefoot">Data by Jeff Sackmann · ATP singles · CC BY-NC-SA 4.0</footer>
`;
const content = document.querySelector<HTMLElement>('#content')!;

// The root is the family landing — a chromeless almanac with its own masthead.
// Every other route is a Rally section and shows the Rally topbar/footer; the
// `landing-mode` body class toggles that chrome via CSS.
const page = (fn: () => void) => (): void => {
  document.body.classList.remove('landing-mode');
  fn();
};
route(/^\/$/, () => { document.body.classList.add('landing-mode'); void renderLanding(content); });
route(/^\/players$/, page(() => renderSearch(content)));
route(/^\/player\/(\d+)$/, (p) => { document.body.classList.remove('landing-mode'); void renderPlayer(content, p[0]); });
route(/^\/h2h\/(\d+)\/(\d+)$/, (p) => { document.body.classList.remove('landing-mode'); void renderH2H(content, p[0], p[1]); });
route(/^\/h2h\/(\d+)$/, (p) => { document.body.classList.remove('landing-mode'); void renderH2H(content, p[0]); });
route(/^\/h2h$/, page(() => void renderH2H(content)));
route(/^\/eras$/, page(() => void renderEras(content)));
route(/^\/records$/, page(() => void renderRecords(content)));
setNotFound(() => {
  document.body.classList.remove('landing-mode');
  content.innerHTML = `<p class="muted">Page not found. <a href="#/">Back to the front page</a>.</p>`;
});

async function boot(): Promise<void> {
  await loadPalette(); // single source of surface colours, ready before any view
  void initDB(); // warm the DuckDB connection in the background
  startRouter();
}

void boot();
