/**
 * **What a surface's runs cost the thread that paints** — the deriver behind GitHub issue #165's
 * table, and the instrument that decides whether moving a surface to a worker is worth its
 * complexity.
 *
 * Issue #165 tabulates three surfaces against costs *"as stated"* — each lane's own sentence in
 * its own docstring, none of them re-derived since. CLAUDE.md's rule is that a published number is
 * pinned to the run that produced it, so this file is that run. It measures, per shipped case:
 *
 * - `recordRun`'s wall clock — the **blocking** figure, what the main thread loses today;
 * - `structuredClone` of the config out and of the recording back — the **upper bound** on what
 *   the main thread still pays once the run is on a worker, which is the same claim
 *   `dev/shiftRunner.ts`'s header makes about the shift and for the same reason: a `postMessage`
 *   splits the clone across two threads, this file does not measure the split, so what is
 *   published is the whole clone.
 *
 * ## Why the second figure is an upper bound and not a measurement of the after state
 *
 * The after state is a browser fact — the main thread is free while the worker runs — and this
 * project is Node. `everyday/fixitScreen.browser.test.ts` and `dev/fixit.browser.test.ts` measure
 * it where it lives, by counting the frames the page rendered during a run and the longest gap
 * between two of them. What this file adds is the part a browser cannot separate: how much of the
 * remaining hitch is transport rather than simulation.
 *
 * ## It asserts almost nothing, on `honesty/measure.corpus.test.ts`'s ground
 *
 * A pin on a wall-clock figure goes red on a busy machine and trains people to edit the number.
 * The one assertion kept is a **floor**: every shipped case must actually run, because a
 * measurement over an empty set publishes zeros that read like a fast surface. The figures
 * themselves are written to a file rather than logged, because vitest 4 intercepts `console.log`
 * and a figure nobody can read off a run is why measurements here keep being skipped.
 *
 * ## Skipped unless asked for
 *
 * Gated on `SURFACE_RUNS_OUT`, so the default suite neither runs it nor pays for it:
 *
 * ```
 * SURFACE_RUNS_OUT=/tmp/surface-runs.txt \
 *   npx vitest run --project viz packages/viz/src/dev/measure.surfaceRuns.test.ts
 * ```
 *
 * ## Three more surfaces, added for GitHub issue #410, and the membership is the finding
 *
 * Issue #410 inherits #238's clause about *"the three main-thread simulation surfaces"* and names
 * them: `dev/main.ts`'s § 1.4 re-simulate, `frame/overlay.ts` and `live/observations.ts`. That list
 * was re-derived from the module graph rather than transcribed, and **none of the three is a
 * main-thread simulation today**:
 *
 * - `dev/main.ts`'s re-simulate is a worker round trip already — `interveneAt` calls `runShift`,
 *   which is `dev/shiftRunner.ts` over `dev/shiftWorker.ts`, the UI readiness audit's B3;
 * - `frame/overlay.ts#overlayAt` and `live/observations.ts#observationsAt` **never simulate**. They
 *   are pure folds of a finished recording, drawn per frame. `frame/measure.perFrame.test.ts` is
 *   their instrument and `frame/perFrameBudget.test.ts` is their enforced bound.
 *
 * What the graph does find, and what the issue does not name, is **three** surfaces that constructed
 * a `Simulation` on the thread that paints: `dev/main.ts#runChallenge`, `dev/main.ts`'s
 * `simulateRecord` binding for `everyday/host.ts#watchRun` — the Everyday Watch reproduction gate,
 * which is issue #165's own defect still live on the shell `index.html` opens — and `failStates`
 * in `dev/campaignPanel.ts`. The first two moved to a worker on #410 and the third is bounded in
 * `campaign/failStateBudget.test.ts`, because 3–68 ms behind a message port is slower than 3–68 ms.
 *
 * `dev/mainThreadSimulation.test.ts` derives that set from the imports on every shipped run, in
 * both directions, so **this** docstring cannot go stale the way the issue's list did: the register
 * is the claim and this paragraph is a reading of it.
 *
 * The rows below are what all three cost, and they are kept after the move rather than deleted with
 * it. A measurement is what says a bound is a bound and what would say a move stopped being worth
 * its complexity, and neither question survives its own answer.
 *
 * Recorded here under [§ D405](../../../../DECISIONS.md): the decision this file takes — *measure
 * the surfaces rather than quote them* — binds nothing outside this module, and this docstring is
 * the record the working agreement asks for.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
} from '@elevator-sim/core';
import { describe, expect, it } from 'vitest';

import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';

import { useCampaignFixture } from '../campaign/campaign.test-helper.js';
import { demonstrationConfigFor } from '../campaign/stageRun.js';
import { emptyFixitState, toggleRepair } from '../fixit/engine.js';
import { fixitContextOf, parseFixitCases } from '../fixit/parse.js';
import { fixitRunPlanOf } from '../fixit/run.js';
import type { FixitCase, FixitState } from '../fixit/types.js';
import { MAX_CHALLENGE_SEEDS, challengeRunConfigs, type ChallengeView } from '../menu/challenge.js';
import { recordRun } from '../record/recordRun.js';
import { watchRecordOf, watchRunConfigOf } from '../watch/record.js';
import { parseReferenceRuns } from '../watch/reference.js';

import type { BrowserResources } from './data.js';
import { buildingNameOf, initialState } from './state.js';
import type { ViewerState } from './state.js';

const OUT = process.env['SURFACE_RUNS_OUT'];
const TIMEOUT_MS = 900_000;

const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

const dataFile = (name: string): unknown =>
  JSON.parse(readFileSync(join(DATA_DIR, name), 'utf8')) as unknown;

/**
 * Every shipped building, not the two `scope/probes.test-helper.ts` bounds itself to.
 *
 * The population being measured is *what a player meets*, and eight of the eighteen fixit cases
 * name a tower that helper does not load — so its `RESOURCES` refuses the case file outright. The
 * browser loads all of `data/buildings/`; so does this.
 */
function shippedResources(): BrowserResources {
  const elevatorSpecs = parseElevatorSpecs(dataFile('elevator-specs.json'));
  const trafficProfiles = parseTrafficProfiles(dataFile('traffic-profiles.json'));
  const names = readdirSync(join(DATA_DIR, 'buildings'))
    .filter((name) => name.endsWith('.json'))
    .sort();
  const trafficProfileIds = new Set(trafficProfiles.profiles.map((profile) => profile.id));
  const entries = names.map((name) => {
    const config = parseBuilding(dataFile(join('buildings', name)), name);
    return {
      file: name,
      config,
      resolved: resolveBuilding(config, elevatorSpecs, { file: name, trafficProfileIds }),
    };
  });
  return {
    priceSchedule: shippedPriceSchedule(),
    elevatorSpecs,
    trafficProfiles,
    dispatcherProfiles: parseDispatcherProfiles(dataFile('dispatcher-profiles.json')),
    buildings: entries.map((entry) => entry.resolved),
    entries,
    trafficProfileIds,
    warnings: [],
  };
}

const RESOURCES = shippedResources();

/** The state a watch press is made from — `watch/reference.test.ts`'s own base, seed and all. */
function baseState(): ViewerState {
  return { ...initialState(RESOURCES, 20260804n), buildingId: 'garden-apartments', shiftLengthS: 900 };
}

/** One timed call. `performance.now()` is the monotonic reading — `playback/clock.ts`'s own choice. */
function timed<T>(body: () => T): { readonly ms: number; readonly value: T } {
  const started = performance.now();
  const value = body();
  return { ms: performance.now() - started, value };
}

function shippedCases(): readonly FixitCase[] {
  return parseFixitCases(
    dataFile('fixit-cases.json'),
    fixitContextOf({
      schedule: shippedPriceSchedule(),
      buildings: RESOURCES.entries.map((entry) => entry.resolved),
      trafficProfiles: RESOURCES.trafficProfiles,
      dispatcherProfiles: RESOURCES.dispatcherProfiles,
    }),
  ).cases;
}

/** The state a player presses `Run the day` in: the diagnosed repair selected, as the tier does. */
function diagnosedState(entry: FixitCase): FixitState {
  const diagnosed = entry.repairs.find((repair) => repair.role === 'diagnosed');
  return diagnosed === undefined
    ? emptyFixitState()
    : toggleRepair(entry, emptyFixitState(), diagnosed.id, shippedPriceSchedule());
}

/**
 * A challenge as the server issues one, at the **most seeds this build will run**.
 *
 * Constructed rather than fetched, on `scope/probes.test-helper.ts#PROBE_CHALLENGE`'s stated
 * ground: `viz` ships no challenge and must build with `packages/server` absent, so the wire shape
 * is assembled here. Two things are chosen rather than copied, and both are what makes this the
 * population rather than a sample of it:
 *
 * - the seed count is {@link MAX_CHALLENGE_SEEDS}, which is `viz`'s **own** bound on what a press
 *   can be asked to run — `challengeRunConfigs` refuses above it — so this is the ceiling a player
 *   can meet rather than the five the rotation happens to name today;
 * - the building is swept over everything `data/buildings/` ships, because a challenge names a
 *   building and the server's rotation is not this package's to know. A cost measured on the
 *   cheapest tower is the stale-refusal shape `dev/offThreadRuns.ts` records about Watch.
 *
 * `durationS` is the caller's, because nothing in `challengeRunConfigs` bounds it and the sweep
 * above therefore has a ceiling row as well as a per-building one.
 */
function challengeViewFor(buildingId: string, durationS: number): ChallengeView {
  const config = Object.freeze({
    buildingId,
    demandTemplateId: 'rise-and-fall',
    arrivalRatePctPop5min: 3,
    durationS,
  });
  const seeds = Object.freeze(
    Array.from({ length: MAX_CHALLENGE_SEEDS }, (_, index) => String(1001 + index)),
  );
  return Object.freeze({
    challenge: Object.freeze({
      id: `measure-${buildingId}`,
      name: 'Measurement',
      brief: 'Built here, because this package ships no challenge.',
      config,
      seeds,
      opensAtMs: 0,
      closesAtMs: 0,
    }),
    state: 'open' as const,
    seedCount: seeds.length,
    opensInMs: null,
    closesInMs: 3_600_000,
    clockNote: 'The server decides which challenge is open.',
    dataHash: null,
    compare: Object.freeze({ note: '', ...config }),
  });
}

interface Row {
  readonly surface: string;
  readonly id: string;
  readonly blockingMs: number;
  readonly cloneOutMs: number;
  readonly cloneBackMs: number;
  /**
   * Legs the press simulated — the **load-independent** column, added for GitHub issue #410.
   *
   * Every other figure here is wall clock, and `vitest.config.ts#SIMULATING_TIMEOUT_MS` measured
   * this repository's own amplification under load at about ninefold. So a budget in milliseconds
   * asserted in the suite would measure the runner, which is issue #335 and which #410 names as
   * the reason bounding is not the cheap option it looks like. A leg count is the same integer on
   * every machine and rises with exactly the thing that makes a run expensive, so it is the unit a
   * bound can be **enforced** in. This column is what pairs the two: it is published beside the
   * milliseconds so a reader can see what a leg costs here before trusting a bound written in legs.
   */
  readonly legs: number;
}

function line(row: Row): string {
  return [
    row.surface.padEnd(22),
    row.id.padEnd(30),
    `blocking=${row.blockingMs.toFixed(0)}ms`.padEnd(18),
    `legs=${String(row.legs)}`.padEnd(13),
    `cloneOut=${row.cloneOutMs.toFixed(1)}ms`.padEnd(20),
    `cloneBack=${row.cloneBackMs.toFixed(1)}ms`,
  ].join(' ');
}

function summary(name: string, rows: readonly Row[]): string {
  if (rows.length === 0) return `${name}: no rows\n`;
  const blocking = rows.map((row) => row.blockingMs).sort((a, b) => a - b);
  const transport = rows
    .map((row) => row.cloneOutMs + row.cloneBackMs)
    .sort((a, b) => a - b);
  const legs = rows.map((row) => row.legs).sort((a, b) => a - b);
  const total = blocking.reduce((sum, ms) => sum + ms, 0);
  return (
    `${name}: n=${String(rows.length)} ` +
    `blocking min=${(blocking[0] ?? 0).toFixed(0)}ms ` +
    `median=${(blocking[blocking.length >> 1] ?? 0).toFixed(0)}ms ` +
    `max=${(blocking[blocking.length - 1] ?? 0).toFixed(0)}ms ` +
    `sum=${total.toFixed(0)}ms | ` +
    `transport min=${(transport[0] ?? 0).toFixed(1)}ms ` +
    `median=${(transport[transport.length >> 1] ?? 0).toFixed(1)}ms ` +
    `max=${(transport[transport.length - 1] ?? 0).toFixed(1)}ms | ` +
    // The pairing a bound written in legs has to be read against — see `Row.legs`.
    `legs min=${String(legs[0] ?? 0)} ` +
    `median=${String(legs[legs.length >> 1] ?? 0)} ` +
    `max=${String(legs[legs.length - 1] ?? 0)} ` +
    `ms-per-1000-legs=${
      legs.reduce((sum, n) => sum + n, 0) === 0
        ? 'n/a'
        : ((1000 * total) / legs.reduce((sum, n) => sum + n, 0)).toFixed(2)
    }\n`
  );
}

describe.skipIf(OUT === undefined)('what a surface’s runs cost the painting thread', () => {
  const campaign = useCampaignFixture();

  it(
    'measures every surface that simulates on the thread that paints, and writes the figures where a reporter cannot eat them',
    () => {
      const rows: Row[] = [];

      /*
       * **Fix-a-building.** Both shells run the same `fixit/run.ts` chain, so one measurement
       * answers for both: `everyday/fixitScreen.ts` and `dev/fixitPanel.ts` differ in palette and
       * in nothing that costs a millisecond. Two runs per case are timed because that is what a
       * press does — as-built and as-repaired — and the as-built one is timed separately because
       * it is also what opening a case does on its own.
       */
      for (const entry of shippedCases()) {
        const plan = fixitRunPlanOf(entry, diagnosedState(entry), RESOURCES);
        const asBuilt = timed(() => recordRun(plan.asBuilt, { recordDecisions: false }));
        const asRepaired = timed(() => recordRun(plan.asRepaired, { recordDecisions: false }));
        rows.push({
          surface: 'fixit/open',
          id: entry.id,
          blockingMs: asBuilt.ms,
          legs: asBuilt.value.recording.legs.length,
          cloneOutMs: timed(() => structuredClone(plan.asBuilt)).ms,
          cloneBackMs: timed(() => structuredClone(asBuilt.value.recording)).ms,
        });
        rows.push({
          surface: 'fixit/press',
          id: entry.id,
          blockingMs: asBuilt.ms + asRepaired.ms,
          legs: asBuilt.value.recording.legs.length + asRepaired.value.recording.legs.length,
          cloneOutMs:
            timed(() => structuredClone(plan.asBuilt)).ms +
            timed(() => structuredClone(plan.asRepaired)).ms,
          cloneBackMs:
            timed(() => structuredClone(asBuilt.value.recording)).ms +
            timed(() => structuredClone(asRepaired.value.recording)).ms,
        });
      }

      /*
       * **Watch.** One run per press, on the record the row was filed with — `watch/library.ts`'s
       * gate is what runs it, and `watchRunConfigOf` is the config it runs. The shipped reference
       * runs are the rows a first visit offers, so they are the population a player meets.
       */
      const references = parseReferenceRuns(dataFile('reference-runs.json'), (id) =>
        buildingNameOf(RESOURCES, [], id),
      );
      for (const run of references) {
        const record = run.record;
        if (record === null) continue;
        const config = watchRunConfigOf(baseState(), RESOURCES, record);
        const recorded = timed(() => recordRun(config));
        rows.push({
          surface: 'watch/press',
          id: run.id,
          blockingMs: recorded.ms,
          legs: recorded.value.recording.legs.length,
          cloneOutMs: timed(() => structuredClone(config)).ms,
          cloneBackMs: timed(() => structuredClone(recorded.value.recording)).ms,
        });
      }

      /*
       * **A filed day, which is not a reference run — and a floor rather than a worst case.** The
       * shipped references are two small days; a *filed* day is whatever the player ran, and the
       * menu's ceiling is `menu/types.ts#LONGEST_OFFERED_RUN_S` on any tower they have played. So
       * the population a stated cost has to cover includes Vertical City at 7 200 s.
       *
       * This runs that tower on **its own** demand rather than on `constant-iso`, which is what
       * `dev/shiftRunner.ts` measured at 21–31 s under `collective` and moved the shift to a worker
       * for. A day run that way can be filed too, so what this row establishes is that the stated
       * ceiling was already exceeded well before the heaviest thing the menu allows — not what the
       * heaviest thing costs. Measured here rather than inherited from that docstring, because it
       * is a different machine and a different year.
       */
      const worstRecord = watchRecordOf(
        { ...baseState(), buildingId: 'vertical-city', shiftLengthS: 7200 },
        RESOURCES,
      );
      if (worstRecord !== undefined) {
        const config = watchRunConfigOf(baseState(), RESOURCES, worstRecord);
        const recorded = timed(() => recordRun(config));
        rows.push({
          surface: 'watch/press',
          id: 'filed-day/vertical-city@7200s',
          blockingMs: recorded.ms,
          legs: recorded.value.recording.legs.length,
          cloneOutMs: timed(() => structuredClone(config)).ms,
          cloneBackMs: timed(() => structuredClone(recorded.value.recording)).ms,
        });
      }

      /*
       * **The challenge press** — GitHub issue #410. `dev/main.ts#runChallenge` builds the seed
       * set with `challengeRunConfigs` and runs it in a `for` loop, and the loop is the row: a
       * press is *n* runs, not one, and the surface's own docstring called them *"a few hundred
       * milliseconds"* without ever running them. The pair measured here is exactly the pair the
       * shell performs, which is `scope/probes.test-helper.ts`'s standard for this path.
       *
       * `recordDecisions: false` because that is what the shell passes. It is not a saving taken
       * for the measurement: a decision log is *in* the recording, so timing the run with one
       * would be timing a different run.
       */
      const challengePress = (buildingId: string, durationS: number): void => {
        const built = challengeRunConfigs(
          challengeViewFor(buildingId, durationS),
          RESOURCES,
          'collective',
        );
        if (!built.ok) return;
        let blockingMs = 0;
        let cloneOutMs = 0;
        let cloneBackMs = 0;
        let legs = 0;
        for (const run of built.runs) {
          const recorded = timed(() => recordRun(run.config, { recordDecisions: false }));
          blockingMs += recorded.ms;
          legs += recorded.value.recording.legs.length;
          cloneOutMs += timed(() => structuredClone(run.config)).ms;
          cloneBackMs += timed(() => structuredClone(recorded.value.recording)).ms;
        }
        rows.push({
          surface: 'challenge/press',
          id: `${buildingId}@${String(durationS)}s×${String(built.runs.length)}`,
          blockingMs,
          legs,
          cloneOutMs,
          cloneBackMs,
        });
      };

      for (const building of RESOURCES.buildings) challengePress(building.id, 900);

      /*
       * **The ceiling, and it is a different row rather than a caveat on the ones above.** Nothing
       * in `challengeRunConfigs` bounds `durationS` — it checks the building, the dispatcher, the
       * template and the seed count and nothing else — so the length is the server's to name, and
       * `leaderboard/submission.ts#ACCEPTED_DURATIONS_S` accepts 1 800, 3 600, 7 200 and a whole
       * authored day above the 900 the rotation uses today. A cost measured only at 900 s is
       * `dev/offThreadRuns.ts`'s own Watch finding again: a stated cost taken on the cheap half of
       * its population.
       */
      challengePress('vertical-city', 7200);

      /*
       * **The campaign panel's fail-state replay** — the second surface #410 does not name.
       * `dev/campaignPanel.ts#failStates` runs replication 0 again on this thread, *after* the
       * batch it diagnoses has come back from `dev/batchWorker.ts`. So the panel already pays the
       * worker's transport for the fifty and then blocks for one more run on top of it, which is
       * the shape worth having a number for.
       *
       * One row per shipped stage, at the stage's own building, duration and arrival rate — the
       * population is `data/campaign.json` and it is read rather than described.
       */
      const loaded = campaign.campaign;
      for (const stage of loaded.stages) {
        const building = RESOURCES.buildings.find((entry) => entry.id === stage.building);
        const dispatcherProfile = RESOURCES.dispatcherProfiles.profiles.find(
          (entry) => entry.id === 'collective',
        );
        if (building === undefined || dispatcherProfile === undefined) continue;
        const config = demonstrationConfigFor({
          stage,
          building,
          dispatcherProfile,
          trafficProfiles: RESOURCES.trafficProfiles,
          elevatorSpecs: RESOURCES.elevatorSpecs,
          dispatcherProfiles: RESOURCES.dispatcherProfiles,
        });
        const recorded = timed(() => recordRun(config));
        rows.push({
          surface: 'campaign/fail-states',
          id: stage.id,
          blockingMs: recorded.ms,
          legs: recorded.value.recording.legs.length,
          cloneOutMs: timed(() => structuredClone(config)).ms,
          cloneBackMs: timed(() => structuredClone(recorded.value.recording)).ms,
        });
      }

      // The floor, and the only assertion: a measurement over an empty set publishes zeros that
      // read like a fast surface.
      expect(rows.filter((row) => row.surface === 'fixit/open').length).toBeGreaterThan(0);
      expect(rows.filter((row) => row.surface === 'watch/press').length).toBeGreaterThan(0);
      expect(rows.filter((row) => row.surface === 'challenge/press').length).toBeGreaterThan(0);
      expect(rows.filter((row) => row.surface === 'campaign/fail-states').length).toBeGreaterThan(0);

      const bySurface = [
        'fixit/open',
        'fixit/press',
        'watch/press',
        'challenge/press',
        'campaign/fail-states',
      ];
      const body = [
        'surface runs — blocking wall clock against transport (structured clone both ways)',
        `node ${process.version}`,
        '',
        ...rows.map(line),
        '',
        ...bySurface.map((name) =>
          summary(
            name,
            rows.filter((row) => row.surface === name),
          ),
        ),
      ].join('\n');
      writeFileSync(OUT ?? '', body, 'utf8');
    },
    TIMEOUT_MS,
  );
});
