/**
 * What running a stage **is** — the batch request, and the one replication replayed for the
 * diagnosis — in one place, so a test cannot exercise a second version of it.
 *
 * ## Why this module exists at all
 *
 * The first draft had `dev/campaignPanel.ts` assemble the `BatchRequest` and `campaign.test.ts`
 * assemble its own copy. Both were correct, and that is precisely the danger: the suite would have
 * gone on passing if the panel had drifted — a different seed, a dropped demand override, the arms
 * the wrong way round — because the suite was measuring a **reimplementation of the call site**
 * rather than the call site. That is [§ D159](../../../../DECISIONS.md)'s second false-negative
 * variant, *"a fixture routing the test to the wrong code path"*, arriving one level up: not a
 * fixture, but a second construction of the request.
 *
 * So the two functions below are the only statement anywhere of what a stage run is, the panel
 * calls them, and the suite calls them.
 *
 * ## The demonstration replication is the batch's own replication 0
 *
 * Same seed derivation (`replicationSeed(stage.seeds.seed, 0)`), same horizon, same demand
 * override, same `onTimeout: 'report'`, **and now the same reporting window**. Invariant 5 makes it
 * the identical run, which is what entitles the report to put a floor id from it beside a count
 * taken from the fifty — and a window chosen for the batch and not for the replay would have broken
 * exactly that entitlement.
 *
 * ## The reporting window is read from the shift path's rule, not decided here — GitHub issue #255
 *
 * Both producers below used to set no `reportWindow`, so `core` fell back to the demand template's
 * own measurement band. On `garden-apartments` — stage 1, the first stage a player ever plays —
 * that band is five minutes of a fifteen-minute run on a building whose whole day is a dozen
 * arrivals, and it is empty often enough to refuse the run's headline figures on runs that coped
 * perfectly well. Measured at the stage-1 configuration (`garden-apartments`, `collective`, 900 s):
 *
 * | population | suppressed under the template's band | under `full-run` |
 * |---|---|---|
 * | the stage's own batch, `replicationSeed(20260730, i)` for i < 50 | **1 of 50** | **0 of 50** |
 * | its holdout batch, `replicationSeed(20260731, i)` for i < 50 | **2 of 50** | **0 of 50** |
 * | 50 consecutive integer seeds from 20260730 — the issue's own command line | **2 of 50** | **0 of 50** |
 *
 * Every one of them is `empty-window`, the second of the five `awtIsValid` grounds, on a run that
 * delivered everybody it generated. The refusal is correct on its ground; the **window** is the
 * wrong instrument, which is the same finding `shift/reportWindow.ts` closed for the Day report.
 *
 * **What that cost, and it is more than a withheld headline.** A replication whose summary refuses
 * its mean carries `null` for `pctOverLongWait` and `unservedFraction`, so `scenario/goals.ts`
 * scores it `unmeasured` — and one `unmeasured` in fifty makes the whole across-seed rate
 * `unjudgeable`, which R12 turns into `not-shippable`. Stage 1's published table withheld
 * `deliver-everyone` (49 of 50, **1 unmeasured**) and `long-waits-under` (49 of 50, **1
 * unmeasured**) for that reason and no other. A five-minute band that happened to be empty took two
 * goals off a stage.
 *
 * **The rule is imported rather than re-derived.** `shift/reportWindow.ts#shiftReportWindowFor` is
 * the project's one answer to *which window is honest on this building*, and it is not a threshold
 * somebody picked here: it reads `MATRIX_CELLS`, where every measured operating point declares the
 * window it was reported over, and returns `'full-run'` only where **every** cell on the building
 * declares it. A second copy of that rule in `campaign/` would be a second answer to a question this
 * repository has already answered with a run, and the first thing that would happen is that the two
 * would disagree. Of the ten shipped stages it moves exactly one — stage 1 — because
 * `garden-apartments` is the only stage building whose matrix cells are unanimous; `midtown-office`
 * has three cells and one dissenter, and `chancery-house`, `crown-hotel` and `st-jude-hospital` have
 * no cells at all and correctly keep the template's band.
 *
 * `scenario/measure.ts` takes the window from the same function, and it has to: the bar a count goal
 * is judged against is the shipped setting's own published count, so a table measured over one
 * window and a stage judged over another would make `judge.ts` refuse every count goal on the
 * building the fix moves.
 *
 * ## Two seed sets, and which one clears a stage
 *
 * {@link batchRequestForStage} builds the batch over either of the stage's two declared seed sets.
 * The default is the **tuning** set, because that is the batch the player runs and iterates against;
 * `campaign/judge.ts` requires a second batch over the **holdout** set before it will clear a stage,
 * and that function's docstring carries the argument. Both requests come out of one builder here so
 * that the two batches differ in their seed and in nothing else — a holdout run at a different
 * horizon or a different demand would be a different question rather than a disjoint sample of the
 * same one.
 */

import { replicationSeed } from '@elevator-sim/experiments/browser';
import type {
  DispatcherProfile,
  DispatcherProfiles,
  ElevatorSpecs,
  ResolvedBuilding,
  SimulationConfig,
  TrafficProfiles,
} from '@elevator-sim/core/browser';

import type { BatchRequest } from '../batch/types.js';
import type { EditedVector } from '../controls/editedProfile.js';
import { shiftReportWindowFor } from '../shift/reportWindow.js';
import type { PublishedSeedSet } from '../scenario/published.js';
import type { CampaignStage } from './types.js';

/** The arm ids a stage runs. The second may name the same profile as the first — that is the control. */
export const BASELINE_ARM_ID = 'shipped';
export const CANDIDATE_ARM_ID = 'yours';

/**
 * Which of a stage's two declared seed sets a batch is over.
 *
 * Named rather than passed as a `PublishedSeedSet`, so a caller cannot hand this an invented set.
 * The two sets are the stage's own, `parse.ts` has already checked that their derived replication
 * seeds do not overlap, and the whole point of the split is that the judged sample is one the
 * player could not have tuned against.
 */
export type StageSeedSet = 'tuning' | 'holdout';

/** The set itself. One accessor, so *tuning* and *holdout* mean one thing across this package. */
export function stageSeedSetOf(stage: CampaignStage, which: StageSeedSet): PublishedSeedSet {
  return which === 'tuning' ? stage.seeds : stage.holdoutSeeds;
}

/**
 * The batch a stage is run on: two arms over one of the stage's own seed sets.
 *
 * Everything the passenger trace is a function of comes off the **stage**, and only the dispatcher
 * differs between the arms — which is `BatchRequest`'s own shape and the whole of CRN.
 */
export function batchRequestForStage(
  stage: CampaignStage,
  candidateProfileId: string,
  /**
   * The player's **edited** weight vector, or absent to run `candidateProfileId` as shipped.
   *
   * `docs/10` § 11 **W6**. It rides on the candidate arm only: the baseline is the stage's own
   * shipped setting and stays that, because the count goals' bar is *that setting's published
   * count on these seeds* and `judge.ts` refuses to judge at all when the baseline arm does not
   * reproduce it. An edit on the baseline would move the bar and the run that is supposed to check
   * it in the same step.
   */
  edit?: EditedVector | undefined,
  /**
   * Which seed set to run over. `'tuning'` — the stage's own `seeds` — is the default, so every
   * caller written before the split is byte-identical to what it asked for before.
   *
   * `'holdout'` is the batch `judge.ts` clears a stage on. It is the same two arms, the same
   * horizon and the same demand: only the master seed moves, which is what makes the second sample
   * a *holdout* rather than a second question.
   */
  seedSet: StageSeedSet = 'tuning',
): BatchRequest {
  const seeds = stageSeedSetOf(stage, seedSet);
  const reportWindow = shiftReportWindowFor(stage.building);
  return {
    buildingId: stage.building,
    seed: seeds.seed,
    durationS: stage.durationS,
    replications: stage.replications,
    arms: [
      { armId: BASELINE_ARM_ID, dispatcherProfileId: stage.dispatcher.startingProfileId },
      {
        armId: CANDIDATE_ARM_ID,
        dispatcherProfileId: candidateProfileId,
        ...(edit === undefined ? {} : { edit }),
      },
    ],
    arrivalRatePctPop5min: stage.traffic.arrivalRatePctPop5min,
    /*
     * Omitted rather than passed as `undefined` on the buildings the rule does not move, because
     * `'peak-5min'` and *absent* are different windows on the same run: the first makes `core`
     * search the arrivals for their busiest five minutes, the second leaves the demand template's
     * declared band alone, and every campaign batch ever run has been read over the second.
     */
    ...(reportWindow === undefined ? {} : { reportWindow }),
  };
}

export interface DemonstrationInput {
  readonly stage: CampaignStage;
  readonly building: ResolvedBuilding;
  readonly dispatcherProfile: DispatcherProfile;
  readonly trafficProfiles: TrafficProfiles;
  readonly elevatorSpecs: ElevatorSpecs;
  /**
   * The whole of `data/dispatcher-profiles.json`, so a stage whose profile opts into a weight-set
   * selector replays with one rather than being refused by name — `SimulationConfig`'s field of
   * the same name, § D153. A demonstration that ran a *different* dispatcher from the batch it
   * illustrates would be the worst version of this seam being open.
   */
  readonly dispatcherProfiles: DispatcherProfiles;
  /** Which replication of the batch to replay. `0` is the one the report names. */
  readonly replication?: number;
}

/**
 * The seed of replication `i` of one of this stage's batches. `experiments`' derivation, by import.
 *
 * The seed set defaults to `'tuning'`, so this is what it always was for a caller that names one
 * argument fewer. Over the holdout set it is what makes the disjointness of the two samples
 * *derivable* rather than asserted: the same derivation, two master seeds, and the intersection of
 * the two lists is the thing a test can take.
 */
export function stageReplicationSeed(
  stage: CampaignStage,
  replication: number,
  seedSet: StageSeedSet = 'tuning',
): bigint {
  return replicationSeed(stageSeedSetOf(stage, seedSet).seed, replication);
}

/**
 * The simulation config for one replication of a stage, replayed so its floors can be named.
 *
 * `onTimeout: 'report'` for `runBatch`'s stated reason — three of the five shipped buildings
 * routinely end a 900 s run with people still in the system, and under `throw` there is no
 * recording to diagnose. Nothing statistical moves: the run's own `awtIsValid` still carries the
 * suppression and nothing here overrides it.
 *
 * `reportWindow` from the same rule {@link batchRequestForStage} reads, and it has to be the same
 * one: this replay is the batch's own replication, and the fail-state report puts a floor id from it
 * beside counts taken from the fifty. Two windows would make those two sentences about two
 * measurements — the shape § D111 found one layer down, where a viewer printed a mean the run it
 * came from called suppressed.
 */
export function demonstrationConfigFor(input: DemonstrationInput): SimulationConfig {
  const replication = input.replication ?? 0;
  const reportWindow = shiftReportWindowFor(input.stage.building);
  return {
    building: input.building,
    dispatcherProfile: input.dispatcherProfile,
    trafficProfiles: input.trafficProfiles,
    elevatorSpecs: input.elevatorSpecs,
    dispatcherProfiles: input.dispatcherProfiles,
    seed: stageReplicationSeed(input.stage, replication),
    durationS: input.stage.durationS,
    onTimeout: 'report',
    replication,
    ...(input.stage.traffic.arrivalRatePctPop5min === null
      ? {}
      : { demand: { arrivalRatePctPop5min: input.stage.traffic.arrivalRatePctPop5min } }),
    ...(reportWindow === undefined ? {} : { reportWindow }),
  };
}
