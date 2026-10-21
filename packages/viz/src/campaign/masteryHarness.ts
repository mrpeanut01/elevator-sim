/**
 * **The mastery harness: each playtest attempt re-judged on a fresh batch, by the game's own judge,
 * in a copy the game never sees** ([§ D1601](../../../../DECISIONS.md), the decision panel's ruling
 * R3 on GitHub issue #645).
 *
 * The game judges every attempt at a stage on the same held-back batch, and shows the verdict, so a
 * slope over the game's own verdicts cannot tell a persona's skill from its learning that batch
 * (§ D1601 clause 2, and the named gap in `experiments`' `engagement/mastery.ts`). The ruling leaves
 * the game alone (clause 1) and re-judges in the harness instead (clause 3). This module is that
 * re-judge. It lives in the viewer because `judgeStage` does, and `experiments` and `cli` may never
 * import the viewer (`boundaries.test.ts`).
 *
 * ## What one attempt costs, and what it returns
 *
 * An attempt is a stage, a move as the stage page sets it, a budget rung and its index *k*. The
 * harness presses the stage twice through `stagePress.ts#pressStage`, the press a player makes:
 *
 * 1. on the **shipped** stage record. This is the fixed-batch verdict the persona was shown, judged
 *    on the stage's own held-back set (`holdout-20260731` on stage 1);
 * 2. on {@link harnessStageOf}'s copy of the record, in which **only** `holdoutSeeds` is replaced by
 *    fresh batch *k* from `data/mastery-seeds.json`. Every other field of the copy is the shipped
 *    record's own object, asserted key by key, and the shipped record is asserted unchanged after
 *    both presses.
 *
 * The two presses share their tuning batch: the second press asks for a request identical to the
 * first's, field for field, and the harness serves it from the first rather than running fifty
 * replications twice. Every request a press made, and whether it was served that way, is returned
 * in {@link RejudgedAttempt.batches}. A move that misses on the stage's own crowds runs no held-back
 * batch in either press, and both read not cleared; a move the admission refuses runs nothing and
 * both read `null`. The fresh press must come back judged on batch *k*: a verdict refused for a seed
 * mismatch (`judge.ts#holdoutVerdictFor`) throws here instead of entering a series.
 *
 * ## The series, the cut-off and the slopes
 *
 * A persona's attempts at one stage form a series, attempt *k* on batch *k* for every persona. The
 * series ends at the first attempt the persona made after reading the source tree: that attempt and
 * every later one are cut, and never pressed, and the output says how many. The pass indicator is
 * each verdict's `cleared`. The fixed series and the fresh series are each fitted by
 * `masterySlopeOf`, and compared only through `pairedMasterySlope(fresh, fixed)`; two slope
 * intervals are never set side by side. Fewer than the bands file's eight attempts after the
 * cut-off publish no slope, by `masterySlopeOf`'s own rule.
 *
 * Every output carries {@link MASTERY_EVIDENCE_LABEL}: a persona is an agent reading a description
 * (`docs/23-audiences-and-core-loop.md` § 1.5), so no figure here is a fact about people.
 *
 * ## Scope
 *
 * Stage 1 only, as the tree stands (§ D1601 clause 4). A count goal's bar is the shipped setting's
 * published count on the stage's own seed sets, and `judge.ts#judgeCountGoal` refuses a goal with no
 * published count for its seeds, so a stage with any count goal is refused here until its bars are
 * measured on the fresh set. `stage-1-first-call` carries only `beat-the-baseline`.
 *
 * ## How to run it
 *
 * The playtest director records each persona's attempts in one JSON file:
 *
 * ```json
 * {
 *   "comment": "optional, free text",
 *   "attempts": [
 *     {
 *       "personaId": "curious-player",
 *       "attempt": 1,
 *       "stageId": "stage-1-first-call",
 *       "move": { "profileId": "collective", "dials": { "idle.parkingStrategy": "zone-center" } },
 *       "rung": null,
 *       "readTreeBefore": false
 *     }
 *   ]
 * }
 * ```
 *
 * - `attempt` counts from 1 and runs without a gap for each persona on each stage.
 * - `move.profileId` is the shipped profile the stage page's standing-order select names, and
 *   `move.dials` maps a dimension id to the value the persona set (`{}` for none). The stage page
 *   sets one dial, where idle cars wait (`idle.parkingStrategy`). A dial set to the value the
 *   profile already holds is dropped, as the page drops it, and a dial set the page itself makes is
 *   built by the page's own `everyday/stagePlay.ts#stagePageMovesOf`; any other set is an edit as
 *   the Engineer Lab makes one, named `<profileId>-edited`.
 * - `rung` is the budget rung's step id (`equipment-rung`, `building-rung`) or `null` for the base.
 * - `readTreeBefore` is whether the persona had read the source tree before making this attempt.
 *   Once true it stays true.
 *
 * The integrator runs the gated deriver `campaign/measure.mastery.test.ts`:
 *
 * ```
 * MASTERY_ATTEMPTS=/path/attempts.json MASTERY_OUT=/path/mastery.json \
 *   npx vitest run --project viz --reporter=default --silent=false src/campaign/measure.mastery.test.ts
 * ```
 *
 * It writes {@link masteryReportJsonOf} to `MASTERY_OUT`, writes {@link formatMasteryReport}'s
 * table beside it at `MASTERY_OUT` plus `.table.txt`, and prints the table. One test case per
 * pressed attempt, so a long file never meets one case's timeout. The two reporter flags are what
 * let the table print in an agent session, where vitest otherwise picks a reporter that hides a
 * passing case's console output; the table file holds the same text either way.
 *
 * ## Reading the output
 *
 * Per series: one row per kept attempt, with the move as it ran, the rung, and each press's seed set
 * and its `met` (every bar on the stage's own crowds), `held` (every bar on the held-back set, `-`
 * where none ran) and `cleared`; then the fixed series' slope, the fresh series' slope, and the
 * paired slope of fresh minus fixed, each as `masterySlopeOf` and `pairedMasterySlope` return them,
 * clears per attempt with the interval. `rising` on the fresh series is the slope the spec asks for,
 * on crowds the persona never saw; `rising` on the fixed series alone may be learning the one batch
 * it was shown. The JSON file carries the same rows and fits, the admission's sentence and each
 * press's headline. Every figure is a premise about agents, not people.
 *
 * ## Callers
 *
 * **No shipped code calls this module, and none may.** Clause 1 leaves the game unchanged and
 * clause 3 shows no fresh verdict to a persona, so a caller on a screen would be the defect. The
 * consumer is the gated deriver above; `masteryHarness.test.ts` holds the rest. The choices made
 * inside this module and its deriver (the move a dial set makes, the shared tuning batch, the
 * reading of the cut-off, the output's shape) are recorded in this docstring (§ D405).
 */

import { deriveStreamSeed, type DispatcherProfile, type ElevatorSpecs, type ResolvedBuilding } from '@elevator-sim/core/browser';
import {
  masterySlopeOf,
  normalizeExperimentSeed,
  pairedMasterySlope,
  parseEngagementBands,
  replicationSeed,
  type MasteryAttempt,
  type MasterySlope,
  type MasterySlopeBands,
  type PairedMasterySlope,
  type ParameterValue,
  type SearchSpace,
} from '@elevator-sim/experiments/browser';

import type { BatchRequest, BatchResult } from '../batch/types.js';
import { valuesFromProfile } from '../controls/editedProfile.js';
import { stagePageMovesOf } from '../everyday/stagePlay.js';
import type { PriceSchedule } from '../pricing/types.js';
import { rungsOf } from '../scenario/budget.js';
import { isPerReplicationGoal } from '../scenario/goals.js';
import type { PublishedGoalRates, PublishedScenario, PublishedSeedSet } from '../scenario/published.js';

import type { StageReport } from './judge.js';
import { pressStage, stageUnitsAt, type StageMove, type StagePress } from './stagePress.js';
import type { StageBatchRunner } from './stageSequence.js';
import type { StageSeedSet } from './stageRun.js';
import type { CampaignStage } from './types.js';

/** The label on every output: who produced the evidence, and what it is not. */
export const MASTERY_EVIDENCE_LABEL =
  'agent evidence, docs/23 § 1.5: personas are agents reading a description, and no figure here is a fact about people';

/** The ruling this harness carries out. */
const RULING = 'DECISIONS.md § D1601';

/* -------------------------------------------------------------------------- *
 * The fresh seeds
 * -------------------------------------------------------------------------- */

/** `data/mastery-seeds.json`, read and re-derived. */
export interface FreshSeedDeclaration {
  readonly stream: string;
  readonly root: string;
  readonly replications: number;
  /** Batch *k* is `batches[k - 1]`. */
  readonly batches: readonly PublishedSeedSet[];
}

/** Batch *k*'s name: the stream, a dash, and *k* as two digits. */
function freshBatchNameOf(stream: string, k: number): string {
  return `${stream}-${String(k).padStart(2, '0')}`;
}

/**
 * **Batch *k*'s master seed, derived from the declared root through the named stream.**
 *
 * `core`'s `deriveStreamSeed(root, "<stream>:<k>")`, its `initState` as a decimal string: the
 * derivation `runner/crn.ts#replicationSeed` applies through its `replication:` stream, through a
 * stream of this declaration's own. Every seed in `data/mastery-seeds.json` must equal this.
 */
export function freshMasterSeedOf(root: string, stream: string, k: number): string {
  if (!Number.isSafeInteger(k) || k < 1) throw new Error(`a fresh batch index counts from 1; received ${String(k)}.`);
  return deriveStreamSeed(normalizeExperimentSeed(root), `${stream}:${String(k)}`).initState.toString();
}

type Json = Readonly<Record<string, unknown>>;

function recordAt(path: string, value: unknown, allowed: readonly string[]): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object; found ${JSON.stringify(value) ?? 'nothing'}.`);
  }
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new Error(`${path} carries ${unknown.map((key) => `"${key}"`).join(', ')}, which this reader refuses rather than ignores.`);
  }
  return value as Json;
}

function textAt(path: string, value: unknown): string {
  if (typeof value === 'string' && value.length > 0) return value;
  throw new Error(`${path} must be a non-empty string; found ${JSON.stringify(value) ?? 'nothing'}.`);
}

/**
 * The declaration, with every seed re-derived and every name and count checked. Refuses rather than
 * ignores: an unknown key, a seed the derivation does not give, a misnamed batch, or a replication
 * count outside CLAUDE.md's 50 to 200.
 */
export function parseFreshSeeds(raw: unknown): FreshSeedDeclaration {
  const top = recordAt('the fresh seed declaration', raw, [
    'generatedBy',
    'contract',
    'stream',
    'root',
    'derivation',
    'replications',
    'batches',
  ]);
  const stream = textAt('stream', top['stream']);
  const root = textAt('root', top['root']);
  if (!/^\d+$/.test(root)) throw new Error(`root must be a decimal seed; found "${root}".`);
  const replications = top['replications'];
  if (typeof replications !== 'number' || !Number.isSafeInteger(replications) || replications < 50 || replications > 200) {
    throw new Error(`replications must be a whole number from 50 to 200 (CLAUDE.md § Statistical discipline); found ${JSON.stringify(replications) ?? 'nothing'}.`);
  }
  const rows = top['batches'];
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('batches must be a non-empty array.');
  const batches = rows.map((row: unknown, index): PublishedSeedSet => {
    const k = index + 1;
    const at = `batches[${String(index)}]`;
    const batch = recordAt(at, row, ['name', 'seed', 'replications']);
    const name = textAt(`${at}.name`, batch['name']);
    const seed = textAt(`${at}.seed`, batch['seed']);
    if (name !== freshBatchNameOf(stream, k)) {
      throw new Error(`${at} is named "${name}"; batch ${String(k)} of stream ${stream} is "${freshBatchNameOf(stream, k)}".`);
    }
    const derived = freshMasterSeedOf(root, stream, k);
    if (seed !== derived) {
      throw new Error(`${at} (${name}) declares seed ${seed}; the stream derives ${derived}. A fresh seed is derived, never typed.`);
    }
    if (batch['replications'] !== replications) {
      throw new Error(`${at} (${name}) runs ${JSON.stringify(batch['replications']) ?? 'nothing'} replications; the declaration runs ${String(replications)}.`);
    }
    return Object.freeze({ name, seed, replications });
  });
  return Object.freeze({ stream, root, replications, batches: Object.freeze(batches) });
}

/** Every replication seed of a set, as decimal strings. `runner/crn.ts`'s derivation, by import. */
function replicationSeedsOf(set: PublishedSeedSet): readonly string[] {
  return Array.from({ length: set.replications }, (_, index) => replicationSeed(set.seed, index).toString());
}

/**
 * **Every collision between the fresh batches and the given seed sets, or none.**
 *
 * Three questions, over the seeds the runs actually use as well as the masters: does a fresh master
 * seed equal a master seed of a given set; does any replication seed of one set (fresh or given)
 * equal a replication seed of another; and does a fresh master equal any replication seed. Given
 * sets that agree in name, master and size are counted once, since every shipped stage declares
 * the same two.
 */
export function freshSeedCollisions(
  declaration: FreshSeedDeclaration,
  stageSets: readonly PublishedSeedSet[],
): readonly string[] {
  const given = [...new Map(stageSets.map((set) => [`${set.name}/${set.seed}/${String(set.replications)}`, set])).values()];
  const violations: string[] = [];
  for (const batch of declaration.batches) {
    for (const set of given) {
      if (batch.seed === set.seed) violations.push(`fresh batch ${batch.name} has the master seed of ${set.name}, ${set.seed}.`);
    }
  }
  const owner = new Map<string, string>();
  for (const set of [...given, ...declaration.batches]) {
    for (const seed of replicationSeedsOf(set)) {
      const first = owner.get(seed);
      if (first !== undefined && first !== set.name) {
        violations.push(`replication seed ${seed} belongs to both ${first} and ${set.name}.`);
      } else owner.set(seed, set.name);
    }
  }
  for (const batch of declaration.batches) {
    const first = owner.get(batch.seed);
    if (first !== undefined) violations.push(`fresh batch ${batch.name}'s master seed ${batch.seed} is a replication seed of ${first}.`);
  }
  return violations;
}

/* -------------------------------------------------------------------------- *
 * The harness copy
 * -------------------------------------------------------------------------- */

/**
 * **The stage record with only `holdoutSeeds` replaced by a fresh batch**, asserted.
 *
 * Every other key of the copy is the shipped record's own value, by identity, and the key lists
 * match in order, so the copy is the shipped record in every field but one. The batch must run the
 * stage's own replication count, because `stageRun.ts#batchRequestForStage` runs `stage.replications`
 * on either set, and its seeds must be disjoint from the stage's own two sets. Nothing is mutated.
 */
export function harnessStageOf(stage: CampaignStage, batch: PublishedSeedSet): CampaignStage {
  if (batch.replications !== stage.replications) {
    throw new Error(`fresh batch ${batch.name} runs ${String(batch.replications)} replications and stage ${stage.id} judges over ${String(stage.replications)}.`);
  }
  const clashes = freshSeedCollisions({ stream: '', root: '', replications: batch.replications, batches: [batch] }, [
    stage.seeds,
    stage.holdoutSeeds,
  ]);
  if (clashes.length > 0) throw new Error(`fresh batch ${batch.name} is not disjoint from stage ${stage.id}'s own seeds: ${clashes[0] ?? ''}`);
  const copy: CampaignStage = { ...stage, holdoutSeeds: Object.freeze({ name: batch.name, seed: batch.seed, replications: batch.replications }) };
  const keys = Object.keys(stage);
  const copied = Object.keys(copy);
  const differing = copied.filter((key) => (copy as unknown as Json)[key] !== (stage as unknown as Json)[key]);
  if (copied.join('\n') !== keys.join('\n') || differing.join() !== 'holdoutSeeds') {
    throw new Error(`the harness copy of ${stage.id} differs from the shipped record in ${differing.join(', ') || 'nothing'}; it may differ in holdoutSeeds alone.`);
  }
  return copy;
}

/**
 * Refuses a stage the harness cannot judge on a fresh batch: one with a count goal, whose bar is the
 * shipped setting's published count on the stage's own seeds (§ D1601 clause 4).
 */
function assertInScope(stage: CampaignStage): void {
  const counted = stage.goals.filter((goal) => isPerReplicationGoal(goal.kind)).map((goal) => goal.kind);
  if (counted.length > 0) {
    throw new Error(
      `stage ${stage.id} carries count goals (${counted.join(', ')}), whose bars are published only for its own seed sets; ` +
        `${RULING} clause 4 asks for each bar to be measured on the fresh set before the harness can judge it.`,
    );
  }
}

/* -------------------------------------------------------------------------- *
 * The attempt file
 * -------------------------------------------------------------------------- */

/** One attempt, as the playtest director records it. See the module docstring for the file. */
export interface MasteryAttemptRecord {
  readonly personaId: string;
  /** From 1, without a gap, within one persona's attempts at one stage. */
  readonly attempt: number;
  readonly stageId: string;
  readonly move: {
    readonly profileId: string;
    readonly dials: Readonly<Record<string, ParameterValue>>;
  };
  /** The budget rung's step id, or `null` for the stage's base rung. */
  readonly rung: string | null;
  /** Whether the persona had read the source tree before this attempt. */
  readonly readTreeBefore: boolean;
}

function dialsAt(path: string, value: unknown): Readonly<Record<string, ParameterValue>> {
  if (value === undefined) return Object.freeze({});
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must map dimension ids to values; found ${JSON.stringify(value) ?? 'nothing'}.`);
  }
  const record = value as Json;
  for (const [id, dial] of Object.entries(record)) {
    if (typeof dial !== 'string' && typeof dial !== 'number' && typeof dial !== 'boolean') {
      throw new Error(`${path}["${id}"] must be a string, a number or a boolean; found ${JSON.stringify(dial) ?? 'nothing'}.`);
    }
  }
  return Object.freeze({ ...(record as Readonly<Record<string, ParameterValue>>) });
}

/** The attempt file, read. Refuses an unknown key, a gap in a series, and a tree read undone. */
export function parseMasteryAttempts(raw: unknown): readonly MasteryAttemptRecord[] {
  const top = recordAt('the attempt file', raw, ['comment', 'attempts']);
  const rows = top['attempts'];
  if (!Array.isArray(rows)) throw new Error('the attempt file needs an "attempts" array.');
  const attempts = rows.map((row: unknown, index): MasteryAttemptRecord => {
    const at = `attempts[${String(index)}]`;
    const entry = recordAt(at, row, ['personaId', 'attempt', 'stageId', 'move', 'rung', 'readTreeBefore']);
    const move = recordAt(`${at}.move`, entry['move'], ['profileId', 'dials']);
    const attempt = entry['attempt'];
    if (typeof attempt !== 'number' || !Number.isSafeInteger(attempt) || attempt < 1) {
      throw new Error(`${at}.attempt must be a whole number from 1; found ${JSON.stringify(attempt) ?? 'nothing'}.`);
    }
    const rung = entry['rung'];
    if (rung !== null && typeof rung !== 'string') throw new Error(`${at}.rung must be a step id or null.`);
    const readTreeBefore = entry['readTreeBefore'];
    if (typeof readTreeBefore !== 'boolean') throw new Error(`${at}.readTreeBefore must be true or false.`);
    return Object.freeze({
      personaId: textAt(`${at}.personaId`, entry['personaId']),
      attempt,
      stageId: textAt(`${at}.stageId`, entry['stageId']),
      move: Object.freeze({ profileId: textAt(`${at}.move.profileId`, move['profileId']), dials: dialsAt(`${at}.move.dials`, move['dials']) }),
      rung,
      readTreeBefore,
    });
  });
  for (const series of seriesOf(attempts)) {
    series.forEach((attempt, index) => {
      if (attempt.attempt !== index + 1) {
        throw new Error(`${attempt.personaId} on ${attempt.stageId}: attempts must run 1, 2, 3 … without a gap or a repeat; found ${series.map((one) => String(one.attempt)).join(', ')}.`);
      }
      const before = series[index - 1];
      if (before?.readTreeBefore === true && !attempt.readTreeBefore) {
        throw new Error(`${attempt.personaId} on ${attempt.stageId}: attempt ${String(attempt.attempt)} says the tree was not read after attempt ${String(before.attempt)} said it was.`);
      }
    });
  }
  return Object.freeze(attempts);
}

/** One persona's attempts at one stage, in attempt order, in the order each series first appears. */
function seriesOf(attempts: readonly MasteryAttemptRecord[]): readonly (readonly MasteryAttemptRecord[])[] {
  const byKey = new Map<string, MasteryAttemptRecord[]>();
  for (const attempt of attempts) {
    const key = `${attempt.personaId}\n${attempt.stageId}`;
    const list = byKey.get(key) ?? [];
    list.push(attempt);
    byKey.set(key, list);
  }
  return [...byKey.values()].map((list) => [...list].sort((a, b) => a.attempt - b.attempt));
}

/** Where a series is cut: every attempt from the first one made after the persona read the tree. */
export interface MasteryCut {
  readonly kept: readonly MasteryAttemptRecord[];
  readonly cut: readonly MasteryAttemptRecord[];
  /** The first cut attempt's index, or `null` when the persona never read the tree. */
  readonly fromAttempt: number | null;
}

/** The cut-off, § D1601 clause 3: the series ends at the first attempt after the persona read the tree. */
export function masteryCutOf(series: readonly MasteryAttemptRecord[]): MasteryCut {
  const at = series.findIndex((attempt) => attempt.readTreeBefore);
  if (at < 0) return Object.freeze({ kept: series, cut: [], fromAttempt: null });
  return Object.freeze({ kept: series.slice(0, at), cut: series.slice(at), fromAttempt: series[at]?.attempt ?? null });
}

/* -------------------------------------------------------------------------- *
 * The plan
 * -------------------------------------------------------------------------- */

/** What the harness reads besides the attempt file. Real objects, all of them. */
export interface MasteryHarnessResources {
  readonly stages: readonly CampaignStage[];
  readonly published: PublishedGoalRates;
  readonly space: SearchSpace;
  readonly schedule: PriceSchedule;
  readonly profiles: readonly DispatcherProfile[];
  readonly buildings: readonly ResolvedBuilding[];
  readonly elevatorSpecs: ElevatorSpecs | undefined;
  /** How a batch is run. The deriver hands over `batch/runBatch.ts#runBatch`. */
  readonly run: StageBatchRunner;
}

/** One attempt the harness will press: the record, the stage, the move, the budget and batch *k*. */
export interface MasteryTask {
  readonly record: MasteryAttemptRecord;
  readonly stage: CampaignStage;
  readonly scenario: PublishedScenario;
  readonly move: StageMove;
  /** The move's name: the profile id, the page's `<profile>-parked-<value>`, or `<profile>-edited`. */
  readonly moveName: string;
  readonly budgetUnits: number;
  readonly batch: PublishedSeedSet;
}

export interface MasteryPlanSeries {
  readonly personaId: string;
  readonly stageId: string;
  readonly tasks: readonly MasteryTask[];
  readonly cut: MasteryCut;
}

export interface MasteryPlan {
  readonly seeds: FreshSeedDeclaration;
  readonly bands: MasterySlopeBands;
  readonly series: readonly MasteryPlanSeries[];
}

function sameValues(a: Readonly<Record<string, ParameterValue>>, b: Readonly<Record<string, ParameterValue>>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.is(a[key], b[key]));
}

/**
 * The move an attempt names, made the way the surface that offers it makes it: the bare profile for
 * no dial (or only dials at the profile's own values, which the page drops), the stage page's own
 * move for a dial set the page offers, and an Engineer Lab edit for anything else.
 */
function moveOf(record: MasteryAttemptRecord, resources: MasteryHarnessResources): { move: StageMove; name: string } {
  const profile = resources.profiles.find((entry) => entry.id === record.move.profileId);
  if (profile === undefined) throw new Error(`${record.personaId} attempt ${String(record.attempt)} names profile "${record.move.profileId}", which this build does not ship.`);
  const unknown = Object.keys(record.move.dials).filter((id) => !resources.space.ids.includes(id));
  if (unknown.length > 0) throw new Error(`${record.personaId} attempt ${String(record.attempt)} sets ${unknown.join(', ')}, which the search space does not declare.`);
  const standing = valuesFromProfile(resources.space, profile);
  const moved = Object.fromEntries(Object.entries(record.move.dials).filter(([id, value]) => !Object.is(standing.get(id), value)));
  if (Object.keys(moved).length === 0) return { move: { profile }, name: profile.id };
  const page = stagePageMovesOf([profile], resources.space, resources.schedule).find(
    (entry) => entry.move.edit !== undefined && sameValues(entry.move.edit.values, moved),
  );
  if (page !== undefined) return { move: page.move, name: page.name };
  const name = `${profile.id}-edited`;
  return { move: { profile, edit: { baseProfileId: profile.id, profileId: name, values: moved } }, name };
}

/**
 * **Everything checked before anything runs**: the bands file's mastery rule, the fresh seeds and
 * their collisions with every shipped stage's sets, each series' cut, and each kept attempt's stage
 * (in scope), rung, move and batch. A file the harness cannot press in full is refused here.
 */
export function planMasteryRejudge(input: {
  readonly attempts: unknown;
  readonly seeds: unknown;
  readonly bands: unknown;
  readonly resources: MasteryHarnessResources;
}): MasteryPlan {
  const { resources } = input;
  const bands = parseEngagementBands(input.bands, resources.stages.map((stage) => stage.id)).masterySlope;
  const seeds = parseFreshSeeds(input.seeds);
  if (seeds.batches.length < bands.attempts) {
    throw new Error(`the declaration has ${String(seeds.batches.length)} batches and the bands file asks for ${String(bands.attempts)} attempts.`);
  }
  const collisions = freshSeedCollisions(seeds, resources.stages.flatMap((stage) => [stage.seeds, stage.holdoutSeeds]));
  if (collisions.length > 0) throw new Error(`the fresh seeds collide with a stage's: ${collisions.join(' ')}`);

  const series = seriesOf(parseMasteryAttempts(input.attempts)).map((list): MasteryPlanSeries => {
    const first = list[0] as MasteryAttemptRecord;
    const stage = resources.stages.find((entry) => entry.id === first.stageId);
    if (stage === undefined) throw new Error(`${first.personaId} plays stage "${first.stageId}", which the campaign does not ship.`);
    assertInScope(stage);
    const scenario = resources.published.scenarios.find((entry) => entry.id === stage.id);
    if (scenario === undefined) throw new Error(`stage ${stage.id} has no published goal row.`);
    const cut = masteryCutOf(list);
    const rungs = new Set(rungsOf(stage.budget).map((rung) => rung.stepId));
    const tasks = cut.kept.map((record): MasteryTask => {
      if (!rungs.has(record.rung)) throw new Error(`${record.personaId} attempt ${String(record.attempt)} stands on rung "${String(record.rung)}", which stage ${stage.id} does not sell.`);
      const batch = seeds.batches[record.attempt - 1];
      if (batch === undefined) {
        throw new Error(`${record.personaId} attempt ${String(record.attempt)} needs fresh batch ${String(record.attempt)} and the declaration has ${String(seeds.batches.length)}; declare more.`);
      }
      const { move, name } = moveOf(record, resources);
      return Object.freeze({ record, stage, scenario, move, moveName: name, budgetUnits: stageUnitsAt(stage, record.rung), batch });
    });
    return Object.freeze({ personaId: first.personaId, stageId: stage.id, tasks, cut });
  });
  return Object.freeze({ seeds, bands, series });
}

/* -------------------------------------------------------------------------- *
 * One attempt, re-judged
 * -------------------------------------------------------------------------- */

/** One press's verdict, read for the series. `null` fields mean the admission refused the move. */
export interface RejudgedVerdict {
  /** The seed set this press held in the holdout role. */
  readonly seedSet: PublishedSeedSet;
  readonly admitted: boolean;
  readonly metOnTuningSeeds: boolean | null;
  /** Whether a held-back batch ran: only when the move met every bar on the stage's own crowds. */
  readonly holdoutRan: boolean;
  /** The held-back half's verdict, or `null` where none ran. */
  readonly held: boolean | null;
  readonly cleared: boolean | null;
  /** The judge's whole report, or `null` where the admission refused the move. */
  readonly report: StageReport | null;
}

/** One batch a press asked for. */
export interface MasteryBatchProvenance {
  readonly press: 'fixed' | 'fresh';
  readonly seedSet: StageSeedSet;
  /** The master seed the request named. */
  readonly seed: string;
  /** `true` when the request equalled the fixed press's own and was served from it. */
  readonly shared: boolean;
  readonly result: BatchResult;
}

export interface RejudgedAttempt {
  readonly task: MasteryTask;
  /** The admission's own sentence, the same for both presses. */
  readonly admission: string;
  readonly fixed: RejudgedVerdict;
  readonly fresh: RejudgedVerdict;
  readonly batches: readonly MasteryBatchProvenance[];
}

function verdictOf(press: StagePress, seedSet: PublishedSeedSet): RejudgedVerdict {
  if (press.kind === 'refused') {
    return { seedSet, admitted: false, metOnTuningSeeds: null, holdoutRan: false, held: null, cleared: null, report: null };
  }
  const report = press.outcome.verdict;
  return {
    seedSet,
    admitted: true,
    metOnTuningSeeds: report.metOnTuningSeeds,
    holdoutRan: report.holdout !== null,
    held: report.holdout?.held ?? null,
    cleared: report.cleared,
    report,
  };
}

/** The held-back half must be judged on the set the press was given, never refused for a mismatch. */
function assertJudgedOn(verdict: RejudgedVerdict, stageId: string): void {
  const holdout = verdict.report?.holdout;
  if (holdout === undefined || holdout === null) return;
  if (holdout.seed !== verdict.seedSet.seed || holdout.seedSetName !== verdict.seedSet.name || holdout.goals.length === 0) {
    throw new Error(`stage ${stageId}: the held-back half came back on ${holdout.seedSetName}/${holdout.seed} and was meant for ${verdict.seedSet.name}/${verdict.seedSet.seed}: ${holdout.sentence}`);
  }
}

/**
 * **Press one attempt twice**, on the shipped record and on the harness copy for its batch, through
 * `pressStage`. See the module docstring for what is shared, what is asserted and what is returned.
 */
export async function rejudgeAttempt(task: MasteryTask, resources: MasteryHarnessResources): Promise<RejudgedAttempt> {
  const { stage } = task;
  const shipped = JSON.stringify(stage);
  const building = resources.buildings.find((entry) => entry.id === stage.building);
  const baseline = resources.profiles.find((entry) => entry.id === stage.dispatcher.startingProfileId);
  if (baseline === undefined) throw new Error(`stage ${stage.id}'s own setting "${stage.dispatcher.startingProfileId}" is not in this build.`);
  const context = { space: resources.space, schedule: resources.schedule, baseline, building, elevatorSpecs: resources.elevatorSpecs };

  const batches: MasteryBatchProvenance[] = [];
  const tuning = new Map<string, BatchResult>();
  const runnerFor =
    (press: 'fixed' | 'fresh'): StageBatchRunner =>
    async (request: BatchRequest, seedSet: StageSeedSet) => {
      const key = JSON.stringify(request);
      const served = press === 'fresh' && seedSet === 'tuning' ? tuning.get(key) : undefined;
      const result = served ?? (await resources.run(request, seedSet));
      if (press === 'fixed' && seedSet === 'tuning') tuning.set(key, result);
      batches.push({ press, seedSet, seed: request.seed, shared: served !== undefined, result });
      return result;
    };

  const fixedPress = await pressStage({ stage, published: task.scenario, context, move: task.move, budgetUnits: task.budgetUnits, run: runnerFor('fixed') });
  const freshPress = await pressStage({
    stage: harnessStageOf(stage, task.batch),
    published: task.scenario,
    context,
    move: task.move,
    budgetUnits: task.budgetUnits,
    run: runnerFor('fresh'),
  });

  if (JSON.stringify(stage) !== shipped) throw new Error(`stage ${stage.id}'s shipped record changed while it was re-judged.`);
  const fixed = verdictOf(fixedPress, stage.holdoutSeeds);
  const fresh = verdictOf(freshPress, task.batch);
  assertJudgedOn(fixed, stage.id);
  assertJudgedOn(fresh, stage.id);
  return Object.freeze({ task, admission: fixedPress.admission.sentence, fixed, fresh, batches: Object.freeze(batches) });
}

/* -------------------------------------------------------------------------- *
 * The series, and the report
 * -------------------------------------------------------------------------- */

/** The game's pass indicator for one attempt, on the set its press held in the holdout role. */
function masteryAttemptOf(verdict: RejudgedVerdict): MasteryAttempt {
  return { pass: verdict.cleared, seedSet: { role: 'holdout', name: verdict.seedSet.name } };
}

/** The three fits over one series: each series alone, and the fresh series against the fixed one. */
export interface MasterySlopes {
  readonly fixed: MasterySlope;
  readonly fresh: MasterySlope;
  /** `pairedMasterySlope(fresh, fixed)`: `rising` means the fresh series rises faster than the fixed one. */
  readonly paired: PairedMasterySlope;
}

/** The slopes over a kept series, through `engagement/mastery.ts` and nothing else. */
export function masterySlopesOf(attempts: readonly Pick<RejudgedAttempt, 'fixed' | 'fresh'>[], bands: MasterySlopeBands): MasterySlopes {
  const fixed = attempts.map((attempt) => masteryAttemptOf(attempt.fixed));
  const fresh = attempts.map((attempt) => masteryAttemptOf(attempt.fresh));
  return Object.freeze({
    fixed: masterySlopeOf(fixed, bands),
    fresh: masterySlopeOf(fresh, bands),
    paired: pairedMasterySlope(fresh, fixed, bands),
  });
}

export interface MasterySeriesReport {
  readonly personaId: string;
  readonly stageId: string;
  readonly attempts: readonly RejudgedAttempt[];
  readonly cut: MasteryCut;
  readonly slopes: MasterySlopes;
}

export interface MasteryReport {
  readonly label: string;
  readonly ruling: string;
  readonly seeds: Pick<FreshSeedDeclaration, 'stream' | 'root' | 'replications'>;
  readonly series: readonly MasterySeriesReport[];
}

/** The report over a plan, from the attempts {@link rejudgeAttempt} returned for its tasks. */
export function masteryReportOf(plan: MasteryPlan, rejudged: readonly RejudgedAttempt[]): MasteryReport {
  const series = plan.series.map((entry): MasterySeriesReport => {
    const attempts = entry.tasks.map((task) => {
      const found = rejudged.find((attempt) => attempt.task === task);
      if (found === undefined) throw new Error(`${entry.personaId} attempt ${String(task.record.attempt)} was planned and never re-judged.`);
      return found;
    });
    return Object.freeze({ personaId: entry.personaId, stageId: entry.stageId, attempts, cut: entry.cut, slopes: masterySlopesOf(attempts, plan.bands) });
  });
  return Object.freeze({
    label: MASTERY_EVIDENCE_LABEL,
    ruling: RULING,
    seeds: { stream: plan.seeds.stream, root: plan.seeds.root, replications: plan.seeds.replications },
    series,
  });
}

/** A number for JSON: `NaN` and the infinities become `null`, as `JSON.stringify` would make them. */
function finite(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function verdictJsonOf(verdict: RejudgedVerdict): Json {
  return {
    seedSet: verdict.seedSet.name,
    seed: verdict.seedSet.seed,
    admitted: verdict.admitted,
    metOnTuningSeeds: verdict.metOnTuningSeeds,
    holdoutRan: verdict.holdoutRan,
    held: verdict.held,
    cleared: verdict.cleared,
    headline: verdict.report?.headline ?? null,
  };
}

function slopeJsonOf(slope: MasterySlope): Json {
  return {
    verdict: slope.verdict,
    attempts: slope.attempts,
    required: slope.required,
    passes: slope.passes,
    fails: slope.fails,
    refused: slope.refused,
    slopePerAttempt: finite(slope.slopePerAttempt),
    lower: finite(slope.lower),
    upper: finite(slope.upper),
    confidence: slope.confidence,
    distinctSeedSets: slope.distinctSeedSets,
    seedSetsDisjoint: slope.seedSetsDisjoint,
    suppressedBecause: slope.suppressedBecause ?? null,
  };
}

/** The report as plain JSON for the deriver's file: no judge reports, no batches, no `NaN`. */
export function masteryReportJsonOf(report: MasteryReport): Json {
  return {
    label: report.label,
    ruling: report.ruling,
    seeds: report.seeds,
    series: report.series.map((series) => ({
      personaId: series.personaId,
      stageId: series.stageId,
      cut: { count: series.cut.cut.length, fromAttempt: series.cut.fromAttempt },
      attempts: series.attempts.map((attempt) => ({
        attempt: attempt.task.record.attempt,
        move: attempt.task.moveName,
        rung: attempt.task.record.rung,
        budgetUnits: attempt.task.budgetUnits,
        admission: attempt.admission,
        fixed: verdictJsonOf(attempt.fixed),
        fresh: verdictJsonOf(attempt.fresh),
      })),
      slopes: {
        fixed: slopeJsonOf(series.slopes.fixed),
        fresh: slopeJsonOf(series.slopes.fresh),
        paired: {
          verdict: series.slopes.paired.verdict,
          pairs: series.slopes.paired.pairs,
          slopeDifference: finite(series.slopes.paired.slopeDifference),
          lower: finite(series.slopes.paired.lower),
          upper: finite(series.slopes.paired.upper),
          suppressedBecause: series.slopes.paired.suppressedBecause ?? null,
        },
      },
    })),
  };
}

function yesNo(value: boolean | null): string {
  return value === null ? '-' : value ? 'yes' : 'no';
}

function verdictCell(verdict: RejudgedVerdict): string {
  if (!verdict.admitted) return `${verdict.seedSet.name.padEnd(16)} refused`;
  return `${verdict.seedSet.name.padEnd(16)} met ${yesNo(verdict.metOnTuningSeeds).padEnd(3)} held ${yesNo(verdict.held).padEnd(3)} cleared ${yesNo(verdict.cleared)}`;
}

function slopeLine(slope: MasterySlope): string {
  if (slope.verdict === 'suppressed' || slope.verdict === 'no-attempts') {
    return `${slope.verdict}${slope.suppressedBecause === undefined ? '' : `: ${slope.suppressedBecause}`} (${String(slope.passes)} of ${String(slope.attempts)} cleared)`;
  }
  return `${slope.verdict}, ${slope.slopePerAttempt.toFixed(3)} clears per attempt, [${slope.lower.toFixed(3)}, ${slope.upper.toFixed(3)}] at ${String(slope.confidence * 100)} % (${String(slope.passes)} of ${String(slope.attempts)} cleared)`;
}

function pairedLine(paired: PairedMasterySlope): string {
  if (paired.verdict === 'suppressed' || paired.verdict === 'no-attempts') {
    return `${paired.verdict}${paired.suppressedBecause === undefined ? '' : `: ${paired.suppressedBecause}`}`;
  }
  return `${paired.verdict}, ${paired.slopeDifference.toFixed(3)} per attempt, [${paired.lower.toFixed(3)}, ${paired.upper.toFixed(3)}] over ${String(paired.pairs)} pairs`;
}

/** The printed table: one block per series, every attempt with both verdicts, then the three fits. */
export function formatMasteryReport(report: MasteryReport): string {
  const lines = [
    `MASTERY RE-JUDGE, ${report.ruling}`,
    `Label: ${report.label}.`,
    `Fresh batches: stream ${report.seeds.stream}, root ${report.seeds.root}, ${String(report.seeds.replications)} replications each; attempt k is judged on batch k.`,
    'The fixed column is the game’s verdict, on the batch the persona was shown. The fresh column is never shown to a persona.',
  ];
  for (const series of report.series) {
    const cut =
      series.cut.fromAttempt === null
        ? 'no attempt cut'
        : `${String(series.cut.cut.length)} cut, from attempt ${String(series.cut.fromAttempt)}, the first after the tree was read`;
    lines.push('', `${series.personaId} on ${series.stageId}: ${String(series.attempts.length)} judged, ${cut}`);
    lines.push(`  ${'#'.padStart(2)}  ${'move'.padEnd(34)} ${'rung'.padEnd(15)} ${'fixed'.padEnd(47)} fresh`);
    for (const attempt of series.attempts) {
      lines.push(
        `  ${String(attempt.task.record.attempt).padStart(2)}  ${attempt.task.moveName.padEnd(34)} ${(attempt.task.record.rung ?? 'base').padEnd(15)} ${verdictCell(attempt.fixed).padEnd(47)} ${verdictCell(attempt.fresh)}`,
      );
    }
    lines.push(`  fixed batch:         ${slopeLine(series.slopes.fixed)}`);
    lines.push(`  fresh batches:       ${slopeLine(series.slopes.fresh)}`);
    lines.push(`  fresh against fixed: ${pairedLine(series.slopes.paired)}`);
  }
  return `${lines.join('\n')}\n`;
}
