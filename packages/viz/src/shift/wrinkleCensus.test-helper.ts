/**
 * One cell of the whole-day wrinkle census — [§ D1057](../../../../DECISIONS.md). Shared by the
 * env-gated sweep that writes `data/wrinkle-census.json` and the always-on test that re-derives a
 * sample of it, so the two cannot build the day differently.
 *
 * A test helper, `contractDay.test-helper.ts`'s reason: nothing the player runs needs it.
 */

import { observationsAt } from '../live/observations.js';
import { recordRun } from '../record/recordRun.js';
import { WRINKLE_LIBRARY } from '../wrinkles/library.js';

import { contractBuildings, todaysScenarioDayState } from './contractDay.test-helper.js';
import { shiftRunConfigOf } from '../dev/state.js';
import { goalsForDay, readGoals } from './goals.js';
import { shiftObservationsOf } from './observations.js';

/** The towers the census runs: the five office towers whose day-1 press pins are whole days. */
export const CENSUS_CONTRACTS: readonly string[] = Object.freeze(['c2', 'c3', 'c6', 'c9', 'c10']);

/** The default standing order — the one the press ladder and § D974's pins are measured under. */
export const DEFAULT_DISPATCHER = 'collective';

/** Every shipped standing order, in `data/dispatcher-profiles.json`'s order. */
export const CENSUS_DISPATCHERS: readonly string[] = Object.freeze(
  contractBuildings().dispatcherProfiles.profiles.map((profile) => profile.id),
);

/** `ordinary` (the unwrinkled day) and every template spliced as an episode, in file order. */
export const CENSUS_WRINKLES: readonly string[] = Object.freeze([
  'ordinary',
  ...WRINKLE_LIBRARY.templates
    .filter((template) => template.effect.wholeDay?.kind === 'episode')
    .map((template) => template.id),
]);

/** One crowd of one census cell, as `data/wrinkle-census.json` stores it. */
export interface CensusRow {
  /** The crowd is {@link censusSeedAt}`(n)`. */
  readonly n: number;
  readonly clearsDefault: boolean;
  readonly clearsAny: boolean;
  readonly delivered: number;
  readonly abandoned: number;
  readonly failing: string;
}

/** `docs/33` § 4.6's crowd sequence, § D468's protocol. */
export const censusSeedAt = (n: number): bigint => 20_260_824n + 7_919n * BigInt(n);

const RESOURCES = contractBuildings();

export interface CensusDay {
  readonly clears: boolean;
  /** Legs delivered, over the whole day. */
  readonly delivered: number;
  /** Riders whose wait crossed the give-up horizon. */
  readonly abandoned: number;
  /** The goals not met, joined. */
  readonly failing: string;
  /** Whether the run spliced an episode — the census asserts it did on every wrinkled cell. */
  readonly spliced: boolean;
}

/** Day 1 of `contractId` as the Scenario press plays it, under `wrinkleId`, one crowd, no press. */
export function censusDayOf(
  contractId: string,
  wrinkleId: string,
  dispatcherId: string,
  seed: bigint,
): CensusDay {
  const { state, horizon } = todaysScenarioDayState(RESOURCES, contractId, {
    seed,
    dispatcherId,
    over: { campaignEventId: wrinkleId },
  });
  if (horizon !== 'whole-day') throw new Error(`${contractId} has no whole day`);
  const plan = shiftRunConfigOf(RESOURCES, state);
  if (wrinkleId !== 'ordinary' && plan.episode === undefined) {
    throw new Error(`${contractId}/${wrinkleId}: nothing was spliced`);
  }
  const { recording } = recordRun(plan.config, {
    recordDecisions: false,
    outOfServiceCarIds: plan.outOfServiceCarIds,
  });
  const observations = shiftObservationsOf(observationsAt(recording, recording.endedAt));
  const readings = readGoals(goalsForDay(1, 'whole-day'), observations);
  const failing = readings.filter((reading) => reading.state !== 'met').map((reading) => reading.goal.id);
  return {
    clears: failing.length === 0,
    delivered: observations.servedLegs,
    abandoned: observations.abandoned,
    failing: failing.join('+'),
    spliced: plan.episode !== undefined,
  };
}
