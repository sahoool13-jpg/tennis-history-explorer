import './styles.css';
import { route, setNotFound, startRouter } from './router';
import { loadPalette } from './palette';
import { initDB } from './db';
import { renderSearch } from './views/search';
import { renderPlayer } from './views/player';
import { renderH2H } from './views/h2h';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#/" aria-label="Tennis History Explorer — home">
      <span class="brand__word">Tennis History Explorer</span>
      <span class="brand__mark" aria-hidden="true"><i></i><i></i><i></i></span>
    </a>
  </header>
  <main id="content" class="content"></main>
  <footer class="sitefoot">Data by Jeff Sackmann · ATP singles · CC BY-NC-SA 4.0</footer>
`;
const content = document.querySelector<HTMLElement>('#content')!;

route(/^\/$/, () => renderSearch(content));
route(/^\/player\/(\d+)$/, (p) => void renderPlayer(content, p[0]));
route(/^\/h2h\/(\d+)\/(\d+)$/, (p) => void renderH2H(content, p[0], p[1]));
route(/^\/h2h\/(\d+)$/, (p) => void renderH2H(content, p[0]));
route(/^\/h2h$/, () => void renderH2H(content));
setNotFound(() => {
  content.innerHTML = `<p class="muted">Page not found. <a href="#/">Back to search</a>.</p>`;
});

async function boot(): Promise<void> {
  await loadPalette(); // single source of surface colours, ready before any view
  void initDB(); // warm the DuckDB connection in the background
  startRouter();
}

void boot();
