/**
 * The scenario schema — `docs/10-experience-layer-contract.md` § 5.2's *"validated by a schema"* —
 * and the rule that a goal cannot be authored, only selected.
 *
 * ## The clause that matters
 *
 * [§ D160](../../../../DECISIONS.md): *"`data/scenario-goals.json` is the published table and T65
 * must take its goals only from its `goals` buckets."* This module makes that mechanical, and in
 * **both** directions:
 *
 * - **Subset.** A goal kind a stage declares must be in that stage's `goals` bucket. A goal with no
 *   measured across-seed rate cannot be written into a campaign, which is R12 at load time rather
 *   than in review.
 * - **Superset.** Every kind in that bucket must be declared. A measured live goal quietly left out
 *   of a stage is indistinguishable, on screen, from a goal that was never measured — and the
 *   whole of W9's finding is that the second thing is the defect. So the two lists are **equal**,
 *   and both halves have their own violation sentence.
 *
 * ## Everything a run is a function of is pinned to the measurement
 *
 * Building, dispatcher, horizon, demand level, both seed sets and the replication count are
 * checked field by field against `data/scenario-goals.json`'s entry for the same stage id. This is
 * not belt-and-braces: a pass rate is a property of **one configuration**, so a campaign that ran
 * stage 5 at a different demand level than the table measured would be judging the player against
 * a bar taken from a different building. § D158's own operational finding is the same shape one
 * level down — *"a level validated at n = 20 can suppress at n = 50"*.
 *
 * ## Nothing here knows what a dimension is called
 *
 * The declared dimension ids arrive as {@link CampaignContext.dimensionIds}, and the shipped caller
 * passes `collectSearchSpace().ids`. There is no list of parameter names in this file, in
 * `data/campaign.json`'s validator, or in the panel: a knob `core` declares tomorrow is authorable
 * with no edit here, and a knob deleted tomorrow turns the campaign red rather than silently
 * meaning nothing.
 */

import { replicationSeed } from '@elevator-sim/experiments/browser';

import { FAIL_STATES, type Campaign, type CampaignStage, type EditableDimensions, type FailState } from './types.js';
import { probabilityWordIn } from './words.js';
import { MAX_REPLICATION_BUDGET, MIN_REPLICATION_BUDGET } from '../batch/report.js';
import { GOAL_KINDS, GOAL_TAKES_THRESHOLD, goalLabel, type GoalKind, type GoalSpec } from '../scenario/goals.js';
import type { PublishedGoalRates, PublishedScenario, PublishedSeedSet } from '../scenario/published.js';

/** Raised when `data/campaign.json` cannot be read as a campaign at all. */
export class CampaignError extends Error {
  override readonly name = 'CampaignError';
  /** Every violation found, not just the first — the same shape `ConfigError` uses. */
  readonly violations: readonly string[];

  constructor(violations: readonly string[]) {
    super(`the campaign is not valid:\n  ${violations.join('\n  ')}`);
    this.violations = violations;
  }
}

/**
 * What a campaign is validated **against**. Every field is derived by the caller, never imported
 * here, so a test can inject a fictional search space or a table with one stage removed.
 */
export interface CampaignContext {
  /** `data/scenario-goals.json`, loaded and already validated by `scenario/published.ts`. */
  readonly published: PublishedGoalRates;
  /** `collectSearchSpace().ids`. The only statement anywhere about what a dimension may be. */
  readonly dimensionIds: readonly string[];
  /** Dispatcher profile ids this build's `data/` carries. */
  readonly profileIds: ReadonlySet<string>;
  /**
   * Access-controlled floors per building id, from `access/zoning.ts`'s `restrictedFloorIds`.
   *
   * A building missing from this map is a building this build does not ship, which is its own
   * violation. An **empty list** is the statement that the building declares no access zone, and
   * it is what decides whether a `locked-out` lever is required or refused.
   */
  readonly restrictedFloorIdsByBuilding: ReadonlyMap<string, readonly string[]>;
}

/* -------------------------------------------------------------------------- *
 * Resolving the editable set
 * -------------------------------------------------------------------------- */

/**
 * The dimension ids a stage lets the player move, resolved against the discovered space.
 *
 * Exported because the panel and the judge both need the same answer, and two answers to *"may I
 * move this?"* is one more than the product can defend.
 */
export function editableIdsOf(
  editable: EditableDimensions,
  dimensionIds: readonly string[],
): readonly string[] {
  return editable.mode === 'every-declared-dimension' ? dimensionIds : editable.ids;
}

/* -------------------------------------------------------------------------- *
 * Validation
 * -------------------------------------------------------------------------- */

/**
 * Every way a campaign can be wrong, as sentences. Empty means it is sound.
 *
 * A list rather than a throw, for `scenario/published.ts`'s stated reason: the caller is a test
 * whose failure text is what a future reader sees, and `toEqual([])` prints every violation at
 * once.
 */
export function validateCampaign(campaign: Campaign, context: CampaignContext): readonly string[] {
  const violations: string[] = [];
  if (campaign.stages.length === 0) {
    violations.push('the campaign declares no stages, so there is no progression.');
  }

  const seen = new Set<string>();
  for (const stage of campaign.stages) {
    const where = `stage "${stage.id}"`;
    if (seen.has(stage.id)) violations.push(`${where}: declared twice.`);
    seen.add(stage.id);

    const published = context.published.scenarios.find((entry) => entry.id === stage.id);
    if (published === undefined) {
      violations.push(
        `${where}: has no entry in the published goal table. A stage whose goals were never ` +
          'measured cannot ship — R12, and § D160 makes data/scenario-goals.json the only source ' +
          'of goals.',
      );
      continue;
    }

    violations.push(...checkProse(where, stage));
    violations.push(...checkConfiguration(where, stage, published, context));
    violations.push(...checkSeeds(where, stage, published));
    violations.push(...checkGoals(where, stage, published));
    violations.push(...checkLevers(where, stage, context));
  }

  return violations;
}

/** § 5.2's *"2–3 sentences of plain language"*, and R10 over every word of it. */
function checkProse(where: string, stage: CampaignStage): readonly string[] {
  const violations: string[] = [];
  if (stage.name.trim() === '') violations.push(`${where}: has no name.`);
  if (stage.teaches.trim() === '') {
    violations.push(
      `${where}: says nothing about what it teaches. § 5.4 orders the progression by mechanism ` +
        'introduced, so a stage that introduces nothing has no place in it.',
    );
  }
  if (stage.brief.length < 2 || stage.brief.length > 3) {
    violations.push(
      `${where}: the brief is ${String(stage.brief.length)} sentences; § 5.2 asks for 2–3.`,
    );
  }
  for (const [index, sentence] of stage.brief.entries()) {
    if (sentence.trim() === '') {
      violations.push(`${where}: brief sentence ${String(index + 1)} is empty.`);
    }
  }
  for (const [label, text] of playerFacingStrings(stage)) {
    const word = probabilityWordIn(text);
    if (word !== null) {
      violations.push(
        `${where}: ${label} says "${word}". R10 — a confidence interval is never translated into ` +
          'a probability word; say a frequency over runs with its denominator instead.',
      );
    }
  }
  return violations;
}

/** Every authored string a player reads, labelled. Used by the R10 check and by its test. */
export function playerFacingStrings(stage: CampaignStage): readonly (readonly [string, string])[] {
  return [
    ['its name', stage.name],
    ['what it teaches', stage.teaches],
    ...stage.brief.map(
      (sentence, index) => [`brief sentence ${String(index + 1)}`, sentence] as const,
    ),
  ];
}

/** Building, dispatcher, horizon and demand, pinned to the measurement. */
function checkConfiguration(
  where: string,
  stage: CampaignStage,
  published: PublishedScenario,
  context: CampaignContext,
): readonly string[] {
  const violations: string[] = [];
  if (!context.restrictedFloorIdsByBuilding.has(stage.building)) {
    violations.push(`${where}: building "${stage.building}" is not in this build's data/.`);
  }
  if (stage.building !== published.buildingId) {
    violations.push(
      `${where}: runs building "${stage.building}" and its goals were measured on ` +
        `"${published.buildingId}". A pass rate is a property of one configuration.`,
    );
  }
  if (!context.profileIds.has(stage.dispatcher.startingProfileId)) {
    violations.push(
      `${where}: dispatcher profile "${stage.dispatcher.startingProfileId}" is not in this ` +
        "build's data/.",
    );
  }
  if (stage.dispatcher.startingProfileId !== published.dispatcherProfileId) {
    violations.push(
      `${where}: starts on "${stage.dispatcher.startingProfileId}" and its goals were measured ` +
        `against "${published.dispatcherProfileId}", so the bar was set by a different arm.`,
    );
  }
  if (stage.durationS !== published.durationS) {
    violations.push(
      `${where}: runs ${String(stage.durationS)} s and its goals were measured over ` +
        `${String(published.durationS)} s.`,
    );
  }
  if (stage.traffic.arrivalRatePctPop5min !== published.arrivalRatePctPop5min) {
    violations.push(
      `${where}: runs at demand ${describeDemand(stage.traffic.arrivalRatePctPop5min)} and its ` +
        `goals were measured at ${describeDemand(published.arrivalRatePctPop5min)}.`,
    );
  }

  if (stage.dispatcher.editable.mode === 'listed') {
    const ids = stage.dispatcher.editable.ids;
    if (ids.length === 0) {
      violations.push(
        `${where}: lets the player move nothing, so there is no scenario here — only a run.`,
      );
    }
    const declared = new Set(context.dimensionIds);
    const already = new Set<string>();
    for (const id of ids) {
      if (!declared.has(id)) {
        violations.push(
          `${where}: offers dimension "${id}", which the search space does not declare. The ` +
            'editable set is checked against collectSearchSpace(), never against a list written ' +
            'down here.',
        );
      }
      if (already.has(id)) violations.push(`${where}: offers dimension "${id}" twice.`);
      already.add(id);
    }
  }
  return violations;
}

function describeDemand(rate: number | null): string {
  return rate === null ? "the building's own profile" : `${String(rate)} %pop/5 min`;
}

/** Both seed sets, pinned to the measurement, and disjoint over the seeds actually used. */
function checkSeeds(
  where: string,
  stage: CampaignStage,
  published: PublishedScenario,
): readonly string[] {
  const violations: string[] = [];
  const pairs: readonly (readonly [string, PublishedSeedSet, PublishedSeedSet])[] = [
    ['tuning', stage.seeds, published.tuningSeeds],
    ['holdout', stage.holdoutSeeds, published.holdoutSeeds],
  ];
  for (const [name, mine, theirs] of pairs) {
    if (mine.name !== theirs.name || mine.seed !== theirs.seed || mine.replications !== theirs.replications) {
      violations.push(
        `${where}: its ${name} seed set is "${mine.name}"/${mine.seed}/${String(mine.replications)} ` +
          `and the goals were measured on "${theirs.name}"/${theirs.seed}/${String(theirs.replications)}.`,
      );
    }
  }

  if (stage.replications !== stage.seeds.replications) {
    violations.push(
      `${where}: judges a goal over ${String(stage.replications)} runs and declares a tuning set ` +
        `of ${String(stage.seeds.replications)}.`,
    );
  }
  if (stage.replications < MIN_REPLICATION_BUDGET || stage.replications > MAX_REPLICATION_BUDGET) {
    violations.push(
      `${where}: judges a goal over ${String(stage.replications)} runs; CLAUDE.md budgets ` +
        `${String(MIN_REPLICATION_BUDGET)}–${String(MAX_REPLICATION_BUDGET)} per configuration.`,
    );
  }

  /*
   * Disjointness over the **derived** seeds and not the masters, which is `goalRates.test.ts`'s
   * own standard: two different masters could in principle collide on a replication seed, and the
   * seeds the runs actually use are the ones that decide whether a holdout validates anything.
   */
  const tuning = new Set(
    Array.from({ length: stage.seeds.replications }, (_, index) =>
      replicationSeed(stage.seeds.seed, index).toString(),
    ),
  );
  const overlap = Array.from({ length: stage.holdoutSeeds.replications }, (_, index) =>
    replicationSeed(stage.holdoutSeeds.seed, index).toString(),
  ).filter((seed) => tuning.has(seed));
  if (overlap.length > 0) {
    violations.push(
      `${where}: ${String(overlap.length)} of its holdout replication seeds are also tuning ` +
        `seeds (first ${String(overlap[0])}), so the holdout validates nothing.`,
    );
  }
  return violations;
}

/** § D160's clause, both ways: the declared goals and the measured `goals` bucket are equal. */
function checkGoals(
  where: string,
  stage: CampaignStage,
  published: PublishedScenario,
): readonly string[] {
  const violations: string[] = [];
  const shippable = new Map<GoalKind, number | null>(
    published.goals.map((record) => [record.kind, record.threshold]),
  );
  const declared = new Set<GoalKind>();

  for (const goal of stage.goals) {
    if (!GOAL_KINDS.includes(goal.kind)) {
      violations.push(`${where}: declares goal "${goal.kind}", which is not a kind this build knows.`);
      continue;
    }
    if (declared.has(goal.kind)) {
      violations.push(`${where}: declares goal "${goal.kind}" twice.`);
    }
    declared.add(goal.kind);

    if (!shippable.has(goal.kind)) {
      violations.push(
        `${where}: declares goal "${goalLabel(goal)}", which is not in this stage's measured ` +
          '"goals" bucket in data/scenario-goals.json. R12: a goal ships with its across-seed ' +
          'rate published beside it, or it does not ship — and a constant is a fact for the ' +
          'brief, not a goal.',
      );
      continue;
    }
    const threshold = shippable.get(goal.kind) ?? null;
    if (goal.threshold !== threshold) {
      violations.push(
        `${where}: declares "${goal.kind}" at threshold ${String(goal.threshold)} and its rate ` +
          `was measured at ${String(threshold)}. A different threshold is a different measurement.`,
      );
    }
    if (GOAL_TAKES_THRESHOLD[goal.kind] && goal.threshold === null) {
      violations.push(`${where}: declares "${goal.kind}" with no threshold, so it means nothing.`);
    }
  }

  for (const kind of shippable.keys()) {
    if (!declared.has(kind)) {
      violations.push(
        `${where}: the measured table ships "${kind}" as a live goal here and the stage does not ` +
          'declare it. A measured goal left out of a stage looks exactly like a goal nobody ' +
          'measured, which is the confusion W9 exists to remove.',
      );
    }
  }
  return violations;
}

/** § 5.3: one lever per fail state, drawn from the stage's own editable dimensions. */
function checkLevers(
  where: string,
  stage: CampaignStage,
  context: CampaignContext,
): readonly string[] {
  const violations: string[] = [];
  const editable = new Set(editableIdsOf(stage.dispatcher.editable, context.dimensionIds));
  const restricted = context.restrictedFloorIdsByBuilding.get(stage.building) ?? [];

  for (const state of FAIL_STATES) {
    const lever = stage.levers[state];
    const required = leverRequired(state, restricted.length > 0);
    if (lever === null) {
      if (required) {
        violations.push(
          `${where}: fail state "${state}" has no suggested lever. § 5.3 requires one, drawn from ` +
            "this stage's own editable dimensions.",
        );
      }
      continue;
    }
    if (!required) {
      violations.push(
        `${where}: fail state "${state}" carries a lever and "${stage.building}" declares no ` +
          'access-controlled floor, so the state cannot arise here and no dial addresses it.',
      );
      continue;
    }
    if (!editable.has(lever)) {
      violations.push(
        `${where}: fail state "${state}" suggests "${lever}", which this stage does not let the ` +
          'player move. A hint pointing at a locked dial is worse than no hint.',
      );
    }
  }

  for (const key of Object.keys(stage.levers)) {
    if (!(FAIL_STATES as readonly string[]).includes(key)) {
      violations.push(`${where}: declares a lever for "${key}", which is not a fail state.`);
    }
  }
  return violations;
}

/**
 * Whether a fail state can arise on this stage at all.
 *
 * Only `locked-out` is configuration-dependent, and it is **derived** from the building's own
 * access zones rather than trusted from the file: a stage that authored a credential hint on a
 * building with no credentials would be teaching a lesson the run cannot produce.
 */
function leverRequired(state: FailState, buildingHasAccessZones: boolean): boolean {
  return state === 'locked-out' ? buildingHasAccessZones : true;
}

/* -------------------------------------------------------------------------- *
 * Decoding
 * -------------------------------------------------------------------------- */

/**
 * Read `data/campaign.json` and validate it.
 *
 * @throws CampaignError carrying every violation, structural and semantic. Structural problems
 *   short-circuit the semantic pass for the stage they are on, because a stage whose `goals` is
 *   not an array has nothing for the goal check to say.
 */
export function parseCampaign(raw: unknown, context: CampaignContext): Campaign {
  const structural: string[] = [];
  const campaign = decodeCampaign(raw, structural);
  if (campaign === undefined) throw new CampaignError(structural);
  const violations = [...structural, ...validateCampaign(campaign, context)];
  if (violations.length > 0) throw new CampaignError(violations);
  return campaign;
}

type Record_ = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Record_ {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeCampaign(raw: unknown, violations: string[]): Campaign | undefined {
  if (!isRecord(raw)) {
    violations.push('the campaign file is not a JSON object.');
    return undefined;
  }
  const stagesRaw = raw['stages'];
  if (!Array.isArray(stagesRaw)) {
    violations.push('the campaign file has no "stages" array.');
    return undefined;
  }
  const stages: CampaignStage[] = [];
  for (const [index, entry] of stagesRaw.entries()) {
    const stage = decodeStage(entry, `stages[${String(index)}]`, violations);
    if (stage !== undefined) stages.push(stage);
  }
  return {
    generatedBy: str(raw['generatedBy']) ?? '',
    contract: str(raw['contract']) ?? '',
    stages,
  };
}

function decodeStage(raw: unknown, at: string, violations: string[]): CampaignStage | undefined {
  if (!isRecord(raw)) {
    violations.push(`${at}: is not an object.`);
    return undefined;
  }
  const id = str(raw['id']);
  if (id === undefined) {
    violations.push(`${at}: has no "id".`);
    return undefined;
  }
  const where = `stage "${id}"`;

  const traffic = isRecord(raw['traffic']) ? raw['traffic'] : undefined;
  const dispatcher = isRecord(raw['dispatcher']) ? raw['dispatcher'] : undefined;
  const editable = dispatcher === undefined ? undefined : decodeEditable(dispatcher['editable'], where, violations);
  const seeds = decodeSeedSet(raw['seeds'], `${where}: "seeds"`, violations);
  const holdoutSeeds = decodeSeedSet(raw['holdoutSeeds'], `${where}: "holdoutSeeds"`, violations);
  const goals = decodeGoals(raw['goals'], where, violations);
  const levers = decodeLevers(raw['levers'], where, violations);

  if (traffic === undefined) violations.push(`${where}: has no "traffic" object.`);
  if (dispatcher === undefined) violations.push(`${where}: has no "dispatcher" object.`);
  if (editable === undefined || seeds === undefined || holdoutSeeds === undefined) return undefined;
  if (traffic === undefined || dispatcher === undefined) return undefined;

  const brief = Array.isArray(raw['brief']) ? raw['brief'].filter((line): line is string => typeof line === 'string') : [];
  const rate = traffic['arrivalRatePctPop5min'];
  return {
    id,
    name: str(raw['name']) ?? '',
    teaches: str(raw['teaches']) ?? '',
    brief,
    building: str(raw['building']) ?? '',
    traffic: { arrivalRatePctPop5min: typeof rate === 'number' ? rate : null },
    durationS: typeof raw['durationS'] === 'number' ? raw['durationS'] : Number.NaN,
    dispatcher: { startingProfileId: str(dispatcher['startingProfileId']) ?? '', editable },
    seeds,
    holdoutSeeds,
    replications: typeof raw['replications'] === 'number' ? raw['replications'] : Number.NaN,
    goals,
    levers,
  };
}

function decodeEditable(raw: unknown, where: string, violations: string[]): EditableDimensions | undefined {
  if (!isRecord(raw)) {
    violations.push(`${where}: "dispatcher.editable" is not an object.`);
    return undefined;
  }
  const mode = str(raw['mode']);
  if (mode === 'every-declared-dimension') return { mode };
  if (mode !== 'listed') {
    violations.push(
      `${where}: "dispatcher.editable.mode" is ${String(mode)}; it is "listed" or ` +
        '"every-declared-dimension".',
    );
    return undefined;
  }
  const ids = raw['ids'];
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
    violations.push(`${where}: "dispatcher.editable.ids" is not an array of dimension ids.`);
    return undefined;
  }
  return { mode: 'listed', ids: ids as readonly string[] };
}

function decodeSeedSet(raw: unknown, at: string, violations: string[]): PublishedSeedSet | undefined {
  if (!isRecord(raw)) {
    violations.push(`${at}: is not an object.`);
    return undefined;
  }
  const name = str(raw['name']);
  const seed = str(raw['seed']);
  const replications = raw['replications'];
  if (name === undefined || seed === undefined || typeof replications !== 'number') {
    violations.push(`${at}: needs a name, a decimal seed string and a replication count.`);
    return undefined;
  }
  return { name, seed, replications };
}

function decodeGoals(raw: unknown, where: string, violations: string[]): readonly GoalSpec[] {
  if (!Array.isArray(raw)) {
    violations.push(`${where}: has no "goals" array.`);
    return [];
  }
  const goals: GoalSpec[] = [];
  for (const [index, entry] of raw.entries()) {
    if (!isRecord(entry)) {
      violations.push(`${where}: goals[${String(index)}] is not an object.`);
      continue;
    }
    const kind = str(entry['kind']);
    if (kind === undefined) {
      violations.push(`${where}: goals[${String(index)}] has no "kind".`);
      continue;
    }
    const threshold = entry['threshold'];
    goals.push({
      kind: kind as GoalKind,
      threshold: typeof threshold === 'number' ? threshold : null,
    });
  }
  return goals;
}

function decodeLevers(raw: unknown, where: string, violations: string[]): Readonly<Record<FailState, string | null>> {
  const levers: Record<string, string | null> = {};
  if (!isRecord(raw)) {
    violations.push(`${where}: has no "levers" object; § 5.3 asks for one per fail state.`);
    for (const state of FAIL_STATES) levers[state] = null;
    return levers as Record<FailState, string | null>;
  }
  for (const [key, value] of Object.entries(raw)) {
    levers[key] = typeof value === 'string' ? value : null;
  }
  for (const state of FAIL_STATES) {
    if (!(state in levers)) {
      violations.push(`${where}: declares no lever for fail state "${state}".`);
      levers[state] = null;
    }
  }
  return levers as Record<FailState, string | null>;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
