// Shared interaction language. Established here for the rivalry timeline and
// reused by the career arc and player-signature visuals in later passes.
// Durations (ms) and easings are mirrored as CSS custom properties in
// styles.css (--dur-*, --ease-*); keep the two in sync.
export const DUR = { fast: 140, med: 300 } as const;

// Per-item stagger for left-to-right entrance reveals.
export const STAGGER_MS = 16;

// Entrance: decisive ease-out (easeOutQuint-ish). Standard: symmetric for
// hover/state changes.
export const EASE_ENTRANCE = 'cubic-bezier(0.22, 1, 0.36, 1)';
export const EASE_STANDARD = 'cubic-bezier(0.4, 0, 0.2, 1)';

export const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
