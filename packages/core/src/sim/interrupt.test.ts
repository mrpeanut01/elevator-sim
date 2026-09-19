/**
 * **A run you can stop is the same run as one you cannot.**
 *
 * `Simulation.advanceTo` exists so that a player can act *during* a day rather than only before
 * it (`docs/43` P1, `docs/16` § 1). The whole value of that depends on one claim, and this file
 * is that claim: **a run advanced in N chunks produces a byte-identical `RunRecord` to the same
 * run advanced in one call**, for every chunking, on the same seed.
 *
 * Not "statistically equivalent" and not "equivalent up to floating point". The same bytes. A
 * simulator whose answer depends on when you looked at it is worse than one you cannot look
 * into: every paired-t interval this project publishes assumes two arms differ *only* by the
 * thing under test, and a record that moved because a renderer paused at 300 s instead of 301 s
 * would put an unattributable difference underneath all of them. This is `CLAUDE.md` invariant 5
 * — *every persisted run record carries its seed, so any run replays exactly* — under a caller
 * who interrupts.
 *
 * ## How it is proved
 *
 * sha-256 over the serialized record, which is the same instrument the engine assessor used to
 * establish plain replay (identical seeds agree bit for bit; a different seed does not). Two
 * digests are taken per run: the **record** alone, which is what invariant 5 is about and what
 * gets persisted, and the **result**, which additionally carries the summary, the conservation
 * audit, the warnings and `stageActivity` — so a chunking that moved a counter without moving a
 * passenger would still be caught.
 *
 * ## The chunkings, and why these ones
 *
 * | chunking | what it is for |
 * |---|---|
 * | one call | the baseline every other digest is compared against |
 * | 60 s, 1 s, 0.37 s | ordinary stepping, down to finer than a door dwell |
 * | π·1.7 s | an irrational step, so no boundary coincides with an authored time |
 * | the record's own event times | the opposite case — every boundary lands *exactly* on an event |
 * | one boundary at 0.5·horizon | the single pause, which is what a paused game actually does |
 * | far past the end | catches a clock parked at `until` rather than at the last event |
 * | 0 s, then stepping | a boundary before anything has happened |
 *
 * The fine and irrational steps are what cover "mid-event" and "mid-dwell", and the test does not
 * take that on trust — {@link assertCutsMidFlightAndMidDwell} reads the baseline record and
 * asserts that boundaries really do fall strictly inside a car's flight and strictly inside a
 * single stop's boarding, rather than only between them.
 *
 * ## What would make this file vacuous
 *
 * A digest function that hashed nothing, or a chunking list that was really one chunking. Both
 * are guarded: the last test in the file shows a different seed producing a different digest, and
 * every chunking is asserted to produce at least two boundaries before it is used.
 */

import { createHash } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import type { LoadedConfig, SimulationResult } from '../index.js';
// `RunRecord.carMoves` is public and its element type is not re-exported from the package root,
// so this reaches for it where it is declared. Noted rather than fixed: widening `src/index.ts`
// is another lane's surface, and this file only needs to read the series.
import type { CarMoveRecord } from '../metrics/types.js';

import { load } from './fixtures.test-helper.js';
import { Simulation } from './simulation.js';
import { SimulationError } from './types.js';
import type { SimulationConfig } from './types.js';

let config: LoadedConfig;

beforeAll(async () => {
  config = await load();
}, 60_000);

function configFor(
  buildingId: string,
  profileId: string,
  seed: number,
  overrides: Partial<SimulationConfig> = {},
): SimulationConfig {
  const building = config.buildingsById.get(buildingId);
  const dispatcherProfile = config.dispatcherProfilesById.get(profileId);
  if (building === undefined) throw new Error(`no building "${buildingId}"`);
  if (dispatcherProfile === undefined) throw new Error(`no profile "${profileId}"`);
  return {
    building,
    dispatcherProfile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed,
    onTimeout: 'report',
    ...overrides,
  };
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** What invariant 5 is about: the thing that gets persisted and replayed. */
const recordDigest = (result: SimulationResult): string => sha256(JSON.stringify(result.record));

/**
 * Everything a caller can observe, so a chunking that moved a counter rather than a passenger is
 * still caught. `trace` is excluded only because it is settled in the constructor and therefore
 * cannot be a function of the chunking; `streams` is checked separately and more sharply.
 */
const resultDigest = (result: SimulationResult): string =>
  sha256(
    JSON.stringify({
      status: result.status,
      seed: result.seed,
      endedAt: result.endedAt,
      demandEndedAt: result.demandEndedAt,
      deadlineS: result.deadlineS,
      events: result.events,
      record: result.record,
      summary: result.summary,
      reportWindow: result.reportWindow,
      conservation: result.conservation,
      undelivered: result.undelivered,
      warnings: result.warnings,
      stageActivity: result.stageActivity,
      comparability: result.comparability,
    }),
  );

/** Run in one call — the baseline. */
function runWhole(request: SimulationConfig): SimulationResult {
  return new Simulation(request).run();
}

/** Run in chunks, pausing at every boundary in `boundaries`, then finishing. */
function runChunked(request: SimulationConfig, boundaries: readonly number[]): SimulationResult {
  const sim = new Simulation(request);
  for (const at of boundaries) sim.advanceTo(at);
  return sim.finish();
}

const stepsOf = (horizonS: number, stepS: number): readonly number[] => {
  const boundaries: number[] = [];
  for (let at = stepS; at < horizonS; at += stepS) boundaries.push(at);
  return boundaries;
};

/**
 * **The mechanical form of "mid-event and mid-dwell"**, so the claim is measured rather than
 * argued from arithmetic about step sizes.
 *
 * Passenger records cannot show this and it is worth saying why: everything that happens at a
 * stop — every alighting and every boarding — is recorded at **one instant**, so no interval
 * between two passenger timestamps is a dwell. `CarMoveRecord` is the series that does have the
 * intervals, which is why the case that drives this asks for `recordCarMoves`.
 *
 * *Mid-flight*: a boundary strictly between a move's `startedAt` and its `arrivesAt` — the clock
 * stopped with a car between floors, under power.
 *
 * *Mid-dwell*: a boundary strictly between one move's `arrivesAt` and the next move's
 * `commandedAt` **at the same floor** — the clock stopped with the car standing at a landing, its
 * doors cycling, its next destination not yet commanded.
 */
function assertCutsMidFlightAndMidDwell(
  moves: readonly CarMoveRecord[],
  boundaries: readonly number[],
  label: string,
): void {
  const midFlight = moves.some((m) => boundaries.some((at) => at > m.startedAt && at < m.arrivesAt));
  expect(midFlight, `${label}: no boundary falls inside a car's flight`).toBe(true);

  const byCar = new Map<string, CarMoveRecord[]>();
  for (const move of moves) {
    const list = byCar.get(move.carId);
    if (list === undefined) byCar.set(move.carId, [move]);
    else list.push(move);
  }
  let dwellsCut = 0;
  for (const list of byCar.values()) {
    const sorted = [...list].sort((a, b) => a.commandedAt - b.commandedAt);
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1] as CarMoveRecord;
      const next = sorted[index] as CarMoveRecord;
      if (previous.toFloorId !== next.fromFloorId) continue;
      if (next.commandedAt <= previous.arrivesAt) continue;
      if (boundaries.some((at) => at > previous.arrivesAt && at < next.commandedAt)) dwellsCut += 1;
    }
  }
  expect(dwellsCut, `${label}: no boundary falls inside a dwell at a landing`).toBeGreaterThan(0);
}

/* -------------------------------------------------------------------------- *
 * The binding proof
 * -------------------------------------------------------------------------- */

interface Case {
  readonly label: string;
  /** Built inside the test, never at collection time: `beforeAll` has not loaded `data/` yet. */
  readonly request: () => SimulationConfig;
  readonly horizonS: number;
  /** Whether this case asks for the car-move series, and therefore carries the cut assertions. */
  readonly carMoves?: boolean;
}

const CASES: readonly Case[] = [
  {
    // The reference building for every determinism claim in this package.
    label: 'midtown-office / collective',
    request: () => configFor('midtown-office', 'collective', 20260919, { durationS: 900 }),
    horizonS: 900,
  },
  {
    /*
     * **The profile that cancels events mid-flight** (`DECISIONS.md` § D205). Cancellation is
     * the one kernel operation that could plausibly interact with a chunk boundary: a cancelled
     * slot keeps its `(time, sequence)` position so surviving events fire in the order a run
     * that never scheduled it would, and a bounded drain has to leave that property alone.
     * `sim/determinism.test.ts` proves plain replay here; this proves interrupted replay.
     */
    label: 'midtown-office / collective-enroute (cancels mid-flight)',
    request: () =>
      configFor('midtown-office', 'collective-enroute', 20260919, {
        demand: {
          directionalSplit: { incoming: 0, outgoing: 1, interfloor: 0 },
          arrivalRatePctPop5min: 5,
          peakWindowS: 300,
        },
        durationS: 900,
      }),
    horizonS: 900,
  },
  {
    // A second building, a second dispatcher, a different floor count and a different demand
    // shape — so the claim is not a property of one tower's event mix.
    label: 'garden-apartments / eta',
    request: () => configFor('garden-apartments', 'eta', 20260919, { durationS: 900 }),
    horizonS: 900,
  },
  {
    /*
     * **The sharpest of the four, and the only one that can prove where the cuts land.**
     * `recordCarMoves` writes a per-move series — commanded, started, levelled, from, to, by
     * hoistway — so the digest here covers the *motion* of every car rather than only what
     * happened to the passengers, and a chunking that nudged a car and put it back would be
     * caught here and nowhere else. It is also the only record in the tree with a dwell in it,
     * which is what {@link assertCutsMidFlightAndMidDwell} needs.
     */
    label: 'midtown-office / collective with the car-move series',
    request: () =>
      configFor('midtown-office', 'collective', 20260919, {
        durationS: 900,
        recordCarMoves: true,
      }),
    horizonS: 900,
    carMoves: true,
  },
];

describe('a run advanced in chunks is bit-identical to one advanced in a single call', () => {
  it.each(CASES.map((c) => [c.label, c] as const))(
    '%s',
    (label, testCase) => {
      const { horizonS } = testCase;
      const request = testCase.request();

      const whole = runWhole(request);
      const expectedRecord = recordDigest(whole);
      const expectedResult = resultDigest(whole);

      const chunkings: ReadonlyArray<readonly [string, readonly number[]]> = [
        ['every 60 s', stepsOf(horizonS, 60)],
        ['every 1 s', stepsOf(horizonS, 1)],
        ['every 0.37 s — finer than a door dwell', stepsOf(horizonS, 0.37)],
        ['every π·1.7 s — no boundary on an authored time', stepsOf(horizonS, Math.PI * 1.7)],
        [
          // The opposite case to the irrational step: every boundary lands *exactly* on an
          // instant the run itself produced, which is where an off-by-one in `<=` versus `<`
          // inside the bounded drain would show up and nowhere else.
          "the record's own event times",
          [
            ...new Set(
              whole.record.passengers.flatMap((p) =>
                [p.arrivedAt, p.boardedAt, p.alightedAt].filter(
                  (t): t is number => t !== undefined,
                ),
              ),
            ),
          ].sort((a, b) => a - b),
        ],
        ['one pause at half the horizon', [horizonS / 2]],
        [
          // A boundary before anything has happened, one in the middle, and one far past the end
          // of the day. The last is what catches a clock parked at `until` rather than at the
          // last event the run dispatched.
          '0 s, mid-run, then far past the end',
          [0, horizonS / 3, horizonS * 10],
        ],
      ];

      for (const [name, boundaries] of chunkings) {
        expect(boundaries.length, `${label}: chunking "${name}" is not a chunking`).toBeGreaterThan(
          0,
        );
        const chunked = runChunked(request, boundaries);
        expect(recordDigest(chunked), `${label}: record digest under ${name}`).toBe(expectedRecord);
        expect(resultDigest(chunked), `${label}: result digest under ${name}`).toBe(expectedResult);
      }

      // And, where the record can show it, the fine chunkings really do cut where the claim says.
      if (testCase.carMoves === true) {
        const moves = whole.record.carMoves;
        expect(moves, 'recordCarMoves was asked for and no series was written').toBeDefined();
        assertCutsMidFlightAndMidDwell(moves ?? [], stepsOf(horizonS, 0.37), `${label} @0.37 s`);
        assertCutsMidFlightAndMidDwell(
          moves ?? [],
          stepsOf(horizonS, Math.PI * 1.7),
          `${label} @π·1.7 s`,
        );
      }
    },
    180_000,
  );

  /**
   * **The guard against a vacuous proof.** Every digest above is an equality, and an equality is
   * worth nothing from an instrument that cannot report a difference. A neighbouring seed on the
   * identical configuration must hash differently — which is the same two-sided check
   * `sim/determinism.test.ts` makes about plain replay, made here about the digest itself.
   */
  it('the digest can tell two runs apart', () => {
    const a = runWhole(configFor('midtown-office', 'collective', 20260919, { durationS: 900 }));
    const b = runWhole(configFor('midtown-office', 'collective', 20260920, { durationS: 900 }));
    expect(recordDigest(a)).not.toBe(recordDigest(b));
    expect(resultDigest(a)).not.toBe(resultDigest(b));
  }, 60_000);
});

/* -------------------------------------------------------------------------- *
 * The invariants the seam is most likely to break
 * -------------------------------------------------------------------------- */

describe('interruption leaves the invariants where it found them', () => {
  /**
   * **The event valve, which is the one place chunking could have bought something.**
   *
   * `maxEventsPerRun` was a *per-call* budget, so a run stepped in a thousand chunks would have
   * had a thousand budgets: a livelock the valve catches in one call would have run on forever in
   * a stepped one, and — worse for this repository — the same seed would have produced a
   * different record depending on where the caller paused. `SimKernel` now takes
   * `eventBudgetScope: 'lifetime'` and `Simulation` asks for it.
   *
   * Two things are asserted and the second is the one that was not free: the valve trips on the
   * **same event** whatever the chunking, and it is recorded **once**. A stepped run whose valve
   * has tripped must not warn again on every remaining step, or the record would carry the
   * caller's stepping choice as data.
   *
   * This is also the only test in the file that can see {@link Simulation}'s end-of-run time,
   * because the exhaustion warning is the one string that names it. `SimKernel.run(until)` parks
   * the clock at `until`; a chunking that steps past the end would report the caller's boundary
   * as the moment the run stopped if that warning read the clock.
   */
  it('trips the event valve on the same event, once, however it is stepped', () => {
    const request = configFor('midtown-office', 'collective', 20260919, {
      durationS: 900,
      // Small enough that the valve certainly trips, large enough that the run is a real one
      // rather than a queue that never started. The exact figure does not matter to the claim.
      maxEvents: 1_200,
    });

    const abortedResult = (run: () => unknown): SimulationResult => {
      try {
        run();
      } catch (error) {
        expect(error, 'expected the event valve to abort this run').toBeInstanceOf(SimulationError);
        const result = (error as SimulationError).result;
        expect(result, 'an aborted run must still carry the run it got').toBeDefined();
        return result as SimulationResult;
      }
      throw new Error('the run did not hit the event budget; lower maxEvents');
    };

    const whole = abortedResult(() => new Simulation(request).run());
    expect(whole.status).toBe('aborted');
    expect(whole.warnings.filter((w) => w.startsWith('event budget exhausted'))).toHaveLength(1);

    for (const [name, boundaries] of [
      ['every 60 s', stepsOf(900, 60)],
      ['every 0.37 s', stepsOf(900, 0.37)],
      ['stepping far past the end', [100, 450, 9_000]],
    ] as ReadonlyArray<readonly [string, readonly number[]]>) {
      const chunked = abortedResult(() => runChunked(request, boundaries));
      expect(chunked.events, `${name}: the valve tripped at a different event`).toBe(whole.events);
      expect(
        chunked.warnings.filter((w) => w.startsWith('event budget exhausted')),
        `${name}: the valve was recorded a number of times that depends on the stepping`,
      ).toHaveLength(1);
      expect(resultDigest(chunked), `${name}: aborted result digest`).toBe(resultDigest(whole));
    }
  }, 60_000);

  /**
   * **Invariant 2, sharply.** Chunking must not move a stream, and the reason is common random
   * numbers: if pausing advanced `arrivals` by one draw, two arms of a paired comparison stepped
   * differently would see different passengers and every interval published from them would be
   * measuring the renderer.
   */
  it('moves no random stream that an uninterrupted run does not move', () => {
    const request = configFor('midtown-office', 'collective', 20260919, { durationS: 900 });

    const whole = new Simulation(request);
    whole.run();
    const wholeStreams = JSON.stringify(whole.streams.snapshot());

    const stepped = new Simulation(request);
    for (const at of stepsOf(900, 0.37)) stepped.advanceTo(at);
    stepped.finish();

    expect(JSON.stringify(stepped.streams.snapshot())).toBe(wholeStreams);
  }, 60_000);

  /**
   * **Invariant 3 at this layer.** `untilS` before the clock is a `RangeError` from the kernel,
   * not a silent clamp: clamping would let a caller ask for a state the run has already left and
   * be handed the current one, which is the shape of every "the numbers moved and I don't know
   * why" bug this project exists to refuse.
   */
  it('refuses to run time backwards', () => {
    const sim = new Simulation(configFor('midtown-office', 'collective', 20260919, {
      durationS: 900,
    }));
    sim.advanceTo(300);
    expect(sim.now()).toBe(300);
    expect(() => sim.advanceTo(299.9)).toThrow(/never runs backwards/);
    expect(() => sim.advanceTo(Number.NaN)).toThrow(RangeError);
    // The refusal is a refusal, not a corruption: the run finishes exactly as it would have.
    expect(recordDigest(sim.finish())).toBe(
      recordDigest(
        runWhole(configFor('midtown-office', 'collective', 20260919, { durationS: 900 })),
      ),
    );
  }, 60_000);

  it('is single-use in the sense it always was', () => {
    const sim = new Simulation(configFor('garden-apartments', 'eta', 20260919, { durationS: 900 }));
    expect(sim.hasStarted).toBe(false);
    expect(sim.isDrained()).toBe(false);

    sim.advanceTo(120);
    expect(sim.hasStarted).toBe(true);
    expect(sim.hasFinished).toBe(false);

    sim.finish();
    expect(sim.hasFinished).toBe(true);
    expect(sim.isDrained()).toBe(true);
    expect(() => sim.finish()).toThrow(/has already run/);
    expect(() => sim.run()).toThrow(/has already run/);
    expect(() => sim.advanceTo(1000)).toThrow(/already finished/);
  }, 60_000);

  /**
   * **Fork-at-`t` by replay, which is the thing a snapshot would have been for.**
   *
   * The expensive way to run one present into two futures is to clone a `Simulation`. It holds
   * 103 private fields, live `Car`/`Floor`/`DispatchPolicy` objects and a kernel queue of
   * closures over `this` — see {@link Simulation.advanceTo} for the census — so a clone is a
   * refactor before it is anything else.
   *
   * The cheap way needs nothing that is not already here, and gives a *stronger* guarantee: build
   * both arms from the same config, advance both to `t`, and let them differ from there. Neither
   * prefix is a copy of the other — they are the same computation from the same seed — and this
   * test is that claim, in the three parts it has:
   *
   * 1. both arms see the **identical passenger population**, so the difference between them is
   *    attributable to the decision and to nothing else (common random numbers, for free, because
   *    the trace is drawn in the constructor before a car moves);
   * 2. the arms really do **diverge**, or the test is asserting nothing; and
   * 3. each arm's forked run is **byte-identical to running that arm straight through**, which is
   *    what says the replayed prefix is the real prefix and not merely a similar one.
   */
  it('runs one present into two futures on the identical passenger trace', () => {
    const forkAtS = 450;
    const left = configFor('midtown-office', 'collective', 20260919, { durationS: 900 });
    const right = configFor('midtown-office', 'eta', 20260919, { durationS: 900 });

    const fork = (request: SimulationConfig): SimulationResult => {
      const sim = new Simulation(request);
      sim.advanceTo(forkAtS);
      expect(sim.now()).toBe(forkAtS);
      return sim.finish();
    };
    const leftRun = fork(left);
    const rightRun = fork(right);

    // 1 — the same people, in the same order, at the same instants, carrying the same mass.
    expect(JSON.stringify(rightRun.trace.passengers)).toBe(JSON.stringify(leftRun.trace.passengers));

    // 2 — and a genuinely different day on the other side of the fork.
    expect(recordDigest(rightRun)).not.toBe(recordDigest(leftRun));

    // 3 — each arm is the arm, not an approximation of it.
    expect(recordDigest(leftRun)).toBe(recordDigest(runWhole(left)));
    expect(recordDigest(rightRun)).toBe(recordDigest(runWhole(right)));
  }, 60_000);

  /**
   * **The loop a player-facing caller will actually write**, asserted to terminate and to agree
   * with the single call. `isDrained()` is the condition; without it a caller has to guess a
   * horizon, and guessing one long enough would be the `until`-parked-clock bug from the other
   * side.
   */
  it('can be stepped until drained without knowing the horizon', () => {
    const request = configFor('garden-apartments', 'eta', 20260919, { durationS: 900 });
    const sim = new Simulation(request);

    let at = 0;
    let steps = 0;
    while (!sim.isDrained()) {
      at += 5;
      sim.advanceTo(at);
      steps += 1;
      expect(steps, 'the stepping loop did not terminate').toBeLessThan(10_000);
    }
    expect(steps).toBeGreaterThan(10);

    expect(recordDigest(sim.finish())).toBe(recordDigest(runWhole(request)));
  }, 60_000);
});
