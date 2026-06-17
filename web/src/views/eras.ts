import { getEraStats } from '../db';
import {
  surfaceMixChart, concentrationChart, matchLengthChart, volumeChart,
} from '../components/eraCharts';

export async function renderEras(mount: HTMLElement): Promise<void> {
  mount.replaceChildren();
  mount.style.removeProperty('--accent');

  const head = document.createElement('header');
  head.className = 'era-header';
  head.innerHTML = `
    <p class="era-scope">ATP · tour-level singles · 2000–present</p>
    <h1 class="era-title">How the game changed</h1>
    <p class="era-standfirst">Four readings of how the <strong>men's professional tour</strong>
      has shifted since 2000. These are findings about the ATP tour over this period — not about
      tennis as a whole, and not about the women's game. Each chart traces only to recorded
      match data; where coverage is thin, the chart says so.</p>
  `;
  mount.appendChild(head);

  const loading = document.createElement('p');
  loading.className = 'loading';
  loading.textContent = 'Loading…';
  mount.appendChild(loading);

  const rows = await getEraStats();
  loading.remove();

  if (rows.length === 0) {
    mount.insertAdjacentHTML('beforeend', `<p class="muted">No era data available.</p>`);
    return;
  }

  mount.append(
    surfaceMixChart(rows),
    concentrationChart(rows),
    matchLengthChart(rows),
    volumeChart(rows),
  );
}
