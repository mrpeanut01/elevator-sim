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
 * `v2` run replaying as `v1`. And this commit found two more: `mixAmplitude`, plus the two knobs
 * docs/14 §§ 2.1–2.2 add.
 *
 * **What the `mixAmplitude` instance is and is not.** `TRAFFIC_DEFAULTS.mixAmplitude` is 1, so a
 * stored flat-mix control at `0` that lost the field would rebuild at the full authored arc — the
 * control replaying with its treatment's mix. That is the mechanism. It is **not** a claim that any
 * published figure is wrong: `createStoredRun` has no non-test caller in this tree, so nothing has
 * yet stored a run through this path. The right description is a **latent violation on a public
 * exported API**, and it is the most serious of the three anyway, because it predates this branch
 * and sits underneath the negative control § D162 condition 5 requires.
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
  // docs/14 § 2.3. `peakShiftS` is included deliberately: it is the one optional field inside the
  // block, so a projection that carried the two bounds and dropped it would still round-trip a
  // *bounded* multiplier and lose only the timing — the quietest of the three losses.
  dayVariation: { minDemandFactor: 0.8, maxDemandFactor: 1.25, peakShiftS: 120 },
} as const satisfies Record<keyof SimulationDemandOptions, unknown>;

describe('the stored record carries every demand override', () => {
  /**
   * The exhaustiveness claim, stated at runtime as well as at compile time.
   *
   * The `satisfies` above is what fails the build on a new field. This asserts the sample table is
   * not quietly shrinking either — a row deleted to make a failure go away shows up here.
   */
  it('samples every field the demand surface declares', () => {
    expect(Object.keys(DEMAND_SAMPLE).length).toBe(14);
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
   * **And the rebuilt configuration carries them too.**
   *
   * An earlier version of this comment said `replaySimulationConfig` rebuilds the demand block by
   * explicit field enumeration. **It does not** — `replay.ts` spreads `config.demand` wholesale,
   * so nothing is lost on that leg. The enumeration that is the risk is on the **storage** side,
   * which is where all three historical drops happened.
   *
   * The assertion is still worth making, for the narrower reason: `replaySimulationConfig` *does*
   * rebuild by explicit enumeration at the level above — that is how `trafficModel` was dropped —
   * so this pins that the demand block continues to reach a `SimulationConfig` whole rather than
   * being re-projected field by field at some later date.
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

  /**
   * **The day the record replays is the day the run had.** docs/14 § 2.3.
   *
   * The same strengthening the mass block gets one test up, and for the same reason: the two
   * configuration-to-configuration tests above are the weaker claim, because a projection can
   * carry a field the simulator then ignores. `dayVariation` was landed with only that weaker
   * claim, which adversarial review noticed was an inconsistency against its own neighbour rather
   * than a considered scope.
   *
   * It matters more here than for the mass block, not less: the stored block is what the
   * `dayVariation` **stream is drawn against**, so a record that lost it replays at
   * `demandFactor: 1` with the stream never consumed — a different number of people, arriving at
   * different times, reported as a faithful reproduction. The band is deliberately far from 1 and
   * degenerate, so the replayed factor is arithmetic rather than a draw and a lost block shows up
   * as a specific missing number instead of as a plausible one.
   */
  it('replays the stored day rather than the average one', async () => {
    const { runSimulation } = await import('@elevator-sim/core');
    const stored = parseStoredRun(
      serializeStoredRun(
        storedRun(config, {
          seed: 20_260_731,
          buildingId: 'garden-apartments',
          overrides: {
            demand: { dayVariation: { minDemandFactor: 1.75, maxDemandFactor: 1.75, peakShiftS: 200 } },
          },
        }),
      ),
    );
    const replayed = runSimulation(replaySimulationConfig(stored, sources));

    expect(replayed.trace.dayVariation?.demandFactor).toBe(1.75);
    expect(replayed.trace.dayVariation?.peakShiftS).not.toBe(0);

    // And the day reached the population rather than only the report of it. The control is the
    // same seed with no block: a replay that dropped it lands on the control's numbers exactly.
    const control = runSimulation({
      ...replaySimulationConfig(stored, sources),
      demand: { ...replaySimulationConfig(stored, sources).demand, dayVariation: undefined },
    });
    expect(control.trace.dayVariation).toBeUndefined();
    expect(replayed.trace.expectedPassengers / control.trace.expectedPassengers).toBeCloseTo(1.75, 12);
    expect(replayed.trace.reportWindowStartS).not.toBe(control.trace.reportWindowStartS);
  }, 300_000);
});
