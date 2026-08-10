/**
 * **Does the lift group actually operate?** — the UI readiness audit's cross-product, bounded for CI.
 *
 * The audit of 2026-08-10 ran 5 096 cells (8 buildings × 13 dispatchers × seeds, templates, traffic
 * profiles, demand tweaks and failure modes) and reported that six operational properties held
 * across every one of them:
 *
 * | property | what a violation means |
 * |---|---|
 * | conservation balances | a passenger was lost or double-counted |
 * | `wrongCarBoardings === 0` | a destination-panel rider boarded a car the panel did not name |
 * | `deckMismatchLegs === 0` | a leg was refused because the deck that stopped does not serve its floor |
 * | no bank with routable demand serves nobody | a whole shaft is inert while riders it could carry stand |
 * | no floor with real arrivals goes unserved | a floor exists in the building and not in the service |
 * | every double-deck stop pairs, and both decks carry | the second deck is dead weight |
 *
 * **None of it was asserted anywhere.** It was established by an untracked script under
 * `scripts/opcheck/`, run once, by hand, on a tree that has since moved. This suite is the bounded
 * version that runs in CI: **13 dispatchers × 4 buildings at one seed — 52 cells, 8.8 s of CPU.**
 *
 * ## What is derived and what is chosen, stated separately
 *
 * The **dispatcher** axis is derived: `config.dispatcherProfiles.profiles`, off
 * `data/dispatcher-profiles.json`. A fourteenth dispatcher is in scope on the day it is authored,
 * which is the whole lesson of `src/index.test.ts`'s study-entry-point block.
 *
 * The **building** axis is **chosen** — four of the eight, named below — to hold the suite at the
 * 8.8 s of CPU measured here, because a suite nobody wants to run is a suite that gets skipped.
 * That is a budget rather than a measurement of the alternative: what all eight would cost at this
 * duration was not measured, and is not claimed.
 *
 * But the *reason* the four were chosen is not left as prose: {@link COVERAGE} asserts, from the
 * resolved buildings themselves, that the set really does contain a single-bank tower, a multi-bank
 * building with sky lobbies, a double-deck bank and an access-zoned one. Edit the data so the
 * coverage is lost and this goes red rather than quietly narrowing.
 *
 * The four that are **not** here — `chancery-house`, `crown-hotel`, `garden-apartments`,
 * `st-jude-hospital` — are covered on the same 13 dispatchers by `determinismMatrix.test.ts`, which
 * runs the full 8 × 13 at a cheaper operating point. Neither suite is the other's superset: that one
 * asks whether a run reproduces, this one asks whether it operated.
 *
 * ## What is deliberately not here
 *
 * **The parked-car check** — the audit's headline finding, a car motionless ≥ 180 s while ≥ 5
 * riders it could carry stand — is not ported. It fires on **665 of 5 096 shipped cells**, so as a
 * test it would be red on arrival, and the dispatch behaviour it measures is being changed by other
 * lanes in this very wave. See this suite's closing note for what it would take to make it a test.
 *
 * ## Two traps this suite inherited from the audit's own instrument, pre-paid
 *
 * The audit's first pass reported 2 483 of 2 496 cells clean and that number was wrong. Two of the
 * seven reasons apply directly to anything written from scratch here:
 *
 * 1. **The car-id namespace.** `bank.cars[].id` is `"A"`; `RunRecord.carIds` is `"main-A"`, built by
 *    `Simulation` as `${bankId}-${carId}`. Keying a per-car map on the bare id resolved **0 of 79
 *    cars in all 8 buildings** and silently disabled four checks, whose zero counts then read as
 *    evidence. This suite works at bank and floor granularity and never needs the join — and
 *    {@link CELLS}'s non-vacuity assertions are what would catch it if a later edit did.
 * 2. **Abandoned and refused riders are not the lifts' failure.** A rider who went home or was
 *    turned away at a credential reader must be excluded from "arrived at this floor", or every
 *    patience run reports a floor as unserved on the strength of two people who left. Unfiltered,
 *    that produced **454 of 468** of the audit's `floor-never-reached` warnings.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadConfig, runSimulation } from '@elevator-sim/core';
import type { ResolvedBuilding, SimulationResult } from '@elevator-sim/core';

import { DATA_DIR } from './harness.js';

/* -------------------------------------------------------------------------- *
 * The matrix
 * -------------------------------------------------------------------------- */

/**
 * Every hook and every test here carries this, and the reason is a repo-wide asymmetry.
 *
 * `vitest.config.ts` gives the `viz` project a 300 s `testTimeout`/`hookTimeout` (issue #144) and
 * leaves `core`, `experiments`, `server` and `cli` on **vitest's 5 s default**. The config states
 * that choice for `core` — *"filed rather than done, so the next person meets a decision instead of
 * a divergence"* — and does not mention `experiments`, which is where `benchmark/`, `oracle/` and
 * this directory live: the heaviest simulating suites in the repository. A 52-cell matrix does not
 * fit in five seconds on an idle machine, let alone a loaded one, so it says so itself.
 */
const TIMEOUT_MS = 300_000;

/**
 * The four buildings, and the property each is in the set for.
 *
 * Chosen, not derived — and {@link COVERAGE} turns the third column into an assertion so the choice
 * cannot go stale in silence.
 */
const BUILDINGS = [
  'midtown-office',
  'mixed-use-high-rise',
  'secure-tower',
  'vertical-city',
] as const;

/** The audit's own seed, so a cell that goes red here reproduces through `scripts/opcheck/`. */
const SEED = 20260810;

/**
 * 450 s, which is a judgement and therefore stated.
 *
 * Long enough that every cell is non-vacuous — the thinnest of the 52 is `secure-tower`/`nearest-car`
 * at **176** legs created, and `vertical-city` still records **134** deck stops, **362** transfers
 * and **102** non-lift transport hops on its quietest dispatcher — and short enough that the 52
 * cells cost **8.8 s of CPU** (seed 20 260 810, this tree, 2026-08-10). Below 450 s the
 * `rise-and-fall` template's 300 s peak hold stops fitting and `core` refuses the run outright —
 * *"A 300 s peak hold does not fit inside a 180 s run"* — which is the floor rather than a
 * preference.
 */
const DURATION_S = 450;

interface Cell {
  readonly building: ResolvedBuilding;
  readonly buildingId: string;
  readonly dispatcherId: string;
  readonly result: SimulationResult;
}

let CELLS: readonly Cell[] = [];
let COVERAGE: Readonly<Record<string, ResolvedBuilding>> = {};

beforeAll(async () => {
  const config = await loadConfig(DATA_DIR);
  const cells: Cell[] = [];
  const coverage: Record<string, ResolvedBuilding> = {};
  for (const buildingId of BUILDINGS) {
    const building = config.buildingsById.get(buildingId);
    if (building === undefined) throw new Error(`building "${buildingId}" is no longer shipped`);
    coverage[buildingId] = building;
    for (const dispatcherProfile of config.dispatcherProfiles.profiles) {
      cells.push({
        building,
        buildingId,
        dispatcherId: dispatcherProfile.id,
        result: runSimulation({
          building,
          dispatcherProfile,
          trafficProfiles: config.trafficProfiles,
          dispatcherProfiles: config.dispatcherProfiles,
          elevatorSpecs: config.elevatorSpecs,
          seed: SEED,
          durationS: DURATION_S,
          /*
           * The same choice every shipped producer makes, and for the survey's own reason: a run
           * that cannot drain by its deadline is a configuration over capacity, not a broken
           * simulator, and collapsing the two would make this suite red for the wrong reason.
           *
           * That is not hypothetical here: on the tree this was written against, at least one of
           * the 52 cells came back `timed-out`. **Which one is deliberately not named**, because
           * the dispatch behaviour that decides it is being changed in this same wave and a cell id
           * written here would be a stale sentence within the week. Every property below is an
           * invariant that a timed-out run must satisfy too, so the suite does not care which cells
           * drain. `shippedRunConfig.test.ts` is the guard on the field itself.
           */
          onTimeout: 'report',
        }),
      });
    }
  }
  CELLS = cells;
  COVERAGE = coverage;
}, TIMEOUT_MS);

/** `building/dispatcher`, for a failure message a reader can reproduce. */
const at = (cell: Cell): string => `${cell.buildingId}/${cell.dispatcherId}`;

/* -------------------------------------------------------------------------- *
 * The matrix is what it claims to be
 * -------------------------------------------------------------------------- */

describe('the matrix', () => {
  it('takes its dispatcher axis from the data file, not from a list here', () => {
    const dispatchers = new Set(CELLS.map((cell) => cell.dispatcherId));
    /* Thirteen today. The assertion is a floor rather than an equality so a fourteenth is in scope
       without editing this file — which is the point of deriving the axis. */
    expect(dispatchers.size).toBeGreaterThanOrEqual(13);
    expect(CELLS.length).toBe(dispatchers.size * BUILDINGS.length);
  }, TIMEOUT_MS);

  /**
   * The building set covers what it was picked to cover — read off the buildings, not asserted.
   *
   * Each clause is one of the four structural regimes the audit swept. If `vertical-city` ever stops
   * declaring double-deck cars, or `secure-tower` stops declaring access zones, the double-deck and
   * refusal properties below would start passing by not looking, and this is what says so.
   */
  it('covers single-bank, multi-bank sky-lobby, double-deck and access-zoned', () => {
    const of = (id: string): ResolvedBuilding => {
      const building = COVERAGE[id];
      if (building === undefined) throw new Error(`"${id}" missing from the coverage set`);
      return building;
    };
    expect(of('midtown-office').banks.length).toBe(1);

    const multi = of('mixed-use-high-rise');
    expect(multi.banks.length).toBeGreaterThan(1);
    expect(multi.transferFloors.length).toBeGreaterThan(0);

    expect(of('secure-tower').accessZones.length).toBeGreaterThan(0);

    const deck = of('vertical-city');
    expect(deck.banks.some((bank) => bank.cars.some((car) => car.doubleDeck))).toBe(true);
    expect(deck.banks.some((bank) => (bank.servesFloorPairs ?? []).length > 0)).toBe(true);
  }, TIMEOUT_MS);

  /**
   * Every cell exercised something.
   *
   * The failure this closes is the one that made the audit's own first pass worthless: a check that
   * reports clean because it could not see anything. A cell with no legs satisfies every invariant
   * below by vacuity, and so does one where nobody boarded.
   */
  it('is non-vacuous in every cell', () => {
    const empty = CELLS.filter(
      (cell) =>
        cell.result.conservation.legsCreated === 0 || cell.result.conservation.legsBoarded === 0,
    ).map(at);
    expect(empty).toEqual([]);
    /* And the double-deck axis specifically, since three of the four buildings cannot exercise it. */
    const deckCells = CELLS.filter((cell) => cell.buildingId === 'vertical-city');
    expect(deckCells.every((cell) => (cell.result.stageActivity.doubleDeckStops ?? 0) > 0)).toBe(
      true,
    );
  }, TIMEOUT_MS);
});

/* -------------------------------------------------------------------------- *
 * The six properties
 * -------------------------------------------------------------------------- */

describe('the books balance in every cell', () => {
  it('generated == delivered + undelivered + abandoned + accessRefused', () => {
    const off = CELLS.filter((cell) => {
      const audit = cell.result.conservation;
      const booked =
        audit.delivered + audit.undelivered + (audit.abandoned ?? 0) + (audit.accessRefused ?? 0);
      return booked !== audit.generated;
    }).map((cell) => {
      const audit = cell.result.conservation;
      return `${at(cell)}: generated ${String(audit.generated)} != ${String(
        audit.delivered,
      )} delivered + ${String(audit.undelivered)} undelivered + ${String(
        audit.abandoned ?? 0,
      )} abandoned + ${String(audit.accessRefused ?? 0)} refused`;
    });
    expect(off).toEqual([]);
  }, TIMEOUT_MS);

  it('nobody alights who did not board', () => {
    const off = CELLS.filter(
      (cell) => cell.result.conservation.legsAlighted > cell.result.conservation.legsBoarded,
    ).map(at);
    expect(off).toEqual([]);
  }, TIMEOUT_MS);
});

describe('nobody boards a car they were not named', () => {
  /*
   * `wrongCarBoardings` is a destination-*dispatch* property: under Level-1 the panel names a car
   * and the rider may board no other. It is counted on every run, so the assertion covers the
   * conventional dispatchers too — where it is true by construction, which is worth having pinned.
   */
  it('wrongCarBoardings is zero', () => {
    const off = CELLS.filter((cell) => cell.result.conservation.wrongCarBoardings > 0).map(
      (cell) => `${at(cell)}: ${String(cell.result.conservation.wrongCarBoardings)}`,
    );
    expect(off).toEqual([]);
  }, TIMEOUT_MS);
});

describe('every bank with routable demand serves somebody', () => {
  /**
   * Demand a bank *could* have taken, derived from the building rather than from the dispatcher.
   *
   * A leg is servable by a bank when the bank serves both ends of it. Taking this from the
   * dispatcher's own decisions would make the property circular — a bank the dispatcher never
   * considered would have no demand offered to it and would pass.
   */
  const offeredTo = (building: ResolvedBuilding, cell: Cell): ReadonlyMap<string, number> => {
    const serves = building.banks.map(
      (bank) => [bank.id, new Set(bank.servesFloors)] as const,
    );
    const offered = new Map(building.banks.map((bank) => [bank.id, 0]));
    for (const leg of cell.result.record.passengers) {
      for (const [bankId, floors] of serves) {
        if (floors.has(leg.originFloorId) && floors.has(leg.destinationFloorId)) {
          offered.set(bankId, (offered.get(bankId) ?? 0) + 1);
        }
      }
    }
    return offered;
  };

  it('no bank is inert while riders it could carry are standing', () => {
    const dead: string[] = [];
    for (const cell of CELLS) {
      const offered = offeredTo(cell.building, cell);
      const served = new Map(cell.building.banks.map((bank) => [bank.id, 0]));
      for (const leg of cell.result.record.passengers) {
        if (leg.boardedAt !== undefined && leg.bankId !== undefined) {
          served.set(leg.bankId, (served.get(leg.bankId) ?? 0) + 1);
        }
      }
      for (const bank of cell.building.banks) {
        const could = offered.get(bank.id) ?? 0;
        const did = served.get(bank.id) ?? 0;
        if (could > 0 && did === 0) {
          dead.push(`${at(cell)}: bank "${bank.id}" served nobody of ${String(could)} routable legs`);
        }
      }
    }
    expect(dead).toEqual([]);
  }, TIMEOUT_MS);
});

describe('every floor with real arrivals is served', () => {
  /*
   * "Real" is the load-bearing word, and it is the audit instrument's fourth defect: a rider who
   * abandoned the queue or was refused at a credential reader was not failed *by the lifts*.
   * Counting them made 454 of 468 warnings spurious.
   */
  it('no floor has arrivals and no boardings', () => {
    const unserved: string[] = [];
    for (const cell of CELLS) {
      const arrived = new Map<string, number>();
      const boarded = new Map<string, number>();
      for (const leg of cell.result.record.passengers) {
        if (leg.abandonedAt === undefined && leg.refusedAt === undefined) {
          arrived.set(leg.originFloorId, (arrived.get(leg.originFloorId) ?? 0) + 1);
        }
        if (leg.boardedAt !== undefined) {
          boarded.set(leg.originFloorId, (boarded.get(leg.originFloorId) ?? 0) + 1);
        }
      }
      for (const [floorId, count] of arrived) {
        if ((boarded.get(floorId) ?? 0) === 0) {
          unserved.push(`${at(cell)}: floor "${floorId}" had ${String(count)} arrivals, 0 boardings`);
        }
      }
    }
    expect(unserved).toEqual([]);
  }, TIMEOUT_MS);
});

describe('double-deck operation', () => {
  const deckCells = (): readonly Cell[] => CELLS.filter((cell) => cell.buildingId === 'vertical-city');

  it('refuses no leg for a deck that does not serve its floor', () => {
    const off = CELLS.filter((cell) => (cell.result.stageActivity.deckMismatchLegs ?? 0) > 0).map(
      (cell) => `${at(cell)}: ${String(cell.result.stageActivity.deckMismatchLegs)}`,
    );
    expect(off).toEqual([]);
  }, TIMEOUT_MS);

  it('carries riders on both decks', () => {
    const off = deckCells()
      .filter((cell) => {
        const [lower, upper] = cell.result.stageActivity.doubleDeckBoardings ?? [0, 0];
        return lower === 0 || upper === 0;
      })
      .map((cell) => `${at(cell)}: ${(cell.result.stageActivity.doubleDeckBoardings ?? []).join('/')}`);
    expect(off).toEqual([]);
  }, TIMEOUT_MS);

  /**
   * On a bank whose `servesFloorPairs` covers every floor it serves, pairing is 100 % by geometry.
   *
   * The precondition is not decoration: a bank that pairs only some of its floors legitimately makes
   * unpaired stops, and demanding otherwise would be asserting a threshold rather than an invariant.
   * The audit's instrument carries the same guard, and notes honestly that this is an **invariant
   * guard rather than an externally falsifiable check** — every way to lower the pairing ratio from
   * outside the model also breaks the precondition, so a fault injection trips a different check
   * first. It is kept because it is the regression it would catch, not because it can be provoked.
   */
  it('pairs every stop on a bank whose geometry pairs every floor it serves', () => {
    const off: string[] = [];
    for (const cell of deckCells()) {
      const stops = cell.result.stageActivity.doubleDeckStops ?? 0;
      const paired = cell.result.stageActivity.doubleDeckPairedStops ?? 0;
      if (stops === 0) continue;
      for (const bank of cell.building.banks) {
        const pairs = bank.servesFloorPairs ?? [];
        if (pairs.length === 0) continue;
        const pairedFloors = new Set(pairs.flat());
        if (!bank.servesFloors.every((floorId) => pairedFloors.has(floorId))) continue;
        if (paired < stops) {
          off.push(`${at(cell)}: bank "${bank.id}" paired ${String(paired)} of ${String(stops)} stops`);
          break;
        }
      }
    }
    expect(off).toEqual([]);
  }, TIMEOUT_MS);
});

describe('access control turns nobody away wholesale', () => {
  /*
   * The audit measured refusals to be *exactly dispatcher-invariant* — one count per building across
   * all 13 — which is correct by construction, since the credential is checked at the landing before
   * dispatch. Asserted here because it is a cheap, sharp statement of that construction: if a
   * dispatcher ever became able to change who is refused, the credential would have moved out of the
   * landing and into the dispatch decision, and nothing else in the suite would notice.
   */
  it('refuses the same riders whatever the dispatcher', () => {
    for (const buildingId of BUILDINGS) {
      const counts = new Set(
        CELLS.filter((cell) => cell.buildingId === buildingId).map(
          (cell) => cell.result.conservation.accessRefused ?? 0,
        ),
      );
      expect(counts.size, `${buildingId} refuses a dispatcher-dependent number of riders`).toBe(1);
    }
  }, TIMEOUT_MS);

  it('refuses nobody wholesale in an access-zoned building', () => {
    const secure = CELLS.filter((cell) => cell.buildingId === 'secure-tower');
    const off = secure
      .filter((cell) => {
        const audit = cell.result.conservation;
        return audit.generated > 0 && (audit.accessRefused ?? 0) >= audit.generated;
      })
      .map(at);
    expect(off).toEqual([]);
  }, TIMEOUT_MS);
});

/*
 * ## The parked-car check, and what it would take to make it a test
 *
 * The audit's headline finding — a car that completed no move for ≥ 180 s while ≥ 5 riders whose
 * trips are entirely inside its own bank stood waiting throughout, with the car in service the whole
 * time — is **not** asserted here, and should not be until two things are true: the lanes changing
 * the behaviour it measures have landed, and it is written as a ratchet rather than as a bar.
 *
 * It currently fires on **665 of 5 096 shipped cells**, concentrated in three dispatchers:
 * `nearest-car` (324 of 392 cells, 83 %), `destination-panel` (147, 38 %) and `energy-aware`
 * (78, 20 %). `capacity-aware` and `predictive-balanced` fire on **zero** cells anywhere, which is
 * the standard the rest could be held to. As a boolean over the shipped matrix it is red on arrival,
 * so it cannot be a test today whatever its merit.
 *
 * **After** the lanes changing `#tellThePanel`/`#candidateCars` and the reassignment policy land, the
 * threshold that would make it meaningful is a **per-dispatcher ratchet rather than a bar**: pin each
 * dispatcher's current parked-cell count as its ceiling and require it never to rise. That is the
 * only form that is green on arrival, refuses a regression on the eleven dispatchers that are
 * already good, and does not quietly bless `nearest-car` at 83 %. A single global bar would either
 * be set above `nearest-car` — in which case it permits the finding the audit was commissioned to
 * catch — or below it, in which case it is red.
 *
 * The measurement it needs is not cheap: the check reads `TravelSample`s per car and per-bank queue
 * depth over time, and the audit's instrument got it wrong twice before it got it right (it took
 * `min(waiting)` across the gap between two travel samples — and a gap's edges are exactly the
 * moments a queue is low — and it charged a bank with riders in a shared lobby bound for floors its
 * shaft cannot reach, inflating 1 000 of 2 077 findings). Whoever writes it should start from
 * `scripts/opcheck/opcheck.mjs` rather than from the description above.
 */
