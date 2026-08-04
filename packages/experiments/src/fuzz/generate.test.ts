/**
 * What the generator is, and what the always-on corpus actually covers.
 *
 * Two jobs. The first is the generator's own contract: a case is a pure function of its seed,
 * and every case it emits is a config the **real** loader accepts — a fuzzer that emitted
 * invalid configs would be testing `buildingConfigSchema` and reporting it as a simulator
 * finding.
 *
 * The second is the one that stops the corpus quietly narrowing. `campaign.ts` makes a list of
 * claims about what the pinned seeds cover — every topology, single-car banks, access zones with
 * and without a credential at the landing, basements, two entrances, mixed-use, degenerate
 * rises. Those claims are the whole basis for calling 60 replications a gate rather than a
 * gesture, and prose cannot enforce them: a generator edit that made `shuttle` unreachable, or
 * that stopped producing access zones, would leave the corpus green and the claim false. So the
 * claims are asserted here against exactly the pinned seeds.
 */

import {
  CALL_TYPES,
  loadConfig,
  type CallType,
  type DispatcherProfile,
  type LoadedConfig,
} from '@elevator-sim/core';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import { DEEP_SPACE, STANDARD_CORPUS, deepSeeds } from './campaign.js';
import {
  GENERATED_CALL_TYPES,
  callCarriesCredential,
  carriesCallType,
  caseFromSeed,
  legalCallTypesFor,
  minDurationFor,
  resolveCase,
  STANDARD_SPACE,
} from './generate.js';
import {
  CORPUS_DISPATCHER_PROFILE_IDS,
  CORPUS_TRAFFIC_PROFILE_IDS,
  assertCarriesCallType,
  generateOptionsFrom,
  withCallType,
} from './run.js';
import { FUZZ_TOPOLOGIES, type FuzzCase } from './types.js';

const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

let config: LoadedConfig;
let corpus: FuzzCase[];

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  const options = generateOptionsFrom(config);
  corpus = STANDARD_CORPUS.map((seed) => caseFromSeed(seed, options));
}, 60_000);

describe('a case is a function of its seed', () => {
  it('reproduces bit-identically from the same seed', () => {
    const options = generateOptionsFrom(config);
    for (const seed of STANDARD_CORPUS.slice(0, 12)) {
      expect(JSON.stringify(caseFromSeed(seed, options))).toBe(
        JSON.stringify(caseFromSeed(seed, options)),
      );
    }
  });

  it('gives different seeds different buildings', () => {
    const shapes = new Set(corpus.map((entry) => JSON.stringify(entry.building)));
    // Not `=== corpus.length`: two seeds are allowed to collide on a two-floor building. What
    // would be worthless is a generator whose seed barely moves the configuration.
    expect(shapes.size).toBeGreaterThan(corpus.length - 3);
  });
});

describe('every generated case is one the real loader accepts', () => {
  it('parses and resolves, with floors ordered and banks consistent', () => {
    const options = generateOptionsFrom(config);
    for (const entry of corpus) {
      const building = resolveCase(entry, options);

      // `resolveBuilding` already refuses a shaft whose heights disagree with its floor order;
      // re-asserted here because it is the one structural property a naive generator gets wrong
      // (advancing the height by the *index* gap rather than by one storey per declared floor).
      let below = Number.NEGATIVE_INFINITY;
      let belowIndex = Number.NEGATIVE_INFINITY;
      for (const floor of building.floors) {
        expect(floor.index).toBeGreaterThan(belowIndex);
        expect(floor.heightM).toBeGreaterThan(below);
        below = floor.heightM;
        belowIndex = floor.index;
      }

      const floorIds = new Set(building.floors.map((floor) => floor.id));
      for (const bank of building.banks) {
        expect(bank.servesFloors.length).toBeGreaterThanOrEqual(2);
        expect(bank.cars.length).toBeGreaterThanOrEqual(1);
        for (const floorId of bank.servesFloors) expect(floorIds.has(floorId)).toBe(true);
      }
      for (const zone of building.accessZones) {
        for (const floorId of zone.floors) expect(floorIds.has(floorId)).toBe(true);
      }
      expect(building.entranceFloors.length).toBeGreaterThanOrEqual(1);
      expect(building.totalPopulation).toBeGreaterThan(0);

      // A demand template that cannot resolve at this horizon throws inside `generateTrace`, and
      // a case that cannot run is a case that proves nothing.
      expect(entry.durationS).toBeGreaterThanOrEqual(minDurationFor(entry.demandTemplate));
    }
  });

  it('never generates a building whose access zones make a route impossible', () => {
    // An access-restricted transfer floor produces a journey no credential can complete, and
    // the trace generator correctly refuses to generate the trip — which would silently narrow
    // the demand rather than test anything. Entrances are excluded for the same reason.
    for (const entry of corpus) {
      const restricted = new Set((entry.building.accessZones ?? []).flatMap((zone) => zone.floors));
      for (const floor of entry.building.floors ?? []) {
        if (!restricted.has(floor.id)) continue;
        expect(floor.isEntrance).not.toBe(true);
        expect(floor.isTransferFloor).not.toBe(true);
      }
    }
  });
});

describe('what the pinned corpus covers', () => {
  const tagsOf = (): Set<string> => new Set(corpus.flatMap((entry) => entry.tags));

  it('reaches every topology', () => {
    const seen = new Set(corpus.map((entry) => entry.topology));
    for (const topology of FUZZ_TOPOLOGIES) expect(seen).toContain(topology);
  });

  it('reaches every structural condition the corpus claims', () => {
    const tags = tagsOf();
    for (const claim of [
      'degenerate-rise',
      'single-car-banks',
      'access-zones',
      'access-lockout',
      'basement',
      'two-entrances',
      'mixed-use',
      // Added when `CarConfig.mode` and `BuildingConfig.serviceEvents` became authorable. Both
      // axes were recorded as *excluded* from the campaign for want of a `core` change; they are
      // no longer excluded, and these two claims are what stops that quietly reversing.
      'initial-service-mode',
      'service-schedule',
      // A car that leaves the group and comes back, which is a different run from one that
      // leaves and does not — the returning car re-enters group control and the retry timer
      // picks it up. Both must be reachable, so both are asserted.
      'service-return',
    ]) {
      expect(tags, `corpus no longer covers "${claim}"`).toContain(claim);
    }
    expect(
      corpus.some((entry) => entry.tags.includes('service-schedule') && !entry.tags.includes('service-return')),
      'no pinned case withdraws a car for the rest of the run',
    ).toBe(true);
  });

  it('reaches every rung of the ladder and most of the shipped dispatcher set', () => {
    // All three, not "at least two": the middle rung was for one wave a stated gap, and a corpus
    // that drifted back to the two ends would satisfy the old bound while covering less.
    const callTypes = new Set(corpus.map((entry) => entry.callType));
    expect([...callTypes].sort()).toEqual(['destination-entry', 'mobile-credential', 'up-down-buttons']);

    const dispatchers = new Set(corpus.map((entry) => entry.dispatcherProfileId));
    const shipped = config.dispatcherProfiles.profiles.length;
    expect(dispatchers.size).toBeGreaterThanOrEqual(shipped - 2);
  });

  it('spans the declared space, and states its own ceiling', () => {
    const floorCounts = corpus.map((entry) => (entry.building.floors ?? []).length);
    expect(Math.min(...floorCounts)).toBe(STANDARD_SPACE.minFloors);
    expect(Math.max(...floorCounts)).toBeGreaterThanOrEqual(STANDARD_SPACE.maxFloors - 2);
    // The ceiling is the thing the deep campaign exists to go past. Asserted so the
    // "what the always-on corpus does not cover" claim in `campaign.ts` cannot go stale.
    expect(Math.max(...floorCounts)).toBeLessThanOrEqual(STANDARD_SPACE.maxFloors);
    for (const entry of corpus) {
      expect(entry.durationS).toBeLessThanOrEqual(STANDARD_SPACE.maxDurationS);
      expect(entry.arrivalRatePctPop5min).toBeLessThanOrEqual(
        STANDARD_SPACE.maxArrivalRatePctPop5min,
      );
      // `constant-iso` needs a 20-minute horizon before it has a measurement window, so the
      // always-on corpus is entirely rise-and-fall. Stated, not assumed.
      expect(entry.demandTemplate).toBe('rise-and-fall');
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The call type is drawn against the profile, not beside it (finding C32)
 * -------------------------------------------------------------------------- */

/** A minimal profile, so the rule is exercised past whatever `data/` happens to ship today. */
function probe(over: Partial<DispatcherProfile>): DispatcherProfile {
  return { id: 'probe', name: 'Probe', weights: { waitTime: 1 }, ...over };
}

describe('legalCallTypesFor — the rule, taken from the schema rather than a list', () => {
  it('refuses the pair the real resolver refuses, on both of its grounds', () => {
    // A panel that cannot ask for a destination is an up/down button (§ T16-D1) …
    const panel = probe({ dispatch: { passengerAssignment: 'panel' } });
    expect(carriesCallType(panel, 'up-down-buttons')).toBe(false);
    expect(carriesCallType(panel, 'destination-entry')).toBe(true);
    expect(carriesCallType(panel, 'mobile-credential')).toBe(true);

    // … and a destination dispatcher must name the car at the landing, so it cannot defer.
    const deferred = probe({ dispatch: { assignmentTiming: 'deferred', deferWindowS: 1.5 } });
    expect(carriesCallType(deferred, 'destination-entry')).toBe(false);
    expect(carriesCallType(deferred, 'up-down-buttons')).toBe(true);
    expect(carriesCallType(deferred, 'mobile-credential')).toBe(true);
  });

  it('refuses a call type that would leave a weight the profile authored inert', () => {
    // Nothing throws for this pair — it runs, and `rideTime` returns 0 for every candidate car, so
    // the case measures `eta` under a destination profile's name. That is the half of C32 no
    // exception was ever going to catch.
    const destination = probe({ weights: { waitTime: 0.5, rideTime: 0.5 } });
    expect(carriesCallType(destination, 'up-down-buttons')).toBe(false);
    expect(carriesCallType(destination, 'destination-entry')).toBe(true);
    expect(carriesCallType(destination, 'mobile-credential')).toBe(true);
  });

  it('does not constrain a gated tunable the profile left at its declared default', () => {
    // The default comparison is what makes the rule safe to apply to the whole schema: a weight of
    // zero on the gated term is not a request, so nothing is being switched off.
    expect(carriesCallType(probe({ weights: { waitTime: 1, rideTime: 0 } }), 'up-down-buttons')).toBe(
      true,
    );
    expect(
      carriesCallType(probe({ dispatch: { passengerAssignment: 'none' } }), 'up-down-buttons'),
    ).toBe(true);
  });

  it('leaves an ungated profile every rung of the ladder, and draws all of them', () => {
    const plain = probe({});
    for (const callType of CALL_TYPES) expect(carriesCallType(plain, callType)).toBe(true);
    expect(legalCallTypesFor(plain)).toEqual([...GENERATED_CALL_TYPES]);
    expect(GENERATED_CALL_TYPES).toEqual([...CALL_TYPES]);
  });

  it('throws on a pair the generator could not have produced, rather than rewriting it', () => {
    // The seam `run.ts` puts between the generator and the simulator. A pair that gets here is a
    // generator bug and is thrown loudly, on the same rule as an unroutable building: a case the
    // campaign quietly rewrote would report on a configuration nobody asked for.
    const panel = probe({ dispatch: { passengerAssignment: 'panel' } });
    expect(() => {
      assertCarriesCallType(panel, 'up-down-buttons');
    }).toThrow(/cannot carry/);
    expect(() => {
      assertCarriesCallType(panel, 'mobile-credential');
    }).not.toThrow();
  });

  it('answers the credential question beside the profile, in both directions', () => {
    /*
     * `costRequestFor` is `callType === 'mobile-credential' || call.panelAuthorized === true`, and
     * `Simulation.#callValue` sets `panelAuthorized` on every destination-dispatch run. So the
     * middle rung of the ladder carries a credential beside a panel and carries none beside a
     * conventional profile — the fact that makes the access-zone arm three-way rather than two-way,
     * and the fact `properties.ts` needs in order to agree with the simulator about who is servable.
     */
    const plain = probe({});
    const panel = probe({ dispatch: { passengerAssignment: 'panel' } });

    expect(callCarriesCredential(plain, 'up-down-buttons')).toBe(false);
    expect(callCarriesCredential(plain, 'destination-entry')).toBe(false);
    expect(callCarriesCredential(plain, 'mobile-credential')).toBe(true);

    expect(callCarriesCredential(panel, 'destination-entry')).toBe(true);
    expect(callCarriesCredential(panel, 'mobile-credential')).toBe(true);
    // The pair `resolveDispatchConfig` refuses has no run to be true of, and the predicate says so
    // by falling back to the call type alone rather than throwing into a property check.
    expect(callCarriesCredential(panel, 'up-down-buttons')).toBe(false);

    // And on the shipped data rather than only on a probe: `destination-panel` is the one profile
    // for which the middle rung is credentialed, which is why it is the one profile whose
    // access-zoned `destination-entry` cases are not lockouts.
    for (const profile of config.dispatcherProfiles.profiles) {
      const isPanel = profile.dispatch?.passengerAssignment === 'panel';
      expect(
        callCarriesCredential(profile, 'destination-entry'),
        `"${profile.id}" disagrees with its own passengerAssignment`,
      ).toBe(isPanel);
      expect(callCarriesCredential(profile, 'mobile-credential')).toBe(true);
    }
  });

  it('reports the shipped table, so a `data/` edit that changes it fails here', () => {
    /*
     * The measured state of `data/dispatcher-profiles.json` at the time C32 was closed. Pinned
     * rather than derived a second time: the point of the table is that it is a property of the
     * *data*, so a thirteenth profile — or a `dispatch.callType` added to an existing one — should
     * make this row move and say so.
     */
    const table = new Map<string, readonly CallType[]>(
      config.dispatcherProfiles.profiles.map((profile) => [
        profile.id,
        CALL_TYPES.filter((callType) => carriesCallType(profile, callType)),
      ]),
    );

    // Every profile can be run under the credentialed call type; that is what makes the
    // access-zone arm of the draw total.
    for (const [id, legal] of table) {
      expect(legal, `"${id}" cannot carry mobile-credential`).toContain('mobile-credential');
    }

    // The three constrained profiles, and the reason each is constrained.
    expect(table.get('destination-panel')).toEqual(['destination-entry', 'mobile-credential']);
    expect(table.get('destination-eta')).toEqual(['destination-entry', 'mobile-credential']);
    expect(table.get('predictive-balanced')).toEqual(['up-down-buttons', 'mobile-credential']);

    const unconstrained = [...table.entries()].filter(
      ([, legal]) => legal.length === CALL_TYPES.length,
    );
    expect(unconstrained).toHaveLength(config.dispatcherProfiles.profiles.length - 3);
  });
});

describe('what the generator draws (C32)', () => {
  /** The pinned corpus and a deep pass: 2 064 cases, generated only — no simulation. */
  const everyCase = (): FuzzCase[] => [
    ...corpus,
    ...deepSeeds(2000).map((seed) => caseFromSeed(seed, generateOptionsFrom(config, DEEP_SPACE))),
  ];

  it('never names a call type its profile cannot carry, over every pinned and 2 000 deep cases', () => {
    const profiles = new Map(config.dispatcherProfiles.profiles.map((p) => [p.id, p]));
    let checked = 0;
    for (const entry of everyCase()) {
      const profile = profiles.get(entry.dispatcherProfileId);
      expect(profile, `${entry.caseId} names an unknown dispatcher`).toBeDefined();
      if (profile === undefined) continue;
      expect(
        carriesCallType(profile, entry.callType),
        `${entry.caseId}: ${entry.dispatcherProfileId} cannot carry "${entry.callType}"`,
      ).toBe(true);
      // The seam `run.ts` puts on the same claim, exercised on the same cases.
      expect(() => {
        assertCarriesCallType(profile, entry.callType);
      }).not.toThrow();
      checked += 1;
    }
    // The count, so a corpus that silently emptied could not pass this vacuously. Derived from the
    // pinned list rather than written out: `campaign.ts` says why a number in prose goes stale.
    expect(checked).toBe(corpus.length + 2000);
  }, 120_000);

  it('leaves `withCallType` nothing to rewrite: no generated case reaches the drop', () => {
    /*
     * Before the fix this was false 1 time in the pinned corpus (`fuzz-118`) and 61 times in 2 000
     * deep cases, every one of them `destination-panel` × `up-down-buttons` — a case that named
     * Phase 6b's shipped destination dispatcher and then ran a conventional one, because the
     * override dropped `passengerAssignment` to make the profile admissible.
     *
     * `withCallType` still drops it, and still must: `validation/adversarial.test.ts` builds the
     * conventional control arm of a destination comparison with exactly that call. What is asserted
     * here is that the *generator* no longer needs it to.
     */
    const profiles = new Map(config.dispatcherProfiles.profiles.map((p) => [p.id, p]));
    for (const entry of everyCase()) {
      const profile = profiles.get(entry.dispatcherProfileId);
      if (profile === undefined) continue;
      const applied = withCallType(profile, entry.callType);
      expect(
        applied.dispatch?.passengerAssignment,
        `${entry.caseId}: withCallType had to drop passengerAssignment`,
      ).toBe(profile.dispatch?.passengerAssignment);
    }
  }, 120_000);

  it('draws all three rungs, in both corpora, and names none the profile cannot carry', () => {
    /*
     * The middle rung was for one wave a **stated gap** — `GENERATED_CALL_TYPES` was `CALL_TYPES`
     * minus `destination-entry`, and this assertion was its mirror image: `not.toContain`. It is
     * now drawn by both corpora (§ D126), and the assertion is inverted rather than deleted so the
     * gap cannot silently reopen.
     *
     * Per corpus, not pooled: a deep pass that reached all three while the always-on 64 reached two
     * would satisfy a pooled check and leave the regression suite one rung narrower than the
     * campaign it is supposed to represent.
     */
    expect(GENERATED_CALL_TYPES).toContain('destination-entry');
    const deep = deepSeeds(2000).map((seed) =>
      caseFromSeed(seed, generateOptionsFrom(config, DEEP_SPACE)),
    );
    for (const [name, cases] of [
      ['always-on', corpus],
      ['deep', deep],
    ] as const) {
      const rungs = new Set(cases.map((entry) => entry.callType));
      expect([...rungs].sort(), `the ${name} corpus does not reach every rung`).toEqual([
        'destination-entry',
        'mobile-credential',
        'up-down-buttons',
      ]);
    }
    // Measured on this tree, so the widening cannot quietly narrow back. **539 → 571 when
    // `collective-enroute` shipped** (`DECISIONS.md` § D205): the dispatcher axis gained a member,
    // so every seed re-draws and more of them land on a profile that can carry the middle rung.
    // That is the move the note above anticipated — the number is a property of `data/`, and this
    // assertion tracks the corpus **as shipped**, unlike the § D126 record below, which pins the
    // library it was measured against so its seeds keep their meaning.
    const middle = [...corpus, ...deep].filter((entry) => entry.callType === 'destination-entry');
    expect(middle.length).toBe(571);
  }, 120_000);

  it('makes the access-zone arm three-way, and the third arm depends on the profile', () => {
    /*
     * The register predicted the new arm as *"a call carrying a destination but no credential"*.
     * That is true beside a **conventional** profile and false beside a panel: `costRequestFor`
     * reads `callType === 'mobile-credential' || call.panelAuthorized === true`, and
     * `Simulation.#callValue` sets `panelAuthorized` on every destination-dispatch run because the
     * kiosk has already run the access check with the passenger's real credential (§ D30). So the
     * middle rung under access zoning is **two** arms, and both are generated:
     *
     * | arm | profiles | cases |
     * |---|---|---|
     * | destination, no credential — a lockout | the eleven conventional ones | 93 |
     * | destination **and** credential, via the panel — not a lockout | `destination-panel` | 27 |
     *
     * Both directions are asserted, because a predicate that only ever answered one way would be
     * the panel clause reading as live while being dead.
     */
    const zonedMiddle = everyCase().filter(
      (entry) => entry.callType === 'destination-entry' && entry.tags.includes('access-zones'),
    );
    const lockedOut = zonedMiddle.filter((entry) => entry.tags.includes('access-lockout'));
    const authorized = zonedMiddle.filter((entry) => !entry.tags.includes('access-lockout'));

    // 93 → 95 with the thirteenth profile, for the same re-draw reason as the middle-rung count.
    expect(lockedOut.length).toBe(95);
    // 27 → 36, the same re-draw. The split below is what this test is really about, and it is
    // asserted structurally rather than by count in both directions.
    expect(authorized.length).toBe(36);
    // The split is the *profile's*, not the draw's, so it is asserted as one: every authorized case
    // is a panel, and no locked-out case is.
    const profiles = new Map(config.dispatcherProfiles.profiles.map((p) => [p.id, p]));
    for (const entry of authorized) {
      const profile = profiles.get(entry.dispatcherProfileId);
      expect(profile?.dispatch?.passengerAssignment, `${entry.caseId} is not a panel`).toBe('panel');
    }
    for (const entry of lockedOut) {
      const profile = profiles.get(entry.dispatcherProfileId);
      expect(profile?.dispatch?.passengerAssignment, `${entry.caseId} is a panel`).not.toBe('panel');
    }
  }, 120_000);

  it('pins what widening the ladder moved, and what it did not (§ D126)', () => {
    // **This one is a record, so it declares its own dispatcher axis.** Every number below —
    // seed 118's draw, 900 of 2 064, the twelve new lockouts — was measured against the twelve
    // profiles shipped at § D126. A fuzz seed is an index into an option space whose dispatcher
    // dimension is the profile list, so shipping a thirteenth re-maps it: seed 118 drew
    // `destination-panel` then and draws `auction` now, with nothing about § D126 having changed.
    // Pinning the axis keeps the record about what it says it is about. `DECISIONS.md` § D205.
    const pinnedOptions = generateOptionsFrom(config, undefined, CORPUS_DISPATCHER_PROFILE_IDS, CORPUS_TRAFFIC_PROFILE_IDS);
    const corpus = STANDARD_CORPUS.map((seed) => caseFromSeed(seed, pinnedOptions));
    /*
     * `fuzz-118` carried C32's whole blast radius on the pinned corpus and now carries this one's.
     * It draws `destination-panel` beside an access-restricted building; C32 moved it from an
     * inadmissible `up-down-buttons` to `mobile-credential`, and widening the ladder moves it again,
     * to `destination-entry` — where it is **still not a lockout**, because the panel authorizes.
     * That single case is the whole three-way distinction in one seed somebody can type.
     *
     * Measured over both corpora: **900 of 2 064 cases change and every one of them changes only
     * `callType`** — plus twelve that also gain `access-lockout`, all twelve `destination-eta`,
     * which is the profile that can carry the middle rung and has no panel to authorize it. No
     * building, seed, horizon, arrival rate, demand template, door-obstruction probability or
     * service schedule moves anywhere, because the call type is drawn from the same position in the
     * same stream and the three-way arm reuses the roll it already spent rather than taking a
     * second one.
     */
    const moved = corpus.find((entry) => entry.fuzzSeed === '118');
    expect(moved?.dispatcherProfileId).toBe('destination-panel');
    expect(moved?.callType).toBe('destination-entry');
    expect(moved?.tags).not.toContain('access-lockout');
    expect(moved?.tags).toContain('access-zones');

    // The lockout axis on the always-on corpus is unmoved at 5 of 64: the twelve new lockouts are
    // all deep. Asserted so "the corpus grew a rung" cannot quietly mean "the corpus grew lockouts".
    expect(corpus.filter((entry) => entry.tags.includes('access-lockout'))).toHaveLength(5);
  });
});

/* -------------------------------------------------------------------------- *
 * Service mode — what the corpus emits, and the one rule it may never break
 * -------------------------------------------------------------------------- */

const SERVICE_MODES_EXPECTED = ['in-service', 'out-of-service', 'independent', 'fire-recall'];

/** Initial mode per `bankId/carId`, absent meaning the `in-service` default. */
function initialModes(entry: FuzzCase): Map<string, string> {
  const modes = new Map<string, string>();
  for (const bank of entry.building.banks) {
    for (const car of bank.cars) modes.set(`${bank.id}/${car.id}`, car.mode ?? 'in-service');
  }
  return modes;
}

describe('the service-mode axis', () => {
  it('emits both shapes: an initial mode on a car, and a mid-run schedule', () => {
    const withMode = corpus.filter((entry) =>
      entry.building.banks.some((bank) => bank.cars.some((car) => car.mode !== undefined)),
    );
    const withSchedule = corpus.filter((entry) => (entry.building.serviceEvents ?? []).length > 0);

    // Counts, not merely "at least one": a corpus that drifted down to a single case of each
    // would still satisfy a `toBeGreaterThan(0)` while covering almost nothing, and these are
    // the numbers the campaign statistics in `the root DECISIONS.md` are quoted from.
    expect(withMode.map((entry) => entry.fuzzSeed)).toEqual([
      '101', '102', '107', '111', '116', '121', '128', '137', '181',
    ]);
    expect(withSchedule.map((entry) => entry.fuzzSeed)).toEqual([
      '101', '107', '108', '113', '129', '131', '141', '142', '144', '156', '193',
    ]);
  });

  it('reaches all four service modes, and both the qualified and unqualified event form', () => {
    const seen = new Set<string>();
    let qualified = 0;
    let unqualified = 0;
    for (const entry of corpus) {
      for (const bank of entry.building.banks) {
        for (const car of bank.cars) if (car.mode !== undefined) seen.add(car.mode);
      }
      for (const event of entry.building.serviceEvents ?? []) {
        seen.add(event.mode);
        if (event.bankId === undefined) unqualified += 1;
        else qualified += 1;
      }
    }
    for (const mode of SERVICE_MODES_EXPECTED) {
      expect(seen, `no pinned case reaches service mode "${mode}"`).toContain(mode);
    }
    // `bankId` is optional and generated car ids are unique building-wide, so both resolution
    // paths in `resolveBuilding` are real and both are exercised.
    expect(qualified).toBeGreaterThan(0);
    expect(unqualified).toBeGreaterThan(0);
  });

  it('never withdraws every serving car from a bank, at any instant of any case', () => {
    /*
     * The construction rule `generate.ts` § "Service mode is generated" states, asserted rather
     * than trusted. A bank with no `in-service` car cannot collect its landings, and
     * `properties.ts` `isServable` reasons about topology and credentials — not about service
     * mode — so it would call those passengers servable and P5 would report a deadlock. That
     * report would be *correct*, and it would be a generator artefact rather than a simulator
     * finding. The corner is covered on purpose elsewhere (`validation/adversarial.test.ts`,
     * `core/src/sim/serviceMode.test.ts`), where the expected `timed-out` status is asserted.
     *
     * Replayed in authored order, because that is the order the kernel fires the schedule in
     * (CLAUDE.md invariant 4).
     */
    for (const entry of corpus) {
      const modes = initialModes(entry);
      const servingIn = (bankId: string): number =>
        [...modes.entries()].filter(([key, mode]) => key.startsWith(`${bankId}/`) && mode === 'in-service')
          .length;

      const check = (when: string): void => {
        for (const bank of entry.building.banks) {
          expect(
            servingIn(bank.id),
            `${entry.caseId}: bank "${bank.id}" has no in-service car ${when}`,
          ).toBeGreaterThan(0);
        }
      };
      check('at t=0');

      for (const event of entry.building.serviceEvents ?? []) {
        const holder = entry.building.banks.find(
          (bank) =>
            (event.bankId === undefined || bank.id === event.bankId) &&
            bank.cars.some((car) => car.id === event.carId),
        );
        expect(holder, `${entry.caseId}: service event names a car no bank declares`).toBeDefined();
        if (holder === undefined) continue;
        modes.set(`${holder.id}/${event.carId}`, event.mode);
        check(`after the event at ${String(event.atS)} s`);
      }
    }
  });

  it('schedules every event inside its own run, so none is refused as past the deadline', () => {
    // `sim/simulation.ts` `#scheduleServiceEvents` refuses an entry past the drain deadline and
    // warns. A refused entry makes the case silently inert — it authors a mode change that never
    // happens — which is a fuzz case that proves nothing.
    for (const entry of corpus) {
      for (const event of entry.building.serviceEvents ?? []) {
        expect(event.atS).toBeGreaterThanOrEqual(0);
        expect(event.atS, `${entry.caseId}: event at ${String(event.atS)} s outruns its own horizon`)
          .toBeLessThan(entry.durationS);
      }
    }
  });
});
