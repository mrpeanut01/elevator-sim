/**
 * **Everyday Mode's design tokens** — GAMEPLAY § 19, transcribed once.
 *
 * The § 19 block is the cited source for every value here:
 *
 * ```
 * Paper           #F7F2E8   page, cards
 * Paper deep      #EDE4D5 · #E4D8C4   gradients, wells
 * Card            #FBF7EF     Card sunk   #F5EFE3 · #F2EADB
 * Ink             #23201C   text, dark rail, primary buttons
 * Ink soft        #4C463D   body copy
 * Warm grey       #6E665A   secondary     #8D8271 labels     #A79B87 · #C6B79F faint
 * Rule            #D6C9B4 · #E2D6C1 · #DDD1BE
 * Sun             #F2A63B   primary accent, doors, active nav
 * Terracotta      #B8462B   your line, live figures     #D4573A alarm, missed, gave up
 * Moss            #4F8A5B   cleared, good     Sky #4E9DD8   windows
 * Amber wash      #FDF3E2   incident cards, today     Amber edge #E0B98A
 *
 * Type   Familjen Grotesk 600/700  headings, big numbers in prose
 *        Instrument Sans 400/500/600  body, labels, buttons
 *        DM Mono 500  every figure, eyebrow, timestamp, code line
 *
 * Eyebrow  10–10.5px, letter-spacing .12–.16em, uppercase, #8D8271
 * Body     13–14.5px / 1.5     Lede 16.5–19px / 1.55, text-wrap: pretty
 * Radius   5 · 8 · 9 · 10 · 12 · 14 (cards) · 20 (pills)
 * Gap      wide 26 · 16–18 · 12–14 · 7–9 · 5–6
 * ```
 *
 * ## The export shape, for the two shells that read it
 *
 * Named frozen objects, one per § 19 line group, values as plain strings and numbers. No helper
 * functions and no CSS assembly: the consumers build inline styles (the handoff's own rule —
 * *"Inline styles throughout, no stylesheet"*), and a token module that composed CSS would be a
 * second opinion about layout. `everyday/shell.ts` is the first consumer; the Engineer restyle
 * imports the same names, so a value changed here changes both shells or neither.
 *
 * Two deliberate departures from a verbatim § 19, both stated:
 *
 * - **§ 19's shaft tints are not here yet.** They are canvas colours for the building drawing,
 *   and no code in this frame draws a shaft; a constant exported ahead of its consumer is the
 *   dead-seam shape this repository keeps paying for, so the lane that draws shafts adds the
 *   eight tints beside its caller.
 * - **Two dark-rail values come from the prototype rather than the § 19 block** — the rail's
 *   sunk card `#2E2A24` and the rail's border `#4A443A` (`elevator-sim-casual.dc.html`, the
 *   `PLAYING AS` card and the Settings row). § 19 names the rail's ground (`Ink`) but not its
 *   raised surfaces; the prototype is canonical for what the screen looks like, so its two
 *   literals are carried under {@link EVERYDAY_RAIL_SURFACES} with this note rather than
 *   invented shades of ink.
 */

/** § 19's palette. Keys follow the block's own names; comments carry its usage notes. */
export const EVERYDAY_COLORS = Object.freeze({
  /** page, cards */
  paper: '#F7F2E8',
  /** gradients, wells */
  paperDeep: '#EDE4D5',
  paperDeeper: '#E4D8C4',
  card: '#FBF7EF',
  cardSunk: '#F5EFE3',
  cardSunkDeep: '#F2EADB',
  /** text, dark rail, primary buttons */
  ink: '#23201C',
  /** body copy */
  inkSoft: '#4C463D',
  /** secondary */
  warmGrey: '#6E665A',
  /** labels */
  label: '#8D8271',
  /** faint */
  faint: '#A79B87',
  fainter: '#C6B79F',
  rule: '#D6C9B4',
  ruleLight: '#E2D6C1',
  ruleMid: '#DDD1BE',
  /** primary accent, doors, active nav */
  sun: '#F2A63B',
  /** your line, live figures */
  terracotta: '#B8462B',
  /** alarm, missed, gave up */
  alarm: '#D4573A',
  /** cleared, good */
  moss: '#4F8A5B',
  /** windows */
  sky: '#4E9DD8',
  /** incident cards, today */
  amberWash: '#FDF3E2',
  amberEdge: '#E0B98A',
} as const);

/**
 * The dark rail's two raised-surface values — prototype-sourced, not in § 19's block.
 *
 * See the module docstring for why these two are the only tokens whose citation is the prototype
 * markup rather than the § 19 text.
 */
export const EVERYDAY_RAIL_SURFACES = Object.freeze({
  /** the `PLAYING AS` card's ground */
  card: '#2E2A24',
  /** bordered rows and the Engineer swap */
  edge: '#4A443A',
} as const);

/** § 19's type stack, as `font-family` values. Weights stay at the call site, per the block. */
export const EVERYDAY_TYPE = Object.freeze({
  /** Familjen Grotesk 600/700 — headings, big numbers in prose */
  heading: "'Familjen Grotesk', sans-serif",
  /** Instrument Sans 400/500/600 — body, labels, buttons */
  body: "'Instrument Sans', sans-serif",
  /** DM Mono 500 — every figure, eyebrow, timestamp, code line */
  mono: "'DM Mono', ui-monospace, monospace",
} as const);

/** § 19's radius scale, in px. `card` is the block's own annotation; `pill` likewise. */
export const EVERYDAY_RADII = Object.freeze({
  tight: 5,
  control: 8,
  row: 9,
  well: 10,
  tile: 12,
  /** cards */
  card: 14,
  /** pills */
  pill: 20,
} as const);

/**
 * § 19's gap scale, in px. The block gives four of the five as ranges (`16–18`, `12–14`, `7–9`,
 * `5–6`); these are the midpoints, rounded down, so that a consumer reads one number and the
 * range stays in the citation above rather than in every call site.
 */
export const EVERYDAY_GAPS = Object.freeze({
  wide: 26,
  section: 17,
  block: 13,
  row: 8,
  tight: 5,
} as const);
