/**
 * **Every shipped day whose verdict turns on a press, proved by running it** — GitHub issue
 * **#587**, [§ D914](../../../../DECISIONS.md).
 *
 * ## What this is, and why it is not `pressDecidesTheDay.test.ts` grown by six
 *
 * [§ D871](../../../../DECISIONS.md) built **one** such day and pinned it in that file, which also
 * takes a decision census and asserts the seconds the rung's two service events land at. That file
 * is about Crown Hotel. This one is about the **ladder**: for every rung that pins a
 * {@link ContractPressDay}, it runs the pinned day three ways under the contract's own standing
 * order and asserts the claim the data makes.
 *
 * Six things, and each is a clause of the claim rather than a variation on it:
 *
 * 1. **As built, the standing order misses.** A day nobody can fail is career day 1, which is the
 *    defect #576 was filed about.
 * 2. **The named press clears it.** A day nobody can clear is #578's.
 * 3. **The other parking verb still misses.** The two-sided half — *a day where every press clears
 *    is as bad as one where none does*. It is what makes the choice a choice rather than the player
 *    finding the switch, and it is why {@link ContractPressDay} carries `missedBy` as well as
 *    `clearedBy`.
 * 4. **The press moves the legs**, not a window statistic — `CLAUDE.md`'s standing requirement in
 *    its own words. A verdict that flipped while the legs were identical would mean the grader had
 *    moved, which this lane was forbidden to do.
 * 5. **The prefix before the press is identical**, so the press is a decision taken at a moment
 *    rather than a different day (`sim/types.ts#SimulationConfig.interventions`).
 * 6. **The rung books a car out.** The absence is the event the day asks to be answered; a pinned
 *    day on a rung that declares none would be a coincidence of the seed rather than a design.
 *
 * The verdicts are quoted off `shift/report.ts#dayReportOf` — the sheet a player reads — rather
 * than off a goal predicate, `pressDecidesTheDay.test.ts`'s own rule and for its reason.
 *
 * ## The census, and why only one contract's is re-derived here
 *
 * {@link ContractPressDay.mootUnder} is a measurement over **thirteen** dispatchers per pinned day.
 * Re-deriving all seven rows would be ninety-one day-long simulations in the always-on tier, which
 * is a compute job rather than a check — `contractCurve.sweep.test.ts`'s own reason for living
 * behind an environment variable. So `shift/pressLadder.sweep.test.ts` is the instrument that
 * produces all seven, and this file re-derives **one row in full** every run, plus the half of
 * every other row that costs one simulation: the standing order misses, which is clause 1 above and
 * is the clause `mootUnder` would contradict if it were wrong about that contract.
 *
 * ## No bar moved
 *
 * `shift/goals.ts#GOAL_BARS` is untouched by this work and every arm below reads `goalsForDay`
 * exactly as every other surface does. The days moved; the mark did not.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parseBuilding, resolveBuilding, type RunInterventionConfig } from '@elevator-sim/core/browser';

import type { BrowserResources } from '../dev/data.js';
import { buildingConfigOf, shiftLengthForContract, shiftRunConfigOf } from '../dev/state.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import { observationsAt } from '../live/observations.js';
import { recordRun } from '../record/recordRun.js';
import { RESOURCES } from '../scope/probes.test-helper.js';

import { contractDayState } from './contractDay.test-helper.js';
import { contractById, CONTRACTS } from './contracts.js';
import { runHorizonOf } from './dayLength.js';
import { SHIFT_EVENTS } from './events.js';
import { goalsForDay, readGoals } from './goals.js';
import { CONTRACT_LADDER, ladderRowFor, pressDayFor, type ContractPressDay } from './ladder.js';
import { shiftObservationsOf } from './observations.js';
import { dayReportOf, type ShiftPlan } from './report.js';
import { openWeek } from './week.js';

/**
 * Every shipped building, not `probes.test-helper.ts`'s two — the ids derived from the contracts so
 * a contract that moves to another tower brings this file with it.
 */
function allBuildings(): BrowserResources {
  const ids = [...new Set(CONTRACTS.map((contract) => contract.buildingId))];
  const entries = ids.map((id) => {
    const config = parseBuilding(
      JSON.parse(readFileSync(join(DATA_DIR, 'buildings', `${id}.json`), 'utf8')),
    );
    return { file: `${id}.json`, config, resolved: resolveBuilding(config, RESOURCES.elevatorSpecs) };
  });
  return { ...RESOURCES, buildings: entries.map((entry) => entry.resolved), entries };
}

const RESOURCES_WITH_TOWERS = allBuildings();

/** The rungs that pin a day, read off the ladder — never a list written here. */
const PINNED: readonly (readonly [string, ContractPressDay])[] = CONTRACT_LADDER.rows.flatMap(
  (row) => (row.pressDay === undefined ? [] : [[row.contractId, row.pressDay] as const]),
);

interface Arm {
  readonly verdictLine: string;
  readonly worstWaitS: number;
  readonly legs: readonly (readonly [string, string, number])[];
}

/** One arm of one pinned day: the run, graded, and worded — `armOf`'s shape in the § D871 file. */
function armOf(
  contractId: string,
  seed: bigint,
  dispatcherId: string,
  interventions: readonly RunInterventionConfig[],
): Arm {
  const contract = contractById(contractId);
  if (contract === undefined) throw new Error(`no contract ${contractId}`);
  const shiftLengthS = shiftLengthForContract(contractId);
  /*
   * **The pair, built together** — GitHub issue #584, § D961, [§ D963](../../../../DECISIONS.md).
   *
   * This file used to build the state by hand — `{ ...baseState(), buildingId: contract.buildingId,
   * …, week: { ...base.week, contractId, day: 1 } }` — and, unlike the three sweeps #584 was filed
   * about, it *did* move the week, so the pair agreed and the rung reached the run. What it did not
   * have was the refusal: a state one edit away from the silent wrong answer, in the file whose
   * whole subject is a rung. `contractDayState` builds the same state and throws on a mismatched
   * pair, and the two were compared field for field over all seven pinned contracts before the
   * swap — deep-equal, same keys — so no verdict, leg or census below moved with it.
   *
   * The day's *wrinkle* is a separate axis from the contract's own fabric, and a file about the
   * rung must not be measuring a drawn event; the helper pins `campaignEventId: 'ordinary'` for
   * that reason, which is `contractCurve.sweep.test.ts`'s own idiom kept in one place.
   */
  const state = contractDayState(contractId, { seed, dispatcherId });
  const plan = shiftRunConfigOf(RESOURCES_WITH_TOWERS, state);
  const { recording } = recordRun(
    { ...plan.config, interventions },
    { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds },
  );
  const observations = shiftObservationsOf(observationsAt(recording, recording.endedAt));
  const horizon = runHorizonOf(
    RESOURCES_WITH_TOWERS.trafficProfiles,
    buildingConfigOf(RESOURCES_WITH_TOWERS, state.savedBuildings, contract.buildingId),
    state,
  );
  const plan_: ShiftPlan = { shiftLengthS, windowStartS: null, patternId: 'building' };
  const report = dayReportOf({
    recording,
    observations,
    goals: goalsForDay(1, horizon),
    week: openWeek(contractId),
    contract,
    event: SHIFT_EVENTS.ordinary,
    plan: plan_,
    calendar: null,
    subject: { kind: 'week-day' },
  });
  return {
    verdictLine: report.verdictLine,
    worstWaitS: observations.worstWaitS,
    /* Passenger, car and the second they boarded — `probes.test-helper.ts#legsOf`'s own triple. */
    legs: recording.legs.map(
      (leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1] as const,
    ),
  };
}

/** Whether this day, under `dispatcherId`, misses at least one goal with no press at all. */
function missesAsBuilt(contractId: string, seed: bigint, dispatcherId: string): boolean {
  const contract = contractById(contractId);
  if (contract === undefined) throw new Error(`no contract ${contractId}`);
  /* The pair, built together — issue #584, § D961; see {@link armOf} for why it is not by hand. */
  const state = contractDayState(contractId, { seed, dispatcherId });
  const plan = shiftRunConfigOf(RESOURCES_WITH_TOWERS, state);
  const { recording } = recordRun(plan.config, {
    recordDecisions: false,
    outOfServiceCarIds: plan.outOfServiceCarIds,
  });
  const observations = shiftObservationsOf(observationsAt(recording, recording.endedAt));
  const horizon = runHorizonOf(
    RESOURCES_WITH_TOWERS.trafficProfiles,
    buildingConfigOf(RESOURCES_WITH_TOWERS, state.savedBuildings, contract.buildingId),
    state,
  );
  return readGoals(goalsForDay(1, horizon), observations).some(
    (reading) => reading.state !== 'met',
  );
}

const legsOf = (arm: Arm): string => JSON.stringify(arm.legs);

describe('the press ladder — every pinned day, in both directions', () => {
  it('pins one on every rung that books a car out, and on no rung that does not', () => {
    /*
     * Both directions, and the count is derived rather than written: a rung that pins a day without
     * declaring an absence is a coincidence of the seed, and a rung that books a car out and pins
     * nothing is an absence nobody measured. `contractLadderIssues` refuses the first; this refuses
     * the second, which it cannot see because a rung is allowed to declare an absence for any
     * reason.
     */
    const booking = CONTRACT_LADDER.rows
      .filter((row) => row.fabric.incidents.length > 0)
      .map((row) => row.contractId);
    expect(PINNED.map(([contractId]) => contractId)).toEqual(booking);
    expect(PINNED.length, 'some rung pins a day, or this file checks nothing').toBeGreaterThan(0);
  });

  for (const [contractId, press] of PINNED) {
    describe(contractId, () => {
      const seed = BigInt(press.seedText);
      const atS = shiftLengthForContract(contractId) * press.pressAtFraction;
      const right: RunInterventionConfig = {
        atS,
        change: { kind: press.clearedBy } as RunInterventionConfig['change'],
      };
      const wrong: RunInterventionConfig = {
        atS,
        change: { kind: press.missedBy } as RunInterventionConfig['change'],
      };

      it('books a car out, misses as built, clears on one press and misses on the other', () => {
        expect(ladderRowFor(contractId)?.fabric.incidents.length).toBeGreaterThan(0);

        const asBuilt = armOf(contractId, seed, press.standingOrder, []);
        const cleared = armOf(contractId, seed, press.standingOrder, [right]);
        const missed = armOf(contractId, seed, press.standingOrder, [wrong]);

        expect(asBuilt.verdictLine, `${contractId} as built`).toBe('Shift missed');
        expect(cleared.verdictLine, `${contractId} under ${press.clearedBy}`).toBe('Shift cleared');
        expect(missed.verdictLine, `${contractId} under ${press.missedBy}`).toBe('Shift missed');

        /*
         * On the legs, never a window statistic — § D177's own words. Both presses move the run;
         * the one that clears is the one that moves it the right way, and a press that moved
         * nothing at all would be § D227's first polarity arriving on a pinned day.
         */
        expect(legsOf(cleared), `${contractId} cleared arm`).not.toBe(legsOf(asBuilt));
        expect(legsOf(missed), `${contractId} missed arm`).not.toBe(legsOf(asBuilt));

        /*
         * And the prefix is untouched: `core` schedules the change at `atS` and nothing that fired
         * before it can observe it, so the press is a decision taken at a moment rather than a
         * different day. Compared on the boardings that happened before the press.
         */
        const before = (arm: Arm): string =>
          JSON.stringify(arm.legs.filter((leg) => leg[2] >= 0 && leg[2] < atS));
        expect(before(cleared), `${contractId} prefix`).toBe(before(asBuilt));
        expect(before(missed), `${contractId} prefix`).toBe(before(asBuilt));
      });
    });
  }
});

describe('the moot-dispatcher census — what the brief tells the player before the run', () => {
  /**
   * The assessor's own sweep, kept as a check on one row.
   *
   * It found that § D871's day is cleared as built by **eight of thirteen** shipped dispatchers, so
   * a player who changes the standing order makes the day moot — and was told nothing. `mootUnder`
   * is that measurement per pinned day and `everyday/today.ts` draws it; this re-derives one row in
   * full on every run, so a profile that moved fails here rather than leaving a sentence on the
   * brief that had quietly stopped being true (§ D227's stale-refusal class).
   */
  it('reproduces one contract’s whole census from the run', () => {
    const [entry] = PINNED;
    expect(entry, 'some rung pins a day').toBeDefined();
    if (entry === undefined) return;
    const [contractId, press] = entry;
    const seed = BigInt(press.seedText);
    const cleared = RESOURCES_WITH_TOWERS.dispatcherProfiles.profiles
      .filter((profile) => !missesAsBuilt(contractId, seed, profile.id))
      .map((profile) => profile.id);
    expect(cleared, contractId).toEqual([...press.mootUnder]);
  }, 120_000);

  it('never lists the standing order, and the standing order misses on every pinned day', () => {
    for (const [contractId, press] of PINNED) {
      /* The declaration's half — `contractLadderIssues` refuses it too, checked here in the run. */
      expect(press.mootUnder, contractId).not.toContain(press.standingOrder);
      /* And the run's half: one simulation per pinned day, which is what makes it a check. */
      expect(missesAsBuilt(contractId, BigInt(press.seedText), press.standingOrder), contractId).toBe(
        true,
      );
    }
  }, 120_000);

  it('quotes a census that a player could act on — every named id is one they can select', () => {
    const shipped = new Set(
      RESOURCES_WITH_TOWERS.dispatcherProfiles.profiles.map((profile) => profile.id),
    );
    for (const [contractId, press] of PINNED) {
      for (const id of press.mootUnder) expect(shipped.has(id), `${contractId}/${id}`).toBe(true);
      expect(shipped.has(press.standingOrder), contractId).toBe(true);
    }
  });
});

describe('the nine contracts that carry no pinned day, and why', () => {
  /**
   * **The refusal, stated rather than left as an absence** — and it is a measurement.
   *
   * Sixteen contracts ship and seven carry a day whose verdict turns on a press. The other nine
   * were measured and **could not be made to**, on the shipped bars, which this lane was forbidden
   * to move:
   *
   * - **`c1` (Garden Apartments)** never misses at all. Over twenty seeds with one of its two cars
   *   booked out from a quarter of the shift **to the end**, the worst wait peaks at 136 s against
   *   a 230 s bar and every seed reads *Shift cleared*. The only lever left is the crowd, and `c1`'s
   *   own rung note refuses that pending a playtest — so a pinned day there would mean moving the
   *   mark, which is what `CLAUDE.md`'s working agreements forbid. It is `docs/33` § 4.7f's F1 in a
   *   new place rather than a new finding.
   * - **`c4`, `c5` and `c11`–`c16` (eight towers)** miss on **`queue` and `energy` together** on
   *   effectively every seed as built, and neither parking verb moves either past its bar: measured
   *   at twenty seeds on `c5`, 20 of 20 miss under all three arms. A day nobody can clear is #578,
   *   and pinning one would be authoring that defect eight more times.
   *
   * This case holds the **count** rather than the argument, so that authoring an eighth pinned day
   * fails it and the paragraph above gets revisited instead of quietly aging.
   */
  it('accounts for every contract — a pinned day or a place in this list', () => {
    const pinned = new Set(PINNED.map(([contractId]) => contractId));
    const without = CONTRACTS.filter((contract) => !pinned.has(contract.id)).map((c) => c.id);
    expect([...pinned].sort()).toEqual(['c10', 'c2', 'c3', 'c6', 'c7', 'c8', 'c9']);
    expect(without.sort()).toEqual(['c1', 'c11', 'c12', 'c13', 'c14', 'c15', 'c16', 'c4', 'c5']);
    expect(pinned.size + without.length).toBe(CONTRACTS.length);
  });

  it('draws no press day for a contract that has none', () => {
    for (const contract of CONTRACTS) {
      const has = pressDayFor(contract.id) !== undefined;
      expect(has, contract.id).toBe(PINNED.some(([id]) => id === contract.id));
    }
  });
});
