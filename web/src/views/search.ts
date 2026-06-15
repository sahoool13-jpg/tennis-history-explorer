import { searchBox } from '../components/searchBox';
import { navigate } from '../router';

export function renderSearch(mount: HTMLElement): void {
  mount.replaceChildren();

  const intro = document.createElement('div');
  intro.className = 'home-intro';
  intro.innerHTML =
    `<h1 class="home-title">Tennis History Explorer</h1>` +
    `<p class="muted">ATP singles, 2000 onward. Search a player to see their ` +
    `surface identity, career arc, and head-to-heads.</p>`;

  const box = searchBox('Search players — try “Federer”', (p) => {
    navigate(`/player/${p.player_id}`);
  });

  const h2hLink = document.createElement('p');
  h2hLink.className = 'home-h2h';
  h2hLink.innerHTML = `<a href="#/h2h">Compare two players →</a>`;

  mount.append(intro, box, h2hLink);
}
