/**
 * **The traffic seed reaches a shipped run, and changes it.** docs/14 § 1.1, step 1.
 *
 * The standing requirement in `docs/05-roadmap.md`, applied to the first control the
 * building-behaviour program adds: *move the control and require the run to change*, compared on
 * the legs rather than on a window statistic. A `trafficSeed` that is schema-valid, unit-tested
 * against `StreamSet` and consulted by no shipped path would be the twelfth dead seam in this
 * repository, and it would look exactly like the eleven before it.
 *
 * So this file drives `runSimulation` — the entry point every study, the CLI and the viewer reach —
 * and asserts the three claims the option actually makes. `random/streams.test.ts` proves the same
 * split at the generator; this proves the wire between them exists.
 */

import { describe, expect, it } from 'vitest';

import { load } from './fixtures.test-helper.js';
import { runSimulation } from './simulation.js';

const SEED = 20_260_726;

const legsOf = (result: { trace: { passengers: readonly { originFloorId: string; finalDestinationFloorId: string; arrivalTimeS: number }[] } }): string =>
  result.trace.passengers
    .map((p) => `${p.originFloorId}>${p.finalDestinationFloorId}@${p.arrivalTimeS.toFixed(3)}`)
    .join('|');

describe('the traffic seed reaches a run', () => {
  const run = async (options: { trafficSeed?: number; seed?: number } = {}) => {
    const config = await load();
    const building = config.buildingsById.get('midtown-office');
    const dispatcherProfile = config.dispatcherProfilesById.get('eta');
    if (building === undefined || dispatcherProfile === undefined) throw new Error('fixtures');
    return runSimulation({
      building,
      dispatcherProfile,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
      seed: options.seed ?? SEED,
      onTimeout: 'report',
      ...(options.trafficSeed === undefined ? {} : { trafficSeed: options.trafficSeed }),
    });
  };

  /**
   * The blocking criterion of docs/14 § 5, on a real run rather than on a generator.
   *
   * If this fails, every pinned figure in the repository is wrong and nothing else in the program
   * matters. It is first for that reason.
   */
  it('changes nothing when it is absent', async () => {
    expect(legsOf(await run())).toBe(legsOf(await run({})));
  }, 300_000);

  it('re-rolls the crowd when it moves', async () => {
    const monday = await run({ trafficSeed: 1 });
    const tuesday = await run({ trafficSeed: 2 });
    expect(legsOf(monday)).not.toBe(legsOf(tuesday));
  }, 300_000);

  /*
   * The direction common random numbers needs: two runs that differ in everything the machine does
   * must still meet the same people. Compared on the legs — the passengers themselves — because a
   * window statistic can agree by coincidence and these cannot.
   */
  it('holds the crowd when the run seed moves', async () => {
    const armA = await run({ seed: 11, trafficSeed: 99 });
    const armB = await run({ seed: 22, trafficSeed: 99 });
    expect(legsOf(armA)).toBe(legsOf(armB));
  }, 300_000);

  /* Invariant 5: a run that cannot report both seeds cannot be replayed. */
  it('reports the traffic seed it was given, and omits it when it was given none', async () => {
    expect((await run({ trafficSeed: 6 })).trafficSeed).toBe('6');
    expect((await run()).trafficSeed).toBeUndefined();
  }, 300_000);

  /*
   * And on the record, which is the half that gets persisted. The result dies with the process; a
   * seed that reaches only the result is a seed a replay cannot ask for, and the run above —
   * "the same crowd through a different machine" — is exactly the run that then comes back wrong.
   */
  it('stamps the traffic seed on the record, which is the thing that gets persisted', async () => {
    expect((await run({ trafficSeed: 6 })).record.trafficSeed).toBe('6');
    expect(Object.keys((await run()).record)).not.toContain('trafficSeed');
  }, 300_000);

  /**
   * **The mechanism this field's docstrings used to assert, refuted and pinned.**
   *
   * Four places in this repository once said that "there was no traffic seed" and "the traffic
   * seed happened to match the run seed" are *different runs* that would replay one as the other.
   * They are not. `StreamSet.#seedFor` hands the demand streams a bigint of the same value either
   * way, so the trace, the legs and the record are identical — everything but the provenance key
   * itself. `random/streams.test.ts` asserts the same identity at the generator; this asserts it
   * at the entry point a study actually calls, because the false sentence was about *runs*.
   *
   * The decision to record the key anyway stands and is unaffected: it is provenance, and it costs
   * nothing because it is absent when unused. What was wrong was the reason, and CLAUDE.md's rule
   * is that a sentence about *why* something behaves as it does is either measured or declared
   * unmeasured. This is the measurement.
   */
  it('is the same run when the traffic seed equals the run seed — only the key differs', async () => {
    const absent = await run();
    const coinciding = await run({ trafficSeed: SEED });

    expect(legsOf(coinciding)).toBe(legsOf(absent));
    expect(coinciding.record.passengers).toEqual(absent.record.passengers);
    // The whole record, not a headline: identical once the provenance key is set aside.
    const { trafficSeed, ...rest } = coinciding.record;
    expect(trafficSeed).toBe(String(SEED));
    expect(rest).toEqual(absent.record);
  }, 300_000);
});
