// Minimal hash-based client router. Hash routing keeps shareable URLs working
// on GitHub Pages with no server rewrite/404 config. Player & H2H state lives
// in the hash so links are shareable.
type Handler = (params: string[]) => void;

const routes: Array<{ re: RegExp; handler: Handler }> = [];
let notFound: Handler = () => {};

export function route(re: RegExp, handler: Handler): void {
  routes.push({ re, handler });
}

export function setNotFound(handler: Handler): void {
  notFound = handler;
}

export function path(): string {
  return location.hash.replace(/^#/, '') || '/';
}

export function navigate(to: string): void {
  const target = to.startsWith('#') ? to : `#${to}`;
  if (location.hash === target) render();
  else location.hash = target;
}

function render(): void {
  const p = path();
  for (const { re, handler } of routes) {
    const m = p.match(re);
    if (m) {
      handler(m.slice(1));
      return;
    }
  }
  notFound([p]);
}

export function startRouter(): void {
  window.addEventListener('hashchange', render);
  render();
}
