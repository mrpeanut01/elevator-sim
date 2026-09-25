/**
 * **What a mid-run handover reaches, and what it does not** — GitHub issue **#565**, second
 * criterion, [§ D857](../../../../DECISIONS.md).
 *
 * The issue's charge is that `data/rush-house-runs.json` ranked *Predictive balanced* first at
 * **46:06** on Harbour Point while a player who picked that dispatcher got **39:24**, and that the
 * gap was narrated rather than measured. This file is the measurement. Four arms, one seed, one
 * building, compared on the legs — `CLAUDE.md`'s standing requirement, and the run is the whole of
 * what licenses the sentences `rushHouse.ts#RUSH_HOUSE_COPY.note` and
 * `rushScreenModel.ts#rushDrivingLine` now carry.
 *
 * | arm | what it is | held |
 * |---|---|---|
 * | A | `predictive-balanced` set **before** the run — the house's own path | **2 766 s** |
 * | C | `collective`, untouched — the naive line | **2 480 s** |
 * | B | `collective` with a `switch-dispatcher` to `predictive-balanced` at 0:00 | **2 364 s** |
 * | D | `collective`'s configuration carrying `predictive-balanced`'s **weight vector alone** | **2 364 s** |
 *
 * ## The three things this establishes, in the order they matter
 *
 * **A reproduces the board.** 2 766 s is `data/rush-house-runs.json`'s `harbour-point` /
 * `predictive-balanced` row to the second, reached from a fresh session through `withBuilding` →
 * `withDispatcher` → `rushPatchOf`, which is `EverydayHost.setDispatcher` followed by
 * `EverydayHost.startRush`. **The figure was reachable all along and no screen inside the rush
 * offered the route**, which is why the answer to #565's third criterion is a control on the rush's
 * own screen rather than a disclaimer under the table.
 *
 * **B is a different run from A, by four hundred and two seconds.** A handover at 0:00 is not a
 * configuration from 0:00, and it is not even the better of the two things a player could have
 * done: it lands 116 s *below* touching nothing. So a board row is not what a handover reaches, and
 * `RUSH_HOUSE_COPY.note` says so.
 *
 * **D says what the difference is, and it is not a mechanism offered in place of a run.** Arm D
 * runs `collective`'s whole configuration — its `noDirectionReversal` hard constraint, its
 * immediate assignment, its answer stage — with `predictive-balanced`'s weights substituted, and no
 * intervention at all. It is **bit-identical to B on the legs**. So the handover's effect is
 * exactly the weight substitution and exactly nothing else, which is what
 * `dispatch/policy.ts#adoptWeights` does and what `dispatch/selector.ts` § *Why only the weights
 * switch* argues it must do. That identity is asserted here rather than inferred from the two hold
 * moments agreeing, because two runs can agree on one scalar and differ everywhere else.
 *
 * **What is deliberately not claimed.** Nothing here says *why* the weights-only vector holds less
 * than either whole configuration, and no sentence this lane added says it either. One cell, one
 * seed, one building: `CLAUDE.md`'s seven-sites lesson, and § D256's refusal of a plausible
 * sentence in place of a measurement. What generalises is the **negative** — a handover is not the
 * object a house row measured — and that follows from the identity in arm D rather than from the
 * seconds.
 *
 * ## Cost, and why it is always-on
 *
 * Four rushes, about thirteen seconds cold. It is the always-on tier because the figures it pins
 * are drawn on two player surfaces: a build whose handover started adopting a whole profile would
 * make `RUSH_HOUSE_COPY.note`'s last clause false, and nothing else in the suite would notice.
 *
 * **That build is this one**, since [§ D1048](../../../../DECISIONS.md): the stage's press emits
 * `adopt-dispatcher`, and the note's last clause was rewritten on the same commit. The four arms above
 * stay as they were, because `switch-dispatcher` is kept for the records that carry it and must replay
 * exactly; the describe block at the foot adds the two arms the new press reaches.
 */

import { loadConfig } from '@elevator-sim/core';
import type { RunInterventionConfig } from '@elevator-sim/core/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import type { BrowserResources } from '../dev/data.js';
import { initialState, shiftRunConfigOf, withBuilding, withDispatcher } from '../dev/state.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import { recordRun } from '../record/recordRun.js';

import { RUSH_SEED, rushHoldAt, rushPatchOf } from './rush.js';
import { RUSH_HOUSE_TABLE } from './rushHouse.js';
import { browserResourcesFrom } from './rushHouse.test-helper.js';

/** The one cell #565 was found on. The assessor's three lines are all Harbour Point at this seed. */
const BUILDING = 'harbour-point';
const OPENING = 'collective';
const TARGET = 'predictive-balanced';

let resources: BrowserResources;

beforeAll(async () => {
  resources = browserResourcesFrom(await loadConfig(DATA_DIR));
}, 300_000);

interface Arm {
  readonly brokeAtS: number | null;
  /** Every leg the recording holds, as JSON — the identity two arms are compared on. */
  readonly legs: string;
}

/**
 * One rush, on the path a player's own takes — `rushHouse.test-helper.ts#measureRushHouseRun`'s
 * steps, with the two things this file varies.
 *
 * `weightsFrom` substitutes another shipped profile's **authored weight vector** into the resolved
 * configuration and changes nothing else, which is the one arm no player path produces and the one
 * that says what a handover is. It is a probe rather than a product state, and it is built here
 * rather than in the helper for that reason.
 */
function rush(
  dispatcherId: string,
  interventions: readonly RunInterventionConfig[] = [],
  weightsFrom?: string,
): Arm {
  const standing = withDispatcher(
    withBuilding(initialState(resources, RUSH_SEED), resources, BUILDING),
    resources,
    dispatcherId,
  );
  const patch = rushPatchOf(resources, standing);
  if (patch === undefined) throw new Error(`no shipped building "${BUILDING}"`);
  const plan = shiftRunConfigOf(resources, { ...standing, ...patch, interventions });
  const donor = resources.dispatcherProfiles.profiles.find((profile) => profile.id === weightsFrom);
  const config =
    donor === undefined
      ? plan.config
      : { ...plan.config, dispatcherProfile: { ...plan.config.dispatcherProfile, weights: donor.weights } };
  const { recording } = recordRun(config, {
    recordDecisions: false,
    outOfServiceCarIds: plan.outOfServiceCarIds,
  });
  const holdAt = rushHoldAt(recording);
  return {
    brokeAtS: holdAt === undefined ? null : holdAt - recording.startedAt,
    legs: JSON.stringify(recording.legs),
  };
}

describe('a rush dispatcher set before the run, against one handed over at 0:00', () => {
  let configured: Arm;
  let untouched: Arm;
  let handover: Arm;
  let weightsOnly: Arm;

  beforeAll(() => {
    const target = resources.dispatcherProfiles.profiles.find((profile) => profile.id === TARGET);
    if (target === undefined) throw new Error(`no shipped dispatcher "${TARGET}"`);
    configured = rush(TARGET);
    untouched = rush(OPENING);
    handover = rush(OPENING, [{ atS: 0, change: { kind: 'switch-dispatcher', profile: target } }]);
    weightsOnly = rush(OPENING, [], TARGET);
  }, 300_000);

  it('reproduces the house row a player is aiming at, from the player’s own setters', () => {
    const row = RUSH_HOUSE_TABLE.runs.find(
      (run) => run.buildingId === BUILDING && run.dispatcherId === TARGET,
    );
    expect(row?.brokeAtS).toBe(2766);
    expect(configured.brokeAtS).toBe(2766);
  });

  it('is not what a 0:00 handover reaches — the gap is measured, in both directions', () => {
    expect(untouched.brokeAtS).toBe(2480);
    expect(handover.brokeAtS).toBe(2364);
    // The shape the issue reports: the product's own advice, taken the only way the product
    // offered, cost 116 s against touching nothing and 402 s against the row it names.
    expect(handover.brokeAtS).toBeLessThan(untouched.brokeAtS ?? 0);
    expect(configured.legs).not.toBe(handover.legs);
  });

  it('is the weight vector and nothing else — bit-identical on the legs', () => {
    expect(weightsOnly.legs).toBe(handover.legs);
    expect(weightsOnly.brokeAtS).toBe(handover.brokeAtS);
    // And not vacuously: the opening configuration's own legs differ from both.
    expect(untouched.legs).not.toBe(handover.legs);
  });
});

/**
 * **The whole-dispatcher handover the stage presses since [§ D1048](../../../../DECISIONS.md)**, on the
 * same cell. `switch-dispatcher` above is kept because stored rounds carry it and it must replay as it
 * did; the player's press is `adopt-dispatcher` now, and this is what it reaches.
 *
 * | arm | what it is | held |
 * |---|---|---|
 * | E | `collective` with an `adopt-dispatcher` to `predictive-balanced` at 0:00 | **2 746 s** |
 * | F | `collective` with an `adopt-dispatcher` to `eta` at 0:00 | the `eta` house row, to the leg |
 *
 * Two arms. **E** hands the round to *Predictive balanced* at 0:00 as a whole dispatcher, and it is
 * neither the weights-only handover (arm B) nor the house row (arm A): its door timing and demand
 * forecast are built with the day and stay collective's, which is what the stage's note on that row
 * says. **F** hands the round to *Minimum estimated wait* at 0:00, a target with nothing a handover
 * leaves behind, and it is the run a player gets by picking that dispatcher before the rush — the
 * house row's own path — to the leg.
 */
describe('the whole-dispatcher handover on the rush — § D1048', () => {
  const RESIDUAL_FREE = 'eta';
  let configured: Arm;
  let weightsOnly: Arm;
  let adopted: Arm;
  let residualFreePicked: Arm;
  let residualFreeAdopted: Arm;

  beforeAll(() => {
    const byId = (id: string) => {
      const found = resources.dispatcherProfiles.profiles.find((profile) => profile.id === id);
      if (found === undefined) throw new Error(`no shipped dispatcher "${id}"`);
      return found;
    };
    configured = rush(TARGET);
    weightsOnly = rush(OPENING, [{ atS: 0, change: { kind: 'switch-dispatcher', profile: byId(TARGET) } }]);
    adopted = rush(OPENING, [{ atS: 0, change: { kind: 'adopt-dispatcher', profile: byId(TARGET) } }]);
    residualFreePicked = rush(RESIDUAL_FREE);
    residualFreeAdopted = rush(OPENING, [
      { atS: 0, change: { kind: 'adopt-dispatcher', profile: byId(RESIDUAL_FREE) } },
    ]);
  }, 300_000);

  it('E: carries more than the weights, and still not the house row — the note’s two halves', () => {
    expect(adopted.legs).not.toBe(weightsOnly.legs);
    expect(adopted.legs).not.toBe(configured.legs);
    expect(adopted.brokeAtS).toBe(ADOPTED_BROKE_AT_S);
  });

  it('F: a target with nothing left behind is the house row’s own path, to the leg', () => {
    expect(residualFreeAdopted.legs).toBe(residualFreePicked.legs);
    const row = RUSH_HOUSE_TABLE.runs.find(
      (run) => run.buildingId === BUILDING && run.dispatcherId === RESIDUAL_FREE,
    );
    expect(residualFreeAdopted.brokeAtS).toBe(row?.brokeAtS);
  });
});

/**
 * Arm E's hold moment, measured on this tree with the rest of this file's arms: **2 746 s**, beside
 * A's 2 766, C's 2 480 and B's 2 364. So the whole-dispatcher handover at 0:00 comes within twenty
 * seconds of the house row where the weights alone fell 402 short, and the twenty are the door timing
 * and forecast the note names. One cell and one seed; no mechanism for the size of either gap is
 * offered (§ D256).
 */
const ADOPTED_BROKE_AT_S = 2746;
