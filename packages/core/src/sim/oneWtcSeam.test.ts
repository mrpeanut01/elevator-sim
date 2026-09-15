/**
 * **What `one-wtc-class-reference` is *for*, proved on the legs rather than asserted** — GitHub
 * issue [#428](https://github.com/mrpeanut01/elevator-sim/issues/428),
 * [`DECISIONS.md` § D594](../../../../DECISIONS.md).
 *
 * `docs/05-roadmap.md`'s standing requirement is the rule: **move the control and require the run to
 * change, compared on the legs.** This tower carries two things no shipped building carried, and one
 * thing it deliberately does *not* carry; all three are settled here by runs.
 *
 * | claim | the control this file moves |
 * |---|---|
 * | the sky lobby escalator carries traffic rather than decorating the lobby | delete `transportModes` |
 * | a `mobile-credential` landing would be inert under the shipped dispatcher | declare it on every landing |
 * | a `destination-entry` landing would make the tower **throw** under a shipped profile | declare it, run `predictive-balanced` |
 *
 * The third row is the reason this building declares no `landingCallType` at all, and
 * `CLAUDE.md` § *A stated refusal goes stale the same way* is why it is a pair of runs rather than a
 * sentence in the JSON: *a refusal is pinned by a run, never by another sentence.*
 *
 * **What this file does not claim.** Nothing here says one arrangement is **better**. That would
 * need a paired-t interval over 50–200 replications under common random numbers, which is
 * `packages/experiments/src/benchmark/destinationSecondBuilding.test.ts`; every figure quoted in a
 * comment below is one seed with its `n` stated.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { LoadedConfig, ResolvedBuilding } from '../config/types.js';

import { load, reauthoredWithLandingCallTypeEverywhere } from './fixtures.test-helper.js';
import { SimulationError } from './types.js';
import {
  SEEDS,
  authored,
  journeys,
  legIdentities,
  offeredJourneys,
  resolveAuthored,
  run,
  transportHops,
} from './referenceTowerSeam.test-helper.js';

const ID = 'one-wtc-class-reference';

let config: LoadedConfig;

beforeAll(async () => {
  config = await load();
}, 300_000);

function shipped(): ResolvedBuilding {
  const building = config.buildingsById.get(ID);
  if (building === undefined) throw new Error(`no building "${ID}"`);
  return building;
}

describe('the sky lobby escalator carries traffic, and a lift leg is what it saves', () => {
  it('is the only mode declared, and the building loads clean with it', () => {
    // Asserted rather than left to the JSON, because every case below is a claim about this
    // arrangement and would quietly become a claim about a different one.
    const building = shipped();
    expect(building.transportModes?.map((mode) => mode.id)).toEqual(['sky-lobby-escalator']);
    expect(building.warnings.map((warning) => warning.code)).toEqual([]);
  });

  it('takes hops on every seed, and deleting it converts each one into a lift leg', () => {
    /*
     * **The measurement GitHub issue #428 criterion 2 asked for.** It says an escalator pair that
     * takes zero hops is a dead field — `data/buildings/README.md` and § D527 item 5 — and that a
     * building whose escalators genuinely carry traffic is the case that would justify giving
     * `transportModes` a capacity or a direction.
     *
     * Measured on this tree at `collective`, 1 800 s: **391, 375 and 359** hops against **2 873,
     * 2 995 and 2 841** lift legs. With the block deleted the same journeys need **3 264, 3 370 and
     * 3 200** legs — exactly `+391`, `+375`, `+359`. One lift leg per hop, to the unit, which is the
     * sense in which the pair is part of the lift system.
     *
     * The equality is asserted rather than the literals: a pinned 391 here would be a published
     * number nothing re-derives the moment the demand template moves, and what the claim needs is
     * the *relation*.
     */
    for (const seed of SEEDS) {
      const withMode = run(config, shipped(), seed);
      const document = authored(ID);
      delete document.transportModes;
      const withoutMode = run(config, resolveAuthored(config, ID, document), seed);

      // The pairing, first: same journeys, or every leg difference below means nothing.
      expect(offeredJourneys(withoutMode), `seed ${String(seed)}`).toBe(offeredJourneys(withMode));

      const hops = transportHops(withMode);
      expect(hops, `seed ${String(seed)}: the escalator took no hop`).toBeGreaterThan(100);
      expect(transportHops(withoutMode), `seed ${String(seed)}`).toBe(0);
      expect(
        withoutMode.record.passengers.length - withMode.record.passengers.length,
        `seed ${String(seed)}: a hop is a lift leg this tower does not charge`,
      ).toBe(hops);
      expect(
        legIdentities(withoutMode),
        `seed ${String(seed)}: deleting the escalator changed no leg`,
      ).not.toBe(legIdentities(withMode));
    }
  }, 300_000);

  it('non-vacuity: the sky lobby is used, so the control governs something', () => {
    // A tower nobody transfers in would make the case above true for an uninteresting reason.
    const rode = [...journeys(run(config, shipped(), SEEDS[0] as number)).values()].filter(
      (legs) => legs.length > 1,
    );
    expect(rode.length).toBeGreaterThan(500);
  }, 300_000);
});

describe('the landing fixture this tower does not declare, refused by a run', () => {
  it('declares no `landingCallType` on any floor', () => {
    // The authored fact the two cases below justify. A reader who expects a destination-dispatch
    // reference tower to carry a destination fixture is right to, and this is where they find out
    // why it does not.
    for (const floor of shipped().floors) expect(floor.landingCallType).toBeUndefined();
  });

  it('`mobile-credential` on every landing would be inert — the legs are byte-identical', () => {
    /*
     * **§ D265's defect, checked in the direction that could have gone wrong.** Under the shipped
     * default the landing's own fixture changes what a call *discloses* and nothing reads it:
     * `collective` weights `waitTime` alone, so a disclosed destination prices nothing, and
     * `lifecycle.ts#batchKeyOf` splits a landing per destination only under
     * `passengerAssignment: 'panel'`, which `collective` is not. So the field would be a declared
     * value with no consequence — and that is measured rather than reasoned about.
     */
    const stamped = reauthoredWithLandingCallTypeEverywhere(config, ID, 'mobile-credential');
    expect(stamped.floors.every((floor) => floor.landingCallType === 'mobile-credential')).toBe(true);

    const seed = SEEDS[0] as number;
    expect(legIdentities(run(config, stamped, seed))).toBe(legIdentities(run(config, shipped(), seed)));
  }, 300_000);

  it('`destination-entry` on every landing would make the tower throw under `predictive-balanced`', () => {
    /*
     * The other half, and the one that decides the question. `predictive-balanced` is a **shipped**
     * profile and a contract reward, and it defers assignment. A destination-entry kiosk holds a
     * person at a screen, so it cannot defer: `resolveDispatchConfig` refuses the pair for a whole
     * run and `Simulation` refuses it for one landing. A building that crashes on a dispatcher the
     * game offers is a product defect rather than fidelity, and that is why this tower's lobby is
     * modelled without the fixture the real one has.
     */
    const stamped = reauthoredWithLandingCallTypeEverywhere(config, ID, 'destination-entry');
    expect(() => run(config, stamped, SEEDS[0] as number, 'predictive-balanced')).toThrow(
      SimulationError,
    );
    expect(() => run(config, stamped, SEEDS[0] as number, 'predictive-balanced')).toThrow(
      /destination-entry.*defers assignment/su,
    );
  }, 300_000);
});
