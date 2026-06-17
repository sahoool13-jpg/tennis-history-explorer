// Reusable editorial tooltip — a single floating card, positioned over an
// anchor element. Styled in styles.css (.tooltip). This is the shared tooltip
// for all interactive visuals (timeline now; career arc / signatures later).
let el: HTMLDivElement | null = null;

function ensure(): HTMLDivElement {
  if (!el) {
    el = document.createElement('div');
    el.className = 'tooltip';
    el.setAttribute('role', 'tooltip');
    document.body.appendChild(el);
  }
  return el;
}

// Show `html` centered above `anchor`; flips below if it would clip the top,
// and clamps horizontally to the viewport.
export function showTooltip(html: string, anchor: DOMRect): void {
  const t = ensure();
  t.innerHTML = html;
  t.classList.add('is-visible');

  const tw = t.offsetWidth;
  const th = t.offsetHeight;
  const gap = 12;

  let left = anchor.left + anchor.width / 2 - tw / 2;
  let top = anchor.top - th - gap;
  const below = top < 8;
  if (below) top = anchor.bottom + gap;

  left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
  t.style.left = `${Math.round(left)}px`;
  t.style.top = `${Math.round(top)}px`;
  t.classList.toggle('tooltip--below', below);
}

export function hideTooltip(): void {
  if (el) el.classList.remove('is-visible');
}
