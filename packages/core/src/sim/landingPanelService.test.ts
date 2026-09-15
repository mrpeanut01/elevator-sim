/**
 * **Service events on a building with panel landings** — GitHub issue #534 item 2,
 * `DECISIONS.md` § D523 (service range), § D553 (per-landing fixtures). **No decision number is
 * spent here**, deliberately: this file decides nothing that reaches past itself — it asserts
 * § D553 clause 5 and § D523's seam with a run — and
 * [§ D405](../../../../DECISIONS.md) rules that a docstring is the record in exactly that case.
 * (The marker that ratchet counts is named rather than uttered, on § D405's own convention.)
 *
 * Two features that had never met. `serviceMode.test.ts` and `serviceRange.test.ts` prove what a
 * mid-run service event does; `landingPanels.test.ts` proves what a per-landing fixture does. Both
 * reach into the same three places in `Simulation` — a bank's served set, a car's group
 * membership, and the promise a panel made to a passenger standing at a landing — and the review of
 * PR #532 recorded that no test ran them together.
 *
 * ## Why `serviceEvents` may be asserted on at all
 *
 * `CLAUDE.md` names `serviceEvents` as one of the dead seams this repository has shipped, so the
 * first thing checked here was whether it is reached from a shipped path today. It is, in all three
 * of its shapes, and each one was found rather than assumed:
 *
 * | shape | shipped writer |
 * |---|---|
 * | mode (`{atS, carId, mode}`) | `viz/shift/incidents.ts#serviceEventsFor`, the daily loop's incidents |
 * | derate (`{atS, carId, ratedLoadLb}`) | `viz/campaign/incidents.ts#answerChangeOf`, the stage's answered breakdown |
 * | range (`{atS, bankId, servesFloors}`) | the campaign stage's `rezone-bank` purchase — `viz/everyday/stageScreenModel.ts` hands `offer.serviceEvents` to `viz/live/interventions.ts`, which refuses one aimed at a double-deck bank (issue #477) |
 *
 * So this file asserts a live seam. It does **not** assert that any shipped *building* declares
 * one: `data/buildings/` declares none, by design, and the fixture below is authored here.
 *
 * ## What is asserted
 *
 * 1. **A hybrid run survives both kinds of event.** `runSimulation` throws on a failed conservation
 *    audit, so a returned result is the audit holding — over a run in which a panel promised cars
 *    at two landings, a car left the group and came back, and a bank stopped reaching two floors.
 * 2. **The pairing key does not move when the served set does** — § D553 clause 5 in a run rather
 *    than in a sentence. `passengerModel` and `assigningFloorIds` are identical with the events and
 *    without them, even though the run is different, because a declaration on a floor no bank
 *    currently reaches still counts.
 * 3. **A promise is kept or revoked, never orphaned.** Every leg that boarded at an assigning
 *    landing boarded the car it was promised, across a withdrawal that revoked promises
 *    (`fuzz-1000384`'s fix) and across a range closure. Every leg at a button landing is promised
 *    nobody.
 * 4. **Move the control and require the run to change.** The events move the legs, and the closure
 *    strands people, so none of the above is vacuously true of a run nothing happened in.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { parseBuilding, resolveBuilding } from '../config/parse.js';
import type { LoadedConfig, ResolvedBuilding } from '../config/types.js';

import { load } from './fixtures.test-helper.js';
import { runSimulation } from './simulation.js';
import type { SimulationConfig, SimulationResult } from './types.js';

const SEED = 20_260_914;
const WITHDRAWN_AT_S = 250;
const RETURNS_AT_S = 550;
const CLOSES_AT_S = 300;
const REOPENS_AT_S = 600;

/** The landings whose fixture names a car under the panel dispatcher below. */
const PANEL_LANDINGS = ['G', '4'] as const;

/**
 * Two banks over six floors, with panels on two landings.
 *
 * `local` serves G–4 and `express` serves G and 4–6, so floors 5 and 6 are the express's alone and
 * closing it above 4 strands every rider bound for them — `serviceRange.test.ts`'s fixture, kept
 * deliberately close so the two files' findings are comparable.
 *
 * The panels sit at **G and 4**: the entrance, and the floor both banks reach. Every other landing
 * declares `up-down-buttons`, which is what makes the run `hybrid` rather than a whole-building
 * destination run — and 4 is deliberately a *transfer* floor, so a promise made at a panel can be
 * made to a car in either bank.
 */
function tower(serviceEvents: readonly Record<string, unknown>[] = []): Record<string, unknown> {
  const car = (id: string): Record<string, unknown> => ({
    id,
    spec: 'hydraulic',
    ratedSpeedMps: 0.63,
    doorType: 'sideOpening',
    ratedLoadLb: 2100,
  });
  const floor = (
    id: string,
    index: number,
    heightM: number,
    population: number,
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    id,
    index,
    heightM,
    population,
    ...(PANEL_LANDINGS.includes(id as (typeof PANEL_LANDINGS)[number])
      ? {}
      : { landingCallType: 'up-down-buttons' }),
    ...extra,
  });
  return {
    id: 'panel-range-tower',
    name: 'Panel range tower',
    type: 'residential',
    trafficProfile: 'residential',
    floors: [
      floor('G', 0, 0, 0, { isEntrance: true }),
      floor('2', 2, 3, 60),
      floor('3', 3, 6, 60),
      floor('4', 4, 9, 60, { isTransferFloor: true }),
      floor('5', 5, 12, 60),
      floor('6', 6, 15, 60),
    ],
    totalPopulation: 300,
    banks: [
      { id: 'local', servesFloors: ['G', '2', '3', '4'], cars: [car('L1'), car('L2')] },
      { id: 'express', servesFloors: ['G', '4', '5', '6'], cars: [car('E1'), car('E2')] },
    ],
    accessZones: [],
    ...(serviceEvents.length === 0 ? {} : { serviceEvents }),
  };
}

/**
 * A car out of the group and back, and a bank that stops reaching the floors only it reaches.
 *
 * `local/L1` at 250 s rather than some other car at some other instant, and the choice was
 * **measured rather than assumed**: a withdrawal only revokes a promise if the car was holding one
 * when it left, and most of the (car, instant) pairs tried here revoke nothing at this seed. Swept
 * over six pairs, `L1` at 250 s is the one that revokes — 5 promises taken back and 5 legs
 * re-promised, `legsAssigned` 68 → 73 — so this is the pair that exercises `fuzz-1000384`'s fix on
 * a hybrid run rather than merely scheduling an event near it. A test that withdrew a car holding
 * no promise would pass while asserting nothing, which is the shape this file exists to avoid.
 */
const WITHDRAW = { atS: WITHDRAWN_AT_S, bankId: 'local', carId: 'L1', mode: 'out-of-service' };
const RETURN = { atS: RETURNS_AT_S, bankId: 'local', carId: 'L1', mode: 'in-service' };

/** The way a record names a car: its bank's id and its own, which is not the id an event uses. */
const WITHDRAWN_CAR_ID = 'local-L1';
const CLOSE = { atS: CLOSES_AT_S, bankId: 'express', servesFloors: ['G', '4'] };
const REOPEN = { atS: REOPENS_AT_S, bankId: 'express', servesFloors: ['G', '4', '5', '6'] };

let config: LoadedConfig;

beforeAll(async () => {
  config = await load();
});

function resolve(serviceEvents: readonly Record<string, unknown>[] = []): ResolvedBuilding {
  return resolveBuilding(
    parseBuilding(tower(serviceEvents), 'panel-range-tower.json'),
    config.elevatorSpecs,
    {
      file: 'panel-range-tower.json',
      trafficProfileIds: new Set(config.trafficProfiles.profiles.map((profile) => profile.id)),
    },
  );
}

/** A panel dispatcher: `eta` naming a car at every landing whose fixture can ask for a destination. */
function panelProfile(): SimulationConfig['dispatcherProfile'] {
  const base = config.dispatcherProfilesById.get('eta');
  if (base === undefined) throw new Error('missing dispatcher fixture "eta"');
  return {
    ...base,
    id: 'arm-panel',
    name: 'arm-panel',
    weights: { ...base.weights, rideTime: 1 },
    dispatch: { ...base.dispatch, callType: 'mobile-credential', passengerAssignment: 'panel' },
  };
}

function run(building: ResolvedBuilding): SimulationResult {
  return runSimulation({
    building,
    dispatcherProfile: panelProfile(),
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: SEED,
    durationS: 900,
    drainGraceS: 300,
    reportWindow: 'full-run',
    demand: { arrivalRatePctPop5min: 30 },
    onTimeout: 'report',
  });
}

/** Every leg's car and boarding instant — the trajectory, not a statistic over it. */
function trajectory(result: SimulationResult): string {
  return result.record.passengers
    .map((leg) => `${leg.passengerId}:${leg.carId ?? '-'}:${String(leg.boardedAt)}`)
    .join('|');
}

/**
 * The audit's own books, re-derived rather than read off a flag — there is no `ok` field, because
 * `runSimulation` **throws** when the audit fails and a returned result is the audit holding.
 *
 * Asserted anyway, in the three places a hybrid run could go wrong quietly and a conventional one
 * could not: every leg the runner created reached the recorder, the journeys balance, and nobody
 * boarded a car other than the one the panel named at their landing.
 */
function expectTheBooksBalance(result: SimulationResult, label: string): void {
  const audit = result.conservation;
  expect(audit.balanced, `${label}: the audit does not balance`).toBe(true);
  // `balanced` is the audit's own arithmetic; these two are the halves a hybrid run could break
  // that a conventional one could not, so they are asserted beside it rather than through it.
  expect(audit.legsRecorded, `${label}: legs created but never recorded`).toBe(audit.legsCreated);
  expect(audit.wrongCarBoardings, `${label}: somebody boarded a car the panel did not name`).toBe(0);
  expect(
    audit.delivered +
      audit.undelivered +
      (audit.abandoned ?? 0) +
      (audit.accessRefused ?? 0) +
      (audit.stranded ?? 0),
    `${label}: journeys do not balance`,
  ).toBe(audit.generated);
}

/* -------------------------------------------------------------------------- *
 * The fixture is the configuration this file claims it is
 * -------------------------------------------------------------------------- */

describe('the fixture is a hybrid run with panels on two landings', () => {
  it('names the two landings that assign, and nothing else', () => {
    const quiet = run(resolve());
    expect(quiet.comparability.passengerModel).toBe('hybrid');
    expect(quiet.comparability.assigningFloorIds).toEqual([...PANEL_LANDINGS]);
    expect(quiet.record.assigningFloorIds).toEqual([...PANEL_LANDINGS]);
    // Not a vacuous hybrid: somebody stood at a panel and somebody stood at a button.
    const promised = quiet.record.passengers.filter((leg) => leg.assignedCarId !== undefined);
    expect(promised.length).toBeGreaterThan(0);
    expect(
      quiet.record.passengers.filter(
        (leg) => leg.assignedCarId === undefined && leg.boardedAt !== undefined,
      ).length,
    ).toBeGreaterThan(0);
  }, 60_000);
});

/* -------------------------------------------------------------------------- *
 * The audit, over a hybrid run that service events happened to
 * -------------------------------------------------------------------------- */

describe('a hybrid run survives a mid-run service event', () => {
  it('holds the conservation audit with a car withdrawn and returned', () => {
    // `runSimulation` throws SimulationError on a failed audit, so returning is the audit holding —
    // including claim 5, which counts promisable legs at the landings that assign.
    const result = run(resolve([WITHDRAW, RETURN]));
    const quiet = run(resolve());
    expect(result.status).toBe('completed');
    expectTheBooksBalance(result, 'a car withdrawn and returned');
    // The withdrawal reached the promises rather than merely being scheduled beside them, and the
    // group re-promised everybody it took back: 5 and 5 at this seed.
    expect(result.conservation.promisesRevoked).toBeGreaterThan(0);
    expect(result.conservation.legsAssigned).toBe(
      quiet.conservation.legsAssigned + result.conservation.promisesRevoked,
    );
  }, 60_000);

  it('holds the conservation audit with a bank’s range closed and reopened', () => {
    const result = run(resolve([CLOSE, REOPEN]));
    expect(['completed', 'timed-out']).toContain(result.status);
    expectTheBooksBalance(result, 'a range closed and reopened');
  }, 60_000);

  it('holds it with all four at once, and the events move the legs', () => {
    const quiet = run(resolve());
    const busy = run(resolve([WITHDRAW, CLOSE, RETURN, REOPEN]));
    expectTheBooksBalance(busy, 'all four events');
    // Move the control and require the run to change, compared on the legs.
    expect(trajectory(busy)).not.toBe(trajectory(quiet));
    // …and the closure actually bit: somebody was left with no bank that reaches their floor.
    // `strandedLegs` is absent rather than `0` on a run that stranded nobody, which is the same
    // absent-means-never-asked rule `ConservationAudit.abandoned` states.
    expect(busy.stageActivity.strandedLegs ?? 0).toBeGreaterThan(0);
    expect(quiet.stageActivity.strandedLegs ?? 0).toBe(0);
  }, 60_000);
});

/* -------------------------------------------------------------------------- *
 * § D553 clause 5 — every floor counts, served or not
 * -------------------------------------------------------------------------- */

describe('a service event moves the run and never the pairing key', () => {
  it('reports the same passenger model and the same assigning landings either way', () => {
    const quiet = run(resolve());
    const busy = run(resolve([WITHDRAW, CLOSE, RETURN, REOPEN]));

    // § D553 clause 5: a bank's served set can change mid-run, and a run's pairing key must not.
    // Floor 4's panel stays an assigning landing for the whole run even while the express that
    // reaches it above is closed, because the declaration is on the landing and not on the bank.
    expect(busy.comparability.passengerModel).toBe(quiet.comparability.passengerModel);
    expect(busy.comparability.assigningFloorIds).toEqual(quiet.comparability.assigningFloorIds);
    expect(busy.comparability.notComparableMetrics).toEqual(
      quiet.comparability.notComparableMetrics,
    );
    expect(busy.record.assigningFloorIds).toEqual(quiet.record.assigningFloorIds);
  }, 60_000);
});

/* -------------------------------------------------------------------------- *
 * Promises, across a withdrawal and a closure
 * -------------------------------------------------------------------------- */

describe('a promise made at a panel is kept or revoked, never orphaned', () => {
  it('boards every promised leg on the car it was promised, and promises nobody at a button', () => {
    for (const events of [[], [WITHDRAW, RETURN], [CLOSE, REOPEN], [WITHDRAW, CLOSE, RETURN, REOPEN]]) {
      const result = run(resolve(events));
      const label = `${String(events.length)} service event(s)`;

      for (const leg of result.record.passengers) {
        const assigns = PANEL_LANDINGS.includes(
          leg.originFloorId as (typeof PANEL_LANDINGS)[number],
        );
        if (!assigns) {
          expect(leg.assignedCarId, `${label}: ${leg.passengerId} promised at a button landing`).toBeUndefined();
          continue;
        }
        if (leg.boardedAt === undefined) continue;
        // Boarded at a panel: either the promise stood and was kept, or it was revoked before the
        // boarding — a withdrawn car cannot keep one (`fuzz-1000384`). What may never happen is a
        // leg boarding a car other than the one still promised to it.
        if (leg.assignedCarId === undefined) continue;
        expect(leg.carId, `${label}: ${leg.passengerId} boarded a car it was not promised`).toBe(
          leg.assignedCarId,
        );
      }
    }
  }, 120_000);

  it('revokes rather than strands: nobody boards the withdrawn car while it is out', () => {
    const result = run(resolve([WITHDRAW, RETURN]));
    // A record names a car `<bankId>-<carId>`, which is **not** the id a service event names, and
    // comparing against the event's `carId` would make this case pass by matching nothing.
    expect(
      result.record.passengers.some((leg) => leg.assignedCarId === WITHDRAWN_CAR_ID),
      'nobody was ever promised the car this case withdraws',
    ).toBe(true);
    const aboardWhileOut = result.record.passengers.filter(
      (leg) =>
        leg.carId === WITHDRAWN_CAR_ID &&
        leg.boardedAt !== undefined &&
        leg.boardedAt > WITHDRAWN_AT_S &&
        leg.boardedAt < RETURNS_AT_S,
    );
    expect(aboardWhileOut).toEqual([]);
  }, 60_000);
});
