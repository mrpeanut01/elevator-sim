/**
 * **Invariant 5 over the whole cross-product: 8 buildings × 13 dispatchers, replayed and re-seeded.**
 *
 * *"Every persisted run record carries its seed, so any run replays exactly."* Replay is what the
 * leaderboard verifies submissions with, what `reports/replay.ts` reconstructs a stored run from,
 * and what makes common random numbers worth 5–20× in required run count. The UI readiness audit of
 * 2026-08-10 measured it and cleared it: **104 building × dispatcher pairs replay bit-identically
 * from their seed, and the seed is live in every one.**
 *
 * ## Why this is not redundant with `core/src/sim/determinism.test.ts`
 *
 * That file is excellent and it is a **sample**. Its domain is hand-written string pairs handed to a
 * local `run()` helper — `config.buildingsById.get(id)`, a lookup and never an iteration. Counted
 * off its call sites, the pairs it asserts *replay* on are **five**:
 * `midtown-office`/`collective` (`:65`), `midtown-office`/`collective-enroute` (`:89`),
 * `vertical-city`/`collective-enroute` (`:123`), `mixed-use-high-rise`/`eta` (`:146`) and
 * `garden-apartments`/`nearest-car` (`:156`, `:169`). `validation/goldenRuns.test.ts` adds five
 * more, over `eta` and `collective` only. Eighteen distinct pairs are touched by *some* assertion;
 * **ten of the 104 are asserted to replay**, and three shipped buildings — `chancery-house`,
 * `crown-hotel`, `st-jude-hospital` — appear in no determinism or replay assertion anywhere in this
 * repository.
 *
 * Seed liveness is narrower still: `determinism.test.ts:181-198` sweeps seeds 1–8 on **one** cell,
 * `midtown-office`/`collective`, and that is the only place in the tree where changing a seed is
 * required to change a run over anything. (`storedRunReplay.test.ts` and `goldenRuns.test.ts` each
 * require the stored seed to be *load-bearing* on their own handful of cells, which is the same
 * property over the same kind of sample.)
 *
 * The one derived iteration that file does contain — `for (const profile of
 * config.dispatcherProfiles.profiles)` at `:209` — covers all 13 dispatchers, on one building, at
 * one seed, asserting only that the *passenger trace* is shared. It does not replay and it does not
 * re-seed.
 *
 * So this suite adds the two things the sample cannot give: **the cross-product, derived from disk
 * on both axes**, and **seed liveness on all 104 cells rather than one**. It does not duplicate the
 * deep single-cell work — 20-replication soak tests, process-history independence, diverting cars,
 * door obstructions, cross-process replay through NDJSON — all of which stay where they are and are
 * better there.
 *
 * **A hand-written domain is exactly the defect this repository keeps finding**, and there is a live
 * instance next door: `core/src/sim/fixtures.test-helper.ts:25` declares `BUILDING_IDS` under the
 * comment *"Every building the project ships, in load order"* and lists **five of eight**. Nothing
 * asserts it against disk, and `sim/seam.test.ts:672` partitions that list to derive its own domain
 * — so a suite that looks derived is derived from a stale copy. Both axes here come from
 * `loadConfig`, so a ninth building and a fourteenth dispatcher are in scope on the day they are
 * authored.
 *
 * ## The operating point, and why it is small
 *
 * 104 cells × 3 runs is 312 simulations, so the run has to be cheap or the suite gets skipped. A
 * 210 s window at 10 % of population per 5 minutes is the smallest of the points measured at which
 * every cell is still substantial: the thinnest is `garden-apartments` — a small building, six floors
 * and two cars — at **10 legs**, and every other building's thinnest cell is **23 or more**, up to
 * 372 on `vertical-city`; the median cell creates 50. Measured, and asserted below rather than
 * assumed, because a determinism check over an empty run is the purest form of a check that cannot
 * fail. The 312 simulations cost **7.1 s of CPU** (this tree, 2026-08-10).
 *
 * Determinism is a property of the machinery rather than of the demand level, so a short run
 * exercises it as well as a long one — what a short run costs is *sensitivity*, and the deep
 * single-cell soaks in `core` are where that is bought.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadConfig, runSimulation } from '@elevator-sim/core';
import type { SimulationConfig, SimulationResult } from '@elevator-sim/core';

import { DATA_DIR } from './harness.js';

/**
 * Every hook and every test here carries this, and the reason is a repo-wide asymmetry.
 *
 * `vitest.config.ts` gives `viz`, `core` and `server` a 300 s `testTimeout`/`hookTimeout` (issue
 * #144, whose own docstring measured the slowest legitimate `viz` test at 49.4 s, and issue #149)
 * and leaves **`experiments` and `cli` on vitest's 5 s default**. `core` and `server` joined in
 * § D394; this docstring used to quote the config's note explaining why `core` had not, and that
 * note is gone.
 *
 * `experiments` is where `benchmark/`, `oracle/` and this directory live — the heaviest simulating
 * suites in the repository, and the only package of that weight still on the default. That is
 * § D394's deliberate stopping point rather than an oversight: no `experiments` test has been
 * reported failing at the default, and § D331 refused exactly this widening-without-evidence once
 * already.
 *
 * The consequence is measured rather than feared: under seven concurrent worktrees, six
 * `core`/`experiments` files went red purely on contention and every one passed when run alone.
 * Half of that evidence is now spent — the `core` half is covered at the project — and the
 * `experiments` half is not, so a simulating test in this package that does not annotate itself is
 * still a flake waiting for a busy machine, and the 113 `viz` sites that annotated themselves
 * before the default existed were still right to.
 */
const TIMEOUT_MS = 300_000;

/** The audit's seed, so a cell that goes red here reproduces through `scripts/opcheck/`. */
const SEED = 20260810;

/** See the operating-point note above. Both halves are load-bearing and both were measured. */
const DURATION_S = 210;
const DEMAND = { peakWindowS: 60, arrivalRatePctPop5min: 10 } as const;

interface Cell {
  readonly buildingId: string;
  readonly dispatcherId: string;
  /** The run at {@link SEED}, and the same run again. */
  readonly first: string;
  readonly again: string;
  /** The run at `SEED + 1`. */
  readonly reseeded: string;
  readonly legsCreated: number;
  readonly legsBoarded: number;
}

/**
 * Everything the run produced, canonically.
 *
 * `JSON.stringify` rather than a deep-equal, for `core/src/sim/fixtures.test-helper.ts`'s stated
 * reason: key order is part of the record, and a structural comparison would not see it move. The
 * replacer exists because a seed may be a `bigint`, which `JSON.stringify` refuses outright.
 *
 * The whole result rather than the summary: a divergence that moved one passenger between two cars
 * without changing the mean wait is exactly the regression this is for, and a summary-level
 * fingerprint would not see it.
 */
function fingerprint(result: SimulationResult): string {
  return JSON.stringify(
    {
      status: result.status,
      endedAt: result.endedAt,
      events: result.events,
      conservation: result.conservation,
      stageActivity: result.stageActivity,
      record: result.record,
      summary: result.summary,
      undelivered: result.undelivered,
      warnings: result.warnings,
    },
    (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value),
  );
}

let CELLS: readonly Cell[] = [];
let BUILDING_COUNT = 0;
let DISPATCHER_COUNT = 0;

beforeAll(async () => {
  const config = await loadConfig(DATA_DIR);
  /* Both axes off disk. Sorted so a failure list reads in a stable order. */
  const buildingIds = [...config.buildingsById.keys()].sort();
  const profiles = config.dispatcherProfiles.profiles;
  BUILDING_COUNT = buildingIds.length;
  DISPATCHER_COUNT = profiles.length;

  const cells: Cell[] = [];
  for (const buildingId of buildingIds) {
    const building = config.buildingsById.get(buildingId);
    if (building === undefined) throw new Error(`building "${buildingId}" vanished between reads`);
    for (const dispatcherProfile of profiles) {
      const base: SimulationConfig = {
        building,
        dispatcherProfile,
        trafficProfiles: config.trafficProfiles,
        dispatcherProfiles: config.dispatcherProfiles,
        elevatorSpecs: config.elevatorSpecs,
        seed: SEED,
        durationS: DURATION_S,
        demand: DEMAND,
        /* A cell that cannot drain is a configuration over capacity, not a determinism failure —
           and a `timed-out` run must replay bit-identically too, which is why it stays in scope. */
        onTimeout: 'report',
      };
      const first = runSimulation(base);
      const again = runSimulation(base);
      const reseeded = runSimulation({ ...base, seed: SEED + 1 });
      cells.push({
        buildingId,
        dispatcherId: dispatcherProfile.id,
        first: fingerprint(first),
        again: fingerprint(again),
        reseeded: fingerprint(reseeded),
        legsCreated: first.conservation.legsCreated,
        legsBoarded: first.conservation.legsBoarded,
      });
    }
  }
  CELLS = cells;
}, TIMEOUT_MS);

const at = (cell: Cell): string => `${cell.buildingId}/${cell.dispatcherId}`;

describe('the cross-product is the cross-product', () => {
  it('takes both axes from disk rather than from a list in this file', () => {
    expect(BUILDING_COUNT).toBeGreaterThanOrEqual(8);
    expect(DISPATCHER_COUNT).toBeGreaterThanOrEqual(13);
    expect(CELLS.length).toBe(BUILDING_COUNT * DISPATCHER_COUNT);
  }, TIMEOUT_MS);

  /**
   * The three buildings that no determinism assertion in this repository reaches.
   *
   * Named individually rather than counted, because the count is what was already satisfied by a
   * five-name list claiming to be eight. If one of these is ever renamed, this fails and somebody
   * decides deliberately rather than losing the coverage in silence.
   */
  it.each(['chancery-house', 'crown-hotel', 'st-jude-hospital'])(
    'covers %s, which nothing else does',
    (buildingId) => {
      expect(CELLS.filter((cell) => cell.buildingId === buildingId).length).toBe(DISPATCHER_COUNT);
    },
    TIMEOUT_MS,
  );

  it('runs something in every cell', () => {
    const thin = CELLS.filter((cell) => cell.legsCreated < 5 || cell.legsBoarded < 5).map(
      (cell) => `${at(cell)}: ${String(cell.legsCreated)} legs, ${String(cell.legsBoarded)} boarded`,
    );
    expect(thin).toEqual([]);
    /* And the point is not that the floor is cleared but that most cells are well above it: a
       matrix whose every cell sat at the floor would be measuring an operating point rather than a
       cross-product. Measured on this tree the median cell creates **50** legs; the bar is set
       below that rather than at it, because the median is a property of the shipped buildings and
       moves whenever one is retuned. */
    const median = [...CELLS].map((cell) => cell.legsCreated).sort((a, b) => a - b)[
      Math.floor(CELLS.length / 2)
    ];
    expect(median).toBeGreaterThanOrEqual(40);
  }, TIMEOUT_MS);
});

describe('invariant 5 — every cell replays exactly from its seed', () => {
  it('the same configuration at the same seed produces the identical run', () => {
    const drifted = CELLS.filter((cell) => cell.first !== cell.again).map(at);
    expect(
      drifted,
      'these cells did not reproduce themselves in the same process — a global RNG, a wall clock, ' +
        'or a hash-order tie break (CLAUDE.md invariants 2, 3, 4)',
    ).toEqual([]);
  }, TIMEOUT_MS);
});

describe('the seed is live in every cell', () => {
  /*
   * The negative control, and the half that is nearly absent from the tree today. A record that
   * carried the right seed while the run ignored it would satisfy every replay assertion above and
   * every stored-run round trip — and would make common random numbers silently worthless, because
   * two arms would share a trace they were never paired on.
   */
  it('changing the seed changes the run', () => {
    const inert = CELLS.filter((cell) => cell.first === cell.reseeded).map(at);
    expect(
      inert,
      'these cells produced a bit-identical run at a different seed — the seed reached nothing',
    ).toEqual([]);
  }, TIMEOUT_MS);
});
