/**
 * **The house's rush rows, always-on** — GitHub issue #418 and § D547.
 *
 * The default suite pays for none of the sweep. `rushHouseSweep.test.ts` replays every cell behind
 * `ELEVATOR_SIM_RUSH_HOUSE=deep`. What this file holds costs a table read, one `loadConfig` and two
 * rushes — one on the smallest shipped building, one on a tower whose first contract scales occupancy:
 *
 * - the table is pinned to the stream this build generates and names its own command;
 * - it covers every shipped dispatcher on every shipped building, and nothing else;
 * - its cheapest cell replays here, so a moved `core` fails the default suite and does not wait for a
 *   week's schedule, and so does a Chancery House cell, so a rush sized from the player's week rather
 *   than the building fails it too;
 * - the screen's rows are the house's, in § D521's word, with no mean on any of them;
 * - a building the house never ran, or a table from a different climb, draws a refusal rather than
 *   borrowed rows.
 */

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { DATA_DIR, shippedBuildingIds } from '../fixtures.test-helper.js';

import { BOARD_SCREEN_COPY } from './boardScreen.js';
import { heldClock } from './rush.js';
import {
  RUSH_HOUSE_COPY,
  RUSH_HOUSE_TABLE,
  parseRushHouseTable,
  rushStandingsOf,
  type RushHouseRowView,
  type RushHouseTable,
} from './rushHouse.js';
import { RUSH_HOUSE_COMMAND, browserResourcesFrom, measureRushHouseRun } from './rushHouse.test-helper.js';
import { LAST_GENERATED_WAVE, RUSH_HOLD_LINE, RUSH_STREAM, playerWaveAt } from './rushScreenModel.js';

let config: LoadedConfig;
const nameOf = (id: string): string | undefined => config.dispatcherProfilesById.get(id)?.name;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
});

function rowsFor(buildingId: string): readonly RushHouseRowView[] {
  const view = rushStandingsOf(buildingId, nameOf);
  if (view.kind !== 'rows') throw new Error(`${buildingId} drew ${view.kind}, not rows`);
  return view.rows;
}

describe('the table is a measurement, pinned to this build’s stream', () => {
  it('names the seed, the stream, the hold line and the command that regenerates it', () => {
    const p = RUSH_HOUSE_TABLE.provenance;
    expect(p.kind).toBe('measured');
    expect(p.seed).toBe(String(RUSH_STREAM.seed));
    expect(p.streamLengthS).toBe(RUSH_STREAM.lengthS);
    expect(p.holdLine).toEqual({ people: RUSH_HOLD_LINE.people, overS: RUSH_HOLD_LINE.overS });
    expect(p.command).toBe(RUSH_HOUSE_COMMAND);
    expect(p.tree).toMatch(/^[0-9a-f]{7,40}$/u);
    expect(p.measuredAt).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
  });

  it('measures every shipped dispatcher on every shipped building, and nothing else', () => {
    const expected = shippedBuildingIds(config).flatMap((buildingId) =>
      config.dispatcherProfiles.profiles.map((profile) => `${buildingId}#${profile.id}`),
    );
    const measured = RUSH_HOUSE_TABLE.runs.map((run) => `${run.buildingId}#${run.dispatcherId}`);
    expect([...measured].sort()).toEqual([...expected].sort());
  });

  it('replays its cheapest cell here, and matches the file to the figure', () => {
    /*
     * `garden-apartments` × `collective`: a few hundred milliseconds, and the shipped default
     * dispatcher on the smallest shipped building. Every other cell is the sweep's.
     */
    const resources = browserResourcesFrom(config);
    const published = RUSH_HOUSE_TABLE.runs.find(
      (run) => run.buildingId === 'garden-apartments' && run.dispatcherId === 'collective',
    );
    expect(published).toBeDefined();
    expect(measureRushHouseRun(resources, 'garden-apartments', 'collective')).toEqual(published);
  });

  it('replays a cell on a tower whose first contract scales occupancy, and matches the file to the figure', () => {
    /*
     * `chancery-house` × `collective`. The garden cell cannot see whose population sizes the stream:
     * Garden Apartments' first contract leaves the tower as authored, and § D547 measured 3 466 legs
     * there either way. Midtown Office and Chancery House are the two towers where it moved, and the
     * table's 26 rows on them were first measured with the stream sized from the player's week (§ D548).
     */
    const resources = browserResourcesFrom(config);
    const published = RUSH_HOUSE_TABLE.runs.find(
      (run) => run.buildingId === 'chancery-house' && run.dispatcherId === 'collective',
    );
    expect(published).toBeDefined();
    expect(measureRushHouseRun(resources, 'chancery-house', 'collective')).toEqual(published);
  });
});

describe('the standings are the house’s runs on the standing building', () => {
  it('uses the daily board’s word for the house, so a player meets one word for the game’s own runs', () => {
    expect(RUSH_HOUSE_COPY.tag).toBe(BOARD_SCREEN_COPY.dailyHouseTag);
  });

  it('draws one row per shipped dispatcher, every one tagged, furthest first', () => {
    for (const buildingId of shippedBuildingIds(config)) {
      const rows = rowsFor(buildingId);
      expect(rows.map((row) => row.dispatcherId).sort()).toEqual(
        config.dispatcherProfiles.profiles.map((profile) => profile.id).sort(),
      );
      for (const row of rows) {
        expect(row.tag).toBe(RUSH_HOUSE_COPY.tag);
        expect(row.name).toBe(nameOf(row.dispatcherId));
      }
      const heldFor = (id: string): number =>
        RUSH_HOUSE_TABLE.runs.find((run) => run.buildingId === buildingId && run.dispatcherId === id)?.brokeAtS ??
        Number.POSITIVE_INFINITY;
      const held = rows.map((row) => heldFor(row.dispatcherId));
      expect(held).toEqual([...held].sort((a, b) => b - a));
    }
  });

  it('draws the wave and the time a broken run held, off the same arithmetic the result uses', () => {
    const broke = RUSH_HOUSE_TABLE.runs.filter((run) => run.brokeAtS !== null);
    expect(broke.length).toBeGreaterThan(0);
    for (const run of broke) {
      const row = rowsFor(run.buildingId).find((entry) => entry.dispatcherId === run.dispatcherId);
      expect(row?.wave).toBe(`wave ${String(playerWaveAt(run.brokeAtS ?? 0))}`);
      expect(row?.held).toBe(heldClock(run.brokeAtS ?? 0));
      expect(row?.heldThrough).toBe(false);
    }
  });

  it('says a run never broke rather than inventing a wave for it', () => {
    /*
     * Measured, not assumed: on the two tallest towers most dispatchers hold the whole generated
     * climb, and `rushOutcomeOf` would otherwise read them as a run *stopped by hand* past wave 30.
     */
    const held = RUSH_HOUSE_TABLE.runs.filter((run) => run.brokeAtS === null);
    expect(held.length).toBeGreaterThan(0);
    for (const run of held) {
      const row = rowsFor(run.buildingId).find((entry) => entry.dispatcherId === run.dispatcherId);
      expect(row?.wave).toBe(RUSH_HOUSE_COPY.neverBroke);
      expect(row?.held).toBe(`all ${String(LAST_GENERATED_WAVE)} waves`);
      expect(row?.heldThrough).toBe(true);
    }
  });

  it('publishes no mean on any row', () => {
    for (const buildingId of shippedBuildingIds(config)) {
      for (const row of rowsFor(buildingId)) {
        expect(Object.keys(row).sort()).toEqual(['dispatcherId', 'held', 'heldThrough', 'name', 'tag', 'wave']);
        expect([row.wave, row.held, row.tag].join(' ')).not.toMatch(/average|mean|awt/iu);
      }
    }
  });

  it('withholds the rows on a building the house never ran, and says so', () => {
    expect(rushStandingsOf('a-tower-drawn-in-the-designer', nameOf)).toEqual({
      kind: 'withheld',
      reason: 'unrun',
      refusal: RUSH_HOUSE_COPY.unrun,
    });
  });

  it('withholds every row when the table was measured on a different climb', () => {
    const moved: RushHouseTable = {
      ...RUSH_HOUSE_TABLE,
      provenance: { ...RUSH_HOUSE_TABLE.provenance, seed: String(RUSH_STREAM.seed + 1) },
    };
    expect(rushStandingsOf('garden-apartments', nameOf, moved)).toEqual({
      kind: 'withheld',
      reason: 'stale',
      refusal: RUSH_HOUSE_COPY.stale,
    });
  });

  it('prints a dispatcher this build does not know by its id, not by somebody else’s name', () => {
    const rows = rushStandingsOf('garden-apartments', () => undefined);
    expect(rows.kind).toBe('rows');
    if (rows.kind === 'rows') for (const row of rows.rows) expect(row.name).toBe(row.dispatcherId);
  });
});

describe('the schema refuses a table that does not say what it is', () => {
  const raw = (): Record<string, unknown> => JSON.parse(JSON.stringify(RUSH_HOUSE_TABLE)) as Record<string, unknown>;
  const firstRun = (doc: Record<string, unknown>): Record<string, unknown> =>
    (doc['runs'] as Record<string, unknown>[])[0] ?? {};

  it('reads the shipped table back unchanged', () => {
    expect(parseRushHouseTable(raw())).toEqual(RUSH_HOUSE_TABLE);
  });

  it.each([
    ['a chosen provenance', (doc: Record<string, unknown>) => { (doc['provenance'] as Record<string, unknown>)['kind'] = 'chosen'; }, /provenance.kind/u],
    ['no command', (doc: Record<string, unknown>) => { delete (doc['provenance'] as Record<string, unknown>)['command']; }, /provenance.command/u],
    ['a seed that is not a seed', (doc: Record<string, unknown>) => { (doc['provenance'] as Record<string, unknown>)['seed'] = 'rush'; }, /provenance.seed/u],
    ['no runs', (doc: Record<string, unknown>) => { doc['runs'] = []; }, /runs/u],
    ['a rate where a count belongs', (doc: Record<string, unknown>) => { firstRun(doc)['arrived'] = 0.5; }, /arrived/u],
    ['more carried than arrived', (doc: Record<string, unknown>) => { firstRun(doc)['carried'] = Number(firstRun(doc)['arrived']) + 1; }, /carried more/u],
    ['a pair measured twice', (doc: Record<string, unknown>) => { (doc['runs'] as unknown[]).push(firstRun(doc)); }, /a second time/u],
  ])('refuses %s', (_name, mutate, message) => {
    const doc = raw();
    mutate(doc);
    expect(() => parseRushHouseTable(doc)).toThrow(message);
  });
});
