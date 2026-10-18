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
  RUSH_HOUSE_LINE_COPY,
  rushHouseLineOf,
  rushHouseToBeatLineOf,
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
     * from a day-1 week the press already wrote Garden Apartments' own rate, and § D547 measured 3 466
     * legs there either way. Midtown Office and Chancery House are the two towers where it moved, and the
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

  /**
   * **The row the player is set to run, and only that one** — GitHub issue #565, § D858.
   *
   * The board's defect was that its figures read as targets on a path no rush screen offered. The
   * pick is on that screen now and this is how the table says which row it is aiming at. Asserted
   * in both directions, because a tag that is simply always on says nothing: with no standing
   * dispatcher named, no row wears it.
   */
  it('tags the standing dispatcher’s row and no other — GitHub issue #565', () => {
    const rows = rushStandingsOf('garden-apartments', nameOf, RUSH_HOUSE_TABLE, 'nearest-car');
    if (rows.kind !== 'rows') throw new Error(`drew ${rows.kind}, not rows`);
    const tagged = rows.rows.filter((row) => row.standingTag !== undefined);
    expect(tagged.map((row) => row.dispatcherId)).toEqual(['nearest-car']);
    expect(tagged[0]?.standingTag).toBe(RUSH_HOUSE_COPY.standingTag);
    /* It tags; it does not promote. *Furthest* is the order the eyebrow claims. */
    const order = rows.rows.map((row) => row.dispatcherId);
    const untagged = rushStandingsOf('garden-apartments', nameOf);
    if (untagged.kind !== 'rows') throw new Error('drew no rows');
    expect(untagged.rows.map((row) => row.dispatcherId)).toEqual(order);
    expect(untagged.rows.every((row) => row.standingTag === undefined)).toBe(true);
  });

  /**
   * **The note says what its rows are runs of** — GitHub issue #565's second defect, § D858.
   *
   * The clause is licensed by `everyday/rushHandover.test.ts`, which measures both halves on
   * Harbour Point: a dispatcher set before the run reproduces its row to the second, and since
   * [§ D1048](../../../../DECISIONS.md) a handover carries the whole dispatcher — so a 0:00 handover
   * to a target with nothing left behind *is* that row, and one to a target whose door timing or
   * forecast is built with the day is not. The note used to say *swaps the weight vector*, which was
   * true of the old kind and is false of the press the stage makes now. It states the two mechanisms
   * that measurement establishes and claims nothing about the size of a gap, which is one cell's.
   */
  it('says the rows drove from the first second, and what a handover part-way cannot be', () => {
    expect(RUSH_HOUSE_COPY.note).toContain('first second');
    expect(RUSH_HOUSE_COPY.note).toContain('handed over part-way through');
    expect(RUSH_HOUSE_COPY.note).toContain('until the handover');
    expect(RUSH_HOUSE_COPY.note).toContain('door timing or call forecast');
    expect(RUSH_HOUSE_COPY.note).not.toContain('weight vector');
    /* No figure: the gap is one building's and the note is drawn on every building. */
    expect(RUSH_HOUSE_COPY.note).not.toMatch(/\d/u);
  });

  it('publishes no mean on any row', () => {
    for (const buildingId of shippedBuildingIds(config)) {
      for (const row of rowsFor(buildingId)) {
        expect(Object.keys(row).sort()).toEqual([
          'dispatcherId',
          'held',
          'heldThrough',
          'name',
          'standingTag',
          'tag',
          'wave',
        ]);
        /* No caller named a standing dispatcher, so no row is the player's — GitHub issue #565. */
        expect(row.standingTag).toBeUndefined();
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

/**
 * **The player's own best posted sitting, among the house's rows** — swarm DQ's Q3 supporting payoff,
 * [§ D1359](../../../../DECISIONS.md). Red before: the standings took nothing of the player's, so no
 * row was ever theirs and nothing said why.
 */
describe('the player’s own row among the house’s (§ D1359)', () => {
  const house = (): readonly RushHouseRowView[] => rowsFor('garden-apartments');
  const heldOf = (run: { readonly dispatcherId: string }): number => {
    const row = RUSH_HOUSE_TABLE.runs.find((entry) => entry.buildingId === 'garden-apartments' && entry.dispatcherId === run.dispatcherId);
    return row?.brokeAtS ?? Number.POSITIVE_INFINITY;
  };
  const view = (posted: Parameters<typeof rushStandingsOf>[4]) => {
    const drawn = rushStandingsOf('garden-apartments', nameOf, RUSH_HOUSE_TABLE, undefined, posted);
    if (drawn.kind !== 'rows') throw new Error(`drew ${drawn.kind}, not rows`);
    return drawn;
  };

  it('places each posted sitting furthest first among the house rows, the house first on a tie', () => {
    const rows = house();
    const finite = rows.map(heldOf).filter((held) => Number.isFinite(held));
    expect(finite.length).toBeGreaterThan(1);
    const middle = finite[Math.floor(finite.length / 2)]!;
    const drawn = view({
      kind: 'rows',
      date: '2026-10-10',
      sittings: [
        { heldS: middle, furthestWave: playerWaveAt(middle), roundCount: 2, modifiers: [] },
        { heldS: 1, furthestWave: 1, roundCount: 1, modifiers: [{ sinkId: 'rush-purse-top-up', steps: 2, name: 'Start with a bigger purse' }] },
      ],
    });
    /* The house rows are exactly what they were: the player's are placed among them, not mixed in. */
    expect(drawn.rows).toEqual(rows);
    const [tied, last] = drawn.yours;
    expect(tied?.before).toBe(rows.findIndex((row) => heldOf(row) < middle));
    expect(heldOf(rows[(tied?.before ?? 0) - 1]!)).toBe(middle);
    expect(tied?.name).toBe(RUSH_HOUSE_COPY.yoursName);
    expect(tied?.tag).toBe(RUSH_HOUSE_COPY.yoursTag);
    expect(tied?.tag).not.toBe(RUSH_HOUSE_COPY.tag);
    expect(tied?.wave).toBe(`wave ${String(playerWaveAt(middle))}`);
    expect(tied?.held).toBe(heldClock(middle));
    expect(tied?.detail).toBe('2 rounds');
    expect(last?.before).toBe(rows.length);
    expect(last?.detail).toBe('1 round · Start with a bigger purse ×2');
    /* What the row is, plainly: whose, which board and day, whose figure, and why it is not a house run. */
    expect(drawn.yoursLine).toBe(RUSH_HOUSE_COPY.yoursNote('2026-10-10'));
    expect(drawn.yoursLine).toContain('your best sitting');
    expect(drawn.yoursLine).toContain('2026-10-10');
    expect(drawn.yoursLine).toContain('as the server replayed it');
    expect(drawn.yoursLine).toContain('rebuilt between rounds or handed over');
    expect([tied?.wave, tied?.held, drawn.yoursLine].join(' ')).not.toMatch(/average|mean|awt|rank the/iu);
  });

  it('says why no row is the player’s, and says nothing on a build with no server', () => {
    expect(view({ kind: 'rows', date: '2026-10-10', sittings: [] }).yoursLine).toBe(RUSH_HOUSE_COPY.yoursNone);
    expect(view({ kind: 'signed-out' }).yoursLine).toBe(RUSH_HOUSE_COPY.yoursSignedOut);
    expect(view({ kind: 'unreachable' }).yoursLine).toBe(RUSH_HOUSE_COPY.yoursUnreachable);
    for (const quiet of [view({ kind: 'silent' }), view(undefined)]) {
      expect(quiet.yours).toEqual([]);
      expect(quiet.yoursLine).toBeUndefined();
    }
    /* A withheld table draws its refusal and none of the player's rows either. */
    expect(
      rushStandingsOf('a-tower-drawn-in-the-designer', nameOf, RUSH_HOUSE_TABLE, undefined, {
        kind: 'rows',
        date: '2026-10-10',
        sittings: [{ heldS: 600, furthestWave: 4, roundCount: 1, modifiers: [] }],
      }).kind,
    ).toBe('withheld');
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

describe('the house run beside the player’s round — wave AR, lane AR-1', () => {
  const midtown = { buildingId: 'midtown-office', dispatcherId: 'collective', dispatcherName: 'Conventional collective' };

  it('states both figures on the same crowd, and no verdict', () => {
    const line = rushHouseLineOf({ ...midtown, outcome: { kind: 'broke', heldS: 1538, wave: 9 } });
    expect(line).toBe(
      'This round held 25:38, into wave 9. The house run on the same crowd, Conventional collective with no changes, ' +
        'held 27:20, into wave 10. One run of each.',
    );
    const stopped = rushHouseLineOf({ ...midtown, outcome: { kind: 'stopped', heldS: 200, wave: 2 } });
    expect(stopped).toMatch(/^This round was ended by hand at 3:20, in wave 2\. /u);
    for (const text of [line, stopped]) expect(text).not.toMatch(/\b(better|worse|cost|helped|beat|lost|improv|win|won)/iu);
  });

  it('says the house held every wave when its run never broke', () => {
    const held = RUSH_HOUSE_TABLE.runs.find((run) => run.brokeAtS === null);
    if (held === undefined) throw new Error('no house run held every wave, so this case tests nothing');
    const line = rushHouseLineOf({ buildingId: held.buildingId, dispatcherId: held.dispatcherId, dispatcherName: 'X', outcome: { kind: 'broke', heldS: 600, wave: 4 } });
    expect(line).toContain(RUSH_HOUSE_LINE_COPY.houseHeld('X'));
  });

  it('draws nothing for a dispatcher or a tower the house did not run, or a table from another climb', () => {
    const outcome = { kind: 'broke', heldS: 600, wave: 4 } as const;
    expect(rushHouseLineOf({ ...midtown, dispatcherId: 'saved-on-a-device', outcome })).toBeUndefined();
    expect(rushHouseLineOf({ ...midtown, buildingId: 'drawn-in-the-designer', outcome })).toBeUndefined();
    const stale = { ...RUSH_HOUSE_TABLE, provenance: { ...RUSH_HOUSE_TABLE.provenance, seed: '1' } };
    expect(rushHouseLineOf({ ...midtown, outcome, table: stale })).toBeUndefined();
  });
});

describe('the line to beat on the setup page — wave AS, lane AS-1, § D1545 (GitHub issue #636, R5)', () => {
  const midtown = { buildingId: 'midtown-office', dispatcherId: 'collective', dispatcherName: 'Conventional collective' };

  it('states the house run from the same row the result reads, and claims nothing about a choice', () => {
    const line = rushHouseToBeatLineOf(midtown);
    expect(line).toBe(
      'The house run on this crowd, Conventional collective with no changes, holds to 27:20, into wave 10. That is the time to pass.',
    );
    /* The same row as the result's line: its house half carries the same figures. */
    const after = rushHouseLineOf({ ...midtown, outcome: { kind: 'broke', heldS: 600, wave: 4 } }) ?? '';
    expect(after).toContain('held 27:20, into wave 10.');
    expect(line).not.toMatch(/\b(better|worse|cost|helps?|helped|hurts?|improv|win|won|should|beats?)\b/iu);
  });

  it('says the house held every wave when its run never broke', () => {
    const held = RUSH_HOUSE_TABLE.runs.find((run) => run.brokeAtS === null);
    if (held === undefined) throw new Error('no house run held every wave, so this case tests nothing');
    expect(rushHouseToBeatLineOf({ buildingId: held.buildingId, dispatcherId: held.dispatcherId, dispatcherName: 'X' })).toBe(
      RUSH_HOUSE_LINE_COPY.toBeatHeld('X'),
    );
  });

  it('says nothing for a dispatcher or a tower the house did not run, or a stale table', () => {
    expect(rushHouseToBeatLineOf({ ...midtown, dispatcherId: 'saved-on-a-device' })).toBeUndefined();
    expect(rushHouseToBeatLineOf({ ...midtown, buildingId: 'drawn-in-the-designer' })).toBeUndefined();
    const stale = { ...RUSH_HOUSE_TABLE, provenance: { ...RUSH_HOUSE_TABLE.provenance, seed: '1' } };
    expect(rushHouseToBeatLineOf({ ...midtown, table: stale })).toBeUndefined();
  });
});
