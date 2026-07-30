/**
 * The four editors' models, against the loader and the engine that consume them.
 *
 * The tests that matter here are not the round trips — those are cheap and they are below. They
 * are the **anti-inertness** ones: for each editor, a control is moved and the run is required to
 * *change*. This repository has shipped a configurable, unit-tested, never-consulted behaviour
 * eleven times, once in `data/`, and a slider is the easiest place in the product to ship the
 * twelfth. `docs/05-roadmap.md`'s standing requirement is the rule; this file is the mechanism.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  RoutePlanner,
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
  type DispatcherProfile,
  type ElevatorSpecs,
  type SimulationConfig,
  type TrafficProfiles,
} from '@elevator-sim/core/browser';

import { recordRun } from '../record/recordRun.js';

import {
  BLANK_SPEC,
  accessZonesOf,
  banksOf,
  buildingFromSpec,
  canExpress,
  credentialGroupsOf,
  floorIdOf,
  nextZoneId,
  occupancyLine,
  orphanFloors,
  personsOf,
  servesLobby,
  specFromBuilding,
  specIsDirty as buildingSpecIsDirty,
  totalPopulation,
  unreachableFloors,
  validateSpec,
  withZoneFloor,
  withZoneGroup,
  zoneFloorsOf,
  type BuildingSpec,
} from './buildingSpec.js';
import {
  DEFAULT_LEVERS,
  DWELL_SETTINGS,
  costFunctionLine,
  doorTimingFor,
  inertTerms,
  profileFromSpec,
  specFromProfile,
  specIsDirty,
} from './dispatcherSpec.js';
import {
  classFromSpec,
  classesFromSpecs,
  machineIsDirty,
  specFromClass,
  specsWithClass,
} from './machineSpec.js';
import {
  DEFAULT_PATTERN,
  PEAK_ORDER_INFO,
  demandFromSpec,
  patternIsDirty,
  rowsFor,
  specFromTrafficProfile,
  trafficProfilesWithPattern,
} from './patternSpec.js';

const DATA = new URL('../../../../data/', import.meta.url);
const read = (path: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, DATA)), 'utf8')) as unknown;

const SPECS: ElevatorSpecs = parseElevatorSpecs(read('elevator-specs.json'));
const TRAFFIC: TrafficProfiles = parseTrafficProfiles(read('traffic-profiles.json'));
const PROFILES = parseDispatcherProfiles(read('dispatcher-profiles.json'));
const BUILDING_IDS = [
  'garden-apartments',
  'midtown-office',
  'secure-tower',
  'mixed-use-high-rise',
  'vertical-city',
] as const;

function configFor(
  profile: DispatcherProfile,
  overrides: Partial<SimulationConfig> = {},
): SimulationConfig {
  const building = resolveBuilding(parseBuilding(read('buildings/midtown-office.json')), SPECS);
  return {
    building,
    dispatcherProfile: profile,
    trafficProfiles: TRAFFIC,
    elevatorSpecs: SPECS,
    dispatcherProfiles: PROFILES,
    seed: 20260730n,
    durationS: 600,
    onTimeout: 'report',
    ...overrides,
  };
}

/* ========================================================================== *
 * The dispatcher editor
 * ========================================================================== */

describe('the dispatcher spec', () => {
  it('round-trips every shipped profile without changing what it means', () => {
    for (const profile of PROFILES.profiles) {
      const spec = specFromProfile(profile, profile.name);
      const rebuilt = profileFromSpec(spec, { id: profile.id, base: profile });
      // The weight vector is the dispatcher (invariant 7), so it is what must survive exactly.
      expect(rebuilt.weights).toStrictEqual(
        Object.fromEntries(
          Object.entries(profile.weights ?? {}).filter(([, weight]) => weight > 0),
        ),
      );
      // And the spec read back off the rebuilt profile must be the spec we started from.
      expect(specFromProfile(rebuilt, spec.name)).toStrictEqual(spec);
    }
  });

  it('never writes a weight of zero', () => {
    const spec = specFromProfile(PROFILES.profiles[0] as DispatcherProfile, 'x');
    const withZero = { ...spec, weights: { ...spec.weights, stopCount: 0 } };
    const profile = profileFromSpec(withZero, { id: 'yours-1' });
    expect(Object.values(profile.weights ?? {})).not.toContain(0);
    expect(profile.weights?.['stopCount']).toBeUndefined();
  });

  it('names rideTime as inert until the call carries a destination — § D112’s defect as a rule', () => {
    const base = specFromProfile(PROFILES.profiles[0] as DispatcherProfile, 'x');
    const weighted = { ...base, weights: { ...base.weights, rideTime: 50 }, flags: { ...base.flags, pool: false } };
    expect(inertTerms(weighted).map((entry) => entry.termId)).toStrictEqual(['rideTime']);
    const pooled = { ...weighted, flags: { ...weighted.flags, pool: true } };
    expect(inertTerms(pooled)).toStrictEqual([]);
  });

  it('reports dirty exactly when something moved', () => {
    const profile = PROFILES.profiles.find((p) => p.id === 'eta') as DispatcherProfile;
    const spec = specFromProfile(profile, 'eta');
    expect(specIsDirty(spec, profile)).toBe(false);
    expect(specIsDirty({ ...spec, weights: { ...spec.weights, starvation: 30 } }, profile)).toBe(true);
    expect(specIsDirty({ ...spec, flags: { ...spec.flags, bypass: false } }, profile)).toBe(true);
    // A rename alone is not a change to the dispatcher.
    expect(specIsDirty({ ...spec, name: 'Something else' }, profile)).toBe(false);
  });

  it('produces a bit-identical run when nothing was edited — the strong form of the round trip', () => {
    /*
     * The round trip above compares documents; this compares *runs*, which is the claim that
     * matters. Opening a shipped dispatcher in the editor and saving it untouched must not change
     * a single boarding — otherwise the editor is a quiet fork, and a reader comparing "mine"
     * against "eta" would be comparing two things that both call themselves eta.
     *
     * The default levers are part of the claim: `normal` dwell is the reference data's own typical
     * hold and `bypass` on is its own 0.8, so the defaults resolve to the shipped behaviour rather
     * than merely near it.
     */
    for (const id of ['collective', 'eta', 'energy-aware', 'predictive-balanced']) {
      const profile = PROFILES.profiles.find((p) => p.id === id) as DispatcherProfile;
      const rebuilt = profileFromSpec(specFromProfile(profile, profile.name), {
        id: profile.id,
        base: profile,
        levers: DEFAULT_LEVERS,
      });
      const before = recordRun(configFor(profile), { recordDecisions: false }).result.record;
      const after = recordRun(configFor(rebuilt), { recordDecisions: false }).result.record;
      expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    }
  });

  it('writes a cost line that names every weighted term and nothing else', () => {
    const profile = PROFILES.profiles.find((p) => p.id === 'energy-aware') as DispatcherProfile;
    const line = costFunctionLine(specFromProfile(profile, 'x'), (id) => id);
    for (const [term, weight] of Object.entries(profile.weights ?? {})) {
      if (weight > 0) expect(line).toContain(term);
    }
    expect(line).not.toContain('rideTime');
  });
});

describe('the dispatcher editor is not decoration', () => {
  /*
   * Each case moves one control and requires the run to differ. The comparison is on the *legs* —
   * who was carried by which car and when — rather than on a window statistic, because a summary
   * over the peak five minutes can legitimately be equal for two visibly different runs, which is
   * a trap this file walked into once already.
   */
  const fingerprint = (config: SimulationConfig): string =>
    JSON.stringify(
      recordRun(config, { recordDecisions: false }).recording.legs.map((leg) => [
        leg.passengerId,
        leg.carId ?? '',
        leg.boardedAt ?? -1,
      ]),
    );

  const eta = PROFILES.profiles.find((p) => p.id === 'eta') as DispatcherProfile;
  const base = specFromProfile(eta, 'eta');
  const control = fingerprint(configFor(profileFromSpec(base, { id: 'x', base: eta })));

  /*
   * The load sensor only does anything to a car that fills up, so the arm that exercises it runs
   * at a demand that fills one. At the building's shipped 12 %pop/5 min over ten minutes no car
   * on Midtown Office reaches 80 % and the two arms are identical — which is a true statement
   * about that operating point and a useless test of the control.
   */
  const BUSY = { demand: { arrivalRatePctPop5min: 24 } } satisfies Partial<SimulationConfig>;
  const busyControl = fingerprint(configFor(profileFromSpec(base, { id: 'x', base: eta }), BUSY));

  it('a weight the reader moves changes the run', () => {
    const moved = { ...base, weights: { ...base.weights, starvation: 90, distanceTravelled: 60 } };
    expect(fingerprint(configFor(profileFromSpec(moved, { id: 'x', base: eta })))).not.toBe(control);
  });

  it('turning the load sensor off changes the run, once a car is full enough for it to matter', () => {
    const blind = { ...base, flags: { ...base.flags, bypass: false } };
    expect(fingerprint(configFor(profileFromSpec(blind, { id: 'x', base: eta }), BUSY))).not.toBe(
      busyControl,
    );
  });

  it('the zoning flag changes the run', () => {
    const zoned = { ...base, flags: { ...base.flags, zone: true } };
    expect(fingerprint(configFor(profileFromSpec(zoned, { id: 'x', base: eta })))).not.toBe(control);
  });

  it('the parking and zoning levers each change the run', () => {
    const withLevers = (levers: Parameters<typeof profileFromSpec>[1]['levers']): string =>
      fingerprint(configFor(profileFromSpec(base, { id: 'x', base: eta, levers })));
    expect(withLevers({ ...DEFAULT_LEVERS, parking: true })).not.toBe(control);
    expect(withLevers({ ...DEFAULT_LEVERS, express: true })).not.toBe(control);
  });

  it('the three dwell chips are three genuinely different buildings-in-service', () => {
    /*
     * The chips write `dwellCarCallS`/`dwellHallCallS` onto the cars and `dwellPolicy` onto the
     * profile, so the arm has to rebuild the building as well as the profile. The first attempt at
     * this control wrote `answer.maxDwellS` alone and produced three byte-identical runs — under
     * the default `dwellPolicy: 'fixed'` that field only bounds the transfer. See
     * `dispatcherSpec.ts`'s DwellSetting.
     */
    const runWith = (dwell: 'snappy' | 'normal' | 'patient'): string => {
      const levers = { ...DEFAULT_LEVERS, dwell };
      const timing = doorTimingFor(levers);
      const spec: BuildingSpec = { ...BLANK_SPEC, floors: 10, cars: 3 };
      const building = resolveBuilding(
        parseBuilding(buildingFromSpec(spec, { specs: SPECS, dwell: timing }) as unknown),
        SPECS,
      );
      return fingerprint(
        configFor(profileFromSpec(base, { id: 'x', base: eta, levers }), { building }),
      );
    };
    expect(new Set([runWith('snappy'), runWith('normal'), runWith('patient')]).size).toBe(3);
  });

  it('takes its dwell seconds from the shipped bands, not from an invented number', () => {
    const hall = SPECS.doors.dwellHallCallS;
    const car = SPECS.doors.dwellCarCallS;
    expect(DWELL_SETTINGS.snappy.dwellHallCallS).toBe(hall.min);
    expect(DWELL_SETTINGS.normal.dwellHallCallS).toBe(hall.typical);
    expect(DWELL_SETTINGS.patient.dwellHallCallS).toBe(hall.max);
    expect(DWELL_SETTINGS.snappy.dwellCarCallS).toBe(car.min);
    expect(DWELL_SETTINGS.normal.dwellCarCallS).toBe(car.typical);
    expect(DWELL_SETTINGS.patient.dwellCarCallS).toBe(car.max);
    // Adaptive dwell needs a ceiling at least the larger base dwell, or `resolveDoorConfig` throws.
    expect(DWELL_SETTINGS.patient.maxDwellS).toBeGreaterThanOrEqual(hall.max);
  });
});

/* ========================================================================== *
 * The traffic editor
 * ========================================================================== */

describe('the traffic spec', () => {
  it('reads each shipped profile into an order that matches its governing peak', () => {
    for (const profile of TRAFFIC.profiles) {
      const spec = specFromTrafficProfile(TRAFFIC, profile.id);
      expect(spec.ratePctPop5min).toBe(profile.arrivalRatePctPop5min.typical);
      expect(spec.batchMean).toBe(profile.batchSize.mean);
      if (profile.governingPeak === 'two-way') expect(spec.order).toBe('two-way');
      else if (profile.governingPeak.startsWith('down')) expect(spec.order).toBe('down-first');
      else expect(spec.order).toBe('up-first');
    }
  });

  it('keeps the directional split summing to one as interfloor is dragged', () => {
    for (const share of [0, 0.1, 0.35, 0.7]) {
      const { demand } = demandFromSpec({ ...DEFAULT_PATTERN, interfloorShare: share });
      const split = demand.directionalSplit;
      if (split === undefined) continue;
      expect(split.incoming + split.outgoing + split.interfloor).toBeCloseTo(1, 6);
      expect(split.interfloor).toBeCloseTo(share, 6);
    }
  });

  it('keeps the incoming/outgoing ratio while interfloor moves — an up-peak stays an up-peak', () => {
    const at = (share: number): number => {
      const split = demandFromSpec({ ...DEFAULT_PATTERN, interfloorShare: share }).demand.directionalSplit;
      return split === undefined ? 0 : split.incoming / Math.max(1e-9, split.outgoing);
    };
    expect(at(0.5)).toBeCloseTo(at(0.1), 1);
  });

  it('hands the two-way order to the lunch template and hides the mix slider elsewhere', () => {
    expect(PEAK_ORDER_INFO['two-way'].template).toBe('lunch-two-way');
    expect(demandFromSpec({ ...DEFAULT_PATTERN, order: 'two-way' }).demand.mixAmplitude).toBeDefined();
    expect(demandFromSpec(DEFAULT_PATTERN).demand.mixAmplitude).toBeUndefined();
    expect(rowsFor(DEFAULT_PATTERN).map((row) => row.key)).not.toContain('mixAmplitude');
    expect(rowsFor({ ...DEFAULT_PATTERN, order: 'two-way' }).map((row) => row.key)).toContain(
      'mixAmplitude',
    );
  });

  it('reports dirty exactly when something moved', () => {
    expect(patternIsDirty(DEFAULT_PATTERN, DEFAULT_PATTERN)).toBe(false);
    expect(patternIsDirty({ ...DEFAULT_PATTERN, ratePctPop5min: 20 }, DEFAULT_PATTERN)).toBe(true);
    expect(patternIsDirty({ ...DEFAULT_PATTERN, name: 'x' }, DEFAULT_PATTERN)).toBe(false);
  });
});

describe('the traffic editor is not decoration', () => {
  const eta = PROFILES.profiles.find((p) => p.id === 'eta') as DispatcherProfile;
  const runWith = (spec: Parameters<typeof demandFromSpec>[0]): string => {
    const { demandTemplate, demand } = demandFromSpec(spec);
    const recording = recordRun(configFor(eta, { demandTemplate, demand }), {
      recordDecisions: false,
    }).recording;
    return JSON.stringify([recording.legs.length, recording.summary.handlingCapacity.offeredPer5Min]);
  };
  const control = runWith(DEFAULT_PATTERN);

  it('the peak demand slider changes how many people turn up', () => {
    expect(runWith({ ...DEFAULT_PATTERN, ratePctPop5min: 20 })).not.toBe(control);
  });

  it('the peak-hold slider changes the run', () => {
    expect(runWith({ ...DEFAULT_PATTERN, peakWindowS: 600 })).not.toBe(control);
  });

  it('the peak order changes the run', () => {
    expect(runWith({ ...DEFAULT_PATTERN, order: 'down-first' })).not.toBe(control);
  });

  it('the interfloor slider changes the run', () => {
    expect(runWith({ ...DEFAULT_PATTERN, interfloorShare: 0.6 })).not.toBe(control);
  });

  it('the off-peak level changes the run', () => {
    expect(runWith({ ...DEFAULT_PATTERN, baselineFraction: 0.8 })).not.toBe(control);
  });

  it('the mean group size changes the run — the slider that reaches the file, not the options', () => {
    /*
     * The one row on this panel with no `SimulationDemandOptions` field. Batch size lives on the
     * traffic **profile**, so the pattern widens the file the run resolves against rather than
     * writing an option that does not exist. It was drawn as a refusal for one lane's duration and
     * this is the test that says it is a control again — which matters more than most, because
     * `CLAUDE.md` says in as many words that passengers arrive in batches and that batch size
     * changes loading and stopping far more than the mean rate does.
     */
    const spec = { ...DEFAULT_PATTERN, batchMean: 3.5 };
    const widened = trafficProfilesWithPattern(TRAFFIC, 'office-standard', spec);
    const before = recordRun(configFor(eta), { recordDecisions: false }).recording;
    const after = recordRun(configFor(eta, { trafficProfiles: widened }), {
      recordDecisions: false,
    }).recording;
    expect(JSON.stringify(after.legs)).not.toBe(JSON.stringify(before.legs));
  });

  it('leaves the file byte-identical when the batch mean was not moved', () => {
    // The comparable default has to stay comparable: an override nobody asked for is a different run.
    const same = { ...DEFAULT_PATTERN, batchMean: 1.4 };
    expect(trafficProfilesWithPattern(TRAFFIC, 'office-standard', same)).toBe(TRAFFIC);
  });

  it('widens only the profile it names', () => {
    const widened = trafficProfilesWithPattern(TRAFFIC, 'office-standard', {
      ...DEFAULT_PATTERN,
      batchMean: 3.5,
    });
    for (const profile of TRAFFIC.profiles) {
      const after = widened.profiles.find((candidate) => candidate.id === profile.id);
      if (profile.id === 'office-standard') expect(after?.batchSize.mean).toBe(3.5);
      else expect(after).toStrictEqual(profile);
    }
    // And the file's other blocks travel unchanged, as `specsWithClass` requires of its own.
    expect(widened.demandTemplates).toStrictEqual(TRAFFIC.demandTemplates);
    expect(widened.passengerMass).toStrictEqual(TRAFFIC.passengerMass);
  });
});

/* ========================================================================== *
 * The machine editor
 * ========================================================================== */

describe('the machine spec', () => {
  const classes = classesFromSpecs(SPECS);

  it('reads every shipped class and round-trips it', () => {
    expect(classes).toHaveLength(SPECS.classes.length);
    for (const machineClass of classes) {
      const rebuilt = classFromSpec(specFromClass(machineClass), machineClass.id);
      expect(rebuilt.speedMinMps).toBe(machineClass.speedMinMps);
      expect(rebuilt.speedMaxMps).toBe(machineClass.speedMaxMps);
      expect(rebuilt.maxRiseM).toBe(machineClass.maxRiseM);
      expect(rebuilt.loadMinLb).toBe(machineClass.loadMinLb);
      expect(machineIsDirty(specFromClass(machineClass), machineClass)).toBe(false);
    }
  });

  it('clamps a typical speed dragged outside its own band, rather than saving a record the loader refuses', () => {
    const spec = { ...specFromClass(classes[0] as (typeof classes)[number]), speedTypicalMps: 99 };
    const made = classFromSpec(spec, 'cls-1');
    expect(made.speedTypicalMps).toBeLessThanOrEqual(made.speedMaxMps);
    expect(made.speedTypicalMps).toBeGreaterThanOrEqual(made.speedMinMps);
  });

  it('never mutates a shipped class — a saved class is an addition', () => {
    const mine = classFromSpec(
      { ...specFromClass(classes[2] as (typeof classes)[number]), name: 'Mine', maxRiseM: 400 },
      'cls-1',
    );
    const widened = specsWithClass(SPECS, mine);
    expect(widened.classes).toHaveLength(SPECS.classes.length + 1);
    // The original entry is byte-identical.
    const original = SPECS.classes.find((entry) => entry.id === 'geared-traction');
    expect(widened.classes.find((entry) => entry.id === 'geared-traction')).toStrictEqual(original);
    // And the file's shared blocks travelled with it.
    expect(widened.doors).toStrictEqual(SPECS.doors);
    expect(widened.loadSensor).toStrictEqual(SPECS.loadSensor);
  });

  it('produces a class the parser accepts', () => {
    const mine = classFromSpec(
      { ...specFromClass(classes[3] as (typeof classes)[number]), name: 'Mine' },
      'cls-1',
    );
    expect(() => parseElevatorSpecs(specsWithClass(SPECS, mine) as unknown)).not.toThrow();
  });
});

/* ========================================================================== *
 * The building editor
 * ========================================================================== */

describe('the building spec', () => {
  it('produces a document the loader parses and resolves', () => {
    const config = buildingFromSpec(BLANK_SPEC);
    expect(() => resolveBuilding(parseBuilding(config as unknown), SPECS)).not.toThrow();
  });

  it('keeps capacity and occupancy apart, and multiplies them into population', () => {
    const half: BuildingSpec = { ...BLANK_SPEC, capacityPerFloor: 100, occupancyPct: 50, floors: 10 };
    expect(totalPopulation(half)).toBe(500);
    const full: BuildingSpec = { ...half, occupancyPct: 100 };
    expect(totalPopulation(full)).toBe(1000);
    // The same building on paper: capacity did not move.
    expect(occupancyLine(half)).toContain('Capacity 1000');
    expect(occupancyLine(full)).toContain('Capacity 1000');
  });

  it('honours a per-floor override without disturbing the rest', () => {
    const spec: BuildingSpec = {
      ...BLANK_SPEC,
      floors: 4,
      capacityPerFloor: 100,
      occupancyPct: 50,
      occupancyByFloor: { 2: 0 },
    };
    expect(totalPopulation(spec)).toBe(150);
    const built = buildingFromSpec(spec);
    const floor2 = built.floors?.find((floor) => floor.index === 2);
    expect(floor2?.population).toBe(0);
    expect(built.totalPopulation).toBe(150);
  });

  it('splits the bank when a car is dragged off the rest, and every bank still reaches the lobby', () => {
    const spec: BuildingSpec = { ...BLANK_SPEC, floors: 20, cars: 4, bandByCar: { 0: [10, 20] } };
    const banks = banksOf(spec);
    expect(banks).toHaveLength(2);
    const built = buildingFromSpec(spec);
    expect(built.banks).toHaveLength(2);
    for (const bank of built.banks) expect(bank.servesFloors).toContain('G');
    expect(() => resolveBuilding(parseBuilding(built as unknown), SPECS)).not.toThrow();
  });

  it('names a floor no car reaches, rather than letting it be a slow call', () => {
    const spec: BuildingSpec = { ...BLANK_SPEC, floors: 20, cars: 1, bandByCar: { 0: [0, 10] } };
    expect(orphanFloors(spec)).toContain(20);
    expect(validateSpec(spec, undefined).join(' ')).toMatch(/No shaft serves/);
  });

  it('warns about a rise past the class envelope, and says it is an advisory rather than a refusal', () => {
    const hydraulic = classesFromSpecs(SPECS).find((entry) => entry.id === 'hydraulic');
    const spec: BuildingSpec = {
      ...BLANK_SPEC,
      floors: 30,
      specClass: 'hydraulic',
      ratedSpeedMps: 0.63,
      ratedLoadLb: 1600,
    };
    const problems = validateSpec(spec, hydraulic);
    expect(problems.join(' ')).toMatch(/reference envelope/);
    /*
     * And the loader agrees about *which kind* of problem it is. `config/parse.ts` raises the rise
     * as an advisory warning and builds the bank: "the reference envelope is application guidance,
     * not a hard limit". The editor saying "the loader refuses this" would be a false claim about a
     * mechanism — the defect class `documentation.test.ts` guards one level up — so the assertion
     * is that the building **loads**, with a warning that names the rise.
     */
    const parsed = parseBuilding(buildingFromSpec(spec, { specs: SPECS }) as unknown);
    const resolved = resolveBuilding(parsed, SPECS);
    expect(resolved.warnings.some((warning) => /rise of/.test(warning.message))).toBe(true);
  });

  it('reads every shipped building into a spec whose shape survives a rebuild', () => {
    for (const id of BUILDING_IDS) {
      const config = parseBuilding(read(`buildings/${id}.json`));
      const spec = specFromBuilding(config, id);
      expect(spec.floors).toBeGreaterThan(0);
      expect(spec.cars).toBeGreaterThan(0);
      const rebuilt = buildingFromSpec(spec, { specs: SPECS });
      // Lossy by construction (§ 4.5) — what must hold is that it is still a *building*.
      expect(() => resolveBuilding(parseBuilding(rebuilt as unknown), SPECS)).not.toThrow();
    }
  });

  it('carries a shipped building’s access zoning through the round trip rather than dropping it', () => {
    /*
     * The destructive half of the round trip, and it was silent. `specFromBuilding` read no
     * `accessZones` and `buildingFromSpec` wrote `accessZones: []` unconditionally, so opening
     * Secure Tower in the new editor and saving it untouched produced a building with **zero**
     * access zones — § D159's puzzle (locked-out legs equalling undelivered legs) disappearing
     * with nothing on screen saying so. Three shipped buildings declare zones: `secure-tower`
     * (5), `mixed-use-high-rise` (2), `vertical-city` (2).
     *
     * Asserted over all five, not only the three, because the two that declare `[]` are the arms
     * that would keep passing if the field were dropped again.
     */
    for (const id of BUILDING_IDS) {
      const config = parseBuilding(read(`buildings/${id}.json`));
      const rebuilt = buildingFromSpec(specFromBuilding(config, id), { specs: SPECS });
      expect(rebuilt.accessZones ?? [], id).toStrictEqual(config.accessZones ?? []);
    }
  });

  it('writes only the zone floors this tower has, and says what it left out', () => {
    /*
     * The floor slider and the zones are the same building, so shortening the tower has to do
     * something honest with a zone that named the top of it. `config/parse.ts` refuses a zone naming
     * a floor the building lacks, so the choice is between a document that will not load and one
     * that carries fewer floors — and the second is only defensible if the editor *says so*, which
     * is the assertion below.
     */
    const tall: BuildingSpec = {
      ...BLANK_SPEC,
      floors: 20,
      accessZones: [{ id: 'zone-1', floors: [4, 18], credentialGroups: ['alpha'] }],
    };
    expect(accessZonesOf(tall)[0]?.floors).toStrictEqual(['5', '19']);
    const short: BuildingSpec = { ...tall, floors: 8 };
    expect(accessZonesOf(short)[0]?.floors).toStrictEqual(['5']);
    expect(validateSpec(short, undefined).join(' ')).toMatch(/a floor this tower does not have/);
    // And the shortened document still loads, which is what makes the wording above the true one.
    expect(() =>
      resolveBuilding(parseBuilding(buildingFromSpec(short, { specs: SPECS }) as unknown), SPECS),
    ).not.toThrow();
  });

  it('leaves a zone that covers nothing out of the document, and does not claim a refusal', () => {
    const empty: BuildingSpec = {
      ...BLANK_SPEC,
      accessZones: [{ id: nextZoneId(BLANK_SPEC), floors: [], credentialGroups: [] }],
    };
    expect(nextZoneId(empty)).toBe('zone-2');
    expect(accessZonesOf(empty)).toStrictEqual([]);
    const said = validateSpec(empty, undefined).join(' ');
    expect(said).toMatch(/covers no floor of this building/);
    // A zone with no group is a refusal only once it covers a floor. Saying it here would be a false
    // claim about a mechanism — the document loads, because the zone is never written.
    expect(said).not.toMatch(/loader refuses/);
    expect(() =>
      resolveBuilding(parseBuilding(buildingFromSpec(empty, { specs: SPECS }) as unknown), SPECS),
    ).not.toThrow();
  });

  it('reports dirty when a zone changes, and not when a floor nothing writes is toggled', () => {
    const base: BuildingSpec = {
      ...BLANK_SPEC,
      accessZones: [{ id: 'zone-1', floors: [4], credentialGroups: ['alpha'] }],
    };
    expect(buildingSpecIsDirty(base, base)).toBe(false);
    expect(
      buildingSpecIsDirty({ ...base, accessZones: withZoneFloor(base, 'zone-1', 5) }, base),
    ).toBe(true);
    expect(
      buildingSpecIsDirty({ ...base, accessZones: withZoneGroup(base, 'zone-1', 'bravo') }, base),
    ).toBe(true);
    // A floor above the roof is never written, so pinning one is not a building that saves differently.
    expect(
      buildingSpecIsDirty(
        { ...base, accessZones: withZoneFloor(base, 'zone-1', base.floors + 4) },
        base,
      ),
    ).toBe(false);
  });

  it('takes persons from the capacities table rather than dividing by 150', () => {
    // 1600 / 150 is 10.67; the table says 10, and a car capacity is a denominator.
    expect(personsOf(1600)).toBe(10);
    for (const entry of SPECS.capacities) {
      expect(personsOf(entry.ratedLoadLb)).toBe(entry.personsUS);
    }
  });
});

describe('the building editor is not decoration', () => {
  const eta = PROFILES.profiles.find((p) => p.id === 'eta') as DispatcherProfile;
  const runWith = (spec: BuildingSpec): string => {
    const building = resolveBuilding(
      parseBuilding(buildingFromSpec(spec, { specs: SPECS }) as unknown),
      SPECS,
    );
    const recording = recordRun(configFor(eta, { building }), { recordDecisions: false }).recording;
    /*
     * The legs, not the counts. Pinning one shaft to a band does not change how many people turn
     * up — it changes **which car answers them**, and a fingerprint of four counts cannot see that.
     * The first version of this test could not, and passed for the wrong reason.
     */
    return JSON.stringify([
      recording.shafts.map((shaft) => shaft.servedFloorIds.join('/')),
      recording.legs.map((leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1]),
    ]);
  };
  const spec: BuildingSpec = { ...BLANK_SPEC, floors: 10, cars: 3 };
  const control = runWith(spec);

  it('adding a shaft changes the run', () => {
    expect(runWith({ ...spec, cars: 5 })).not.toBe(control);
  });

  it('the occupancy slider changes how many people the lifts must move', () => {
    expect(runWith({ ...spec, occupancyPct: 40 })).not.toBe(control);
  });

  it('the floor count changes the run', () => {
    expect(runWith({ ...spec, floors: 16 })).not.toBe(control);
  });

  it('a pinned shaft band changes which car answers', () => {
    const pinned = runWith({ ...spec, bandByCar: { 0: [6, 10] } });
    expect(pinned).not.toBe(control);
  });

  it('the express toggle changes the run — and it is the legs that move, not just the label', () => {
    /*
     * The handoff's per-shaft express toggle, § 1.3 M11. The two arms are the same three cars and
     * the same band on car A; the only difference is whether A stops at the lobby on its way there.
     *
     * The comparison is deliberately split. The whole fingerprint would differ the moment `G` left
     * `servedFloorIds`, and that is a *label* changing, not a run — precisely the false positive
     * this block's `shafts[].servedFloorIds` was added to close in the other direction. So the
     * served floors are asserted for what they say, and the **legs** are asserted separately to
     * differ. A toggle that only rewrote the shaft's floor list would pass the first and fail the
     * second, which is the failure this test exists to produce.
     */
    const express: BuildingSpec = { ...spec, bandByCar: { 0: [6, 10] } };
    const closed: BuildingSpec = { ...express, noLobby: { 0: true } };

    const partsOf = (of: BuildingSpec): readonly [readonly string[], unknown] =>
      JSON.parse(runWith(of)) as [readonly string[], unknown];

    // The shaft really does stop declaring the lobby, and really does keep the rest of its band.
    expect(partsOf(express)[0]).toContain('G/7/8/9/10/11');
    expect(partsOf(closed)[0]).toContain('7/8/9/10/11');
    expect(partsOf(closed)[0]).not.toContain('G/7/8/9/10/11');
    // And the people move differently: a different car answers, or answers at a different time.
    expect(JSON.stringify(partsOf(closed)[1])).not.toBe(JSON.stringify(partsOf(express)[1]));
    // Neither arm is the do-nothing arm.
    expect(runWith(express)).not.toBe(control);
    expect(runWith(closed)).not.toBe(control);
  });

  it('a lobby the toggle closed off is a building that strands people, and the editor says so first', () => {
    /*
     * The reason the toggle needed a guard rather than only a label. Two cars, both closed inside
     * `7–11`, no transfer level: measured on this branch the document **parses and resolves with no
     * error and no warning**, and the run then carries 8 legs where the same building with the
     * lobby carries 114 — the missing passengers are not slow, they were never generated. So the
     * refusal has to be said at the control, which is what `validateSpec` is for.
     */
    const stranded: BuildingSpec = {
      ...spec,
      cars: 2,
      bandByCar: { 0: [6, 10], 1: [6, 10] },
      noLobby: { 0: true, 1: true },
    };
    const resolved = resolveBuilding(
      parseBuilding(buildingFromSpec(stranded, { specs: SPECS }) as unknown),
      SPECS,
    );
    expect(resolved.warnings).toStrictEqual([]);
    expect(RoutePlanner.forBuilding(resolved).plan('G', '8')).toBeUndefined();
    expect(validateSpec(stranded, undefined).join(' ')).toMatch(/nobody can board from the lobby/);

    // A sky lobby is the way back in, and the editor stops complaining once there is one.
    const joined: BuildingSpec = { ...stranded, skyFloors: [6], bandByCar: { 0: [0, 6], 1: [6, 10] } };
    expect(unreachableFloors(joined)).toStrictEqual([]);
    expect(validateSpec(joined, undefined)).toStrictEqual([]);
    const joinedBuilding = resolveBuilding(
      parseBuilding(buildingFromSpec(joined, { specs: SPECS }) as unknown),
      SPECS,
    );
    expect(RoutePlanner.forBuilding(joinedBuilding).plan('G', '9')?.elevatorLegCount).toBe(2);
  });

  /* ---- access zoning: the credential half, and only that ------------------ */

  const ZONED: BuildingSpec = {
    ...spec,
    accessZones: [{ id: 'zone-1', floors: [6, 7, 8, 9, 10], credentialGroups: ['tenant'] }],
  };
  const partsOf = (of: BuildingSpec): readonly [readonly string[], unknown] =>
    JSON.parse(runWith(of)) as [readonly string[], unknown];

  it('an access zone changes the run, and leaves every shaft serving exactly what it did', () => {
    /*
     * The whole of why access zoning is a *second* kind of zoning. The two arms are the same three
     * cars over the same ten floors — no band moved, no bank split — so `servedFloorIds` must be
     * byte-identical, and the **legs** must not be: a credential-blind dispatcher assigns cars to
     * trips the passenger may not legally take, and the trips it cannot assign are never generated
     * rather than served slowly (§ D159, and `docs/10` § 10.3's structural refusal).
     *
     * A test that compared only the whole fingerprint could pass with a control that quietly
     * rewrote `servesFloors` — which is precisely the collapse `CLAUDE.md` forbids, and the one
     * `WAVE10_PLAN.md` § 6 refused the handoff's `⚿` badge over.
     */
    expect(partsOf(ZONED)[0]).toStrictEqual(partsOf(spec)[0]);
    expect(JSON.stringify(partsOf(ZONED)[1])).not.toBe(JSON.stringify(partsOf(spec)[1]));
  });

  it('the floor multi-select changes the run — one more floor inside the zone', () => {
    const wider: BuildingSpec = { ...ZONED, accessZones: withZoneFloor(ZONED, 'zone-1', 5) };
    expect(zoneFloorsOf(wider, wider.accessZones[0] as never)).toStrictEqual([5, 6, 7, 8, 9, 10]);
    expect(runWith(wider)).not.toBe(runWith(ZONED));
    // And clicking the same floor again is the inverse edit, back to the run we started from.
    const back: BuildingSpec = { ...wider, accessZones: withZoneFloor(wider, 'zone-1', 5) };
    expect(runWith(back)).toBe(runWith(ZONED));
  });

  it('the credential control changes the run — the same floors under a different group', () => {
    /*
     * Two zones, one credential each, and the **only** difference between the arms is the name of
     * the second zone's group. Secure Tower's own note is the mechanism: *"an interfloor trip such
     * as 6 → 18 is legal by credential only for holders of both tenant groups"* — so when the two
     * zones share a group every interfloor pair between them is feasible, and when they do not,
     * `traffic/generator.ts`'s `credentialForRoute` finds no credential and the pair is never
     * generated at all. No band moved, no bank split, no floor changed hands.
     */
    const shared: BuildingSpec = {
      ...spec,
      accessZones: [
        { id: 'zone-1', floors: [3, 4, 5], credentialGroups: ['alpha'] },
        { id: 'zone-2', floors: [8, 9, 10], credentialGroups: ['alpha'] },
      ],
    };
    const split: BuildingSpec = {
      ...shared,
      accessZones: withZoneGroup(
        { ...shared, accessZones: withZoneGroup(shared, 'zone-2', 'alpha') },
        'zone-2',
        'bravo',
      ),
    };
    expect(credentialGroupsOf(split)).toStrictEqual(['alpha', 'bravo']);
    expect(partsOf(split)[0]).toStrictEqual(partsOf(shared)[0]);
    expect(runWith(split)).not.toBe(runWith(shared));
  });

  it('a group added beside one that already works is a no-op, and that is the mechanism, not a bug', () => {
    /*
     * Measured, and worth pinning rather than discovering twice. `credentialAssignment` defaults to
     * `permitted-first`, and `credentialForRoute` returns the **first** group permitted on every
     * restricted floor of the route — so widening a zone from `tenant` to `tenant, facilities`
     * leaves every route's chosen credential and every leg bit-identical.
     *
     * That is not an inert control: the group set decides which routes are feasible at all (the
     * case above) and which credential a locked-out rider is reported as carrying. It is a control
     * whose effect is on the *set*, so an edit that does not change the set changes nothing — and a
     * test that expected otherwise would have been pinning a wish. The coverage matrix is where the
     * reader sees which columns a floor is open to, which is the fact this edit does move.
     */
    const wider: BuildingSpec = { ...ZONED, accessZones: withZoneGroup(ZONED, 'zone-1', 'facilities') };
    expect(credentialGroupsOf(wider)).toStrictEqual(['tenant', 'facilities']);
    expect(runWith(wider)).toBe(runWith(ZONED));
  });

  it('the access zones the round trip used to drop change the run on Secure Tower', () => {
    /*
     * The measurement that makes the round-trip fix a correctness fix rather than a tidy-up. Before
     * it, opening this building here and saving it produced `accessZones: []` — and these two arms
     * are exactly that difference, under `eta`, which reads no credential.
     */
    const tower = specFromBuilding(parseBuilding(read('buildings/secure-tower.json')), 'secure-tower');
    expect(accessZonesOf(tower)).toHaveLength(5);
    expect(runWith(tower)).not.toBe(runWith({ ...tower, accessZones: [] }));
  });

  it('says exactly what the real route planner says about who can get out of the lobby', () => {
    /*
     * `unreachableFloors` is a small model of `traffic/route.ts` over a spec, and a model that
     * stopped mirroring would be green forever — the shape `buildingConnectivity.test.ts` names in
     * its own header. So it is held to the real planner on the resolved building, in **both**
     * directions, over the states the express toggle and the band drags can actually reach.
     */
    const cases: readonly BuildingSpec[] = [
      spec,
      { ...spec, bandByCar: { 0: [6, 10] } },
      { ...spec, bandByCar: { 0: [6, 10] }, noLobby: { 0: true } },
      { ...spec, cars: 2, bandByCar: { 0: [6, 10], 1: [6, 10] }, noLobby: { 0: true, 1: true } },
      { ...spec, cars: 2, skyFloors: [6], bandByCar: { 0: [0, 6], 1: [6, 10] }, noLobby: { 1: true } },
      { ...spec, cars: 1, bandByCar: { 0: [0, 6] } },
      { ...spec, cars: 3, skyFloors: [4, 7], noLobby: { 1: true, 2: true } },
    ];
    for (const candidate of cases) {
      const resolved = resolveBuilding(
        parseBuilding(buildingFromSpec(candidate, { specs: SPECS }) as unknown),
        SPECS,
      );
      const planner = RoutePlanner.forBuilding(resolved);
      const stranded = new Set(unreachableFloors(candidate));
      for (let floor = 1; floor <= candidate.floors; floor += 1) {
        expect([floor, planner.plan('G', floorIdOf(floor)) !== undefined]).toStrictEqual([
          floor,
          !stranded.has(floor),
        ]);
      }
    }
  });
});

describe('the express toggle is service zoning and only that', () => {
  it('offers the choice only where there is one to make', () => {
    // A band at the lobby has no lobby question; a band at floor 1 has none either, because its
    // express form serves 0..high, which is the band that starts at the lobby.
    expect(canExpress({ ...BLANK_SPEC, cars: 1 }, 0)).toBe(false);
    expect(canExpress({ ...BLANK_SPEC, cars: 1, bandByCar: { 0: [1, 8] } }, 0)).toBe(false);
    expect(canExpress({ ...BLANK_SPEC, cars: 1, bandByCar: { 0: [2, 8] } }, 0)).toBe(true);
    // And the flag is inert where the choice is absent, rather than half-applied.
    const inert: BuildingSpec = { ...BLANK_SPEC, cars: 1, bandByCar: { 0: [1, 8] }, noLobby: { 0: true } };
    expect(servesLobby(inert, 0)).toBe(true);
    expect(banksOf(inert)[0]?.lobby).toBe(true);
  });

  it('splits the bank, because two cars that disagree about the lobby do not open onto the same floors', () => {
    /*
     * `BankConfig` has one `servesFloors`. Grouping these two cars together would have had to pick
     * one of their two claims and quietly apply it to both — which is a car serving floors it does
     * not serve, the defect this whole module exists to avoid.
     */
    const split: BuildingSpec = {
      ...BLANK_SPEC,
      floors: 10,
      cars: 2,
      bandByCar: { 0: [6, 10], 1: [6, 10] },
      noLobby: { 0: true },
    };
    const banks = banksOf(split);
    expect(banks.length).toBe(2);
    expect(banks.map((bank) => bank.lobby)).toStrictEqual([true, false]);
    const document = buildingFromSpec(split, { specs: SPECS });
    expect(document.banks.map((bank) => bank.servesFloors)).toStrictEqual([
      ['G', '7', '8', '9', '10', '11'],
      ['7', '8', '9', '10', '11'],
    ]);
    // It writes no access zone and touches no dispatcher weight: service zoning, and only that.
    expect(document.accessZones).toStrictEqual([]);
  });

  it('counts the lobby an express car really opens at, and stops counting it when it does not', () => {
    const one = { ...BLANK_SPEC, floors: 10, cars: 1 } satisfies BuildingSpec;
    const express: BuildingSpec = { ...one, bandByCar: { 0: [6, 10] } };
    // The express car lands in the lobby, so the lobby is not an orphan; floors 1–5 still are.
    expect(orphanFloors(express)).toStrictEqual([1, 2, 3, 4, 5]);
    expect(orphanFloors({ ...express, noLobby: { 0: true } })).toStrictEqual([0, 1, 2, 3, 4, 5]);
  });

  it('reports dirty when the toggle moves, and not when a redundant false is written', () => {
    const base: BuildingSpec = { ...BLANK_SPEC, floors: 10, cars: 2, bandByCar: { 0: [6, 10] } };
    expect(buildingSpecIsDirty({ ...base, noLobby: { 0: true } }, base)).toBe(true);
    expect(buildingSpecIsDirty({ ...base, noLobby: { 0: false } }, base)).toBe(false);
  });
});
