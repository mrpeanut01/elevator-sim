/**
 * **The house's Endless rush runs — `data/rush-house-runs.json`, read and drawn as standings.**
 * GitHub issue #418, the owner's ruling of 2026-09-10, and [§ D547](../../../../DECISIONS.md).
 *
 * `rushScreen.ts` draws {@link rushStandingsOf} under § 9.1's *furthest anyone has held* eyebrow, in
 * place of the five handoff fixtures that stood there (`RUSH_BESTS`, deleted on this commit).
 *
 * ## What a house row is
 *
 * **A run, not a person.** Each row is one shipped dispatcher from `data/dispatcher-profiles.json`,
 * played through the shipped rush on one shipped building as it stands, on the rush's one seed —
 * `rushPatchOf`, `shiftRunConfigOf`, `recordRun` and `rushHoldAt`, the path a player's own rush
 * takes. So a row replays, and `rushHouseSweep.test.ts` replays every one of them.
 *
 * **Labelled as the house on every surface that draws it**, in § D521's own vocabulary: the tag is
 * the daily board's `house`, and `rushHouse.test.ts` holds the two equal, so a player meets one word
 * for the game's own runs whichever board they read. The note says the three things § D521's board
 * note says and for the same reasons: nobody played these, they are one run per dispatcher, and
 * one crowd with one run each does not rank the dispatchers.
 *
 * ## Keyed on the building, because the waves are only the same on the same tower
 *
 * `RUSH_STREAM.seed` is one seed for everybody, and `rushPatchOf` scales the rate to the population of
 * the building the rush runs — the standing tower as authored, whatever week the player is standing in
 * (PR #513's review, finding 1) — so every tower meets the same number of people. The **crowd** is shared;
 * the building it arrives at is the player's. A house row from Garden Apartments beside a player
 * standing on Vertical City would be a comparison between two different runs, so the standings are
 * the house's runs on the building the player is standing on — and a building drawn in the designer,
 * which the house never ran, gets a sentence saying so rather than somebody else's rows.
 *
 * ## No mean is published, and the table records why it could not be
 *
 * A row draws the wave the line was crossed in and how long that took, read off one recording — an
 * observation of a run, never an estimate over a window. It could not publish an average wait if it
 * wanted to: almost every rush is suppressed by construction, because the stream is built to make the
 * queue diverge. `awtIsValid` and the sheet's saturation verdict are carried in the table so a moved
 * run is visible there, and neither reaches a row.
 *
 * ## A stale table is withheld, not thrown
 *
 * The table carries the stream it was measured on. If `RUSH_STREAM` or `RUSH_HOLD_LINE` move without
 * the table being regenerated, {@link rushStandingsOf} withholds every row and says why, rather than
 * drawing figures measured on different waves — `watch/reference.ts`'s reproduction-gate rule,
 * one screen over. A **malformed** table is an authoring error and is refused by
 * {@link parseRushHouseTable} at load, which the default suite catches before any build ships it.
 */

// Named `houseDocument` rather than `document`: `boundaries.test.ts` confines the DOM to the dev
// entry point by looking for bare globals, and a binding called `document` is one. The import
// follows `shift/ladder.ts`: a bundled document is pinned to the commit by construction.
import houseDocument from '../../../../data/rush-house-runs.json' with { type: 'json' };

import { heldClock } from './rush.js';
import { LAST_GENERATED_WAVE, RUSH_HOLD_LINE, RUSH_STREAM, playerWaveAt } from './rushScreenModel.js';

/** One house run: a shipped dispatcher, a shipped building, the rush's seed, read at the hold line. */
export interface RushHouseRun {
  readonly buildingId: string;
  readonly dispatcherId: string;
  /** Seconds from the run's start to the first bucket holding the line; `null` when it never did. */
  readonly brokeAtS: number | null;
  /** Arrivals by that moment — or by the recording's end, when the line was never crossed. */
  readonly arrived: number;
  /** Deliveries by the same moment. */
  readonly carried: number;
  /** Every leg the recording holds. A sentinel: a run that moved at all moves this. */
  readonly legs: number;
  /** `RunSummary.awtIsValid`, carried for the record. No row draws a mean. */
  readonly awtIsValid: boolean;
  /** The sheet's trend-test verdict, or `null` when the recording carries none. */
  readonly saturationVerdict: string | null;
}

/** What the table was measured on, and how to measure it again. */
export interface RushHouseProvenance {
  readonly kind: 'measured';
  /** The command that regenerates the file. */
  readonly command: string;
  /** The commit the runs were measured on. */
  readonly tree: string;
  readonly measuredAt: string;
  /** `RUSH_STREAM.seed`, as a run record carries a seed. */
  readonly seed: string;
  readonly streamLengthS: number;
  readonly holdLine: { readonly people: number; readonly overS: number };
  /** The call path each run took, named so a reader can check it is a player's. */
  readonly path: string;
}

export interface RushHouseTable {
  readonly generatedBy: string;
  readonly contract: string;
  readonly provenance: RushHouseProvenance;
  readonly runs: readonly RushHouseRun[];
}

/* -------------------------------------------------------------------------- *
 * The schema
 * -------------------------------------------------------------------------- */

function refuse(where: string, why: string): never {
  throw new Error(`data/rush-house-runs.json: ${where} ${why}`);
}

function text(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) refuse(where, 'must be a non-empty string');
  return value;
}

function count(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    refuse(where, 'must be a non-negative integer — the table publishes counts, never rates');
  }
  return value;
}

function record(value: unknown, where: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) refuse(where, 'must be an object');
  return value as Readonly<Record<string, unknown>>;
}

/**
 * The table, or a refusal naming the field that is wrong.
 *
 * Refuses a table that does not say what it is — no `measured` provenance, no command, no seed — and
 * a run that is not a count: `carried` above `arrived`, `arrived` above the legs, a pair measured
 * twice. It does **not** check the stream against `RUSH_STREAM`; {@link rushStandingsOf} does, and
 * withholds rather than throws, for the reason the module docstring gives.
 */
export function parseRushHouseTable(raw: unknown): RushHouseTable {
  const top = record(raw, 'the document');
  const p = record(top['provenance'], 'provenance');
  if (p['kind'] !== 'measured') refuse('provenance.kind', 'must be "measured" — every row is a run');
  const seed = text(p['seed'], 'provenance.seed');
  if (!/^\d+$/u.test(seed)) refuse('provenance.seed', 'must be the decimal seed a run record carries');
  const hold = record(p['holdLine'], 'provenance.holdLine');
  const provenance: RushHouseProvenance = {
    kind: 'measured',
    command: text(p['command'], 'provenance.command'),
    tree: text(p['tree'], 'provenance.tree'),
    measuredAt: text(p['measuredAt'], 'provenance.measuredAt'),
    seed,
    streamLengthS: count(p['streamLengthS'], 'provenance.streamLengthS'),
    holdLine: { people: count(hold['people'], 'provenance.holdLine.people'), overS: count(hold['overS'], 'provenance.holdLine.overS') },
    path: text(p['path'], 'provenance.path'),
  };
  if (!Array.isArray(top['runs']) || top['runs'].length === 0) refuse('runs', 'must be a non-empty array');
  const seen = new Set<string>();
  const runs = (top['runs'] as readonly unknown[]).map((entry, index): RushHouseRun => {
    const at = `runs[${String(index)}]`;
    const r = record(entry, at);
    const buildingId = text(r['buildingId'], `${at}.buildingId`);
    const dispatcherId = text(r['dispatcherId'], `${at}.dispatcherId`);
    const key = `${buildingId}#${dispatcherId}`;
    if (seen.has(key)) refuse(at, `measures ${key} a second time`);
    seen.add(key);
    const brokeAtS = r['brokeAtS'] === null ? null : count(r['brokeAtS'], `${at}.brokeAtS`);
    const legs = count(r['legs'], `${at}.legs`);
    const arrived = count(r['arrived'], `${at}.arrived`);
    const carried = count(r['carried'], `${at}.carried`);
    if (arrived > legs) refuse(at, 'has more arrivals than the recording has legs');
    if (carried > arrived) refuse(at, 'carried more people than had arrived');
    if (typeof r['awtIsValid'] !== 'boolean') refuse(`${at}.awtIsValid`, 'must be a boolean');
    const verdict = r['saturationVerdict'];
    if (verdict !== null && typeof verdict !== 'string') refuse(`${at}.saturationVerdict`, 'must be a string or null');
    return { buildingId, dispatcherId, brokeAtS, arrived, carried, legs, awtIsValid: r['awtIsValid'], saturationVerdict: verdict };
  });
  return {
    generatedBy: text(top['generatedBy'], 'generatedBy'),
    contract: text(top['contract'], 'contract'),
    provenance,
    runs,
  };
}

/**
 * The shipped table. Read by {@link rushStandingsOf} as its default, which `rushScreen.ts` and the
 * honesty adapter both call.
 */
export const RUSH_HOUSE_TABLE: RushHouseTable = parseRushHouseTable(houseDocument);

/* -------------------------------------------------------------------------- *
 * The standings
 * -------------------------------------------------------------------------- */

/**
 * Every sentence the standings put in front of a player. `rushScreen.ts` draws them, through
 * {@link rushStandingsOf}'s view rather than from this table, so the note and the rows it describes
 * cannot be drawn apart.
 */
export const RUSH_HOUSE_COPY = Object.freeze({
  /** § D521's tag, the daily board's `BOARD_SCREEN_COPY.dailyHouseTag` — held equal by a test. */
  tag: 'house',
  /**
   * Drawn above the rows, for the reason § D376 put the fixture marker above them: a reader who has
   * already read the names has formed the belief the note is there to correct.
   */
  note:
    'Rows marked house are the game’s own runs: every shipped dispatcher, once, on this building ' +
    'and the same waves you face. Nobody played them, and the order does not rank the ' +
    'dispatchers — one crowd, one run each. Outlast one and you have outlasted a machine on the ' +
    'same arrivals.',
  /** A building the house has not run — anything drawn in the designer. */
  unrun:
    'The house has not run this building. Its runs are measured on the shipped towers as they ' +
    'stand, so a building drawn here has nothing to hold against yet.',
  /** The table was measured on a different climb from the one this build generates. */
  stale:
    'The house’s runs were measured on a different climb from the one this build generates, so ' +
    'they are withheld rather than drawn against the wrong waves.',
  /** The wave cell of a run whose line was never crossed. */
  neverBroke: 'never broke',
});

/** One house row, as `rushScreen.ts` draws it. There is no mean here, by construction. */
export interface RushHouseRowView {
  readonly dispatcherId: string;
  /** The dispatcher's display name, or its id where this build does not know it. */
  readonly name: string;
  /** {@link RUSH_HOUSE_COPY.tag}, on every row. */
  readonly tag: string;
  /** `wave 7`, or {@link RUSH_HOUSE_COPY.neverBroke}. */
  readonly wave: string;
  /** How long it held (`19:38`), or how far the climb went when it never broke. */
  readonly held: string;
  /** True when the line was never crossed, so the frame can set the row apart. */
  readonly heldThrough: boolean;
}

export type RushStandingsView =
  | { readonly kind: 'rows'; readonly note: string; readonly rows: readonly RushHouseRowView[] }
  | { readonly kind: 'withheld'; readonly reason: 'unrun' | 'stale'; readonly refusal: string };

/** Whether the table was measured on the stream this build generates. */
function measuredOnThisStream(table: RushHouseTable): boolean {
  const p = table.provenance;
  return (
    p.seed === String(RUSH_STREAM.seed) &&
    p.streamLengthS === RUSH_STREAM.lengthS &&
    p.holdLine.people === RUSH_HOLD_LINE.people &&
    p.holdLine.overS === RUSH_HOLD_LINE.overS
  );
}

/**
 * The standings for the building a player is standing on: one house row per shipped dispatcher the
 * table measured there, furthest first.
 *
 * *Furthest* is § 9.1's own eyebrow. A run that never crossed the line held longer than any that did,
 * so those come first; the rest go by the moment the line was crossed, latest first; a tie keeps the
 * table's order, which is `data/dispatcher-profiles.json`'s. The note under the eyebrow says the
 * order ranks nothing, because one run each is the shape `CLAUDE.md` forbids a conclusion from.
 *
 * `nameOf` is the host's honest lookup — `EverydayHost.dispatcherById` — so a dispatcher this build
 * does not know is printed as its id rather than as somebody else's name.
 */
export function rushStandingsOf(
  buildingId: string,
  nameOf: (dispatcherId: string) => string | undefined,
  table: RushHouseTable = RUSH_HOUSE_TABLE,
): RushStandingsView {
  if (!measuredOnThisStream(table)) return { kind: 'withheld', reason: 'stale', refusal: RUSH_HOUSE_COPY.stale };
  const here = table.runs
    .map((run, index) => ({ run, index }))
    .filter(({ run }) => run.buildingId === buildingId);
  if (here.length === 0) return { kind: 'withheld', reason: 'unrun', refusal: RUSH_HOUSE_COPY.unrun };
  const heldFor = (run: RushHouseRun): number => run.brokeAtS ?? Number.POSITIVE_INFINITY;
  const rows = [...here]
    .sort((a, b) => heldFor(b.run) - heldFor(a.run) || a.index - b.index)
    .map(({ run }): RushHouseRowView => {
      const broke = run.brokeAtS !== null;
      return {
        dispatcherId: run.dispatcherId,
        name: nameOf(run.dispatcherId) ?? run.dispatcherId,
        tag: RUSH_HOUSE_COPY.tag,
        wave: run.brokeAtS === null ? RUSH_HOUSE_COPY.neverBroke : `wave ${String(playerWaveAt(run.brokeAtS))}`,
        held: run.brokeAtS === null ? `all ${String(LAST_GENERATED_WAVE)} waves` : heldClock(run.brokeAtS),
        heldThrough: !broke,
      };
    });
  return { kind: 'rows', note: RUSH_HOUSE_COPY.note, rows };
}
