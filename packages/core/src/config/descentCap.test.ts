/**
 * **The air-pressure descent cap, and the equipment that lifts it** — GitHub issue #444.
 *
 * Al-Kodmany (Buildings 2015, 5(3), 1070–1104) § 3.1.4 records a limit that is about the air in
 * the shaft rather than the machine in it: *"because of the air-pressure problem, elevators
 * continue to descend not faster than 10 m per second."* One World Trade Center answered it by
 * pressurising the cars. `data/elevator-specs.json`'s `airPressure` block carries both halves,
 * and `resolveBuilding` is the one place that applies them.
 *
 * ## What is asserted here, and why each case is written the way it is
 *
 * Every case below is written against **the value the defect would really produce**, because
 * this repository has repeatedly shipped guards that pass their own positive controls:
 *
 * - *"the cap bites above the threshold"* is worthless without *"and not below it"*, so both
 *   arms run the **same car** and differ only in the shaft's travel. A cap applied everywhere
 *   would pass the first and fail the second.
 * - *"pressurisation lifts the cap"* is worthless without *"and its absence does not"*, so both
 *   arms run the same building and differ only in `cabinPressurised`. A field that was read but
 *   whose value was ignored would pass a one-armed version of this.
 * - The boundary is checked at the threshold **exactly**, at a hair below it and at a hair above
 *   it, because `>` and `>=` are the mistake this shape actually makes, and a case at 500 m
 *   against a threshold of 300 m cannot tell them apart.
 * - The shipped set is asserted symmetric **and** the assertion is checked for vacuity: a data
 *   directory that lost its `airPressure` block would make the byte-identity arm pass for the
 *   wrong reason, so the block's presence and its figures are pinned first.
 *
 * ## The § D219 half
 *
 * A limit no run consults is a dead seam, which this repository has shipped eleven times in code
 * and twice in `data/`. So the last describe block moves the control and requires **the legs** to
 * change — boarding identities, never a mean — and requires the same control to change nothing at
 * all where the physics says it should not.
 */

import { describe, expect, it } from 'vitest';

import { runSimulation } from '../sim/simulation.js';
import { fingerprint, load } from '../sim/fixtures.test-helper.js';
import type { LoadedConfig, ResolvedBuilding } from './types.js';

import { parseBuilding, resolveBuilding } from './parse.js';
import { airPressureDescentCapMps, resolveCar } from './resolveCar.js';
import { WARNING_CODES } from './schema.js';

const SEED = 20_260_910;

/** Every bank in `data/buildings/`, with the travel its cars actually fly. */
function shippedBanks(config: LoadedConfig): {
  readonly buildingId: string;
  readonly bankId: string;
  readonly travelM: number;
  readonly fastestMps: number;
}[] {
  const out: {
    buildingId: string;
    bankId: string;
    travelM: number;
    fastestMps: number;
  }[] = [];
  for (const [buildingId, building] of config.buildingsById) {
    for (const bank of building.banks) {
      const heights = bank.servesFloors
        .map((id) => building.floors.find((floor) => floor.id === id)?.heightM)
        .filter((height): height is number => height !== undefined);
      out.push({
        buildingId,
        bankId: bank.id,
        travelM: heights.length > 1 ? Math.max(...heights) - Math.min(...heights) : 0,
        fastestMps: Math.max(...bank.cars.map((car) => car.ratedSpeedMps)),
      });
    }
  }
  return out;
}

/**
 * A single-bank tower of `floors` storeys at 4 m each, with one car of the given speed.
 *
 * A fixture rather than a shipped building, because the point is to sweep the *travel* across
 * the threshold and no shipped building sits near it. Everything else is a real class from
 * `data/elevator-specs.json` and goes through `parseBuilding`/`resolveBuilding` exactly as a
 * shipped file does — there is no second resolution path here.
 */
function tower(
  config: LoadedConfig,
  options: {
    readonly floors: number;
    readonly ratedSpeedMps: number;
    readonly cabinPressurised?: boolean | undefined;
    readonly descentSpeedMps?: number;
    readonly cars?: number;
    /** `office-standard` is the up-peak template (85 % incoming); `residential` the down-peak one (75 % outgoing). */
    readonly trafficProfile?: 'office-standard' | 'residential';
    /** Headcount per upper floor. Kept low on the run arms so the tower is not saturated. */
    readonly populationPerFloor?: number;
  },
): ResolvedBuilding {
  const pitchM = 4;
  const floors = Array.from({ length: options.floors }, (_, index) => ({
    id: index === 0 ? 'G' : `L${index}`,
    index,
    heightM: index * pitchM,
    population: index === 0 ? 0 : (options.populationPerFloor ?? 40),
    ...(index === 0 ? { isEntrance: true } : {}),
  }));
  const trafficProfile = options.trafficProfile ?? 'office-standard';
  const authored = {
    id: 'pressure-tower',
    name: 'Pressure tower',
    // The type resolves `passengerTransferS`; keeping it beside the profile means a down-peak
    // arm charges the residential 1.75 s rather than the office 1.2 s, which is what the
    // reference table says and what `resolveCar` refuses to default.
    type: trafficProfile === 'residential' ? 'residential' : 'office',
    trafficProfile,
    floors,
    totalPopulation: (options.populationPerFloor ?? 40) * (options.floors - 1),
    banks: [
      {
        id: 'shuttle',
        servesFloors: floors.map((floor) => floor.id),
        cars: Array.from({ length: options.cars ?? 2 }, (_, index) => ({
          id: String.fromCharCode(65 + index),
          spec: 'ultra-high-speed',
          ratedSpeedMps: options.ratedSpeedMps,
          ratedLoadLb: 3500,
          ...(options.cabinPressurised === undefined
            ? {}
            : { cabinPressurised: options.cabinPressurised }),
          ...(options.descentSpeedMps === undefined
            ? {}
            : { descentSpeedMps: options.descentSpeedMps }),
        })),
      },
    ],
    accessZones: [],
  };
  return resolveBuilding(parseBuilding(authored, 'pressure-tower.json'), config.elevatorSpecs, {
    file: 'pressure-tower.json',
    trafficProfileIds: new Set(config.trafficProfiles.profiles.map((profile) => profile.id)),
  });
}

const carOf = (building: ResolvedBuilding) => building.banks[0]?.cars[0];
const warningCodes = (building: ResolvedBuilding): readonly string[] =>
  building.warnings.map((warning) => warning.code);

/* -------------------------------------------------------------------------- *
 * The data
 * -------------------------------------------------------------------------- */

describe('the airPressure block', () => {
  it('is present, and carries the figures every case below depends on', async () => {
    // Non-vacuity for the whole file. A data directory that lost this block would make the
    // symmetry arm below pass for the wrong reason, and nothing else here would notice.
    const cfg = await load();
    expect(cfg.elevatorSpecs.airPressure).toBeDefined();
    expect(cfg.elevatorSpecs.airPressure?.descentCapMps).toBe(10);
    expect(cfg.elevatorSpecs.airPressure?.appliesAboveTravelM).toBe(300);
    // Null is *no cap*, not *unknown*: the source records pressurisation as the answer to the
    // problem rather than as a higher number. A figure here would be invented.
    expect(cfg.elevatorSpecs.airPressure?.pressurisedDescentCapMps).toBeNull();
  });

  it('is optional, and a data directory without it is exactly the pre-#444 model', async () => {
    const cfg = await load();
    const car = { id: 'A', spec: 'ultra-high-speed', ratedSpeedMps: 20 };
    const withoutBlock = { ...cfg.elevatorSpecs, airPressure: undefined };
    // 496 m of travel — burj-class-reference's shuttle before GitHub issue #438 corrected its floor
    // height — at twice the cap, and still symmetric.
    expect(
      resolveCar(car, withoutBlock, { buildingType: 'office', travelM: 496 }).descentSpeedMps,
    ).toBeUndefined();
    expect(
      resolveCar(car, cfg.elevatorSpecs, { buildingType: 'office', travelM: 496 })
        .descentSpeedMps,
    ).toBe(10);
  });
});

/* -------------------------------------------------------------------------- *
 * The cap, and the boundary it is checked at
 * -------------------------------------------------------------------------- */

describe('the cap bites above the declared travel and not below it', () => {
  it('caps a fast car in a tall shaft', async () => {
    const cfg = await load();
    // 96 floors at 4 m = 380 m of travel, above the 300 m threshold.
    const capped = tower(cfg, { floors: 96, ratedSpeedMps: 14 });
    expect(carOf(capped)?.ratedSpeedMps).toBe(14);
    expect(carOf(capped)?.descentSpeedMps).toBe(10);
    expect(warningCodes(capped)).toContain(WARNING_CODES.descentCappedByAirPressure);
  });

  it('leaves the SAME car symmetric in a short shaft', async () => {
    const cfg = await load();
    // The negative control, and the only thing that differs is the storey count. 40 floors at
    // 4 m = 156 m, below the threshold.
    const short = tower(cfg, { floors: 40, ratedSpeedMps: 14 });
    expect(carOf(short)?.ratedSpeedMps).toBe(14);
    expect(carOf(short)?.descentSpeedMps).toBeUndefined();
    expect(warningCodes(short)).not.toContain(WARNING_CODES.descentCappedByAirPressure);
  });

  it('leaves a car AT the cap symmetric however tall the shaft is', async () => {
    const cfg = await load();
    // The second negative control, and the one that matters for the shipped set: every car in
    // `data/buildings/` is at or below 10 m/s, so the limit is a ceiling nobody is touching.
    const atCap = tower(cfg, { floors: 96, ratedSpeedMps: 10 });
    expect(carOf(atCap)?.descentSpeedMps).toBeUndefined();
    expect(warningCodes(atCap)).not.toContain(WARNING_CODES.descentCappedByAirPressure);
  });

  it('applies strictly ABOVE the threshold, checked at the boundary itself', () => {
    /*
     * `>` against `>=` is the mistake this shape makes, and a case at 380 m against a threshold
     * of 300 m cannot tell them apart. Three probes one metre apart can.
     *
     * The threshold reads *applies above* 300 m, so 300.0 m exactly is **not** capped. That is
     * a choice rather than a discovery, and it is the one the field name states.
     */
    const limit = {
      appliesAboveTravelM: 300,
      descentCapMps: 10,
      pressurisedDescentCapMps: null,
      source: 'fixture',
    };
    expect(airPressureDescentCapMps(limit, 299.999, false)).toBeUndefined();
    expect(airPressureDescentCapMps(limit, 300, false)).toBeUndefined();
    expect(airPressureDescentCapMps(limit, 300.001, false)).toBe(10);
  });

  it('takes the LOWER of an authored asymmetry and the cap, in both orders', async () => {
    const cfg = await load();
    // TWIN's shape (7 up, 4 down) in a supertall: the design limit is the lower and binds.
    const twin = tower(cfg, { floors: 96, ratedSpeedMps: 14, descentSpeedMps: 4 });
    expect(carOf(twin)?.descentSpeedMps).toBe(4);
    // And the other way: an authored 12 m/s descent in a shaft capped at 10 resolves to 10.
    const authoredAboveCap = tower(cfg, { floors: 96, ratedSpeedMps: 14, descentSpeedMps: 12 });
    expect(carOf(authoredAboveCap)?.descentSpeedMps).toBe(10);
  });

  it('records a descent speed above the rated speed rather than refusing it', async () => {
    const cfg = await load();
    const quickDown = tower(cfg, { floors: 40, ratedSpeedMps: 10, descentSpeedMps: 12 });
    expect(carOf(quickDown)?.descentSpeedMps).toBe(12);
    expect(warningCodes(quickDown)).toContain(WARNING_CODES.descentAboveRatedSpeed);
  });
});

/* -------------------------------------------------------------------------- *
 * The equipment
 * -------------------------------------------------------------------------- */

describe('pressurisation lifts the cap, and its absence does not', () => {
  it('lifts it where the cap binds', async () => {
    const cfg = await load();
    const fitted = tower(cfg, { floors: 96, ratedSpeedMps: 14, cabinPressurised: true });
    expect(carOf(fitted)?.descentSpeedMps).toBeUndefined();
    expect(carOf(fitted)?.cabinPressurised).toBe(true);
    expect(warningCodes(fitted)).not.toContain(WARNING_CODES.descentCappedByAirPressure);
  });

  it('does not lift it when the field is absent or explicitly false', async () => {
    const cfg = await load();
    // Both arms of the negative control. `false` is the interesting one: a resolver that read
    // the key rather than its value would pass the `undefined` arm and fail here.
    for (const cabinPressurised of [undefined, false] as const) {
      const bare = tower(cfg, { floors: 96, ratedSpeedMps: 14, cabinPressurised });
      expect(carOf(bare)?.descentSpeedMps).toBe(10);
      expect(carOf(bare)?.cabinPressurised).toBeUndefined();
      expect(warningCodes(bare)).toContain(WARNING_CODES.descentCappedByAirPressure);
    }
  });

  it('says so when it buys nothing, rather than letting the purchase pass silently', async () => {
    const cfg = await load();
    // A short shaft: the cap was never reaching this car, so the cabin is fitted and idle.
    const shortAndFitted = tower(cfg, { floors: 40, ratedSpeedMps: 14, cabinPressurised: true });
    expect(warningCodes(shortAndFitted)).toContain(WARNING_CODES.pressurisationBuysNothing);
    // A tall shaft with a car at the cap: the same message for the other reason.
    const slowAndFitted = tower(cfg, { floors: 96, ratedSpeedMps: 10, cabinPressurised: true });
    expect(warningCodes(slowAndFitted)).toContain(WARNING_CODES.pressurisationBuysNothing);
    // And it is not raised where the equipment does buy something.
    const working = tower(cfg, { floors: 96, ratedSpeedMps: 14, cabinPressurised: true });
    expect(warningCodes(working)).not.toContain(WARNING_CODES.pressurisationBuysNothing);
  });
});

/* -------------------------------------------------------------------------- *
 * The shipped set — byte-identity
 * -------------------------------------------------------------------------- */

describe('every shipped building is symmetric, so no pin moves', () => {
  it('resolves no descent speed and raises none of the three advisories', async () => {
    const cfg = await load();
    const banks = shippedBanks(cfg);
    expect(banks.length).toBeGreaterThan(10);

    for (const [buildingId, building] of cfg.buildingsById) {
      for (const bank of building.banks) {
        for (const car of bank.cars) {
          expect(
            car.descentSpeedMps,
            `${buildingId}/${bank.id}/${car.id} resolved a descent speed; every pinned run in this repository assumes none`,
          ).toBeUndefined();
          expect(car.cabinPressurised).toBeUndefined();
        }
      }
      for (const code of [
        WARNING_CODES.descentCappedByAirPressure,
        WARNING_CODES.descentAboveRatedSpeed,
        WARNING_CODES.pressurisationBuysNothing,
      ]) {
        expect(warningCodes(building), `${buildingId} raises ${code}`).not.toContain(code);
      }
    }
  });

  it('is symmetric because the fastest shipped car is AT the cap, not because nothing is tall', async () => {
    /*
     * The reason matters, and it is the sentence a future data change will falsify first. Two
     * shipped banks *are* above the 300 m threshold — `vertical-city`'s shuttle at 307.5 m and
     * `burj-class-reference`'s at 448.3 m (496 m until GitHub issue #438) — so the cap is reaching them. It does not bite because
     * every shipped car is rated at or below 10.0 m/s, which is exactly the figure Al-Kodmany
     * records as the state of the art. Author an 11 m/s shuttle and the row above goes red,
     * which is correct: the pins really would move.
     */
    const cfg = await load();
    const banks = shippedBanks(cfg);
    const tall = banks.filter(
      (bank) => bank.travelM > (cfg.elevatorSpecs.airPressure?.appliesAboveTravelM ?? Infinity),
    );
    expect(tall.length).toBeGreaterThan(0);
    expect(Math.max(...banks.map((bank) => bank.fastestMps))).toBeLessThanOrEqual(
      cfg.elevatorSpecs.airPressure?.descentCapMps ?? 0,
    );
  });

  it('runs byte-identically with the airPressure block and without it', async () => {
    /*
     * The proof rather than the argument. The same shipped building is run twice — once against
     * the shipped specs, once against specs with the whole `airPressure` block removed — and the
     * two runs are compared on `fingerprint`, which is `JSON.stringify` of every event, every
     * record, every summary and every warning, so it pins key order as well as values.
     *
     * `vertical-city` is the building to run it on: its shuttle is the tall, fast bank, so if
     * any shipped run could move under this change it is this one.
     */
    const cfg = await load();
    const building = cfg.buildingsById.get('vertical-city') as ResolvedBuilding;
    const shared = {
      building,
      dispatcherProfile: cfg.dispatcherProfilesById.get('eta')!,
      trafficProfiles: cfg.trafficProfiles,
      seed: SEED,
      onTimeout: 'report',
    } as const;
    const withBlock = runSimulation({ ...shared, elevatorSpecs: cfg.elevatorSpecs });
    const withoutBlock = runSimulation({
      ...shared,
      elevatorSpecs: { ...cfg.elevatorSpecs, airPressure: undefined },
    });
    expect(fingerprint(withoutBlock)).toBe(fingerprint(withBlock));
  }, 120_000);
});

/* -------------------------------------------------------------------------- *
 * § D219 — the control moves the run, compared on the legs
 * -------------------------------------------------------------------------- */

/** Boarding identity: who boarded which car and when. Never a window statistic. */
const legsKey = (result: ReturnType<typeof runSimulation>): string =>
  JSON.stringify(
    result.record.passengers.map((leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1]),
  );

describe('the cap and the cabin reach the run (§ D219)', () => {
  it('changes the legs where it bites, and changes nothing where it does not', async () => {
    const cfg = await load();
    const run = (building: ResolvedBuilding) =>
      runSimulation({
        building,
        dispatcherProfile: cfg.dispatcherProfilesById.get('eta')!,
        trafficProfiles: cfg.trafficProfiles,
        elevatorSpecs: cfg.elevatorSpecs,
        seed: SEED,
        onTimeout: 'report',
      });

    // Same tower, same seed, same traffic. The only difference is one boolean on the cars.
    const capped = run(tower(cfg, { floors: 96, ratedSpeedMps: 14 }));
    const pressurised = run(tower(cfg, { floors: 96, ratedSpeedMps: 14, cabinPressurised: true }));
    expect(legsKey(pressurised)).not.toBe(legsKey(capped));

    // And the same boolean on a shaft the cap does not reach buys nothing — byte-identically,
    // which is the arm that says the seam is the *cap* rather than the field.
    const shortBare = run(tower(cfg, { floors: 40, ratedSpeedMps: 14 }));
    const shortFitted = run(tower(cfg, { floors: 40, ratedSpeedMps: 14, cabinPressurised: true }));
    expect(fingerprint(shortFitted)).toBe(fingerprint(shortBare));
  }, 180_000);

  it('is neither the fast car nor the slow one — pinned by two byte-identity refusals', async () => {
    /*
     * The direction check at run level, and it is **exact rather than statistical**.
     *
     * A first draft asserted an ordering on mean time-to-destination across three arms at one
     * seed. That was wrong, and it is worth saying why rather than quietly replacing it: two
     * configurations at one seed are not paired observations of the same system — the dispatcher
     * takes different decisions, the whole trace diverges, and the arm that *should* have been
     * quicker read 1.4 s slower. CLAUDE.md § Statistical discipline forbids exactly that
     * comparison, and a single-seed ordering is how *increasing lift speed appears to increase
     * average waiting time*. The replicated, paired version of the question — what the cap costs
     * under a down-peak template against an up-peak one — is measured in
     * `experiments/src/descentCap/`, with an interval.
     *
     * What is exact here is the **mechanism**, and two refusals pin it from both sides:
     *
     *   - The capped car is not the slow car. If the cap were applied in both directions, a
     *     14 m/s car capped at 10 would be indistinguishable from a 10 m/s car — the same
     *     envelope, the same profiles, the same legs. It is not, so the climb survived.
     *   - The capped car is not the fast car. If the cap were not applied at all, it would be
     *     indistinguishable from the pressurised one. It is not, so the descent was limited.
     *
     * Byte-identity is the strongest form either claim can take, and neither can be satisfied by
     * a compensating error the way an inequality on a mean can.
     */
    const cfg = await load();
    const run = (building: ResolvedBuilding) =>
      runSimulation({
        building,
        dispatcherProfile: cfg.dispatcherProfilesById.get('eta')!,
        trafficProfiles: cfg.trafficProfiles,
        elevatorSpecs: cfg.elevatorSpecs,
        seed: SEED,
        onTimeout: 'report',
      });
    const base = { floors: 96, cars: 8, populationPerFloor: 8 } as const;

    const capped = run(tower(cfg, { ...base, ratedSpeedMps: 14 }));
    const slow = run(tower(cfg, { ...base, ratedSpeedMps: 10 }));
    const fast = run(tower(cfg, { ...base, ratedSpeedMps: 14, cabinPressurised: true }));

    expect(fingerprint(capped)).not.toBe(fingerprint(slow));
    expect(fingerprint(capped)).not.toBe(fingerprint(fast));
    // Non-vacuity: the two references really are different runs, so "not equal to either" is a
    // statement about a third thing rather than about three unrelated numbers.
    expect(fingerprint(slow)).not.toBe(fingerprint(fast));
    // And the config the runs were built from is the one this case claims: rated speed untouched,
    // descent capped, on the arm in the middle.
    expect(carOf(tower(cfg, { ...base, ratedSpeedMps: 14 }))?.ratedSpeedMps).toBe(14);
    expect(carOf(tower(cfg, { ...base, ratedSpeedMps: 14 }))?.descentSpeedMps).toBe(10);
  }, 180_000);
});
