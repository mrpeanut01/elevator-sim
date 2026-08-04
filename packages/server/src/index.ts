/**
 * The public surface of the account and leaderboard server.
 *
 * This package is the only one in the repository allowed a socket, a database and a wall clock.
 * `core` is forbidden all three (invariant 3), and nothing here leaks back into it: the dependency
 * runs one way, and the verification path drives the same seeded kernel every study does.
 */

export {
  ACCEPTED_DURATIONS_S,
  canonicalJson,
  configHashOf,
  digestOf,
  submissionIssues,
  type ClaimedMetrics,
  type ResolvedDataFacts,
  type Submission,
  type SubmittedRun,
} from './leaderboard/submission.js';

export {
  METRIC_EPSILON,
  configFor,
  metricsAgree,
  metricsOf,
  verifySubmission,
  type RejectionCode,
  type Verification,
  type VerificationAccepted,
  type VerificationRejected,
  type VerificationResources,
} from './leaderboard/verify.js';
