/**
 * **Identity for per-landing fixtures, and what "cross-platform" can honestly mean here** —
 * GitHub issue #534 item 3, `DECISIONS.md` § D553 clause 7, § D569.
 *
 * ## The question, and the premise that turned out to be stale
 *
 * § D553 clause 7 measured stage 1's central claim — *a building that declares no
 * `landingCallType` runs exactly as it always has* — by hashing seventy whole `SimulationResult`s
 * on two trees. The review of PR #532 recorded that the measurement was taken **on macOS only**,
 * and asked for a cross-platform identity check, *"CI runs both platforms, but no test hashes whole
 * results across them."*
 *
 * **CI does not run both platforms.** It has not since [§ D462](../../../../DECISIONS.md), the
 * product owner's call on 2026-09-02: `.github/workflows/ci.yml` dropped the `macos-latest` leg and
 * its five jobs are all `ubuntu-latest`. That file's own header says what was given up in terms —
 * *"portability stops being a MEASURED property … the pins are still pinned; nothing checks that
 * they travel"*. So there is no second platform for a cross-platform check to disagree with, and a
 * test that hashed whole results *across* platforms would have nothing to compare.
 *
 * ## And a whole-result hash pinned here would be the defect § D196 removed
 *
 * `traffic/*Identity.test.ts` used to pin `SHA-256(JSON.stringify(result))` and compare it with
 * `toBe`. That asserts bit-identical doubles on every machine, which this project neither needs nor
 * can keep: x64 and arm64 differ in the last bits of the traffic draws, and the same 26 pins passed
 * in whichever environment last regenerated them and failed in the other, **in both directions**
 * ([§ D196](../../../../DECISIONS.md), [§ D201](../../../../DECISIONS.md)). Re-introducing one for
 * the hybrid configuration would produce a pin that is green on the machine that wrote it and red
 * on a developer's, which is worse than no check: it would report float noise as a regression in
 * the one place this repository is most careful not to.
 *
 * ## So the check is built in the two halves that *are* portable, and both are runs
 *
 * 1. **Unset is unchanged, re-measured here rather than inherited.** Every shipped building, under
 *    seven dispatcher arms, at two demand shapes, run twice: once as it ships and once with the
 *    dispatcher's own call type declared on **every** landing — which § D553 clause 1 says is the
 *    same building. Compared with the whole-result `fingerprint`, byte for byte. This is a
 *    *within-platform* A/B and is therefore exactly as portable as the simulator is: it re-measures
 *    stage 1's claim on whatever machine runs it, so CI's Linux leg is the Linux measurement the
 *    review asked for, taken on every commit rather than once.
 * 2. **A digest that travels, pinned for the hybrid configuration.** `structuralDigestOfResult`
 *    hashes every decision — every key, string, boolean and **integer** — and elides only the
 *    magnitudes; {@link HYBRID_HEADLINE} holds those to a relative tolerance instead. That split is
 *    portable by construction rather than by measurement, which is why `transportIdentity.test.ts`
 *    says it *"matters more now than it did when it landed"* on a one-leg matrix. A platform whose
 *    **decisions** diverge on a hybrid run — a different car answering, a different landing
 *    assigning, a different batch key — goes red here, on that platform, naming the cell.
 *
 * What this does not claim: that two platforms have been compared. Nobody has run this on a second
 * one, and nothing in CI will. The pins below are a claim that *can* be falsified by a platform
 * that disagrees, which is the strongest honest form the check has while the matrix is one leg.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { CallType, DispatcherProfile, LoadedConfig, ResolvedBuilding } from '../config/types.js';
import { resolveDispatchConfig } from '../dispatch/policy.js';
import {
  agreesWithin,
  continuousFieldsOf,
  structuralDigestOfResult,
} from '../traffic/identity.test-helper.js';

import {
  BUILDING_IDS,
  fingerprint,
  load,
  reauthoredWithLandingCallTypeEverywhere,
  reauthoredWithLandings,
} from './fixtures.test-helper.js';
import { runSimulation } from './simulation.js';
import type { SimulationConfig, SimulationResult } from './types.js';

const SEED = 20_260_914;

/** The two demand shapes § D553 clause 7 measured at: a mixed interfloor day and an up-peak. */
const SHAPES = {
  interfloor: {
    durationS: 900,
    reportWindow: 'full-run',
    demand: {
      directionalSplit: { incoming: 0.4, outgoing: 0.3, interfloor: 0.3 },
      arrivalRatePctPop5min: 1.5,
      peakWindowS: 300,
    },
  },
  'up-peak': {
    durationS: 900,
    reportWindow: 'full-run',
    demand: {
      directionalSplit: { incoming: 0.85, outgoing: 0.05, interfloor: 0.1 },
      arrivalRatePctPop5min: 4,
      peakWindowS: 300,
    },
  },
} as const satisfies Readonly<Record<string, Partial<SimulationConfig>>>;

let config: LoadedConfig;

beforeAll(async () => {
  config = await load();
});

function shipped(buildingId: string): ResolvedBuilding {
  const building = config.buildingsById.get(buildingId);
  if (building === undefined) throw new Error(`missing building fixture "${buildingId}"`);
  return building;
}

function profile(id: string): DispatcherProfile {
  const found = config.dispatcherProfilesById.get(id);
  if (found === undefined) throw new Error(`missing dispatcher fixture "${id}"`);
  return found;
}

/** `eta` with the named stage settings — the kiosk arms `data/` does not ship. */
function arm(id: string, dispatch: DispatcherProfile['dispatch']): DispatcherProfile {
  const base = profile('eta');
  return {
    ...base,
    id,
    name: id,
    weights: { ...base.weights, rideTime: 1 },
    dispatch: { ...base.dispatch, ...dispatch },
  };
}

/**
 * The seven arms, named as § D553 clause 7 names them: five shipped profiles, a bare
 * `destination-entry` kiosk and a `destination-entry` panel.
 *
 * Built lazily because they read `config`, which `beforeAll` fills.
 */
function arms(): readonly (readonly [string, DispatcherProfile])[] {
  return [
    ['collective', profile('collective')],
    ['eta', profile('eta')],
    ['destination-eta', profile('destination-eta')],
    ['destination-panel', profile('destination-panel')],
    ['predictive-balanced', profile('predictive-balanced')],
    ['kiosk', arm('kiosk', { callType: 'destination-entry' })],
    ['kiosk-panel', arm('kiosk-panel', { callType: 'destination-entry', passengerAssignment: 'panel' })],
  ];
}

/**
 * The call type a profile's landings register when they declare nothing — read off the **resolved**
 * stage rather than the authored profile.
 *
 * `crossModelNotice` in `cli/commands/compare.ts` gives the reason and `Simulation` does the same
 * thing: `resolveDispatchConfig` is what applies the defaults, and reading `profile.dispatch`
 * directly would be a second opinion about a question `core` has already answered — `collective`
 * authors no `callType` at all and resolves to `up-down-buttons`.
 */
function resolvedCallType(dispatcherProfile: DispatcherProfile): CallType {
  return resolveDispatchConfig(dispatcherProfile).dispatch.callType;
}

function run(
  building: ResolvedBuilding,
  dispatcherProfile: DispatcherProfile,
  shape: Partial<SimulationConfig>,
): SimulationResult {
  return runSimulation({
    building,
    dispatcherProfile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: SEED,
    onTimeout: 'report',
    ...shape,
  });
}

/* -------------------------------------------------------------------------- *
 * 1. Unset is unchanged — measured on whatever platform runs this
 * -------------------------------------------------------------------------- */

describe('declaring the dispatcher’s own call type everywhere changes nothing', () => {
  it('is byte-identical on every shipped building, under seven arms, at two demand shapes', () => {
    let compared = 0;
    for (const buildingId of BUILDING_IDS) {
      for (const [armId, dispatcherProfile] of arms()) {
        for (const [shapeId, shape] of Object.entries(SHAPES)) {
          const declared = reauthoredWithLandingCallTypeEverywhere(
            config,
            buildingId,
            resolvedCallType(dispatcherProfile),
          );
          const cell = `${buildingId}|${armId}|${shapeId}`;
          expect(fingerprint(run(declared, dispatcherProfile, shape)), cell).toBe(
            fingerprint(run(shipped(buildingId), dispatcherProfile, shape)),
          );
          compared += 1;
        }
      }
    }
    // Stated rather than assumed: a loop that silently stopped matching would pass every assertion
    // above. Five buildings × seven arms × two shapes.
    expect(compared).toBe(BUILDING_IDS.length * 7 * Object.keys(SHAPES).length);
  }, 600_000);
});

/* -------------------------------------------------------------------------- *
 * 2. A digest that travels, pinned for the hybrid configuration
 * -------------------------------------------------------------------------- */

/** One pinned cell: a building, the landings that keep a panel, and the arm that runs it. */
interface HybridCell {
  readonly key: string;
  readonly buildingId: string;
  /** Landings that keep the dispatcher's own fixture; every other landing gets up/down buttons. */
  readonly panels: readonly string[];
  readonly shape: keyof typeof SHAPES;
}

/**
 * The cells pinned below: three buildings whose entrance is authored explicitly, one of them
 * access-zoned, each with panels on a proper subset of their landings so the run is `hybrid`.
 */
const HYBRID_CELLS: readonly HybridCell[] = Object.freeze([
  Object.freeze({ key: 'midtown-office|G', buildingId: 'midtown-office', panels: ['G'], shape: 'up-peak' as const }),
  Object.freeze({ key: 'midtown-office|G+P1', buildingId: 'midtown-office', panels: ['G', 'P1'], shape: 'interfloor' as const }),
  Object.freeze({ key: 'garden-apartments|G', buildingId: 'garden-apartments', panels: ['G'], shape: 'up-peak' as const }),
  Object.freeze({ key: 'secure-tower|G', buildingId: 'secure-tower', panels: ['G'], shape: 'up-peak' as const }),
]);

/**
 * The **structural** digest of each cell under `destination-panel`: every decision and every count,
 * and no real number.
 *
 * Regenerated on this tree, because the function is this tree's. What makes a pin like this worth
 * having on a one-leg CI matrix is stated in the module docstring: it is portable by construction,
 * so a platform whose *decisions* diverge fails it on that platform and names the cell, while float
 * noise cannot move it at all.
 *
 * **Taken on `linux/x64` under Node 22, and CI runs Node 26 — which is not a hole.** `ci.yml`'s
 * header records that both § D196 and § D201 independently found the *whole-result* digests
 * bit-identical across Node versions (22 against 26, and 26.5.0 against 26.5.1), which is why the
 * workflow pins one Node and has no Node axis. A structural digest is strictly weaker than the
 * digests that measurement was taken on, so a version that moved this one would have moved those.
 * The variable that has never been isolated is the **platform**, and that is exactly what these
 * pins are positioned to catch if a second one ever runs them.
 */
const HYBRID_DIGEST: Readonly<Record<string, string>> = {
  'midtown-office|G': '777e5b1a7983ffb839449f76207372ff873b528efabd7748fff8fef0f8c2addd',
  'midtown-office|G+P1': 'f1f880c7e10a572ee372c34dc95edf03a5c0a3288fa790a8a382c26aff28a614',
  'garden-apartments|G': '8e66755b2e126109c9843af32aa606849c4f16f68e36dc6a31c479663564c7c3',
  'secure-tower|G': 'f6c6b72c422ec63d97b244f93eb0b5f9fb1edb2b6b4f2640ba85f3700c724d30',
};

/** The eight reported figures, and where each lives in a summary — `transportIdentity.test.ts`'s. */
const HEADLINE_PATHS: readonly (readonly [string, string])[] = [
  ['waitMeanS', 'waiting.meanS'],
  ['waitP95S', 'waiting.p95S'],
  ['rideMeanS', 'rideTime.meanS'],
  ['ttdMeanS', 'timeToDestination.meanS'],
  ['workKJ', 'energy.workKJ'],
  ['workPerLegKJ', 'energy.workPerServedLegKJ'],
  ['handlingPct', 'handlingCapacity.pctPopulationPer5Min'],
  ['longestWaitS', 'serviceLevel.longestWaitS'],
];

/** The magnitudes the digest elides, held to `identity.test-helper.ts`'s relative tolerance. */
const HYBRID_HEADLINE: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  'midtown-office|G': { waitMeanS: 57.77855506705594, waitP95S: 211.52108083421558, rideMeanS: 82.57659702743801, ttdMeanS: 140.35515209449397, workKJ: 9928.054356890862, workPerLegKJ: 68.94482192285321, handlingPct: 2.650186711976394, longestWaitS: 273.6405967712709 },
  'midtown-office|G+P1': { waitMeanS: 12.237486417445137, waitP95S: 25.35535727798681, rideMeanS: 42.280534293210934, ttdMeanS: 54.51802071065606, workKJ: 7288.895869713392, workPerLegKJ: 155.0828908449658, handlingPct: 0.9031453832049908, longestWaitS: 40.30086417203614 },
  'garden-apartments|G': { waitMeanS: 8.686813186813193, waitP95S: 29.309523809523853, rideMeanS: 47.48076923076923, ttdMeanS: 56.16758241758243, workKJ: 259.1654757663596, workPerLegKJ: 19.935805828181508, handlingPct: 3.6111111111111107, longestWaitS: 29.309523809523853 },
  'secure-tower|G': { waitMeanS: 15.485698987486737, waitP95S: 33.24428571428568, rideMeanS: 45.001583265058294, ttdMeanS: 61.957706520477025, workKJ: 25735.8455664912, workPerLegKJ: 245.10329110944, handlingPct: 3.4610215053763445, longestWaitS: 42.80726910816628 },
};

function hybridRun(cell: HybridCell): SimulationResult {
  const declared = Object.fromEntries(
    shipped(cell.buildingId)
      .floors.filter((floor) => !cell.panels.includes(floor.id))
      .map((floor) => [floor.id, 'up-down-buttons' as CallType]),
  );
  return run(
    reauthoredWithLandings(config, cell.buildingId, declared),
    profile('destination-panel'),
    SHAPES[cell.shape],
  );
}

function headlineOf(result: SimulationResult): Record<string, number> {
  const fields = continuousFieldsOf({ summary: result.summary });
  const out: Record<string, number> = {};
  for (const [name, path] of HEADLINE_PATHS) {
    const value = fields.get(`summary.${path}`);
    if (value !== undefined) out[name] = value;
  }
  return out;
}

describe('a hybrid run reproduces a digest that travels', () => {
  it('is hybrid on every pinned cell, so the pins are pins of the configuration they name', () => {
    for (const cell of HYBRID_CELLS) {
      const result = hybridRun(cell);
      expect(result.comparability.passengerModel, cell.key).toBe('hybrid');
      expect(result.comparability.assigningFloorIds, cell.key).toEqual(
        shipped(cell.buildingId)
          .floors.filter((floor) => cell.panels.includes(floor.id))
          .map((floor) => floor.id),
      );
    }
  }, 300_000);

  it('reproduces every pinned structural digest exactly', () => {
    for (const cell of HYBRID_CELLS) {
      expect(structuralDigestOfResult(hybridRun(cell)), cell.key).toBe(HYBRID_DIGEST[cell.key]);
    }
  }, 300_000);

  it('reproduces every pinned magnitude within the declared relative tolerance', () => {
    for (const cell of HYBRID_CELLS) {
      const measured = headlineOf(hybridRun(cell));
      const pinned = HYBRID_HEADLINE[cell.key];
      expect(pinned, `${cell.key} has no pinned headline`).toBeDefined();
      if (pinned === undefined) continue;
      const drift: string[] = [];
      for (const [name, expected] of Object.entries(pinned)) {
        const actual = measured[name];
        if (actual !== undefined && agreesWithin(actual, expected)) continue;
        drift.push(`${name}: expected ${String(expected)}, measured ${String(actual)}`);
      }
      expect(drift, cell.key).toEqual([]);
      // Not vacuous: every path a summary carries is pinned, so a figure that stops being
      // reported fails here rather than quietly dropping out of the comparison.
      expect(Object.keys(measured).sort(), cell.key).toEqual(Object.keys(pinned).sort());
    }
  }, 300_000);
});
