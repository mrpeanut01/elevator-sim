/**
 * **The one shipped day whose verdict turns on what the player does while watching it** — GitHub
 * issue **#576**, [§ D871](../../../../DECISIONS.md).
 *
 * ## What was wrong, in the words of the measurement that found it
 *
 * A playability assessor drove the built bundle across roughly forty sittings and scored `docs/43`
 * P1 game-play **4 of 10** against a bar of 8. Its verdict was one sentence: *no day's verdict
 * turns on what the player does while watching it.* Three measurements, three sides of one defect —
 * Today's scenario at Midtown Office missed under **13 of 13** arms, career day 1 cleared under
 * **5 of 5**, and a decision census at the shipped speed found **0 people standing for 282 s and
 * no prompt of any kind**. The figures moved in all three; the **verdict** did not.
 *
 * ## What this file is
 *
 * The existence proof the issue asks for, run rather than inspected: on **one shipped day**, at
 * **one pinned seed**, the as-built configuration is graded **missed** and a press a player can
 * reach mid-run is graded **cleared**. Both arms are simulated here, from the same seed and the
 * same plan, and the two verdict lines are quoted off the sheet a player actually reads
 * (`shift/report.ts#dayReportOf`) rather than off a goal predicate.
 *
 * The day is **Scenario 6, Crown Hotel, day 1** — `c7`, one of
 * `shift/firstSession.ts#ELIGIBLE_FIRST_CONTRACT_IDS`, so it is a tower *Today's scenario* itself
 * opens on. What makes it the one is `data/contract-ladder.json`'s `c7` row: car `D` of the main
 * bank is booked out of passenger service from a quarter to a half of the way through the shift.
 * That is `docs/33` DC-R1's own fabric substrate — *availability: a car out of service* — and it is
 * the event this day asks to be answered.
 *
 * ## The four things asserted, and why each one is needed
 *
 * 1. **The event reaches the run.** The building the kernel is handed carries the two service
 *    events, at the seconds the rung declares. Without this the rest of the file would be measuring
 *    a day that has no event in it.
 * 2. **Both directions.** As-built misses; *spread the cars* clears. Either half alone is the
 *    defect: a day nobody can clear is #578, and a day nobody can fail is career day 1.
 * 3. **The choice is not dominated.** *Park the cars in the lobby* — the other setting of the same
 *    control, and the one a player who has read about up-peak reaches for first — leaves the day
 *    **missed**. So the player is choosing rather than finding the switch, and the thing they are
 *    choosing on is this contract's own lesson: a hotel has no dominant direction, so sending the
 *    idle cars to the front door is the wrong verb.
 * 4. **The press moves the legs, not a window statistic.** `CLAUDE.md`'s standing requirement, in
 *    its own words: *move the control and require the run to change, compared on the legs*. A
 *    verdict that flipped while the legs were identical would mean the grader had moved, which is
 *    the one thing this lane was forbidden to do.
 *
 * And a fifth, which is the negative control the schema owes: a rung that declares **no** absence
 * produces the byte-identical run it produced before {@link ContractFabric.incidents} existed.
 *
 * ## No bar moved
 *
 * `shift/goals.ts#GOAL_BARS` is untouched by this work, and this file reads `goalsForDay` exactly
 * as every other surface does. The day moved; the mark did not. That is `CLAUDE.md`'s working
 * agreement and #576's own acceptance criterion, and the reason the two arms below are allowed to
 * mean anything at all.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import {
  isServiceModeEvent,
  parseBuilding,
  resolveBuilding,
  type RunInterventionConfig,
} from '@elevator-sim/core/browser';

import type { BrowserResources } from '../dev/data.js';
import { buildingConfigOf, shiftLengthForContract, shiftRunConfigOf } from '../dev/state.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import { observationsAt } from '../live/observations.js';
import { recordRun } from '../record/recordRun.js';
import { RESOURCES, baseState } from '../scope/probes.test-helper.js';

import { DEFAULT_STAGE_SIM_PER_REAL_S } from '../everyday/stageScreenModel.js';

import { contractById } from './contracts.js';
import { SHIFT_EVENTS } from './events.js';
import { goalsForDay } from './goals.js';
import { CONTRACT_LADDER, ladderRowFor, rungIncidents } from './ladder.js';
import { shiftObservationsOf } from './observations.js';
import { dayReportOf, type ShiftPlan } from './report.js';
import { openWeek } from './week.js';

/** The contract this file is about. Named once; every assertion below reads it from here. */
const CONTRACT_ID = 'c7';

/**
 * The pinned day — `docs/33` § 4.6's seed sequence at `n = 1`, `20 260 824 + 7 919`.
 *
 * A seed from the cell every contract figure in this repository is measured on rather than a round
 * number, so the day this file proves is one of the fifty the ladder's own miss rate was taken
 * over. `data/contract-ladder.json`'s `c7` note carries that rate and this seed's figures together.
 */
const PINNED_SEED = 20_268_743n;

/** A second pinned day, from the same sequence at `n = 7` — see the two-presses case. */
const SECOND_SEED = 20_316_257n;

/**
 * Crown Hotel, loaded — `probes.test-helper.ts` ships two buildings and this is not one of them.
 *
 * Derived from the contract rather than typed, `legibility.sweep.test.ts`'s idiom: a contract that
 * moves to another tower brings this file with it instead of leaving it resolving the old one.
 */
function resourcesWithTower(): BrowserResources {
  const contract = contractById(CONTRACT_ID);
  if (contract === undefined) throw new Error(`no contract ${CONTRACT_ID}`);
  const config = parseBuilding(
    JSON.parse(readFileSync(join(DATA_DIR, 'buildings', `${contract.buildingId}.json`), 'utf8')),
  );
  const resolved = resolveBuilding(config, RESOURCES.elevatorSpecs);
  return {
    ...RESOURCES,
    buildings: [...RESOURCES.buildings, resolved],
    entries: [...RESOURCES.entries, { file: `${contract.buildingId}.json`, config, resolved }],
  };
}

const RESOURCES_WITH_TOWER = resourcesWithTower();
const CONTRACT = contractById(CONTRACT_ID);
const SHIFT_LENGTH_S = shiftLengthForContract(CONTRACT_ID);

/**
 * The state the daily loop builds for this contract's day 1.
 *
 * `campaignEventId: 'ordinary'` for the reason `contractCurve.sweep.test.ts` uses it: the day's
 * *wrinkle* is a separate axis from the contract's own fabric, and a file about the rung must not
 * be measuring a drawn event. Everything else is `initialState`'s.
 */
function dayState(seed: bigint): Parameters<typeof shiftRunConfigOf>[1] {
  const base = baseState();
  if (CONTRACT === undefined) throw new Error(`no contract ${CONTRACT_ID}`);
  return {
    ...base,
    buildingId: CONTRACT.buildingId,
    dispatcherId: 'collective',
    shiftLengthS: SHIFT_LENGTH_S,
    campaignEventId: 'ordinary' as const,
    week: { ...base.week, contractId: CONTRACT_ID, day: 1 },
    seed,
  };
}

/** The stage's shipped opening speed — read, never retyped, so a rung move carries the census. */
const STAGE_SIM_PER_REAL_S = DEFAULT_STAGE_SIM_PER_REAL_S;

/** § 7.6's press, at the instant the player would give it: after the car has gone. */
const PRESS_AT_S = SHIFT_LENGTH_S * 0.28;

const PARK: RunInterventionConfig = { atS: PRESS_AT_S, change: { kind: 'park-cars-lobby' } };
const SPREAD: RunInterventionConfig = { atS: PRESS_AT_S, change: { kind: 'spread-cars' } };

interface Arm {
  readonly verdictLine: string;
  readonly worstWaitS: number;
  readonly legs: string;
}

/**
 * One arm: the day run under `interventions`, graded, and worded.
 *
 * The verdict comes off `dayReportOf` rather than off `readGoals`, deliberately. #576's acceptance
 * asks for *the two verdicts quoted*, and the thing a player is shown is a line of English on a
 * sheet; a boolean read from a goal fold would be this file asserting about its own arithmetic
 * instead of about the product.
 */
function armOf(seed: bigint, interventions: readonly RunInterventionConfig[]): Arm {
  const plan = shiftRunConfigOf(RESOURCES_WITH_TOWER, dayState(seed));
  const { recording } = recordRun(
    { ...plan.config, interventions },
    { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds },
  );
  const observations = shiftObservationsOf(observationsAt(recording, recording.endedAt));
  const shiftPlan: ShiftPlan = {
    shiftLengthS: SHIFT_LENGTH_S,
    windowStartS: null,
    patternId: 'building',
  };
  const report = dayReportOf({
    recording,
    observations,
    goals: goalsForDay(1),
    week: openWeek(CONTRACT_ID),
    contract: CONTRACT,
    event: SHIFT_EVENTS.ordinary,
    plan: shiftPlan,
    calendar: null,
    subject: { kind: 'week-day' },
  });
  return {
    verdictLine: report.verdictLine,
    worstWaitS: observations.worstWaitS,
    /*
     * The legs, never a window statistic — § D177's own words. Passenger, car and the second they
     * boarded is the same triple `scope/probes.test-helper.ts#legsOf` compares every control in
     * this repository on.
     */
    legs: JSON.stringify(
      recording.legs.map((leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1]),
    ),
  };
}

describe('Scenario 6 day 1 — the event the day asks to be answered', () => {
  it('books a car out part-way through the shift, and the kernel is handed it', () => {
    const rung = ladderRowFor(CONTRACT_ID);
    expect(rung?.fabric.incidents.length, 'the rung declares one absence').toBe(1);
    const declared = rungIncidents(rung)[0];
    expect(declared?.car).toEqual({ bankId: 'main', carId: 'D' });

    const events = (
      shiftRunConfigOf(RESOURCES_WITH_TOWER, dayState(PINNED_SEED)).config.building.serviceEvents ??
      []
    ).filter(isServiceModeEvent);
    /*
     * The seconds, not the fractions. `serviceEventsFor` multiplies by the run's own length, and
     * this is the assertion that the declaration and the run agree about *when* — a rung that said
     * a quarter of the way through a day the kernel ran for a different length would be the caption
     * defect `shift/events.ts` is written about.
     */
    expect(events.map((entry) => [entry.atS, entry.carId, entry.mode])).toEqual([
      [SHIFT_LENGTH_S * 0.25, 'D', 'out-of-service'],
      [SHIFT_LENGTH_S * 0.5, 'D', 'in-service'],
    ]);
    /* Mid-day, which is the whole point: not a car missing from the first frame. */
    expect(events[0]?.atS).toBeGreaterThan(0);
    expect(events[0]?.atS).toBeLessThan(SHIFT_LENGTH_S);
  });

  it('is the only rung that declares one, so the negative control is the other fifteen', () => {
    /*
     * Both directions. A field every row used would make the identity below untestable, and a field
     * no row used would make this whole file a description of nothing.
     */
    const declaring = CONTRACT_LADDER.rows
      .filter((row) => row.fabric.incidents.length > 0)
      .map((row) => row.contractId);
    expect(declaring).toEqual([CONTRACT_ID]);
    for (const row of CONTRACT_LADDER.rows) {
      if (row.contractId === CONTRACT_ID) continue;
      expect(rungIncidents(row), row.contractId).toEqual([]);
    }
  });
});

describe('the verdict turns on the press, in both directions, on one seed', () => {
  it('reads Shift missed with no press and Shift cleared when the cars are spread', () => {
    const asBuilt = armOf(PINNED_SEED, []);
    const spread = armOf(PINNED_SEED, [SPREAD]);

    /* The two verdicts, quoted — #576's acceptance criterion in as many words. */
    expect(asBuilt.verdictLine).toBe('Shift missed');
    expect(spread.verdictLine).toBe('Shift cleared');

    /*
     * And the goal that did the deciding, so a reader can see the day was decided on a wait rather
     * than on a technicality. The bar is `goalsForDay(1)`'s and is read, never written.
     */
    const bar = goalsForDay(1).find((goal) => goal.id === 'worst-wait')?.bar ?? 0;
    expect(bar).toBe(230);
    expect(asBuilt.worstWaitS).toBeGreaterThan(bar);
    expect(spread.worstWaitS).toBeLessThanOrEqual(bar);
  });

  it('changes the run on the legs, not a window statistic', () => {
    const asBuilt = armOf(PINNED_SEED, []);
    const spread = armOf(PINNED_SEED, [SPREAD]);
    expect(spread.legs).not.toBe(asBuilt.legs);
    /*
     * And the prefix is untouched, which is what makes the press a *decision taken at a moment*
     * rather than a different day: `core` schedules the change at `atS` and nothing that fired
     * before it can observe it (`sim/types.ts#SimulationConfig.interventions`). Compared on the
     * boardings that happened before the press.
     */
    const before = (arm: Arm): string =>
      JSON.stringify(
        (JSON.parse(arm.legs) as [string, string, number][]).filter(
          (leg) => leg[2] >= 0 && leg[2] < PRESS_AT_S,
        ),
      );
    expect(before(spread)).toBe(before(asBuilt));
  });

  it('is not dominated — the other parking verb leaves the day missed', () => {
    /*
     * The dominance check `docs/43` P1 asks for, at row scope. *Park the cars in the lobby* is the
     * press a player arriving from an up-peak tower reaches for first, it is one press away on the
     * same control, and on this day it does not work. A day with one button that always works is a
     * switch; this one is a choice.
     */
    expect(armOf(PINNED_SEED, [PARK]).verdictLine).toBe('Shift missed');
  });

  it('puts something in the 282 s of nothing — the census, re-taken at the shipped speed', () => {
    /*
     * `docs/43` P1's decision census, sampled the way the assessor sampled it: every 20 s of **wall
     * clock** at the stage's shipped opening rung, `everyday/stageScreenModel.ts`'s
     * `DEFAULT_STAGE_SIM_PER_REAL_S`. Its reading on career day 2 was *0 people standing for the
     * first 282 s, 1 at 302 s, no prompt of any kind*, and the number that matters is the
     * **longest** gap rather than the average — an average hides a five-minute stretch of watching.
     *
     * What is asserted is the shape rather than the exact counts: somebody is standing inside the
     * first minute of wall clock, and no stretch of this sitting goes two samples without anybody
     * standing anywhere. A crowd count is a property of one seed's traffic and would be a pinned
     * figure nobody could reproduce after a generator change; *how long the screen is empty* is the
     * thing the census is about.
     */
    const plan = shiftRunConfigOf(RESOURCES_WITH_TOWER, dayState(PINNED_SEED));
    const { recording } = recordRun(plan.config, {
      recordDecisions: false,
      outOfServiceCarIds: plan.outOfServiceCarIds,
    });
    const stepRealS = 20;
    let longestQuietRealS = 0;
    let quietSinceRealS = 0;
    let firstStandingRealS = Number.POSITIVE_INFINITY;
    for (let realS = 0; realS <= SHIFT_LENGTH_S / STAGE_SIM_PER_REAL_S; realS += stepRealS) {
      const standing = observationsAt(
        recording,
        Math.min(SHIFT_LENGTH_S, realS * STAGE_SIM_PER_REAL_S),
      ).waitingNow;
      if (standing === 0) continue;
      firstStandingRealS = Math.min(firstStandingRealS, realS);
      longestQuietRealS = Math.max(longestQuietRealS, realS - quietSinceRealS);
      quietSinceRealS = realS;
    }
    /*
     * Measured on this seed at this rung: somebody is standing at **40 s** of wall clock and the
     * longest stretch with nobody standing anywhere is **80 s** — against the assessor's 282 s with
     * no prompt at all. The bounds are loosened one sample either side of what was measured, which
     * is what makes this a ratchet rather than a transcription: a change that emptied the screen
     * for two and a half minutes would fail it, and one that moved a crowd by a sample would not.
     */
    expect(firstStandingRealS).toBeLessThanOrEqual(60);
    expect(longestQuietRealS).toBeLessThanOrEqual(100);

    /*
     * And the moment the day asks to be answered, in wall clock. The car leaves at a quarter of the
     * shift and comes back at a half, so at the shipped rung the two are 112.5 s and 225 s into a
     * 450 s sitting — which is what makes the longest gap between consequential moments a little
     * under two minutes rather than a whole sitting. Derived from the run's own instants, so it
     * moves when the rung moves.
     */
    const leavesRealS =
      (rungIncidents(ladderRowFor(CONTRACT_ID))[0]?.fromFraction ?? 0) *
      SHIFT_LENGTH_S /
      STAGE_SIM_PER_REAL_S;
    expect(leavesRealS).toBeCloseTo(112.5, 5);
    expect(SHIFT_LENGTH_S / STAGE_SIM_PER_REAL_S).toBe(450);
  });

  it('has more than one way through — a second seed where two distinct presses clear', () => {
    /*
     * #576's other half of the same criterion: *at least two distinct presses clear it, or one
     * clears it and one plausible alternative does not.* The case above is the second form on one
     * day; this is the first form on another, so neither parking verb is the answer to this
     * contract and the player is reading the building rather than remembering a rule.
     */
    expect(armOf(SECOND_SEED, []).verdictLine).toBe('Shift missed');
    expect(armOf(SECOND_SEED, [PARK]).verdictLine).toBe('Shift cleared');
    expect(armOf(SECOND_SEED, [SPREAD]).verdictLine).toBe('Shift cleared');
  });
});
