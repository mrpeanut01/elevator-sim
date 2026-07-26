/// <reference types="node" />

import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import * as barrel from './index.js';
import * as configModule from './config/index.js';
import * as kernelModule from './kernel/index.js';
import * as carModule from './model/car/index.js';
import * as modelModule from './model/index.js';
import * as doorsModule from './physics/doors/index.js';
import * as motionModule from './physics/motion/index.js';
import * as randomModule from './random/index.js';

/**
 * Integration guard for the package's public surface.
 *
 * `src/index.ts` is the only file every consumer touches, and it is the one file no module
 * owner edits while working inside their own module. That makes it the natural place for
 * drift: a submodule gains an export, the barrel does not, and the symbol is invisible to
 * `@elevator-sim/core` even though the module tests are green.
 *
 * These tests are deliberately structural rather than a hand-maintained name list, so the
 * barrel stays in sync automatically as `dispatch/`, `traffic/` and `metrics/` land — add
 * the module to `submodules` below and the coverage check applies to it too.
 */
const submodules = {
  kernel: kernelModule,
  random: randomModule,
  config: configModule,
  'physics/motion': motionModule,
  'physics/doors': doorsModule,
  model: modelModule,
  'model/car': carModule,
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
