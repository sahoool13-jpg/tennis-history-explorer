// The honesty + identity page. What this is, the surface thesis, exactly what
// the data covers and — just as plainly — what it does not. Every coverage and
// limitation claim below was checked against the shipped parquet data:
//   79,299 matches · 2000–2026 · Tour 71,868 / Davis Cup 7,367 / Olympics 64
//   levels G 13,335 · M 15,208 · F 467 · A(250/500) 42,858
//   minutes recorded for 88.9% of matches · surfaces Hard/Clay/Grass/Carpet
// Content + presentation only — no data is read or recomputed here.

const SURFACES: Array<{ name: string; gloss: string }> = [
  { name: 'Hard', gloss: 'the neutral default — the surface that flatters no one in particular' },
  { name: 'Clay', gloss: 'slow, high-bouncing, a test of patience and topspin' },
  { name: 'Grass', gloss: 'low and fast, kindest to the server and the brave' },
  { name: 'Carpet', gloss: 'indoor, quick, and gone — phased out of the tour after 2009' },
];

function rule(): string {
  return '<hr class="section-rule" />';
}

export function renderAbout(mount: HTMLElement): void {
  mount.replaceChildren();
  const el = document.createElement('article');
  el.className = 'about';

  const swatches = SURFACES.map((s) => `
    <li class="about-surface">
      <span class="swatch" style="--c: var(--surface-${s.name})" aria-hidden="true"></span>
      <span class="about-surface__name">${s.name}</span>
      <span class="about-surface__gloss faint">${s.gloss}</span>
    </li>`).join('');

  el.innerHTML = `
    <header class="about-head">
      <p class="eyebrow">About</p>
      <h1 class="about-title">Unforced Error</h1>
      <p class="about-lede">A quarter-century of men's professional tennis, read two
        ways — and an honest account of what that data can and cannot tell you.</p>
    </header>

    ${rule()}

    <section class="about-sec">
      <h2 class="about-h2">What this is</h2>
      <p>Unforced Error is two views onto the same record of the modern men's tour.
        <strong>Rally</strong> reads the game by <em>player and surface</em>: who a
        player was, where they were dangerous, and how their rivalries actually went.
        <strong>Match Point</strong> reads it by <em>the scoreline</em>: the blowouts,
        the marathons, the tiebreaks, the comebacks, and the matches that never
        finished.</p>
      <p>It is built on one open dataset and runs entirely in your browser. There is
        no server deciding what you see, no model guessing at history — every number
        on these pages is computed directly from the match record described below.</p>
    </section>

    ${rule()}

    <section class="about-sec">
      <h2 class="about-h2">The thesis: surface is identity</h2>
      <p>Tennis is the only major sport that changes its playing field from week to
        week, and those surfaces are not cosmetic — they reward different games. A
        career can look ordinary in aggregate and extraordinary on the dirt. So this
        site refuses to flatten the surfaces into a single average. Colour carries
        that argument throughout:</p>
      <ul class="about-surfaces">${swatches}</ul>
      <p class="faint">When you see a player rendered in one of these colours, that is
        the surface where they did their best work — the site's small, constant
        reminder that <em>where</em> a match was played is part of what it meant.</p>
    </section>

    ${rule()}

    <section class="about-sec">
      <h2 class="about-h2">What the data covers</h2>
      <ul class="about-list">
        <li><strong>Men's tour-level singles, 2000 to the present.</strong> 79,299
          matches across 26 seasons. No doubles, no qualifying, no Challenger or
          ITF-level play, no women's tour — those are different stories and this data
          doesn't tell them.</li>
        <li><strong>The events that decide the season.</strong> Grand Slams (13,335
          matches), Masters 1000s (15,208), the year-end Tour Finals (467), and the
          ATP 250/500 tour (42,858). Davis Cup (7,367) and the Olympics (64) are in
          the data too, but switched off by default — see below.</li>
        <li><strong>Four surfaces.</strong> Hard, clay, grass and the now-retired
          indoor carpet, plus a handful of matches where the surface wasn't recorded.</li>
        <li><strong>Result, context and, where available, detail.</strong> Each match
          carries its full scoreline, round, tournament, surface, both players' rankings
          at the time, and — for most matches — the duration in minutes.</li>
      </ul>
    </section>

    ${rule()}

    <section class="about-sec">
      <h2 class="about-h2">What it doesn't do</h2>
      <p>The limitations are part of the product. Knowing where the data is thin is
        what lets you trust it where it's solid.</p>
      <ul class="about-list about-list--caveats">
        <li><strong>Dates follow the tournament, not the match.</strong> Each match is
          dated to the day its tournament <em>began</em>. So "on this day" surfaces the
          right event, but a final played in the second week sits under its first-Monday
          date — Wimbledon 2008 lives on June 23rd, not the July Sunday it was won.</li>
        <li><strong>Minutes are incomplete.</strong> Duration is recorded for about
          89% of matches; the rest have no time at all. Anywhere match length matters —
          the marathons board, "longest match" in a rivalry — we count only timed
          matches, show the coverage, and discard times that are physically implausible
          rather than pretend they're real.</li>
        <li><strong>Rankings are as they stood that week.</strong> When we call a win an
          upset, we mean the loser's ranking <em>at the time of the match</em> — not a
          later, more famous version of them.</li>
        <li><strong>Tour-level is the default; the rest is a choice.</strong> Boards
          and records show tour matches by default. Davis Cup and Olympic results exist
          in the data and can be included, but they're held back unless you ask — their
          formats and stakes don't compare cleanly to a normal tour week.</li>
        <li><strong>A deciding-set tie-break is credited as a set.</strong> Match
          tie-breaks (the first-to-ten that settles a final set) are read as the set
          they decide and credited to the match winner — the same convention the
          scorelines themselves use.</li>
        <li><strong>A few scorelines defeat the parser.</strong> Out of 79,299 matches,
          roughly seven have scorelines too irregular to parse cleanly (well under
          0.01%). They're set aside rather than guessed at, and they never enter a
          leaderboard.</li>
      </ul>
    </section>

    ${rule()}

    <section class="about-sec">
      <h2 class="about-h2">How it's built</h2>
      <p>The source data is processed once into a handful of columnar files. The site
        loads them directly into your browser and queries them there — there is no
        backend. Every figure is reconciled against the raw match record before it
        ships: if the totals don't agree, the build stops. The charts are hand-drawn
        SVG, sized to the data rather than to a charting library's defaults.</p>
    </section>

    ${rule()}

    <section class="about-sec about-credit">
      <h2 class="about-h2">Credit & licence</h2>
      <p>All match data comes from <a href="https://github.com/JeffSackmann/tennis_atp"
        rel="noopener" target="_blank">Jeff Sackmann's <code>tennis_atp</code></a>
        dataset, an extraordinary open record of the professional game that this site
        would not exist without.</p>
      <p>That data is used under
        <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" rel="noopener"
        target="_blank">Creative Commons BY-NC-SA 4.0</a>: attributed to its author,
        <strong>non-commercial</strong> (no ads, no monetization), and shared under the
        same licence — including the processed data and everything derived from it.
        Unforced Error is an independent, non-commercial project and is not affiliated
        with the ATP or with Jeff Sackmann.</p>
      <p>The application code, visual design, and puzzle are <strong>© 2026 Hysplex</strong>,
        all rights reserved — separate from, and not covered by, the data licence above.</p>
    </section>

    <footer class="sitefoot about-foot">Data by Jeff Sackmann · ATP singles · CC BY-NC-SA 4.0</footer>
  `;

  mount.appendChild(el);
  mount.scrollTo?.({ top: 0 });
}
