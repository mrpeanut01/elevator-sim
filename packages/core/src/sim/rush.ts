/**
 * **Endless rush's arithmetic, in the one package both ends of a posted sitting can read** — GitHub
 * issues #220 and **#372**, [§ D515](../../../../DECISIONS.md), and the owner's ruling of 2026-09-10
 * on #372: *a round is a sitting, posted whole … the server replays the chain and derives each
 * round's purse from the previous round's hold moment.*
 *
 * ## Why this moved into `core`
 *
 * Everything here was written in `packages/viz` for #220 — the stream's constants in
 * `everyday/rushScreenModel.ts`, the run's identity and the hold reader in `everyday/rush.ts` — and
 * it was right there while the rush was a thing only the viewer ran. A posted sitting changes that:
 * `packages/server` has to rebuild a round's configuration and read the same hold moment off its own
 * replay, and it may not import `viz` (§ D215 § 3). Two copies of *forty past two minutes at the
 * stream's two-second buckets* would be this repository's signature defect — two implementations of
 * one decision, free to drift — so the decision lives here, once, and both packages call it. The viz
 * modules re-export these names under the same spellings, so every screen and test that read them
 * there still does, and `interventionWire.ts` is the precedent for the move.
 *
 * ## The three halves
 *
 * 1. **The stream** — ENGINE_CONTRACT § 3.2's constants and the two wave numberings. The viz module
 *    that draws the setup screen computes every band and bar from these, so they are the whole of
 *    the ramp rather than a description of it.
 * 2. **The run's identity** — the template, the seed and the one rate that makes the stream the same
 *    number of *people* on every tower ({@link rushTopRatePctPop5min}). Derived from the building's
 *    population and nothing a player chose, which is what lets the server rebuild a round from a
 *    building id alone.
 * 3. **The hold line, read off legs** — {@link rushHoldAtLegs}. `packages/viz/src/everyday/rush.ts`
 *    reads a recording's legs through it and the server reads `result.record.passengers` through
 *    it: the viewer's `VizLeg` is `PassengerRecord` projected (`record/recordRun.ts#describeLegs`),
 *    and the three fields this reads are copied across unchanged.
 *
 * Invariant 3 holds: nothing here reads a clock. Every time is a simulated second from the kernel.
 */

/** The template `data/traffic-profiles.json` authors for the stream. */
export const RUSH_TEMPLATE_ID = 'endless-rush';

/**
 * § 3.2's constants, in one frozen record so every figure the rush shows is a function of them.
 *
 * `bucketS` is the contract's *two-second buckets*: {@link expectedPerBucket} is people per bucket,
 * and any per-minute figure divides by it. `waveS` is *three minutes*, which is what makes the ramp
 * *+11 % of a normal morning's rate every three minutes*. `seed` is the one seed every player's
 * waves are generated from, so a rush board ranks runs on one crowd rather than on the luck of the
 * draw (§ D515).
 */
export const RUSH_STREAM = Object.freeze({
  /** Ninety minutes. The contract's own length for the generated climb. */
  lengthS: 90 * 60,
  /** Two-second buckets. */
  bucketS: 2,
  /** `wave = floor(t / 180)`. */
  waveS: 180,
  /** The `0.34` of `(0.34 + wave × 0.11) × 2 / 3`. */
  baseRate: 0.34,
  /** The `0.11` — the per-wave climb, which is the *+11 %* the setup screen quotes. */
  waveStep: 0.11,
  /** The `× 2 / 3`. */
  scale: 2 / 3,
  /** Constant across the whole climb — § 3.2 says so in one word. */
  upShare: 0.62,
  /** The one seed every player's waves are generated from. */
  seed: 90_210,
} as const);

/** § 3.2's zero-based `wave = floor(t / 180)` — the arrival expression's own index. */
export function waveIndexAt(t: number): number {
  return Math.floor(Math.max(0, t) / RUSH_STREAM.waveS);
}

/**
 * § 3.2's `floor((t − OPEN) / 180) + 1` — the wave a player is told they are on.
 *
 * `t` is seconds since the rush opened, so `OPEN` has already been subtracted. Kept apart from
 * {@link waveIndexAt} by name, because collapsing the two is an off-by-one that reads as a plausible
 * ramp.
 */
export function playerWaveAt(t: number): number {
  return waveIndexAt(t) + 1;
}

/** `expected = (0.34 + wave × 0.11) × 2 / 3`, people per two-second bucket, for a zero-based wave. */
export function expectedPerBucket(waveIndex: number): number {
  return (RUSH_STREAM.baseRate + waveIndex * RUSH_STREAM.waveStep) * RUSH_STREAM.scale;
}

/** The same expression read as arrivals a minute, which is the unit a player can picture. */
export function arrivalsPerMinute(waveIndex: number): number {
  return (expectedPerBucket(waveIndex) * 60) / RUSH_STREAM.bucketS;
}

/**
 * The last wave a player is shown in the generated stream — {@link playerWaveAt} at its final second,
 * so the two numberings meet in exactly one place. Thirty on the shipped constants.
 */
export const LAST_GENERATED_WAVE = playerWaveAt(RUSH_STREAM.lengthS - 1);

/**
 * The line the run ends on: **forty people who have each been standing over two minutes, at once**
 * (§ 20.5, § D515 clause 3).
 *
 * `overS` is `packages/viz/src/live/bands.ts`'s own fourth band boundary (`fromS: 120`, *past two
 * minutes*) and `rushScreenModel.test.ts` asserts the two agree. The same line for everybody is the
 * point (§ 9.2): a rush whose ending moved with the tower would not be a leaderboard.
 */
export const RUSH_HOLD_LINE = Object.freeze({
  people: 40,
  overS: 120,
} as const);

/** Wave 30's arrivals a minute — the top of the ramp, and the template's intensity 1. */
export function rushTopArrivalsPerMinute(): number {
  return arrivalsPerMinute(LAST_GENERATED_WAVE - 1);
}

/**
 * Wave 30's rate as `arrivalRatePctPop5min` for a building of `population` — the override the run
 * carries, so the stream is the same number of **people** on every tower.
 */
export function rushTopRatePctPop5min(population: number): number {
  if (!(population > 0)) throw new Error('a rush needs a building with people in it');
  return (rushTopArrivalsPerMinute() * 5 * 100) / population;
}

/**
 * The three fields of a leg the hold line reads — structurally a `PassengerRecord` and a `VizLeg`
 * both, so neither end has to convert anything to ask.
 */
export interface RushHoldLeg {
  /** When the leg's wait began. */
  readonly arrivedAt: number;
  /** When it boarded, or absent while it is still standing. */
  readonly boardedAt?: number | undefined;
  /** When the building turned it away (§ D266), or absent. A refused rider is not standing. */
  readonly refusedAt?: number | undefined;
}

/**
 * The first bucket at which forty people have been standing over two minutes at once — the hold line
 * crossed — or `undefined` when the run ends without crossing it.
 *
 * ## The same answer the stage draws, by construction and not by agreement
 *
 * Read at the stream's own two-second buckets from `startedAt` to `endedAt` inclusive, stepping by
 * addition exactly as the viewer's loop did, so a bucket time here is bit-identical to one there. A
 * leg counts at `t` when it has arrived by `t`, has neither boarded nor been refused by `t` (both
 * right-continuous: boarding at exactly `t` is not standing at `t`, `frame/overlay.ts#isWaitingAt`'s
 * convention), and `t − arrivedAt` is at least {@link RUSH_HOLD_LINE}'s `overS` — which is
 * `live/bands.ts#bandIndexOf` putting a wait in the fourth band, computed the same way.
 *
 * ## Order-free, and why the one shortcut is exact
 *
 * `record.passengers` is in generation order and a recording's legs are sorted by arrival, so this
 * sorts its own copy rather than trusting either. A leg whose wait ended less than `overS − 1`
 * seconds after it began can never be counted — at any `t` before its end it has stood under
 * `overS − 1` — so it is dropped before the sweep. The one-second margin is far wider than any
 * rounding in a subtraction of two simulated times, which is what keeps the shortcut from changing
 * an answer.
 */
export function rushHoldAtLegs(
  legs: readonly RushHoldLeg[],
  startedAt: number,
  endedAt: number,
): number | undefined {
  const reach = RUSH_HOLD_LINE.overS - 1;
  const candidates = legs
    .filter((leg) => Math.min(leg.boardedAt ?? Infinity, leg.refusedAt ?? Infinity) - leg.arrivedAt >= reach)
    .sort((a, b) => a.arrivedAt - b.arrivedAt);
  if (candidates.length < RUSH_HOLD_LINE.people) return undefined;
  for (let t = startedAt; t <= endedAt; t += RUSH_STREAM.bucketS) {
    let count = 0;
    for (const leg of candidates) {
      if (leg.arrivedAt > t) break;
      if (leg.refusedAt !== undefined && leg.refusedAt <= t) continue;
      if (leg.boardedAt !== undefined && leg.boardedAt <= t) continue;
      if (t - leg.arrivedAt >= RUSH_HOLD_LINE.overS) count += 1;
    }
    if (count >= RUSH_HOLD_LINE.people) return t;
  }
  return undefined;
}

/**
 * How many generated waves a round **outlasted**, read off its hold moment — what a rush round pays
 * its purse on (GitHub issue #372).
 *
 * The wave the line was crossed in was reached and not outlasted, so a crossing in wave `n` outlasted
 * `n − 1` — `packages/viz/src/everyday/rush.ts#rushWavesOutlastedOf`'s reading for the chime ledger,
 * applied to a replay rather than to what a screen showed. Two readings differ from that one, and
 * both are because a replay has no hand stop:
 *
 * - **A replay that never crosses the line outlasted every generated wave.** The chime route is told
 *   a count by a client that cannot tell a hand stop from a run that held, so it banks nothing for
 *   either (§ D533). The server reads the whole run, and a run that held to its horizon held.
 * - **A crossing while the building drains after the stream has stopped is not a later wave.** The
 *   stream generates {@link LAST_GENERATED_WAVE} waves; a queue that crosses the line during the
 *   drain outlasted all of them, and no more.
 *
 * Nothing else the run measured reaches this: how long anybody waited, how many were carried and
 * whether the mean is quotable are all on the run, and none of them is a count of waves. That is what
 * keeps a purse from varying with a measurement (§ D526 clause 2's rule, applied to units).
 */
export function rushWavesOutlasted(holdAtS: number | undefined, startedAt: number): number {
  if (holdAtS === undefined) return LAST_GENERATED_WAVE;
  return Math.min(LAST_GENERATED_WAVE, Math.max(0, playerWaveAt(holdAtS - startedAt) - 1));
}
