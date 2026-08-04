/**
 * The palette a player's `theme` setting resolves to — `docs/16-change-scope-contract.md` S2, and
 * the second half of § 5 clause 4.
 *
 * ## Why this file exists at all
 *
 * `menu/types.ts` declares four `Settings` and promises, in prose, that they are **presentation
 * only**: they may change how a run is drawn and never what it computes, *"because the leaderboard
 * verifies a submission by replaying its seed, and a setting that altered the simulation would make
 * two players' scores incomparable while both looked valid."* `scope/scope.test.ts` now makes that
 * promise falsifiable, and it does so in **two** halves — the legs must be byte-identical *and* a
 * declared sink must observably move — because identical legs alone cannot tell *"this cannot
 * change a run"* from *"this does nothing at all"*.
 *
 * `theme` was the second thing. It was carried in `scope/probes.test-helper.ts`'s `SINK_MISSING`
 * register with the reason *"no theme switch exists anywhere in the package; the stylesheet has one
 * palette, so this is the one of the four whose sink would have to be **built** rather than merely
 * connected."* This is that build.
 *
 * ## Its caller, stated the way § D192 taught this repository to state it
 *
 * **The intended non-test caller is `dev/main.ts`, and at the time of writing the wiring has not
 * landed** — the shell mounts this in the same wave, in a lane this file's author does not own.
 * Until it does, every export here is an unwired export and `deadCode.test.ts` is *right* to say
 * so. Wave 12's audit found two docstrings naming callers that do not call (§ D192); this sentence
 * exists so this file is not the third. When the wiring lands, delete the qualifier and not the
 * sentence.
 *
 * ## Why it returns tokens instead of applying them
 *
 * `src/boundaries.test.ts` rule 3 confines the DOM to `src/dev/`, which is what makes this whole
 * package testable under plain Node with no jsdom. So this module answers *what the palette is*
 * and `dev/main.ts` does the writing — the same split `render/runSummary.ts`, `render/canvas.ts`
 * and `dev/motion.ts` already use. {@link ResolvedTheme.tokens} is a record of CSS custom-property
 * name → value, exactly the shape `element.style.setProperty` takes one pair at a time.
 *
 * ## Why `'system'` takes a probe
 *
 * `dev/motion.ts` reads `(prefers-reduced-motion: reduce)` through an injected `matchMedia` rather
 * than off `window`, *"because a row this project calls non-negotiable should be assertable without
 * an operating system that has the setting turned on."* The same argument applies here word for
 * word, so the same shape is used: {@link themeFor} takes a {@link ColorSchemeProbe} and the query
 * string has one home, below. A reader who leaves `theme` on `'system'` gets whatever their
 * operating system says, and a test can drive both branches without one.
 *
 * ## What is authored here, and what is quoted
 *
 * The **dark** palette is the shipped one. It is not re-typed: the seventeen tokens that
 * `render/tokens.ts` already names are imported from it, because that file is this repository's
 * one palette source (§ 2.2 of the handoff: *"three copies of a palette is the same defect class
 * this repository has closed ten times"*), and the ten that only `index.html` declares are quoted
 * as literals. `theme.test.ts` derives the token **names** from `index.html`'s `:root` block and
 * asserts them against this module **in both directions**, so a token added to the stylesheet with
 * no palette entry is red, and a palette entry naming a property the stylesheet dropped is red
 * too. § D213: a hand-maintained list stops tracking the thing it was built from, and this
 * repository has been caught by that five times.
 *
 * The **light** palette is authored here and is new. Two things must be said about it plainly:
 *
 * 1. **It has never been driven in a browser.** This repository has none — `docs/05-roadmap.md`:
 *    *"no Playwright, no Puppeteer, no jsdom"* — so under `docs/16` S9's evidence tiers
 *    (`static sweep < model walk < document recorder < browser`) nothing here earns better than a
 *    model walk, and no claim that it *looks* right may be made anywhere. What is checked is
 *    arithmetic: every token differs from its dark counterpart, and every token that carries
 *    content clears a contrast floor against the surface it is drawn on.
 * 2. **It does not repaint the stage.** `render/canvas.ts`'s `DEFAULT_THEME` is derived from
 *    `render/tokens.ts`, which is the dark palette and only the dark palette, and this module has
 *    no way to reach it without becoming the canvas's palette source as well. So a player on
 *    `'light'` gets a light shell around a dark stage until that seam is built. Named here rather
 *    than discovered later, on the footing `docs/16` S9 requires: a partial mechanism that says so
 *    is evidence; one that does not is a claim.
 */

import {
  ACCENT,
  BAND_ABANDONED,
  BAND_LONG,
  BAND_SETTLING,
  BAND_WAITING,
  CARD,
  CARD_RAISED,
  EDGE,
  FLOOR_LABEL,
  FLOOR_LABEL_ENTRANCE,
  FLOOR_LABEL_RESTRICTED,
  FLOOR_LABEL_TRANSFER,
  PAGE,
  RAIL,
  TEXT,
  TEXT_DIM,
  TEXT_MUTED,
} from './tokens.js';

/* -------------------------------------------------------------------------- *
 * The shape
 * -------------------------------------------------------------------------- */

/**
 * What the player chose. Structurally identical to `menu/types.ts`'s `Settings['theme']`, and
 * declared here rather than imported so that `render/` — which has no other reason to know the
 * menu exists — does not gain a dependency on it. The two are checked against each other by
 * assignment at the call site in `dev/main.ts`; a third value added to one and not the other is a
 * compile error there.
 */
export type ThemeChoice = 'system' | 'dark' | 'light';

/** What it resolved to. `'system'` is a *choice*, never an answer. */
export type ThemeName = 'dark' | 'light';

/**
 * The shape of `window.matchMedia`, narrowed to what is actually read — `dev/motion.ts`'s
 * `MediaQueryProbe`, restated rather than imported for the reason {@link ThemeChoice} gives.
 */
export type ColorSchemeProbe = (query: string) => { readonly matches: boolean };

/** One resolved theme: what to apply, and what it was resolved from. */
export interface ResolvedTheme {
  /** What the player asked for. Carried so a surface can say *"System (dark)"* honestly. */
  readonly choice: ThemeChoice;
  /** What that resolved to, after the probe. */
  readonly name: ThemeName;
  /**
   * The value for the `color-scheme` property, which `index.html` currently hard-codes to `dark`
   * on `:root`.
   *
   * It is **not** decoration and it is not derivable by the shell from the tokens: `color-scheme`
   * is what tells the browser to draw its *own* surfaces — form controls, the scrollbar's default
   * rendering, the canvas of a `<select>` popup — in the matching mode. A light palette applied
   * without it produces light cards with dark native widgets, which is the one failure mode of
   * this feature that no amount of token-checking would catch.
   */
  readonly colorScheme: ThemeName;
  /**
   * CSS custom property name → value, including the leading `--`.
   *
   * Every entry is a colour. The stylesheet's type and geometry tokens (`--sans`, `--r-card`,
   * `--rail-left`, …) are theme-independent and are deliberately absent rather than echoed: a
   * theme that restated them would be a second place `--rail-left` has to change.
   */
  readonly tokens: Readonly<Record<string, string>>;
}

/* -------------------------------------------------------------------------- *
 * The query
 * -------------------------------------------------------------------------- */

/**
 * The one spelling of the query, module-private on purpose.
 *
 * `dev/motion.ts` exports its equivalent; this one is not exported because no caller needs it —
 * {@link themeFor} takes the probe and asks the question itself, so the shell passes
 * `window.matchMedia` and nothing else. `theme.test.ts` asserts the exact string by capturing what
 * the probe is *asked*, which is a stronger check than comparing an exported constant against
 * itself.
 *
 * One query, not two. `(prefers-color-scheme: light)` is not consulted: a browser that has no
 * preference reports neither, and treating *"no preference"* as anything but the light default is
 * how a reader who has expressed nothing ends up with the theme somebody guessed for them.
 */
const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

/* -------------------------------------------------------------------------- *
 * The palettes
 * -------------------------------------------------------------------------- */

/**
 * The shipped palette — `index.html`'s `:root`, § 1.1 S6/S7 of the handoff.
 *
 * Seventeen values come from `render/tokens.ts`, which is the palette's one source. The ten
 * literals below exist only in the stylesheet today; `theme.test.ts` pins every one of the
 * twenty-seven to `index.html` in both directions, so this object cannot drift away from the
 * stylesheet in silence — which is the whole failure `dev/tokens.test.ts` was written for one
 * layer down.
 */
const DARK_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  '--bg': PAGE,
  '--rail': RAIL,
  '--panel': CARD,
  '--card': CARD_RAISED,
  '--raised': '#16212f',
  '--edge': EDGE,
  '--edge-mid': '#26303d',
  '--edge-strong': '#2f3a49',
  '--hairline': '#1a212c',
  '--hint-underline': '#3f4b5c',
  '--text': TEXT,
  '--dim': TEXT_MUTED,
  '--dimmer': TEXT_DIM,
  '--faint': FLOOR_LABEL,
  '--fainter': '#3d4956',
  '--accent': ACCENT,
  '--accent-soft': '#7fb6f0',
  '--accent-ink': '#08131f',
  '--band-0': BAND_SETTLING,
  '--band-1': BAND_WAITING,
  '--band-2': BAND_LONG,
  '--band-3': BAND_ABANDONED,
  '--over': '#e0563a',
  '--transfer': FLOOR_LABEL_TRANSFER,
  '--entrance': FLOOR_LABEL_ENTRANCE,
  '--secure': FLOOR_LABEL_RESTRICTED,
  '--measured': '#9fc48a',
});

/**
 * The light palette — **authored here, and never seen in a browser.**
 *
 * Built by mirroring the dark palette's own structure rather than by inverting its numbers, which
 * is a different and worse thing: a channel-inverted `#0b0e14` is a lilac, and an inverted amber is
 * a blue that would make `--band-1` disagree with every other surface's amber.
 *
 * The three ladders the dark palette declares are each kept monotone, in the direction that reads
 * as *elevation* in the mode concerned:
 *
 * - **Surfaces** run ground → raised, so they *lighten* in both palettes. In dark that is
 *   `#0b0e14 → #16212f`; in light it is a grey ground rising to white, which is the light-mode
 *   convention and not a mirror of the dark one. A "raised" plate that was darker than its card
 *   would read as a hole.
 * - **Lines** run faint → strong, so they move *away* from the surface in both: lighter than the
 *   card in dark, darker than it in light.
 * - **Ink** runs `--text` → `--fainter`, losing contrast at each step. `--dim` is deliberately the
 *   *higher*-contrast secondary and `--dimmer` the lower one, which is the order the dark palette
 *   already uses and the opposite of what the two names suggest.
 *
 * The coloured tokens keep their hue and take a darker, more saturated value, because the same hue
 * at the same lightness that reads on `#10151e` does not read on `#f5f7fa`. `theme.test.ts` checks
 * the arithmetic that follows from that — a contrast floor per token against the surface it is
 * drawn on, and no token equal to its dark counterpart — and checks nothing about how it looks,
 * because nothing here can.
 */
const LIGHT_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  // Surfaces: a grey ground rising to white.
  '--bg': '#e7ebf2',
  '--rail': '#eef1f6',
  '--panel': '#f5f7fa',
  '--card': '#fbfcfe',
  '--raised': '#ffffff',
  // Lines: darker than the surface, strengthening.
  '--hairline': '#e0e5ee',
  '--edge': '#ccd4e0',
  '--edge-mid': '#bac4d3',
  '--edge-strong': '#9aa7b9',
  '--hint-underline': '#8593a7',
  // Ink: darkest first, losing contrast.
  '--text': '#101720',
  '--dim': '#4a5666',
  '--dimmer': '#64707f',
  '--faint': '#7e8998',
  '--fainter': '#99a3b0',
  // Accent. `--accent-soft` is the link colour, so in light it is *darker* than the accent and in
  // dark it is lighter — in both cases the direction that separates it from the page.
  '--accent': '#1c6fc4',
  '--accent-soft': '#15528f',
  // Text drawn *on* an accent fill, so it inverts with the accent rather than with the page.
  '--accent-ink': '#f2f8ff',
  // The wait-age bands, in ladder order and in their own hues.
  '--band-0': '#1c7a55',
  '--band-1': '#8a6212',
  '--band-2': '#b04a14',
  '--band-3': '#bf2a1c',
  '--over': '#bc3a20',
  '--transfer': '#7b3f96',
  '--entrance': '#37599f',
  '--secure': '#86612a',
  '--measured': '#3d7a2e',
});

const PALETTE: Readonly<Record<ThemeName, Readonly<Record<string, string>>>> = Object.freeze({
  dark: DARK_TOKENS,
  light: LIGHT_TOKENS,
});

/* -------------------------------------------------------------------------- *
 * The decision
 * -------------------------------------------------------------------------- */

function themeOf(choice: ThemeChoice, name: ThemeName): ResolvedTheme {
  return { choice, name, colorScheme: name, tokens: PALETTE[name] };
}

/**
 * The palette to apply, given the player's choice and the operating system's preference.
 *
 * The **decision** has one home — this function — and `dev/main.ts` calls it, for the reason
 * `dev/motion.ts#playbackRateFor` states about itself: *"a copy in a test helper would assert its
 * own arithmetic and prove nothing about the shipped path — which is the shape of a fake sink, and
 * this directory exists to catch those."* `scope/probes.test-helper.ts` may call this and must not
 * reimplement it; a probe that rebuilt the record would pass with the setting disconnected from
 * everything.
 *
 * An explicit `'dark'` or `'light'` **never consults the probe** — not "consults it and ignores the
 * answer": a player who picked a side has overridden their operating system, which is the one place
 * this differs from `shouldAutoplayWith`'s `or`, and it differs because the two settings mean
 * different things. Reduce-motion is a request that either source may make; a theme is a single
 * value with exactly one winner.
 */
export function themeFor(choice: ThemeChoice, prefersColorScheme: ColorSchemeProbe): ResolvedTheme {
  if (choice === 'dark') return themeOf(choice, 'dark');
  if (choice === 'light') return themeOf(choice, 'light');
  return themeOf(choice, prefersColorScheme(DARK_SCHEME_QUERY).matches ? 'dark' : 'light');
}
