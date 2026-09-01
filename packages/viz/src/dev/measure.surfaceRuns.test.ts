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
 * Recorded here under [§ D405](../../../../DECISIONS.md): the decision this file takes — *measure
 * the three surfaces rather than quote them* — binds nothing outside this module, and this
 * docstring is the record the working agreement asks for.
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

import { emptyFixitState, toggleRepair } from '../fixit/engine.js';
import { parseFixitCases } from '../fixit/parse.js';
import { fixitRunPlanOf } from '../fixit/run.js';
import type { FixitCase, FixitState } from '../fixit/types.js';
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
  return parseFixitCases(dataFile('fixit-cases.json'), {
    floorIdsByBuilding: new Map(
      RESOURCES.entries.map((entry) => [
        entry.resolved.id,
        entry.resolved.floors.map((floor) => floor.id),
      ]),
    ),
    profileIds: new Set(RESOURCES.dispatcherProfiles.profiles.map((profile) => profile.id)),
    engineIds: [
      ...RESOURCES.entries.map((entry) => entry.resolved.id),
      ...RESOURCES.dispatcherProfiles.profiles.map((profile) => profile.id),
    ],
  }).cases;
}

/** The state a player presses `Run the day` in: the diagnosed repair selected, as the tier does. */
function diagnosedState(entry: FixitCase): FixitState {
  const diagnosed = entry.repairs.find((repair) => repair.role === 'diagnosed');
  return diagnosed === undefined
    ? emptyFixitState()
    : toggleRepair(entry, emptyFixitState(), diagnosed.id);
}

interface Row {
  readonly surface: string;
  readonly id: string;
  readonly blockingMs: number;
  readonly cloneOutMs: number;
  readonly cloneBackMs: number;
}

function line(row: Row): string {
  return [
    row.surface.padEnd(22),
    row.id.padEnd(30),
    `blocking=${row.blockingMs.toFixed(0)}ms`.padEnd(18),
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
  const total = blocking.reduce((sum, ms) => sum + ms, 0);
  return (
    `${name}: n=${String(rows.length)} ` +
    `blocking min=${(blocking[0] ?? 0).toFixed(0)}ms ` +
    `median=${(blocking[blocking.length >> 1] ?? 0).toFixed(0)}ms ` +
    `max=${(blocking[blocking.length - 1] ?? 0).toFixed(0)}ms ` +
    `sum=${total.toFixed(0)}ms | ` +
    `transport min=${(transport[0] ?? 0).toFixed(1)}ms ` +
    `median=${(transport[transport.length >> 1] ?? 0).toFixed(1)}ms ` +
    `max=${(transport[transport.length - 1] ?? 0).toFixed(1)}ms\n`
  );
}

describe.skipIf(OUT === undefined)('what a surface’s runs cost the painting thread', () => {
  it(
    'measures Fix-a-building and Watch, and writes the figures where a reporter cannot eat them',
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
          cloneOutMs: timed(() => structuredClone(plan.asBuilt)).ms,
          cloneBackMs: timed(() => structuredClone(asBuilt.value.recording)).ms,
        });
        rows.push({
          surface: 'fixit/press',
          id: entry.id,
          blockingMs: asBuilt.ms + asRepaired.ms,
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
          cloneOutMs: timed(() => structuredClone(config)).ms,
          cloneBackMs: timed(() => structuredClone(recorded.value.recording)).ms,
        });
      }

      // The floor, and the only assertion: a measurement over an empty set publishes zeros that
      // read like a fast surface.
      expect(rows.filter((row) => row.surface === 'fixit/open').length).toBeGreaterThan(0);
      expect(rows.filter((row) => row.surface === 'watch/press').length).toBeGreaterThan(0);

      const bySurface = ['fixit/open', 'fixit/press', 'watch/press'];
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
