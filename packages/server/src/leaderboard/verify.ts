/**
 * **The server re-runs the run.** A submitted score is accepted only if replaying its seed
 * reproduces it.
 *
 * `DECISIONS.md` § D214 § 3. This is the whole anti-cheat design and there is no other part to it:
 * no heuristics, no plausibility bounds, no rate-limiting-as-security. Invariant 5 already
 * guarantees what is needed — *every persisted run record carries its seed, so any run replays
 * exactly* — so a forged score is rejected because it does not replay, and an honest one is accepted
 * because it does. The client is never trusted with a number.
 *
 * ## Why exact, and not "close enough"
 *
 * A tolerance is a budget for a cheat. The engine is deterministic from its seed and the same
 * `@elevator-sim/core` runs on both sides, so an honest client reproduces the server's value to the
 * last bit; anything else is a different run. {@link METRIC_EPSILON} exists only for the one thing
 * that genuinely is not bit-exact — a float that has crossed JSON — and is tight enough that no
 * meaningful score difference fits inside it.
 *
 * ## What a rejection is not
 *
 * A rejection is **not** an accusation. A player on an older build, or one who ran before a `data/`
 * change, submits in good faith and does not reproduce. That is why the reason is carried out of
 * here as a machine-readable code: the caller can tell "this does not match" from "this board no
 * longer exists", and say the right thing to a player who did nothing wrong.
 */

import { runSimulation, type RunSummary, type SimulationConfig } from '@elevator-sim/core';

import type { ClaimedMetrics, Submission, SubmittedRun } from './submission.js';

/**
 * The largest difference a metric may show and still be called the same number.
 *
 * `1e-9` seconds. A JSON round trip of an IEEE-754 double is exact for every value this produces, so
 * in practice the difference is zero; the epsilon is here because *"in practice"* is not a thing to
 * assert on, not because a real gap is expected. It is nine orders of magnitude below the smallest
 * wait difference that could change a ranking.
 */
export const METRIC_EPSILON = 1e-9;

/** Why a submission was refused, as something the caller can branch on. */
export type RejectionCode =
  | 'unknown-building'
  | 'unknown-dispatcher'
  | 'unknown-template'
  | 'metrics-do-not-reproduce'
  | 'awt-not-quotable'
  | 'simulation-failed';

export interface VerificationRejected {
  readonly ok: false;
  readonly code: RejectionCode;
  readonly detail: string;
}

export interface VerificationAccepted {
  readonly ok: true;
  /** The **server's** metrics, which are what get stored. The claim is never persisted. */
  readonly measured: ClaimedMetrics;
}

export type Verification = VerificationAccepted | VerificationRejected;

/** What the verifier needs from the server's own loaded `data/`. */
export interface VerificationResources {
  readonly buildingsById: ReadonlyMap<string, SimulationConfig['building']>;
  readonly dispatcherProfilesById: ReadonlyMap<string, SimulationConfig['dispatcherProfile']>;
  readonly trafficProfiles: SimulationConfig['trafficProfiles'];
  readonly elevatorSpecs: SimulationConfig['elevatorSpecs'];
  readonly dispatcherProfiles: SimulationConfig['dispatcherProfiles'];
}

/**
 * Build the configuration the run claims to be, from the **server's** data.
 *
 * Ids in, resolved objects out. A submission never carries a building or a profile — that is what
 * would let a player invent a two-floor tower with sixteen cars and post a superb wait.
 */
export function configFor(
  run: SubmittedRun,
  resources: VerificationResources,
): SimulationConfig | RejectionCode {
  const building = resources.buildingsById.get(run.buildingId);
  if (building === undefined) return 'unknown-building';
  const dispatcherProfile = resources.dispatcherProfilesById.get(run.dispatcherProfileId);
  if (dispatcherProfile === undefined) return 'unknown-dispatcher';
  const template = resources.trafficProfiles.demandTemplates.find(
    (entry) => entry.id === run.demandTemplateId,
  );
  if (template === undefined) return 'unknown-template';

  return {
    building,
    dispatcherProfile,
    trafficProfiles: resources.trafficProfiles,
    ...(resources.elevatorSpecs === undefined ? {} : { elevatorSpecs: resources.elevatorSpecs }),
    ...(resources.dispatcherProfiles === undefined
      ? {}
      : { dispatcherProfiles: resources.dispatcherProfiles }),
    // A string of digits, validated by `submissionIssues` before it reaches here. `BigInt` rather
    // than `Number` because a 20-digit seed does not survive a double, and the seed is an identity:
    // rounding it would replay a different run and reject an honest player.
    seed: BigInt(run.seed),
    demandTemplate: run.demandTemplateId as SimulationConfig['demandTemplate'],
    durationS: run.durationS,
    // `report`, not `throw`. A run that times out with people still in the system is a legitimate
    // outcome to submit — it simply will not be ranked, because `awtIsValid` is false and the gate
    // below refuses it. Throwing would turn "your dispatcher was overwhelmed" into a server error.
    onTimeout: 'report',
    ...(run.arrivalRatePctPop5min === null
      ? {}
      : { demand: { arrivalRatePctPop5min: run.arrivalRatePctPop5min } }),
  } as SimulationConfig;
}

/** The four ranked metrics plus the validity flag, read off a summary the server produced. */
export function metricsOf(summary: RunSummary): ClaimedMetrics {
  return Object.freeze({
    awtS: summary.waiting.meanS,
    wt95S: summary.waiting.p95S,
    ttdMeanS: summary.timeToDestination.meanS,
    pctOverLongWait: summary.waiting.pctOverLongWait,
    awtIsValid: summary.awtIsValid,
  });
}

/** Whether two metric sets are the same run's, within {@link METRIC_EPSILON}. */
export function metricsAgree(left: ClaimedMetrics, right: ClaimedMetrics): boolean {
  const close = (a: number, b: number): boolean =>
    (Number.isNaN(a) && Number.isNaN(b)) || Math.abs(a - b) <= METRIC_EPSILON;
  return (
    close(left.awtS, right.awtS) &&
    close(left.wt95S, right.wt95S) &&
    close(left.ttdMeanS, right.ttdMeanS) &&
    close(left.pctOverLongWait, right.pctOverLongWait) &&
    left.awtIsValid === right.awtIsValid
  );
}

/**
 * Replay the submission and decide.
 *
 * Order matters and is deliberate: resolve, simulate, **check quotability, then compare**. A
 * saturated run is refused on its own merits (§ D214 § 6) rather than being compared first, because
 * a player whose queue diverged should be told that — not told their arithmetic disagrees with the
 * server's, which it does not.
 */
export function verifySubmission(
  submission: Submission,
  resources: VerificationResources,
): Verification {
  const config = configFor(submission.run, resources);
  if (typeof config === 'string') {
    return {
      ok: false,
      code: config,
      detail:
        config === 'unknown-building'
          ? `This server does not ship a building "${submission.run.buildingId}".`
          : config === 'unknown-dispatcher'
            ? `This server does not ship a dispatcher "${submission.run.dispatcherProfileId}".`
            : `This server does not ship a demand template "${submission.run.demandTemplateId}".`,
    };
  }

  let summary: RunSummary;
  try {
    summary = runSimulation(config).summary;
  } catch (error) {
    // A configuration the server cannot run is not a cheat and must not read as one.
    return {
      ok: false,
      code: 'simulation-failed',
      detail: error instanceof Error ? error.message : 'the replay did not complete',
    };
  }

  const measured = metricsOf(summary);

  // The suppression the rest of the project applies, at the one surface where a player is motivated
  // to ignore it. Checked against the SERVER's run, so claiming `awtIsValid: true` cannot buy it.
  if (!measured.awtIsValid) {
    return {
      ok: false,
      code: 'awt-not-quotable',
      detail:
        'This run’s average wait is not quotable — the queue did not clear, or too many riders ' +
        'went unserved — so it cannot be ranked. The run is real; the mean is not reportable.',
    };
  }

  if (!metricsAgree(submission.claimed, measured)) {
    return {
      ok: false,
      code: 'metrics-do-not-reproduce',
      detail:
        'Replaying this seed on this server did not reproduce the submitted figures. That happens ' +
        'when the client is on a different build or the reference data has changed since the run.',
    };
  }

  return { ok: true, measured };
}
