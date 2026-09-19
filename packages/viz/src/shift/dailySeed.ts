/**
 * **The day's crowd: the UTC date's own digits** — [§ D729](../../../../DECISIONS.md),
 * [§ D730](../../../../DECISIONS.md).
 *
 * ## What was wrong, in the product's own terms
 *
 * `dev/main.ts`'s boot opened the session on `randomSeed()` — `crypto.getRandomValues` — and
 * `dev/state.ts#withFirstSession` drew the first session's tower from it, so six cold loads gave
 * six different towers. Meanwhile five player-facing strings asserted the opposite as fact: the
 * door's rule (*"One tower a day, the same for everybody"*), its closing sentence, the seed line
 * (*"crowd `<n>` · everyone identical"*), the day's lede and the brief's LOCKED FOR SCORE card.
 *
 * That is worse than any refusal this product draws. Every *withheld* figure in this repository is
 * an honest one — the product declining to say something it cannot support. These five were the
 * other thing: the product asserting something it does not do, on the first screen of the first
 * mode, about the one property the whole pitch rests on. `randomSeed`'s own docstring had said so
 * the entire time — *"A seed nobody chose, so the first shift is not the same shift for
 * everybody"* — which is what makes this a screen nobody re-read rather than a mechanism nobody
 * understood.
 *
 * ## The derivation, and why it is this one
 *
 * `packages/server/src/leaderboard/boardKey.ts#dailySeedFor` already answers this question for the
 * leaderboard: **the day's seed is the date with its dashes removed**. This module is the same
 * expression on the client, and that is the whole of the design decision. Three properties earn
 * it, and each was tested against the alternatives rather than assumed:
 *
 * 1. **There is already exactly one derivation, and this is it.** A second expression — a hash, a
 *    salted digest, a rotation table — would be a *second* answer to a question the server has
 *    answered, which is the defect `boardKey.ts` exists to have removed. {@link dailySeedFor}
 *    returns the same digits the server does, and `dailySeed.test.ts` pins that against the
 *    server's **own source text** rather than against a copy of it, on `menu/client.test.ts`'s
 *    precedent: `viz` may not depend on `server` (§ D215 § 3), so the agreement is asserted rather
 *    than imported, and the server changing its mind turns this package red.
 * 2. **A player can check it without being told.** The seed the door prints *is* today's date —
 *    `crowd 20260919` on 2026-09-19 — so the claim *"everyone playing today meets this crowd"* is
 *    verifiable by the person reading it, against a calendar they already have. That is the same
 *    standard every withheld figure in this product is held to, pointed at an assertion for once
 *    instead of at a refusal. `boardKey.ts` chose these digits for the same reason and says so:
 *    *"it is the derivation a reader can perform in their head"*.
 * 3. **A shipped salt buys nothing.** The salt would ship in the bundle, so it is public the
 *    moment anybody looks; it makes tomorrow's crowd no less guessable, and it breaks property 1.
 *    Rejected on that, not on taste.
 *
 * ## Why the client computes it, against § D218 § 3
 *
 * § D218 § 3 says the client never computes which challenge today is, because *"a client's clock
 * is not trustworthy in a competition"*. That rule is kept, and it does not reach here. Three
 * things separate the two questions, and they are facts rather than readings:
 *
 * - **The failure mode is bounded and already handled.** A device whose clock is a day out plays
 *   yesterday's crowd. `boardKey.ts#placeSubmission` then puts that run on the **personal log**
 *   rather than on the daily board, because it is not `dailyFixtureAt(now)`'s seed — so the
 *   server's clock still decides every ranked thing, and nothing accuses anybody. A challenge
 *   window is the opposite: it opens and closes, so a wrong clock lets somebody in early.
 * - **There is no server answer to defer to on the build a stranger opens.** The shipped static
 *   artifact carries no `<meta name="elevator-sim-api">` — `packages/viz/index.html` forbids one
 *   and `deploy-viz.yml` injects it from a repository variable — so `GET /api/boards` is not
 *   called at all and `BoardsPage.today` is `undefined`. § D218 § 3's premise is *"the server is
 *   already this repository's first wall clock"*; on that build there is no clock but this one.
 * - **The page must open before any network answers.** `dev/main.ts` builds the opening state
 *   synchronously. A seed that waited for a fetch would be a page that waits for a fetch, and on
 *   an API-less build it would wait forever.
 *
 * So the division is: **the device's clock decides which day you play; the server's clock decides
 * which board your run posts to.** Neither answers the other's question, and `host.ts#dailyBoardOf`
 * is untouched — it still reads `today.date` off the server and still works out no day of its own.
 *
 * ## What this does *not* make true — [§ D730](../../../../DECISIONS.md)
 *
 * The crowd is now the day's. **The tower is not**, and no seed makes it so: `shift/week.ts` is a
 * week over one `contractId`, so the tower a player is on is the one their week was opened on, and
 * only a first session draws it from the seed at all. A returning player on day 5 is on their own
 * week's tower, which is nobody else's. So the strings are narrowed to the claim that holds —
 * see `everyday/today.ts#todayOf` and `everyday/doorView.ts` — and the part that does not hold is
 * registered in `everyday/buildNotes.ts` rather than reworded away (§ D227).
 *
 * ## The rotation rules were tested and are deliberately not adopted
 *
 * `docs/37` § 4.3 carries the gameplay guide's three rotation rules — no tower twice in seven
 * days, no wrinkle template twice in fourteen, the pair never inside a month — and they are the
 * obvious third candidate for this derivation. Measured over 730 consecutive dates against the
 * eleven eligible contracts, the draw below repeats a tower **inside seven days on 42.2 % of
 * days** and on **consecutive days 56 times**, so it plainly does not satisfy rule 1, and that is
 * stated here rather than glossed.
 *
 * It is not adopted anyway, for a reason that outranks the arithmetic: **a rotation would have no
 * observer.** `dev/state.ts#withFirstSession` runs once per device, on the load that restored
 * nothing — so a player draws exactly one element of the sequence, ever, and the order of the
 * other 729 is a property nothing in the product can display. Building it would be this
 * repository's signature defect wearing a design document: a behaviour that is configured,
 * validated, and reached by nothing. The rule becomes worth implementing on the day the daily
 * door draws a tower a day, which is GitHub issue #159's generator and not this module's;
 * `docs/37` § 4.3 already requires that generator to *assert non-exhaustion over a simulated
 * year* rather than inherit it, and the measurement above is left here as its first input.
 */

/**
 * The date `nowMs` falls in — `YYYY-MM-DD`, UTC.
 *
 * UTC and not a local zone, for `boardKey.ts#dailyDateOf`'s reason, quoted because it is the same
 * function: *"which day is it has to have one answer for every player … a board keyed by a date
 * that depends on where the reader is standing is two boards wearing one name"*. A player in
 * Auckland and a player in Los Angeles meet the same crowd at the same instant, which is the only
 * reading under which the door's sentence is true at all.
 *
 * Pure: `nowMs` is an argument and no clock is read here. `shift/deviceDate.ts` is the one place
 * this package takes a calendar reading, and it is the only file `boundaries.test.ts` exempts for
 * it.
 */
export function dailyDateOf(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/**
 * The day's crowd, as the run carries it: the date's own digits.
 *
 * A `bigint` where the server's twin returns a decimal string, because `ViewerState.seed` is a
 * `bigint` and `SimulationConfig.seed` is the same value — the two spellings are one number, and
 * `dailySeed.test.ts` asserts that `String(dailySeedFor(d))` is character for character what
 * `packages/server`'s `dailySeedFor` produces.
 */
export function dailySeedFor(date: string): bigint {
  return BigInt(date.replaceAll('-', ''));
}

/** The crowd for the day `nowMs` falls in — {@link dailyDateOf} then {@link dailySeedFor}. */
export function dailySeedAt(nowMs: number): bigint {
  return dailySeedFor(dailyDateOf(nowMs));
}

/**
 * Whether a run's seed is the one every player has today — the predicate the door's sentence is
 * conditional on.
 *
 * ## Why the screens ask this instead of assuming it
 *
 * Two states reach a screen with a seed that is not the day's, and both are ordinary rather than
 * exotic. A `?seed=` deep link is the reader's own choice and wins over the opening state, exactly
 * as `?building=` does; and a session left open across UTC midnight was seeded on yesterday's date
 * and is still running. A sentence that claimed *everyone identical* over either would be the
 * defect this module exists to close, surviving inside the fix.
 *
 * So it is asked **at render time** rather than latched at boot: the second case only becomes
 * visible by asking again, and a flag written once would have gone quietly stale at midnight,
 * which is § D227's stale refusal with its polarity reversed.
 */
export function isDailySeed(seed: bigint, nowMs: number): boolean {
  return seed === dailySeedAt(nowMs);
}
