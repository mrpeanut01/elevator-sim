/**
 * **Every demand override survives storage, and the list is derived from the type rather than
 * written down.** CLAUDE.md invariant 5, at the one place it has now failed three times.
 *
 * ## The defect this file exists to make impossible
 *
 * `persistence.ts`'s `demandOptionsOf` is a hand-written projection of `SimulationDemandOptions`,
 * and `parseDemandOptions` a hand-written mirror of that. A field missing from either is dropped
 * in silence: `createStoredRun` writes a record without it, `parseStoredRun` accepts that record
 * happily, and `replaySimulationConfig` rebuilds a configuration that never had it. **The replay
 * then succeeds** — against a different experiment — which is worse than a crash, because the
 * output is a plausible number nobody has reason to doubt.
 *
 * It has happened three times. `selection` was dropped until the weight-set selector became
 * reachable (`persistence.ts` records it in as many words: *"an invariant-5 violation the moment
 * something could turn it on"*). `trafficModel` was dropped until wave 13's F1 lane found a stored
 * `v2` run replaying as `v1`. And this commit found two more: `mixAmplitude`, live in
 * `benchmark/lunchTwoWaySelection.ts` since § D200, plus the two knobs docs/14 §§ 2.1–2.2 add.
 *
 * ## Why the existing guards did not catch any of them
 *
 * `persistence.test.ts` pins the golden key set of a record, which catches a field that **starts**
 * being written. It cannot catch one that is never written — the key set is simply smaller and
 * matches its own pin. `replay.test.ts` exercises `arrivalRatePctPop5min` and three neighbours by
 * name, so it grows only when somebody remembers to grow it. Both are one-directional in exactly
 * the direction the defect travels.
 *
 * ## What makes this one different
 *
 * `satisfies Record<keyof SimulationDemandOptions, unknown>` on the sample table below. The
 * compiler, not a reader, is what requires a row per field — so the **next** field added to the
 * demand surface cannot reach `main` without either a round-trip sample or a deliberate decision
 * recorded here. It is the same construction `traffic/parameters.test.ts` uses against
 * `keyof TrafficConfig`, pointed at storage instead of at the tunable schema.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { LoadedConfig, SimulationDemandOptions } from '@elevator-sim/core';

import { load, storedRun } from './fixtures.test-helper.js';
import { parseStoredRun, serializeStoredRun } from './persistence.js';
import { replaySimulationConfig, replaySourcesFrom, type ReplaySources } from './replay.js';

let config: LoadedConfig;
let sources: ReplaySources;

beforeAll(async () => {
  config = await load();
  sources = replaySourcesFrom(config);
});

/**
 * One non-default value per field of `SimulationDemandOptions`.
 *
 * Every value must differ from what the field resolves to when absent, or the round trip below
 * proves nothing: a dropped field would resolve to the default and compare equal.
 */
const DEMAND_SAMPLE = {
  demandLevel: 'max',
  arrivalRatePctPop5min: 7,
  directionalSplit: { incoming: 1, outgoing: 0, interfloor: 0 },
  batchSharesDestination: true,
  entranceWeights: { G: 1, P1: 0 },
  interfloorWeighting: 'uniform',
  credentialAssignment: 'none',
  maxLegs: 4,
  peakWindowS: 420,
  baselineFraction: 0.25,
  mixAmplitude: 0.5,
  // docs/14 §§ 2.1-2.2. `explicit` is deliberately the batch sample: it is the only family
  // carrying an array, so it exercises the one field of the three whose JSON shape is not scalar.
  batchSize: { distribution: 'explicit', weights: [0, 0, 0, 1] },
  passengerMass: {
    distribution: 'lognormal',
    meanKg: 110,
    stdDevKg: 15,
    minKg: 40,
    maxKg: 200,
  },
} as const satisfies Record<keyof SimulationDemandOptions, unknown>;

describe('the stored record carries every demand override', () => {
  /**
   * The exhaustiveness claim, stated at runtime as well as at compile time.
   *
   * The `satisfies` above is what fails the build on a new field. This asserts the sample table is
   * not quietly shrinking either — a row deleted to make a failure go away shows up here.
   */
  it('samples every field the demand surface declares', () => {
    expect(Object.keys(DEMAND_SAMPLE).length).toBe(13);
  });

  /**
   * **The round trip, field by field, through real JSON.**
   *
   * Run on `rise-and-fall`, under which `mixAmplitude` is inert — and that is fine here, because
   * what this file is about is **storage**, not effect. `mixAmplitude` binding is
   * `traffic/parameters.test.ts`'s job; carrying it is this one's. The two cannot be combined into
   * a single run anyway: `lunch-two-way` refuses a `directionalSplit`, by design, since a template
   * that varies the mix within the run and an override that fixes it for the whole run are two
   * different experiments.
   */
  it('round-trips every field through serialize → parse with its value intact', () => {
    const stored = parseStoredRun(
      serializeStoredRun(
        storedRun(config, {
          seed: 20_260_731,
          buildingId: 'midtown-office',
          overrides: { demand: DEMAND_SAMPLE },
        }),
      ),
    );

    for (const [key, value] of Object.entries(DEMAND_SAMPLE)) {
      expect(
        (stored.config.demand as Record<string, unknown> | undefined)?.[key],
        `demand.${key} must survive storage; a field dropped here replays as its default`,
      ).toEqual(value);
    }
  }, 300_000);

  /**
   * **And the rebuilt configuration carries them too**, which is the half that actually decides
   * whether the run reproduces.
   *
   * `replaySimulationConfig` rebuilds by explicit field enumeration — the same construction that
   * dropped `trafficModel` — so a field can survive the record and still be lost on the way back
   * into a `SimulationConfig`. Storage and reconstruction are two separate hand-written lists and
   * this asserts both.
   */
  it('rebuilds a replay configuration that still carries every field', () => {
    const stored = parseStoredRun(
      serializeStoredRun(
        storedRun(config, {
          seed: 20_260_731,
          buildingId: 'midtown-office',
          overrides: { demand: DEMAND_SAMPLE },
        }),
      ),
    );
    const rebuilt = replaySimulationConfig(stored, sources);

    for (const [key, value] of Object.entries(DEMAND_SAMPLE)) {
      expect(
        (rebuilt.demand as Record<string, unknown> | undefined)?.[key],
        `demand.${key} must survive replaySimulationConfig`,
      ).toEqual(value);
    }
  }, 300_000);

  /**
   * **The population the record replays is the population the run had.**
   *
   * The two tests above compare configuration to configuration, which is the weaker claim: a
   * projection could carry a field the simulator then ignores. This compares *masses on the
   * trace*, which is what the mass block is for — and it is the assertion that fails if the block
   * is stored, rebuilt, and dropped anywhere between there and the draw.
   */
  it('replays the stored population rather than the reference one', async () => {
    const { runSimulation } = await import('@elevator-sim/core');
    const stored = parseStoredRun(
      serializeStoredRun(
        storedRun(config, {
          seed: 20_260_731,
          buildingId: 'garden-apartments',
          overrides: { demand: { passengerMass: DEMAND_SAMPLE.passengerMass } },
        }),
      ),
    );
    const replayed = runSimulation(replaySimulationConfig(stored, sources));

    expect(replayed.trace.passengers.length).toBeGreaterThan(0);
    expect(replayed.trace.passengers.map((p) => p.massKg)).toEqual(
      stored.record.passengers
        .filter((leg) => leg.legIndex === 0)
        .map((leg) => leg.massKg),
    );
    // The shipped block is 75 kg; the stored one is 110 with a floor of 40. A replay that lost the
    // block would put nobody above 130, and this population is mostly above it.
    const heavy = replayed.trace.passengers.filter((p) => p.massKg > 100).length;
    expect(heavy * 2).toBeGreaterThan(replayed.trace.passengers.length);
  }, 300_000);
});
