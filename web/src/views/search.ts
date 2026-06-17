import { searchBox } from '../components/searchBox';
import { navigate } from '../router';

export function renderSearch(mount: HTMLElement): void {
  mount.replaceChildren();
  mount.style.removeProperty('--accent'); // reset any per-player tint

  const home = document.createElement('div');
  home.className = 'home';
  home.innerHTML = `
    <h1 class="home__title">
      A century of tennis on
      <span class="c-hard">hard</span>,
      <span class="c-clay">clay</span> &amp;
      <span class="c-grass">grass</span>.
    </h1>
    <p class="home__lede">ATP singles, 2000 onward. Search a player to read their
      surface identity, career arc, and head-to-heads.</p>
  `;

  const box = searchBox('Search players — try “Federer”', (p) => {
    navigate(`/player/${p.player_id}`);
  });

  const h2h = document.createElement('p');
  h2h.className = 'home__h2h';
  h2h.innerHTML = `<a href="#/h2h">Compare two players →</a>`;

  home.append(box, h2h);
  mount.appendChild(home);
}
