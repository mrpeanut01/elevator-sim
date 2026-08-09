/**
 * The batch the player's **first** press of *Run batch* runs — GitHub issue #119 item 1.
 *
 * ## The finding
 *
 * *"Zero of eight produced a usable verdict."* On the shipped defaults, one replication in fifty
 * saturated at Chancery House, the complete-case rule correctly nullified average wait, 95th-
 * percentile wait and door-to-door time, and the remaining five rows either contained zero or were
 * energy axes. The rule is right and stays; what the issue asks is that the first batch a player
 * ever runs **answer** something.
 *
 * ## What is asserted, and what is deliberately not
 *
 * Asserted: **no measure is suppressed**. That is a property of the apparatus — every pair stands
 * behind a mean, so every row has a number to report — and it is the whole of what "a default that
 * resolves" may honestly mean.
 *
 * Not asserted, ever: **which arm wins, or that any row separates at all.** A test that required a
 * `resolved` row would be this project pinning a default *for its verdict*, which is CLAUDE.md's
 * named failure mode and the thing § D156 refused twice. `INDISTINGUISHABLE` on all eight measures
 * would satisfy this file, and it should: *these two are not separated at n = 50* is an answer.
 *
 * ## The default is read, never restated
 *
 * Every field comes from the shipped source — `index.html` for the four form values, `data/` for
 * the building list, `dev/defaults.ts` for the two arms. A copy of the default written here would
 * be a second place saying what the default is, and this repository's standing lesson is what
 * happens to the copy nobody re-derives.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { batchReport } from './report.js';
import { runBatch } from './runBatch.js';
import type { BatchRequest, BatchResources } from './types.js';
import { PREFERRED_BATCH_BASELINE, PREFERRED_BATCH_CANDIDATE, preferredDispatcherId } from '../dev/defaults.js';
import { DATA_DIR } from '../fixtures.test-helper.js';

const INDEX_HTML = fileURLToPath(new URL('../../index.html', import.meta.url));

let config: LoadedConfig;
let html: string;

beforeAll(async () => {
  [config, html] = await Promise.all([loadConfig(DATA_DIR), readFile(INDEX_HTML, 'utf8')]);
}, 300_000);

/** The `value="…"` of an `<input>` by id, from the shipped page. */
function inputValue(id: string): string {
  const tag = new RegExp(`<input[^>]*id="${id}"[^>]*>`).exec(html)?.[0];
  if (tag === undefined) throw new Error(`index.html has no <input id="${id}">`);
  return /value="([^"]*)"/.exec(tag)?.[1] ?? '';
}

/** The `selected` option of a `<select>` by id, from the shipped page. */
function selectedOption(id: string): string {
  const block = new RegExp(`<select[^>]*id="${id}"[^>]*>([\\s\\S]*?)</select>`).exec(html)?.[1];
  if (block === undefined) throw new Error(`index.html has no <select id="${id}">`);
  const chosen = /<option value="([^"]*)"[^>]*\bselected\b/.exec(block)?.[1];
  if (chosen === undefined) throw new Error(`<select id="${id}"> marks no option selected`);
  return chosen;
}

/**
 * The request `dev/batchPanel.ts` builds when nothing has been touched.
 *
 * The building is the first of `resources.buildings`, because `mountBatchPanel` appends them in
 * order and sets no default — so whatever `data/` lists first is what a player opens on, and this
 * follows that rather than naming a building.
 */
function shippedDefaultRequest(): BatchRequest {
  const building = config.buildings[0];
  if (building === undefined) throw new Error('data/ ships no buildings');
  const profiles = config.dispatcherProfiles.profiles;
  const baseline = preferredDispatcherId(PREFERRED_BATCH_BASELINE, profiles) ?? profiles[0]?.id ?? '';
  const candidate = preferredDispatcherId(PREFERRED_BATCH_CANDIDATE, profiles) ?? profiles[0]?.id ?? '';
  const demandText = inputValue('batch-demand').trim();
  const level = selectedOption('batch-demand-level');
  return {
    buildingId: building.id,
    seed: inputValue('batch-seed'),
    durationS: Number(inputValue('batch-duration')),
    replications: Number(inputValue('batch-replications')),
    arms: [
      { armId: 'baseline', dispatcherProfileId: baseline },
      { armId: 'candidate', dispatcherProfileId: candidate },
    ],
    arrivalRatePctPop5min: demandText === '' ? null : Number(demandText),
    demandLevel: level === 'min' || level === 'typical' || level === 'max' ? level : undefined,
  };
}

function resourcesFor(buildingId: string): BatchResources {
  const building = config.buildingsById.get(buildingId);
  if (building === undefined) throw new Error(`no building "${buildingId}"`);
  return {
    building,
    dispatcherProfiles: config.dispatcherProfiles,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
  };
}

describe('the first batch a player runs answers every measure', () => {
  it('suppresses nothing and leaves nothing unmeasured', () => {
    const request = shippedDefaultRequest();
    const report = batchReport(runBatch(request, resourcesFor(request.buildingId)));
    const comparison = report.comparisons[0];
    expect(comparison).toBeDefined();

    /*
     * Both arms whole. This is the property, and it is stated on the arms as well as on the rows
     * because a row can only report what the arms stood behind — `quotable === n` is where a
     * suppression begins and where a regression would first show.
     */
    for (const arm of report.arms) {
      expect(
        arm.quotable,
        `${arm.dispatcherProfileName} stands behind a mean on only ${String(arm.quotable)} of ` +
          `${String(arm.n)} runs at the shipped default, so the wait rows will suppress`,
      ).toBe(arm.n);
    }

    expect(comparison?.summary.suppressed, 'a measure the shipped default cannot compare').toEqual([]);
    expect(comparison?.summary.unmeasured, 'a measure the shipped default never measured').toEqual([]);
    expect(comparison?.summary.droppedSentence).toBeNull();

    // Every row carries a number a reader can act on or read: an interval, drawn.
    for (const row of comparison?.rows ?? []) {
      expect(row.estimate, `${row.metric} has no interval at the shipped default`).not.toBeNull();
    }
  }, 300_000);

  it('opens on the band point that criterion selected, and on the building it was measured at', () => {
    /*
     * The two facts the grounds in `dev/batchPanel.ts`'s `demandLevelRow` are *about*. If either
     * moves, that docstring's measurements stop being about the shipped default and the reader is
     * being told the provenance of a batch nobody runs.
     */
    const request = shippedDefaultRequest();
    expect(request.demandLevel).toBe('min');
    expect(request.buildingId).toBe('chancery-house');
    // The demand field stays blank, so the band point is what decides the load.
    expect(request.arrivalRatePctPop5min).toBeNull();
  });

  it('runs the arrival rate the reference data declares, not a number chosen in the viewer', () => {
    /*
     * The whole reason the control is a *level* rather than a number. `office-prestige` declares
     * `{ min: 15, typical: 16, max: 17 }` and the criterion selected 15 — which is that profile's
     * own floor. Asserted against the file rather than against the number, so a re-authored profile
     * changes what the default runs at instead of leaving this test pinning a stale 15.
     */
    const request = shippedDefaultRequest();
    const building = config.buildingsById.get(request.buildingId);
    const profile = config.trafficProfiles.profiles.find(
      (entry) => entry.id === building?.trafficProfile,
    );
    expect(profile).toBeDefined();
    const level = request.demandLevel ?? 'typical';
    expect(profile?.arrivalRatePctPop5min[level]).toBe(
      Math.min(...Object.values(profile?.arrivalRatePctPop5min ?? { a: Number.NaN })),
    );
  });
});

describe('the band point moves the passengers, not just the caption', () => {
  it('offers a different population at `min` than at `typical` — the standing requirement', () => {
    /*
     * *Move the control and require the run to change*, compared on the trace rather than on a
     * window statistic. `offeredPer5Min` is a property of the generated population — what arrived,
     * before any lift touched it — so a level that reached only the report's prose and not
     * `generateTrace` leaves this identical, which is precisely the defect this repository has
     * shipped eleven times and the one a five-select editor over `patternSwitching` would have
     * been.
     *
     * Two replications, because the claim is about every run rather than about a lucky one, and
     * because this assertion should stay cheap enough to live beside the 50-replication one above.
     */
    const base: BatchRequest = {
      ...shippedDefaultRequest(),
      replications: 2,
    };
    const at = (demandLevel: 'min' | 'typical'): readonly (number | null)[] =>
      runBatch({ ...base, demandLevel }, resourcesFor(base.buildingId)).arms.flatMap((arm) =>
        arm.replications.map((rep) => rep.offeredPer5Min),
      );
    const min = at('min');
    const typical = at('typical');
    expect(min.length).toBeGreaterThan(0);
    for (const [index, value] of min.entries()) {
      expect(value, 'the run offered no demand at all, so this compares two absences').not.toBeNull();
      expect(
        value,
        `replication ${String(index)} offered the same demand at min as at typical — the band ` +
          'point reached the report and not the trace',
      ).not.toBe(typical[index]);
    }
  }, 300_000);

  it('names the band point in the report, so the number on screen has a provenance', () => {
    const request = { ...shippedDefaultRequest(), replications: 1 };
    const report = batchReport(runBatch(request, resourcesFor(request.buildingId)));
    expect(report.demandClause).toContain('min');
    // And a batch that names no level still prints exactly what it printed before the field existed.
    const legacy = batchReport(
      runBatch(
        { ...request, demandLevel: undefined },
        resourcesFor(request.buildingId),
      ),
    );
    expect(legacy.demandClause).toBe("at the building's own traffic profile");
  }, 300_000);
});
