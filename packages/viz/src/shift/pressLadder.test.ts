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
 * ## Since wave AI the claim is made from the day's call, over a window — [§ D1029](../../../../DECISIONS.md)
 *
 * § D914 and § D974 proved each pin at one typed instant, `pressAtFraction`, and nothing asked what
 * happened a minute either side. The instant is now derived — `shift/pressCall.ts#pressCallOf`, the
 * one function the stage and the sweep call too — and every clause above is asked at the call, at
 * the far edge of the window the pin was admitted on, and at a point between: seven runs a pin, the
 * always-on half of `pressLadder.sweep.test.ts`'s call mode. A positive control runs the same check
 * on a crowd it is known to fail on, so a check that had stopped biting would say so here.
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
import {
  buildingConfigOf,
  shiftLengthForContract,
  shiftRunConfigOf,
  type ViewerState,
} from '../dev/state.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import { observationsAt } from '../live/observations.js';
import { recordRun } from '../record/recordRun.js';
import { RESOURCES } from '../scope/probes.test-helper.js';

import { AFTER_PRESS_ROW_ID, AFTER_PRESS_VERDICT_NOTE } from './afterPress.js';
import { contractDayState } from './contractDay.test-helper.js';
import { contractById, CONTRACTS } from './contracts.js';
import { pressCounterfactualOf } from './counterfactual.js';
import { runHorizonOf, scenarioHorizonFor, wholeDayFor, wholeDayRun } from './dayLength.js';
import { SHIFT_EVENTS } from './events.js';
import { goalsForDay, readGoals } from './goals.js';
import {
  admittedPressDayIds,
  CONTRACT_LADDER,
  ladderRowFor,
  pressDayFor,
  type ContractPressDay,
} from './ladder.js';
import { pressAt, pressDayArmOf, PRESS_DAY_RESOURCES } from './pressDay.test-helper.js';
import { PRESS_CALL_MIN_WINDOW_S } from './pressCall.js';
import { pressDayCallOf } from '../dev/state.js';
import { shiftObservationsOf } from './observations.js';
import { dayReportOf } from './report.js';
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

/**
 * **The two window fields a pinned day runs at** — GitHub issue #595, [§ D973](../../../../DECISIONS.md).
 *
 * `{}` for a pin measured on the contract's slice, and `wholeDayRun(day)` for one measured on the
 * whole authored day — which is `everyday/host.ts#startRun`'s own patch, so this file runs the day
 * the Scenario press runs rather than the thirty minutes § D914 measured on every tower. A pin
 * declaring `whole-day` on a building with no authored day is refused by `contractLadderIssues`
 * before it could reach here; this throws rather than quietly falling back to the slice.
 */
function horizonOver(contractId: string, press: ContractPressDay | undefined): Partial<ViewerState> {
  if (press === undefined || press.horizon === 'period') return {};
  const contract = contractById(contractId);
  const day = wholeDayFor(
    RESOURCES_WITH_TOWERS.trafficProfiles,
    buildingConfigOf(RESOURCES_WITH_TOWERS, [], contract?.buildingId ?? ''),
  );
  if (day === undefined) throw new Error(`${contractId} pins a whole day on a tower that has none`);
  return wholeDayRun(day);
}

/** Whether this day, under `dispatcherId`, misses at least one goal with no press at all. */
function missesAsBuilt(contractId: string, seed: bigint, dispatcherId: string): boolean {
  const contract = contractById(contractId);
  if (contract === undefined) throw new Error(`no contract ${contractId}`);
  /* The pair, built together — issue #584, § D961; see {@link armOf} for why it is not by hand. */
  const state = contractDayState(contractId, {
    seed,
    dispatcherId,
    over: horizonOver(contractId, pressDayFor(contractId)),
  });
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

const legsOf = (arm: { readonly legs: Arm['legs'] }): string => JSON.stringify(arm.legs);

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

  it('pins each day on the horizon the Scenario press runs its tower on — issue #595', () => {
    /*
     * GitHub issue #595, § D974. § D914 measured all seven pins on the contract's thirty-minute
     * slice, and `everyday/host.ts#startRun` runs five of those towers as whole authored days — so
     * five pins were true of a run no player could take. Asked of the building rather than of the
     * pin, in both directions: a pin on the wrong horizon fails here, and so does a tower whose
     * horizon moved under a pin that stayed.
     */
    for (const [contractId, press] of PINNED) {
      const contract = contractById(contractId);
      const horizon = scenarioHorizonFor(
        RESOURCES_WITH_TOWERS.trafficProfiles,
        buildingConfigOf(RESOURCES_WITH_TOWERS, [], contract?.buildingId ?? ''),
      );
      expect(press.horizon, contractId).toBe(horizon);
    }
    /* Non-vacuity: both horizons are pinned somewhere, so neither half of the check is idle. */
    expect(new Set(PINNED.map(([, press]) => press.horizon))).toEqual(new Set(['period', 'whole-day']));
  });

  it('admits exactly the pins whose call window meets the criterion, and refuses the rest by name', () => {
    /*
     * § D1029's admitted set is derived from the data, never typed — `admittedPressDayIds`. Both
     * directions: every admitted pin carries a call block at or over the floor and no refusal, and
     * every pinned row outside the set says why in its own words.
     */
    const admitted = admittedPressDayIds();
    expect(admitted.length, 'some pin is admitted, or nothing below checks a window').toBeGreaterThan(0);
    for (const [contractId, press] of PINNED) {
      if (admitted.includes(contractId)) {
        expect(press.refused, contractId).toBeUndefined();
        expect(press.call?.windowS ?? 0, contractId).toBeGreaterThanOrEqual(PRESS_CALL_MIN_WINDOW_S);
      } else {
        expect(press.refused?.trim().length ?? 0, `${contractId} is refused without a reason`).toBeGreaterThan(0);
      }
    }
  });

  for (const [contractId, press] of PINNED) {
    if (press.refused !== undefined || press.call === undefined) continue;
    const measured = press.call;
    describe(contractId, () => {
      const seed = BigInt(press.seedText);
      /*
       * The window's two edges and a grid point between them — § D1029's always-on half. The far
       * edge is the last tried moment the sweep found holding; the middle is the grid point nearest
       * the window's centre.
       */
      const middle = Math.round(measured.windowS / 2 / measured.stepS) * measured.stepS;
      const offsets = [0, middle, measured.windowS];

      it('misses as built, calls where the data says, and holds both halves across its window', () => {
        expect(ladderRowFor(contractId)?.fabric.incidents.length).toBeGreaterThan(0);

        const asBuilt = pressDayArmOf(contractId, seed, press.standingOrder, press.horizon, []);
        expect(asBuilt.verdictLine(), `${contractId} as built`).toBe('Shift missed');
        const call = asBuilt.call;
        expect(call, `${contractId} has a call`).toBeDefined();
        if (call === undefined) return;
        expect(call.rule, `${contractId}'s call rule`).toBe(measured.rule);
        /* The call falls while the car is away — `pressCallOf`'s own window, asked of the run. */
        expect(call.atS).toBeGreaterThanOrEqual(call.awayAtS);
        expect(call.atS).toBeLessThan(call.backAtS ?? asBuilt.recording.endedAt);

        for (const offset of offsets) {
          const atS = call.atS + offset;
          const cleared = pressDayArmOf(contractId, seed, press.standingOrder, press.horizon, pressAt(atS, press.clearedBy));
          const missed = pressDayArmOf(contractId, seed, press.standingOrder, press.horizon, pressAt(atS, press.missedBy));
          expect(cleared.verdictLine(), `${contractId} ${press.clearedBy} at +${String(offset)} s`).toBe('Shift cleared');
          expect(missed.verdictLine(), `${contractId} ${press.missedBy} at +${String(offset)} s`).toBe('Shift missed');
          if (offset !== 0) continue;
          /*
           * On the legs, never a window statistic — § D177's own words — and the prefix untouched:
           * `core` schedules the change at `atS`, so the press is a decision taken at a moment rather
           * than a different day. Asked at the call, where the stage stamps the answer.
           */
          expect(legsOf(cleared), `${contractId} cleared arm`).not.toBe(legsOf(asBuilt));
          expect(legsOf(missed), `${contractId} missed arm`).not.toBe(legsOf(asBuilt));
          const before = (arm: { readonly legs: Arm['legs'] }): string =>
            JSON.stringify(arm.legs.filter((leg) => leg[2] >= 0 && leg[2] < atS));
          expect(before(cleared), `${contractId} prefix`).toBe(before(asBuilt));
          expect(before(missed), `${contractId} prefix`).toBe(before(asBuilt));
        }
      }, 300_000);
    });
  }

  it('the check bites: on a crowd it is known to fail on, the call window does not hold', () => {
    /*
     * The positive control § D1029 asks for. Secure Tower's pin **before** wave AI — seed
     * 20 482 556, spread the cars, graded whole — was § D974's; its call falls at 10:51 and the
     * sweep found spread missing at every moment tried from it (`decide-ai` S2: *spread clears at
     * 3 of 121*). Run through the very function the admitted pins pass, it must fail, or the pins
     * above passing would say nothing.
     */
    const seed = 20_482_556n;
    const asBuilt = pressDayArmOf('c3', seed, 'collective', 'whole-day', []);
    expect(asBuilt.missed).toBe(true);
    const call = asBuilt.call;
    expect(call).toBeDefined();
    if (call === undefined) return;
    const cleared = pressDayArmOf('c3', seed, 'collective', 'whole-day', pressAt(call.atS, 'spread-cars'));
    const missed = pressDayArmOf('c3', seed, 'collective', 'whole-day', pressAt(call.atS, 'park-cars-lobby'));
    expect(!cleared.missed && missed.missed, 'the old c3 pin holds at its call').toBe(false);
  }, 120_000);

  it('the stage and the sweep name the same second, and the stage names none off the day as measured', () => {
    /*
     * One function, three callers — the ruling's first guard. The sweep's call is
     * `pressDay.test-helper.ts#pressDayArmOf`'s, over the run's own building; the stage's is
     * `dev/state.ts#pressDayCallOf`, which `everyday/host.ts#pressCallOnStage` answers with. Asked of
     * the same run they must be the same second, and the stage's must refuse a day that is not the
     * one measured: another driver, or a press before the call.
     */
    const [contractId] = admittedPressDayIds();
    const press = pressDayFor(contractId);
    expect(press, 'an admitted pin').toBeDefined();
    if (contractId === undefined || press === undefined) return;
    const seed = BigInt(press.seedText);
    const swept = pressDayArmOf(contractId, seed, press.standingOrder, press.horizon, []);
    const state = contractDayState(contractId, {
      seed,
      dispatcherId: press.standingOrder,
      over: horizonOver(contractId, press),
    });
    const onStage = pressDayCallOf(PRESS_DAY_RESOURCES, state, swept.recording);
    expect(onStage?.call.atS).toBe(swept.call?.atS);
    expect(onStage?.press.seedText).toBe(press.seedText);
    const other = RESOURCES_WITH_TOWERS.dispatcherProfiles.profiles.find((p) => p.id !== press.standingOrder);
    expect(
      pressDayCallOf(PRESS_DAY_RESOURCES, { ...state, dispatcherId: other?.id ?? 'eta' }, swept.recording),
    ).toBeUndefined();
    const early = (swept.call?.atS ?? 0) - 30;
    expect(
      pressDayCallOf(
        PRESS_DAY_RESOURCES,
        { ...state, interventions: pressAt(early, press.clearedBy) },
        swept.recording,
      ),
    ).toBeUndefined();
    /* And the answer at the call second is the day as measured. */
    expect(
      pressDayCallOf(
        PRESS_DAY_RESOURCES,
        { ...state, interventions: pressAt(swept.call?.atS ?? 0, press.clearedBy) },
        swept.recording,
      )?.call.atS,
    ).toBe(swept.call?.atS);
  }, 120_000);
});

describe('the paired row’s verdicts — three crowds of c7, one press', () => {
  const contractId = 'c7';
  const SPREAD_KIND = 'spread-cars';
  /*
   * § D982's own measurement, kept on its own footing. It was taken at the rung's press second as
   * it then was — 0.28 of the slice — under the standing order; § D1029 replaced that typed instant
   * with a derived call and may re-pin `c7` itself, and neither moves what this describe proves: the
   * row's words, over three crowds, at one press. So the second and the order are this file's.
   */
  const PAIR_AT_FRACTION = 0.28;
  const PAIR_ORDER = 'collective';

  function pairedRowOf(seed: bigint): string {
    const contract = contractById(contractId);
    if (contract === undefined) throw new Error('no c7');
    const atS = shiftLengthForContract(contractId) * PAIR_AT_FRACTION;
    const presses: readonly RunInterventionConfig[] = [
      { atS, change: { kind: SPREAD_KIND } as RunInterventionConfig['change'] },
    ];
    const state = contractDayState(contractId, { seed, dispatcherId: PAIR_ORDER });
    const plan = shiftRunConfigOf(RESOURCES_WITH_TOWERS, state);
    const run = (interventions: readonly RunInterventionConfig[]) =>
      recordRun(
        { ...plan.config, interventions },
        { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds },
      ).recording;
    const unpressed = run([]);
    const pressedRun = run(presses);
    const horizon = runHorizonOf(
      RESOURCES_WITH_TOWERS.trafficProfiles,
      buildingConfigOf(RESOURCES_WITH_TOWERS, state.savedBuildings, contract.buildingId),
      state,
    );
    const report = dayReportOf({
      recording: pressedRun,
      observations: shiftObservationsOf(observationsAt(pressedRun, pressedRun.endedAt)),
      goals: goalsForDay(1, horizon),
      week: openWeek(contractId),
      contract,
      event: SHIFT_EVENTS.ordinary,
      plan: { shiftLengthS: shiftLengthForContract(contractId), windowStartS: null, patternId: 'building' },
      calendar: null,
      subject: { kind: 'week-day' },
      interventions: presses,
      pressCounterfactual: pressCounterfactualOf(pressedRun, unpressed, presses),
    });
    const row = report.diagnosis.find((entry) => entry.id === AFTER_PRESS_ROW_ID);
    expect(row?.why, `seed ${seed.toString()} drew no paired row`).toContain('had also been run');
    return row?.why ?? '';
  }

  const THIS = 'this run reads';
  const OTHER = 'the run without that press, over its own whole day, reads';

  it('is about c7, a slice, whose standing order is the one it measured under', () => {
    expect(pressDayFor(contractId)?.horizon).toBe('period');
    expect(pressDayFor(contractId)?.standingOrder).toBe(PAIR_ORDER);
  });

  it('clears a missed day: 20 268 743 reads cleared, and the run without it missed on the worst wait', () => {
    const why = pairedRowOf(20_268_743n);
    expect(why).toContain(`${THIS} Shift cleared;`);
    expect(why).toContain(`${OTHER} Shift missed on the worst-wait goal.`);
    expect(why).toContain(AFTER_PRESS_VERDICT_NOTE);
  }, 60_000);

  it('misses a cleared day: 20 442 961 reads missed, and the run without it cleared — as plainly', () => {
    const why = pairedRowOf(20_442_961n);
    expect(why).toContain(`${THIS} Shift missed on the worst-wait goal;`);
    expect(why).toContain(`${OTHER} Shift cleared.`);
    expect(why).toContain(AFTER_PRESS_VERDICT_NOTE);
  }, 60_000);

  it('agrees: 20 260 824 reads cleared twice, and nothing connects the two', () => {
    const why = pairedRowOf(20_260_824n);
    expect(why).toContain(`${THIS} Shift cleared;`);
    expect(why).toContain(`${OTHER} Shift cleared.`);
    for (const word of ['still', 'either way', 'anyway', 'same verdict', 'would']) {
      expect(new RegExp(`\\b${word}\\b`, 'iu').test(why), word).toBe(false);
    }
  }, 60_000);
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

  it('never lists the standing order — and the per-pin case above runs the day it misses on', () => {
    /*
     * The declaration's half. The run's half — the standing order misses as built — is the first
     * clause of each admitted pin's case above, so it is not run twice (§ D1029 moved it there).
     */
    for (const [contractId, press] of PINNED) {
      expect(press.mootUnder, contractId).not.toContain(press.standingOrder);
    }
  });

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
