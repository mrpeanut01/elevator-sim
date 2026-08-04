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
  UnsafeConfigurationError,
  bootstrap,
  factsResolver,
  type BootstrapOptions,
  type Server,
} from './bootstrap.js';

export {
  CONFIRMATION_TTL_MS,
  MissingSecretError,
  SCRYPT_PARAMS,
  constantTimeEquals,
  hashPassword,
  newSessionToken,
  passwordIssues,
  passwordMatches,
  requireSecret,
  signConfirmation,
  verifyConfirmation,
  type PasswordHash,
} from './accounts/credentials.js';

export { OutboxMailer, confirmationMessage, type Mailer, type Message } from './mail/mailer.js';

export {
  BOARD_METRICS,
  SESSION_TTL_MS,
  Store,
  normaliseEmail,
  type BoardMetric,
  type EntryRow,
  type SessionRow,
  type StoreOptions,
  type UserRow,
} from './store/store.js';

export { createApi, type Api, type ApiDeps, type ApiRequest, type ApiResponse } from './http/api.js';
export { MAX_BODY_BYTES, bearerOf, serve, type ServeOptions } from './http/serve.js';
export { main } from './main.js';

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
