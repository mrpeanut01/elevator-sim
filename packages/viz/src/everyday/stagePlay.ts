/**
 * **A campaign stage, played from the Scenario hub in the fix-it editor** — the words and the
 * decisions, [§ D1129](../../../../DECISIONS.md) clauses 2 to 4 (the swarm's Q3 ruling).
 *
 * ## What was wrong
 *
 * A stage on the hub opened on the Engineer Lab: a research surface, under whichever building the
 * Engineer run last held, with the budget the hub quotes printed nowhere, admitting moves by a list
 * the hub's census did not use, and paying nothing for a clear. A post-wave-AI assessor played
 * stages 1, 3 and 5 there and wrote *"it is honest, and it is a dead end"*.
 *
 * ## What this module decides, and what it borrows
 *
 * A stage is a building, a crowd, goals and a budget, which is a fix case's shape (`docs/38` § 2.1,
 * *one shape, four sources*). So it is played in the fix-it editor's shell, with the stage's own
 * building in the header and its budget on the face, and three things are **borrowed rather than
 * restated**:
 *
 * - **the admission** — `campaign/stagePress.ts#admitStageMove`, the one check the census and the
 *   Lab ask, at the stage's base rung;
 * - **the judge** — `campaign/stagePress.ts#pressStage`, which runs `stageSequence.ts` and so
 *   `campaign/judge.ts#judgeStage` over the tuning seeds and then the holdout seeds, fifty runs
 *   each under common random numbers. The fix-it screen's fifty-morning judge is a different
 *   question (did a repair remove a complaint?) and does not stand in for it, which is what the
 *   ruling's *"the tuning-plus-holdout form"* says;
 * - **the parking row** — `everyday/fixitScreenModel.ts#fixitParkingRow`, the fix-it editor's own
 *   select, so the words a player reads about where idle cars wait are one table on both screens.
 *
 * What is its own: which controls are drawn (a standing order picked by name and where idle cars
 * wait, the two moves the census's named routes and stage 1's hint are made of), the sentences
 * below, and the pay line.
 *
 * ## A clear pays once, flat, and unlocks nothing
 *
 * `docs/38` § 1: *"Nothing locked, ever."* A clear pays `data/chime-ledger.json`'s
 * `scenario-cleared` award through the existing earn route, first time only, and the page says so
 * in both directions. It does not open the next stage, because no stage is closed: a stage is open,
 * or held for the reason its row states. Two of three swarm members wanted a clear to unlock the
 * next stage; § D1129 records their dissent and the owner-reversible clause.
 *
 * ## A wider budget is sold only where the census says it adds a way through
 *
 * [§ D1419](../../../../DECISIONS.md), swarm DS's Q3 ruling (S2 and S3; S1's *every authored rung* is
 * refused). A stage's ladder is authored in `data/campaign.json` and its survivor count is pinned per
 * rung in `data/scenario-survivors.json`. {@link stageRungsOf} sells a rung, from this device's
 * tally, only where the pinned count at it exceeds the count at the rung below, and every other rung
 * is drawn with that measured reason. The rule is read off the census on every draw and never written
 * down, so a regenerated census moves what is sold on the same commit. When this was written it sold
 * the equipment rung on stages 1, 2 and 8 and nothing else. A clear at a bought rung pays exactly
 * what a clear at the base pays, once, and the verdict says which budget it was run at.
 *
 * ## A clear at or under a priced par pays once
 *
 * [§ D1417](../../../../DECISIONS.md): `data/chime-ledger.json`'s `scenario-at-par`, once per stage,
 * where `scenario/par.ts#parMarkOf` draws a mark. A free par draws none and pays nothing.
 *
 * Pure. No DOM, no worker, no fetch: `stagePlayScreen.ts` mounts what this returns, and the honesty
 * sweep drives {@link stagePlayViewOf} without a document.
 */

import type { DispatcherProfile, ResolvedBuilding } from '@elevator-sim/core/browser';
import { valuesFromProfile } from '../controls/editedProfile.js';
import {
  admitStageMove,
  stageUnitsAt,
  type StageAdmission,
  type StageAdmissionContext,
  type StageMove,
} from '../campaign/stagePress.js';
import type { StageReport } from '../campaign/judge.js';
import type { CampaignStage } from '../campaign/types.js';
import { emptyFixitState, parkingPriceUnits } from '../fixit/engine.js';
import type { EditorParkingStrategy } from '../fixit/types.js';
import type { PriceSchedule } from '../pricing/types.js';
import { isPerReplicationGoal } from '../scenario/goals.js';
import { parMarkOf } from '../scenario/par.js';
import type { PublishedSurvivorScenario } from '../scenario/survivors.js';
import { statLineOf } from '../shift/contracts.js';
import { fixitParkingRow, type FixitParkingRow } from './fixitScreenModel.js';
import { stageParLineOf, stageParNoteOf } from './scenarioModel.js';

/** The dimension the parking select writes. The fix-it editor's own control, one id. */
const PARKING_DIMENSION = 'idle.parkingStrategy';

/** The separator between a profile id and a parking value in a parked move's published name. */
const PARKED = '-parked-';

/**
 * The move this page makes for a profile picked by name with idle cars parked at `parking`.
 *
 * The bare profile where `parking` is what that profile already does, so a choice that moves nothing
 * is not dressed as an edit, and otherwise the profile with one dial on it, named
 * `<profile>-parked-<value>`. That name is what the survivor census publishes for a way through the
 * page found (§ D1183), and {@link namedStageMoveOf} reads it back, so the hub, the replay and this
 * page all mean one move by it.
 */
export function parkedMoveOf(profile: DispatcherProfile, parking: string, space: StageAdmissionContext['space']): StageMove {
  const standing = valuesFromProfile(space, profile).get(PARKING_DIMENSION);
  if (standing === parking) return { profile };
  return {
    profile,
    edit: {
      baseProfileId: profile.id,
      profileId: `${profile.id}${PARKED}${parking}`,
      values: { [PARKING_DIMENSION]: parking },
    },
  };
}

/**
 * The move a published way-through name stands for, where the name alone says: a shipped profile by
 * its id, or a parked move by {@link parkedMoveOf}'s name. `undefined` for anything else, which on
 * the shipped table is a drawn dial configuration (`edit-<n>`), whose values are not in its name.
 * `campaign/stagePress.ts#routeRefusalsOf` is handed this as its `moveNamed`.
 */
export function namedStageMoveOf(
  name: string,
  profiles: readonly DispatcherProfile[],
  space: StageAdmissionContext['space'],
): StageMove | undefined {
  const profile = profiles.find((entry) => entry.id === name);
  if (profile !== undefined) return { profile };
  const at = name.lastIndexOf(PARKED);
  if (at <= 0) return undefined;
  const parkedProfile = profiles.find((entry) => entry.id === name.slice(0, at));
  const parking = name.slice(at + PARKED.length);
  if (parkedProfile === undefined || parking === '') return undefined;
  const move = parkedMoveOf(parkedProfile, parking, space);
  return move.edit === undefined ? undefined : move;
}

/**
 * Parking strategies this screen does not offer, and why. `fixed-floor` needs a floor chosen beside
 * it, and this screen draws no floor control; offering it would run whatever floor the declared
 * default names, which is a choice the player did not make.
 */
const NOT_OFFERED_HERE: ReadonlySet<EditorParkingStrategy> = new Set(['fixed-floor']);

export const STAGE_PLAY_COPY = Object.freeze({
  loading: 'Reading the stage…',
  loadFailed: 'This stage could not be read, so nothing here can be played. Reload to try again.',
  notFound: 'That stage is not on the path this build carries. Go back to the path and pick one there.',
  heldHead: 'Held back',
  settingLabel: 'Standing order',
  settingStanding: 'as the building has it',
  overBudget: 'over this budget',
  notForSale: 'not sold here',
  budgetLead: 'Budget',
  spendsNothing: 'As the building stands, nothing is spent.',
  refusedCannotRun: 'These settings cannot run together on this building, so the stage is not run.',
  refusedWithheld: 'This setting moves something no scenario sells, so the stage is not run.',
  runLabel: 'Run the stage',
  runAgainLabel: 'Run it again',
  backLabel: 'Back to the path',
  runningLabel: 'Running the stage…',
  runningWhy: 'The stage is running. The settings are yours to change while it does, and a change makes the verdict it returns stale.',
  loadingWhy: 'The stage is still being read.',
  heldWhy: 'This stage is held back, so there is nothing here to run.',
  refusedWhy: 'This setting is refused at this budget, so there is nothing to run until it fits.',
  noteReady: 'Judged on the stage’s own goals, then again on crowds you did not tune against.',
  noteSolved: 'Cleared. A stage pays once, and a clear unlocks nothing.',
  /*
   * A stage this device has cleared, opened again — [§ D1358](../../../../DECISIONS.md). The run is
   * the same judge on the same crowds, and only the pay differs: a stage pays once.
   */
  /*
   * It read *… and a clear at or under par earns the mark* on every cleared stage, stage 1's free par
   * among them, beside a verdict saying no clear is marked there (the post-AN panel's seat D, D5). The
   * par clause is now {@link stagePracticeLineOf}'s, from the stage's own par (§ D1376).
   */
  practice: 'Cleared on this device. Running it again is practice: it pays nothing new.',
  notePractice: 'Practice: the same judge on the same crowds, and a stage pays once.',
  clearedHead: 'Cleared.',
  metNotHeldHead: 'Every goal met on the stage’s own crowds, and not on the ones held back.',
  missedHead: 'Not cleared.',
  goalMet: 'met',
  goalMissed: 'missed',
  /*
   * **A per-run goal's mark names the bar, not the outcome** (§ D1185). Its bar is relative: the
   * player's setting passes on at least as many runs as the shipped setting did on the same crowds.
   * A bare *met* beside *everyone delivered* read as *everyone was delivered* at 5 of 50 runs, so
   * the mark says the bar was reached, which is what the label beside it defines.
   */
  goalBarReached: 'bar reached',
  goalBarNotReached: 'bar not reached',
  goalUnjudged: 'not judged',
  holdoutNotRun:
    'The held-back crowds were not run: a goal missed on the stage’s own crowds cannot be recovered on others.',
  paysOnce: 'A stage pays once, so this clear pays nothing.',
  unlocksNothing: 'It unlocks nothing: every stage on the path is open, or held for the reason written on it.',
  stale: 'The settings on screen are not the ones this verdict was measured on. Run it again to judge them.',
  failed: 'The run stopped before it finished, so there is no verdict.',
  /*
   * § D1419: the budget rungs. Each sold row says what it buys on the census and that a device
   * purchase is for this stage on this device; each unsold row says its measured reason.
   */
  rungHeading: 'A WIDER BUDGET',
  rungDevice: 'Bought from this device\u2019s chimes, for this stage on this device.',
  rungBuy: 'Buy it',
  rungUnmeasured: 'The census has no count at this rung, so whether it adds a way through is not known.',
  rungAboveUnbought: 'Sold once the rung below it is bought.',
  labLink: 'Open this stage on the Engineer surface',
  labNote: 'The Engineer surface draws every dial the stage’s budget reaches and the full report. A clear there pays nothing.',
});

/** What the player has set. `parking` is `null` for *as the building has it*. */
export interface StagePlayChoice {
  readonly profileId: string;
  readonly parking: EditorParkingStrategy | null;
}

/** One option on the standing-order select. */
export interface StagePlayOption {
  readonly value: string;
  readonly label: string;
  readonly disabled: boolean;
  readonly selected: boolean;
}

/** A shipped profile as the select offers it, priced by the one check on its own. */
export interface StagePlayProfileFacts {
  readonly id: string;
  readonly name: string;
  readonly units: number;
  readonly admitted: boolean;
  readonly withheld: boolean;
}

/** What the current choice costs and whether it may run — the one check, reduced to what is drawn. */
export interface StagePlayAdmissionFacts {
  readonly admitted: boolean;
  readonly units: number;
  /** Nothing moved: the control arm. */
  readonly control: boolean;
  readonly refusal: 'over-budget' | 'withheld' | 'cannot-run' | undefined;
}

/**
 * **One rung above a stage's base, as this page sells it or says why not** — [§ D1419](../../../../DECISIONS.md).
 *
 * `sold` is the census's answer and nothing else: the pinned survivor count at this rung exceeds the
 * count at the rung below. Both counts are carried so the row can say so on its own face.
 */
export interface StageRungFacts {
  readonly stepId: string;
  readonly name: string;
  /** The budget a player standing on this rung holds — `campaign/stagePress.ts#stageUnitsAt`. */
  readonly units: number;
  /** The budget of the rung below, which the counts are compared at. */
  readonly unitsBelow: number;
  /** What this step costs, in chimes, from the stage's own ladder. */
  readonly chimes: number;
  /** The pinned count at this rung, or `undefined` where the census carries none. */
  readonly survivors: number | undefined;
  /** The pinned count at the rung below. */
  readonly survivorsBelow: number | undefined;
  /** The census says this rung adds a way through, so it is sold. */
  readonly sold: boolean;
  /** This device bought it. */
  readonly owned: boolean;
  /** Sold, not owned, and every rung below it is the base or owned: the one a press would buy. */
  readonly next: boolean;
}

/**
 * **Which rungs a stage sells, read off the pinned census** — [§ D1419](../../../../DECISIONS.md).
 *
 * A rung is sold where its pinned survivor count exceeds the count at the rung below it, and on no
 * other ground. Where the census carries no row for the stage, or no count at a rung, nothing is
 * sold, because an unmeasured rung is not one this page can say adds a way through. Owned is this
 * device's record (`deviceChimes.ts#withSpend`), and a rung is bought only above the base or an owned
 * rung, so a purchase never skips a step it did not pay for.
 */
export function stageRungsOf(
  stage: CampaignStage,
  census: PublishedSurvivorScenario | undefined,
  ownedStepIds: ReadonlySet<string>,
): readonly StageRungFacts[] {
  const countAt = (stepId: string | null): number | undefined =>
    census?.steps.find((step) => step.stepId === stepId)?.survivors;
  return stage.budget.steps.map((step, index) => {
    const below = index === 0 ? null : (stage.budget.steps[index - 1]?.id ?? null);
    const survivors = countAt(step.id);
    const survivorsBelow = countAt(below);
    const sold = survivors !== undefined && survivorsBelow !== undefined && survivors > survivorsBelow;
    const owned = ownedStepIds.has(step.id);
    const belowHeld = below === null || ownedStepIds.has(below);
    return {
      stepId: step.id,
      name: step.name,
      units: stageUnitsAt(stage, step.id),
      unitsBelow: stageUnitsAt(stage, below),
      chimes: step.chimes,
      survivors,
      survivorsBelow,
      sold,
      owned,
      next: sold && !owned && belowHeld,
    };
  });
}

/** Everything the view needs about a stage and the player's choice on it — plain data. */
export interface StagePlayFacts {
  readonly stageId: string;
  readonly position: number;
  readonly total: number;
  readonly title: string;
  readonly teaches: string;
  readonly brief: readonly string[];
  readonly buildingName: string;
  readonly statLine: string;
  readonly budgetUnits: number;
  readonly replications: number;
  readonly durationS: number;
  readonly baselineProfileId: string;
  readonly profiles: readonly StagePlayProfileFacts[];
  readonly parking: FixitParkingRow;
  readonly admission: StagePlayAdmissionFacts;
  /** Present when the path holds this stage back: its row's own reason. */
  readonly held: string | undefined;
  /** `data/chime-ledger.json`'s `scenario-cleared` award. */
  readonly award: number;
  readonly choice: StagePlayChoice;
  /**
   * The stage's par, `scenario/ladder.ts`'s `parUnits` for its row: `undefined` where no named way
   * through could be priced — [§ D1358](../../../../DECISIONS.md). Optional so a caller that predates
   * it reads as a stage with no par.
   */
  readonly parUnits?: number | undefined;
  /** This device holds the stage's clear, so a run here is practice (§ D1358). */
  readonly clearedBefore?: boolean | undefined;
  /** Every rung above the base, sold or with its reason (§ D1419). Empty where none is authored. */
  readonly rungs?: readonly StageRungFacts[] | undefined;
  /** The rung this device bought for this stage, or `undefined` on the base (§ D1419). */
  readonly boughtStepId?: string | undefined;
  /** This device's balance, for a rung's shortfall (§ D1419). */
  readonly balanceChimes?: number | undefined;
  /** `data/chime-ledger.json`'s `scenario-at-par` award (§ D1417). */
  readonly parAward?: number | undefined;
}

/** A verdict as the screen draws it. The sentences are the judge's own. */
export interface StagePlayVerdictFacts {
  readonly headline: string;
  readonly goals: readonly {
    readonly label: string;
    readonly met: boolean | null;
    readonly sentence: string;
    /** Judged run by run against the shipped setting's own count, so its bar is relative. */
    readonly perRun: boolean;
  }[];
  readonly holdoutSentence: string | null;
  readonly metOnTuningSeeds: boolean;
  readonly cleared: boolean;
  /** `first` when this clear banked the award, `again` when the stage had paid before. */
  readonly paid: 'first' | 'again' | undefined;
  /** What the pressed settings cost, by the one check — the figure a par is compared with (§ D1358). */
  readonly spentUnits?: number | undefined;
  /** `first` when this clear banked the par award, `again` when it had paid before (§ D1417). */
  readonly parPaid?: 'first' | 'again' | undefined;
  /** The budget the press was made at, where this device bought a rung for it (§ D1419). */
  readonly boughtUnits?: number | undefined;
}

/** Where a press is. */
export type StagePlayPhase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running'; readonly seedSet: 'tuning' | 'holdout'; readonly completed: number; readonly total: number }
  | { readonly kind: 'judged'; readonly verdict: StagePlayVerdictFacts; readonly stale: boolean }
  | { readonly kind: 'failed' };

export interface StagePlayVerdictView {
  readonly head: string;
  readonly headline: string;
  readonly goals: readonly { readonly label: string; readonly mark: string; readonly sentence: string }[];
  readonly holdout: string;
  readonly pay: string | undefined;
  /** On a clear: the par mark, or why the clear earns none (§ D1358). */
  readonly par: string | undefined;
  /** The budget the run was made at, where this device bought a rung for this stage (§ D1419). */
  readonly rung: string | undefined;
  readonly unlock: string | undefined;
  readonly stale: string | undefined;
}

export interface StagePlayView {
  readonly eyebrow: string;
  readonly title: string;
  readonly buildingLine: string;
  readonly teaches: string;
  readonly letter: readonly string[];
  readonly held: string | undefined;
  readonly budgetLine: string;
  readonly refusal: string | undefined;
  readonly settingLabel: string;
  readonly settingOptions: readonly StagePlayOption[];
  readonly parking: FixitParkingRow;
  readonly runNote: string;
  /** On a stage this device has cleared: that a run here is practice (§ D1358). */
  readonly practice: string | undefined;
  readonly status: string | undefined;
  readonly verdict: StagePlayVerdictView | undefined;
  /** The wider budgets, each sold from this device or with its measured reason (§ D1419). */
  readonly rungs: readonly StageRungRowView[];
  readonly labLink: string;
  readonly labNote: string;
}

/** One rung as a row: a sentence, and a press where it can be bought now (§ D1419). */
export interface StageRungRowView {
  readonly stepId: string;
  readonly text: string;
  /** `buy` exactly when a press would buy it; the label is drawn on the button. */
  readonly offer: 'buy' | 'short' | 'owned' | 'not-sold' | 'later';
  readonly buyLabel: string | undefined;
}

/* -------------------------------------------------------------------------- *
 * The move a choice makes
 * -------------------------------------------------------------------------- */

/**
 * The move a choice makes: the picked profile, with the parking strategy as an edit on it.
 *
 * `undefined` when the choice names a profile this build does not ship. An edit that writes the
 * value the profile already holds is dropped, so the admission sees the system that will run.
 */
export function stageMoveOf(
  choice: StagePlayChoice,
  profiles: readonly DispatcherProfile[],
  context: Pick<StageAdmissionContext, 'space'>,
): StageMove | undefined {
  const profile = profiles.find((entry) => entry.id === choice.profileId);
  if (profile === undefined) return undefined;
  if (choice.parking === null) return { profile };
  return parkedMoveOf(profile, choice.parking, context.space);
}

/** The parking values this page's select offers under a profile: the fix-it row's, less {@link NOT_OFFERED_HERE}. */
function offeredParkingOf(
  profile: DispatcherProfile,
  space: StageAdmissionContext['space'],
  schedule: PriceSchedule,
): readonly EditorParkingStrategy[] {
  const standing = String(valuesFromProfile(space, profile).get(PARKING_DIMENSION) ?? '');
  const row = fixitParkingRow(emptyFixitState(), standing, parkingPriceUnits(schedule));
  return row.options
    .map((option) => option.value)
    .filter((value): value is EditorParkingStrategy => value !== null && !NOT_OFFERED_HERE.has(value));
}

/** One move the page can make that the dispatcher list alone cannot: a profile with idle cars parked elsewhere. */
export interface StagePageMove {
  /** {@link parkedMoveOf}'s name for it, which is what the survivor census publishes. */
  readonly name: string;
  readonly move: StageMove;
}

/**
 * **Every choice this page offers that is not a profile picked alone** — the survivor census's
 * `page` stratum, [§ D1183](../../../../DECISIONS.md).
 *
 * The page draws two controls: a standing order by name and where idle cars wait. A name alone is
 * the census's dropdown stratum already, and the stage's own profile with nothing moved is the
 * control, so what is left is every profile under every parking value the select offers beneath it,
 * each as the move {@link stageMoveOf} makes. Read off the page's own row rather than listed, so a
 * value the page stops offering leaves the census on the same commit. Deduplicated by name; a value
 * equal to what the profile already does is not offered, because the row drops it.
 */
export function stagePageMovesOf(
  profiles: readonly DispatcherProfile[],
  space: StageAdmissionContext['space'],
  schedule: PriceSchedule,
): readonly StagePageMove[] {
  const out = new Map<string, StagePageMove>();
  for (const profile of profiles) {
    for (const parking of offeredParkingOf(profile, space, schedule)) {
      const move = parkedMoveOf(profile, parking, space);
      if (move.edit === undefined) continue;
      out.set(move.edit.profileId, { name: move.edit.profileId, move });
    }
  }
  return [...out.values()];
}

function admissionFactsOf(admission: StageAdmission): StagePlayAdmissionFacts {
  const refusal = admission.admitted
    ? undefined
    : admission.candidate === undefined
      ? ('cannot-run' as const)
      : admission.withheld.length > 0
        ? ('withheld' as const)
        : ('over-budget' as const);
  return { admitted: admission.admitted, units: admission.units, control: admission.moved.length === 0, refusal };
}

/** The input {@link stageFactsOf} derives the facts from. Real objects, all of them. */
export interface StageFactsInput {
  readonly stage: CampaignStage;
  readonly position: number;
  readonly total: number;
  readonly building: ResolvedBuilding;
  readonly context: StageAdmissionContext;
  readonly profiles: readonly DispatcherProfile[];
  readonly schedule: PriceSchedule;
  readonly held: string | undefined;
  readonly award: number;
  readonly choice: StagePlayChoice;
  /** {@link StagePlayFacts.parUnits}, passed through. */
  readonly parUnits?: number | undefined;
  /** {@link StagePlayFacts.clearedBefore}, passed through. */
  readonly clearedBefore?: boolean | undefined;
  /** The stage's row of the pinned survivor census, which decides what is sold (§ D1419). */
  readonly census?: PublishedSurvivorScenario | undefined;
  /** The rungs this device bought for this stage (§ D1419). */
  readonly ownedStepIds?: ReadonlySet<string> | undefined;
  /** {@link StagePlayFacts.balanceChimes}, passed through. */
  readonly balanceChimes?: number | undefined;
  /** {@link StagePlayFacts.parAward}, passed through. */
  readonly parAward?: number | undefined;
}

/**
 * The rung a device stands on: the highest rung it owns with every rung below it owned too
 * ([§ D1419](../../../../DECISIONS.md)). A rung bought and later unsold by a regenerated census is
 * still stood on, because what a player paid for is kept, as a fix case's bought rung is.
 */
function standingStepOf(rungs: readonly StageRungFacts[]): string | undefined {
  let standing: string | undefined;
  for (const rung of rungs) {
    if (!rung.owned) break;
    standing = rung.stepId;
  }
  return standing;
}

/**
 * The facts, derived — every price and refusal is {@link admitStageMove}'s at the stage's base
 * rung, so what this screen admits is what the census counted.
 */
export function stageFactsOf(input: StageFactsInput): StagePlayFacts {
  const { stage, context, choice } = input;
  const rungs = stageRungsOf(stage, input.census, input.ownedStepIds ?? new Set());
  const boughtStepId = standingStepOf(rungs);
  const budgetUnits = stageUnitsAt(stage, boughtStepId ?? null);
  const profiles = input.profiles.map((profile) => {
    const admission = admitStageMove(context, { profile }, budgetUnits);
    return {
      id: profile.id,
      name: profile.name ?? profile.id,
      units: admission.units,
      admitted: admission.admitted,
      withheld: admission.withheld.length > 0,
    };
  });
  const move = stageMoveOf(choice, input.profiles, context);
  const admission =
    move === undefined
      ? { admitted: false, units: 0, control: false, refusal: 'cannot-run' as const }
      : admissionFactsOf(admitStageMove(context, move, budgetUnits));
  const picked = input.profiles.find((entry) => entry.id === choice.profileId);
  const standing = picked === undefined ? '' : String(valuesFromProfile(context.space, picked).get(PARKING_DIMENSION) ?? '');
  const row = fixitParkingRow({ ...emptyFixitState(), parkingStrategy: choice.parking }, standing, parkingPriceUnits(input.schedule));
  return {
    stageId: stage.id,
    position: input.position,
    total: input.total,
    title: stage.name,
    teaches: stage.teaches,
    brief: stage.brief,
    buildingName: input.building.name,
    statLine: statLineOf(input.building),
    budgetUnits,
    replications: stage.replications,
    durationS: stage.durationS,
    baselineProfileId: stage.dispatcher.startingProfileId,
    profiles,
    parking: { ...row, options: row.options.filter((option) => option.value === null || !NOT_OFFERED_HERE.has(option.value)) },
    admission,
    held: input.held,
    award: input.award,
    parUnits: input.parUnits,
    clearedBefore: input.clearedBefore,
    rungs,
    boughtStepId,
    balanceChimes: input.balanceChimes,
    parAward: input.parAward,
    choice,
  };
}

/** Whether a clear at `spentUnits` earns the par award on a par of `parUnits` (§ D1417): the mark's own rule. */
export function clearEarnsParOf(parUnits: number | undefined, spentUnits: number | undefined): boolean {
  return parMarkOf(parUnits, spentUnits) !== undefined;
}

/** A judge's report, reduced to what this screen draws. The sentences are passed through unchanged. */
export function verdictFactsOf(
  report: StageReport,
  paid: StagePlayVerdictFacts['paid'],
  spentUnits?: number,
  parPaid?: StagePlayVerdictFacts['parPaid'],
  boughtUnits?: number,
): StagePlayVerdictFacts {
  return {
    headline: report.headline,
    goals: report.goals.map((goal) => ({
      label: goal.label,
      met: goal.met,
      sentence: goal.sentence,
      perRun: isPerReplicationGoal(goal.kind),
    })),
    holdoutSentence: report.holdout?.sentence ?? null,
    metOnTuningSeeds: report.metOnTuningSeeds,
    cleared: report.cleared,
    paid,
    spentUnits,
    parPaid,
    boughtUnits,
  };
}

/* -------------------------------------------------------------------------- *
 * The view
 * -------------------------------------------------------------------------- */

function minutesOf(durationS: number): string {
  const minutes = durationS / 60;
  return Number.isInteger(minutes) ? `${String(minutes)} minutes` : `${String(durationS)} seconds`;
}

function optionLabel(profile: StagePlayProfileFacts, baselineId: string): string {
  if (profile.id === baselineId) return `${profile.name} — ${STAGE_PLAY_COPY.settingStanding}`;
  if (profile.withheld) return `${profile.name} — ${STAGE_PLAY_COPY.notForSale}`;
  const price = `${String(profile.units)} u`;
  return profile.admitted ? `${profile.name} — ${price}` : `${profile.name} — ${price}, ${STAGE_PLAY_COPY.overBudget}`;
}

function budgetLineOf(facts: StagePlayFacts): string {
  const lead = `${STAGE_PLAY_COPY.budgetLead}: ${String(facts.budgetUnits)} units of change.`;
  if (facts.admission.control) return `${lead} ${STAGE_PLAY_COPY.spendsNothing}`;
  return `${lead} These settings cost ${String(facts.admission.units)}.`;
}

function refusalOf(facts: StagePlayFacts): string | undefined {
  switch (facts.admission.refusal) {
    case undefined:
      return undefined;
    case 'withheld':
      return STAGE_PLAY_COPY.refusedWithheld;
    case 'cannot-run':
      return STAGE_PLAY_COPY.refusedCannotRun;
    case 'over-budget':
      return (
        `Over budget: these settings cost ${String(facts.admission.units)} units and this stage opens on ` +
        `${String(facts.budgetUnits)}, so the stage is not run.`
      );
  }
}

function statusOf(phase: StagePlayPhase): string | undefined {
  if (phase.kind === 'failed') return STAGE_PLAY_COPY.failed;
  if (phase.kind !== 'running') return undefined;
  const done = `${String(phase.completed)} of ${String(phase.total)}`;
  return phase.seedSet === 'tuning'
    ? `Running ${done} runs on the stage’s own crowds, both settings on the same passengers.`
    : `Every goal met. Now ${done} runs on crowds you could not have tuned against; these decide the clear.`;
}

function verdictViewOf(facts: StagePlayFacts, verdict: StagePlayVerdictFacts, stale: boolean): StagePlayVerdictView {
  const head = verdict.cleared
    ? STAGE_PLAY_COPY.clearedHead
    : verdict.metOnTuningSeeds
      ? STAGE_PLAY_COPY.metNotHeldHead
      : STAGE_PLAY_COPY.missedHead;
  const clearPay =
    !verdict.cleared || verdict.paid === undefined
      ? undefined
      : verdict.paid === 'first'
        ? `This clear pays ${String(facts.award)} chimes, the first time only.`
        : STAGE_PLAY_COPY.paysOnce;
  /* § D1417: the par award, said once, on the clear that banked it. */
  const parAward = facts.parAward ?? 0;
  const parPay =
    verdict.cleared && verdict.parPaid === 'first' && parAward > 0
      ? `Meeting par pays ${String(parAward)} ${parAward === 1 ? 'chime' : 'chimes'} more, once, and this clear is that once.`
      : undefined;
  const pay = clearPay === undefined ? parPay : parPay === undefined ? clearPay : `${clearPay} ${parPay}`;
  return {
    head,
    headline: verdict.headline,
    goals: verdict.goals.map((goal) => ({
      label: goal.label,
      mark:
        goal.met === null
          ? STAGE_PLAY_COPY.goalUnjudged
          : goal.perRun
            ? goal.met
              ? STAGE_PLAY_COPY.goalBarReached
              : STAGE_PLAY_COPY.goalBarNotReached
            : goal.met
              ? STAGE_PLAY_COPY.goalMet
              : STAGE_PLAY_COPY.goalMissed,
      sentence: goal.sentence,
    })),
    holdout: verdict.holdoutSentence ?? STAGE_PLAY_COPY.holdoutNotRun,
    pay,
    /* § D1358: the par this clear meets, or why it earns no mark, in the hub row's own words. */
    par: verdict.cleared ? stageParLineOf(facts.parUnits, verdict.spentUnits) : undefined,
    rung:
      verdict.boughtUnits === undefined
        ? undefined
        : `Run at the ${String(verdict.boughtUnits)}-unit budget this device bought for this stage. A clear pays the same at any budget.`,
    unlock: verdict.cleared ? STAGE_PLAY_COPY.unlocksNothing : undefined,
    stale: stale ? STAGE_PLAY_COPY.stale : undefined,
  };
}

/**
 * **A cleared stage's practice line, with its par said once and truly** — [§ D1376](../../../../DECISIONS.md).
 *
 * A priced par names the mark and its price; a free par and a stage with no priced par say the
 * hub row's own reason ({@link stageParNoteOf} with nothing spent), so the line before the press, the
 * verdict after it and the row on the path give one reason for one stage.
 */
export function stagePracticeLineOf(parUnits: number | undefined): string {
  const par =
    parUnits !== undefined && parUnits > 0
      ? `A clear at or under par, ${String(parUnits)} ${parUnits === 1 ? 'unit' : 'units'}, earns the mark.`
      : (stageParNoteOf(parUnits, undefined) ?? '');
  return `${STAGE_PLAY_COPY.practice} ${par}`.trim();
}

function waysText(count: number): string {
  return `${String(count)} ${count === 1 ? 'way' : 'ways'} through`;
}

/**
 * **A rung's row** — [§ D1419](../../../../DECISIONS.md). Sold rows say what the census found at the
 * rung against the rung below and that a device purchase is for this stage on this device; unsold
 * rows say the measured reason. The shortfall is a subtraction of two counts of finished turns.
 */
export function stageRungRowOf(rung: StageRungFacts, balanceChimes: number): StageRungRowView {
  const unit = rung.chimes === 1 ? 'chime' : 'chimes';
  const head = `${rung.name}: ${String(rung.units)} units for ${String(rung.chimes)} ${unit}.`;
  if (rung.survivors === undefined || rung.survivorsBelow === undefined) {
    return { stepId: rung.stepId, text: `${head} Not sold. ${STAGE_PLAY_COPY.rungUnmeasured}`, offer: 'not-sold', buyLabel: undefined };
  }
  const found =
    `The census found ${waysText(rung.survivors)} at ${String(rung.units)} units, against ` +
    `${String(rung.survivorsBelow)} at ${String(rung.unitsBelow)}.`;
  if (!rung.sold) {
    return {
      stepId: rung.stepId,
      text: `${head} Not sold. The census found ${waysText(rung.survivors)} at it, the same as at ${String(rung.unitsBelow)} units, so it would buy no new way through.`,
      offer: 'not-sold',
      buyLabel: undefined,
    };
  }
  if (rung.owned) {
    return {
      stepId: rung.stepId,
      text: `${rung.name}: bought on this device, so this stage runs at ${String(rung.units)} units here. ${found}`,
      offer: 'owned',
      buyLabel: undefined,
    };
  }
  if (!rung.next) {
    return { stepId: rung.stepId, text: `${head} ${found} ${STAGE_PLAY_COPY.rungAboveUnbought}`, offer: 'later', buyLabel: undefined };
  }
  const short = rung.chimes - Math.max(0, Math.trunc(balanceChimes));
  if (short > 0) {
    return {
      stepId: rung.stepId,
      text: `${head} ${found} ${STAGE_PLAY_COPY.rungDevice} Short by ${String(short)} ${short === 1 ? 'chime' : 'chimes'}.`,
      offer: 'short',
      buyLabel: undefined,
    };
  }
  return {
    stepId: rung.stepId,
    text: `${head} ${found} ${STAGE_PLAY_COPY.rungDevice}`,
    offer: 'buy',
    buyLabel: `${STAGE_PLAY_COPY.rungBuy} · ${String(rung.chimes)} ${unit}`,
  };
}

/** The screen, computed. */
export function stagePlayViewOf(facts: StagePlayFacts, phase: StagePlayPhase): StagePlayView {
  return {
    eyebrow: `Stage ${String(facts.position)} of ${String(facts.total)} on the path`,
    title: facts.title,
    buildingLine: `${facts.buildingName} · ${facts.statLine}`,
    teaches: facts.teaches,
    letter: facts.brief,
    held: facts.held === undefined ? undefined : `${STAGE_PLAY_COPY.heldHead}: ${facts.held}`,
    budgetLine: budgetLineOf(facts),
    refusal: refusalOf(facts),
    settingLabel: STAGE_PLAY_COPY.settingLabel,
    settingOptions: facts.profiles.map((profile) => ({
      value: profile.id,
      label: optionLabel(profile, facts.baselineProfileId),
      disabled: !profile.admitted,
      selected: profile.id === facts.choice.profileId,
    })),
    parking: facts.parking,
    runNote:
      `A run is ${String(facts.replications)} runs of ${minutesOf(facts.durationS)} of building time on this ` +
      `stage’s own crowds, your settings and the building’s on the same passengers. If every goal is met, ` +
      `${String(facts.replications)} more follow on crowds you could not have tuned against, and those decide the clear.`,
    practice: facts.clearedBefore === true ? stagePracticeLineOf(facts.parUnits) : undefined,
    status: statusOf(phase),
    verdict: phase.kind === 'judged' ? verdictViewOf(facts, phase.verdict, phase.stale) : undefined,
    rungs: (facts.rungs ?? []).map((rung) => stageRungRowOf(rung, facts.balanceChimes ?? 0)),
    labLink: STAGE_PLAY_COPY.labLink,
    labNote: STAGE_PLAY_COPY.labNote,
  };
}
