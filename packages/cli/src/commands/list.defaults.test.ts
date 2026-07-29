/**
 * `elevator-sim list`'s **Try** block — the first thing anyone types, pinned. Wave 9, T73.
 *
 * ## The defect this file exists for
 *
 * Four example lists in this package were curated onto a non-saturating dispatcher during wave 6:
 * `help.ts`' *Start here*, and the `examples` arrays on `run.ts`, `watch.ts` and `compare.ts`. The
 * fifth was missed, **because it is derived rather than authored** — it read `profiles[0]` and
 * `profiles[1]` out of `data/dispatcher-profiles.json`, whose first entry is `nearest-car`. So
 * `list`, the first command of README's own six-command tour, printed:
 *
 * ```text
 *   $ elevator-sim run   --building garden-apartments --dispatcher nearest-car --seed 42
 *   $ elevator-sim watch --building garden-apartments --dispatcher nearest-car --speed 10
 * ```
 *
 * `docs/07-handoff.md` § 4 measures `nearest-car` as the only shipped profile that saturates, and
 * [§ D147](../../../../DECISIONS.md) makes that a fifth building. A newcomer's first two commands
 * were the one arm the project would refuse to quote at a real budget.
 *
 * ## Two levels, on purpose
 *
 * The rendered output is asserted **and** the pure chooser is. Asserting only the chooser would
 * leave the wiring untested — `list` could stop calling it and this file would stay green, which is
 * wave 8's *fixture routing past the subject*. Asserting only the output would make the fallback
 * path unreachable, because `data/` always ships a preferred id.
 */

import { describe, expect, it } from 'vitest';

import { main } from '../index.js';
import { createBufferedOutput, type BufferedOutput } from '../output.js';
import { TRY_CONTRAST_DISPATCHERS, TRY_RECOMMENDED_DISPATCHERS, tryDispatchers } from './list.js';

/** The rendered `Try` block, as its three command lines. Throws if the block is not found. */
async function tryBlock(): Promise<readonly string[]> {
  const out: BufferedOutput = createBufferedOutput({ color: false, columns: 120, rows: 60, env: {} });
  const code = await main(['list'], out, out);
  expect(code).toBe(0);
  const lines = out.text().split('\n');
  const start = lines.findIndex((line) => line.trim() === 'Try');
  // The control against a silently-empty parse: a renamed heading must red this file rather than
  // leave every assertion below iterating an empty array.
  expect(start, 'no `Try` block in `list` output — the heading moved, the block did not').toBeGreaterThanOrEqual(0);
  const block = lines.slice(start + 1).filter((line) => line.trim().startsWith('$ elevator-sim'));
  expect(block, 'the `Try` block rendered no commands').toHaveLength(3);
  return block;
}

describe('elevator-sim list — the Try block', () => {
  it('does not tell a newcomer to run or watch the profile that saturates', async () => {
    const [run, , watch] = await tryBlock();
    // Named rather than derived, because the point is the *specific* arm docs/07 § 4 measures. If
    // `data/` renames it, the sibling test below is the one that reds.
    expect(run).not.toContain('nearest-car');
    expect(watch).not.toContain('nearest-car');
  });

  it('runs and watches the reference arm docs/07 § 4 recommends', async () => {
    const [run, compare, watch] = await tryBlock();
    expect(run).toContain('--dispatcher collective');
    expect(watch).toContain('--dispatcher collective');
    expect(compare).toContain('--a collective');
  });

  it('keeps the weak arm as `compare`’s B, because a first comparison needs a real contrast', async () => {
    const [, compare] = await tryBlock();
    // Deliberate, and the opposite of the two lines above: `nearest-car` is the wrong thing to run
    // and the right thing to compare against. `docs/03` § Variance reduction measures `eta` vs
    // `nearest-car` at rho = 0.6083, the widest separation any shipped pair has, and the block's
    // own command returns AWT −2.27 s [−2.92, −1.62] with 0 of 100 replications saturated.
    expect(compare).toContain('--b nearest-car');
    expect(compare).toContain('--reps 100');
  });

  it('never puts the same dispatcher on both sides of `compare`', async () => {
    const [compareLine] = (await tryBlock()).slice(1);
    const compare = compareLine ?? '';
    const a = /--a (\S+)/.exec(compare)?.[1];
    const b = /--b (\S+)/.exec(compare)?.[1];
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a).not.toBe(b);
  });
});

describe('tryDispatchers — the chooser behind it', () => {
  const shipped = [
    { id: 'nearest-car' },
    { id: 'eta' },
    { id: 'collective' },
    { id: 'zoned-uppeak' },
  ];

  it('prefers `collective`, then `eta`', () => {
    expect(tryDispatchers(shipped).a).toBe('collective');
    expect(tryDispatchers([{ id: 'nearest-car' }, { id: 'eta' }]).a).toBe('eta');
  });

  it('falls back to file order when no preferred id is shipped, and still returns a pair', () => {
    // The fallback is unreachable from `data/`, so it is reached here. Without this the `??`
    // chain would be dead code that nothing ever evaluated.
    const orchard = [{ id: 'orchard-irrigation' }, { id: 'orchard-lanterns' }];
    expect(tryDispatchers(orchard)).toEqual({ a: 'orchard-irrigation', b: 'orchard-lanterns' });
  });

  it('collapses to a single id only when `data/` ships exactly one profile', () => {
    expect(tryDispatchers([{ id: 'only-one' }])).toEqual({ a: 'only-one', b: 'only-one' });
  });

  it('never returns a `b` equal to `a`, even when the contrast list names `a` itself', () => {
    // `nearest-car` is on the contrast list. On a `data/` where it is also the only recommended
    // arm available, the pair must not collapse.
    const pair = tryDispatchers([{ id: 'nearest-car' }, { id: 'zoned-uppeak' }]);
    expect(pair.a).toBe('nearest-car');
    expect(pair.b).toBe('zoned-uppeak');
  });

  it('names only ids that could plausibly be shipped, and keeps the two lists disjoint', () => {
    // Overlap would be a silent way for the run line to acquire the contrast arm.
    for (const id of TRY_RECOMMENDED_DISPATCHERS) {
      expect(TRY_CONTRAST_DISPATCHERS).not.toContain(id);
    }
    expect(TRY_RECOMMENDED_DISPATCHERS.length).toBeGreaterThan(0);
    expect(TRY_CONTRAST_DISPATCHERS.length).toBeGreaterThan(0);
  });
});
