/**
 * **The Burj-class reference building, and the four measurements § D527 asked for** — GitHub issue
 * **#376**, `docs/38` § 2.5.
 *
 * The reference is 165 levels, 57 lifts and speeds to 10 m/s — about 1.6× the floors and cars of
 * `vertical-city`, the tallest thing this tree had run. § D527's point is that *"the reference is a
 * floor, not a ceiling"*, and that it may not be called carried until it has been measured. This
 * file is where four of those five measurements are pinned; the fifth is the stage's drawing and is
 * #377's, because it is design work with a different owner.
 *
 * ## What the measurements found, and two of them changed the building
 *
 * **The arrangement was wrong twice, and the run said so both times.** The first draft split the
 * sky-lobby shuttle into three banks, one per sky lobby: at a fifth of the population the queue
 * still rose 71.8 persons over a 300 s window and AWT was suppressed for saturation, while
 * `vertical-city` on the same harness returned 27 s. The second draft pooled the shuttle and
 * changed **nothing** — the numbers were identical to the digit, which is what said the shuttle was
 * not being used at all. It was not: the service lifts spanned the entrance to the top, so the
 * dispatcher never had to transfer anybody, and `service-high`'s **two** cars carried 277 of 827
 * legs at a **624 s** mean wait while the fourteen shuttle cars carried **zero**. Legs per journey
 * were 1.03 against `vertical-city`'s 1.65.
 *
 * Running the service lifts from the loading dock rather than the passenger lobby — which is where
 * a real building's service lifts start — forces the transfer the whole arrangement is built
 * around. Legs per journey went to 1.61 and every local came in under 25 s.
 *
 * **The population is measured, not guessed.** No published occupancy for the reference tower was
 * available, so the figure is what this arrangement serves with a valid AWT, and the file says so.
 * A higher published occupancy would not merely change a field: it would say the real tower's lift
 * count is not 57 on this arrangement, which is the kind of thing a reference building exists to
 * expose.
 *
 * ## Why the numbers here are ranges and one is absent
 *
 * The wall-clock figure is [§ D483](../../../../DECISIONS.md)'s: *a test-cost figure is a claim
 * about a machine*. It is quoted in the docstring with its machine and asserted here only as a
 * ceiling generous enough to survive a slower runner, because a wall-clock assertion tight enough
 * to be interesting is GitHub issue #335 — which reproduced twice while this branch was being
 * written.
 *
 * **The Barney/CIBSE oracle is not here**, and that is stated rather than implied: `CLAUDE.md`
 * requires simulated interval and handling capacity to match the closed form within a few percent
 * under *pure up-peak*, and `sim/oracle.test.ts` is that instrument — wired to one building, with a
 * demand template and an overload factor of its own. Pointing it at a 165-floor tower with three
 * sky lobbies and a double-deck shuttle is a piece of work rather than a parameter change, and a
 * looser comparison written here would be a check that could not fail. #376's third criterion is
 * **open**, and the issue says so.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
  RoutePlanner,
  routeTopologyOf,
} from '@elevator-sim/core/browser';

import { recordRun } from './recordRun.js';

const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));
const FILE = 'burj-class-reference.json';
const TIMEOUT_MS = 300_000;

const dataFile = (name: string): unknown =>
  JSON.parse(readFileSync(join(DATA_DIR, name), 'utf8')) as unknown;

function shipped() {
  const elevatorSpecs = parseElevatorSpecs(dataFile('elevator-specs.json'));
  const trafficProfiles = parseTrafficProfiles(dataFile('traffic-profiles.json'));
  const dispatcherProfiles = parseDispatcherProfiles(dataFile('dispatcher-profiles.json'));
  const trafficProfileIds = new Set(trafficProfiles.profiles.map((profile) => profile.id));
  const building = resolveBuilding(
    parseBuilding(dataFile(join('buildings', FILE)), FILE),
    elevatorSpecs,
    { file: FILE, trafficProfileIds },
  );
  return { building, elevatorSpecs, trafficProfiles, dispatcherProfiles };
}

describe('the Burj-class reference building — issue #376', () => {
  it('is the shape § D527 names: 165 levels, 57 lifts, and it loads without a warning', () => {
    const { building } = shipped();
    expect(building.floors).toHaveLength(165);
    expect(building.banks.reduce((n, bank) => n + bank.cars.length, 0)).toBe(57);
    /* Zero warnings is the bar the other eight meet; the loader has four codes for this file's
       shape alone (speed outside a class's envelope, a bank past a class's floor rating). */
    expect(building.warnings ?? []).toEqual([]);
    /* Speeds reach the reference's 10 m/s, which is what makes the rise interesting at all. */
    const fastest = Math.max(
      ...building.banks.flatMap((bank) => bank.cars.map((car) => car.ratedSpeedMps)),
    );
    expect(fastest).toBe(10);
  });

  /**
   * **§ D527's first measurement: it runs.** A full day completes, the event valve never bites, and
   * the recording's size is stated because a 165-floor run is the first thing in this tree that
   * could make a recording too big to post to a worker.
   */
  it(
    'runs a full day without aborting, delivers everybody, and reports a usable mean',
    () => {
      const { building, elevatorSpecs, trafficProfiles, dispatcherProfiles } = shipped();
      const profile = dispatcherProfiles.profiles.find((one) => one.id === 'collective');
      expect(profile).toBeDefined();

      const { recording } = recordRun(
        {
          building,
          dispatcherProfile: profile!,
          trafficProfiles,
          elevatorSpecs,
          seed: 376n,
          durationS: 3600,
          /* `throw` rather than `report`: an undelivered journey must fail this, not be counted. */
          onTimeout: 'throw',
          runId: 'burj-376',
        } as never,
        { recordDecisions: false },
      );

      expect(recording.summary.undelivered).toBe(0);
      expect(recording.summary.generated).toBeGreaterThan(2000);
      /* The mean is quotable — no saturation, no censoring, nothing past the abandonment horizon. */
      expect(recording.summary.awtIsValid).toBe(true);
      expect(recording.summary.meanWaitS).toBeLessThan(120);

      /*
       * The recording's size, as a ceiling rather than a pin. Measured at 17.36 MB on the tree this
       * landed on; the bound is what a worker `postMessage` and a browser tab have to survive, and
       * the figure is here so the next reader knows which order of magnitude they are in.
       */
      const megabytes = Buffer.byteLength(JSON.stringify(recording), 'utf8') / 1e6;
      expect(megabytes).toBeLessThan(40);
    },
    TIMEOUT_MS,
  );

  /**
   * **§ D527's second measurement: what it costs.** Measured at **1.33–1.38 s** per 3 600 s
   * replication on an Apple M1 Max (10 cores, 32 GB, Node v26.5.0), three runs, byte-identical.
   *
   * That one figure bounds the three things #376 names. **The live re-simulate-on-press path**
   * (`docs/38` § 2.3) is comfortable at ~1.4 s. **The survivor-count pre-simulation** (#367) and
   * **the 50–200 replications behind a published interval** are ~2.3 to ~4.6 minutes serially at
   * this size, so both want `docs/15` phase B's fan-out rather than a loop — which is the decision
   * this measurement exists to inform.
   *
   * Asserted only as a generous ceiling: see the header for why a tight wall-clock gate is #335.
   */
  it(
    'costs a bounded wall clock per replication',
    () => {
      const { building, elevatorSpecs, trafficProfiles, dispatcherProfiles } = shipped();
      const profile = dispatcherProfiles.profiles.find((one) => one.id === 'collective');
      const started = process.hrtime.bigint();
      recordRun(
        {
          building,
          dispatcherProfile: profile!,
          trafficProfiles,
          elevatorSpecs,
          seed: 376n,
          durationS: 3600,
          onTimeout: 'report',
          runId: 'burj-376-cost',
        } as never,
        { recordDecisions: false },
      );
      const seconds = Number((process.hrtime.bigint() - started) / 1_000_000n) / 1000;
      expect(seconds).toBeLessThan(60);
    },
    TIMEOUT_MS,
  );

  /**
   * **§ D527's fourth measurement: escalators earn their field.**
   *
   * `data/buildings/README.md`'s rule is that a declared mode with zero hops is a dead field, so the
   * hops are counted over **every** ordered floor pair rather than sampled. Two results, and the
   * second is the one #376 asked for:
   *
   * 1. Every one of the 27 060 pairs is reachable. On a building with three sky lobbies and four
   *    local banks that is not a given, and an unreachable pair would be a floor nobody can get to.
   * 2. **28 hops** are taken across the four declared edges — 6, 8, 8 and 6 — and `docs/04` § 9
   *    quotes that figure, so it is asserted here rather than left to a reader to re-derive. It was
   *    published as 24 first, by arithmetic rather than by a run; the count below is what the run
   *    says. `CLAUDE.md`: *if you publish a number, pin it to the run that produced it*.
   * 3. With a *pair* of escalators at each landing — which is what the reference tower has — **four
   *    of the eight took zero hops**. As modelled an escalator is an undirected, uncapacitated edge,
   *    so the second of an identical pair can never be chosen. One edge per landing is declared and
   *    the finding is recorded, which is the evidence § D527 wanted before anybody adds capacity or
   *    direction: a second escalator cannot change a decision until an escalator can be full.
   */
  it('routes every floor pair, and every declared escalator takes a hop', () => {
    const { building } = shipped();
    const planner = new RoutePlanner(routeTopologyOf(building));
    const floors = building.floors.map((floor) => floor.id);

    const hopsByMode = new Map<string, number>();
    let pairs = 0;
    let reachable = 0;
    for (const from of floors) {
      for (const to of floors) {
        if (from === to) continue;
        pairs += 1;
        const plan = planner.plan(from, to);
        if (plan === undefined) continue;
        reachable += 1;
        for (const segment of plan.segments) {
          if (segment.kind !== 'transport') continue;
          hopsByMode.set(segment.modeId, (hopsByMode.get(segment.modeId) ?? 0) + 1);
        }
      }
    }

    expect(pairs).toBe(165 * 164);
    expect(reachable, 'a floor pair nothing can route is a floor nobody can reach').toBe(pairs);

    const declared = (building.transportModes ?? []).map((mode) => mode.id);
    expect(declared.length).toBeGreaterThan(0);
    expect(
      declared.filter((id) => (hopsByMode.get(id) ?? 0) === 0),
      'a declared transport mode with zero hops is a dead field — data/buildings/README.md',
    ).toEqual([]);

    /* The figure `docs/04` § 9 quotes. Pinned per mode rather than as a total, so a change that
       moved a hop from one landing to another could not net out to the same number. */
    expect(
      Object.fromEntries([...hopsByMode].sort(([a], [b]) => a.localeCompare(b))),
      'the escalator hop count docs/04 § 9 publishes has moved',
    ).toEqual({ 'escalator-1': 6, 'escalator-2': 8, 'escalator-3': 8, 'escalator-4': 6 });
    expect([...hopsByMode.values()].reduce((sum, n) => sum + n, 0)).toBe(28);
  });
});
