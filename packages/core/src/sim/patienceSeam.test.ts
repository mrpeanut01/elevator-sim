/**
 * **Riders leave, the books still balance, and the AWT that improves says why.** docs/14 § 3.1.
 *
 * Three claims, and the third is the one this file exists for.
 *
 * 1. **Criterion 1 — byte-identity when unused.** A run that declares no `sim.patience` is the
 *    run it was before patience existed, compared on the whole `SimulationResult` rather than on
 *    a headline. `traffic/transportIdentity.test.ts` holds the same property against pinned
 *    digests; this holds it against the arm beside it, so a break shows up as a diff rather than
 *    as a moved constant somebody could edit.
 * 2. **Criterion 2 — the control moves the run, on the legs.** Two patience curves that differ
 *    only in their mean produce different people leaving at different times. A knob that is
 *    schema-valid, unit-tested against its own draw function and consulted by no shipped path
 *    would be the twelfth dead seam in this repository, and it would look exactly like the eleven
 *    before it.
 * 3. **Criterion 4 — abandonment is reported beside AWT and never folded into it.** This is
 *    `DECISIONS.md` § D106's energy rule pointed at a second axis: *a configuration that spends
 *    less by serving fewer people has not saved anything*. Abandonment improves AWT **by
 *    construction**, because the waits it deletes from the sample are the longest ones — so the
 *    test that matters is the one that catches the improvement in the act: **AWT falls, the
 *    served-leg count falls with it, and the run says so in the same summary.**
 */

import { describe, expect, it } from 'vitest';

import { load } from './fixtures.test-helper.js';
import { runSimulation } from './simulation.js';
import type { PatienceConfig } from './patience.js';
import type { SimulationConfig, SimulationResult } from './types.js';

const SEED = 20_260_731;

/**
 * A demand heavy enough that riders genuinely stand there long enough to give up.
 *
 * Garden Apartments with two cars and 8 % of its population arriving per five minutes is a
 * building under real strain, which is the only condition under which patience is observable at
 * all: at a comfortable load nobody's patience expires and every arm is identical, which would
 * make every assertion below vacuously true.
 */
const PRESSED = { arrivalRatePctPop5min: 8 } as const;

async function run(
  patience?: PatienceConfig,
  overrides: Partial<SimulationConfig> = {},
): Promise<SimulationResult> {
  const config = await load();
  const building = config.buildingsById.get('garden-apartments');
  const dispatcherProfile = config.dispatcherProfilesById.get('eta');
  if (building === undefined || dispatcherProfile === undefined) throw new Error('fixtures');
  return runSimulation({
    building,
    dispatcherProfile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: SEED,
    demand: PRESSED,
    reportWindow: 'full-run',
    onTimeout: 'report',
    ...(patience === undefined ? {} : { patience }),
    ...overrides,
  });
}

/** Who left, and when — the leg-level fact, not a window statistic. */
const departuresOf = (result: SimulationResult): string =>
  result.record.passengers
    .filter((leg) => leg.abandonedAt !== undefined)
    .map((leg) => `${leg.passengerId}@${(leg.abandonedAt ?? 0).toFixed(3)}`)
    .join('|');

const servedLegsOf = (result: SimulationResult): number =>
  result.record.passengers.filter((leg) => leg.boardedAt !== undefined).length;

describe('patience reaches a shipped run', () => {
  /**
   * The blocking criterion of docs/14 § 5, on the whole result object.
   *
   * `transportIdentity.test.ts` `JSON.stringify`s a `SimulationResult`, so a key that appears on
   * the default path moves a pinned digest whatever its value. Asserting the two runs *equal*
   * catches that here, in the file that added the keys, rather than three packages away.
   */
  it('changes nothing at all when it is absent', async () => {
    expect(JSON.stringify(await run())).toBe(JSON.stringify(await run(undefined)));
  }, 300_000);

  it('adds no key to a run that did not ask for it', async () => {
    const quiet = await run();
    expect(Object.keys(quiet.conservation)).not.toContain('abandoned');
    expect(Object.keys(quiet.conservation)).not.toContain('callsWithdrawn');
    expect(Object.keys(quiet.summary)).not.toContain('abandonment');
    for (const leg of quiet.record.passengers) {
      expect(Object.keys(leg)).not.toContain('abandonedAt');
    }
  }, 300_000);

  /* ---- criterion 2: move the control, and the run moves, on the legs ---- */

  it('makes riders leave, and a shorter mean makes more of them leave sooner', async () => {
    const patient = await run({ distribution: 'exponential', meanS: 240 });
    const impatient = await run({ distribution: 'exponential', meanS: 45 });

    // Not vacuous: the pressed arm really does keep people waiting long enough to give up.
    expect(impatient.conservation.abandoned ?? 0).toBeGreaterThan(0);
    // The whole leg-level fact, not a count: different people, at different instants.
    expect(departuresOf(impatient)).not.toBe(departuresOf(patient));
    expect(impatient.conservation.abandoned ?? 0).toBeGreaterThan(
      patient.conservation.abandoned ?? 0,
    );
  }, 300_000);

  it('moves the run when the distribution changes at a fixed mean', async () => {
    // The shape of the curve, with its mean held: an implementation that read `meanS` and
    // ignored `distribution` would pass the test above and fail this one.
    const exponential = await run({ distribution: 'exponential', meanS: 60 });
    const uniform = await run({ distribution: 'uniform', meanS: 60, spreadS: 5 });
    expect(departuresOf(uniform)).not.toBe(departuresOf(exponential));
  }, 300_000);

  it('honours the floor below which nobody leaves', async () => {
    const floored = await run({ distribution: 'exponential', meanS: 45, minS: 30 });
    for (const leg of floored.record.passengers) {
      if (leg.abandonedAt === undefined) continue;
      expect(leg.abandonedAt - leg.arrivedAt).toBeGreaterThanOrEqual(30);
    }
    // …and the floor is doing something: without it, somebody leaves inside 30 s.
    const unfloored = await run({ distribution: 'exponential', meanS: 45 });
    const shortest = unfloored.record.passengers
      .filter((leg) => leg.abandonedAt !== undefined)
      .map((leg) => (leg.abandonedAt ?? 0) - leg.arrivedAt);
    expect(Math.min(...shortest)).toBeLessThan(30);
  }, 300_000);

  /* ---- what abandoning actually does to the model ---- */

  it('takes the rider off the landing and never serves them', async () => {
    const result = await run({ distribution: 'exponential', meanS: 45 });
    const gone = result.record.passengers.filter((leg) => leg.abandonedAt !== undefined);
    expect(gone.length).toBeGreaterThan(0);
    for (const leg of gone) {
      // Never served, never in a car, and holding no promise anybody is keeping for them.
      expect(leg.boardedAt).toBeUndefined();
      expect(leg.alightedAt).toBeUndefined();
      expect(leg.assignedCarId).toBeUndefined();
    }
    // Nobody is left standing on a landing whose button is still lit for them: the run drained.
    expect(result.warnings.join(' ')).not.toContain('was never collected');
  }, 300_000);

  /**
   * **An abandoned rider's wait is known, not censored.**
   *
   * `diagnoseServiceLevel` treats a leg that never boarded as waiting until the run stopped,
   * which is the right lower bound for somebody still standing there. For somebody who left at
   * t=60 of a half-hour run it credits them with twenty-nine minutes they spent elsewhere, and
   * reports a `starved` verdict about a person who was not in the building.
   */
  it('does not credit a rider who left with the time they spent elsewhere', async () => {
    const result = await run({ distribution: 'exponential', meanS: 45 });
    const longest = Math.max(
      ...result.record.passengers.map((leg) =>
        leg.boardedAt === undefined
          ? leg.abandonedAt === undefined
            ? result.endedAt - leg.arrivedAt
            : leg.abandonedAt - leg.arrivedAt
          : leg.boardedAt - leg.arrivedAt,
      ),
    );
    expect(result.summary.serviceLevel.longestWaitS).toBeLessThanOrEqual(longest + 1e-9);
    // Not vacuous: the run really is long enough for the censored reading to be much bigger.
    expect(result.endedAt).toBeGreaterThan(longest * 2);
  }, 300_000);

  it('keeps the books balanced with a third column', async () => {
    const result = await run({ distribution: 'exponential', meanS: 45 });
    const { generated, delivered, undelivered, abandoned } = result.conservation;
    expect(abandoned).toBeGreaterThan(0);
    expect(delivered + undelivered + (abandoned ?? 0)).toBe(generated);
    expect(result.conservation.balanced).toBe(true);
    // The abandoned are *not* in the undelivered list: they are not in the system.
    expect(result.undelivered.length).toBe(undelivered);
  }, 300_000);

  /**
   * **The hall call goes with them, and the withdrawal is a measured behaviour rather than a
   * tidy-up.**
   *
   * A reader could reasonably think this path is redundant: a car sent to an empty landing
   * declines to stop and `#reofferCall` clears the call on arrival, so nobody is stranded either
   * way. Measured, it is not redundant. On `midtown-office` under `nearest-car` at 12 % arrivals
   * with a 60 s mean patience, withdrawing the call boards **258** legs against **251**, abandons
   * **437** against **444** and drives **3 323 m** against **3 409 m** — a car released to work
   * that still exists instead of committed to a landing nobody is standing on. The cell is
   * `nearest-car`'s rather than `eta`'s deliberately: `eta` re-scores often enough that the two
   * arms coincide there, and a test pinned to the arm where a mechanism happens to be invisible
   * is a test that cannot fail on the thing it exists for.
   */
  it('takes the call back when the landing empties', async () => {
    const config = await load();
    const building = config.buildingsById.get('midtown-office');
    const dispatcherProfile = config.dispatcherProfilesById.get('nearest-car');
    if (building === undefined || dispatcherProfile === undefined) throw new Error('fixtures');
    const result = runSimulation({
      building,
      dispatcherProfile,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
      seed: SEED,
      demand: { arrivalRatePctPop5min: 12 },
      reportWindow: 'full-run',
      onTimeout: 'report',
      patience: { distribution: 'exponential', meanS: 60 },
    });
    expect(result.conservation.callsWithdrawn ?? 0).toBeGreaterThan(0);
    // The measured consequence, pinned: more people boarded and fewer left than the arm that
    // leaves the button lit. Both halves, because a withdrawal that only moved the travel figure
    // would be a cost with no benefit.
    expect(result.summary.counts.boarded).toBe(258);
    expect(result.conservation.abandoned).toBe(437);
  }, 300_000);

  it('reports `abandoned: 0` when the question was asked and nobody left', async () => {
    // The distinction the spread-or-omit rule buys: absent means "never asked", present-and-zero
    // means "asked, and nobody's patience ran out". A run at a comfortable load with an hour of
    // patience is the second.
    const calm = await run({ distribution: 'exponential', meanS: 3600 }, { demand: {} });
    expect(calm.conservation.abandoned).toBe(0);
    expect(calm.summary.abandonment).toBeUndefined();
  }, 300_000);

  /* ---- criterion 4: reported beside AWT, never folded into it ---- */

  /**
   * **The trap, caught in the act.**
   *
   * This is the assertion the whole feature is judged on. A configuration that abandons riders
   * posts a *better* AWT than the same configuration that does not, because the waits it removes
   * from the sample are the longest ones. If that improvement could be read without the count
   * beside it, this feature would be a way of making any building look good.
   */
  it('shows AWT improving while the served-leg count falls', async () => {
    const stoic = await run();
    const leaving = await run({ distribution: 'exponential', meanS: 45 });

    // Fewer people served — the population is genuinely different.
    expect(servedLegsOf(leaving)).toBeLessThan(servedLegsOf(stoic));
    // …and the mean of the survivors is better. Both halves, or the trap is not demonstrated.
    expect(leaving.summary.waiting.meanS).toBeLessThan(stoic.summary.waiting.meanS);
    // …and the run says so, in the same summary, beside the mean it flattered.
    const abandonment = leaving.summary.abandonment;
    expect(abandonment).toBeDefined();
    expect(abandonment?.count).toBeGreaterThan(0);
    expect(abandonment?.fraction).toBeGreaterThan(0);
    expect(abandonment?.arrivalCount).toBe(leaving.summary.waiting.arrivalCount);
  }, 300_000);

  /**
   * The fifth `awtIsValid` ground, reached through a real run rather than through hand-built
   * evidence. `metrics/awtValidity.test.ts` pins the sentence; this proves a run can produce it.
   */
  it('suppresses the mean outright once too many riders leave', async () => {
    const leaving = await run({ distribution: 'exponential', meanS: 45 });
    expect((leaving.summary.abandonment?.fraction ?? 0)).toBeGreaterThan(0.02);
    expect(leaving.summary.awtIsValid).toBe(false);
    expect(leaving.summary.awtInvalidGround).toBe('abandoned');
    expect(leaving.summary.awtInvalidReason ?? '').toContain('gave up and left');
  }, 300_000);

  /* ---- common random numbers: who leaves is a fact about the crowd ---- */

  /**
   * **The property the pre-drawn table exists for** (`sim/patience.ts`).
   *
   * Two arms that differ only in the dispatcher must lose the same people's *willingness*, or
   * the paired comparison is taken over two different populations. Drawing patience as legs
   * reached landings would break this the moment one dispatcher reordered a transfer.
   */
  it('gives the same crowd the same patience whatever the dispatcher does', async () => {
    const config = await load();
    const building = config.buildingsById.get('garden-apartments');
    const eta = config.dispatcherProfilesById.get('eta');
    const nearest = config.dispatcherProfilesById.get('nearest-car');
    if (building === undefined || eta === undefined || nearest === undefined) {
      throw new Error('fixtures');
    }
    const patience: PatienceConfig = { distribution: 'exponential', meanS: 45 };
    const base = {
      building,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
      seed: SEED,
      demand: PRESSED,
      reportWindow: 'full-run',
      onTimeout: 'report',
      patience,
    } as const;

    const armA = runSimulation({ ...base, dispatcherProfile: eta });
    const armB = runSimulation({ ...base, dispatcherProfile: nearest });

    // The dispatchers really are different — otherwise the claim below is about one run.
    expect(armA.summary.waiting.meanS).not.toBe(armB.summary.waiting.meanS);

    // The *drawn* patience is identical leg for leg. Read off the first leg of every journey,
    // where the arrival instant is the trace's and the wait is the dispatcher's: the patience a
    // leg was given is `abandonedAt - arrivedAt` for anybody who used it up, and a rider served
    // in arm A and abandoned in arm B is exactly the divergence this is checking is *permitted*.
    // So the invariant asserted is the stronger, dispatcher-free one: the same journey ids are
    // eligible, and a journey that abandons in both arms did so after the same interval.
    const intervalByJourney = (result: SimulationResult): Map<string, number> => {
      const map = new Map<string, number>();
      for (const leg of result.record.passengers) {
        if (leg.abandonedAt === undefined || leg.legIndex !== 0) continue;
        map.set(leg.journeyId, Number((leg.abandonedAt - leg.arrivedAt).toFixed(9)));
      }
      return map;
    };
    const a = intervalByJourney(armA);
    const b = intervalByJourney(armB);
    const shared = [...a.keys()].filter((id) => b.has(id));
    expect(shared.length).toBeGreaterThan(0);
    for (const id of shared) expect(b.get(id)).toBe(a.get(id));
  }, 300_000);

  /* ---- invariant 8: the knobs are declared ---- */

  it('refuses a curve that would abandon everybody at the instant they arrive', async () => {
    await expect(run({ distribution: 'exponential', meanS: 0 })).rejects.toThrow(
      /sim\.patience\.meanS/,
    );
    await expect(
      run({ distribution: 'uniform', meanS: 10, spreadS: 20 }),
    ).rejects.toThrow(/sim\.patience\.spreadS/);
  }, 300_000);
});
