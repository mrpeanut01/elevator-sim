/**
 * **Phase 7's acceptance interval, produced at 50–200 replications, and reported either way.**
 *
 * docs/05-roadmap.md § Phase 7: *"Producing that number at 50–200 replications is Phase 8's job."*
 * This is the suite that does it, at n = 150 on Garden Apartments with disjoint seed sets.
 *
 * ## What is asserted and what is measured
 *
 * The **structure** is asserted, because it is what makes any number meaningful: the seed sets are
 * disjoint, the tuned parameter demonstrably reaches the dispatcher, the shipped 8 s deadband is
 * still on disk, and the front is decided over all three axes.
 *
 * The **verdict** is measured and pinned, not asserted with a hand-written expectation. It comes
 * back BETTER at this budget, and the pins are what stop that changing in silence — but a suite
 * that asserted `clears === true` would be a suite that goes red when a legitimate change to the
 * simulator moves an interval across zero, at which point somebody would have to decide whether to
 * weaken the assertion. `checkPinned` asks the better question: *which of the two numbers is
 * right?*
 *
 * The reason `holdoutRound.test.ts` gives for **not** gating on significance at n = 60 is the
 * reason this file exists rather than that one changing: *"significance at a budget a test suite
 * can afford is not reproducible"*. n = 150 is affordable here — 1.3 s, because Garden is six
 * floors and two cars — so the number is produced at a real budget and pinned, and the small suite
 * keeps its small budget.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadResources } from '../validation/harness.js';

import {
  PHASE7_DEADBANDS_S,
  PHASE7_HOLDOUT_SEED,
  PHASE7_REFERENCE_PROFILE,
  PHASE7_REPLICATIONS,
  PHASE7_TUNING_SEED,
  deadbandArmId,
  runPhase7Acceptance,
  type Phase7AcceptanceStudy,
} from './phase7Acceptance.js';
import { checkPinned, describeMismatches, phase7Figures } from './published.js';

let study: Phase7AcceptanceStudy | undefined;

async function studyOf(): Promise<Phase7AcceptanceStudy> {
  study ??= await runPhase7Acceptance({});
  return study;
}

beforeAll(async () => {
  await studyOf();
}, 300_000);

/* -------------------------------------------------------------------------- *
 * The preconditions — without these the number means nothing
 * -------------------------------------------------------------------------- */

describe('the criterion is measured under the conditions it names', () => {
  it('spends a budget inside CLAUDE.md\'s band, on two seed sets that share no seed', async () => {
    const result = await studyOf();
    expect(result.replications).toBe(PHASE7_REPLICATIONS);
    expect(result.replications).toBeGreaterThanOrEqual(50);
    expect(result.replications).toBeLessThanOrEqual(200);
    expect(PHASE7_TUNING_SEED).not.toBe(PHASE7_HOLDOUT_SEED);
    // Checked on the **realized** seeds by `buildTuningReport`, which is the check that survives a
    // change to the seed derivation. A "holdout" run at the tuning seed is the tuning set under a
    // second name, with every verdict vacuous.
    expect(result.disjoint, 'the two seed sets overlap; every holdout verdict would be vacuous').toBe(
      true,
    );
    expect(result.round.report.seedSets.sharedSeeds).toEqual([]);
  });

  it('leaves the deliberately-wrong shipped deadband on disk', async () => {
    // docs/06 and CLAUDE.md both forbid hand-editing this to the measured optimum: it is the only
    // known-answer test in the repository whose answer predates the machinery that finds it. The
    // candidates below are in-memory derived profiles, which is what a tuner produces.
    const config = await loadResources();
    const shipped = config.dispatcherProfilesById.get(PHASE7_REFERENCE_PROFILE);
    expect(shipped?.idle?.repositionThresholdS).toBe(8);
  });

  it('drives the tuned parameter all the way to the dispatcher', async () => {
    const result = await studyOf();
    // The liveness half. A candidate whose parameter never reached the dispatcher produces a run
    // bit-identical to the reference, and `IDENTICAL` is exactly how that presents — 150 of 150
    // paired differences exactly zero. The 2 s arm must not be that.
    const tuned = result.holdout.get(`${deadbandArmId(2)}/awt`);
    expect(tuned).toBeDefined();
    expect(tuned?.verdict).not.toBe('IDENTICAL');
    expect(tuned?.exactZeroPairs).toBeLessThan(tuned?.pairs ?? 0);
  });

  it('decides both fronts over all three axes, energy included', async () => {
    const result = await studyOf();
    // The reason this measurement is worth more than the n = 60 one it replaces. When Phase 7 was
    // accepted, `energy` was in `inactiveObjectiveIds` on every report — the axis was not merely
    // unreported, it was unmeasurable, and `runHoldoutRound`'s `energyProxyOf` had nothing honest
    // to be passed. It has now.
    expect(result.round.report.front.inactiveObjectiveIds).toEqual([]);
    expect(result.round.report.front.activeObjectiveIds).toEqual(['awt', 'energy', 'wt95']);
    expect(result.round.report.holdoutFront?.inactiveObjectiveIds).toEqual([]);
    expect(result.round.report.holdoutFront?.activeObjectiveIds).toEqual(['awt', 'energy', 'wt95']);
  });
});

/* -------------------------------------------------------------------------- *
 * The negative control
 * -------------------------------------------------------------------------- */

describe('the 5 s arm is the plateau control and behaves like one', () => {
  it('leaves most replications bit-identical however large the budget', async () => {
    const result = await studyOf();
    const control = result.holdout.get(`${deadbandArmId(5)}/awt`);
    expect(control).toBeDefined();
    // docs/03 § *Measured: flat plateaus, not noise*: the deadband only matters on a run where some
    // reposition decision falls between the two values, so stepping 8 -> 5 leaves the majority of
    // replications exactly unchanged. An optimizer taking small steps here stalls, and that is a
    // property of the objective rather than of the budget — which is why a bigger `n` does not
    // convert this arm into a win.
    expect((control?.exactZeroPairs ?? 0) / (control?.pairs ?? 1)).toBeGreaterThan(0.5);
  });
});

/* -------------------------------------------------------------------------- *
 * The measurement
 * -------------------------------------------------------------------------- */

describe('Phase 7\'s acceptance interval at a real budget', () => {
  it('reports the verdict, the gain and the cost — measured, pinned, and printed either way', async () => {
    const result = await studyOf();
    const lines: string[] = [
      `Phase 7 acceptance, n = ${String(result.replications)}, Garden Apartments, seed sets DISJOINT` +
        ` (${PHASE7_TUNING_SEED} / ${PHASE7_HOLDOUT_SEED})`,
      `  criterion clears: ${String(result.clears)}` +
        (result.clears ? ` via ${result.clearingCandidates.join(', ')}` : ''),
    ];
    for (const thresholdS of PHASE7_DEADBANDS_S) {
      const armId = deadbandArmId(thresholdS);
      for (const objectiveId of ['awt', 'energy', 'wt95']) {
        for (const [role, source] of [
          ['tuning', result.tuning],
          ['holdout', result.holdout],
        ] as const) {
          const interval = source.get(`${armId}/${objectiveId}`);
          if (interval === undefined) continue;
          const estimate = interval.estimate;
          lines.push(
            `  ${role.padEnd(8)} ${armId.padEnd(18)} ${objectiveId.padEnd(7)} ${interval.verdict.padEnd(19)}` +
              (estimate === undefined
                ? ' (no supportable interval)'
                : ` ${estimate.mean.toFixed(3)} [${estimate.lower.toFixed(3)}, ${estimate.upper.toFixed(3)}]` +
                  ` n=${String(estimate.n)} zeros=${String(interval.exactZeroPairs)}/${String(interval.pairs)}`),
          );
        }
      }
    }
    console.log(lines.join('\n'));

    // Every arm produced an interval on every axis: an absent one would make "clears: false" mean
    // "was not measured" rather than "was measured and did not clear".
    for (const thresholdS of PHASE7_DEADBANDS_S) {
      for (const objectiveId of ['awt', 'energy', 'wt95']) {
        expect(
          result.holdout.get(`${deadbandArmId(thresholdS)}/${objectiveId}`)?.estimate,
          `${deadbandArmId(thresholdS)}/${objectiveId} has no holdout interval`,
        ).toBeDefined();
      }
    }
  });

  it('matches the pin table in both directions, on both seed sets', async () => {
    const mismatches = checkPinned('phase7-acceptance', phase7Figures(await studyOf()));
    expect(
      describeMismatches('phase7-acceptance', mismatches),
      describeMismatches('phase7-acceptance', mismatches),
    ).toBe('');
  });
});
