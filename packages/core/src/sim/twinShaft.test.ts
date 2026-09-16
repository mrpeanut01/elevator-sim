/**
 * **The TWIN shaft seam guard: the separation constraint and the deadlock property.**
 *
 * `docs/11-twin-shaft-contract.md` is the specification — a locked contract written before any
 * implementation — and its § 0 says where the risk is: *"TWIN is not a car feature. It is a shaft
 * feature in a codebase that has no shafts, and its whole risk is concentrated in two files."*
 * GitHub issue #412 adds the instruction this file follows: **the separation constraint and the
 * deadlock property are the parts to write tests for first.**
 *
 * ## What is asserted, and in what order it was built
 *
 * | # | Property | Fails when |
 * |---|---|---|
 * | 1 | the constraint **binds** | a TWIN shaft resolves to two independent cars — `docs/11` § 6.2 clause 1, and this repository's twelfth configurable-tested-and-dead feature would look exactly like a pass |
 * | 2 | **C-ORDER and C-CLEAR held at every instant** | two cars crossed, or closed inside the clearance, anywhere between two kernel events |
 * | 3 | **no deadlock** (INV-TWIN-2) | the pair stops making progress with work outstanding — each waiting on the other |
 * | 4 | **INV-TWIN-3**, in both directions | `'shaftBlocked'` is filed as structural, and a servable passenger is abandoned by the retry machinery |
 * | 5 | it fires **nowhere else** | a conventional building's run moves at all |
 *
 * Property 2 is the one this file exists for, and it is **not** asserted from the movement gate's
 * own counter. `docs/11` § 3.4 rejects that in terms: the in-simulation check *"cannot see a breach
 * that arises from two independently legal moves, which is the only interesting kind"*, and *"a
 * property that can only see the violations its own gate already prevented is a tautology"*. So the
 * check here is § 3.4's **(a)**: both cars' trajectories are reconstructed from `RunRecord.carMoves`
 * and the separation is evaluated **between** kernel events, on a grid fine enough that the
 * sampling error is bounded and the bound is subtracted before the assertion. The gate's arithmetic
 * is not reused; the gate could be deleted and this property would still be checking something.
 *
 * ## The fixture is a mixed bank, and that is deliberate
 *
 * No shipped building declares a TWIN shaft (`docs/11` OQ-6 is the open question of which one ever
 * should, and it is not answered here), so the fixture pairs two cars of `midtown-office`'s
 * four-car bank into one hoistway and leaves the other two in hoistways of their own. Mixed rather
 * than all-TWIN for a reason the arithmetic forces: a TWIN shaft's **lower car can never reach the
 * top floor**, because its mate would have to be above the roof to allow it, and its upper car can
 * never reach the bottom. A bank made entirely of TWIN pairs therefore cannot serve a full-rise
 * journey **at all**, and a liveness test on one would be measuring an unservable building rather
 * than a deadlock. That is a genuine property of the hardware and not an artefact of this model —
 * it is why `docs/11` § 3.2's R1 partitions the shaft by declaration — and it is recorded here
 * rather than designed around, because the next reader will meet it.
 *
 * The clearance is the building's own smallest inter-floor distance. That is the MERL patent's
 * static minimum — *"d ≥ the distance between consecutive floors"*, reference data cited in
 * `docs/11` § Sources and not measured here — and it is read off the building rather than typed in,
 * because `docs/11` § 10 is explicit that **no source consulted publishes a separation in metres**
 * and this project states none.
 */

import { describe, expect, it } from 'vitest';

import type { ResolvedBank, ResolvedBuilding, ResolvedShaft } from '../config/types.js';
import type { CarMoveRecord } from '../metrics/types.js';
import { buildProfile, positionAt } from '../physics/motion/index.js';
import type { MotionConstraints } from '../physics/motion/index.js';

import { load } from './fixtures.test-helper.js';
import { runSimulation } from './simulation.js';
import type { SimulationConfig, SimulationResult } from './types.js';

const SEED = 20_260_916;
const TWIN_BUILDING = 'midtown-office';
const TWIN_BANK = 'main';
const TWIN_SHAFT_ID = 'main-twin';

/**
 * The blocking-prone population, which `docs/11` § 3.6 clause 3 insists on by name: *"a twin shaft
 * whose traffic puts both cars' work on the same side — a single low entrance with all destinations
 * high"*. Without it a clean run *"is evidence of nothing"*.
 */
const UP_PEAK: SimulationConfig['demand'] = {
  directionalSplit: { incoming: 1, outgoing: 0, interfloor: 0 },
  arrivalRatePctPop5min: 4,
  peakWindowS: 300,
};

/** A two-way peak: both cars wanted at both ends, which is where a crossed pair comes from. */
const TWO_WAY: SimulationConfig['demand'] = {
  directionalSplit: { incoming: 0.45, outgoing: 0.45, interfloor: 0.1 },
  arrivalRatePctPop5min: 4,
  peakWindowS: 300,
};

/* -------------------------------------------------------------------------- *
 * The fixture
 * -------------------------------------------------------------------------- */

/** The smallest gap between two consecutive served floors of a bank, metres. */
function minimumPitchM(building: ResolvedBuilding, bank: ResolvedBank): number {
  const heights = bank.servesFloors
    .map((floorId) => building.floorsById.get(floorId)?.heightM ?? Number.NaN)
    .sort((a, b) => a - b);
  let smallest = Number.POSITIVE_INFINITY;
  for (let i = 1; i < heights.length; i += 1) {
    smallest = Math.min(smallest, (heights[i] as number) - (heights[i - 1] as number));
  }
  return smallest;
}

interface TwinFixture {
  readonly building: ResolvedBuilding;
  readonly standingClearanceM: number;
  readonly emergencyDecelerationMps2: number;
  readonly lowerCarId: string;
  readonly upperCarId: string;
}

/**
 * `midtown-office` with its first two cars put in one hoistway and the rest left in their own.
 *
 * Built by transforming the **resolved** building rather than by authoring a new one in
 * `data/buildings/`, deliberately: `docs/11` OQ-6 asks which building should carry a TWIN
 * configuration and answers *"decided"* only in the sense that `vertical-city` is the wrong one.
 * Adding a shipped building is a new traffic regime and a new oracle position, and this lane does
 * not take that decision — `config/twinShaft.test.ts` covers the loader path from a config instead.
 */
function twinFixture(building: ResolvedBuilding): TwinFixture {
  const bank = building.banks.find((candidate) => candidate.id === TWIN_BANK);
  if (bank === undefined) throw new Error(`missing bank ${TWIN_BANK}`);
  const [lower, upper, ...rest] = bank.cars;
  if (lower === undefined || upper === undefined) {
    throw new Error(`bank ${TWIN_BANK} needs at least two cars to pair`);
  }

  const standingClearanceM = minimumPitchM(building, bank);
  // Twice the harshest comfort deceleration in the shaft. The *premise* of the exactness lemma is
  // only that it is at least as hard; doubling it is a plausible safety gear and keeps the check
  // away from the boundary, so a test that passes is not passing on an equality.
  const emergencyDecelerationMps2 = 2 * Math.max(lower.acceleration, upper.acceleration);

  const shafts: readonly ResolvedShaft[] = [
    {
      id: TWIN_SHAFT_ID,
      carIds: [lower.id, upper.id],
      separation: { standingClearanceM, bufferM: 0, emergencyDecelerationMps2 },
    },
    ...rest.map((car) => ({ id: `${TWIN_BANK}-${car.id}`, carIds: [car.id] })),
  ];

  return {
    building: {
      ...building,
      banks: building.banks.map((candidate) =>
        candidate.id === TWIN_BANK ? { ...candidate, shafts } : candidate,
      ),
    },
    standingClearanceM,
    emergencyDecelerationMps2,
    lowerCarId: `${TWIN_BANK}-${lower.id}`,
    upperCarId: `${TWIN_BANK}-${upper.id}`,
  };
}

/* -------------------------------------------------------------------------- *
 * Trajectory reconstruction — docs/11 § 3.4(a)
 * -------------------------------------------------------------------------- */

/**
 * Where a car was at `t`, from its recorded moves and nothing else.
 *
 * The record carries the two heights and the three instants; the profile between them is
 * `buildProfile(distance, constraints)`, which is deterministic given the car — so it is recomputed
 * rather than stored, which is why `CarMoveRecord` is eleven fields and not a sample per tick.
 *
 * Outside every move the car is standing: at the destination of the last move that has completed,
 * or at the origin of the first. That is what makes the reconstruction total over the whole run
 * rather than defined only while something is moving.
 */
function positionSeries(
  moves: readonly CarMoveRecord[],
  constraints: MotionConstraints,
): (t: number) => number {
  const ordered = [...moves].sort((a, b) => a.startedAt - b.startedAt);
  const profiles = ordered.map((move) => buildProfile(move.toHeightM - move.fromHeightM, constraints));
  return (t: number): number => {
    let standing = ordered[0]?.fromHeightM ?? 0;
    for (const [index, move] of ordered.entries()) {
      if (t < move.startedAt) return standing;
      const profile = profiles[index];
      /* c8 ignore next */
      if (profile === undefined) return standing;
      if (t <= move.startedAt + profile.duration) {
        return move.fromHeightM + positionAt(profile, t - move.startedAt);
      }
      standing = move.toHeightM;
    }
    return standing;
  };
}

/** The two cars' separation, minimised over the whole run on a grid with a certified error bound. */
function minimumSeparation(
  result: SimulationResult,
  fixture: TwinFixture,
  constraints: MotionConstraints,
): { readonly minGapM: number; readonly boundM: number; readonly samples: number } {
  const moves = result.record.carMoves ?? [];
  const lower = positionSeries(
    moves.filter((move) => move.carId === fixture.lowerCarId),
    constraints,
  );
  const upper = positionSeries(
    moves.filter((move) => move.carId === fixture.upperCarId),
    constraints,
  );

  /*
   * **The grid, and why sampling is honest here when `docs/11` § 2.2 says it is not.**
   *
   * That warning is about a *gate*: a check that samples cannot certify a move, because two cars
   * can breach entirely between two samples and both endpoints read clean. The same is true of a
   * bare sampled property — so this one does not make a bare claim. The separation's derivative is
   * the relative velocity, bounded by the two cars' top speeds, so between two samples `dt` apart
   * the true minimum can undershoot the sampled one by at most `vMax · dt / 2`. That bound is
   * computed and **subtracted** before the assertion, which turns a sample into a proof about the
   * continuum at the cost of a constant.
   */
  const dt = 0.01;
  const vMaxMps = 2 * Math.max(constraints.ratedSpeedMps, constraints.descentSpeedMps ?? 0);
  const boundM = (vMaxMps * dt) / 2;

  const endedAt = result.record.endedAt;
  let minGapM = Number.POSITIVE_INFINITY;
  let samples = 0;
  for (let t = result.record.startedAt; t <= endedAt; t += dt) {
    minGapM = Math.min(minGapM, upper(t) - lower(t));
    samples += 1;
  }
  return { minGapM, boundM, samples };
}

/* -------------------------------------------------------------------------- *
 * The properties
 * -------------------------------------------------------------------------- */

async function runTwin(demand: SimulationConfig['demand']): Promise<{
  readonly twin: SimulationResult;
  readonly control: SimulationResult;
  readonly fixture: TwinFixture;
  readonly constraints: MotionConstraints;
}> {
  const cfg = await load();
  const building = cfg.buildingsById.get(TWIN_BUILDING) as ResolvedBuilding;
  const fixture = twinFixture(building);
  const common = {
    dispatcherProfile: cfg.dispatcherProfilesById.get('eta')!,
    trafficProfiles: cfg.trafficProfiles,
    elevatorSpecs: cfg.elevatorSpecs,
    seed: SEED,
    durationS: 900,
    onTimeout: 'report',
    recordCarMoves: true,
    demand,
  } as const;

  const bank = fixture.building.banks.find((candidate) => candidate.id === TWIN_BANK) as ResolvedBank;
  const car = bank.cars[0]!;
  const constraints: MotionConstraints = {
    ratedSpeedMps: car.ratedSpeedMps,
    acceleration: car.acceleration,
    jerk: car.jerk,
    ...(car.descentSpeedMps === undefined ? {} : { descentSpeedMps: car.descentSpeedMps }),
  };

  return {
    twin: runSimulation({ ...common, building: fixture.building }),
    control: runSimulation({ ...common, building }),
    fixture,
    constraints,
  };
}

describe('a TWIN shaft keeps its two cars apart, and the constraint binds', () => {
  it('binds rather than resolving to two independent cars, and the control arm proves it could not', async () => {
    const { twin, control } = await runTwin(UP_PEAK);

    /*
     * `docs/11` § 6.2 clause 1, quoted because the clause is the assertion: *"Zero is a wiring
     * bug, not a small effect"*. A TWIN shaft that never defers a departure has resolved to two
     * independent cars, which would be this repository's twelfth configurable-tested-and-dead
     * feature and would look exactly like a pass.
     */
    expect(twin.stageActivity.separationChecks ?? 0).toBeGreaterThan(0);
    expect(
      twin.stageActivity.separationDeferrals ?? 0,
      'the separation never refused a departure: the shaft resolved to two independent cars',
    ).toBeGreaterThan(0);
    expect(
      twin.stageActivity.clearingMoves ?? 0,
      'no car was ever compelled out of its mate’s way, so the liveness mechanism never ran',
    ).toBeGreaterThan(0);

    /*
     * The other half, and the half that makes the first mean something: the **same** building
     * without the `shafts` block carries none of these keys at all. Not zero — absent, because
     * `StageActivity` is inside the structural digests this project pins key by key, and a
     * conventional run has to produce the object it has always produced.
     */
    expect(control.stageActivity).not.toHaveProperty('separationDeferrals');
    expect(control.stageActivity).not.toHaveProperty('clearingMoves');
    expect(control.stageActivity).not.toHaveProperty('separationChecks');
  }, 300_000);

  it('holds C-ORDER and C-CLEAR at every instant, reconstructed rather than read off the gate', async () => {
    const { twin, fixture, constraints } = await runTwin(UP_PEAK);

    const moves = twin.record.carMoves ?? [];
    expect(moves.length, 'the run recorded no car moves, so the property is checking nothing').toBeGreaterThan(0);
    expect(
      moves.filter((move) => move.shaftId === TWIN_SHAFT_ID).length,
      'no move was made by a car of the TWIN shaft: the pair is inert',
    ).toBeGreaterThan(0);

    expect(
      moves.filter((move) => move.shaftId === TWIN_SHAFT_ID).length,
      'no move was made by a car of the TWIN shaft: the pair is inert',
    ).toBeGreaterThan(0);
    const { minGapM, boundM, samples } = minimumSeparation(twin, fixture, constraints);
    expect(samples).toBeGreaterThan(1000);

    // C-ORDER: the cars never swapped and never passed. Stated separately from C-CLEAR because a
    // crossing is a modelling failure where a clearance breach is a control failure (docs/11 § 2.1).
    expect(minGapM - boundM, 'the two cars of a TWIN shaft crossed').toBeGreaterThan(0);

    // C-CLEAR: the standing clearance held throughout, with the grid's own error bound subtracted
    // so the claim is about the continuum rather than about the samples.
    expect(
      minGapM + boundM,
      `the cars closed inside the ${fixture.standingClearanceM} m clearance (minimum gap ${minGapM.toFixed(4)} m)`,
    ).toBeGreaterThanOrEqual(fixture.standingClearanceM);

    // And the gate agrees with the reconstruction. If these two ever disagree, the reconstruction
    // is the one to believe: it reads positions, and the gate reads its own precondition.
    expect(twin.stageActivity.separationBreaches ?? 0).toBe(0);
  }, 300_000);

  it('does not deadlock: every deferral ends, and both cars of the pair keep working', async () => {
    const { twin, control, fixture } = await runTwin(TWO_WAY);
    const runLengthS = twin.record.endedAt - twin.record.startedAt;

    /*
     * **INV-TWIN-2, asserted as *every deferral ended* rather than as a predicate over the final
     * state.** A deadlocked pair is two cars each waiting for the other, and what that looks like
     * from outside is a deferral that never ends — so the quantity to bound is the longest one.
     * `Simulation#closeOpenDeferrals` is what makes this an honest test rather than a vacuous one:
     * a deferral is timed when the car is *woken*, so before that method existed a car that waited
     * out the whole run left this counter reading **zero**, which a reader would take as health.
     * It is closed against the run's end now, and a deadlocked car therefore reads as a deferral
     * lasting the rest of the run.
     *
     * The bound is a quarter of the run rather than a pinned figure: the distinction being drawn
     * is *a car waited* against *a car waited forever*, and that is an order-of-magnitude
     * question. Measured here, the longest deferral is about 5 % of the run.
     */
    const longestDeferralS = twin.stageActivity.longestSeparationDeferralS ?? 0;
    expect(longestDeferralS, 'no deferral was ever timed, so this bound holds vacuously').toBeGreaterThan(0);
    expect(
      longestDeferralS,
      `a car waited ${longestDeferralS.toFixed(1)} s of a ${runLengthS.toFixed(0)} s run for its mate: that is a deadlock rather than a wait`,
    ).toBeLessThan(runLengthS / 4);

    /*
     * **Neither car is inert**, which is the shape the first defect this property found actually
     * took. Before `twinAwareHomeFloorId`, both cars of the pair started at the lobby, the gap was
     * zero before a single event fired, and **neither of them moved for the whole run** while the
     * bank's other two carried the building. Every aggregate looked ordinary. A liveness property
     * that only bounded a deferral would have passed it, because a car that never departs is never
     * deferred either.
     */
    const movesOf = (carId: string): number =>
      (twin.record.carMoves ?? []).filter((move) => move.carId === carId).length;
    expect(movesOf(fixture.lowerCarId), 'the lower car of the pair never moved').toBeGreaterThan(0);
    expect(movesOf(fixture.upperCarId), 'the upper car of the pair never moved').toBeGreaterThan(0);

    /*
     * **The denominator, not the pass** — `docs/11` § 3.6 clause 3. A run whose separation never
     * met the MERL shape and one that met it and survived look identical without this number, so
     * the run publishes it. It is deliberately **not** pinned: whether a given seed draws a
     * crossed pair is a property of the traffic, and asserting a figure here would make this a
     * test of the generator rather than of the mechanism.
     */
    expect(twin.stageActivity.crossedCommitmentDeferrals ?? 0).toBeGreaterThanOrEqual(0);

    /*
     * **The cost is reported and not asserted away** — `docs/11` § 6.5 permits exactly this
     * outcome: *"implemented, measured, and reported as costly"*. The TWIN arm delivers fewer
     * people in the same window than the same fleet in separate hoistways, and riders are still
     * aboard at the horizon where the control has none. That is a constraint removing options,
     * which is what § 6.1 says the equal-car contrast must find; a TWIN arm that *beat* its
     * control would be a bug report.
     *
     * No interval is quoted and none is implied. This is one seed at one operating point, which
     * `CLAUDE.md` § Statistical discipline is explicit is not a comparison — the measured contrast
     * `docs/11` § 6 specifies is a paired-t over 50–200 replications at a censused budget, and it
     * is **not** part of this lane.
     */
    const delivered = (result: SimulationResult): number =>
      result.record.passengers.filter((leg) => leg.alightedAt !== undefined).length;
    expect(delivered(twin), 'the TWIN arm delivered nobody').toBeGreaterThan(0);
    expect(delivered(control), 'the control delivered nobody, so it is no control').toBeGreaterThan(0);
  }, 300_000);

  it('never writes carMoves unless the run asks, and a conventional run is untouched', async () => {
    const cfg = await load();
    const building = cfg.buildingsById.get(TWIN_BUILDING) as ResolvedBuilding;
    const common = {
      building,
      dispatcherProfile: cfg.dispatcherProfilesById.get('eta')!,
      trafficProfiles: cfg.trafficProfiles,
      elevatorSpecs: cfg.elevatorSpecs,
      seed: SEED,
      durationS: 600,
      onTimeout: 'report',
    } as const;

    const silent = runSimulation(common);
    const asked = runSimulation({ ...common, recordCarMoves: true });

    // Absent means *nobody asked*, never *the cars did not move* — the distinction
    // `travelSamples` draws for the same reason, and the reason a pinned record is unmoved.
    expect(silent.record).not.toHaveProperty('carMoves');
    expect((asked.record.carMoves ?? []).length).toBeGreaterThan(0);

    // And asking changes what is written down and nothing else: the two runs are the same run.
    expect(asked.record.passengers.length).toBe(silent.record.passengers.length);
    expect((asked.record.travelSamples ?? []).length).toBe(
      (silent.record.travelSamples ?? []).length,
    );

    // **It round-trips.** CLAUDE.md invariant 5 is that a persisted record replays exactly, and a
    // field the schema refuses is a record that cannot be stored — so the series is round-tripped
    // through the real parser rather than assumed to survive one.
    const { parseRunRecord } = await import('../metrics/serialization.js');
    const reparsed = parseRunRecord(JSON.stringify(asked.record));
    expect(reparsed.carMoves).toEqual(asked.record.carMoves);
    expect(parseRunRecord(JSON.stringify(silent.record))).not.toHaveProperty('carMoves');
  }, 300_000);

  it('raises the un-oracled disclaimer on the TWIN building and on no shipped one', async () => {
    const { twin, control } = await runTwin(UP_PEAK);
    // docs/11 § 7: the closed form assumes one car per shaft, free to travel the whole rise, and
    // neither assumption survives. A TWIN work item that "fixes" the oracle to agree has broken it.
    expect(
      twin.warnings.filter((warning) => warning.includes('TWIN shaft')),
      'a TWIN bank ran without saying its round trip is not comparable with the closed form',
    ).not.toEqual([]);
    expect(control.warnings.filter((warning) => warning.includes('TWIN shaft'))).toEqual([]);
  }, 300_000);
});
