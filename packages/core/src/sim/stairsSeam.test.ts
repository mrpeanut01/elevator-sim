/**
 * **Some riders walk, the router never sends them, and both asymmetries are real.** docs/14 § 3.3.
 *
 * Stairs are a new *kind* on a shipped model rather than a new subsystem: `TransportModeConfig`,
 * the route graph, `ConservationAudit.transportHops` and the config cross-validation all existed
 * already. What is new is that this mode is **chosen**, and that it is asymmetric twice.
 *
 * Six claims, and the last two are the ones the section exists for:
 *
 * 1. **Criterion 1** — every shipped building parses and runs unchanged, because an absent `kind`
 *    means `escalator`.
 * 2. The schema **refuses** a symmetric stair, a directional escalator, a stair with no propensity
 *    curve, and an escalator with one. Each is a modelling claim, not a formatting rule.
 * 3. **The router never plans over a stair.** Adding one to a building leaves every *route*
 *    identical; only the riders who choose it change.
 * 4. **Criterion 2 on the legs** — the propensity curve and the directional traversal time each
 *    move the run on their own.
 * 5. **Criterion 4** — the served-leg count falls and the run *says* how many walked. A stairs
 *    rider contributes to no wait, ride or TTD statistic, so without the published count the
 *    shortfall reads as a building that got better.
 * 6. **The asymmetry is in the sign, not the distance.** Descending two floors and climbing two
 *    floors are different journeys, and a model symmetric in `|Δfloor|` would be worse than none.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseBuilding, resolveBuilding } from '../config/parse.js';
import type { ResolvedBuilding } from '../config/types.js';

import { DATA_DIR, load } from './fixtures.test-helper.js';
import { runSimulation } from './simulation.js';
import type { SimulationResult } from './types.js';

const SEED = 20_260_731;

/**
 * A **stairwell**: one mode per adjacent floor pair, which is what the data model requires.
 *
 * `TransportModeConfig.connects` is a pair — its own docstring says *"a machine with three
 * landings is two machines"* — so a stairwell serving twenty floors is nineteen modes, not one.
 * That is a real limitation of the shape and it is stated rather than worked around; the practical
 * consequence measured here is that a *single* `["2", "4"]` stair is offered to about three
 * journeys in an hour of Midtown Office traffic, because a journey has to begin and end on
 * exactly its two floors.
 *
 * Authored in this file rather than in `data/buildings/` deliberately: adding a stair to a shipped
 * document would change that building's runs and every pinned estimate taken on it, which is the
 * blocking criterion of docs/14 § 5.
 *
 * The numbers are a *shape*, and the shape is the point — climbing costs half again what
 * descending does, and roughly half as many people will do it. See the sign asymmetry asserted at
 * the bottom of this file. A shipped building declaring a stair would carry its own pair and the
 * source for it in `$comment`, per this repository's reference-data rule.
 *
 * **`use` is two numbers, not two arrays, and that is a correction rather than a simplification.**
 * The first version indexed a curve by flight count with the array length doubling as a reach.
 * Review measured it: `connects` is a pair, so only the last entry of each array was ever read and
 * zeroing index 0 of the two-flight fixture below produced a **bit-identical** `SimulationResult` —
 * schema-valid, authorable, validated dead data, which is § D112's shape at the data layer. The
 * assertion at the bottom of this file is the guard that shape cannot come back.
 */
interface StairsCurve {
  readonly up: number;
  readonly down: number;
}

const CLIMB: StairsCurve = { up: 0.3, down: 0.55 };

/** One stairs mode per adjacent office floor pair, 2 through 20. */
function stairwell(use: StairsCurve = CLIMB): readonly unknown[] {
  const modes: unknown[] = [];
  for (let floor = 2; floor < 20; floor += 1) {
    modes.push({
      id: `stair-${String(floor)}`,
      kind: 'stairs',
      connects: [String(floor), String(floor + 1)],
      traversalTimeS: { upS: 17, downS: 11 },
      use,
    });
  }
  return modes;
}

/** A single stair spanning **two** flights, for the reach assertions. */
const TWO_FLIGHT = {
  id: 'two-flight',
  kind: 'stairs',
  connects: ['2', '4'],
  traversalTimeS: { upS: 34, downS: 22 },
  use: { up: 0.9, down: 0.9 },
} as const;

const STAIRS = TWO_FLIGHT;

async function midtownDocument(): Promise<Record<string, unknown>> {
  const raw = await readFile(join(DATA_DIR, 'buildings', 'midtown-office.json'), 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

async function buildingWith(modes: readonly unknown[] | undefined): Promise<ResolvedBuilding> {
  const config = await load();
  const document = await midtownDocument();
  if (modes === undefined) delete document['transportModes'];
  else document['transportModes'] = modes;
  return resolveBuilding(parseBuilding(document), config.elevatorSpecs);
}

async function run(building: ResolvedBuilding): Promise<SimulationResult> {
  const config = await load();
  const dispatcherProfile = config.dispatcherProfilesById.get('eta');
  if (dispatcherProfile === undefined) throw new Error('fixtures');
  return runSimulation({
    building,
    dispatcherProfile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: SEED,
    demand: {
      arrivalRatePctPop5min: 10,
      directionalSplit: { incoming: 0.2, outgoing: 0.2, interfloor: 0.6 },
    },
    durationS: 3600,
    reportWindow: 'full-run',
    onTimeout: 'report',
  });
}

/** Every route the trace planned, floor by floor. The router's own output, not a statistic. */
const routesOf = (result: SimulationResult): string =>
  result.trace.passengers
    .map((p) => `${p.journeyId}:${p.legs.map((leg) => `${leg.originFloorId}>${leg.destinationFloorId}`).join('+')}`)
    .join('|');

const servedLegsOf = (result: SimulationResult): number =>
  result.record.passengers.filter((leg) => leg.boardedAt !== undefined).length;

describe('stairs are offered, not routed', () => {
  /* ---- criterion 1 ---- */

  it('leaves every shipped building alone, because an absent kind means escalator', async () => {
    const config = await load();
    for (const building of config.buildingsById.values()) {
      for (const mode of building.transportModes ?? []) {
        expect(mode.kind).toBeUndefined();
        expect(typeof mode.traversalTimeS).toBe('number');
      }
    }
  }, 300_000);

  it('adds no key to a run on a building with no stair', async () => {
    const plain = await run(await buildingWith(undefined));
    expect(Object.keys(plain.conservation)).not.toContain('stairsJourneys');
    expect(Object.keys(plain.conservation)).not.toContain('stairsTransitS');
  }, 300_000);

  /* ---- the schema refuses the four configurations that would delete the modelling ---- */

  it('refuses a stair declared with one traversal time', async () => {
    const document = await midtownDocument();
    document['transportModes'] = [{ ...STAIRS, traversalTimeS: 28 }];
    expect(() => parseBuilding(document)).toThrow(/climbing a flight costs more than descending/);
  });

  it('refuses a stair with no propensity curve', async () => {
    const document = await midtownDocument();
    const { use: _use, ...withoutCurve } = STAIRS;
    document['transportModes'] = [withoutCurve];
    expect(() => parseBuilding(document)).toThrow(/stairs are chosen rather than structural/);
  });

  it('refuses an escalator that claims two speeds, or a choice nobody makes', async () => {
    const document = await midtownDocument();
    document['transportModes'] = [
      { id: 'e', connects: ['2', '4'], traversalTimeS: { upS: 30, downS: 20 } },
    ];
    expect(() => parseBuilding(document)).toThrow(/an escalator carries you at one speed/);

    const second = await midtownDocument();
    second['transportModes'] = [
      { id: 'e', connects: ['2', '4'], traversalTimeS: 20, use: STAIRS.use },
    ];
    expect(() => parseBuilding(second)).toThrow(/an escalator is structural/);
  });

  it('refuses a stair that is faster to climb than to descend', async () => {
    const document = await midtownDocument();
    document['transportModes'] = [{ ...STAIRS, traversalTimeS: { upS: 12, downS: 30 } }];
    expect(() => parseBuilding(document)).toThrow(/inverts the asymmetry/);
  });

  /* ---- claim 3: the router does not consult a stair ---- */

  /**
   * **The difference between a stair and an escalator, stated as a run.**
   *
   * `DECISIONS.md` § D170 recorded what happened when escalators landed: *26 journeys routed over
   * different floors*. A stair must do none of that. Every route the trace plans is identical with
   * the stair present and absent — the graph the router sees has not changed — and what differs is
   * only which of those routed riders declines to use theirs.
   */
  it('changes no route at all, only who declines to use one', async () => {
    const plain = await run(await buildingWith(undefined));
    const withStair = await run(await buildingWith(stairwell()));
    expect(routesOf(withStair)).toBe(routesOf(plain));
    // …and it is not inert: somebody took it.
    expect(withStair.conservation.stairsJourneys ?? 0).toBeGreaterThan(0);
  }, 300_000);

  /* ---- criterion 2: each knob moves the run on the legs ---- */

  it('moves the run when the propensity curve moves', async () => {
    const shy = await run(
      await buildingWith(stairwell({ up: 0.02, down: 0.02 })),
    );
    const keen = await run(
      await buildingWith(stairwell({ up: 0.95, down: 0.95 })),
    );
    expect(keen.conservation.stairsJourneys ?? 0).toBeGreaterThan(shy.conservation.stairsJourneys ?? 0);
    expect(servedLegsOf(keen)).toBeLessThan(servedLegsOf(shy));
  }, 300_000);

  /**
   * **Every declared number is read, and the shape that let one hide is refused.**
   *
   * `use` was `propensityUp: number[]` / `propensityDown: number[]`, indexed by flight count, with
   * the array length doubling as a floor-count reach. Because `connects` is a pair the span is
   * fixed, so only `curve[span - 1]` was ever consulted: on `TWO_FLIGHT`, zeroing index 0 of both
   * arrays produced a `SimulationResult` **identical byte for byte** to leaving them at 0.9.
   * Schema-valid, authorable, validated, and dead — `destination-eta`'s `weights.rideTime: 0`
   * (§ D112) reproduced at the data layer in a field this file's own fixture populated deadly.
   *
   * Two numbers is the shape where that cannot happen, and this is the test that says so: each of
   * the two is moved on its own and the run has to follow. A third number nobody reads would fail
   * it by not existing.
   */
  it('reads every number it declares — no dead entry can hide in the pair', async () => {
    const both = await run(await buildingWith([TWO_FLIGHT]));
    expect(both.conservation.stairsJourneys ?? 0).toBeGreaterThan(0);

    const noClimb = await run(await buildingWith([{ ...TWO_FLIGHT, use: { up: 0, down: 0.9 } }]));
    const noDescent = await run(await buildingWith([{ ...TWO_FLIGHT, use: { up: 0.9, down: 0 } }]));

    // Each number alone changes the outcome, so neither is inert.
    expect(noClimb.conservation.stairsJourneys ?? 0).not.toBe(both.conservation.stairsJourneys);
    expect(noDescent.conservation.stairsJourneys ?? 0).not.toBe(both.conservation.stairsJourneys);
    // …and zeroing both empties the mode entirely, which is the negative control.
    const neither = await run(await buildingWith([{ ...TWO_FLIGHT, use: { up: 0, down: 0 } }]));
    expect(neither.conservation.stairsJourneys).toBeUndefined();
  }, 300_000);

  /**
   * The directional traversal time, on the only quantity it can move.
   *
   * A stairs rider is in no lift queue, so they contribute to no wait, ride or TTD figure; the
   * seconds they spend climbing are observable through `stairsTransitS` and nowhere else. That is
   * why the field exists rather than being left to be inferred, and why criterion 2 is checked
   * here for this knob.
   */
  it('moves the stair seconds when the climb gets longer', async () => {
    const quick = await run(await buildingWith(stairwell()));
    const slow = await run(
      await buildingWith(
        stairwell().map((mode) => ({
          ...(mode as Record<string, unknown>),
          traversalTimeS: { upS: 90, downS: 11 },
        })),
      ),
    );
    // The same people walk — the propensity draw is untouched — and they take longer doing it.
    expect(slow.conservation.stairsJourneys).toBe(quick.conservation.stairsJourneys);
    expect(slow.conservation.stairsTransitS ?? 0).toBeGreaterThan(
      quick.conservation.stairsTransitS ?? 0,
    );
  }, 300_000);

  /* ---- criterion 4: fewer legs served, and the run says why ---- */

  it('serves fewer legs and publishes how many walked', async () => {
    const plain = await run(await buildingWith(undefined));
    const withStair = await run(
      await buildingWith(stairwell({ up: 0.9, down: 0.95 })),
    );

    // The population really is different — this is the comparison docs/14 § 3.3 warns about.
    expect(servedLegsOf(withStair)).toBeLessThan(servedLegsOf(plain));
    // …and the run states the shortfall rather than leaving it to be inferred from a better mean.
    expect(withStair.conservation.stairsJourneys ?? 0).toBeGreaterThan(0);
    expect(withStair.conservation.stairsTransitS ?? 0).toBeGreaterThan(0);
    // Counted as an escalator hop is, so the two kinds are accounted the same way.
    expect(withStair.conservation.transportHops).toBeGreaterThanOrEqual(
      withStair.conservation.stairsJourneys ?? 0,
    );
    // The books still balance: a rider who walked is delivered, not missing.
    expect(withStair.conservation.balanced).toBe(true);
    expect(withStair.conservation.delivered + withStair.conservation.undelivered).toBe(
      withStair.conservation.generated,
    );
  }, 300_000);

  /**
   * The same disclaimer, for the same reason, on the stairs axis: a rider who walked appears in
   * `delivered` and in no wait, ride or time-to-destination figure at all, so a surface that shows
   * per-leg statistics beside a delivery count is describing two different populations.
   */
  it('says in the record that some riders never entered the lift system', async () => {
    const withStair = await run(await buildingWith(stairwell()));
    const disclaimer = withStair.warnings[0] ?? '';
    expect(disclaimer).toContain('took a declared stairs mode');
    expect(disclaimer).toContain('conservation.stairsJourneys');
    expect(withStair.record.warnings?.[0]).toBe(disclaimer);

    const plain = await run(await buildingWith(undefined));
    expect(plain.warnings.join(' ')).not.toContain('took a declared stairs mode');
  }, 300_000);

  /* ---- the asymmetry, which is the whole request ---- */

  /**
   * **Propensity is a function of signed floor delta, not of distance.**
   *
   * Two arms with the *same* curve read in one direction and a flat one in the other: if the model
   * were symmetric in `|Δfloor|`, swapping which array carries the numbers would produce the same
   * uptake. It does not, because up-traffic and down-traffic are different traffic — and
   * down-peak is exactly where a real building's stairs take load off the lifts.
   */
  it('reads the curve by sign, so climbing and descending are different journeys', async () => {
    const downOnly = await run(
      await buildingWith(stairwell({ up: 0, down: 0.9 })),
    );
    const upOnly = await run(
      await buildingWith(stairwell({ up: 0.9, down: 0 })),
    );
    // Both arms are live, and they are not the same set of people.
    expect(downOnly.conservation.stairsJourneys ?? 0).toBeGreaterThan(0);
    expect(upOnly.conservation.stairsJourneys ?? 0).toBeGreaterThan(0);
    expect(downOnly.conservation.stairsJourneys).not.toBe(upOnly.conservation.stairsJourneys);

    // And the *cost* asymmetry, independently: the same headcount would not cost the same.
    const downPerRider =
      (downOnly.conservation.stairsTransitS ?? 0) / (downOnly.conservation.stairsJourneys ?? 1);
    const upPerRider =
      (upOnly.conservation.stairsTransitS ?? 0) / (upOnly.conservation.stairsJourneys ?? 1);
    expect(upPerRider).toBeGreaterThan(downPerRider);
    expect(upPerRider).toBeCloseTo(17, 6);
    expect(downPerRider).toBeCloseTo(11, 6);
  }, 300_000);
});
