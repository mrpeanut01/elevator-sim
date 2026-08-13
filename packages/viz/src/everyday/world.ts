/**
 * **The world figures, and the state this build is always in** — GAMEPLAY § 16 rule 15,
 * ENGINE_CONTRACT § 12.
 *
 * ## What a world figure is
 *
 * Everything on a daily surface that is a statement about **other players**: how many played this
 * tower yesterday, the day's median and worst, both histograms, the board, the ladder, the style
 * split, and your percentile within the day's distribution. § 12's rule for all of them is one
 * sentence — *every world figure is a replay-verified aggregate or it does not ship* — and this
 * build ships no server, so not one of them has a source.
 *
 * ## Why that is the normal state here rather than an error state
 *
 * § 16 rule 15: *"Every screen renders with the API absent. World figures … degrade to a labelled
 * `world figures unavailable` state. Never a zero, never a spinner, never an empty chart that
 * reads as 'nobody played'. This is what a player sees on a train, and it is what makes these
 * surfaces testable without a server."*
 *
 * So the door and Your week draw the band, name what would be in it, and say why it is empty. That
 * is a different screen from one that quietly omits the band: a reader who has heard of the daily
 * board and finds no trace of it on the front door learns the product is smaller than it is, and a
 * reader who finds `0 players` learns something false.
 *
 * ## Why this is a constant and not a port
 *
 * A `provideWorldFigures`-shaped seam with no provider is exactly the dead-seam shape this
 * repository keeps paying for — typed, tested, reached by nothing — and `everyday/host.ts`'s
 * docstring already names the absent halves it will not speculate about. When a lane wires the
 * server it adds the port beside its caller and this constant becomes the `undefined` arm of it.
 * Until then there is one sentence, in one place, so the two screens that refuse refuse in the
 * same words — the defect `screens.ts`'s refusal table exists to prevent, one directory over.
 */

/** The eyebrow a band of world figures carries when it has none. */
export const WORLD_FIGURES_LABEL = 'WORLD FIGURES UNAVAILABLE';

/**
 * Why, in one sentence a player reads.
 *
 * It names the mechanism (*every posted run is replayed by the server before it appears*) because
 * that mechanism is § 14's own reason the boards are worth reading, and a refusal that dropped it
 * would leave a reader thinking the figures are merely missing rather than deliberately unposted.
 */
export const WORLD_FIGURES_REASON =
  'Nobody else’s runs can be reached from this build — there is no server to post them to, and a ' +
  'figure about other players that was not replay-verified is not a figure. Everything about ' +
  'your own day below is measured from the run itself.';

/**
 * What each world figure would have been, named rather than left blank — ENGINE_CONTRACT § 12's
 * own replacement column, in the order § 6.1 draws them.
 *
 * Drawn as a list under the label so the band says *what is missing*, which is the half § 16
 * rule 15 asks for beyond *that something is*.
 */
export const WORLD_FIGURES_ABSENT: readonly string[] = Object.freeze([
  'how many people played this tower, and how the middle one of them did',
  'the longest wait anybody recorded, and the two distributions your run would sit in',
  'today’s board — the top runs on this crowd, with your row at its real rank',
  'the style split — what everyone else brought, captioned as a share and not a ranking',
]);

/**
 * Your percentile line, which § 14 gives two arms and § 16 rule 1 gives a third.
 *
 * - the day is not closed → *nothing to place yet* (rule 1: withheld until **Close the day**);
 * - the day is closed and the world is unreachable → the labelled unavailable state;
 * - the day is closed and the world is reachable → the figure, which nothing in this build
 *   produces, and which is therefore not composed here at all.
 *
 * The third arm is absent rather than stubbed for `host.ts`'s stated reason: a branch with no
 * caller is a claim about a thing that does not exist. The two arms below are the two a player can
 * actually meet.
 */
export function percentileLine(dayClosed: boolean): string {
  return dayClosed
    ? 'Your place among today’s players cannot be shown — there is no verified distribution to ' +
        'put your run in.'
    : 'Nothing to place yet — the day is not closed.';
}
