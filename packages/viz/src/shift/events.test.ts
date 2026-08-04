/**
 * **The anti-dead-seam suite, and the most important one in this directory.**
 *
 * `docs/05-roadmap.md` § *Standing requirement — the integration seam has an owner*: a behaviour
 * that is configurable, unit-tested in isolation and never called from a shipped path passes every
 * other check this repository runs, and has shipped that way eleven times in code. An event is the
 * shape that rule was written for — five names and five notes that a viewer could print over five
 * identical runs — so the assertion here is not *the struct has the right fields*. It is:
 *
 * > build a `SimulationConfig` from the effect, record a real run on a real shipped building, and
 * > require the run to differ from a no-event control **in the way the event's own note claims**.
 *
 * A caption cannot pass that. A struct that is read by nothing cannot pass it either.
 *
 * ## Why one building and one duration
 *
 * Midtown Office at 600 s: 1 710 people, one bank of four cars, two entrance floors and an
 * `office-standard` profile at 12 %pop/5 min. That is enough demand for a directional-share
 * assertion to be about the trace rather than about six passengers, and few enough cars that
 * holding one out of service is visible. Breadth is not what this suite buys — the claim is *the
 * effect reaches the engine*, which is a property of the wiring rather than of the building.
 *
 * `onTimeout: 'report'` because a drill at 19.2 %pop/5 min routinely ends with people still in the
 * system, and a *picture* of that run is exactly what the shift layer has to be able to draw
 * (`fixtures.test-helper.ts` on `FixtureOptions.onTimeout`).
 */

import { loadConfig, type LoadedConfig, type SimulationConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { DATA_DIR, fixtureConfig, requireBuilding } from '../fixtures.test-helper.js';
import { recordRun } from '../record/recordRun.js';
import type { VizRecording } from '../contract/types.js';
import {
  MAX_ARRIVAL_RATE_PCT_POP_5MIN,
  SHIFT_EVENTS,
  baseDemandOf,
  eventFor,
  shiftRunPatch,
} from './events.js';
import { serviceEventsFor, type Incident } from './incidents.js';
import { SHIFT_EVENT_IDS, type ShiftEventId } from './types.js';

const BUILDING_ID = 'midtown-office';
const DURATION_S = 600;

let config: LoadedConfig;
let control: VizRecording;
let entranceFloorIds: ReadonlySet<string>;

/** The demand the shift runs at with no event — what every effect below is relative to. */
function base(): { readonly ratePctPop5min: number; readonly split: ReturnType<typeof baseDemandOf>['split'] } {
  const building = requireBuilding(config, BUILDING_ID);
  const profile = config.trafficProfilesById.get(building.trafficProfile);
  if (profile === undefined) throw new Error(`no traffic profile "${building.trafficProfile}"`);
  return baseDemandOf(profile);
}

function runWith(eventId: ShiftEventId | null): VizRecording {
  const building = requireBuilding(config, BUILDING_ID);
  const demandBase = base();
  const patch =
    eventId === null
      ? { demand: {}, outOfServiceCarIds: [] as readonly string[], incidents: [] as readonly Incident[] }
      : shiftRunPatch({ event: SHIFT_EVENTS[eventId], building, base: demandBase });

  const fixture = fixtureConfig(config, {
    buildingId: BUILDING_ID,
    durationS: DURATION_S,
    onTimeout: 'report',
  });
  /*
   * The incidents go onto the **building**, not beside the config, because `serviceEvents` is read
   * by the kernel during the run rather than by `recordRun` before it. `dev/state.ts` does the same
   * thing at the same point; a fixture that skipped it would be testing a run the shell never
   * builds — the shape that reported a live seam dead in `scope/probes.test-helper.ts`.
   */
  const simulationConfig: SimulationConfig = {
    ...fixture,
    building: withIncidentsOnResolved(fixture.building, patch.incidents),
    demand: {
      arrivalRatePctPop5min: demandBase.ratePctPop5min,
      directionalSplit: demandBase.split,
      ...patch.demand,
    },
  };
  return recordRun(simulationConfig, {
    recordDecisions: false,
    outOfServiceCarIds: patch.outOfServiceCarIds,
  }).recording;
}

/**
 * Attach service events to an already-resolved building.
 *
 * The shipped path re-parses (`dev/state.ts` puts the edited config back through
 * `parseBuilding`/`resolveBuilding`, so an incident naming an unknown car is refused by `core`'s own
 * issue codes). This fixture is handed a `ResolvedBuilding` and has no config to go back to, so it
 * writes the resolved form directly — which is why the *validation* half is asserted in
 * `incidents.test.ts` against the real path and not here.
 */
function withIncidentsOnResolved(
  building: SimulationConfig['building'],
  incidents: readonly Incident[],
): SimulationConfig['building'] {
  const events = serviceEventsFor(incidents, DURATION_S);
  if (events.length === 0) return building;
  return {
    ...building,
    serviceEvents: [
      ...(building.serviceEvents ?? []),
      ...events.map((event) => ({
        atS: event.atS,
        bankId: event.bankId ?? '',
        carId: event.carId,
        mode: event.mode,
      })),
    ],
  };
}

/** `incoming` / `outgoing` / `interfloor`, classified the way `core`'s generator classifies them. */
function shares(recording: VizRecording): {
  readonly incoming: number;
  readonly outgoing: number;
  readonly interfloor: number;
} {
  let incoming = 0;
  let outgoing = 0;
  let interfloor = 0;
  for (const leg of recording.legs) {
    const fromEntrance = entranceFloorIds.has(leg.originFloorId);
    const toEntrance = entranceFloorIds.has(leg.destinationFloorId);
    if (fromEntrance && !toEntrance) incoming += 1;
    else if (toEntrance && !fromEntrance) outgoing += 1;
    else interfloor += 1;
  }
  const total = Math.max(1, recording.legs.length);
  return { incoming: incoming / total, outgoing: outgoing / total, interfloor: interfloor / total };
}

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  entranceFloorIds = new Set(
    requireBuilding(config, BUILDING_ID).entranceFloors.map((floor) => floor.id),
  );
  control = runWith(null);
}, 120_000);

describe('the schedule is the design’s own', () => {
  it('puts the weekend on the last two days of the week, whatever the day number', () => {
    expect(eventFor(9, 5).id).toBe('weekend');
    expect(eventFor(14, 6).id).toBe('weekend');
  });

  it('reproduces the design’s slot arithmetic on the working days', () => {
    expect(eventFor(3, 2).id).toBe('move-in');
    expect(eventFor(5, 4).id).toBe('fire-drill');
    expect(eventFor(4, 3).id).toBe('conference');
    expect(eventFor(1, 0).id).toBe('ordinary');
    expect(eventFor(2, 1).id).toBe('ordinary');
  });

  it('is a pure function of (day, dayIdx), so a week replays', () => {
    for (let day = 1; day <= 30; day += 1) {
      for (let dayIdx = 0; dayIdx < 7; dayIdx += 1) {
        expect(eventFor(day, dayIdx)).toBe(eventFor(day, dayIdx));
      }
    }
  });

  it('gives every id an entry, and every entry the id it is filed under', () => {
    for (const id of SHIFT_EVENT_IDS) expect(SHIFT_EVENTS[id].id).toBe(id);
  });
});

describe('the patch and the effect agree about what is written', () => {
  it.each(SHIFT_EVENT_IDS)('%s writes exactly the fields it declares', (id) => {
    const patch = shiftRunPatch({
      event: SHIFT_EVENTS[id],
      building: requireBuilding(config, BUILDING_ID),
      base: base(),
    });
    const written = [
      ...Object.keys(patch.demand).map((key) => `demand.${key}`),
      ...(patch.outOfServiceCarIds.length > 0 ? ['outOfServiceCarIds'] : []),
      // `serviceEvents` is the third place an effect can write, and it goes onto the building
      // rather than beside the config. An event declaring it and producing no incident — or the
      // reverse — is exactly the caption-without-a-mechanism this cross-check exists for.
      ...(patch.incidents.length > 0 ? ['serviceEvents'] : []),
    ].sort((a, b) => a.localeCompare(b));
    expect(written).toEqual([...SHIFT_EVENTS[id].effect.writes].sort((a, b) => a.localeCompare(b)));
    expect(patch.withheld).toEqual([]);
  });

  it('never configures a rate past the searchable range', () => {
    for (const id of SHIFT_EVENT_IDS) {
      const rate = shiftRunPatch({
        event: SHIFT_EVENTS[id],
        building: requireBuilding(config, BUILDING_ID),
        base: base(),
      }).demand.arrivalRatePctPop5min;
      if (rate !== undefined) expect(rate).toBeLessThanOrEqual(MAX_ARRIVAL_RATE_PCT_POP_5MIN);
    }
  });

  it('withholds the mix — rather than throwing at run time — under a mix-varying template', () => {
    // `core` refuses `directionalSplit` together with a template that varies the mix, because one
    // would have to win silently. The refusal is surfaced here instead of surfacing as a throw
    // three layers down.
    const patch = shiftRunPatch({
      event: SHIFT_EVENTS['fire-drill'],
      building: requireBuilding(config, BUILDING_ID),
      base: base(),
      templateVariesMix: true,
    });
    expect(patch.demand.directionalSplit).toBeUndefined();
    expect(patch.demand.arrivalRatePctPop5min).toBeGreaterThan(base().ratePctPop5min);
    expect(patch.withheld).toHaveLength(1);
  });
});

describe('every event reaches the simulator', () => {
  it('move-in stands a car down for the window it names, and gives it back', () => {
    /*
     * The event's mechanism changed and this assertion changed with it. It used to hold the car for
     * the whole run through `outOfServiceCarIds`, because the shift layer did not own the building
     * and could not say *until*. It now writes two `serviceEvents` through `shift/incidents.ts`, so
     * the claim to check is the harder one: idle inside the window, **working after it**.
     *
     * A test that only asserted "the car was idle at some point" would pass on the old mechanism,
     * on the new one, and on a car that simply had nothing to do — which is why the control below
     * is still here and why the after-the-window clause is the load-bearing half.
     */
    const run = runWith('move-in');
    const patch = shiftRunPatch({
      event: SHIFT_EVENTS['move-in'],
      building: requireBuilding(config, BUILDING_ID),
      base: base(),
    });
    expect(patch.outOfServiceCarIds).toHaveLength(0);
    expect(patch.incidents).toHaveLength(1);

    const incident = patch.incidents[0];
    expect(incident).toBeDefined();
    if (incident === undefined) return;
    const heldId = `${incident.car.bankId}-${incident.car.carId}`;
    const backAtS = Math.round(incident.toFraction * DURATION_S);

    const held = run.shafts.find((shaft) => shaft.carId === heldId);
    expect(held, `${heldId} is missing from the recording`).toBeDefined();
    // `Car.setMode('out-of-service')` makes `estimateCost` refuse the car with
    // `infeasibleReason: 'serviceMode'`, so the group dispatches around it while it is out.
    const duringWindow = (held?.motions ?? []).filter((motion) => motion.startedAt < backAtS);
    expect(duringWindow, `${heldId} moved while it was out of service`).toHaveLength(0);
    // …and it came back, which is the whole point of a window rather than a hold.
    const afterWindow = (held?.motions ?? []).filter((motion) => motion.startedAt >= backAtS);
    expect(afterWindow.length, `${heldId} never returned to service`).toBeGreaterThan(0);

    // …and it is not simply a car that had nothing to do: the same car worked in the control.
    const inControl = control.shafts.find((shaft) => shaft.carId === heldId);
    expect((inControl?.motions ?? []).length).toBeGreaterThan(0);

    // Every other car still ran.
    for (const shaft of run.shafts) {
      if (shaft.carId === heldId) continue;
      expect(shaft.motions.length, shaft.carId).toBeGreaterThan(0);
    }
  });

  it('fire-drill swings the traffic outward and raises the level', () => {
    const run = runWith('fire-drill');
    const drill = shares(run);
    const quiet = shares(control);

    // Outgoing-dominant, which is what "the whole building wants to be in the lobby" means.
    expect(drill.outgoing).toBeGreaterThan(quiet.outgoing);
    expect(drill.outgoing).toBeGreaterThan(drill.incoming);
    expect(quiet.incoming).toBeGreaterThan(quiet.outgoing);

    // …and there is more of it. 12 %pop/5min becomes 19.2.
    expect(run.legs.length).toBeGreaterThan(control.legs.length);
  });

  it('conference raises the interfloor share', () => {
    const run = runWith('conference');
    // The design's note is precisely this: "Interfloor traffic all afternoon, which no up-peak
    // strategy is tuned for." A busier run would not test that; a differently-shaped one does.
    expect(shares(run).interfloor).toBeGreaterThan(shares(control).interfloor);
    expect(shares(run).interfloor).toBeGreaterThan(0.3);
  });

  it('weekend reduces the level and changes nothing else', () => {
    const run = runWith('weekend');
    expect(run.legs.length).toBeLessThan(control.legs.length);
    expect(run.outOfServiceCarIds).toEqual([]);
    // The mix is untouched: a quiet day is the same building with fewer people in it. Compared
    // as a shape rather than to three decimals — the two runs draw different numbers of
    // passengers from the same split, so the realised shares differ by sampling and nothing else.
    expect(shares(run).incoming).toBeGreaterThan(shares(run).outgoing);
    expect(Math.abs(shares(run).incoming - shares(control).incoming)).toBeLessThan(0.1);
  });

  it('ordinary changes nothing, and that is asserted rather than assumed', () => {
    // `changesNothing: true` is a claim about the run, so it is checked against the run: the
    // recording is identical to the control's, field for field, after a JSON round trip.
    const run = runWith('ordinary');
    expect(JSON.stringify(run)).toBe(JSON.stringify(control));
  });
});

describe('which car is held is a decision, not a draw', () => {
  it('is the same car every time', () => {
    const building = requireBuilding(config, BUILDING_ID);
    const first = shiftRunPatch({ event: SHIFT_EVENTS['move-in'], building, base: base() });
    const second = shiftRunPatch({ event: SHIFT_EVENTS['move-in'], building, base: base() });
    expect(first.outOfServiceCarIds).toEqual(second.outOfServiceCarIds);
  });

  it('leaves at least one car in every bank, on every shipped building', () => {
    // A bank with no in-service car is a set of floors nobody can reach — a different scenario
    // rather than a busier one.
    for (const building of config.buildings) {
      const patch = shiftRunPatch({ event: SHIFT_EVENTS['move-in'], building, base: base() });
      for (const bank of building.banks) {
        const heldInBank = patch.outOfServiceCarIds.filter((id) =>
          bank.cars.some((car) => `${bank.id}-${car.id}` === id),
        );
        expect(heldInBank.length, `${building.id}/${bank.id}`).toBeLessThan(bank.cars.length);
      }
    }
  });
});
