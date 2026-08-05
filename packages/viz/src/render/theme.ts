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
 * **The non-test caller is `dev/main.ts#applyTheme`**, which calls {@link themeFor} and writes what
 * it returns. The qualifier this paragraph used to carry — *"at the time of writing the wiring has
 * not landed"* — is deleted because the wiring landed, which is what its own last sentence
 * instructed. Wave 12's audit found two docstrings naming callers that do not call (§ D192); this
 * sentence exists so this file is not the third.
 *
 * ## Why it returns tokens instead of applying them
 *
 * `src/boundaries.test.ts` rule 3 confines the DOM to `src/dev/`, which is what makes this whole
 * package testable under plain Node with no jsdom. So this module answers *what the palette is*
 * and `dev/main.ts` does the writing — the same split `render/runSummary.ts`, `render/canvas.ts`
 * and `dev/motion.ts` already use. {@link ResolvedTheme.tokens} is a record of CSS custom-property
 * name → value, exactly the shape `element.style.setProperty` takes one pair at a time.
 *
 * ## The stage travels with the shell — the second half, and the reason this file was half a
 * feature until it did
 *
 * {@link ResolvedTheme.stage} is the same decision projected onto the canvas: the `Theme`
 * `render/canvas.ts` draws with, built by `themeFromPalette` from the same `Palette` the tokens
 * came from. Before it existed this module resolved twenty-seven custom properties and the canvas
 * kept a module-level dark constant, so a player on `light` got *a light shell around a dark
 * stage* — named in this docstring at the time, which is better than being discovered, and still a
 * half-repainted page. One resolution, two surfaces: the shell writes `tokens`, the viewer hands
 * `stage` to `drawScene`, and there is no second place a mode is decided.
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
 * **Neither palette is authored here, and this module holds no colour of its own.** Both are
 * `render/tokens.ts`'s — the dark one through `render/canvas.ts`'s `DARK_PALETTE`, which assembles
 * that file's own exports — because it is this repository's one palette source (§ 2.2 of the
 * handoff: *"three copies of a palette is the same defect class this repository has closed ten
 * times"*). Ten of the twenty-seven used to be literals *here*, quoted from `index.html` because
 * nothing else named them; they are constants in the palette file now, which is what made a second
 * mode a table lookup rather than a second hand-typed palette.
 * `theme.test.ts` derives the token **names** from `index.html`'s `:root` block and
 * asserts them against this module **in both directions**, so a token added to the stylesheet with
 * no palette entry is red, and a palette entry naming a property the stylesheet dropped is red
 * too. § D213: a hand-maintained list stops tracking the thing it was built from, and this
 * repository has been caught by that five times.
 *
 * The **light** palette is `render/tokens.ts`'s `LIGHT_PALETTE`, and it is authored rather than
 * quoted. One thing must be said about it plainly, and it is the same sentence that file carries:
 * **it has never been driven in a browser.** This repository has none — `docs/05-roadmap.md`:
 * *"no Playwright, no Puppeteer, no jsdom"* — so under `docs/16` S9's evidence tiers
 * (`static sweep < model walk < document recorder < browser`) nothing here earns better than a
 * model walk, and no claim that it *looks* right may be made anywhere. What is checked is
 * arithmetic and structure: every token differs from its dark counterpart, every token that
 * carries content clears a contrast floor against the surface it is drawn on, and the light
 * palette collides exactly where the dark one does and nowhere else.
 *
 * The second caveat this paragraph used to carry — *"it does not repaint the stage"* — is gone
 * because the seam it named is built. See {@link ResolvedTheme.stage}.
 */

import { themeFromPalette, DARK_PALETTE, type Theme } from './canvas.js';
import { LIGHT_PALETTE, type Palette } from './tokens.js';

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
  /**
   * The palette the **canvas** draws this mode with — `render/canvas.ts`'s `Theme`.
   *
   * Handed to `drawScene` (and `drawPreview`) in place of its `DEFAULT_THEME` default, which is
   * what makes the stage repaint with the shell. It is a projection of the *same* `Palette` the
   * {@link ResolvedTheme.tokens} above came from, through the one function that performs that
   * projection, so the two halves of a mode cannot disagree: there is no arrangement of this type
   * in which a reader gets light tokens and a dark stage, which is precisely the arrangement that
   * shipped before it existed.
   *
   * Not a `Record<string, string>` like `tokens`, and the difference is the point. The shell's
   * half is *data for the DOM* — names the stylesheet declares, written one `setProperty` at a
   * time. The canvas's half is a typed set of **claims**, and a claim the renderer draws with no
   * field for is a compile error rather than an undefined lookup.
   */
  readonly stage: Theme;
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
 * Which CSS custom property carries which colour — **one table, both modes.**
 *
 * It used to be two objects, and that was the shape of the bug: the dark record quoted seventeen
 * names from `render/tokens.ts` and spelled ten literals of its own, the light record spelled all
 * twenty-seven, and nothing structural said the two had the same *keys* — a mode could have gained
 * a token, or lost one, and only the derived-from-the-stylesheet assertion in `theme.test.ts`
 * would have caught it. Now the mode is a `Palette` and this is a projection of it, so both modes
 * declare exactly these twenty-seven properties by construction, and the ten that only
 * `index.html` used to declare are constants in the palette file like every other colour.
 *
 * The stylesheet's type and geometry tokens are still deliberately absent — see
 * {@link ResolvedTheme.tokens}.
 */
function shellTokensOf(palette: Palette): Readonly<Record<string, string>> {
  return Object.freeze({
    '--bg': palette.page,
    '--rail': palette.rail,
    '--panel': palette.card,
    '--card': palette.cardRaised,
    '--raised': palette.raised,
    '--edge': palette.edge,
    '--edge-mid': palette.edgeMid,
    '--edge-strong': palette.edgeStrong,
    '--hairline': palette.hairline,
    '--hint-underline': palette.hintUnderline,
    '--text': palette.text,
    '--dim': palette.textMuted,
    '--dimmer': palette.textDim,
    '--faint': palette.floorLabel,
    '--fainter': palette.fainter,
    '--accent': palette.accent,
    '--accent-soft': palette.accentSoft,
    '--accent-ink': palette.accentInk,
    '--band-0': palette.bandSettling,
    '--band-1': palette.bandWaiting,
    '--band-2': palette.bandLong,
    '--band-3': palette.bandAbandoned,
    '--over': palette.over,
    '--transfer': palette.floorLabelTransfer,
    '--entrance': palette.floorLabelEntrance,
    '--secure': palette.floorLabelRestricted,
    '--measured': palette.measured,
  });
}

/**
 * The two modes, each resolved **once** at module load — the shell's tokens and the canvas's theme
 * out of the same `Palette`, so the pair cannot be assembled inconsistently by a caller.
 *
 * The dark side is `index.html`'s `:root`, § 1.1 S6/S7 of the handoff, reached through
 * `render/canvas.ts`'s `DARK_PALETTE` (which is assembled from `render/tokens.ts`'s own exports —
 * that file's header says why the assembly lives there). The light side is
 * `render/tokens.ts`'s `LIGHT_PALETTE`. `theme.test.ts` pins all twenty-seven dark values to
 * `index.html` in both directions, and `dev/tokens.test.ts` pins the light twenty-seven to
 * `:root[data-theme="light"]` the same way, so neither mode can drift away from the stylesheet in
 * silence.
 */
const PALETTE: Readonly<Record<ThemeName, Palette>> = Object.freeze({
  dark: DARK_PALETTE,
  light: LIGHT_PALETTE,
});

const RESOLVED: Readonly<
  Record<ThemeName, { readonly tokens: Readonly<Record<string, string>>; readonly stage: Theme }>
> = Object.freeze({
  dark: Object.freeze({
    tokens: shellTokensOf(PALETTE.dark),
    stage: themeFromPalette(PALETTE.dark),
  }),
  light: Object.freeze({
    tokens: shellTokensOf(PALETTE.light),
    stage: themeFromPalette(PALETTE.light),
  }),
});

/* -------------------------------------------------------------------------- *
 * The decision
 * -------------------------------------------------------------------------- */

function themeOf(choice: ThemeChoice, name: ThemeName): ResolvedTheme {
  const resolved = RESOLVED[name];
  return { choice, name, colorScheme: name, tokens: resolved.tokens, stage: resolved.stage };
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
