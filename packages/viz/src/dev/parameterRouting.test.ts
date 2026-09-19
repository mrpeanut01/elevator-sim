/**
 * **Move the control and require the run to change, compared on the legs** — § D177's standing
 * requirement, pointed at the three schemas the Parameters tab began applying in wave AD
 * (§ D761–§ D764).
 *
 * ## Why this file exists beside `scope/scope.test.ts`
 *
 * `scope.test.ts` asks the question once per `ViewerState` field: *does writing
 * `viewer.paramDemand` move a leg?* That is the right gate and it is deliberately not restated
 * here. What it cannot ask is the question the screen's own sentence makes: `appliedNoteFor`
 * tells the player that **eight** traffic rows, **three** crowding rows and **four** runner rows
 * reach the next shift. A field-level probe is satisfied by one of the eight working, and the
 * other seven could be dead while the gate stayed green — which is precisely the shape
 * `DECISIONS.md` § D227 calls the more dangerous half of this defect class, arriving from the
 * side nobody watches: not a refusal that has gone stale, but a *promise* that was never true.
 *
 * So this file is the per-id form. One row per routed parameter, each run on a building where the
 * thing it changes can happen, each compared on the legs.
 *
 * ## The buildings are chosen by measurement, and the table records what it found
 *
 * Four of the routed ids are silent on Garden Apartments and Midtown Office and loud on
 * `secure-tower` and `vertical-city`, and that is a fact about the buildings rather than about
 * the wire: `traffic.maxLegs` needs a journey with more than one leg, `sim.transferWalkS` needs a
 * sky lobby to walk across, `traffic.credentialAssignment` needs a tower that declares access
 * zones, and `traffic.interfloorWeighting` needs floors whose populations differ from uniform in
 * a way the interfloor share can see. `traffic.lunchTwoWay.mixAmplitude` needs the template it is
 * gated on. A probe run on a cell where the thing it probes cannot happen reports a live control
 * dead — `scope/probes.test-helper.ts` learned that on `viewer.outOfServiceCarIds` and the lesson
 * is kept here rather than rediscovered.
 *
 * ## What is deliberately absent
 *
 * `sim.queueSampleCount` has no row. It is the one `SIM_PARAMETERS` parameter that is **not**
 * routed, and the measurement behind that refusal is in {@link RunnerTunables}' docstring: it
 * moves the saturation verdict without moving a leg, which is charter non-goal 6. A row here
 * asserting it moves nothing would read as a defect; the refusal belongs where the decision is.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
} from '@elevator-sim/core/browser';

import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import { recordRun } from '../record/recordRun.js';

import type { BrowserResources } from './data.js';
import { initialState, shiftRunConfigOf, type ViewerState } from './state.js';

const DATA = new URL('../../../../data/', import.meta.url);
const read = (path: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, DATA)), 'utf8')) as unknown;

/**
 * Four buildings, not seventeen, and each is here for a routed id that is quiet everywhere else.
 *
 * `scope/probes.test-helper.ts` bounds itself to two for the same reason this bounds itself to
 * four: the walk simulates, because comparing on the legs is the only comparison § D177 accepts.
 */
const BUILDING_IDS = ['garden-apartments', 'midtown-office', 'secure-tower', 'vertical-city'] as const;

function resourcesOf(): BrowserResources {
  const elevatorSpecs = parseElevatorSpecs(read('elevator-specs.json'));
  const entries = BUILDING_IDS.map((id) => {
    const config = parseBuilding(read(`buildings/${id}.json`));
    return { file: `${id}.json`, config, resolved: resolveBuilding(config, elevatorSpecs) };
  });
  const trafficProfiles = parseTrafficProfiles(read('traffic-profiles.json'));
  return {
    priceSchedule: shippedPriceSchedule(),
    elevatorSpecs,
    trafficProfiles,
    dispatcherProfiles: parseDispatcherProfiles(read('dispatcher-profiles.json')),
    buildings: entries.map((entry) => entry.resolved),
    entries,
    trafficProfileIds: new Set(trafficProfiles.profiles.map((profile) => profile.id)),
    warnings: [],
  };
}

const RESOURCES = resourcesOf();

/**
 * The legs of the run a state produces, as a comparable string — `scope/probes.test-helper.ts`'s
 * `legsOf`, built the same way and for its stated reason.
 *
 * Legs, never a window statistic: *a mean can be unchanged for a run that is entirely different,
 * and a mean can move because the window moved.* And through `shiftRunConfigOf` plus `recordRun`
 * rather than a hand-built `SimulationConfig`, because an instrument that does not reproduce the
 * shipped call path measures the instrument.
 */
function legsOf(state: ViewerState): string {
  const plan = shiftRunConfigOf(RESOURCES, state);
  return JSON.stringify(
    recordRun(plan.config, {
      recordDecisions: false,
      outOfServiceCarIds: plan.outOfServiceCarIds,
    }).recording.legs.map((leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1]),
  );
}

function stateOn(buildingId: string, template?: string): ViewerState {
  const base: ViewerState = {
    ...initialState(RESOURCES, 20_260_804n),
    buildingId,
    shiftLengthS: 1800,
  };
  return template === undefined
    ? base
    : { ...base, playMode: 'free-play', freePlay: { demandTemplateId: template, arrivalRatePctPop5min: null } };
}

/** One routed parameter, the cell it bites on, and the state that moves it. */
interface RoutedCase {
  /** The declared id the player moves on the Parameters tab. */
  readonly id: string;
  /** A building where the thing this parameter changes can happen. */
  readonly buildingId: (typeof BUILDING_IDS)[number];
  /** The demand template, where the row is gated on one. */
  readonly template?: string;
  /** What the control writes into the state. */
  readonly moved: (state: ViewerState) => ViewerState;
  /** Why this cell, in one line — the measured reason, never a preference. */
  readonly because: string;
}

const TRAFFIC_CASES: readonly RoutedCase[] = [
  {
    id: 'traffic.demandLevel',
    buildingId: 'garden-apartments',
    moved: (s) => ({ ...s, paramDemand: { demandLevel: 'max' } }),
    because: 'every profile declares a rate range, so the top of it is reachable on any building',
  },
  {
    id: 'traffic.batchSharesDestination',
    buildingId: 'midtown-office',
    moved: (s) => ({ ...s, paramDemand: { batchSharesDestination: true } }),
    because:
      'a group has to be bigger than one before sharing a destination can mean anything, and the ' +
      'residential trickle at Garden Apartments is silent on it',
  },
  {
    id: 'traffic.interfloorWeighting',
    buildingId: 'vertical-city',
    moved: (s) => ({ ...s, paramDemand: { interfloorWeighting: 'uniform' } }),
    because:
      'uniform differs from population only where the candidate floors differ in population, and ' +
      'it is byte-identical on both of the two small towers',
  },
  {
    id: 'traffic.credentialAssignment',
    buildingId: 'secure-tower',
    moved: (s) => ({ ...s, paramDemand: { credentialAssignment: 'none' } }),
    because: 'it is read only where a building declares accessZones, which one shipped tower does',
  },
  {
    id: 'traffic.maxLegs',
    buildingId: 'vertical-city',
    moved: (s) => ({ ...s, paramDemand: { maxLegs: 1 } }),
    because: 'a leg ceiling can only bite on a journey that has more than one leg — a sky lobby',
  },
  {
    id: 'traffic.riseAndFall.peakWindowS',
    buildingId: 'garden-apartments',
    moved: (s) => ({ ...s, paramDemand: { peakWindowS: 600 } }),
    because: 'rise-and-fall is the default template, so the peak hold is reachable anywhere',
  },
  {
    id: 'traffic.riseAndFall.baselineFraction',
    buildingId: 'garden-apartments',
    moved: (s) => ({ ...s, paramDemand: { baselineFraction: 0.5 } }),
    because: 'the same template, one knob over',
  },
  {
    id: 'traffic.lunchTwoWay.mixAmplitude',
    buildingId: 'midtown-office',
    template: 'lunch-two-way',
    moved: (s) => ({ ...s, paramDemand: { mixAmplitude: 0 } }),
    because:
      'the row is activeWhen the lunch-two-way template, and it is the negative control § D162 ' +
      'condition 5 requires beside any result measured under a varying mix',
  },
];

const CROWDING_CASES: readonly RoutedCase[] = [
  {
    id: 'sim.lobbyCrowding.*',
    buildingId: 'midtown-office',
    moved: (s) => ({
      ...s,
      lobbyCrowding: { thresholdPersons: 4, factorPerPerson: 0.06, maxFactor: 3 },
    }),
    because:
      'the term is a landing-occupancy feedback loop and needs a landing that fills; four cars ' +
      'and 1 710 people produce one and two hydraulic cars at a trickle do not',
  },
];

const RUNNER_CASES: readonly RoutedCase[] = [
  {
    id: 'sim.transferWalkS',
    buildingId: 'vertical-city',
    moved: (s) => ({ ...s, runnerTunables: { transferWalkS: 90 } }),
    because: 'there has to be a sky lobby to walk across',
  },
  {
    id: 'sim.dispatchRetryS',
    buildingId: 'midtown-office',
    moved: (s) => ({ ...s, runnerTunables: { dispatchRetryS: 20 } }),
    because:
      'a call no car could take has to happen before the re-offer interval matters, which needs ' +
      'a building busy enough to run out of cars',
  },
  {
    id: 'sim.drainGraceS',
    buildingId: 'midtown-office',
    moved: (s) => ({ ...s, runnerTunables: { drainGraceS: 5 } }),
    because:
      'the grace can only bite on a run that is still delivering when demand ends, which three ' +
      'of the shipped buildings routinely are and Garden Apartments is not',
  },
  {
    id: 'sim.doorObstructionProbability',
    buildingId: 'midtown-office',
    moved: (s) => ({ ...s, runnerTunables: { doorObstructionProbability: 0.3 } }),
    because:
      'zero consumes no draws at all, so a non-zero probability needs enough door closes for the ' +
      'photo-eye to interrupt one',
  },
];

function requireMoves(group: string, cases: readonly RoutedCase[]): void {
  describe(`${group}: every routed row moves the legs`, () => {
    for (const routed of cases) {
      it(`${routed.id} moves the legs on ${routed.buildingId}`, () => {
        const base = stateOn(routed.buildingId, routed.template);
        expect(
          legsOf(routed.moved(base)),
          `${routed.id} is drawn as applied and changes no leg on ${routed.buildingId} — an inert ` +
            `control (§ D177). The cell was chosen because ${routed.because}.`,
        ).not.toBe(legsOf(base));
      });
    }
  });
}

requireMoves('TRAFFIC_PARAMETERS', TRAFFIC_CASES);
requireMoves('CROWDING_PARAMETERS', CROWDING_CASES);
requireMoves('SIM_PARAMETERS', RUNNER_CASES);

describe('and the run with nothing moved is the run before these fields existed', () => {
  /*
   * The inverse half, and the one that makes the absent-key discipline a measurement rather than a
   * reading of the code. `core` promises that a config carrying no `lobbyCrowding` key, and a
   * `demand` object carrying no key the Parameters tab wrote, is the run it always was. At `null`
   * on all three fields this state writes nothing, so the legs must be byte-identical to a state
   * that has never heard of them — which is what `sim/patience.ts`'s own contract says about the
   * field these three were built beside.
   */
  for (const buildingId of BUILDING_IDS) {
    it(`${buildingId} runs byte-identically at null`, () => {
      const base = stateOn(buildingId);
      expect(base.paramDemand).toBeNull();
      expect(base.lobbyCrowding).toBeNull();
      expect(base.runnerTunables).toBeNull();
      const { paramDemand: _a, lobbyCrowding: _b, runnerTunables: _c, ...withoutTheFields } = base;
      expect(legsOf(base)).toBe(
        legsOf({
          ...(withoutTheFields as ViewerState),
          paramDemand: null,
          lobbyCrowding: null,
          runnerTunables: null,
        }),
      );
    });
  }

  it('writes no key of its own onto the config when nothing has been touched', () => {
    /*
     * The structural half of the same claim, and it is the one that catches the failure the legs
     * cannot see: a key written at its default produces identical legs *today* and pins a value
     * that stops being the default tomorrow. `traceConfigFor` spreads each of these fields or
     * omits it, so presence is the claim.
     */
    const plan = shiftRunConfigOf(RESOURCES, stateOn('midtown-office'));
    expect(Object.hasOwn(plan.config, 'lobbyCrowding')).toBe(false);
    expect(Object.hasOwn(plan.config, 'transferWalkS')).toBe(false);
    expect(Object.hasOwn(plan.config, 'dispatchRetryS')).toBe(false);
    expect(Object.hasOwn(plan.config, 'drainGraceS')).toBe(false);
    expect(Object.hasOwn(plan.config, 'doorObstructionProbability')).toBe(false);
    const demand = plan.config.demand ?? {};
    for (const key of [
      'demandLevel',
      'batchSharesDestination',
      'interfloorWeighting',
      'credentialAssignment',
      'maxLegs',
      'peakWindowS',
      'baselineFraction',
      'mixAmplitude',
    ]) {
      expect(Object.hasOwn(demand, key), `demand.${key} was pinned by a screen nobody opened`).toBe(false);
    }
  });

  it('never takes the day’s event out of the demand it is merged over', () => {
    /*
     * `shiftRunConfigOf` merges `paramDemand` **after** the event patch and the calendar, and that
     * is safe only because the key sets are disjoint. Asserted on the run rather than on the
     * reasoning: a state carrying both a fire drill and a full traffic override must still run at
     * the drill's rate.
     */
    const drill: ViewerState = {
      ...stateOn('midtown-office'),
      campaignEventId: 'fire-drill',
      paramDemand: { demandLevel: 'min', maxLegs: 4, interfloorWeighting: 'uniform' },
    };
    const withDrill = shiftRunConfigOf(RESOURCES, drill);
    const withoutOverride = shiftRunConfigOf(RESOURCES, { ...drill, paramDemand: null });
    expect(withDrill.config.demand?.arrivalRatePctPop5min).toBe(
      withoutOverride.config.demand?.arrivalRatePctPop5min,
    );
  });
});
