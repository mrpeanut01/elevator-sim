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
 * override, same `onTimeout: 'report'`. Invariant 5 makes it the identical run, which is what
 * entitles the report to put a floor id from it beside a count taken from the fifty.
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
import type { CampaignStage } from './types.js';

/** The arm ids a stage runs. The second may name the same profile as the first — that is the control. */
export const BASELINE_ARM_ID = 'shipped';
export const CANDIDATE_ARM_ID = 'yours';

/**
 * The batch a stage is judged on: two arms over the stage's own tuning seeds.
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
): BatchRequest {
  return {
    buildingId: stage.building,
    seed: stage.seeds.seed,
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

/** The seed of replication `i` of this stage's batch. `experiments`' derivation, by import. */
export function stageReplicationSeed(stage: CampaignStage, replication: number): bigint {
  return replicationSeed(stage.seeds.seed, replication);
}

/**
 * The simulation config for one replication of a stage, replayed so its floors can be named.
 *
 * `onTimeout: 'report'` for `runBatch`'s stated reason — three of the five shipped buildings
 * routinely end a 900 s run with people still in the system, and under `throw` there is no
 * recording to diagnose. Nothing statistical moves: the run's own `awtIsValid` still carries the
 * suppression and nothing here overrides it.
 */
export function demonstrationConfigFor(input: DemonstrationInput): SimulationConfig {
  const replication = input.replication ?? 0;
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
  };
}
