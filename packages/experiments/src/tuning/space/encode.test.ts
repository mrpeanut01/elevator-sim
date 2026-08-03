import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  DISPATCHER_PROFILE_OBJECT_SECTIONS,
  createPolicyFor,
  dispatcherProfileSchema,
  loadConfig,
  resolveDoorConfig,
  runSimulation,
} from '@elevator-sim/core';
import type { DispatcherProfile, LoadedConfig } from '@elevator-sim/core';

import { candidateFromProfile, defaultCandidate, searchSpace, subspace } from './collect.js';
import {
  PROFILE_OBJECT_SECTIONS,
  PROFILE_SECTIONS,
  applyPatch,
  buildingFeasibility,
  candidateProfile,
  candidatesEqual,
  decodeCandidate,
  decodeInto,
  encodeCandidate,
  fromVector,
  reflectInto,
  toVector,
} from './encode.js';
import { policyNoiseStream, sampleCandidate, sampleCandidates } from './sample.js';
import { SearchSpaceError } from './types.js';
import type { Candidate, NumericParameter, ProfileSource } from './types.js';

const SPACE = searchSpace();
const SEED = 20_260_726;

/** The repository's real `data/` directory, the same one the Phase 3 and Phase 5 gates use. */
const DATA_DIR = fileURLToPath(new URL('../../../../../data', import.meta.url));

let CONFIG: LoadedConfig;

beforeAll(async () => {
  CONFIG = await loadConfig(DATA_DIR);
});

/* -------------------------------------------------------------------------- *
 * The round trip
 * -------------------------------------------------------------------------- */

describe('a candidate survives the trip to a profile and back, exactly', () => {
  it('is exact over a thousand random candidates', () => {
    // The claim docs/06 makes about `id`: a winner is written back as a profile *without
    // translation*. A thousand random points rather than a probe table, because a probe table is
    // a list, and the row somebody forgets to add is the one nothing checks.
    //
    // Feasibility is switched off here on purpose. This test is about the encoding, and drawing
    // without it exercises the combinations the feasibility oracle would otherwise remove — the
    // encoding has to be exact on those too, or a search could not report why one was rejected.
    const candidates = sampleCandidates(SPACE, policyNoiseStream(SEED), 1000, { validate: false });
    let numbers = 0;
    for (const [index, candidate] of candidates.entries()) {
      const roundTripped = encodeCandidate(SPACE, decodeCandidate(SPACE, candidate));
      expect(candidatesEqual(roundTripped, candidate), `candidate ${index}`).toBe(true);
      for (const [id, value] of candidate) {
        // `toBe`, not `toBeCloseTo`. Nothing in the encoding rounds, rescales or re-derives; a
        // value that came back close but not equal would mean it had been through arithmetic
        // that nobody asked for.
        expect(roundTripped.get(id), `${id} in candidate ${index}`).toBe(value);
        if (typeof value === 'number') numbers += 1;
      }
    }
    expect(numbers).toBeGreaterThan(30_000);
  });

  it('is exact over a narrowed space, where most dimensions are absent', () => {
    const idle = subspace(SPACE, (parameter) => parameter.section === 'idle');
    const base: Candidate = new Map([['idle.parkingStrategy', 'predicted-demand']]);
    for (const candidate of sampleCandidates(idle, policyNoiseStream(SEED), 200, {
      base,
      validate: false,
    })) {
      const patch = decodeCandidate(idle, candidate);
      expect(Object.keys(patch)).toStrictEqual(['idle']);
      expect(candidatesEqual(encodeCandidate(idle, patch), candidate)).toBe(true);
    }
  });

  it('keeps a weight of zero, which is a decision and not an absence', () => {
    // A term weighted `0` is removed from the sum; a term the profile never mentions has no
    // weight at all. The two resolve identically today and are different statements, and a
    // membership test written with truthiness would silently turn the first into the second.
    const point: Candidate = new Map([
      ['weights.waitTime', 0],
      ['weights.distanceTravelled', 1],
    ]);
    const patch = decodeCandidate(SPACE, point);
    expect(patch.weights).toStrictEqual({ waitTime: 0, distanceTravelled: 1 });
    expect(candidatesEqual(encodeCandidate(SPACE, patch), point)).toBe(true);
  });

  it('round-trips the one id whose authored form is not its dotted path', () => {
    // `constraints.noDirectionReversal` is a boolean in the space and a membership in
    // `hardConstraints` in the file, because a set-valued parameter is not something a generic
    // optimizer can sample. Both directions, both values, and the absent case.
    const on: Candidate = new Map([['constraints.noDirectionReversal', true]]);
    const off: Candidate = new Map([['constraints.noDirectionReversal', false]]);
    expect(decodeCandidate(SPACE, on).hardConstraints).toStrictEqual(['noDirectionReversal']);
    expect(decodeCandidate(SPACE, off).hardConstraints).toStrictEqual([]);
    expect(candidatesEqual(encodeCandidate(SPACE, decodeCandidate(SPACE, on)), on)).toBe(true);
    expect(candidatesEqual(encodeCandidate(SPACE, decodeCandidate(SPACE, off)), off)).toBe(true);

    // A candidate that never searched the constraint must not acquire one, in either direction.
    const silent = decodeCandidate(SPACE, new Map([['weights.waitTime', 1]]));
    expect(Object.hasOwn(silent, 'hardConstraints')).toBe(false);
    expect(encodeCandidate(SPACE, silent).has('constraints.noDirectionReversal')).toBe(false);
  });

  it('takes its section list from the schema, not from a list of its own', () => {
    // The guard § D146 asked for. `PROFILE_OBJECT_SECTIONS` must be the **same value** `core`
    // derives from `dispatcherProfileSchema` — identity, not equality, because an equal copy is
    // exactly what a hand-written list that happens to be in step looks like, and being in step is
    // a property that lasts until the next section lands.
    expect(
      PROFILE_OBJECT_SECTIONS,
      'PROFILE_OBJECT_SECTIONS must BE core\'s DISPATCHER_PROFILE_OBJECT_SECTIONS, not a list equal to it. An equal copy is what the hand-written list looked like on the day before `selection` landed.',
    ).toBe(DISPATCHER_PROFILE_OBJECT_SECTIONS);

    // And every one of them is a real key of the real profile schema, so the derivation cannot
    // drift into naming a section a profile does not have. `config/schema.test.ts` proves the
    // other direction — that a section the schema gains is picked up — against a fictional schema.
    for (const section of PROFILE_OBJECT_SECTIONS) {
      expect(Object.hasOwn(dispatcherProfileSchema.shape, section)).toBe(true);
    }

    // Seven today, and the count is pinned beside the space's own. § D146 is the reason: when
    // `selection` was missing from the hand-written list the space was 49 instead of 56 and no
    // test anywhere said so. `collect.test.ts` pins the space and the declared rows behind it;
    // this pins the section count those two are a function of, so a section that silently
    // vanishes fails here first and with a message that names the cause.
    //
    // The **space** moved to 57 with `eligibility.enRouteDiversion` (`DECISIONS.md` § D205) while
    // the **section count** did not: the new tunable joins a section that already existed. That is
    // the relationship this pair exists to distinguish — a space that grows without a section
    // growing is a new knob, and a section count that moves on its own is a schema change.
    expect(PROFILE_OBJECT_SECTIONS.length).toBe(7);
    expect(SPACE.parameters.length).toBe(58);
    expect(new Set(SPACE.parameters.map((parameter) => parameter.section))).toStrictEqual(
      new Set(['weights', 'constraints', ...PROFILE_OBJECT_SECTIONS]),
    );
  });

  it('emits only the sections a profile has, and refuses one it does not', () => {
    // The authored keys are the space's sections with the one translation applied: `constraints`
    // is written as `hardConstraints`, which is the whole of the exception docs/06 records.
    const authoredKeys = [
      'weights',
      'hardConstraints',
      ...PROFILE_OBJECT_SECTIONS,
    ];
    expect(PROFILE_SECTIONS).toStrictEqual(['weights', 'constraints', ...PROFILE_OBJECT_SECTIONS]);
    const patch = decodeCandidate(SPACE, defaultCandidate(SPACE));
    for (const section of Object.keys(patch)) expect(authoredKeys).toContain(section);

    // A dimension whose section no profile has would otherwise be dropped here and look
    // authorable — which is how `sim.drainGraceS` first got into the space.
    const impossible = subspace(SPACE, []) as unknown as typeof SPACE;
    const stray = new Map([
      [
        'sim.drainGraceS',
        3600,
      ],
    ]);
    expect(() =>
      decodeCandidate(
        {
          ...impossible,
          parameters: [],
          byId: new Map([
            [
              'sim.drainGraceS',
              {
                id: 'sim.drainGraceS',
                section: 'sim',
                key: 'drainGraceS',
                type: 'continuous' as const,
                min: 0,
                max: 1,
                scale: 'linear' as const,
                default: 0,
                description: 'a section no dispatcher profile has',
                declaredBy: [],
              },
            ],
          ]),
        },
        stray,
      ),
    ).toThrow(/no place for/);
  });
});

/* -------------------------------------------------------------------------- *
 * Reading an existing profile
 * -------------------------------------------------------------------------- */

describe('a shipped profile reads as a candidate', () => {
  it('fills what predictive-balanced does not author with the declared default', () => {
    const profile = CONFIG.dispatcherProfilesById.get('predictive-balanced') as DispatcherProfile;
    const incumbent = candidateFromProfile(SPACE, profile);

    // Authored, and read back as authored.
    expect(incumbent.get('weights.waitTime')).toBe(1);
    expect(incumbent.get('dispatch.assignmentTiming')).toBe('deferred');
    expect(incumbent.get('idle.parkingStrategy')).toBe('predicted-demand');
    expect(incumbent.get('answer.dwellPolicy')).toBe('adaptive');

    // **The known-answer case.** `predictive-balanced` authors an 8 s deadband, which vetoes
    // every reposition it might make; Phase 5's sweep on Garden Apartments at n = 300 has an
    // interior optimum at 2 s. It is deliberately left as shipped so Phase 7 has a ground truth,
    // so this assertion is a guard against somebody "fixing" the data file: the incumbent the
    // optimizer starts from must still be the 8.
    expect(incumbent.get('idle.repositionThresholdS')).toBe(8);
    const deadband = SPACE.byId.get('idle.repositionThresholdS');
    expect(deadband?.type === 'continuous' ? [deadband.min, deadband.max] : undefined).toStrictEqual(
      [0, 60],
    );

    // Not authored, so the resolver's default is what the profile actually runs.
    expect(profile.weights['rideTime']).toBeUndefined();
    expect(incumbent.get('normalization.waitTimeS')).toBe(60);
    expect(incumbent.get('idle.predictorLearningRate')).toBe(0.3);
    expect(incumbent.get('auction.aggregation')).toBe('central-argmin');

    // Inactive under this profile: it is `up-down-buttons`, so no landing call carries a
    // destination and `rideTime` cannot change a decision. One dimension of twelve, not searched.
    expect(incumbent.has('weights.rideTime')).toBe(false);
    // `central-argmin` holds no auction, so neither auction knob is live.
    expect(incumbent.has('auction.rounds')).toBe(false);
    expect(incumbent.has('auction.reserveMarginalDelayS')).toBe(false);
  });

  it('reads every shipped profile as a feasible candidate', () => {
    for (const profile of CONFIG.dispatcherProfilesById.values()) {
      const candidate = candidateFromProfile(SPACE, profile);
      expect(SPACE.validate(candidate), profile.id).toBeUndefined();
    }
  });

  it('is strict where encodeCandidate is strict, and lenient where it fills', () => {
    const bare: ProfileSource = { id: 'bare', name: 'Bare', weights: {} };
    expect([...encodeCandidate(SPACE, bare).keys()]).toStrictEqual([]);
    expect(candidateFromProfile(SPACE, bare).size).toBe(defaultCandidate(SPACE).size);
  });
});

/* -------------------------------------------------------------------------- *
 * Merging
 * -------------------------------------------------------------------------- */

describe('a patch merges onto a base without dropping what it did not touch', () => {
  it('merges field by field within a section', () => {
    // A search narrowed to the deadband must not delete the incumbent's predictor horizon, which
    // is what replacing the `idle` object wholesale would do — and the winner would then be
    // optimal at a horizon nobody chose.
    const base = CONFIG.dispatcherProfilesById.get('predictive-balanced') as DispatcherProfile;
    const deadband = subspace(SPACE, ['idle.repositionThresholdS']);
    const merged = applyPatch(SPACE, base, decodeCandidate(deadband, new Map([['idle.repositionThresholdS', 2]])));
    const idle = merged['idle'] as Record<string, unknown>;
    expect(idle['repositionThresholdS']).toBe(2);
    expect(idle['predictorHorizonS']).toBe(300);
    expect(idle['parkingStrategy']).toBe('predicted-demand');
    expect(merged['weights']).toStrictEqual(base.weights);
  });

  it('merges weights rather than replacing them', () => {
    const base = CONFIG.dispatcherProfilesById.get('predictive-balanced') as DispatcherProfile;
    const merged = applyPatch(SPACE, base, decodeCandidate(SPACE, new Map([['weights.waitTime', 2]])));
    const weights = merged['weights'] as Record<string, number>;
    expect(weights['waitTime']).toBe(2);
    expect(weights['crowding']).toBe(0.3);
  });

  it('keeps a hard constraint the space does not declare', () => {
    // There is one declared constraint today, and the point is what happens when there are two:
    // a search that never knew about the second must not silently drop it.
    const base: ProfileSource = {
      id: 'base',
      name: 'Base',
      weights: {},
      hardConstraints: ['noDirectionReversal', 'someLaterRule'],
    };
    const merged = applyPatch(
      SPACE,
      base,
      decodeCandidate(SPACE, new Map([['constraints.noDirectionReversal', false]])),
    );
    expect(merged['hardConstraints']).toStrictEqual(['someLaterRule']);
  });
});

/* -------------------------------------------------------------------------- *
 * A candidate as a profile the loader accepts
 * -------------------------------------------------------------------------- */

/** The one run input a dispatcher profile cannot carry: the weight sets a selector chooses between. */
const PROBE_WEIGHT_SETS = {
  patternSwitching: {
    patternDetector: {
      type: 'fuzzy',
      inputs: ['lobbyArrivalRate'],
      patterns: ['probe'],
      hysteresisS: 0,
      membership: { probe: { lobbyArrivalRate: [0, 1] as readonly [number, number] } },
    },
    weightSetsByPattern: { probe: 'probe-arm' },
  },
  weightsByProfileId: new Map<string, ReadonlyMap<string, number>>([
    ['probe-arm', new Map([['waitTime', 1]])],
  ]),
};

describe('a decoded candidate is a profile loadConfig accepts and a policy builds from', () => {
  it('parses every random candidate through the real profile parser', () => {
    // `candidateProfile` validates through `parseDispatcherProfiles`, the function `loadConfig`
    // itself calls. So "this parses" and "`loadConfig` would accept this" are one statement.
    const candidates = sampleCandidates(SPACE, policyNoiseStream(SEED), 200);
    for (const [index, candidate] of candidates.entries()) {
      const profile = candidateProfile(SPACE, candidate, { id: `cand-${index}` });
      expect(profile.id).toBe(`cand-${index}`);
      // And the profile reads back as the candidate it came from, so the trip through the
      // parser changed nothing.
      expect(candidatesEqual(encodeCandidate(SPACE, profile), candidate)).toBe(true);
      // The weight-set library is handed in for the same reason the building is not: it is a
      // **run input, not a profile field**. `selection.policy` is authorable and the arms are the
      // file-level `patternSwitching` block, so `core` refuses a profile that asks for a selector
      // with nothing to select between — a fact about what this call was handed, not about the
      // candidate. Built here rather than imported from `encode.ts` so the two oracles share no
      // code: this file is the independent check on that one.
      expect(() => createPolicyFor(profile, { weightSets: PROBE_WEIGHT_SETS })).not.toThrow();
    }
  });

  it('is loaded from disk by loadConfig and builds a working policy', async () => {
    // The whole round trip, through the filesystem: write the winner into a copy of `data/`,
    // load that directory the way every run loads it, and build the group controller from what
    // came back. A profile that only ever existed in memory has not been shown to be shippable.
    const candidate = sampleCandidate(SPACE, policyNoiseStream(SEED), {
      feasible: buildingFeasibility(
        SPACE,
        CONFIG.buildingsById.get('garden-apartments') ?? [...CONFIG.buildingsById.values()][0]!,
        CONFIG.elevatorSpecs,
      ),
    });
    const written = candidateProfile(SPACE, candidate, { id: 'tuned-winner', name: 'Tuned winner' });

    const dir = await mkdtemp(join(tmpdir(), 'elevator-sim-space-'));
    await cp(DATA_DIR, dir, { recursive: true });
    const file = join(dir, 'dispatcher-profiles.json');
    const authored = JSON.parse(await readFile(file, 'utf8')) as { profiles: unknown[] };
    authored.profiles.push(written);
    await writeFile(file, JSON.stringify(authored, null, 2), 'utf8');

    const reloaded = await loadConfig(dir);
    const fromDisk = reloaded.dispatcherProfilesById.get('tuned-winner') as DispatcherProfile;
    expect(fromDisk).toBeDefined();

    // Nothing was lost on the way through JSON and the parser.
    expect(candidatesEqual(encodeCandidate(SPACE, fromDisk), candidate)).toBe(true);

    // The weight-set library, for exactly the reason the sibling test above gives: it is a **run
    // input, not a profile field**, and `core` refuses a profile that declares
    // `selection.policy: "contextual"` with nothing to select between. This call omitted it and
    // passed only because the sampled winner happened never to draw `contextual` — a latent
    // fragility, surfaced when `eligibility.enRouteDiversion` (`DECISIONS.md` § D205) added a
    // dimension and shifted the draw. Supplying the library is what the assertion always meant:
    // "the profile builds a working policy", not "the profile never asks for a selector".
    const policy = createPolicyFor(fromDisk, { weightSets: PROBE_WEIGHT_SETS });
    expect(policy.engine).toBe('weighted-cost');
    expect(policy.id).toBe('tuned-winner');
    expect(policy.parameters.length).toBeGreaterThan(0);

    // And it runs. A policy that builds and then cannot serve a passenger is not a working one,
    // and this is the only assertion in the module that exercises the shipped path end to end.
    const building = reloaded.buildingsById.get('garden-apartments');
    expect(building).toBeDefined();
    const result = runSimulation({
      building: building as NonNullable<typeof building>,
      dispatcherProfile: fromDisk,
      trafficProfiles: reloaded.trafficProfiles,
      elevatorSpecs: reloaded.elevatorSpecs,
      // The file-level `patternSwitching` block, the same run input `createPolicyFor` was handed
      // above. `Simulation` derives the weight-set library from it, so passing the whole loaded
      // file is how a shipped run supplies one — and a winner that draws `selection.policy:
      // "contextual"` needs it here for the same reason it needed it there.
      dispatcherProfiles: reloaded.dispatcherProfiles,
      seed: SEED,
      durationS: 300,
    });
    expect(result.summary.counts.arrivals).toBeGreaterThan(0);
    expect(result.summary.counts.alighted).toBeGreaterThan(0);
  }, 60_000);

  it('refuses to build a profile from an infeasible candidate, with core’s reason', () => {
    const point = new Map(defaultCandidate(SPACE));
    point.set('normalization.waitTimeS', -1);
    expect(() => candidateProfile(SPACE, point, { id: 'broken' })).toThrow(SearchSpaceError);
    expect(() => candidateProfile(SPACE, point, { id: 'broken' })).toThrow(/not authorable/);
  });

  it('checks the car-level constraints the space alone cannot see', () => {
    // `answer.maxDwellS` under adaptive dwell must clear the car's own hall dwell, which is a
    // property of the *building* and so cannot be an `activeWhen`. Declared range is `[4, 30]`
    // and hall dwell reaches 7, so a uniform draw is infeasible on some cars a few per cent of
    // the time — and the failure lands at car construction, where a search sees a throw rather
    // than a score.
    const building = CONFIG.buildingsById.get('midtown-office');
    const feasible = buildingFeasibility(
      SPACE,
      building as NonNullable<typeof building>,
      CONFIG.elevatorSpecs,
    );
    const point = new Map(defaultCandidate(SPACE));
    point.set('answer.dwellPolicy', 'adaptive');
    point.set('answer.dwellAdaptationGain', 0.4);
    point.set('answer.maxDwellS', 4);
    expect(feasible(point)).toMatch(/maxDwellS/);

    point.set('answer.maxDwellS', 20);
    expect(feasible(point)).toBeUndefined();
  });

  it('reads the whole merged point on a subspace, not the sliver the subspace searches', () => {
    // The regression, wired exactly as `buildingFeasibility`'s own docstring prescribes: narrow
    // the search to the dwell ceiling, start from the `predictive-balanced` incumbent — which
    // authors `dwellPolicy: adaptive` — and hand the oracle to `sampleCandidate`.
    //
    // Before the fix the oracle decoded against the **narrowed** index, so the `adaptive` the
    // merge supplied was dropped, `resolveDoorConfig` applied its own `fixed` default, and the
    // constraint never fired: 200 of 200 draws accepted, 4 of them profiles that throw at car
    // construction. A search sees a throw where it expects a score.
    const building = CONFIG.buildingsById.get('midtown-office') as NonNullable<
      ReturnType<typeof CONFIG.buildingsById.get>
    >;
    const profile = CONFIG.dispatcherProfilesById.get('predictive-balanced') as DispatcherProfile;
    const incumbent = candidateFromProfile(SPACE, profile);
    expect(incumbent.get('answer.dwellPolicy')).toBe('adaptive');

    const dwell = subspace(SPACE, ['answer.maxDwellS']);
    const feasible = buildingFeasibility(dwell, building, CONFIG.elevatorSpecs);
    const wholeSpace = buildingFeasibility(SPACE, building, CONFIG.elevatorSpecs);

    // A ceiling below the car's own hall dwell, merged onto the adaptive incumbent. Both oracles
    // must give the same answer; the narrowed one used to give none.
    const tooLow: Candidate = new Map([...incumbent, ['answer.maxDwellS', 4.85]]);
    expect(feasible(tooLow)).toMatch(/maxDwellS/);
    expect(feasible(tooLow)).toBe(wholeSpace(tooLow));

    const clear: Candidate = new Map([...incumbent, ['answer.maxDwellS', 20]]);
    expect(feasible(clear)).toBeUndefined();

    // And end to end through the sampler: every draw it accepts materializes to a profile whose
    // cars actually build.
    const rng = policyNoiseStream(4242);
    for (let index = 0; index < 200; index += 1) {
      const candidate = sampleCandidate(dwell, rng, { base: incumbent, feasible });
      const merged: Candidate = new Map([...incumbent, ...candidate]);
      const built = candidateProfile(SPACE, merged, { id: `dwell-${index}` });
      for (const bank of building.banks) {
        for (const car of bank.cars) {
          expect(() => resolveDoorConfig(car, built.answer), `draw ${index}`).not.toThrow();
        }
      }
    }
  });

  it('takes the incumbent profile as a base, for what a candidate cannot carry', () => {
    // The other half of the same hole: a subspace candidate merged onto a base *candidate* still
    // says nothing about a profile field no declared dimension covers. `options.base` is the
    // incumbent profile itself, so the oracle judges the dispatcher the run will actually build.
    const building = CONFIG.buildingsById.get('midtown-office') as NonNullable<
      ReturnType<typeof CONFIG.buildingsById.get>
    >;
    const adaptive: ProfileSource = {
      id: 'adaptive-base',
      name: 'Adaptive base',
      weights: {},
      answer: { dwellPolicy: 'adaptive', dwellAdaptationGain: 0.4 },
    };
    const dwell = subspace(SPACE, ['answer.maxDwellS']);
    const ceiling: Candidate = new Map([['answer.maxDwellS', 4.85]]);

    // No base: the candidate alone says nothing about the dwell policy, and `fixed` is feasible.
    expect(buildingFeasibility(dwell, building, CONFIG.elevatorSpecs)(ceiling)).toBeUndefined();
    // With the base: the same ceiling is the one `resolveDoorConfig` refuses.
    expect(
      buildingFeasibility(dwell, building, CONFIG.elevatorSpecs, { base: adaptive })(ceiling),
    ).toMatch(/maxDwellS/);
  });
});

/* -------------------------------------------------------------------------- *
 * The real-vector embedding
 * -------------------------------------------------------------------------- */

describe('the vector fold reflects rather than clamping onto an endpoint', () => {
  it('never manufactures the one endpoint core refuses', () => {
    // `answer.bypassLoadThreshold` declares `[0, 1]` and `resolveLoadSensor` requires it strictly
    // positive, so `0` is a point of the declared box that no car will run. A clamping fold turns
    // every below-box proposal into exactly that value: measured at 67 of 500 CMA-ES-shaped
    // proposals. Reflection puts them back inside on a continuum, and the count is zero.
    const bypass = SPACE.byId.get('answer.bypassLoadThreshold') as NumericParameter;
    expect([bypass.min, bypass.max]).toStrictEqual([0, 1]);

    const index = SPACE.ids.indexOf('answer.bypassLoadThreshold');
    const centre = toVector(SPACE, defaultCandidate(SPACE));
    let zeros = 0;
    let belowBox = 0;
    for (let step = 1; step <= 400; step += 1) {
      const vector = [...centre];
      // Deterministically below the box, by a hair and by a mile. Nothing random: the defect was
      // a fold, and a fold is a function.
      vector[index] = -(step / 400);
      belowBox += 1;
      const value = fromVector(SPACE, vector).get('answer.bypassLoadThreshold') as number;
      expect(value, `proposal ${step}`).toBeGreaterThan(0);
      expect(value, `proposal ${step}`).toBeLessThanOrEqual(1);
      if (value === 0) zeros += 1;
    }
    expect(belowBox).toBe(400);
    expect(zeros).toBe(0);

    // The reflection is the fold, not a nudge: a coordinate 0.25 below the low bound comes back
    // 0.25 above it.
    const reflected = [...centre];
    reflected[index] = -0.25;
    expect(fromVector(SPACE, reflected).get('answer.bypassLoadThreshold')).toBeCloseTo(0.25, 12);
    expect(reflectInto(-0.25, 0, 1)).toBeCloseTo(0.25, 12);
    expect(reflectInto(1.25, 0, 1)).toBeCloseTo(0.75, 12);
    expect(reflectInto(0.4, 0, 1)).toBe(0.4);
  });

  it('decodes a non-finite coordinate to the declared default, not to an endpoint', () => {
    // A `NaN` coordinate is not a point of the box and no fold means anything for it. Folding to
    // the low bound would put `answer.bypassLoadThreshold` at 0 again — an infeasible value that
    // reads like a decision the optimizer made.
    const index = SPACE.ids.indexOf('answer.bypassLoadThreshold');
    const vector = [...toVector(SPACE, defaultCandidate(SPACE))];
    vector[index] = Number.NaN;
    const value = fromVector(SPACE, vector).get('answer.bypassLoadThreshold');
    expect(value).toBe(SPACE.defaults.get('answer.bypassLoadThreshold'));
    expect(value).toBe(0.8);
  });

  it('does not duplicate a hard constraint when a merged point decodes through the whole index', () => {
    // `buildingFeasibility` decodes a merged subspace point against `allById`, so a constraint the
    // narrowed space does not search can reach `applyPatch` in the patch. Taking the declared set
    // from the narrowed list would keep the base's copy and append the patch's.
    const idle = subspace(SPACE, (parameter) => parameter.section === 'idle');
    const base: ProfileSource = {
      id: 'base',
      name: 'Base',
      weights: {},
      hardConstraints: ['noDirectionReversal'],
    };
    const merged = applyPatch(
      idle,
      base,
      decodeInto(SPACE.allById, new Map([['constraints.noDirectionReversal', true]])),
    );
    expect(merged['hardConstraints']).toStrictEqual(['noDirectionReversal']);
  });
});
