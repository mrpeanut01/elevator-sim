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
