import { searchPlayers } from '../db';
import type { PlayerSearchRow } from '../types';

// Reusable player search widget: a text input with a live results dropdown.
// onSelect fires with the chosen player. Used by the search view and both
// sides of the H2H picker.
export function searchBox(
  placeholder: string,
  onSelect: (player: PlayerSearchRow) => void,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'searchbox';

  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  input.className = 'searchbox__input';

  const results = document.createElement('ul');
  results.className = 'searchbox__results';

  let token = 0;
  let debounce: number | undefined;

  const run = async () => {
    const term = input.value;
    const mine = ++token;
    if (!term.trim()) {
      results.replaceChildren();
      return;
    }
    const rows = await searchPlayers(term);
    if (mine !== token) return; // a newer keystroke won
    results.replaceChildren();
    for (const r of rows) {
      const li = document.createElement('li');
      li.className = 'searchbox__item';
      li.tabIndex = 0;
      const ioc = r.ioc ? ` · ${r.ioc}` : '';
      li.innerHTML =
        `<span class="searchbox__name">${escapeHtml(r.player_name)}</span>` +
        `<span class="searchbox__meta">${escapeHtml(ioc)} · ${r.total_matches} matches</span>`;
      const choose = () => {
        onSelect(r);
        input.value = r.player_name;
        results.replaceChildren();
      };
      li.addEventListener('click', choose);
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') choose();
      });
      results.appendChild(li);
    }
  };

  input.addEventListener('input', () => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(run, 120);
  });

  wrap.append(input, results);
  return wrap;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!),
  );
}
