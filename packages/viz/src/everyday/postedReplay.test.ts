/**
 * **Verification by replay, driven along the whole chain rather than at one seam** — GitHub issue
 * #221's fifth acceptance criterion.
 *
 * The chain a posted run travels is: a state the shell holds → a run this build simulated →
 * `dev/state.ts#runSubmissionOf`'s wire body → `menu/client.ts#claimedMetricsOf`'s claim → a board
 * row → a replay **from the seed alone** → a comparison of the four ranked figures. Every link
 * below is the shipped one. Nothing here restates a construction that ships somewhere else, which
 * is the whole point: a test that built its own submission would prove that its own two halves
 * agree.
 *
 * ## What this test can and cannot claim, said plainly
 *
 * It replays on **this** side of the wire, with `watch/reproduce.ts`'s gate — the same gate
 * `everyday/host.ts#watchRun` runs when a player presses `Watch it` on a board row. It does **not**
 * run `packages/server`'s `verifySubmission`, and it could not: `menu/challenge.ts` states the
 * boundary in terms — *"`viz` must build and test with `packages/server` absent"* — so a viz test
 * importing the server would break the rule that keeps the browser bundle free of a socket and a
 * database. The server half is exercised where it lives, in
 * `packages/server/src/http/api.test.ts`, which posts an honest score and watches it ranked and
 * forges one and watches it refused.
 *
 * What crossing the two halves buys is the thing neither could see alone: **the submission this
 * shell builds is one a replay from its seed reproduces.** That is the failure mode
 * `scope/runIdentity.ts` names as the worst available here — a client that assembles the run
 * slightly differently spends this product's one accusation on a player who did nothing wrong — and
 * until `runSubmissionOf` was extracted from `dev/main.ts`'s boot closure no test could reach the
 * construction at all.
 *
 * ## The positive control is the second half, and it is not decoration
 *
 * A gate that accepted everything would pass the first case. So the same row with one figure moved
 * must be **refused**, and by the `does-not-reproduce` ground rather than by any other — otherwise
 * this file would be measuring a record it cannot read rather than a claim that does not hold.
 */

import { describe, expect, it } from 'vitest';

import { runSubmissionOf, shiftRunConfigOf } from '../dev/state.js';
import { claimedMetricsOf, type BoardEntry } from '../menu/client.js';
import { recordRun } from '../record/recordRun.js';
import { runIdentityIssues } from '../scope/runIdentity.js';
import { RESOURCES, baseState } from '../scope/probes.test-helper.js';
import { checkedRunForTest as checkedRun } from '../watch/gate.test-helper.js';
import { postedRunOf } from '../watch/posted.js';

/** Garden Apartments at 900 s — `scope/probes.test-helper.ts`'s own reason: small, and quick. */
const state = baseState();

/**
 * The run, built the way `dev/main.ts#runShift` builds it — `config` and `outOfServiceCarIds`
 * passed separately, which is the mistake `probes.test-helper.ts#legsOf` documents having made.
 */
const plan = shiftRunConfigOf(RESOURCES, state);
const recording = recordRun(plan.config, {
  recordDecisions: false,
  outOfServiceCarIds: plan.outOfServiceCarIds,
}).recording;

/**
 * The row the server would hold, from the two halves a client actually sends.
 *
 * `legs` is the one field a client never sends — the server reads it off its own replay
 * (`BoardEntry.legs`) — so it is taken here from the run this test simulated, which is what that
 * replay would have measured. `dataHash` is the server's digest and is not consulted by the gate.
 */
function rowFrom(measured: BoardEntry['measured']): BoardEntry {
  return {
    id: 'posted-under-test',
    displayName: 'A player',
    run: runSubmissionOf(RESOURCES, state),
    dataHash: 'not-consulted-by-the-replay-gate',
    measured,
    /*
     * `waitCount`, which is the field `packages/server/src/leaderboard/verify.ts` returns as `legs`
     * off its own replay (`summary.waiting.count`). It is not compared by the gate below — the
     * board ranks on four figures and `legs` is the denominator drawn beside them — so the value
     * matters for honesty rather than for the assertion, which is exactly why it is the right one
     * rather than a plausible number.
     */
    legs: recording.summary.waitCount,
    submittedAtMs: 0,
  };
}

describe('a run posted from the player-facing shell replays from its seed alone', () => {
  it('is a run this shell will post at all', () => {
    // The gate `postCurrentRun` asks before anything leaves. If this were non-empty the rest of the
    // file would be replaying a run the product refuses to send, which proves nothing about posting.
    expect(runIdentityIssues(state, RESOURCES, 'ranked')).toEqual([]);
  });

  it('produces a claim rather than an unmeasured share written as zero', () => {
    const claim = claimedMetricsOf(recording.summary);
    // `claimedMetricsOf` refuses rather than defaulting, because an unmeasured long-wait share sent
    // as `0` is a wrong claim and the server answers a wrong claim by refusing the run as a forgery.
    expect(claim.ok).toBe(true);
  });

  it('reproduces the four ranked figures when the row is replayed', () => {
    const claim = claimedMetricsOf(recording.summary);
    if (!claim.ok) throw new Error(claim.detail);
    const checked = checkedRun(
      postedRunOf(rowFrom(claim.claimed), 1, RESOURCES),
      RESOURCES,
      state,
      // `dev/main.ts`'s own `simulateRecord`, to the character.
      (config) => recordRun(config).recording,
    );
    expect(checked.run.blocked).toBeNull();
    expect(checked.recording).toBeDefined();
  });

  it('refuses the same row with one figure moved, on the reproduction ground', () => {
    const claim = claimedMetricsOf(recording.summary);
    if (!claim.ok) throw new Error(claim.detail);
    const forged = rowFrom({ ...claim.claimed, awtS: claim.claimed.awtS + 5 });
    const checked = checkedRun(
      postedRunOf(forged, 1, RESOURCES),
      RESOURCES,
      state,
      (config) => recordRun(config).recording,
    );
    expect(checked.run.blocked?.ground).toBe('does-not-reproduce');
    // The reason names the figure, so a player reading it learns what disagreed rather than that
    // something did — `watch/reproduce.ts#claimDrift`'s own contract.
    expect(checked.run.blocked?.reason).toContain('wait');
    expect(checked.recording).toBeUndefined();
  });
});
