/**
 * **The reproduction gate — ENGINE_CONTRACT § 1.5's *"never replay something approximate"*.**
 *
 * Recorded here rather than in `DECISIONS.md`, under § D405; the directory's one ruling is § D407.
 *
 * ## What is being checked, and what is not
 *
 * § 1.5: *"A run whose record fails to reproduce its posted metrics is not shown. A row that cannot
 * be replayed loses its `Watch it` button rather than replaying something approximate."*
 *
 * That is a check on **staleness**, and it is worth being precise about what it can and cannot
 * catch, because the pill on the canvas is a claim a player will read. A record is
 * `{ seed, config-identity, interventions[] }` and the figures it was filed with. Re-simulating it
 * here catches every way the *answer* can have moved while the *question* stayed the same:
 *
 * - `data/` changed under the record — a building gained a floor, a dispatcher's weights moved, a
 *   demand template was re-authored. Every one of those is a live possibility in this repository,
 *   and `runDataHashOf`'s own existence (§ D214 § 4) is the leaderboard's version of this worry.
 * - `core` changed — a dispatch rule, a door timing, a stage-7 park. `replay.test.ts` pins that a
 *   seed reproduces its recording, and this is that pin pointed at a record instead.
 * - The record was written by a build whose composition order differed.
 *
 * It catches **nothing** about authenticity. A record edited to agree with its own figures passes,
 * because the figures are stored beside the record and both are in the same slot. That is why
 * `watch/view.ts` says *verified by re-simulation* and not *verified by the server*: this gate
 * refuses a stale claim and has nothing to say about a forged one, and a pill claiming otherwise
 * would be a true-sounding sentence about a check that did not happen.
 *
 * ## Why the comparison is exact
 *
 * All four fields of `PostedResult` are counts or whole-number percentages folded by
 * `shift/observations.ts`. There is no float in the comparison, so there is no tolerance to choose
 * — and choosing one would be choosing how wrong a replay may be, which § 1.5 has already answered.
 * A mismatch names **which** figure moved and by how much, because a refusal that says only *"it
 * did not reproduce"* sends a reader hunting: `scope/runIdentity.ts`'s rule about refusals giving
 * the right reason applies here exactly.
 */

import type { VizRecording } from '../contract/types.js';
import { observationsAt } from '../live/observations.js';
import { shiftObservationsOf } from '../shift/observations.js';

import type { PostedClaim, PostedResult } from './types.js';

/**
 * The four figures a finished run posts — the one derivation, so the file-time write and the
 * watch-time check cannot disagree.
 *
 * `observationsAt(recording, recording.endedAt)` is `dev/main.ts#closeShift`'s own expression, and
 * it is called rather than copied for the reason this repository states everywhere else: two
 * expressions for one figure is how a stored claim comes to describe a run nobody played.
 *
 * The whole recording, never the playhead. A day's account is the day's — `closeShift`'s own rule,
 * and here it is what makes the check independent of where a spectator happens to have paused.
 */
export function postedResultOf(recording: VizRecording): PostedResult {
  const observations = shiftObservationsOf(observationsAt(recording, recording.endedAt));
  return {
    arrived: observations.arrived,
    carried: observations.carried,
    minutePct: observations.minutePct,
    worstWaitS: observations.worstWaitS,
  };
}

/** One figure that moved, in the words the row prints. */
interface Drift {
  readonly label: string;
  readonly posted: number;
  readonly replayed: number;
}

/**
 * Every figure the replay disagrees with the record about, in the order a reader should meet them.
 *
 * Exported because the refusal sentence and the test that drives both branches want the same list,
 * and a test matching on prose would pass a sentence that named the wrong figure.
 */
export function reproductionDrift(
  posted: PostedResult,
  replayed: PostedResult,
): readonly Drift[] {
  const rows: Drift[] = [];
  const compare = (label: string, a: number, b: number): void => {
    if (a !== b) rows.push({ label, posted: a, replayed: b });
  };
  compare('people who turned up', posted.arrived, replayed.arrived);
  compare('people carried', posted.carried, replayed.carried);
  compare('away inside a minute (%)', posted.minutePct, replayed.minutePct);
  compare('the longest wait (s)', posted.worstWaitS, replayed.worstWaitS);
  return rows;
}

/**
 * `null` when the replay reproduced the record, else the sentence the row shows instead of the
 * affordance.
 *
 * No first-person copy — § 14.1's rule holds on the refusal as firmly as on the header, and a
 * refusal is the surface most likely to slip into *your day* without anybody noticing.
 */
export function reproductionRefusalFor(
  posted: PostedResult,
  replayed: PostedResult,
): string | null {
  const drift = reproductionDrift(posted, replayed);
  if (drift.length === 0) return null;
  const clauses = drift.map(
    (row) => `${row.label} was filed as ${String(row.posted)} and replays as ${String(row.replayed)}`,
  );
  return (
    `this record no longer reproduces the result it was filed with — ${listOf(clauses)} — so it ` +
    'cannot be watched, because a replay that does not reproduce is a different run'
  );
}

/**
 * The server's own tolerance for *reproduced*, transcribed from
 * `packages/server/src/leaderboard/verify.ts#METRIC_EPSILON` — GitHub issue #337. Transcribed rather
 * than imported because `viz` may not depend on the server package, and it is a constant the test
 * beside this module pins against that source text so the two cannot drift. The server's argument
 * for it holds here unchanged: the engine is deterministic from its seed, so this is a floating-point
 * courtesy nine orders of magnitude below anything that could change a ranking, never a budget.
 */
export const CLAIM_EPSILON = 1e-9;

/**
 * The four figures a board row was ranked on, read off a replay — the same summary fields
 * `menu/client.ts#claimedMetricsOf` posts, so the check compares like with like.
 */
export function claimOf(recording: VizRecording): Omit<PostedClaim, 'legs'> {
  const summary = recording.summary;
  return {
    awtS: summary.meanWaitS,
    wt95S: summary.wait95S,
    ttdMeanS: summary.meanTimeToDestinationS,
    pctOverLongWait: summary.pctOverLongWait ?? Number.NaN,
    awtIsValid: summary.awtIsValid,
  };
}

/**
 * Every figure the replay disagrees with the board about, GitHub issue #337's arm of
 * {@link reproductionDrift}: the same list shape, over the server's four figures and its tolerance.
 */
export function claimDrift(claim: PostedClaim, replayed: Omit<PostedClaim, 'legs'>): readonly Drift[] {
  const rows: Drift[] = [];
  const compare = (label: string, a: number, b: number): void => {
    const agree = (Number.isNaN(a) && Number.isNaN(b)) || Math.abs(a - b) <= CLAIM_EPSILON;
    if (!agree) rows.push({ label, posted: a, replayed: b });
  };
  compare('the mean wait (s)', claim.awtS, replayed.awtS);
  compare('the 95th-percentile wait (s)', claim.wt95S, replayed.wt95S);
  compare('the mean time to destination (s)', claim.ttdMeanS, replayed.ttdMeanS);
  compare('the share waiting past the long-wait line (%)', claim.pctOverLongWait, replayed.pctOverLongWait);
  if (claim.awtIsValid !== replayed.awtIsValid) {
    rows.push({ label: 'whether the mean is quotable (1 yes, 0 no)', posted: Number(claim.awtIsValid), replayed: Number(replayed.awtIsValid) });
  }
  return rows;
}

/**
 * `null` when this device's replay reproduced what the board ranked, else the sentence the row
 * shows instead of the affordance. The server said this run reproduced on its machine; a refusal
 * here means this build's `data/` has moved since, which is the ordinary case for a posted run
 * rather than the exotic one, and the sentence says so rather than accusing anybody.
 */
export function claimRefusalFor(claim: PostedClaim, recording: VizRecording): string | null {
  const drift = claimDrift(claim, claimOf(recording));
  if (drift.length === 0) return null;
  const clauses = drift.map(
    (row) => `${row.label} was posted as ${String(row.posted)} and replays here as ${String(row.replayed)}`,
  );
  return (
    `this build does not reproduce the result the board ranked — ${listOf(clauses)} — so the run ` +
    'cannot be watched here. The server verified it against its own data; this build carries ' +
    'different data, and a replay that does not reproduce is a different run'
  );
}

/** `a`, `a and b`, `a, b and c`. `scope/runIdentity.ts`'s own list, for lists of any length. */
function listOf(items: readonly string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
}
