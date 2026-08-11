/**
 * `data/reference-runs.json`, re-simulated — the pin CLAUDE.md's *"if you publish a number, pin it
 * to the run that produced it"* asks for.
 *
 * Every figure in the file is re-derived here from the record beside it, through the shipped chain:
 * `stateFromWatchRecord` → `shiftRunConfigOf` → `recordRun` → `postedResultOf`. Not one number is
 * transcribed. If `core` or `data/` moves under the file this suite says which figure moved, and
 * the fix is a new run rather than a new number.
 *
 * It also drives the two things the file itself cannot assert about itself: that the FIXTURE marker
 * is required verbatim (§ 20.11), and that a run's `source` is `'reference'` no matter what the
 * file says.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { recordRun } from '../record/recordRun.js';
import { RESOURCES, baseState } from '../scope/probes.test-helper.js';
import { buildingNameOf } from '../dev/state.js';

import { checkedRun } from './library.js';
import { FIXTURE_MARKER, ReferenceRunsError, parseReferenceRuns } from './reference.js';
import { postedResultOf } from './reproduce.js';
import { watchRunConfigOf } from './record.js';

const RAW = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../../data/reference-runs.json', import.meta.url)), 'utf8'),
) as unknown;

const nameOf = (id: string): string => buildingNameOf(RESOURCES, [], id);

describe('the shipped reference runs', () => {
  it('reads, and every run is a reference run rather than a player', () => {
    const runs = parseReferenceRuns(RAW, nameOf);
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) expect(run.source).toBe('reference');
  });

  it('refuses a file whose FIXTURE marker is missing or altered', () => {
    const file = RAW as Record<string, unknown>;
    expect(() => parseReferenceRuns({ ...file, fixture: undefined }, nameOf)).toThrow(
      ReferenceRunsError,
    );
    expect(() =>
      parseReferenceRuns({ ...file, fixture: `${FIXTURE_MARKER} ` }, nameOf),
    ).toThrow(ReferenceRunsError);
  });

  it('names its building from the record rather than from a second field', () => {
    for (const run of parseReferenceRuns(RAW, nameOf)) {
      expect(run.record).not.toBeNull();
      expect(run.buildingName).toBe(nameOf(run.record?.buildingId ?? ''));
    }
  });

  /*
   * The pin. One `it` per run so a failure names which fixture went stale rather than reporting
   * "the reference runs" as a single red line.
   */
  for (const run of parseReferenceRuns(RAW, nameOf)) {
    it(`reproduces the figures “${run.label}” was filed with`, () => {
      const record = run.record;
      expect(record).not.toBeNull();
      if (record === null) return;
      const { recording } = recordRun(watchRunConfigOf(baseState(), RESOURCES, record));
      expect(postedResultOf(recording)).toEqual(run.posted);
    }, 120_000);

    it(`passes the product's own reproduction gate — “${run.label}”`, () => {
      const checked = checkedRun(
        run,
        RESOURCES,
        baseState(),
        (config) => recordRun(config).recording,
      );
      expect(checked.run.blocked).toBeNull();
      expect(checked.recording).toBeDefined();
    }, 120_000);
  }
});
