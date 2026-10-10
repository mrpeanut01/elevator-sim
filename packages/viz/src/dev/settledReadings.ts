/**
 * **The house's settled verdicts, kept across a reload** — wave AO, lane AO-3,
 * [§ D1380](../../../../DECISIONS.md), the post-AN panel's seats B (defect 5) and D (D8).
 *
 * `dev/main.ts` runs the house (the tower's standing order, left alone, on a counted day's own crowd)
 * and the driver run (§ D1351) once per day, and kept each answer in a map that a reload empties. So
 * the first close after a reload read *The house is still being run on all 3 of them* about days
 * earlier closes had already settled, and only caught up a few seconds later: a tally that went
 * backwards on the screen. A settled verdict is a pure function of the day's record (the same seed,
 * the same building, the standing order), so it is kept where the next sitting can read it, and the
 * close reads it from there rather than asking again.
 *
 * ## What is kept, and what is not
 *
 * Only a verdict a run returned: *cleared*, *missed* or *ungraded*. *Unrecorded* is not kept, because
 * it is the answer to a run that threw or a record this build could not read, and either is a fact
 * about this sitting rather than about the day. Nothing *pending* is ever written.
 *
 * Keyed by the caller's own key for the run (the tower, the day, the wrinkle and the seed for the
 * house; the swapped record for the driver run), so a re-filed day that is a different run is a
 * different key. Bounded to the last {@link SETTLED_READINGS_MAX} entries, the oldest dropped first.
 *
 * ## Why here and why browser storage
 *
 * It is a cache of answers a run can always give again: lost, a reload asks the run as it did
 * before this existed, and nothing else depends on it. That is the footing browser storage is for in
 * this repository (a per-viewer convenience that renders correctly without it), so every read and
 * write is wrapped and fails quietly. `dev/` is a shell entry point (`boundaries.test.ts#isDev`), the
 * tier allowed to touch `window.localStorage`; the parse and the bound are pure and driven in the
 * node tier (`settledReadings.test.ts`).
 */

/** The slot the readings are kept in. */
export const SETTLED_READINGS_KEY = 'elevator-sim.settled-readings.v1';

/** How many readings are kept, newest last. Days of every tower, at two runs a day, for months. */
export const SETTLED_READINGS_MAX = 512;

/** A verdict a run returned, and the only kind worth keeping. */
export type SettledReading = 'cleared' | 'missed' | 'ungraded';

/** Which run a reading is of — the house, or the driver run (§ D1351). */
export type SettledRun = 'house' | 'driver';

const SETTLED: ReadonlySet<string> = new Set(['cleared', 'missed', 'ungraded']);

/** Whether a reading is one {@link keepSettled} keeps. */
export function isSettledReading(reading: string): reading is SettledReading {
  return SETTLED.has(reading);
}

/** The stored text, read: every well-formed `[key, reading]` pair, in order, and nothing else. */
export function settledReadingsFrom(raw: string | null): Map<string, SettledReading> {
  const out = new Map<string, SettledReading>();
  if (raw === null) return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return out;
  }
  if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as { entries?: unknown }).entries)) {
    return out;
  }
  for (const entry of (parsed as { entries: unknown[] }).entries) {
    if (!Array.isArray(entry) || entry.length !== 2) continue;
    const [key, reading] = entry as [unknown, unknown];
    if (typeof key === 'string' && typeof reading === 'string' && isSettledReading(reading)) out.set(key, reading);
  }
  return out;
}

/** The map as stored: the newest {@link SETTLED_READINGS_MAX} entries, oldest first. */
export function settledReadingsText(readings: ReadonlyMap<string, SettledReading>): string {
  const entries = [...readings.entries()].slice(-SETTLED_READINGS_MAX);
  return JSON.stringify({ entries });
}

/** The key one run's reading is kept under. */
export function settledKeyOf(run: SettledRun, key: string): string {
  return `${run}|${key}`;
}

/** The storage the shell keeps the readings in, or `undefined` where there is none to reach. */
function storageOf(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

let held: Map<string, SettledReading> | undefined;

function heldReadings(): Map<string, SettledReading> {
  if (held !== undefined) return held;
  try {
    held = settledReadingsFrom(storageOf()?.getItem(SETTLED_READINGS_KEY) ?? null);
  } catch {
    held = new Map();
  }
  return held;
}

/** A settled reading kept by an earlier close, this sitting or one before it, or `undefined`. */
export function settledReadingOf(run: SettledRun, key: string): SettledReading | undefined {
  return heldReadings().get(settledKeyOf(run, key));
}

/**
 * Keep a reading a run returned, where it is settled. Re-keeping moves it to the newest end, so the
 * bound drops what nobody has asked about longest. A write that fails leaves the sitting's own copy.
 */
export function keepSettled(run: SettledRun, key: string, reading: string): void {
  if (!isSettledReading(reading)) return;
  const readings = heldReadings();
  const at = settledKeyOf(run, key);
  readings.delete(at);
  readings.set(at, reading);
  try {
    storageOf()?.setItem(SETTLED_READINGS_KEY, settledReadingsText(readings));
  } catch {
    /* A full or blocked store keeps this sitting's copy; the next sitting asks the run again. */
  }
}
