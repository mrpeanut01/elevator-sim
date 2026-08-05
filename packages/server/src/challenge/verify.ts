/**
 * **Every seed, or none.** A challenge entry is accepted only if replaying the *whole* seed set
 * reproduces the *whole* claim.
 *
 * `DECISIONS.md` § D218 § 5 clause 4, in one sentence: *a score that reproduces on four of five is
 * rejected — partial reproduction is not reproduction.* That is stricter than it looks, and the
 * strictness is the point. A verifier that accepted the seeds that matched and dropped the one that
 * did not would rank a player on a **sample they chose after seeing it**, which is the oldest way
 * there is to make a mean look good. The seed set is fixed precisely so that nobody picks it.
 *
 * ## Everything else is `leaderboard/verify.ts`, deliberately
 *
 * The resolution, the replay, the epsilon, the ordering of the checks and the wording of a
 * rejection are that module's, imported rather than restated. Two verifiers that both decide what a
 * submission means is the drift this design cannot survive, and the only thing a challenge changes
 * is the *arity*: `configFor` is called once per seed against the challenge's own configuration,
 * with the player's dispatcher, and {@link metricsAgree} decides each one.
 *
 * ## Two ways this refuses that the single-run path does not have to
 *
 * **A run that is not quotable refuses the whole set.** § D214 § 6 rejects a single run whose
 * `awtIsValid` is false; here the same rule has to reach the aggregate, because a mean over five
 * runs one of which had a diverging queue is a mean the project would not report and the board
 * would have no way to say so. The refusal names the seed, so the player knows which trace
 * overwhelmed them rather than being told their whole entry was wrong.
 *
 * **The count is compared like a figure.** `legs` is part of what a mean means (R13), so a claim
 * that reproduces four numbers and misses the count is a claim about a different measurement
 * window and is refused as one.
 */

import { runSimulation, type RunSummary } from '@elevator-sim/core';

import type { SubmittedRun } from '../leaderboard/submission.js';
import {
  configFor,
  metricsAgree,
  metricsOf,
  type RejectionCode,
  type VerificationResources,
} from '../leaderboard/verify.js';
import type { IssuedChallenge } from './schedule.js';
import { challengeScoreOf, type ChallengeScore, type ChallengeSubmission, type SeedResult } from './submission.js';

export interface ChallengeVerificationRejected {
  readonly ok: false;
  /** The single-run codes, unchanged: a client already branches on these. */
  readonly code: RejectionCode;
  readonly detail: string;
}

export interface ChallengeVerificationAccepted {
  readonly ok: true;
  /** The **server's** aggregate over the **server's** runs. No claimed number is persisted. */
  readonly score: ChallengeScore;
}

export type ChallengeVerification = ChallengeVerificationAccepted | ChallengeVerificationRejected;

/**
 * The run a challenge seed describes: the challenge's configuration, the player's dispatcher.
 *
 * A `SubmittedRun` rather than a new shape, so `configFor` — the one place that turns ids into a
 * `SimulationConfig` — is reused without a second opinion about what a submission means.
 */
function runFor(challenge: IssuedChallenge, dispatcherProfileId: string, seed: string): SubmittedRun {
  return {
    buildingId: challenge.config.buildingId,
    dispatcherProfileId,
    demandTemplateId: challenge.config.demandTemplateId,
    arrivalRatePctPop5min: challenge.config.arrivalRatePctPop5min,
    durationS: challenge.config.durationS,
    seed,
  };
}

/**
 * Replay the whole seed set and decide.
 *
 * Iterates the **challenge's** seed order, not the submission's, so a client cannot change what is
 * checked by reordering what it sends. `challengeSubmissionIssues` has already established that the
 * two sets are equal; this loop assumes it and would throw rather than skip if they were not, which
 * is why the lookup below is a `Map` miss rather than a silent `undefined`.
 */
export function verifyChallengeSubmission(
  submission: ChallengeSubmission,
  challenge: IssuedChallenge,
  resources: VerificationResources,
): ChallengeVerification {
  const claimedBySeed = new Map(submission.claimed.map((entry) => [entry.seed, entry]));
  const measured: SeedResult[] = [];

  for (const seed of challenge.seeds) {
    const claim = claimedBySeed.get(seed);
    if (claim === undefined) {
      // Unreachable through the API — the shape gate refuses a short set before anything simulates
      // — and stated as a refusal rather than assumed, because "unreachable" is a claim about a
      // caller and this function has more than one.
      return {
        ok: false,
        code: 'metrics-do-not-reproduce',
        detail: `No figures were submitted for seed ${seed}, and every seed of a challenge is replayed.`,
      };
    }

    const config = configFor(runFor(challenge, submission.dispatcherProfileId, seed), resources);
    if (typeof config === 'string') {
      return { ok: false, code: config, detail: detailFor(config, challenge, submission) };
    }

    let summary: RunSummary;
    try {
      summary = runSimulation(config).summary;
    } catch (error) {
      return {
        ok: false,
        code: 'simulation-failed',
        detail:
          `Seed ${seed} did not replay on this server: ` +
          (error instanceof Error ? error.message : 'the replay did not complete'),
      };
    }

    const metrics = metricsOf(summary);
    if (!metrics.awtIsValid) {
      return {
        ok: false,
        code: 'awt-not-quotable',
        detail:
          `On seed ${seed} this dispatcher’s average wait is not quotable — the queue did not clear, ` +
          'or too many riders went unserved — so it cannot be part of a mean. The run is real; the ' +
          'mean is not reportable, and a set is only as reportable as the runs inside it.',
      };
    }
    if (!metricsAgree(claim, metrics) || claim.legs !== summary.waiting.count) {
      const reproduced = measured.length;
      return {
        ok: false,
        code: 'metrics-do-not-reproduce',
        detail:
          `Replaying seed ${seed} on this server did not reproduce the submitted figures ` +
          `(${String(reproduced)} of ${String(challenge.seeds.length)} seeds matched before it). Every seed has ` +
          'to reproduce. That happens when the client is on a different build or the reference ' +
          'data has changed since the run.',
      };
    }

    measured.push({
      seed,
      awtS: metrics.awtS,
      wt95S: metrics.wt95S,
      ttdMeanS: metrics.ttdMeanS,
      pctOverLongWait: metrics.pctOverLongWait,
      legs: summary.waiting.count,
    });
  }

  return { ok: true, score: challengeScoreOf(measured) };
}

/** The wording for an id this server does not ship. A rejection is not an accusation. */
function detailFor(
  code: RejectionCode,
  challenge: IssuedChallenge,
  submission: ChallengeSubmission,
): string {
  if (code === 'unknown-dispatcher') {
    return `This server does not ship a dispatcher "${submission.dispatcherProfileId}".`;
  }
  return (
    `This server can no longer resolve the challenge "${challenge.id}" against its own data ` +
    `(${code}). Nothing can be posted to it until that is fixed.`
  );
}
