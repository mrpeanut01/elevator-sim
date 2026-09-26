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
import { statLineOf } from '../shift/contracts.js';
import { fixitParkingRow, type FixitParkingRow } from './fixitScreenModel.js';

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
  readonly status: string | undefined;
  readonly verdict: StagePlayVerdictView | undefined;
  readonly labLink: string;
  readonly labNote: string;
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
}

/**
 * The facts, derived — every price and refusal is {@link admitStageMove}'s at the stage's base
 * rung, so what this screen admits is what the census counted.
 */
export function stageFactsOf(input: StageFactsInput): StagePlayFacts {
  const { stage, context, choice } = input;
  const budgetUnits = stageUnitsAt(stage, null);
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
    choice,
  };
}

/** A judge's report, reduced to what this screen draws. The sentences are passed through unchanged. */
export function verdictFactsOf(report: StageReport, paid: StagePlayVerdictFacts['paid']): StagePlayVerdictFacts {
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
  const pay =
    !verdict.cleared || verdict.paid === undefined
      ? undefined
      : verdict.paid === 'first'
        ? `This clear pays ${String(facts.award)} chimes, the first time only.`
        : STAGE_PLAY_COPY.paysOnce;
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
    unlock: verdict.cleared ? STAGE_PLAY_COPY.unlocksNothing : undefined,
    stale: stale ? STAGE_PLAY_COPY.stale : undefined,
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
    status: statusOf(phase),
    verdict: phase.kind === 'judged' ? verdictViewOf(facts, phase.verdict, phase.stale) : undefined,
    labLink: STAGE_PLAY_COPY.labLink,
    labNote: STAGE_PLAY_COPY.labNote,
  };
}
