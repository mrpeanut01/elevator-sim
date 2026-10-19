/**
 * **A campaign stage, read from its plain fields, and the one replication a verb log replays on.**
 *
 * The adversarial persona (`play.ts`) holds a scenario's building fixed and fuzzes the player's verb
 * log. To do that from this package it has to build the run a stage *is*, and it may not import the
 * game layer that already builds it: `core` and `experiments` never name the viewer package
 * (CLAUDE.md invariant 6, and the viewer's own `boundaries.test.ts` fails a single import). So this
 * module reads the handful of **plain fields** `data/campaign.json` carries for a stage and turns
 * them into a `SimulationConfig` through the shipped `data/` that `core` already loads.
 *
 * ## Why this is not a second copy of the game's stage run
 *
 * The game's own builder is the viewer's `campaign/stageRun.ts#demonstrationConfigFor` (and the
 * batch loop's `batch/runBatch.ts#armConfigOf`). Two implementations of one decision is this
 * repository's signature defect, so the claim that {@link stageSessionConfigFor} builds *that* run is
 * not argued here: it is held by an **agreement test on the viewer's side**,
 * `campaign/stageSessionAgreement.test.ts`, which imports this builder through the browser barrel and
 * requires that, for an empty verb log, its config and its legs are the ones the game's builders
 * produce for the same stage and replication. That is the pattern the repository already uses where a
 * lower package reproduces a viewer run (`packages/server/src/leaderboard/rushHoldAgreement.json`,
 * `campaign/stageWatch.test.ts`). If the game ever reads a stage differently, the agreement test goes
 * red rather than this module drifting quietly.
 *
 * **What it deliberately does not do is validate the campaign.** The game's `campaign/parse.ts` is the
 * authority on whether `data/campaign.json` is well-formed; this reads only the fields it needs, refuses
 * by name when one is missing or of the wrong type, and stops there.
 *
 * ## The fields it reads, and nothing else
 *
 * `id`, `building`, `traffic.arrivalRatePctPop5min`, `durationS`, `dispatcher.startingProfileId`,
 * `seeds`, `holdoutSeeds`, `replications`, `goals[].kind` and `budget` (its `startingUnits` and its
 * `steps`). The run is built from the first seven; the goals tell the persona which of P-PLAY-3's
 * checks a stage can be asked; the budget is what a generated purchase is admitted against.
 *
 * ## Environment
 *
 * Pure: it takes the raw JSON as an argument and reads no file, no clock and no random stream. It is
 * on this package's **browser** barrel for exactly one consumer, the agreement test above, which is
 * in a package that may reach only that barrel.
 *
 * The decision to put a `fuzz/` name on the browser barrel is recorded in `DECISIONS.md` § D1590.
 */

import type {
  DispatcherProfile,
  DispatcherProfiles,
  ElevatorSpecs,
  ResolvedBuilding,
  RunInterventionConfig,
  SimulationConfig,
  TrafficProfiles,
} from '@elevator-sim/core';

import { reportWindowForBuilding } from '../benchmark/matrixCells.js';
import { replicationSeed } from '../runner/crn.js';

/** Raised when a stage cannot be read: a missing stage id, or a plain field of the wrong shape. */
export class PlayStageError extends Error {
  override readonly name = 'PlayStageError';
}

/** One of a stage's two declared seed sets, as `data/campaign.json` writes it. */
export interface PlayStageSeedSet {
  readonly name: string;
  /** The master seed, a decimal string. `replicationSeed(seed, i)` is replication `i`'s seed. */
  readonly seed: string;
  readonly replications: number;
}

/** What a stage is, for the persona: the plain fields above and nothing derived from the game. */
export interface PlayStage {
  readonly id: string;
  readonly name: string;
  readonly buildingId: string;
  /** Simulated seconds of demand. */
  readonly durationS: number;
  /** `null` keeps the traffic profile's own rate, exactly as the stage authors it. */
  readonly arrivalRatePctPop5min: number | null;
  readonly startingProfileId: string;
  readonly tuningSeeds: PlayStageSeedSet;
  readonly holdoutSeeds: PlayStageSeedSet;
  readonly replications: number;
  /** The goal kinds the stage is judged on, in authored order. */
  readonly goalKinds: readonly string[];
  /**
   * The budget rungs a player can stand on, cheapest first: the stage's `startingUnits`, then each
   * declared step added in order while its `activeWhen` is met by a step already bought.
   */
  readonly budgetRungs: readonly number[];
}

/** Which seed set a session replays on. The tuning set is the one a player iterates against. */
export type PlaySeedSet = 'tuning' | 'holdout';

/* -------------------------------------------------------------------------- *
 * Reading the plain fields
 * -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stagesOf(raw: unknown): readonly unknown[] {
  if (!isRecord(raw) || !Array.isArray(raw['stages'])) {
    throw new PlayStageError('the campaign file has no "stages" array, so no stage can be read from it.');
  }
  return raw['stages'];
}

/** Every stage id the campaign declares, in authored order. */
export function playStageIdsOf(raw: unknown): readonly string[] {
  return stagesOf(raw)
    .map((stage) => (isRecord(stage) ? stage['id'] : undefined))
    .filter((id): id is string => typeof id === 'string');
}

function field<T>(
  stageId: string,
  path: string,
  value: unknown,
  accept: (value: unknown) => value is T,
  expected: string,
): T {
  if (accept(value)) return value;
  throw new PlayStageError(
    `stage "${stageId}" has no usable "${path}": expected ${expected}, found ${JSON.stringify(value) ?? 'nothing'}.`,
  );
}

const isString = (value: unknown): value is string => typeof value === 'string' && value !== '';
const isPositiveNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const isUnits = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isRate = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isFinite(value) && value > 0);

function seedSetOf(stageId: string, path: string, value: unknown): PlayStageSeedSet {
  const set = field(stageId, path, value, isRecord, 'an object');
  return Object.freeze({
    name: field(stageId, `${path}.name`, set['name'], isString, 'a name'),
    seed: field(stageId, `${path}.seed`, set['seed'], isString, 'a decimal seed string'),
    replications: field(stageId, `${path}.replications`, set['replications'], isCount, 'a positive integer'),
  });
}

/**
 * The rungs a stage's budget ladder offers, cheapest first.
 *
 * A step whose `activeWhen` names a step not yet on the ladder ends it there, because a rung a
 * player cannot reach is not a rung; a malformed step is refused by name rather than skipped.
 */
function budgetRungsOf(stageId: string, value: unknown): readonly number[] {
  const budget = field(stageId, 'budget', value, isRecord, 'an object');
  const start = field(stageId, 'budget.startingUnits', budget['startingUnits'], isUnits, 'a whole number of units');
  const steps = budget['steps'] === undefined ? [] : field(stageId, 'budget.steps', budget['steps'], Array.isArray, 'an array');
  const rungs = [start];
  const bought = new Set<string>();
  let total = start;
  for (const [index, raw] of (steps as readonly unknown[]).entries()) {
    const step = field(stageId, `budget.steps[${String(index)}]`, raw, isRecord, 'an object');
    const id = field(stageId, `budget.steps[${String(index)}].id`, step['id'], isString, 'an id');
    const adds = field(stageId, `budget.steps[${String(index)}].addsUnits`, step['addsUnits'], isUnits, 'a whole number of units');
    const gate = step['activeWhen'];
    if (gate !== null && gate !== undefined && !(typeof gate === 'string' && bought.has(gate))) break;
    bought.add(id);
    total += adds;
    rungs.push(total);
  }
  return Object.freeze(rungs);
}

/**
 * One stage's plain fields, read from the raw `data/campaign.json`.
 *
 * @throws PlayStageError when the stage id is not declared, or a field this reads is malformed.
 */
export function playStageOf(raw: unknown, stageId: string): PlayStage {
  const found = stagesOf(raw).find((stage) => isRecord(stage) && stage['id'] === stageId);
  if (!isRecord(found)) {
    throw new PlayStageError(
      `the campaign declares no stage "${stageId}". Known stages: ${playStageIdsOf(raw).join(', ')}.`,
    );
  }
  const traffic = field(stageId, 'traffic', found['traffic'], isRecord, 'an object');
  const dispatcher = field(stageId, 'dispatcher', found['dispatcher'], isRecord, 'an object');
  const goals = field(stageId, 'goals', found['goals'], Array.isArray, 'an array');
  return Object.freeze({
    id: stageId,
    name: typeof found['name'] === 'string' ? found['name'] : stageId,
    buildingId: field(stageId, 'building', found['building'], isString, 'a building id'),
    durationS: field(stageId, 'durationS', found['durationS'], isPositiveNumber, 'a positive number of seconds'),
    arrivalRatePctPop5min: field(
      stageId,
      'traffic.arrivalRatePctPop5min',
      traffic['arrivalRatePctPop5min'],
      isRate,
      'null or a positive rate',
    ),
    startingProfileId: field(
      stageId,
      'dispatcher.startingProfileId',
      dispatcher['startingProfileId'],
      isString,
      'a dispatcher profile id',
    ),
    tuningSeeds: seedSetOf(stageId, 'seeds', found['seeds']),
    holdoutSeeds: seedSetOf(stageId, 'holdoutSeeds', found['holdoutSeeds']),
    replications: field(stageId, 'replications', found['replications'], isCount, 'a positive integer'),
    goalKinds: Object.freeze(
      (goals as readonly unknown[]).map((goal, index) =>
        field(stageId, `goals[${String(index)}].kind`, isRecord(goal) ? goal['kind'] : undefined, isString, 'a goal kind'),
      ),
    ),
    budgetRungs: budgetRungsOf(stageId, found['budget']),
  });
}

/* -------------------------------------------------------------------------- *
 * The session's run
 * -------------------------------------------------------------------------- */

/** The loaded `data/` a session is built from, beside the stage's own opening dispatcher. */
export interface StageSessionResources {
  /** The stage's building, resolved by `loadConfig`. */
  readonly building: ResolvedBuilding;
  /**
   * `dispatcher.startingProfileId`, resolved: the profile the day opens on.
   *
   * Named `openingProfile` rather than `SimulationConfig`'s `dispatcherProfile` on purpose. This
   * bundle is an argument, never a run config, and {@link stageSessionConfigFor} is the one place it
   * becomes one (with `onTimeout: 'report'`). `validation/shippedRunConfig.test-helper.ts` tells an
   * argument object from a config by a key the config does not declare, which is sound because a
   * literal carrying such a key cannot be assigned to `SimulationConfig`. With the config's own
   * name here, every literal of this type read as a config that forgot `onTimeout`.
   */
  readonly openingProfile: DispatcherProfile;
  readonly trafficProfiles: TrafficProfiles;
  readonly elevatorSpecs: ElevatorSpecs;
  readonly dispatcherProfiles: DispatcherProfiles;
}

/** The master seed of a stage's seed set. */
export function playSeedSetOf(stage: PlayStage, which: PlaySeedSet): PlayStageSeedSet {
  return which === 'tuning' ? stage.tuningSeeds : stage.holdoutSeeds;
}

/**
 * The run one replication of a stage is, with a player's verb log laid on it.
 *
 * For an empty log this is the stage's own replication `replication`: seed
 * `replicationSeed(seedSet.seed, replication)`, the stage's horizon, its demand override when it
 * authors one, `onTimeout: 'report'`, and the reporting window `benchmark/matrixCells.ts`'s rule
 * chooses for the building. The viewer's agreement test is what makes that sentence a measurement.
 *
 * A non-empty log rides on `interventions`, exactly as a live day's record carries it; the field is
 * omitted for an empty log so the config is the one the game builds, key for key.
 */
export function stageSessionConfigFor(
  stage: PlayStage,
  resources: StageSessionResources,
  replication: number,
  interventions: readonly RunInterventionConfig[] = [],
  seedSet: PlaySeedSet = 'tuning',
): SimulationConfig {
  const reportWindow = reportWindowForBuilding(stage.buildingId);
  return {
    building: resources.building,
    dispatcherProfile: resources.openingProfile,
    trafficProfiles: resources.trafficProfiles,
    elevatorSpecs: resources.elevatorSpecs,
    dispatcherProfiles: resources.dispatcherProfiles,
    seed: replicationSeed(playSeedSetOf(stage, seedSet).seed, replication),
    durationS: stage.durationS,
    onTimeout: 'report',
    replication,
    ...(stage.arrivalRatePctPop5min === null
      ? {}
      : { demand: { arrivalRatePctPop5min: stage.arrivalRatePctPop5min } }),
    ...(reportWindow === undefined ? {} : { reportWindow }),
    ...(interventions.length === 0 ? {} : { interventions }),
  };
}
