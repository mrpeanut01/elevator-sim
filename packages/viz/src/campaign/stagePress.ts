/**
 * **One admission check for a campaign stage, shared by the census and by play** —
 * [§ D1129](../../../../DECISIONS.md), the swarm's Q3 ruling, clause 1.
 *
 * ## What was wrong
 *
 * Two functions answered *"may this move be made on this stage?"* and they answered differently.
 * The survivor census (`scenario/survivorSpace.ts`) admitted a move by its **price**, through
 * `scenario/budget.ts#admitPurchase`, because [§ D525](../../../../DECISIONS.md) clause 2 retired
 * per-scenario control lists. The Engineer Lab (`dev/campaignPanel.ts`) admitted by the stage's
 * legacy **editable list**, through `campaign/dimensions.ts#admitProfile`. So the Scenario hub named
 * `zoned-uppeak` as the way through stage 1 and `predictive-balanced` as the way through stage 5,
 * and the Lab refused to run either. A post-wave-AI assessor found both refusals by pressing them.
 *
 * And the test that certified stage 5 winnable, `stageFiveClears.test.ts`, played every profile
 * through `stageSequence.ts#runStageToVerdict`, which asks no admission question at all. It
 * certified a clear the surface refused.
 *
 * ## The rule this module holds
 *
 * **One function, {@link admitStageMove}, and every caller that decides whether a stage move is a
 * move uses it**: the Lab's pre-flight, the Everyday stage player, the census's dropdown stratum and
 * its per-rung affordability, the survivor replay, and every test that certifies a clear. It is the
 * census's rule (price, and only price) because that is § D525's, and the editable list stops
 * deciding anything about admission.
 *
 * **One press, {@link pressStage}, is admission followed by the shipped sequence.** A clear is
 * certified only by calling it, so a suite that plays a stage cannot skip the question a player's
 * press is asked. `runStageToVerdict` is still the sequence; this is the gate in front of it.
 *
 * ## What a move is, and what it costs
 *
 * A move is the shipped profile the player picked, with any dials they moved on top of it. Its cost
 * is the distinct priced changes covering every dimension on which the resolved dispatcher differs
 * from the stage's own starting one, on **this stage's building**: a dial the building gives nothing
 * to act on is not a move (§ D549, `authoring/dispatcherSpec.ts#dimensionIdsLiveOn`), which is the
 * rule the Lab already applied and the census's dial stratum already applied. A move that changes
 * nothing is the control arm and is admitted at no cost; a move touching a dimension
 * `data/price-schedule.json` withholds is refused at any budget (§ D535).
 *
 * The budget is an argument rather than a field of the stage, because a player may have bought a
 * rung. The census passes each rung's units in turn; a surface passes the rung its player stands on.
 */

import type {
  DispatcherProfile,
  ElevatorSpecs,
  ResolvedBuilding,
} from '@elevator-sim/core/browser';
import type { SearchSpace } from '@elevator-sim/experiments/browser';

import { dimensionIdsLiveOn } from '../authoring/dispatcherSpec.js';
import { resolveEditedProfile, type EditedVector } from '../controls/editedProfile.js';
import { glossaryFor, type GlossaryTerm } from '../mode/glossary.js';
import type { PriceSchedule } from '../pricing/types.js';
import { admitPurchase, rungsOf, type PurchaseAdmission } from '../scenario/budget.js';
import type { PublishedScenario } from '../scenario/published.js';

import { movedDimensions, type MovedDimension } from './dimensions.js';
import { runStageToVerdict, type StageBatchRunner, type StageSequenceOutcome } from './stageSequence.js';
import type { CampaignStage } from './types.js';

/** What every admission on one stage is asked against. Nothing here depends on the move. */
export interface StageAdmissionContext {
  /** The declared search space — `collectSearchSpace()`. */
  readonly space: SearchSpace;
  /** `data/price-schedule.json`, the one price list. */
  readonly schedule: PriceSchedule;
  /** The stage's own starting profile, resolved. Arm 0 of every batch. */
  readonly baseline: DispatcherProfile;
  /**
   * The stage's own building. It decides which dimensions are live there (§ D549), and an edit is
   * admissible only on a building (GitHub issue #475). Optional only for the census's dropdown
   * stratum on a caller that holds no building, which prices a shipped profile and resolves no edit.
   */
  readonly building?: ResolvedBuilding | undefined;
  /** The sensor defaults the building's cars resolve against. */
  readonly elevatorSpecs?: ElevatorSpecs | undefined;
}

/** A move on a stage: a shipped profile picked by name, and any dials moved on top of it. */
export interface StageMove {
  readonly profile: DispatcherProfile;
  /** `baseProfileId` must be {@link StageMove.profile}'s id. Absent runs the profile as shipped. */
  readonly edit?: EditedVector | undefined;
}

/** What the one check says about one move at one budget. */
export interface StageAdmission {
  readonly admitted: boolean;
  /** The dispatcher the candidate arm would run, or `undefined` where an edit could not resolve. */
  readonly candidate: DispatcherProfile | undefined;
  /** Every live dimension the move changes from the stage's own starting profile. */
  readonly moved: readonly MovedDimension[];
  /** What the move costs, distinct priced changes summed once. Zero for the control. */
  readonly units: number;
  /** The budget it was asked against. */
  readonly budgetUnits: number;
  /** The price-schedule change ids the move buys. */
  readonly changeIds: readonly string[];
  /** Moved dimensions the schedule prices nothing for — reported, never charged (`admitPurchase`). */
  readonly unpriced: readonly string[];
  /** Moved dimensions the schedule withholds from every scenario — any one refuses the move (§ D535). */
  readonly withheld: readonly string[];
  /** Why it is refused. `undefined` exactly when {@link StageAdmission.admitted}. */
  readonly reason: string | undefined;
  /** The reader's sentence — a fact about the move, never a judgement of it. */
  readonly sentence: string;
  /** The words that sentence used, explained — issue #22's rule, kept from `admitProfile`. */
  readonly glossary: readonly GlossaryTerm[];
}

/** The live dimension ids on the context's building, or every declared id where none is held. */
function liveIdsOf(context: StageAdmissionContext): ReadonlySet<string> {
  return new Set(
    context.building === undefined
      ? context.space.ids
      : dimensionIdsLiveOn(context.space.ids, context.building),
  );
}

function sentenceOf(sentence: string): Pick<StageAdmission, 'sentence' | 'glossary'> {
  return { sentence, glossary: glossaryFor([sentence]) };
}

/**
 * **The sentence names settings by their players' names and never by an id** — the honesty corpus's
 * `internal-notation` property holds every surface driven from `campaign/` to that, and this sentence
 * reaches three: the Lab's *your setting* row, the Scenario hub's held reason, and the stage page's
 * refusal. The ids stay on the admission's fields ({@link StageAdmission.moved},
 * {@link StageAdmission.changeIds}, {@link StageAdmission.reason}) for a caller that wants them.
 */
function settingsCount(count: number): string {
  return `${String(count)} setting${count === 1 ? '' : 's'}`;
}

/** A price-schedule change's own name, or its id where the schedule does not carry it. */
function changeNamesOf(schedule: PriceSchedule, changeIds: readonly string[]): string {
  return changeIds
    .map((id) => schedule.changes.find((change) => change.id === id)?.name ?? id)
    .join(', ');
}

/**
 * **May this move be made on this stage, at this budget?** Answered without running anything.
 *
 * The single admission rule for a stage — see the module docstring for every caller. Pure.
 */
export function admitStageMove(
  context: StageAdmissionContext,
  move: StageMove,
  budgetUnits: number,
): StageAdmission {
  let candidate: DispatcherProfile = move.profile;
  if (move.edit !== undefined && Object.keys(move.edit.values).length > 0) {
    if (move.edit.baseProfileId !== move.profile.id) {
      throw new Error(
        `stage admission: the edit starts from "${move.edit.baseProfileId}" and the move names ` +
          `"${move.profile.id}". One move is one profile with dials on it.`,
      );
    }
    if (context.building === undefined) {
      throw new Error('stage admission: an edited move is admissible only on a building (GitHub issue #475).');
    }
    const resolved = resolveEditedProfile(context.space, move.profile, move.edit, {
      building: context.building,
      elevatorSpecs: context.elevatorSpecs,
    });
    if (!resolved.ok) {
      return {
        admitted: false,
        candidate: undefined,
        moved: [],
        units: 0,
        budgetUnits,
        changeIds: [],
        unpriced: [],
        withheld: [],
        reason: resolved.reason,
        ...sentenceOf('These settings cannot run together on this building, so the stage is not run.'),
      };
    }
    candidate = resolved.profile;
  }
  /* What the sentence calls the candidate: the picked profile's own name, marked where it was edited. */
  const candidateName =
    move.edit !== undefined && Object.keys(move.edit.values).length > 0
      ? `${move.profile.name}, as you set it`
      : move.profile.name;
  const baselineName = context.baseline.name;

  const live = liveIdsOf(context);
  const moved = movedDimensions(context.space, context.baseline, candidate).filter((dimension) =>
    live.has(dimension.id),
  );
  if (moved.length === 0) {
    return {
      admitted: true,
      candidate,
      moved,
      units: 0,
      budgetUnits,
      changeIds: [],
      unpriced: [],
      withheld: [],
      reason: undefined,
      ...sentenceOf(
        `"${candidateName}" runs the same system as "${baselineName}" on every setting live on this ` +
          'building, so the two arms are identical by construction and no row can separate them. It ' +
          'costs nothing, and it is the control this stage is meant to survive.',
      ),
    };
  }

  const purchase: PurchaseAdmission = admitPurchase(
    context.schedule,
    budgetUnits,
    moved.map((dimension) => dimension.id),
  );
  const head = `"${candidateName}" changes ${settingsCount(moved.length)} of "${baselineName}"`;
  if (!purchase.admitted) {
    return {
      admitted: false,
      candidate,
      moved,
      units: purchase.units,
      budgetUnits,
      changeIds: purchase.changeIds,
      unpriced: purchase.unpriced,
      withheld: purchase.withheld,
      reason: purchase.reason,
      ...sentenceOf(
        purchase.withheld.length > 0
          ? `${head}, and one of them is sold in no scenario, so no budget buys it and the stage is not run.`
          : `${head} and would buy ${changeNamesOf(context.schedule, purchase.changeIds)}: ` +
              `${String(purchase.units)} units against the ${String(budgetUnits)} this budget holds, so the stage is not run.`,
      ),
    };
  }
  const bought =
    purchase.changeIds.length === 0 ? 'nothing the price list charges for' : changeNamesOf(context.schedule, purchase.changeIds);
  return {
    admitted: true,
    candidate,
    moved,
    units: purchase.units,
    budgetUnits,
    changeIds: purchase.changeIds,
    unpriced: purchase.unpriced,
    withheld: purchase.withheld,
    reason: undefined,
    ...sentenceOf(
      `${head} and buys ${bought}: ${String(purchase.units)} of the ${String(budgetUnits)} units ` +
        'this budget holds.',
    ),
  };
}

/**
 * The units a player standing on `stepId` holds — the base rung for `null` or an id the stage's
 * ladder does not carry. `scenario/budget.ts#rungsOf` is the one derivation of a rung.
 */
export function stageUnitsAt(stage: CampaignStage, stepId: string | null | undefined): number {
  const rungs = rungsOf(stage.budget);
  const rung = rungs.find((candidate) => candidate.stepId === (stepId ?? null)) ?? rungs[0];
  if (rung === undefined) throw new Error(`stage "${stage.id}" has no budget rung at all.`);
  return rung.units;
}

/** What a press on a stage produced: a refusal before anything ran, or the judged sequence. */
export type StagePress =
  | { readonly kind: 'refused'; readonly admission: StageAdmission }
  | { readonly kind: 'judged'; readonly admission: StageAdmission; readonly outcome: StageSequenceOutcome };

export interface StagePressInput {
  readonly stage: CampaignStage;
  readonly published: PublishedScenario;
  readonly context: StageAdmissionContext;
  readonly move: StageMove;
  /** The budget the press is made at — {@link stageUnitsAt}. */
  readonly budgetUnits: number;
  readonly run: StageBatchRunner;
}

/**
 * **The press**: {@link admitStageMove}, and only if it admits, the shipped two-batch sequence.
 *
 * A refused move runs nothing. An admitted one runs exactly what `runStageToVerdict` runs for the
 * profile and edit the move names, so the verdict is the product's verdict and a suite that
 * certifies a clear through this function certifies the press a player makes.
 */
export async function pressStage(input: StagePressInput): Promise<StagePress> {
  const admission = admitStageMove(input.context, input.move, input.budgetUnits);
  if (!admission.admitted) return { kind: 'refused', admission };
  const edit =
    input.move.edit !== undefined && Object.keys(input.move.edit.values).length > 0 ? input.move.edit : undefined;
  const outcome = await runStageToVerdict({
    stage: input.stage,
    published: input.published,
    candidateProfileId: input.move.profile.id,
    edit,
    run: input.run,
  });
  return { kind: 'judged', admission, outcome };
}

/* -------------------------------------------------------------------------- *
 * The census's named routes, asked the same question
 * -------------------------------------------------------------------------- */

/** What {@link routeRefusalsOf} needs to build every stage's admission context. */
export interface StageRouteResources {
  readonly space: SearchSpace;
  readonly schedule: PriceSchedule;
  readonly profiles: readonly DispatcherProfile[];
  readonly buildings: readonly ResolvedBuilding[];
  readonly elevatorSpecs: ElevatorSpecs | undefined;
  /**
   * **The move a published name stands for**, where the name alone says — § D1183. The survivor
   * census publishes the stage page's own choices under `everyday/stagePlay.ts#parkedMoveOf`'s
   * names, and that module reads them back (`namedStageMoveOf`); passed in, because a dimension id
   * is a literal this directory does not write. Absent reads a shipped profile by its id and nothing
   * else.
   */
  readonly moveNamed?: ((name: string) => StageMove | undefined) | undefined;
}

/** Answers why a named route is refused on a stage's base rung, or `undefined` when it is not. */
export type RouteRefusal = (stageId: string, routeName: string) => string | undefined;

/**
 * **Is each way through the census names one a player's press is admitted to?** —
 * [§ D1129](../../../../DECISIONS.md) clause 3.
 *
 * The census counts only what {@link admitStageMove} admits, so on a table regenerated since the
 * check was shared this answers `undefined` for every named route. It exists for the table that was
 * **not** regenerated: `data/scenario-survivors.json` is a pinned measurement, and a price, a
 * profile or a stage that moves after it was taken can leave it naming a route the check now
 * refuses. The Scenario hub then holds that stage with the refusal as its reason
 * (`scenario/ladder.ts#scenarioLadderOf`) rather than offering a way through nobody can press,
 * which is the defect a post-wave-AI assessor found on stages 1 and 5.
 *
 * A parked move — the stage page's two controls together — is read back from its name by the
 * caller's {@link StageRouteResources.moveNamed} and asked the same question (§ D1183). A name that
 * resolves to nothing is a drawn dial
 * configuration (`edit-<n>`) and is answered `undefined`: its values are not in the table, and the
 * census pressed it through this same check when it was drawn. Asked at the **base rung**, because
 * that is the rung the hub's count is taken at.
 */
export function routeRefusalsOf(
  stages: readonly CampaignStage[],
  resources: StageRouteResources,
): RouteRefusal {
  const admit = routeAdmissionOf(stages, resources);
  return (stageId, routeName) => {
    const answer = admit(stageId, routeName);
    if (answer === undefined) return undefined;
    if (typeof answer === 'string') return answer;
    return answer.admitted ? undefined : answer.sentence;
  };
}

/** What a named route costs on a stage's base rung, or `undefined` where the check does not admit it. */
export type RouteUnits = (stageId: string, routeName: string) => number | undefined;

/**
 * **What each way through the census names costs at the budget the stage opens on** — the par's
 * input, [§ D1234](../../../../DECISIONS.md). The same check {@link routeRefusalsOf} asks, read for
 * its price: `undefined` where the route is refused, where the name is a drawn dial configuration
 * whose values the table does not carry, or where the stage cannot be built here.
 */
export function routeUnitsOf(stages: readonly CampaignStage[], resources: StageRouteResources): RouteUnits {
  const admit = routeAdmissionOf(stages, resources);
  return (stageId, routeName) => {
    const answer = admit(stageId, routeName);
    if (answer === undefined || typeof answer === 'string' || !answer.admitted) return undefined;
    return answer.units;
  };
}

/**
 * The one check, asked of a named route at a stage's base rung: the admission, a sentence where the
 * stage's own starting setting is missing, or `undefined` where nothing can be asked.
 */
function routeAdmissionOf(
  stages: readonly CampaignStage[],
  resources: StageRouteResources,
): (stageId: string, routeName: string) => StageAdmission | string | undefined {
  const stagesById = new Map(stages.map((stage) => [stage.id, stage]));
  const profilesById = new Map(resources.profiles.map((profile) => [profile.id, profile]));
  return (stageId, routeName) => {
    const stage = stagesById.get(stageId);
    const profile = profilesById.get(routeName);
    const move = profile !== undefined ? { profile } : resources.moveNamed?.(routeName);
    if (stage === undefined || move === undefined) return undefined;
    const baseline = profilesById.get(stage.dispatcher.startingProfileId);
    if (baseline === undefined) return 'the stage’s own starting setting is not in this build’s data.';
    const building = resources.buildings.find((entry) => entry.id === stage.building);
    /* An edited move is admissible only on a building (GitHub issue #475); without one, nothing is asked. */
    if (move.edit !== undefined && building === undefined) return undefined;
    return admitStageMove(
      {
        space: resources.space,
        schedule: resources.schedule,
        baseline,
        building,
        elevatorSpecs: resources.elevatorSpecs,
      },
      move,
      stageUnitsAt(stage, null),
    );
  };
}
