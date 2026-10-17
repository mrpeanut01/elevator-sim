/**
 * **The rush on a page with no server: this device's best sitting, kept and replayed** —
 * [§ D1420](../../../../DECISIONS.md), swarm DS's Q3 ruling (S3's form; S1 and S2 concur).
 *
 * ## What was wrong
 *
 * The static site has no rush board. Seat C on the post-AN panel played to wave 20 and the rush
 * setup screen kept that best *"since this page opened"*: a reload took it, and the house's rows
 * stood above a player who had outlasted every one of them. [§ D1359](../../../../DECISIONS.md)
 * draws a player's best **posted** sitting among the house's rows, and with no server there is
 * nothing posted.
 *
 * ## What this keeps, and what it never keeps
 *
 * Per tower, the best sitting this device played, **as its causes**: the body
 * `rushSitting.ts#rushSittingBodyOf` composes (each round's dispatcher, rules, intervention log and
 * rebuild, and the sitting's modifiers), the same thing a server would replay. A figure is kept
 * beside it only to decide whether a later sitting is better; **no stored figure is drawn**. The
 * row's hold is re-derived on the screen by replaying the sitting's last round from those causes on
 * the rush's one seed ({@link rushDeviceReplayOf}), so a hand-edited record moves no drawn figure.
 *
 * Only the last round is replayed, and that is the whole of what the row ranks on: a sitting ranks
 * on how long its last round held (§ D1359), and the last round's tower is a fold of the claims and
 * every rebuild before it, which needs no simulation of the earlier rounds.
 *
 * ## What it says
 *
 * It is tagged {@link RUSH_DEVICE_COPY.tag} and the line under the rows says it is kept on this
 * device, was posted nowhere, was checked by no server and is ranked against nobody. It is drawn
 * only on a build with no rush board (`EverydayHost.rushDeviceBest`), because a served build has
 * § D1359's row, which a server replayed.
 *
 * Pure. The `localStorage` half is `everyday/rushDeviceStore.ts`, on `chimeStore.ts`' split.
 */

import { rushLevelsAfter, type RunInterventionConfig, type RushFitLevels } from '@elevator-sim/core/browser';

import type { BrowserResources } from '../dev/data.js';
import { initialState, shiftRunConfigOf, withBuilding, withDispatcher, type ShiftRunConfig } from '../dev/state.js';
import { switchTargetFromWire } from '../scope/switchWire.js';
import { RUSH_SEED, rushPatchOf, rushStartLevelsOf } from './rush.js';
import type { RushSittingBody } from './rushSitting.js';

/** The slot this device keeps its best sittings in. */
export const RUSH_DEVICE_BEST_KEY = 'elevator-sim.rush-device-best.v1';
/** Where a record this build cannot read is set aside, `chimeStore.ts`' shape. */
export const RUSH_DEVICE_BEST_QUARANTINE_KEY = 'elevator-sim.rush-device-best.quarantine';
/** The shape this build writes and reads. Another version is quarantined, never coerced. */
export const RUSH_DEVICE_BEST_VERSION = 1;

/** One tower's best sitting on this device. */
export interface RushDeviceSitting {
  readonly buildingId: string;
  /** The sitting's causes, as a server would replay them. */
  readonly body: RushSittingBody;
  /**
   * How long its last round held when it was played, seconds — **used only to decide whether a later
   * sitting is better, and never drawn**. The row's figure is {@link rushDeviceReplayOf}'s.
   */
  readonly keptHeldS: number;
}

/** What this device keeps: at most one sitting per tower. */
export interface RushDeviceBestRecord {
  readonly version: number;
  readonly sittings: readonly RushDeviceSitting[];
}

/** Nothing kept. */
export function emptyRushDeviceBest(): RushDeviceBestRecord {
  return Object.freeze({ version: RUSH_DEVICE_BEST_VERSION, sittings: [] });
}

/**
 * Keep `body` as `buildingId`'s best when it held longer than the one kept, or when none is.
 * Returns the record unchanged by identity where nothing changed, so a caller can tell.
 */
export function withRushDeviceBest(
  record: RushDeviceBestRecord,
  buildingId: string,
  body: RushSittingBody,
  heldS: number,
): RushDeviceBestRecord {
  if (!Number.isFinite(heldS) || heldS < 0 || body.buildingId !== buildingId || body.rounds.length === 0) return record;
  const kept = record.sittings.find((sitting) => sitting.buildingId === buildingId);
  if (kept !== undefined && kept.keptHeldS >= heldS) return record;
  const next: RushDeviceSitting = Object.freeze({ buildingId, body, keptHeldS: heldS });
  return Object.freeze({
    version: RUSH_DEVICE_BEST_VERSION,
    sittings: Object.freeze([...record.sittings.filter((sitting) => sitting.buildingId !== buildingId), next]),
  });
}

/** The sitting this device keeps for `buildingId`, or `undefined`. */
export function rushDeviceSittingOf(record: RushDeviceBestRecord, buildingId: string): RushDeviceSitting | undefined {
  return record.sittings.find((sitting) => sitting.buildingId === buildingId);
}

/* -------------------------------------------------------------------------- *
 * The replay
 * -------------------------------------------------------------------------- */

/** Why a kept sitting could not be replayed here, as a sentence the row's line can say. */
export const RUSH_DEVICE_REPLAY_REFUSAL = Object.freeze({
  empty: 'the kept sitting has no rounds',
  building: 'this build does not ship the tower it was played on',
  dispatcher: 'this build does not ship a dispatcher one of its rounds used',
  rebuild: 'this build’s rush menu does not sell what one of its rounds bought',
});

/**
 * **The kept sitting's last round, as a simulation configuration** — the round's dispatcher, rules
 * and intervention log on the rush patch, at the fit its claims and every rebuild before it folded
 * to, on the rush's one seed. The path a player's own round takes (`EverydayHost.startRush`:
 * `withBuilding`, `withDispatcher`, `rush.ts#rushPatchOf`, `dev/state.ts#shiftRunConfigOf`), so the
 * hold its recording reads (`rush.ts#rushHoldAt`) is the hold the round was played to.
 *
 * Answers a refusal sentence where the sitting names something this build does not ship.
 */
export function rushDeviceReplayOf(resources: BrowserResources, body: RushSittingBody): ShiftRunConfig | string {
  const last = body.rounds[body.rounds.length - 1];
  if (last === undefined) return RUSH_DEVICE_REPLAY_REFUSAL.empty;
  if (!resources.buildings.some((building) => building.id === body.buildingId)) return RUSH_DEVICE_REPLAY_REFUSAL.building;
  const shipped = resources.dispatcherProfiles.profiles;
  if (!shipped.some((profile) => profile.id === last.dispatcherProfileId)) return RUSH_DEVICE_REPLAY_REFUSAL.dispatcher;
  const modifiers = body.modifiers ?? [];
  let levels: RushFitLevels = rushStartLevelsOf(modifiers);
  for (const round of body.rounds) {
    const bought = round.rebuild ?? [];
    if (bought.length === 0) continue;
    const after = rushLevelsAfter(levels, bought);
    if (!after.ok) return RUSH_DEVICE_REPLAY_REFUSAL.rebuild;
    levels = after.levels;
  }
  const log: RunInterventionConfig[] = [];
  for (const entry of last.interventions ?? []) {
    const change = entry.change;
    if (change.kind === 'switch-dispatcher' || change.kind === 'adopt-dispatcher') {
      const profile = switchTargetFromWire({ toProfileId: change.toProfileId, ruleRows: change.ruleRows ?? [] }, shipped);
      if (profile === undefined) return RUSH_DEVICE_REPLAY_REFUSAL.dispatcher;
      log.push({ atS: entry.atS, change: { kind: change.kind, profile } });
    } else {
      log.push({ atS: entry.atS, change: { kind: change.kind } });
    }
  }
  const standing = withDispatcher(
    withBuilding(initialState(resources, RUSH_SEED), resources, body.buildingId),
    resources,
    last.dispatcherProfileId,
  );
  const patch = rushPatchOf(resources, standing, modifiers, levels);
  if (patch === undefined) return RUSH_DEVICE_REPLAY_REFUSAL.building;
  return shiftRunConfigOf(resources, {
    ...standing,
    ...patch,
    ruleRows: last.ruleRows ?? [],
    interventions: log,
  });
}

/* -------------------------------------------------------------------------- *
 * What the screen is handed
 * -------------------------------------------------------------------------- */

/**
 * What `EverydayHost.rushDeviceBest` answers the setup screen (§ D1420): a replayed row, a kept
 * sitting this build cannot replay, nothing kept, or nothing to say (a build with a rush board, or
 * an answer that has not landed).
 */
export type RushDeviceStanding =
  | {
      readonly kind: 'row';
      /** The replay's hold, seconds from the round's start. Never the kept figure. */
      readonly heldS: number;
      readonly roundCount: number;
      readonly modifiers: readonly { readonly sinkId: string; readonly steps: number }[];
    }
  | { readonly kind: 'unreplayable'; readonly reason: string }
  | { readonly kind: 'none' }
  | { readonly kind: 'silent' };

/** Every sentence the device row says. One object, for `honesty/surfaces.ts`' generic sweep. */
export const RUSH_DEVICE_COPY = Object.freeze({
  tag: 'yours, on this device',
  name: 'Your best sitting on this device',
  /** Drawn under the rows whenever the device row is. */
  note:
    'The row marked yours, on this device is your best sitting on this tower, kept on this device. It was ' +
    'posted nowhere, no server checked it, and it is ranked against nobody: this site has no rush board. Its ' +
    'hold is replayed here from the sitting’s own last round, on the same waves the house’s rows met.',
  /*
   * § D1515: this said *"once you have played one to its line"*, which a player who ended rounds by
   * hand read as a promise the page then broke. It now says what earns the row, and that a round
   * ended by hand is kept in the facts above rather than here.
   */
  none:
    'This site has no rush board. Your best sitting on this tower shows here once a round of yours runs until ' +
    'forty people have waited over two minutes at once. A round you end by hand is kept in your furthest above, not here.',
  unreplayable: (reason: string): string =>
    `Your best sitting on this tower is kept on this device, and it is not drawn because ${reason}.`,
});

/** Read a stored record, quarantining one this build cannot read — `deviceChimes.ts`' rule. */
export function decodeRushDeviceBest(raw: string | null): {
  readonly record: RushDeviceBestRecord;
  readonly refused: boolean;
} {
  if (raw === null || raw === '') return { record: emptyRushDeviceBest(), refused: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { record: emptyRushDeviceBest(), refused: true };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { record: emptyRushDeviceBest(), refused: true };
  const row = parsed as Record<string, unknown>;
  if (row['version'] !== RUSH_DEVICE_BEST_VERSION || !Array.isArray(row['sittings'])) {
    return { record: emptyRushDeviceBest(), refused: true };
  }
  const sittings: RushDeviceSitting[] = [];
  for (const entry of row['sittings'] as unknown[]) {
    if (typeof entry !== 'object' || entry === null) return { record: emptyRushDeviceBest(), refused: true };
    const sitting = entry as Record<string, unknown>;
    const body = sitting['body'] as Record<string, unknown> | undefined;
    if (
      typeof sitting['buildingId'] !== 'string' ||
      typeof sitting['keptHeldS'] !== 'number' ||
      typeof body !== 'object' ||
      body === null ||
      body['buildingId'] !== sitting['buildingId'] ||
      !Array.isArray(body['rounds'])
    ) {
      return { record: emptyRushDeviceBest(), refused: true };
    }
    sittings.push(sitting as unknown as RushDeviceSitting);
  }
  return { record: Object.freeze({ version: RUSH_DEVICE_BEST_VERSION, sittings: Object.freeze(sittings) }), refused: false };
}

/** Write a record to the bytes {@link decodeRushDeviceBest} reads. */
export function encodeRushDeviceBest(record: RushDeviceBestRecord): string {
  return JSON.stringify({ version: RUSH_DEVICE_BEST_VERSION, sittings: record.sittings });
}
