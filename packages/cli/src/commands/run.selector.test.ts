/**
 * **The weight-set selector, reached from the command line.**
 *
 * `docs/05-roadmap.md` § *Standing requirement — the integration seam has an owner* asks one
 * question of a new behaviour, and it is not *"is it reachable?"*: it is **"name the non-test
 * caller"**. § D141 built the selector and left the answer to that question empty for a shipped
 * command. The library travelled as `DispatchPolicyOptions.weightSets`, an *override* that only
 * `experiments/src/runner/experiment.ts` plumbed, so a study could switch weight sets mid-run and
 * `elevator-sim run` could not — the mechanism was configurable, unit-tested in isolation, and
 * called from no shipped path, which is the twelfth instance of this repository's signature defect
 * and the one it caught before shipping.
 *
 * So this file does not test `selectWeightSet`; `core/src/dispatch/selector.test.ts` does that.
 * It tests **the path**, and it tests it the way a user would reach it: by editing
 * `data/dispatcher-profiles.json` and running the command. Every test below copies the real data
 * directory, changes the JSON, and drives `planRun` — the same function `runCommand` calls — or
 * `main` itself. Nothing here hands the simulator a hand-built option object, because a hand-built
 * option object is exactly what was already possible.
 *
 * ## The four claims, and why each is separate
 *
 * | claim | what a failure would mean |
 * |---|---|
 * | no shipped profile opts in | the default changed, and every published number is now measured under a different dispatcher |
 * | selector off is **byte-identical** to a config that never carried the file | wiring the seam cost a number somewhere |
 * | a profile that opts in changes the run, and a permuted arm map changes it *again* | the file is read but the arms are not, which is the same defect one level down |
 * | the same data replays byte-identically with the selector on | the selector introduced a draw, a clock or hidden state (invariants 2, 3, 4, 5) |
 *
 * The third is deliberately two contrasts rather than one. *"Turning it on changed the run"* is
 * satisfied by a selector that reads the block and always picks the same arm; *"permuting
 * `weightSetsByPattern` changed it again"* is not, and it is the contrast review finding #5
 * prescribed.
 */

import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Simulation, type SimulationConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { parseArgs } from '../args.js';
import { DEFAULT_DATA_DIR, loadData } from '../data.js';
import { main } from '../index.js';
import { createBufferedOutput } from '../output.js';

import { RUN_FLAGS, planRun } from './run.js';

/**
 * Midtown Office at its own traffic profile, 900 s, reported over the full run.
 *
 * The point is chosen so the detector reaches a *decided* state rather than abstaining, which is
 * what a liveness contrast needs. Measured through this very path, the arm it decides on here is
 * **`two-way`** — `office-standard` over the rise-and-fall template is a two-directional office
 * day, not the pure up-peak the `patternSwitching` block's own calibration note measures — so
 * `two-way` is the entry the permutation test moves and the other four are the negative control.
 */
const ARGV: readonly string[] = [
  '--building',
  'midtown-office',
  '--dispatcher',
  'collective',
  '--seed',
  '20260728',
  '--duration',
  '900',
  '--window',
  'full-run',
];

/** The profile put under a selector. Its own weights differ from every arm's, so a switch shows. */
const OPTED_IN = 'collective';

type ProfilesFile = {
  profiles: { id: string; selection?: unknown }[];
  patternSwitching?: { weightSetsByPattern: Record<string, string> } | undefined;
};

/** A copy of the real `data/` with `dispatcher-profiles.json` edited, as a user would edit it. */
async function dataDirWith(edit: (file: ProfilesFile) => void): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'elevator-sim-selector-'));
  await cp(DEFAULT_DATA_DIR, dir, { recursive: true });
  const path = join(dir, 'dispatcher-profiles.json');
  const file = JSON.parse(await readFile(path, 'utf8')) as ProfilesFile;
  edit(file);
  await writeFile(path, JSON.stringify(file, null, 2), 'utf8');
  return dir;
}

/** Opt `collective` into the fuzzy selector — six scalars of data and not a line of code. */
function optIn(file: ProfilesFile): void {
  const profile = file.profiles.find((entry) => entry.id === OPTED_IN);
  expect(profile, `data/dispatcher-profiles.json has no profile "${OPTED_IN}"`).toBeDefined();
  profile!.selection = { policy: 'fuzzy' };
}

/** The plan `runCommand` would build from this data directory. */
async function planFrom(dataDir: string): Promise<SimulationConfig> {
  const config = await loadData(dataDir);
  return planRun(config, parseArgs(ARGV, RUN_FLAGS, 'elevator-sim run')).simulation;
}

/**
 * Where the **cars** went, as a sequence.
 *
 * `metrics/types.ts`: *"Passenger records say where passengers went; they cannot say where the
 * cars went."* A mean is the statistic that hides a structural difference, so the liveness
 * contrasts below compare trajectories and not AWT.
 */
function trajectoryOf(config: SimulationConfig): readonly string[] {
  const { record } = new Simulation(config).run();
  const samples = record.travelSamples ?? [];
  expect(samples.length, 'the run recorded no car movement at all').toBeGreaterThan(0);
  return samples.map(
    (sample) =>
      `${sample.carId}@${sample.at.toFixed(6)}:${sample.direction}:${sample.distanceM.toFixed(6)}`,
  );
}

/** The whole record, canonically, for a byte-identity claim rather than a similarity one. */
function recordTextOf(config: SimulationConfig): string {
  return JSON.stringify(new Simulation(config).run().record);
}

describe('elevator-sim run — the weight-set selector has a shipped caller', () => {
  let shipped: SimulationConfig;

  beforeAll(async () => {
    shipped = await planFrom(DEFAULT_DATA_DIR);
  }, 120_000);

  it('carries the whole dispatcher-profiles file, beside the one profile it dispatches with', () => {
    // The seam itself: `planRun` → `SimulationConfig.dispatcherProfiles` → `Simulation` →
    // `weightSetSourceFrom` → `resolveWeightSets` → `selectWeightSet`.
    expect(shipped.dispatcherProfiles).toBeDefined();
    expect(shipped.dispatcherProfiles?.patternSwitching).toBeDefined();
    expect(shipped.dispatcherProfile.id).toBe(OPTED_IN);
  });

  it('leaves every shipped profile with the selector off', async () => {
    // The seam is made reachable; nothing is switched on. Every published number in this
    // repository was measured under one weight vector for the run, and still is.
    const config = await loadData(DEFAULT_DATA_DIR);
    for (const profile of config.dispatcherProfiles.profiles) {
      expect(profile.selection?.policy ?? 'off', `profile "${profile.id}"`).toBe('off');
    }
  });

  it('is byte-identical to a configuration that never carried the file', () => {
    // Criterion: wiring the seam must cost nothing while nothing opts in. Not "the same to four
    // decimal places" — the same record.
    const { dispatcherProfiles: _carried, ...asBefore } = shipped;
    expect(recordTextOf(shipped)).toBe(recordTextOf(asBefore));
  }, 120_000);

  it('honours a profile that opts in, with only the data file changed', async () => {
    const dir = await dataDirWith(optIn);
    const selecting = await planFrom(dir);
    expect(selecting.dispatcherProfile.selection?.policy).toBe('fuzzy');
    expect(trajectoryOf(selecting)).not.toStrictEqual(trajectoryOf(shipped));
  }, 180_000);

  it('selects among the arms the file names, rather than one fixed vector', async () => {
    // Review finding #5's own prescription: two configurations differing **only** in
    // `weightSetsByPattern`, one seed, different car trajectories. Same building, same traffic,
    // same profile, same detector, same hysteresis, same membership map.
    const base = await planFrom(await dataDirWith(optIn));
    const permuted = await planFrom(
      await dataDirWith((file) => {
        optIn(file);
        const map = file.patternSwitching?.weightSetsByPattern;
        expect(map?.['two-way']).toBe('predictive-balanced');
        // `nearest-car` rather than a near neighbour of `predictive-balanced`: dispatch is an
        // argmin over a handful of cars, and two weight vectors that rank them the same way
        // produce bit-identical runs — `fairness-first` does exactly that here. A liveness
        // contrast has to move the ranking, not merely the arithmetic.
        map!['two-way'] = 'nearest-car';
      }),
    );
    expect(trajectoryOf(permuted)).not.toStrictEqual(trajectoryOf(base));
  }, 240_000);

  it('reads the arm it selected and not the whole map', async () => {
    // The negative control, and the reason the test above is evidence rather than a coincidence.
    // Repointing a regime this operating point never enters must change nothing: a "selector" that
    // moved on `down-peak` here would be reacting to the file rather than to the traffic. Measured
    // the same way — `up-peak`, `down-peak`, `interfloor` and `idle` are all inert at this point,
    // and `two-way` is the one that is not.
    const base = await planFrom(await dataDirWith(optIn));
    const elsewhere = await planFrom(
      await dataDirWith((file) => {
        optIn(file);
        file.patternSwitching!.weightSetsByPattern['down-peak'] = 'nearest-car';
      }),
    );
    expect(trajectoryOf(elsewhere)).toStrictEqual(trajectoryOf(base));
  }, 240_000);

  it('replays byte-identically with the selector on', async () => {
    // Invariants 2, 3, 4 and 5 under a *selecting* dispatcher. The selector consumes no random
    // stream and holds no clock; its hysteresis state is threaded, not hidden. Two configurations
    // loaded independently from the same bytes must therefore produce the same record.
    const dir = await dataDirWith(optIn);
    const first = await planFrom(dir);
    const second = await planFrom(dir);
    expect(recordTextOf(first)).toBe(recordTextOf(second));
  }, 180_000);

  it('refuses a selecting profile whose file authors no arms, rather than running without them', async () => {
    // The failure this replaces is the dangerous one: a dispatcher that declares it switches
    // weight sets, finds none, and quietly runs its own — a plausible-looking run of a system
    // nobody configured.
    const dir = await dataDirWith((file) => {
      optIn(file);
      delete file.patternSwitching;
    });
    const config = await planFrom(dir);
    expect(() => new Simulation(config).run()).toThrow(/patternSwitching library was supplied/);
  }, 120_000);

  it('runs end to end through main, exit 0, with the selector on', async () => {
    const dir = await dataDirWith(optIn);
    const out = createBufferedOutput({ color: false, columns: 120, rows: 60, env: {} });
    const code = await main(['run', '--data', dir, ...ARGV], out, out);
    expect(code).toBe(0);
    expect(out.text()).toContain('20260728');
  }, 180_000);
});
