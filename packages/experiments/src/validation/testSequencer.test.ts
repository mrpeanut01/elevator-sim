/**
 * **The duration sequencer that shards `ci.yml`'s `viz` and `viz-browser` legs.**
 *
 * `infra/checks/testSequencer.mjs` replaces vitest's count-based `--shard` with packing by measured
 * duration. The property that matters is the one a count-based split got for free and a weighted
 * one could lose: **every file runs in exactly one shard**. A file in no shard is a test that runs
 * nowhere while every check stays green. That is the failure this repository tracks above all
 * others, so it is pinned here against the real tree as well as against synthetic lists.
 *
 * Balance is asserted too, more loosely: the point of the change is that the shards finish together.
 */
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadDurations, partition, weigh } from '../../../../infra/checks/testSequencer.mjs';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

/** Every test file the `viz` or `viz-browser` project selects, keyed as the sequencer keys it. */
function projectKeys(project: 'viz' | 'viz-browser'): string[] {
  const src = join(ROOT, 'packages', 'viz', 'src');
  const files = readdirSync(src, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.test.ts'))
    .filter((file) => (project === 'viz-browser') === file.endsWith('.browser.test.ts'));
  return files.map((file) => `${project}:${relative(ROOT, join(src, file)).split('\\').join('/')}`).sort();
}

/**
 * Which shards each key lands in, the way `ci.yml` asks: one packing per leg, each leg keeping the
 * files packed into its own index. Computed per shard rather than read off one packing, because
 * that is what the legs do, and agreement between them is the claim.
 */
function landings(keys: readonly string[], count: number, durations: Readonly<Record<string, number>>) {
  const weights = weigh(keys, durations);
  const items = keys.map((key, i) => ({ key, weight: weights[i] ?? 0 }));
  const where = new Map<string, number[]>();
  for (let shard = 0; shard < count; shard += 1) {
    const { shardOf } = partition(items, count);
    for (const { key } of items) if (shardOf.get(key) === shard) where.set(key, [...(where.get(key) ?? []), shard]);
  }
  return { where, loads: partition(items, count).loads };
}

describe('every file runs in exactly one shard', () => {
  it.each([1, 2, 3, 4, 7])('with %i shards over a synthetic list, known and unknown files alike', (count) => {
    const keys = Array.from({ length: 41 }, (_, i) => `p:f${String(i).padStart(2, '0')}.test.ts`);
    const durations = Object.fromEntries(keys.slice(0, 30).map((key, i) => [key, (i * 37) % 23]));
    const { where } = landings(keys, count, durations);
    expect([...where.keys()].sort()).toEqual(keys);
    expect([...where.values()].filter((shards) => shards.length !== 1)).toEqual([]);
  });

  it.each(['viz', 'viz-browser'] as const)('over the real %s project at the three shards ci.yml runs', (project) => {
    const keys = projectKeys(project);
    expect(keys.length, `no ${project} test files were found; the glob stopped matching`).toBeGreaterThan(50);
    const { where } = landings(keys, 3, loadDurations());
    expect([...where.keys()].sort()).toEqual(keys);
    expect([...where.values()].filter((shards) => shards.length !== 1)).toEqual([]);
  });

  it('does not depend on the order the files arrive in', () => {
    const keys = projectKeys('viz-browser');
    const durations = loadDurations();
    const forward = partition(keys.map((key, i) => ({ key, weight: weigh(keys, durations)[i] ?? 0 })), 3).shardOf;
    const reversed = [...keys].reverse();
    const backward = partition(
      reversed.map((key, i) => ({ key, weight: weigh(reversed, durations)[i] ?? 0 })),
      3,
    ).shardOf;
    expect(keys.filter((key) => forward.get(key) !== backward.get(key))).toEqual([]);
  });

  it('refuses a shard count that is not a positive integer', () => {
    expect(() => partition([{ key: 'a', weight: 1 }], 0)).toThrow(/positive integer/);
    expect(() => partition([{ key: 'a', weight: 1 }], 1.5)).toThrow(/positive integer/);
  });
});

describe('the weights', () => {
  it('weighs a file the table does not name at its project median, not at zero', () => {
    const weights = weigh(['a:new.test.ts', 'b:new.test.ts'], { 'a:x': 1, 'a:y': 3, 'a:z': 100, 'b:x': 8 });
    expect(weights).toEqual([3, 8]);
  });

  it('falls back to the whole table, and then to one second, for a project it has never seen', () => {
    expect(weigh(['c:new.test.ts'], { 'a:x': 2, 'b:y': 4, 'b:z': 6 })).toEqual([4]);
    expect(weigh(['c:new.test.ts'], {})).toEqual([1]);
  });

  it.each(['viz', 'viz-browser'] as const)(
    'still names most of the %s project, or the shards have drifted: run scripts/test-durations.mjs',
    (project) => {
      const durations = loadDurations();
      const keys = projectKeys(project);
      const named = keys.filter((key) => typeof durations[key] === 'number').length;
      expect(named / keys.length).toBeGreaterThanOrEqual(0.75);
    },
  );

  it.each(['viz', 'viz-browser'] as const)('packs the %s project into three shards that finish together', (project) => {
    const { loads } = landings(projectKeys(project), 3, loadDurations());
    const heaviest = Math.max(...loads);
    const mean = loads.reduce((sum, load) => sum + load, 0) / loads.length;
    expect(heaviest / mean, `shard loads ${loads.map((l) => l.toFixed(0)).join(', ')} s`).toBeLessThan(1.1);
  });
});
