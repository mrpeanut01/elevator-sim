/// <reference types="node" />

import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import * as barrel from './index.js';
import * as analyticalModule from './analytical/index.js';
import * as configModule from './config/index.js';
import * as dispatchModule from './dispatch/index.js';
import * as kernelModule from './kernel/index.js';
import * as metricsModule from './metrics/index.js';
import * as carModule from './model/car/index.js';
import * as modelModule from './model/index.js';
import * as doorsModule from './physics/doors/index.js';
import * as motionModule from './physics/motion/index.js';
import * as randomModule from './random/index.js';
import * as simModule from './sim/index.js';
import * as trafficModule from './traffic/index.js';

/**
 * Integration guard for the package's public surface.
 *
 * `src/index.ts` is the only file every consumer touches, and it is the one file no module
 * owner edits while working inside their own module. That makes it the natural place for
 * drift: a submodule gains an export, the barrel does not, and the symbol is invisible to
 * `@elevator-sim/core` even though the module tests are green.
 *
 * These tests are deliberately structural rather than a hand-maintained name list, so the
 * barrel stays in sync automatically as modules land — add the module to `submodules` below
 * and the coverage check applies to it too.
 */
const submodules = {
  kernel: kernelModule,
  random: randomModule,
  config: configModule,
  'physics/motion': motionModule,
  'physics/doors': doorsModule,
  model: modelModule,
  'model/car': carModule,
  traffic: trafficModule,
  dispatch: dispatchModule,
  metrics: metricsModule,
  analytical: analyticalModule,
  sim: simModule,
} satisfies Record<string, Record<string, unknown>>;

const REAL_DATA_DIR = fileURLToPath(new URL('../../../data', import.meta.url));

describe('the public barrel re-exports every module surface', () => {
  it.each(Object.keys(submodules))('re-exports every runtime value from %s/', (name) => {
    const submodule = submodules[name as keyof typeof submodules] as Record<string, unknown>;
    const exported = Object.keys(submodule);

    // Guard against a vacuous assertion if a barrel is ever emptied.
    expect(exported.length).toBeGreaterThan(0);
    expect(Object.keys(barrel)).toEqual(expect.arrayContaining(exported));
  });

  it.each(Object.keys(submodules))('re-exports %s/ as the same binding, not a copy', (name) => {
    const submodule = submodules[name as keyof typeof submodules] as Record<string, unknown>;
    for (const [key, value] of Object.entries(submodule)) {
      expect((barrel as Record<string, unknown>)[key]).toBe(value);
    }
  });

  it('adds nothing of its own: every barrel export comes from a module', () => {
    const owned = new Set(Object.values(submodules).flatMap((m) => Object.keys(m)));
    expect(Object.keys(barrel).filter((key) => !owned.has(key))).toEqual([]);
  });
});

describe('Phase 0 is usable through the barrel alone', () => {
  it('runs the kernel', () => {
    const kernel = new barrel.SimKernel();
    const fired: number[] = [];

    kernel.schedule(2, barrel.createEvent('b', { i: 2 }, (p) => fired.push(p.i)));
    kernel.schedule(1, barrel.createEvent('a', { i: 1 }, (p) => fired.push(p.i)));
    kernel.runUntilEmpty();

    expect(fired).toEqual([1, 2]);
    expect(kernel.now()).toBe(2);
  });

  it('draws from named streams', () => {
    const streams = new barrel.StreamSet(20260725);
    expect(barrel.STREAM_NAMES).toContain('arrivals');
    expect(streams.arrivals.nextFloat()).toBe(new barrel.StreamSet(20260725).arrivals.nextFloat());
  });

  it('loads the shipped data directory', async () => {
    const config = await barrel.loadConfig(REAL_DATA_DIR);
    expect(config.buildings).toHaveLength(5);
    expect(config.buildingsById.get('midtown-office')).toBeDefined();
  });

  it('surfaces ConfigError so callers can distinguish it from a crash', async () => {
    await expect(barrel.loadConfig(`${REAL_DATA_DIR}-does-not-exist`)).rejects.toBeInstanceOf(
      barrel.ConfigError,
    );
  });
});

describe('the one deliberate name collision is deliberate', () => {
  /**
   * `HANDLING_CAPACITY_WINDOW_S` is declared twice on purpose: `analytical/` is the
   * correctness oracle and may not import from the module it audits, so it cannot share
   * `metrics/`'s copy. The barrel re-exports one of them. That is only safe while the two
   * agree, so this asserts they do — if either ever drifts, the oracle and the metrics layer
   * are quoting handling capacity over different windows and every comparison between them
   * is silently wrong.
   */
  it('re-exports one binding for a constant two modules declare independently', () => {
    expect(analyticalModule.HANDLING_CAPACITY_WINDOW_S).toBe(
      metricsModule.HANDLING_CAPACITY_WINDOW_S,
    );
    expect(barrel.HANDLING_CAPACITY_WINDOW_S).toBe(metricsModule.HANDLING_CAPACITY_WINDOW_S);
    expect(barrel.HANDLING_CAPACITY_WINDOW_S).toBe(300);
  });

  it('is the only name two modules both declare', () => {
    const owners = new Map<string, string[]>();
    for (const [name, submodule] of Object.entries(submodules)) {
      for (const key of Object.keys(submodule)) {
        owners.set(key, [...(owners.get(key) ?? []), name]);
      }
    }
    const shared = [...owners].filter(([, names]) => names.length > 1).map(([key]) => key);
    expect(shared).toEqual(['HANDLING_CAPACITY_WINDOW_S']);
  });
});

describe('Phase 2 is usable through the barrel alone', () => {
  it('runs one end-to-end replication and balances its books', async () => {
    const config = await barrel.loadConfig(REAL_DATA_DIR);
    const building = config.buildingsById.get('garden-apartments');
    const dispatcherProfile = config.dispatcherProfilesById.get('collective');
    expect(building).toBeDefined();
    expect(dispatcherProfile).toBeDefined();
    if (building === undefined || dispatcherProfile === undefined) return;

    const result = barrel.runSimulation({
      building,
      dispatcherProfile,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
      seed: 20260726,
      demand: { peakWindowS: 300 },
    });

    expect(result.status).toBe('completed');
    expect(result.conservation.balanced).toBe(true);
    expect(result.conservation.generated).toBeGreaterThan(0);
    expect(result.conservation.delivered).toBe(result.conservation.generated);

    // The Phase 2 metric set, all reachable from the barrel (docs/05-roadmap.md Phase 2).
    expect(result.summary.waiting.meanS).toBeGreaterThan(0);
    expect(result.summary.waiting.p95S).toBeGreaterThanOrEqual(result.summary.waiting.meanS);
    expect(result.summary.timeToDestination.meanS).toBeGreaterThan(0);

    // Invariant 5: the record carries its seed, it survives a persist/parse round trip, and
    // it reconstructs the very StreamSet the run drew from.
    expect(barrel.runSeed(result.record)).toBe(BigInt(result.seed));
    expect(barrel.parseRunRecord(barrel.serializeRunRecord(result.record)).seed).toBe(result.seed);
    expect(new barrel.StreamSet(barrel.runSeed(result.record)).arrivals.nextFloat()).toBe(
      new barrel.StreamSet(20260726).arrivals.nextFloat(),
    );
  });

  it('swapping the dispatcher is a config swap, not a code path (invariant 7)', async () => {
    const config = await barrel.loadConfig(REAL_DATA_DIR);
    const building = config.buildingsById.get('garden-apartments');
    if (building === undefined) throw new Error('missing fixture');

    const run = (profileId: string): number => {
      const dispatcherProfile = config.dispatcherProfilesById.get(profileId);
      if (dispatcherProfile === undefined) throw new Error(`missing profile "${profileId}"`);
      return barrel.runSimulation({
        building,
        dispatcherProfile,
        trafficProfiles: config.trafficProfiles,
        elevatorSpecs: config.elevatorSpecs,
        seed: 20260726,
        demand: { peakWindowS: 300 },
      }).summary.waiting.meanS;
    };

    // Same seed, same building, same passengers — only the weight vector differs. Both
    // dispatchers exist only as entries in data/dispatcher-profiles.json.
    const collective = run('collective');
    const nearestCar = run('nearest-car');
    expect(collective).toBeGreaterThan(0);
    expect(nearestCar).toBeGreaterThan(0);
    expect(collective).not.toBe(nearestCar);
  });

  it('exposes the closed-form oracle beside the loop it audits', async () => {
    const config = await barrel.loadConfig(REAL_DATA_DIR);
    const building = config.buildingsById.get('midtown-office');
    if (building === undefined) throw new Error('missing fixture');

    const analysis = barrel.analyzeUpPeak(building, config.elevatorSpecs, { bankId: 'main' });
    expect(analysis.result.roundTripTimeS).toBeCloseTo(149.5428, 3);
    expect(analysis.result.intervalS).toBeCloseTo(37.3857, 3);
    expect(analysis.result.handlingCapacity5Min).toBeCloseTo(102.713, 2);

    // The assumptions are data, not prose, so a comparison can be scoped to them.
    expect(barrel.CLOSED_FORM_ASSUMPTIONS.length).toBeGreaterThan(0);
    expect(barrel.CLOSED_FORM_COMPARISON_RULE.oneSidedUnderIds).toContain('no-minimum-dwell');
  });
});
