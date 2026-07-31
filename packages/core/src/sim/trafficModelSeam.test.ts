/**
 * **`trafficModel` reaches a shipped run, and buys exactly the thing it claims — which is not
 * quite the thing docs/14 § 1.3 said it would.** Step 2 of the building-behaviour program.
 *
 * The standing requirement in `docs/05-roadmap.md` — *move the control and require the run to
 * change, compared on the legs rather than on a window statistic* — pointed at the one control in
 * this program that can move a published number.
 *
 * ## The claim this file was written to prove, and what measuring it found
 *
 * The pre-registered statement was: *under `v1`, changing the group-size mean shifts arrival
 * instants; under `v2` it leaves them untouched and changes only group sizes.* Written first,
 * watched failing, and then **found to be false in its second half** — for a reason that is a
 * property of the model rather than a defect in the wiring:
 *
 * > `batchesPerSecond = passengerRate / meanBatchSize` (`poissonBatch.ts`). Total *passenger*
 * > demand is held fixed, so the *batch* arrival rate is a function of the mean **by
 * > construction**. Bigger groups mean fewer, larger batches. No stream separation can make the
 * > batch arrival process invariant to the group-size mean, and one that did would be describing a
 * > building where raising the group size raised the headcount.
 *
 * A second measurement pinned the other half of the explanation: `drawGeometricBatchSize` consumes
 * **exactly one draw per call for every mean**, deliberately. So a mean change never changes the
 * *per-batch* draw count, and a **rate-compensated** mean change — mean and passenger rate scaled
 * together, batch rate held fixed — leaves the instants untouched under `v1` *and* `v2` alike.
 * That is asserted below, because it is the reason the original claim could not hold and because
 * it is the property a future group-size sampler must not quietly break.
 *
 * ## What `v2` does remove, stated so it can be falsified
 *
 * The coupling is **across demand sources**, not within one. `generateTrace` walks
 * `plan.sources` in order and, for each, draws all of that source's arrival times (pass A) and
 * then all of its group sizes (pass B). Under `v1` both come from `arrivals`, so **source k's
 * group sizes displace source k+1's arrival times**. The residents of Midtown Office turn up when
 * they do partly because of how many people walked through the lobby door together.
 *
 * That is measured directly here: at one fixed configuration and seed, `v1` and `v2` agree exactly
 * on the **first** source's instants — drawn before any group-size draw exists — and disagree on
 * **every** later source's. One source unchanged and nineteen displaced is the coupling, seen
 * rather than argued.
 *
 * ## Why it drives `runSimulation`
 *
 * A `trafficModel` that is schema-valid, unit-tested against the generator and consulted by no
 * shipped path would be the twelfth dead seam in this repository, and it would look exactly like
 * the eleven before it. `traffic/generator.test.ts` proves the switch at the draw; this proves the
 * wire between `SimulationConfig` and that switch exists, and that the result says which model ran.
 */

import { describe, expect, it } from 'vitest';

import type { LoadedConfig, TrafficProfiles } from '../config/types.js';

import { load } from './fixtures.test-helper.js';
import { runSimulation } from './simulation.js';
import type { SimulationResult } from './types.js';

const SEED = 20_260_726;
const BUILDING_ID = 'midtown-office';

/**
 * The same reference data with every profile's group-size mean replaced.
 *
 * The mean is authored in `data/traffic-profiles.json` and has no config-surface override yet —
 * that is docs/14 § 2.2, which is T3 and is blocked on this commit. Overriding it here rather than
 * waiting for the knob is the point: what this file measures is a property of the *draw order*,
 * and it is visible the moment the mean moves by any route at all.
 */
const withBatchMean = (profiles: TrafficProfiles, mean: number): TrafficProfiles => ({
  ...profiles,
  profiles: profiles.profiles.map((profile) => ({
    ...profile,
    batchSize: { ...profile.batchSize, mean },
  })),
});

/** Every batch instant in the run, in trace order. */
const instantsOf = (result: SimulationResult): string =>
  result.trace.arrivals.map((arrival) => arrival.timeS.toFixed(9)).join('|');

/** Batch instants grouped by the demand source that produced them. */
const instantsBySource = (result: SimulationResult): ReadonlyMap<string, string> => {
  const bySource = new Map<string, string>();
  for (const arrival of result.trace.arrivals) {
    bySource.set(
      arrival.sourceId,
      `${bySource.get(arrival.sourceId) ?? ''}|${arrival.timeS.toFixed(9)}`,
    );
  }
  return bySource;
};

/** Every batch's size — what `drawBatchSize` alone decides. */
const sizesOf = (result: SimulationResult): string =>
  result.trace.arrivals.map((arrival) => String(arrival.passengers.length)).join(',');

/** The legs, as `trafficSeedSeam.test.ts` compares them. */
const legsOf = (result: SimulationResult): string =>
  result.trace.passengers
    .map((p) => `${p.originFloorId}>${p.finalDestinationFloorId}@${p.arrivalTimeS.toFixed(3)}`)
    .join('|');

describe('the traffic model reaches a run', () => {
  const run = async (
    options: { trafficModel?: 'v1' | 'v2'; batchMean?: number; ratePctPop5min?: number } = {},
  ): Promise<SimulationResult> => {
    const config: LoadedConfig = await load();
    const building = config.buildingsById.get(BUILDING_ID);
    const dispatcherProfile = config.dispatcherProfilesById.get('eta');
    if (building === undefined || dispatcherProfile === undefined) throw new Error('fixtures');
    return runSimulation({
      building,
      dispatcherProfile,
      trafficProfiles:
        options.batchMean === undefined
          ? config.trafficProfiles
          : withBatchMean(config.trafficProfiles, options.batchMean),
      elevatorSpecs: config.elevatorSpecs,
      seed: SEED,
      onTimeout: 'report',
      ...(options.trafficModel === undefined ? {} : { trafficModel: options.trafficModel }),
      ...(options.ratePctPop5min === undefined
        ? {}
        : { demand: { arrivalRatePctPop5min: options.ratePctPop5min } }),
    });
  };

  /**
   * The blocking criterion of docs/14 § 5, on a real run.
   *
   * If this fails, 981 pinned estimates and both identity digests are wrong and nothing else in
   * this file matters. It is first for that reason, and `'v1'` is asserted equal to *absent*
   * because the default is the whole of the promise: a caller who never heard of `trafficModel`
   * gets the run they got before it existed.
   */
  it('changes nothing when it is absent, and v1 is that same run', async () => {
    const absent = await run();
    expect(legsOf(await run({ trafficModel: 'v1' }))).toBe(legsOf(absent));
    expect(instantsOf(await run({ trafficModel: 'v1' }))).toBe(instantsOf(absent));
  }, 300_000);

  /**
   * **The coupling, and its removal, in one comparison.**
   *
   * Midtown Office has twenty demand sources: `entrance` first, then one resident source per
   * populated floor. Under `v1` the entrance's group-size draws sit in `arrivals` between the
   * entrance's arrival times and the first resident's, so every resident source is displaced by
   * them. Under `v2` they are not.
   *
   * So exactly one source — the first, whose times are drawn before any group size exists — must
   * agree between the two models, and every other must differ. A `v2` that agreed everywhere would
   * mean the switch never reached the draw; one that disagreed *everywhere* would mean the
   * arrival-time draws had moved too, which is not what this change is allowed to do.
   */
  it('v1 lets one source’s group sizes move the next source’s arrival times; v2 does not', async () => {
    const one = instantsBySource(await run({ trafficModel: 'v1' }));
    const two = instantsBySource(await run({ trafficModel: 'v2' }));

    // As a *set*: `trace.arrivals` is sorted by `(time, sequence)`, so which source appears first
    // is itself one of the things the displacement moves.
    expect([...two.keys()].sort()).toEqual([...one.keys()].sort());
    const agreed = [...one].filter(([source, instants]) => two.get(source) === instants);
    const displaced = [...one].filter(([source, instants]) => two.get(source) !== instants);

    expect(agreed.map(([source]) => source)).toEqual(['entrance']);
    expect(displaced.length).toBe(one.size - 1);
    expect(displaced.length).toBeGreaterThan(1);
  }, 300_000);

  /*
   * v2 is a different run from v1 at the same seed, and it has to be: the batch draws now come
   * from a different stream, so the sizes differ and so does everything downstream of them. A v2
   * that reproduced v1 would mean the switch never reached the draw.
   */
  it('v2 is a different run from v1 at the same seed', async () => {
    expect(sizesOf(await run({ trafficModel: 'v2' }))).not.toBe(
      sizesOf(await run({ trafficModel: 'v1' })),
    );
  }, 300_000);

  /**
   * **The measured null, pinned so nobody re-derives it as a bug.**
   *
   * A group-size mean change moves the arrival instants under **both** models, because
   * `batchesPerSecond = passengerRate / meanBatchSize` makes the batch arrival process a function
   * of the mean. Anyone reading `v2` as *"group size and arrival instants are now independent"*
   * will reach for this and find it asserted the other way, with the reason attached.
   */
  it('a group-size mean change still moves the instants under v2 — the batch rate depends on it', async () => {
    for (const trafficModel of ['v1', 'v2'] as const) {
      const base = await run({ trafficModel });
      const richer = await run({ trafficModel, batchMean: 2.8 });
      expect(instantsOf(richer), trafficModel).not.toBe(instantsOf(base));
    }
  }, 300_000);

  /**
   * **The invariance that does hold, and the property T3 must not break.**
   *
   * Scale the mean and the passenger rate together and the batch rate is unchanged, so the
   * arrival-time draws are unchanged — under `v1` as well as `v2`, because
   * `drawGeometricBatchSize` consumes exactly one draw per call whatever the mean. That discipline
   * is the reason `v1` is less coupled than docs/14 § 1.3 feared, and it is load-bearing: a
   * group-size sampler whose draw count depended on its parameters would break this under `v1` and
   * not under `v2`, which is the whole reason `v2` is worth having before § 2.2 is written.
   */
  it('a rate-compensated mean change leaves the instants untouched under both models', async () => {
    for (const trafficModel of ['v1', 'v2'] as const) {
      const base = await run({ trafficModel, ratePctPop5min: 12 });
      const compensated = await run({ trafficModel, ratePctPop5min: 24, batchMean: 2.8 });
      expect(instantsOf(compensated), trafficModel).toBe(instantsOf(base));
    }
  }, 300_000);

  /**
   * The seam a version no shipped path reports would be.
   *
   * Absent under `v1` — and absent rather than `'v1'` — for a reason the {@link SimulationResult}
   * docstring states in full: a `v1` run is byte-identical to every run this repository produced
   * before the option existed, so announcing `'v1'` would claim a distinction that does not exist
   * and would move both identity digests to say nothing.
   */
  it('reports the model only when it is not the one that was always there', async () => {
    expect((await run()).trafficModel).toBeUndefined();
    expect((await run({ trafficModel: 'v1' })).trafficModel).toBeUndefined();
    expect((await run({ trafficModel: 'v2' })).trafficModel).toBe('v2');
  }, 300_000);
});
