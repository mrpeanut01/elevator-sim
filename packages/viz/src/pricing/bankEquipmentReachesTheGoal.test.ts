/**
 * **The counterweight and the drive are priced, reach the run, and move the 80 kJ goal's verdict —
 * and move no leg** — GitHub issue **#431**, `DECISIONS.md` § D539.
 *
 * > *"Move the control and require the run to change, compared on the legs."*
 *
 * The owner's ruling of 2026-09-10 made both settings **energy-only**: they move `energyKJ`,
 * `workPerServedLegKJ` and the fifth goal's verdict, and never a leg. So the standing requirement is
 * stated here on the **goal verdict**, and the legs are compared for the opposite reason from every
 * other file of this kind: to prove they did *not* move. A control that changed a figure and the
 * legs as well would be a different product from the one ruled.
 *
 * ## The day, and why it is this one
 *
 * `st-jude-hospital` under `collective` at seed 20 284 581, which is § D468's own seed formula
 * (`20 260 824 + 7 919 n`) at `n = 3`. It was found by a probe over seven shipped buildings and four
 * seeds, recorded in the PR that introduced this file, as the day on which **both** levers flip the
 * verdict: as built it spends 88.4 kJ per ride delivered and misses the bar; a regenerative drive
 * brings it to 63.5, and a counterweight at 0.4 of rated load to 68.3. Pinning one day rather than
 * searching for one inside the test keeps the assertion a fact about a named run.
 *
 * ## Compared on the legs whole
 *
 * `JSON.stringify(recording.legs)` — every leg, every field — rather than
 * `tiersReachTheRun.test.ts`'s boarding key, because the claim here is the stronger one: nothing a
 * passenger experienced differs by a byte.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
  type BuildingConfig,
  type ResolvedBuilding,
} from '@elevator-sim/core/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import { emptyFixitState, toggleRepair } from '../fixit/engine.js';
import { fixitContextOf, parseFixitCases } from '../fixit/parse.js';
import { fixitRunPlanOf, type FixitResources } from '../fixit/run.js';
import type { FixitCase } from '../fixit/types.js';
import { observationsAt } from '../live/observations.js';
import { recordRun, type RecordedRun } from '../record/recordRun.js';
import { goalsForDay, readGoal } from '../shift/goals.js';
import { shiftObservationsOf } from '../shift/observations.js';

import { changesBought, pathsIn } from './repairPrice.js';
import { shippedPriceSchedule } from './schedule.test-helper.js';

const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));
const TIMEOUT_MS = 300_000;

/** The pinned day. See the header for how it was found. */
const GOAL_BUILDING = 'st-jude-hospital';
const GOAL_SEED = 20_284_581;
const GOAL_DISPATCHER = 'collective';

const dataFile = (name: string): unknown =>
  JSON.parse(readFileSync(join(DATA_DIR, name), 'utf8')) as unknown;

function resourcesFromDisk(): FixitResources {
  const elevatorSpecs = parseElevatorSpecs(dataFile('elevator-specs.json'));
  const trafficProfiles = parseTrafficProfiles(dataFile('traffic-profiles.json'));
  const trafficProfileIds = new Set(trafficProfiles.profiles.map((profile) => profile.id));
  const entries = readdirSync(join(DATA_DIR, 'buildings'))
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const config = parseBuilding(dataFile(join('buildings', name)), name);
      return {
        config,
        resolved: resolveBuilding(config, elevatorSpecs, { file: name, trafficProfileIds }),
      };
    });
  return {
    entries,
    elevatorSpecs,
    trafficProfiles,
    dispatcherProfiles: parseDispatcherProfiles(dataFile('dispatcher-profiles.json')),
    trafficProfileIds,
  };
}

let resources: FixitResources;

beforeAll(() => {
  resources = resourcesFromDisk();
});

/** The shipped building, with every bank's authored document extended by `fields`. */
function fitted(buildingId: string, fields: Readonly<Record<string, unknown>>): ResolvedBuilding {
  const entry = resources.entries.find((candidate) => candidate.config.id === buildingId);
  if (entry === undefined) throw new Error(`no shipped building "${buildingId}"`);
  const document = structuredClone(entry.config) as BuildingConfig;
  const banks = document.banks.map((bank) => ({ ...bank, ...fields }));
  const file = `${buildingId}.json`;
  return resolveBuilding(parseBuilding({ ...document, banks }, file), resources.elevatorSpecs, {
    file,
    trafficProfileIds: resources.trafficProfileIds,
  });
}

function day(building: ResolvedBuilding): RecordedRun {
  const dispatcherProfile = resources.dispatcherProfiles.profiles.find(
    (profile) => profile.id === GOAL_DISPATCHER,
  );
  if (dispatcherProfile === undefined) throw new Error(`no dispatcher "${GOAL_DISPATCHER}"`);
  return recordRun(
    {
      building,
      dispatcherProfile,
      trafficProfiles: resources.trafficProfiles,
      elevatorSpecs: resources.elevatorSpecs,
      seed: GOAL_SEED,
      onTimeout: 'report',
    },
    { recordDecisions: false },
  );
}

/** The fifth goal, read the way the rail reads it: observations at the run's end, then the bar. */
function energyVerdict(run: RecordedRun): ReturnType<typeof readGoal> {
  const goal = goalsForDay(1).find((candidate) => candidate.id === 'energy');
  if (goal === undefined) throw new Error('goalsForDay no longer carries the energy goal');
  return readGoal(goal, shiftObservationsOf(observationsAt(run.recording, run.recording.endedAt)));
}

const legsOf = (run: RecordedRun): string => JSON.stringify(run.recording.legs);

/* -------------------------------------------------------------------------- *
 * The verdict
 * -------------------------------------------------------------------------- */

describe('the 80 kJ goal’s verdict moves, and no leg does', () => {
  it('misses as built, and meets it with a regenerative drive on the same legs', () => {
    const shipped = resources.entries.find((entry) => entry.config.id === GOAL_BUILDING)?.resolved;
    if (shipped === undefined) throw new Error(`no shipped building "${GOAL_BUILDING}"`);
    const asBuilt = day(shipped);
    const regenerative = day(fitted(GOAL_BUILDING, { regenerativeDrive: true }));

    expect(energyVerdict(asBuilt).state).toBe('missed');
    expect(energyVerdict(regenerative).state).toBe('met');
    expect(legsOf(regenerative)).toBe(legsOf(asBuilt));
    expect(regenerative.recording.legs.length).toBeGreaterThan(0);
  }, TIMEOUT_MS);

  it('meets it with the counterweight at 0.4 of rated load, on the same legs', () => {
    const shipped = resources.entries.find((entry) => entry.config.id === GOAL_BUILDING)?.resolved;
    if (shipped === undefined) throw new Error(`no shipped building "${GOAL_BUILDING}"`);
    const asBuilt = day(shipped);
    const lighter = day(fitted(GOAL_BUILDING, { counterweightBalanceRatio: 0.4 }));

    expect(energyVerdict(lighter).state).toBe('met');
    expect(legsOf(lighter)).toBe(legsOf(asBuilt));
  }, TIMEOUT_MS);

  it('changes nothing at all when the defaults are declared explicitly', () => {
    const shipped = resources.entries.find((entry) => entry.config.id === GOAL_BUILDING)?.resolved;
    if (shipped === undefined) throw new Error(`no shipped building "${GOAL_BUILDING}"`);
    const asBuilt = day(shipped);
    const declared = day(
      fitted(GOAL_BUILDING, { counterweightBalanceRatio: 0.5, regenerativeDrive: false }),
    );

    expect(energyVerdict(declared)).toEqual(energyVerdict(asBuilt));
    expect(JSON.stringify(declared.recording.summary)).toBe(JSON.stringify(asBuilt.recording.summary));
    expect(legsOf(declared)).toBe(legsOf(asBuilt));
  }, TIMEOUT_MS);
});

/* -------------------------------------------------------------------------- *
 * The price, and the scenario editor's seam
 * -------------------------------------------------------------------------- */

const REGENERATIVE = { building: { bankEquipment: [{ bankIds: ['*'], set: { regenerativeDrive: true } }] } };
const REBALANCED = {
  building: { bankEquipment: [{ bankIds: ['*'], set: { counterweightBalanceRatio: 0.4 } }] },
};

describe('both settings are priced by the schedule at the equipment tier', () => {
  it('finds each row by the path its patch produces, and prices it above nothing', () => {
    expect(pathsIn(REGENERATIVE)).toEqual(['building.bankEquipment[].set.regenerativeDrive']);
    expect(pathsIn(REBALANCED)).toEqual(['building.bankEquipment[].set.counterweightBalanceRatio']);

    const drive = changesBought(shippedPriceSchedule(), REGENERATIVE);
    expect(drive.map((change) => change.id)).toEqual(['regenerative-drive']);
    expect(drive[0]?.tier).toBe('equipment');
    expect(drive[0]?.priceUnits).toBeGreaterThan(0);

    const counterweight = changesBought(shippedPriceSchedule(), REBALANCED);
    expect(counterweight.map((change) => change.id)).toEqual(['counterweight-rebalance']);
    expect(counterweight[0]?.tier).toBe('equipment');
    expect(counterweight[0]?.priceUnits).toBeGreaterThan(0);
  });
});

/**
 * One authored case on `midtown-office`, whose costly fix is the equipment under test. Built through
 * `parseFixitCases`, so the patch passes every refusal a shipped case does, including the one that
 * the patch's paths are priced.
 */
function caseWith(costlyFix: unknown): FixitCase {
  const raw = {
    version: 1,
    cases: [
      {
        id: 'machine-room',
        name: 'The bill for the machine room',
        buildingId: 'midtown-office',
        dispatcherProfileId: 'eta',
        run: { seed: '20260911', durationS: 900, arrivalRatePctPop5min: null },
        asBuilt: {
          note: 'The machines are as installed.',
          patch: { dispatcher: { idle: { parkingStrategy: 'lobby' } } },
        },
        complaint: {
          text: 'The building spends too much moving its cars.',
          complainer: 'facilities manager',
          measure: {
            kind: 'mean-wait',
            label: 'the wait for a car',
            thresholdS: 60,
            scope: { mode: 'origin', floorIds: ['G'] },
          },
        },
        symptom: 'the meter runs',
        figures: [
          { kind: 'complaint', label: 'The wait for a car', reading: 'bad' },
          { kind: 'scope-mean-wait', label: 'Mean wait', reading: 'mid' },
          { kind: 'scope-worst-wait', label: 'Worst wait', reading: 'mid' },
          { kind: 'rest-away-pct', label: 'The rest away inside a minute', reading: 'healthy' },
        ],
        diagnosis: {
          text: 'The machines brake their overhauling runs into a resistor.',
          reasoning: 'A non-regenerative drive charges both directions.',
        },
        budgetUnits: 16,
        repairs: [
          {
            id: 'r-diagnosed',
            role: 'diagnosed',
            name: 'Spread the fleet',
            effect: 'A setting.',
            patch: { dispatcher: { idle: { parkingStrategy: 'stay' } } },
          },
          {
            id: 'r-equipment',
            role: 'costly-fix',
            name: 'Refit the machine room',
            effect: 'Moves the energy figures; moves no passenger.',
            patch: costlyFix,
          },
          {
            id: 'r-cheap',
            role: 'cheap-fix',
            name: 'Trim the dwell',
            effect: 'Moves the mean a little.',
            patch: { building: { cars: [{ carIds: ['*'], set: { dwellHallCallS: 2.5 } }] } },
          },
          {
            id: 'r-shaft',
            role: 'new-shaft',
            name: 'A new shaft · beyond a repair budget',
            effect: 'A capital conversation with the owner.',
            patch: { building: { addCars: [{ bankId: 'main', copyCarId: 'A', id: 'ZZ' }] } },
          },
        ],
        result: { head: 'The meter slows.', body: 'The machines give some of it back.' },
      },
    ],
  };
  const parsed = parseFixitCases(
    raw,
    fixitContextOf({
      schedule: shippedPriceSchedule(),
      buildings: resources.entries.map((entry) => entry.resolved),
      trafficProfiles: resources.trafficProfiles,
      dispatcherProfiles: resources.dispatcherProfiles,
    }),
  );
  const entry = parsed.cases[0];
  if (entry === undefined) throw new Error('the authored case did not parse');
  return entry;
}

function arms(entry: FixitCase): { readonly without: RecordedRun; readonly with: RecordedRun } {
  const plan = fixitRunPlanOf(entry, emptyFixitState(), resources);
  const repaired = fixitRunPlanOf(
    entry,
    toggleRepair(entry, emptyFixitState(), 'r-equipment', shippedPriceSchedule()),
    resources,
  );
  return {
    without: recordRun(plan.asRepaired, { recordDecisions: false }),
    with: recordRun(repaired.asRepaired, { recordDecisions: false }),
  };
}

describe('a scenario repair reaches the run through fixit/run.ts (§ D219)', () => {
  it('writes the drive onto every bank, moves the energy, and moves no leg', () => {
    const both = arms(caseWith(REGENERATIVE));
    expect(legsOf(both.with)).toBe(legsOf(both.without));
    const before = both.without.recording.summary.energy.workKJ ?? Number.NaN;
    const after = both.with.recording.summary.energy.workKJ ?? Number.NaN;
    expect(after).toBeLessThan(before);
  }, TIMEOUT_MS);

  it('writes the counterweight onto every bank, moves the energy, and moves no leg', () => {
    const both = arms(caseWith(REBALANCED));
    expect(legsOf(both.with)).toBe(legsOf(both.without));
    expect(both.with.recording.summary.energy.workKJ).not.toBe(
      both.without.recording.summary.energy.workKJ,
    );
  }, TIMEOUT_MS);
});
