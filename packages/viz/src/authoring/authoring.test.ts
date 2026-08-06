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
  type ConservationAudit,
  type DispatcherProfile,
  type ElevatorSpecs,
  type SimulationConfig,
  type TrafficProfiles,
} from '@elevator-sim/core/browser';

import { recordRun } from '../record/recordRun.js';

import {
  BLANK_SPEC,
  RATED_LOADS,
  accessZonesOf,
  banksOf,
  buildingFromSpec,
  canExpress,
  credentialGroupsOf,
  escalatorSecondsFor,
  floorIdOf,
  nextTransportModeId,
  nextZoneId,
  occupancyLine,
  orphanFloors,
  personsOf,
  servesLobby,
  specFromBuilding,
  specIsDirty as buildingSpecIsDirty,
  totalPopulation,
  transportModesOf,
  unreachableFloors,
  validateSpec,
  withTransportEnd,
  withTransportSeconds,
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
  type MachineClass,
  type MachineSpec,
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
  }, 60_000);

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
  }, 60_000);

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
  }, 60_000);

  it('the peak-hold slider changes the run', () => {
    expect(runWith({ ...DEFAULT_PATTERN, peakWindowS: 600 })).not.toBe(control);
  }, 60_000);

  it('the peak order changes the run', () => {
    expect(runWith({ ...DEFAULT_PATTERN, order: 'down-first' })).not.toBe(control);
  }, 60_000);

  it('the interfloor slider changes the run', () => {
    expect(runWith({ ...DEFAULT_PATTERN, interfloorShare: 0.6 })).not.toBe(control);
  }, 60_000);

  it('the off-peak level changes the run', () => {
    expect(runWith({ ...DEFAULT_PATTERN, baselineFraction: 0.8 })).not.toBe(control);
  }, 60_000);

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
  }, 60_000);

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

describe('the machines editor is not decoration', () => {
  /*
   * ME-07, the one editor § D177's rule did not cover. Every case drives the whole shipped chain
   * rather than the class record alone: the machines editor's save (`classFromSpec` under a fresh
   * `cls-` id, then `specsWithClass` widening the file — `dev/state.ts`'s own step 2), the building
   * editor's *fit* (`buildingEditor.ts`'s class-chip `onPick`: `specClass` takes the id, the rated
   * speed snaps to the class typical, the rated load clamps into the class's own range), and then
   * `resolveBuilding` against the widened file into `recordRun`. That chain is where a class edit
   * could quietly die — `resolveCar` prefers the car's own `ratedSpeedMps`/`ratedLoadLb` over the
   * class's, so a suite that skipped the fit would be asserting a path no shipped control takes.
   *
   * The building is Garden Apartments **because of its own notes**: at a 3.0 m pitch a hydraulic
   * car reaches rated speed inside one floor, so 0.63 → 1.00 m/s is a measured 11 % round-trip
   * change — a decision-flip-sized delta. Midtown Office is this repository's named speed negative
   * control (2.5 m/s never reached on a 3.8 m pitch), and running the speed arm there would produce
   * a false "inert" finding about a control that works.
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
  const hydraulic = classesFromSpecs(SPECS).find(
    (entry) => entry.id === 'hydraulic',
  ) as MachineClass;
  const garden = specFromBuilding(
    parseBuilding(read('buildings/garden-apartments.json')),
    'garden-apartments',
  );

  /** The building editor's fit, restated from `buildingEditor.ts`'s class-chip `onPick`. */
  const fit = (spec: BuildingSpec, machineClass: MachineClass): BuildingSpec => {
    const load = Math.min(
      machineClass.loadMaxLb,
      Math.max(machineClass.loadMinLb, spec.ratedLoadLb),
    );
    const nearest = RATED_LOADS.filter(
      (lb) => lb >= machineClass.loadMinLb && lb <= machineClass.loadMaxLb,
    );
    return {
      ...spec,
      specClass: machineClass.id,
      ratedSpeedMps: machineClass.speedTypicalMps,
      ratedLoadLb: nearest.includes(load) ? load : (nearest[0] ?? load),
    };
  };

  const runWith = (
    machineClass: MachineClass,
    overrides: Partial<SimulationConfig> = {},
  ): string => {
    // dev/state.ts widens the file only with what the reader *saved*; a shipped class rides plain.
    const specs = machineClass.yours ? specsWithClass(SPECS, machineClass) : SPECS;
    const building = resolveBuilding(
      parseBuilding(buildingFromSpec(fit(garden, machineClass), { specs }) as unknown),
      specs,
    );
    return fingerprint(configFor(eta, { building, elevatorSpecs: specs, ...overrides }));
  };

  /** The machines editor's save: the shipped class opened, one field moved, kept as `cls-1`. */
  const saved = (edit: Partial<MachineSpec>): MachineClass =>
    classFromSpec({ ...specFromClass(hydraulic), ...edit }, 'cls-1');

  const control = runWith(saved({}));

  it('an unchanged spec produces a bit-identical run — the negative control', () => {
    /*
     * Opening the hydraulic class, saving it untouched and fitting the copy must not change a
     * single boarding against fitting the shipped class itself — otherwise every arm below would be
     * measuring the copy chain rather than its edit. And the arm is only an instrument if it
     * carries legs at all: a fingerprint of zero legs is equal to anything.
     */
    expect(JSON.parse(control)).not.toHaveLength(0);
    expect(control).toBe(runWith(hydraulic));
  }, 60_000);

  it('a changed rated speed changes the legs', () => {
    /*
     * 0.63 → 1.00 m/s, the delta the building's own notes measured at 11 % of the round trip. The
     * band ceiling moves with it because `classFromSpec` clamps the typical into the band — an edit
     * of the typical alone would be clamped back to 0.75 and the arm would test the clamp, not the
     * slider.
     */
    expect(runWith(saved({ speedTypicalMps: 1.0, speedMaxMps: 1.0 }))).not.toBe(control);
  }, 60_000);

  it('a changed acceleration changes the legs', () => {
    // Doubled, 0.6 → 1.2 m/s² — the field reaches `resolveCar` directly, since no car config this
    // editor writes declares an acceleration of its own.
    expect(runWith(saved({ accelerationMps2: 1.2 }))).not.toBe(control);
  }, 60_000);

  it('a changed capacity changes the legs, on a load where capacity binds', () => {
    /*
     * The class range is the control: [1000, 1000] forces the fit to a 1 000 lb car — 6 persons in
     * the capacities table against the control's 10 — and the demand is raised until the smaller
     * car actually fills. At the shipped residential trickle no car reaches 80 % of either rating
     * and the two arms are identical, which would be a true statement about that operating point
     * and a useless test of the control — the same trap the load-sensor arm above documents.
     */
    const smaller = saved({ loadMinLb: 1000, loadMaxLb: 1000 });
    expect(fit(garden, smaller).ratedLoadLb).toBe(1000);
    const BUSY = { demand: { arrivalRatePctPop5min: 30 } } satisfies Partial<SimulationConfig>;
    const busyControl = runWith(saved({}), BUSY);
    expect(JSON.parse(busyControl)).not.toHaveLength(0);
    expect(runWith(smaller, BUSY)).not.toBe(busyControl);
  }, 60_000);
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

  it('carries Vertical City’s four escalators through the round trip it used to drop', () => {
    /*
     * The same destructive silence access zoning had, one field over, and found the same way.
     * `specFromBuilding` never looked at `transportModes`, so opening the one shipped building
     * with sky lobbies and saving it untouched produced a tower whose four two-level lobbies had
     * lost their escalators — every lobby-level crossing charged back to a lift, which is the
     * **110 of 593 journeys** § D147 § 6 measured before the field existed at all.
     *
     * Asserted over all five buildings rather than the one, because the four that declare none are
     * the arms that would keep passing if the field were dropped again — and the key must stay
     * absent on them, not become `[]`, so a download still reads like the document it came from.
     */
    for (const id of BUILDING_IDS) {
      const config = parseBuilding(read(`buildings/${id}.json`));
      const rebuilt = buildingFromSpec(specFromBuilding(config, id), { specs: SPECS });
      const source = config.transportModes ?? [];
      const written = rebuilt.transportModes ?? [];
      if (source.length === 0) {
        expect(Object.hasOwn(rebuilt, 'transportModes'), id).toBe(false);
        continue;
      }
      /*
       * **Raw, with no projection.** An earlier version of this loop mapped the expectation
       * through the same three fields `specFromBuilding` carries, which made it structurally
       * incapable of failing on a dropped field — it was defending a claim stronger than the one
       * that holds. The key set is asserted exactly instead, so a field that starts or stops
       * surviving turns this red and forces the docstring to be rewritten with it.
       */
      for (const mode of written) {
        expect(Object.keys(mode).sort(), id).toStrictEqual([
          '$comment',
          'connects',
          'id',
          'traversalTimeS',
        ]);
      }
      expect(written.map((mode) => mode.id), id).toStrictEqual(source.map((mode) => mode.id));
      expect(written.map((mode) => mode.connects), id).toStrictEqual(
        source.map((mode) => mode.connects),
      );
      expect(written.map((mode) => mode.traversalTimeS), id).toStrictEqual(
        source.map((mode) => mode.traversalTimeS),
      );
      /*
       * The two fields that do **not** survive, asserted as losses rather than projected away.
       * The source really does declare both on every machine, so these are live assertions and
       * not a description of an empty set.
       */
      expect(source.every((mode) => mode.name !== undefined), id).toBe(true);
      expect(written.every((mode) => mode.name === undefined), id).toBe(true);
      expect(source.every((mode) => mode.$comment !== undefined), id).toBe(true);
      expect(
        written.every((mode, index) => mode.$comment !== source[index]?.$comment),
        id,
      ).toBe(true);
      /*
       * And what replaces the dropped citation is the honest one. `specFromBuilding` cannot
       * preserve an uneven floor pitch, so 21.2 s is not what this spec's geometry gives — and
       * the emitted comment says so rather than reprinting a derivation that no longer holds.
       */
      for (const mode of written) {
        expect(mode.$comment, id).toMatch(/SET BY HAND and NOT cited/);
      }
    }
    const tower = specFromBuilding(parseBuilding(read('buildings/vertical-city.json')), 'vertical-city');
    expect(tower.transportModes).toHaveLength(4);
    expect(tower.transportModes.map((mode) => mode.connects)).toStrictEqual([
      [0, 1],
      [25, 26],
      [50, 51],
      [75, 76],
    ]);
  });

  it('seeds a new escalator from the rise, by the derivation Vertical City performs by hand', () => {
    /*
     * `vertical-city`'s four `$comment`s derive 21.2 s from a 4.5 m rise — 30° inclination (the
     * only angle BS EN 115-1 permits above a 6 m rise), 0.5 m/s nominal, two flat steps of 0.40 m
     * at each landing. The seed here is that arithmetic, so a machine a reader adds is not a
     * guessed constant, and this pins it to the shipped figure rather than to itself.
     */
    const spec: BuildingSpec = { ...BLANK_SPEC, floorHeightM: 4.5 };
    expect(escalatorSecondsFor(spec, [0, 1])).toBe(21.2);
    for (const mode of (parseBuilding(read('buildings/vertical-city.json')).transportModes ?? [])) {
      expect(mode.traversalTimeS).toBe(21.2);
    }
    // And it moves with the geometry, which is why it is derived rather than a constant.
    expect(escalatorSecondsFor({ ...spec, floorHeightM: 3.6 }, [0, 1])).toBe(17.6);
  });

  it('cites the traversal time it emits, and says so plainly when the number is not derived', () => {
    /*
     * `TransportModeConfig.traversalTimeS` is a **reference value**, and its own contract requires
     * the declaring building's `$comment` to cite it. A designer emitting the number bare would
     * put *a guess wearing a number* into `data/buildings/` with nothing to notice — this
     * repository's own phrase for the defect, and its reference-data rule forbids it.
     *
     * Computed rather than carried, so it cannot go stale: it is re-derived from the current spec
     * on every emit. The two branches are the whole of why that is safe.
     */
    const spec: BuildingSpec = { ...BLANK_SPEC, floorHeightM: 4.5 };
    const seeded: BuildingSpec = {
      ...spec,
      transportModes: [
        { id: 'escalator-1', connects: [0, 1], traversalTimeS: escalatorSecondsFor(spec, [0, 1]) },
      ],
    };
    const derived = transportModesOf(seeded)[0]?.$comment ?? '';
    expect(derived).toMatch(/DERIVED by the building designer/);
    // The arithmetic is in the comment, with this building's own numbers rather than a template.
    expect(derived).toMatch(/rise 4\.50 m/);
    expect(derived).toMatch(/4\.50 \/ sin 30 = 9\.00 m at 0\.5 m\/s = 18\.0 s/);
    expect(derived).toMatch(/Total landing to landing 21\.2 s/);
    expect(derived).toMatch(/docs\/02-elevator-reference\.md/);

    // A hand-set figure is labelled the author's and is **not** claimed to be cited. Writing the
    // derivation beside a number it does not produce is the stale-citation defect itself.
    const byHand: BuildingSpec = {
      ...seeded,
      transportModes: withTransportSeconds(seeded, 'escalator-1', 30),
    };
    const hand = transportModesOf(byHand)[0]?.$comment ?? '';
    expect(hand).toMatch(/SET BY HAND and NOT cited: 30\.0 s/);
    expect(hand).toMatch(/derives 21\.2 s by the EN 115-1 method/);
    expect(hand).not.toMatch(/DERIVED by the building designer/);

    // And the clause that does not travel is named where it stops holding, rather than left to be
    // read as a citation: EN 115-1 states the two-flat-step allowance for a rise of 6 m or less.
    const tall: BuildingSpec = {
      ...spec,
      transportModes: [
        { id: 'escalator-1', connects: [0, 3], traversalTimeS: escalatorSecondsFor(spec, [0, 3]) },
      ],
    };
    expect(transportModesOf(tall)[0]?.$comment ?? '').toMatch(/above 6 m, where the two-flat-step/);
    expect(derived).not.toMatch(/above 6 m/);

    // The comment is a real document field, so the loader has to take it.
    expect(() =>
      resolveBuilding(parseBuilding(buildingFromSpec(seeded, { specs: SPECS }) as unknown), SPECS),
    ).not.toThrow();
  });

  it('mints an escalator id that never collides with one the reader kept', () => {
    expect(nextTransportModeId(BLANK_SPEC)).toBe('escalator-1');
    const one: BuildingSpec = {
      ...BLANK_SPEC,
      transportModes: [{ id: 'escalator-1', connects: [0, 1], traversalTimeS: 21.2 }],
    };
    expect(nextTransportModeId(one)).toBe('escalator-2');
    // A gap left by a removal is filled rather than skipped, exactly as `nextZoneId` fills one.
    const gapped: BuildingSpec = {
      ...one,
      transportModes: [{ id: 'escalator-2', connects: [0, 1], traversalTimeS: 21.2 }],
    };
    expect(nextTransportModeId(gapped)).toBe('escalator-1');
  });

  it('says, at the control, each of the three states the loader would refuse', () => {
    /*
     * *A designer that can produce a config the loader rejects is worse than one that cannot
     * produce it at all* (`docs/14` § 5a). `transportModeSchema` refuses two things and
     * `config/parse.ts` refuses a third, so each is said here in the editor's own words — and each
     * assertion below is paired with what the loader actually does, so none of the three sentences
     * can drift into a false claim about a mechanism.
     */
    const base: BuildingSpec = { ...BLANK_SPEC, floors: 20, skyFloors: [6] };

    // 1. An end this tower no longer has. Omitted whole — `connects` is a pair, so there is
    //    nothing to narrow the way a zone narrows its floor list — and the document still loads.
    const tall: BuildingSpec = {
      ...base,
      transportModes: [{ id: 'escalator-1', connects: [6, 18], traversalTimeS: 21.2 }],
    };
    expect(transportModesOf(tall)).toHaveLength(1);
    const short: BuildingSpec = { ...tall, floors: 8 };
    expect(transportModesOf(short)).toStrictEqual([]);
    expect(validateSpec(short, undefined).join(' ')).toMatch(/A connection is a pair of floors/);
    expect(() =>
      resolveBuilding(parseBuilding(buildingFromSpec(short, { specs: SPECS }) as unknown), SPECS),
    ).not.toThrow();

    // 2. Both ends on one floor — `transportModeSchema`'s own refusal, quoted by its effect.
    const selfJoined: BuildingSpec = {
      ...base,
      transportModes: [{ id: 'escalator-1', connects: [6, 6], traversalTimeS: 21.2 }],
    };
    expect(transportModesOf(selfJoined)).toStrictEqual([]);
    expect(validateSpec(selfJoined, undefined).join(' ')).toMatch(/starts and ends on floor 7/);
    expect(() =>
      parseBuilding({
        ...(buildingFromSpec(selfJoined, { specs: SPECS }) as unknown as Record<string, unknown>),
        transportModes: [{ id: 'escalator-1', connects: ['7', '7'], traversalTimeS: 21.2 }],
      } as unknown),
    ).toThrow(/two different floors/);

    // 3. A traversal time the schema's `positive` refuses. **Written** rather than omitted, and
    //    the message says the building will not build — so the loader must really refuse it.
    const still: BuildingSpec = {
      ...base,
      transportModes: [{ id: 'escalator-1', connects: [6, 7], traversalTimeS: 0 }],
    };
    expect(transportModesOf(still)).toHaveLength(1);
    expect(validateSpec(still, undefined).join(' ')).toMatch(/will not build until it is raised/);
    expect(() => parseBuilding(buildingFromSpec(still, { specs: SPECS }) as unknown)).toThrow();
  });

  it('says when an escalator is not a way through, and does not call that a refusal', () => {
    /*
     * The advisory, and the one sentence in this block that is about `route.ts` rather than about
     * the schema. A floor reached over a transport edge only re-enters the search when it is a
     * transfer floor, so a machine touching none of them carries exactly the people who start on
     * one of its two floors and finish on the other. That is a building somebody may mean, so the
     * loader builds it without a word and the editor must not claim otherwise.
     */
    const stranded: BuildingSpec = {
      ...BLANK_SPEC,
      floors: 10,
      cars: 3,
      skyFloors: [5, 6],
      bandByCar: { 0: [0, 5], 1: [5, 6], 2: [6, 10] },
      noLobby: { 1: true, 2: true },
      transportModes: [{ id: 'escalator-1', connects: [2, 3], traversalTimeS: 21.2 }],
    };
    const said = validateSpec(stranded, undefined).join(' ');
    expect(said).toMatch(/neither is a transfer level/);
    expect(said).not.toMatch(/loader refuses/);
    const resolved = resolveBuilding(
      parseBuilding(buildingFromSpec(stranded, { specs: SPECS }) as unknown),
      SPECS,
    );
    expect(resolved.warnings).toStrictEqual([]);
    // The claim, checked against the planner: the edge carries `3 → 4` and nothing longer.
    const planner = RoutePlanner.forBuilding(resolved);
    expect(planner.plan('3', '4')?.transportHopCount).toBe(1);
    expect(planner.plan('G', '4')?.transportHopCount).toBe(0);

    // And the same machine on a transfer level is not reported, because then it *is* a way through.
    const through: BuildingSpec = {
      ...stranded,
      transportModes: [{ id: 'escalator-1', connects: [5, 6], traversalTimeS: 21.2 }],
    };
    expect(validateSpec(through, undefined).join(' ')).not.toMatch(/neither is a transfer level/);
  });

  it('reports dirty when an escalator changes, and not when one nothing writes is edited', () => {
    const base: BuildingSpec = {
      ...BLANK_SPEC,
      transportModes: [{ id: 'escalator-1', connects: [0, 1], traversalTimeS: 21.2 }],
    };
    expect(buildingSpecIsDirty(base, base)).toBe(false);
    expect(
      buildingSpecIsDirty({ ...base, transportModes: withTransportSeconds(base, 'escalator-1', 30) }, base),
    ).toBe(true);
    expect(
      buildingSpecIsDirty({ ...base, transportModes: withTransportEnd(base, 'escalator-1', 1, 2) }, base),
    ).toBe(true);
    // A machine above the roof is never written, so editing it is not a building that saves
    // differently — the rule `accessZones` already follows in `normalize`.
    const offTower: BuildingSpec = {
      ...base,
      transportModes: [{ id: 'escalator-1', connects: [40, 41], traversalTimeS: 21.2 }],
    };
    expect(
      buildingSpecIsDirty(
        { ...offTower, transportModes: withTransportSeconds(offTower, 'escalator-1', 30) },
        offTower,
      ),
    ).toBe(false);
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
  }, 60_000);

  it('the occupancy slider changes how many people the lifts must move', () => {
    expect(runWith({ ...spec, occupancyPct: 40 })).not.toBe(control);
  }, 60_000);

  it('the floor count changes the run', () => {
    expect(runWith({ ...spec, floors: 16 })).not.toBe(control);
  }, 60_000);

  it('a pinned shaft band changes which car answers', () => {
    const pinned = runWith({ ...spec, bandByCar: { 0: [6, 10] } });
    expect(pinned).not.toBe(control);
  }, 60_000);

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
  }, 60_000);

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

  /**
   * **The next two cases FAIL ON PURPOSE. Do not "fix" them, and above all do not weaken them.**
   *
   * Tracked as **issue #87**; the mechanism is written up in [`DECISIONS.md`](../../../../DECISIONS.md)
   * § D256 (*"Two are a real question, and it is worth stating precisely"*), and the change that
   * caused it is § D254. The resolution is a **modelling decision** that has gone to the product
   * owner, and it is not a repair a test lane may make on its own.
   *
   * ## Why they fail, which is not the usual reason
   *
   * They are **not stale fixtures**, and that distinction is the whole point of this note. Every
   * other suppression fixture in this package broke because it reached for a building that used to
   * saturate and no longer does; those were re-pointed at a stated demand rate (§ D260). This is a
   * different animal: **the control is not unwired, and the run genuinely does not change.**
   *
   * § D254 deleted the access check on the *pickup* floor — a credential governs where you may go,
   * not where you may be collected. While that check existed, adding a zone changed the run by
   * stranding every landing call raised inside it, regardless of anybody's credential. So these two
   * cases were observing the control **through the defect**.
   *
   * With the defect gone, `traffic/generator.ts` decides the outcome: `credentialGroupFor` issues
   * each rider a credential drawn from the zones the building declares, and `planDemand` has
   * already dropped every pair for which no credential works. The traffic model therefore only ever
   * generates journeys somebody is entitled to make, and a well-formed zone over a single group
   * changes nothing on the legs, because everybody bound for a restricted floor holds a badge for
   * it. Measured directly in § D256: `midtown-office`, seed 424 242, a synthetic zone over floors
   * 8–13 permitting a group named `nobody-has-this` — 205 of 699 legs are bound for those floors,
   * **all 205 alight there**, and the run is byte-identical to the unzoned one under both
   * `collective` and `destination-eta`.
   *
   * ## What is *not* wrong, so nobody re-derives it
   *
   * The third case below — *the credential control changes the run* — **passes**, and it is the
   * proof that the editor's access-zone controls are wired. It uses **two** zones under
   * **different** groups, so `credentialForRoute` finds no credential for the interfloor pairs
   * between them and `planDemand` drops them. The seam is live; what is inert is the narrower
   * single-zone case these two assert on.
   *
   * ## What would fix them, when the decision lands
   *
   * A configuration the generator cannot silently satisfy: `credentialAssignment: 'none'`, which
   * the generator already supports, or a destination call type that must be *told* the credential.
   * Whoever owns that decision picks one. The standing requirement is explicit that they may not
   * simply be deleted, and asserting something weaker — that the *fingerprint* moved, or that the
   * zone merely parses — would convert a real question into a green tick.
   */

  const ZONED: BuildingSpec = {
    ...spec,
    accessZones: [{ id: 'zone-1', floors: [6, 7, 8, 9, 10], credentialGroups: ['tenant'] }],
  };
  const partsOf = (of: BuildingSpec): readonly [readonly string[], unknown] =>
    JSON.parse(runWith(of)) as [readonly string[], unknown];

  // FAILS ON PURPOSE — issue #87, DECISIONS.md § D256. See the note above.
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

  // FAILS ON PURPOSE — issue #87, DECISIONS.md § D256. See the note above.
  it('the floor multi-select changes the run — one more floor inside the zone', () => {
    const wider: BuildingSpec = { ...ZONED, accessZones: withZoneFloor(ZONED, 'zone-1', 5) };
    expect(zoneFloorsOf(wider, wider.accessZones[0] as never)).toStrictEqual([5, 6, 7, 8, 9, 10]);
    expect(runWith(wider)).not.toBe(runWith(ZONED));
    // And clicking the same floor again is the inverse edit, back to the run we started from.
    const back: BuildingSpec = { ...wider, accessZones: withZoneFloor(wider, 'zone-1', 5) };
    expect(runWith(back)).toBe(runWith(ZONED));
  }, 60_000);

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
  }, 60_000);

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
  }, 60_000);

  /* ---- sky lobbies: the escalator, and only that -------------------------- */

  /*
   * A two-level sky lobby, small enough to run in a test and shaped like the thing the feature is
   * for. Three banks: `G–6` off the ground, a two-floor shuttle `6–7` closed inside itself, and
   * `7–11` closed inside itself, with both lobby levels marked transfer floors.
   *
   * Both arms of every comparison below are **buildings the loader builds and the router routes**
   * — no floor is stranded either way. That is deliberate: proving the escalator by breaking the
   * control arm would prove the sky floors, not the machine. What it changes is the *route*, and
   * measured at this seed it is 205 lift legs without the escalator and 154 with it, over the same
   * demand and the same three banks.
   */
  const SKY: BuildingSpec = {
    ...spec,
    skyFloors: [5, 6],
    bandByCar: { 0: [0, 5], 1: [5, 6], 2: [6, 10] },
    noLobby: { 1: true, 2: true },
  };
  const ESCALATOR: BuildingSpec = {
    ...SKY,
    transportModes: [{ id: 'escalator-1', connects: [5, 6], traversalTimeS: 21.2 }],
  };
  const plannerFor = (of: BuildingSpec): RoutePlanner =>
    RoutePlanner.forBuilding(
      resolveBuilding(parseBuilding(buildingFromSpec(of, { specs: SPECS }) as unknown), SPECS),
    );
  /** The books for one arm — `runWith`'s run, read for conservation rather than for the legs. */
  const auditOf = (of: BuildingSpec): ConservationAudit => {
    const building = resolveBuilding(
      parseBuilding(buildingFromSpec(of, { specs: SPECS }) as unknown),
      SPECS,
    );
    return recordRun(configFor(eta, { building }), { recordDecisions: false }).result.conservation;
  };

  it('an escalator changes the run — the same shafts, and a lift leg the passengers stop riding', () => {
    /*
     * `docs/14 § 5` criterion 2, pointed at the sky-lobby control: move it and require the run to
     * change, **on the legs**. The split is the access-zoning block's, for the same reason — adding
     * an escalator is not a bank edit, so `servedFloorIds` must be byte-identical, and the legs
     * must not be. A control that emitted a `transportModes` entry the router ignored would pass
     * the first assertion and fail the second, which is the failure this test exists to produce.
     */
    expect(partsOf(ESCALATOR)[0]).toStrictEqual(partsOf(SKY)[0]);
    expect(JSON.stringify(partsOf(ESCALATOR)[1])).not.toBe(JSON.stringify(partsOf(SKY)[1]));

    // And the direction is the one claimed: the machine takes a leg off the lifts, it does not
    // merely reshuffle them. Pinned as an inequality on the counts, not on the two numbers.
    const legsOf = (of: BuildingSpec): number => (partsOf(of)[1] as unknown[]).length;
    expect(legsOf(ESCALATOR)).toBeLessThan(legsOf(SKY));

    /*
     * The inequality alone is not enough, and this is the hole it leaves: a future change that
     * **stranded** floors in the escalator arm would satisfy it too, because demand to an
     * unreachable floor is never generated and the leg count falls. So the books are balanced.
     *
     * Same journeys in both arms — nobody was lost — and every lift leg that disappeared became
     * exactly one escalator hop. That is § D147 § 6's mechanism stated as an equation rather than
     * inferred from a total.
     */
    const before = auditOf(SKY);
    const after = auditOf(ESCALATOR);
    expect(after.generated).toBe(before.generated);
    expect(after.undelivered).toBe(before.undelivered);
    expect(before.transportHops).toBe(0);
    expect(after.transportHops).toBeGreaterThan(0);
    expect(before.legsCreated - after.legsCreated).toBe(after.transportHops);

    // The mechanism, said by the real planner rather than inferred from the counts.
    expect(plannerFor(SKY).plan('G', '9')?.elevatorLegCount).toBe(3);
    const planned = plannerFor(ESCALATOR).plan('G', '9');
    expect(planned?.elevatorLegCount).toBe(2);
    expect(planned?.transportHopCount).toBe(1);
    expect(planned?.floors).toStrictEqual(['G', '6', '7', '9']);
  });

  it('the landing picker changes the run — one end moved off the transfer level', () => {
    /*
     * The two floor pickers are the control, and `withTransportEnd` is the edit their click makes.
     * Dragging the lower landing down to floor 4 — a floor no sky chip has marked — leaves the
     * machine declared and takes it out of every route, because `traffic/route.ts` only lets a
     * journey change onto a lift at a transfer level. So the run must move, and moving the end
     * back must return the run we started from.
     */
    const moved: BuildingSpec = {
      ...ESCALATOR,
      transportModes: withTransportEnd(ESCALATOR, 'escalator-1', 0, 4),
    };
    expect(moved.transportModes[0]?.connects).toStrictEqual([4, 6]);
    expect(runWith(moved)).not.toBe(runWith(ESCALATOR));
    const back: BuildingSpec = { ...moved, transportModes: withTransportEnd(moved, 'escalator-1', 0, 5) };
    expect(runWith(back)).toBe(runWith(ESCALATOR));
  }, 60_000);

  it('the traversal-time control changes the run — the same route, ridden slower', () => {
    /*
     * The one control here whose effect is purely on the clock. The route is identical in both
     * arms — same banks, same landings, same hop — so the leg *count* must not move and the leg
     * *times* must, because the passenger reaches the upper landing later and boards a car that has
     * moved on. A seconds field the runtime never read would leave the two arms identical.
     */
    const slow: BuildingSpec = {
      ...ESCALATOR,
      transportModes: withTransportSeconds(ESCALATOR, 'escalator-1', 60),
    };
    expect(slow.transportModes[0]?.traversalTimeS).toBe(60);
    expect(partsOf(slow)[0]).toStrictEqual(partsOf(ESCALATOR)[0]);
    expect((partsOf(slow)[1] as unknown[]).length).toBe((partsOf(ESCALATOR)[1] as unknown[]).length);
    expect(JSON.stringify(partsOf(slow)[1])).not.toBe(JSON.stringify(partsOf(ESCALATOR)[1]));
  });

  it('refuses the one pair the loader will not take, at the control rather than on save', () => {
    // Both landings on one floor. `withTransportEnd` declines the click, so the state is not
    // reachable by pressing the picker — § 10.2's *"the control should make it unreachable"*.
    const same = withTransportEnd(ESCALATOR, 'escalator-1', 1, 5);
    expect(same[0]?.connects).toStrictEqual([5, 6]);
    // And the seconds control cannot write a time `transportModeSchema`'s `positive` refuses.
    expect(withTransportSeconds(ESCALATOR, 'escalator-1', 0)[0]?.traversalTimeS).toBe(0.1);
    expect(withTransportSeconds(ESCALATOR, 'escalator-1', -12)[0]?.traversalTimeS).toBe(0.1);
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
  }, 60_000);

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
      /*
       * And the states an escalator reaches, because a transport mode is a **second kind of edge**
       * in the same graph. A mirror that knew only about banks would have called the upper half of
       * this tower stranded while the run happily served it — a false refusal, which is worse than
       * a missing one because the reader would go and fix a building that was not broken.
       */
      SKY,
      ESCALATOR,
      // The machine moved off the transfer level: declared, and inert for everything but `6 → 7`.
      { ...ESCALATOR, transportModes: withTransportEnd(ESCALATOR, 'escalator-1', 0, 4) },
      // A tower shortened under a machine, so the omitted-mode branch is mirrored too.
      { ...ESCALATOR, floors: 6, bandByCar: { 0: [0, 5], 1: [5, 6], 2: [5, 6] } },
      // The one case where the escalator is the **only** way in: no bank spans the two lobby
      // levels, so without the edge floors 7–11 are stranded and with it they are not.
      {
        ...spec,
        cars: 2,
        skyFloors: [5, 6],
        bandByCar: { 0: [0, 5], 1: [6, 10] },
        noLobby: { 1: true },
        transportModes: [{ id: 'escalator-1', connects: [5, 6], traversalTimeS: 21.2 }],
      },
      {
        ...spec,
        cars: 2,
        skyFloors: [5, 6],
        bandByCar: { 0: [0, 5], 1: [6, 10] },
        noLobby: { 1: true },
      },
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
