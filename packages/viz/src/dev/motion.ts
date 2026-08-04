/**
 * The reader's motion preference — `UX.md` `KB-14`, one of the seven ⛔ non-negotiable rows.
 *
 * The row has two clauses and they are enforced in two different places:
 *
 * - *nothing animates that is not the simulation itself* — `index.html`'s
 *   `@media (prefers-reduced-motion: reduce)` block, asserted by `reducedMotion.test.ts`;
 * - *playback still works* — this module, which decides only whether a freshly adopted recording
 *   starts moving on its own. It never disables the transport.
 *
 * The media query is read through an injected `matchMedia` rather than off `window`, because a
 * row this project calls non-negotiable should be assertable without an operating system that
 * has the setting turned on. `dev/main.ts` is the shipped, non-test caller; it passes the real
 * `window.matchMedia`.
 */

/** The one spelling of the query. Duplicating it is how a preference stops being read. */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** The shape of `window.matchMedia`, narrowed to what is actually read. */
export type MediaQueryProbe = (query: string) => { readonly matches: boolean };

export function prefersReducedMotion(matchMedia: MediaQueryProbe): boolean {
  return matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * Whether a recording just put on screen should start playing by itself.
 *
 * `false` under a reduced-motion preference: the reader gets the first frame and a Play button,
 * which is the whole of what `KB-14` asks for on this side. Inverting this is the failure the
 * test pins.
 */
export function shouldAutoplay(matchMedia: MediaQueryProbe): boolean {
  return !prefersReducedMotion(matchMedia);
}

/**
 * Whether to start playing, given the operating system's preference **and the player's own switch**
 * — `docs/16` § 5 clause 4.
 *
 * `shouldAutoplay` reads `prefers-reduced-motion` and nothing else, which was correct until the menu
 * grew a *Reduce motion* setting of its own. A player who set that switch has asked for the same
 * thing by a different route and was being ignored: the field was read only inside `menu/`, which is
 * the definition of an inert control.
 *
 * Two sources, one answer, and **either** is sufficient. A reader who turned the setting off has not
 * overridden their operating system — they have said nothing about it — so this is an `or` and never
 * a precedence rule.
 */
export function shouldAutoplayWith(matchMedia: MediaQueryProbe, reduceMotion: boolean): boolean {
  return !reduceMotion && shouldAutoplay(matchMedia);
}

/**
 * The playback rate: the transport chip's own speed, times the player's multiplier.
 *
 * A **multiplier** because the two controls answer different questions. The chip is *how much
 * simulated time passes per real second* — a property of the run being watched, and what `×900`
 * means. The setting is *how fast this player likes to watch*, and it should survive changing the
 * chip. Multiplying is also what keeps the chip's own selected state meaningful: `dev/main.ts`
 * compares the chip against `baseSpeed`, not against the product.
 *
 * Here rather than inside `boot()` so it has exactly one definition. A copy in a test helper would
 * assert its own arithmetic and prove nothing about the shipped path — which is the shape of a fake
 * sink, and this directory exists to catch those.
 */
export function playbackRateFor(baseSpeed: number, multiplier: number): number {
  return baseSpeed * multiplier;
}
