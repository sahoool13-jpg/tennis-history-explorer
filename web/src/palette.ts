// surface_palette.json is the SINGLE source of surface colors for the whole app.
// No surface color is hardcoded anywhere else.
let palette: Record<string, string> | null = null;

export async function loadPalette(): Promise<Record<string, string>> {
  if (palette) return palette;
  const res = await fetch(`${import.meta.env.BASE_URL}data/surface_palette.json`);
  if (!res.ok) throw new Error(`Failed to load surface_palette.json (${res.status})`);
  palette = await res.json();
  // Propagate into CSS custom properties so the stylesheet can use surface
  // colours for identity (masthead mark, rules, tints) — JSON stays the one
  // source; nothing hardcodes a surface hex.
  const root = document.documentElement;
  for (const [name, hex] of Object.entries(palette!)) {
    root.style.setProperty(`--surface-${name}`, hex);
  }
  return palette!;
}

export function surfaceColor(surface: string): string {
  if (!palette) throw new Error('Palette not loaded — call loadPalette() first.');
  return palette[surface] ?? palette['Unknown'] ?? '#AEB4BA';
}

export function surfaceNames(): string[] {
  return palette ? Object.keys(palette) : [];
}
