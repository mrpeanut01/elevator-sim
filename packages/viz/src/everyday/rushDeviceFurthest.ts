/**
 * **The rush setup's *your furthest*, kept on this device across a reload** — wave AQ, lane AQ-3,
 * [§ D1515](../../../../DECISIONS.md), the post-AP playtest's first rush finding.
 *
 * ## What was wrong
 *
 * After two finished rounds and a reload the setup screen read *"your furthest this visit — no round
 * has finished since this page opened"*, while the board's note under it said a best sitting is kept
 * on this device. Both were true and the pair read as a broken promise: the facts held the furthest
 * round in memory only, and the board keeps only a sitting whose last round crossed the hold line
 * (`rushDeviceBest.ts`, § D1420), so a round ended by hand was kept nowhere.
 *
 * ## What this keeps
 *
 * Per tower, the furthest round this device finished, ended by hand or at the line, **as its causes**:
 * the sitting up to and including that round (`rushSitting.ts#rushSittingBodyOf`) and the second it
 * ended at, from the run's start. The wave and the held time are kept beside it only to decide whether
 * a later round went further; **the drawn figure is a replay**, on § D1420's rule: the round is
 * re-simulated from those causes on the rush's one seed (`rushDeviceBest.ts#rushDeviceReplayOf`) and
 * read at the same second with `rush.ts#rushOutcomeOf`, the function the result sheet reads. A rush is
 * deterministic in exactly those causes, so the replay draws the figure the result sheet drew.
 *
 * A round whose presses cannot be written as causes (a saved dispatcher took over, so its round is
 * unpostable) is not kept, because its replay would be a different round.
 *
 * Pure. The `localStorage` half is `everyday/rushDeviceStore.ts`.
 */

import type { RushSittingBody } from './rushSitting.js';

/** The slot. */
export const RUSH_DEVICE_FURTHEST_KEY = 'elevator-sim.rush-device-furthest.v1';
/** Where a record this build cannot read is set aside. */
export const RUSH_DEVICE_FURTHEST_QUARANTINE_KEY = 'elevator-sim.rush-device-furthest.quarantine';
export const RUSH_DEVICE_FURTHEST_VERSION = 1;

/** One tower's furthest round on this device. */
export interface RushDeviceFurthest {
  readonly buildingId: string;
  /** The sitting up to and including the round, whose last round is replayed. */
  readonly body: RushSittingBody;
  /** Seconds from the round's start to where it ended, by hand or at the line. */
  readonly endedAfterS: number;
  /** Kept only to decide whether a later round went further. Never drawn. */
  readonly keptWave: number;
  /** Kept only to decide whether a later round went further. Never drawn. */
  readonly keptHeldS: number;
}

export interface RushDeviceFurthestRecord {
  readonly version: number;
  readonly rounds: readonly RushDeviceFurthest[];
}

export function emptyRushDeviceFurthest(): RushDeviceFurthestRecord {
  return Object.freeze({ version: RUSH_DEVICE_FURTHEST_VERSION, rounds: [] });
}

/** Further means a later wave, or the same wave held longer — `host.ts`' visit rule. */
function further(wave: number, heldS: number, than: RushDeviceFurthest): boolean {
  return wave > than.keptWave || (wave === than.keptWave && heldS > than.keptHeldS);
}

/** Keep the round when it went further than the one kept. Unchanged by identity otherwise. */
export function withRushDeviceFurthest(
  record: RushDeviceFurthestRecord,
  entry: RushDeviceFurthest,
): RushDeviceFurthestRecord {
  if (
    entry.body.buildingId !== entry.buildingId ||
    entry.body.rounds.length === 0 ||
    !Number.isFinite(entry.endedAfterS) ||
    entry.endedAfterS < 0 ||
    !Number.isFinite(entry.keptWave) ||
    !Number.isFinite(entry.keptHeldS)
  ) {
    return record;
  }
  const kept = record.rounds.find((round) => round.buildingId === entry.buildingId);
  if (kept !== undefined && !further(entry.keptWave, entry.keptHeldS, kept)) return record;
  return Object.freeze({
    version: RUSH_DEVICE_FURTHEST_VERSION,
    rounds: Object.freeze([...record.rounds.filter((round) => round.buildingId !== entry.buildingId), Object.freeze(entry)]),
  });
}

export function rushDeviceFurthestOf(record: RushDeviceFurthestRecord, buildingId: string): RushDeviceFurthest | undefined {
  return record.rounds.find((round) => round.buildingId === buildingId);
}

/** Read a stored record, refusing one this build cannot read rather than coercing it. */
export function decodeRushDeviceFurthest(raw: string | null): {
  readonly record: RushDeviceFurthestRecord;
  readonly refused: boolean;
} {
  if (raw === null || raw === '') return { record: emptyRushDeviceFurthest(), refused: false };
  const refused = { record: emptyRushDeviceFurthest(), refused: true };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return refused;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return refused;
  const row = parsed as Record<string, unknown>;
  if (row['version'] !== RUSH_DEVICE_FURTHEST_VERSION || !Array.isArray(row['rounds'])) return refused;
  const rounds: RushDeviceFurthest[] = [];
  for (const value of row['rounds'] as unknown[]) {
    if (typeof value !== 'object' || value === null) return refused;
    const entry = value as Record<string, unknown>;
    const body = entry['body'] as Record<string, unknown> | undefined;
    if (
      typeof entry['buildingId'] !== 'string' ||
      typeof entry['endedAfterS'] !== 'number' ||
      typeof entry['keptWave'] !== 'number' ||
      typeof entry['keptHeldS'] !== 'number' ||
      typeof body !== 'object' ||
      body === null ||
      body['buildingId'] !== entry['buildingId'] ||
      !Array.isArray(body['rounds'])
    ) {
      return refused;
    }
    rounds.push(entry as unknown as RushDeviceFurthest);
  }
  return { record: Object.freeze({ version: RUSH_DEVICE_FURTHEST_VERSION, rounds: Object.freeze(rounds) }), refused: false };
}

export function encodeRushDeviceFurthest(record: RushDeviceFurthestRecord): string {
  return JSON.stringify({ version: RUSH_DEVICE_FURTHEST_VERSION, rounds: record.rounds });
}
