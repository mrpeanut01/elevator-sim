/**
 * Shared fixtures for the `runner/` tests.
 *
 * Not a `*.test.ts` file on purpose: vitest's `include` is `src/**\/*.test.ts`, so a helper named
 * this way is imported by tests but never collected as a suite of its own — the same convention
 * `core/src/sim/fixtures.test-helper.ts` uses.
 *
 * The real `data/` directory is loaded once per test file rather than mocked. Phase 3's claim is
 * that *this* simulator's replications are reproducible and poolable; a fixture building would
 * prove that a fixture building is.
 */

import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '@elevator-sim/core';
import type { LoadedConfig } from '@elevator-sim/core';

import { halfWidthStoppingRule } from './stopping.js';
import type { HalfWidthEstimate } from './stopping.js';
import type { ExperimentSpec, StoppingRule, TrafficArmSpec } from './types.js';

/** The repository's `data/` directory. */
export const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

let cached: LoadedConfig | undefined;

/** `loadConfig(DATA_DIR)`, once per process. Structurally an `ExperimentResources`. */
export async function loadResources(): Promise<LoadedConfig> {
  cached ??= await loadConfig(DATA_DIR);
  return cached;
}

/* -------------------------------------------------------------------------- *
 * Traffic arms, sized for a test suite
 * -------------------------------------------------------------------------- */

/**
 * Garden Apartments at 25 % of population per 5 minutes over a 5-minute plateau.
 *
 * ~4 ms per replication, and — measured over eight seeds — every replication comes back `stable`
 * with a valid AWT. The cheap, well-behaved arm most tests use.
 */
export const GARDEN_HEALTHY: TrafficArmSpec = {
  id: 'healthy',
  durationS: 900,
  demand: { arrivalRatePctPop5min: 25, peakWindowS: 300 },
};

/**
 * The same building at 60 %, which its two cars cannot clear.
 *
 * Three of four seeds report `diverging-queue` with AWT above 80 s. Deliberately *not* a
 * configuration that saturates on every seed: propagating "any replication saturated" to the cell
 * is the behaviour under test, and an arm that saturated unanimously could not distinguish that
 * rule from a majority vote.
 */
export const GARDEN_SATURATED: TrafficArmSpec = {
  id: 'saturated',
  durationS: 900,
  demand: { arrivalRatePctPop5min: 60, peakWindowS: 300 },
};

/**
 * Midtown Office under the closed form's operating conditions: all traffic incoming, one terminal.
 *
 * The arm where dispatchers actually separate — ~25 s AWT under `collective` against ~80 s under
 * `nearest-car` on the same four seeds — which makes it the arm worth using when a test needs two
 * arms that are genuinely different rather than merely differently labelled.
 */
export const MIDTOWN_UP_PEAK: TrafficArmSpec = {
  id: 'up-peak',
  durationS: 900,
  demand: {
    directionalSplit: { incoming: 1, outgoing: 0, interfloor: 0 },
    entranceWeights: { G: 1, P1: 0 },
    arrivalRatePctPop5min: 4,
    peakWindowS: 300,
  },
};

/** A spec with the axes filled in and a small, fixed replication budget. */
export function specOf(overrides: Partial<ExperimentSpec> & Pick<ExperimentSpec, 'id'>): ExperimentSpec {
  return {
    seed: 20_260_726,
    buildings: ['garden-apartments'],
    dispatchers: ['collective'],
    traffic: [GARDEN_HEALTHY],
    replication: { minReplications: 4, maxReplications: 4, checkEvery: 2 },
    parallel: { mode: 'serial' },
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- *
 * A stand-in for stats/sequentialStopping
 * -------------------------------------------------------------------------- */

/** `t[0.95, df]` for `df = 1…24`: the 90 % two-sided critical values. */
const T_95_ONE_TAIL: readonly number[] = [
  6.314, 2.92, 2.353, 2.132, 2.015, 1.943, 1.895, 1.86, 1.833, 1.812, 1.796, 1.782, 1.771, 1.761,
  1.753, 1.746, 1.74, 1.734, 1.729, 1.725, 1.721, 1.717, 1.714, 1.711,
];

/**
 * The doc's half-width arithmetic, implemented just far enough to exercise the port.
 *
 * `t[n-1, conf]` for `n ≤ 25`, `z[conf]` beyond it — the textbook crossover
 * docs/03-traffic-and-statistics.md § Part 3 wrote as the rule **until 2026-07-27**, with that
 * version's own `z = 1.65` at 90 %. The doc now writes `t[n-1]` at every `n` and names the
 * crossover as literature; this double keeps the superseded family on purpose, per below.
 * Supports 90 % only and throws otherwise, because this is a **test double**.
 *
 * **It is not what the production rule computes, and that is deliberate.**
 * `validation/harness.ts`'s `productionStoppingRule` injects `reports/statistics`'s
 * `estimateMean`, which is Student-t at every `n` — the crossover is not implemented anywhere in
 * shipped code, and is no longer what the doc asks for either (DECISIONS.md § D7, § D14,
 * `stopping.test.ts` § productionStoppingRule). A
 * double whose quantile family differs from the shipped estimator's is what proves
 * {@link halfWidthStoppingRule} records the estimate verbatim rather than re-deriving it. The
 * runner's tests are about *when* the rule is asked and whether the answer is reproducible, not
 * about quantile accuracy.
 */
export function docHalfWidth(
  samples: readonly number[],
  { confidence }: { readonly confidence: number },
): HalfWidthEstimate {
  if (Math.abs(confidence - 0.9) > 1e-9) {
    throw new Error(`docHalfWidth is a test double and only implements 90 % confidence; got ${confidence}.`);
  }
  const n = samples.length;
  if (n < 2) return { halfWidth: Number.POSITIVE_INFINITY, n };
  const mean = samples.reduce((total, value) => total + value, 0) / n;
  const variance = samples.reduce((total, value) => total + (value - mean) ** 2, 0) / (n - 1);
  const stdDev = Math.sqrt(variance);
  const useT = n <= 25;
  const critical = useT ? (T_95_ONE_TAIL[n - 2] ?? 1.711) : 1.65;
  return {
    halfWidth: (critical * stdDev) / Math.sqrt(n),
    n,
    mean,
    stdDev,
    distribution: useT ? 't' : 'z',
  };
}

/** {@link docHalfWidth} as a {@link StoppingRule}. */
export const docStoppingRule: StoppingRule = halfWidthStoppingRule(docHalfWidth);

/* -------------------------------------------------------------------------- *
 * Guarding the worker-pool comparison
 * -------------------------------------------------------------------------- */

function newestMtime(dir: string, predicate: (name: string) => boolean): number {
  let newest = 0;
  let entries: readonly { name: string; isDirectory(): boolean; isFile(): boolean }[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) newest = Math.max(newest, newestMtime(path, predicate));
    else if (entry.isFile() && predicate(entry.name)) {
      newest = Math.max(newest, statSync(path).mtimeMs);
    }
  }
  return newest;
}

/**
 * Refuse to compare the two executors against a stale build of `core`.
 *
 * A worker thread is loaded by Node, so it resolves `@elevator-sim/core` through `node_modules` to
 * core's **built** output, while a vitest run resolves the same specifier to core's *source*. Both
 * are the same TypeScript and agree — unless `packages/core/dist` is behind `packages/core/src`, in
 * which case the pool and the parent really are running different code and the executors really
 * will disagree. That is a build problem, not a concurrency bug, and it deserves to say so instead
 * of surfacing as a mystifying diff.
 *
 * @throws Error naming the fix when the build is missing or stale.
 */
export function assertCoreBuilt(): void {
  const core = fileURLToPath(new URL('../../../core', import.meta.url));
  const src = newestMtime(
    `${core}/src`,
    (name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.test-helper.ts'),
  );
  const dist = newestMtime(`${core}/dist`, (name) => name.endsWith('.js'));
  if (dist === 0) {
    throw new Error(
      'packages/core/dist is missing, so a worker thread cannot load @elevator-sim/core. Run `npx tsc -b` before `npx vitest run`.',
    );
  }
  if (src > dist) {
    throw new Error(
      'packages/core/dist is older than packages/core/src. A worker thread loads the built core while vitest loads the source, so the two executors would be running different code. Run `npx tsc -b` first.',
    );
  }
}
