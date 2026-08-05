/**
 * Assembling a server from a configuration directory, an environment and a database path.
 *
 * Everything that reads the world happens here — `data/` is loaded, the secret is demanded, the
 * mailer is chosen — so that `http/api.ts` stays a function of its arguments and the tests can pass
 * whatever they like.
 *
 * ## The two refusals
 *
 * **No secret, no server.** `requireSecret` throws and this does not catch it. § D214 § 5: a
 * placeholder default is how a development secret reaches production.
 *
 * **No outbox in production.** The dev mailer writes confirmation links to a file in the clear, so a
 * production server configured with it would be publishing account-takeover links to disk. That
 * combination is refused here rather than trusted to be noticed — the mailer module's own docstring
 * promises this refusal exists, and this is it.
 *
 * **No server ships a challenge it cannot run.** § D218's rotation names buildings, templates and
 * durations, and a challenge naming an id this server does not ship would fail at the moment a
 * player submitted to it — the one moment with no words for it. {@link assertChallengesAreRunnable}
 * resolves every rotation entry against the `data/` that was just loaded, at boot, where the
 * failure is a configuration mistake with an obvious fix.
 */

import { TRAFFIC_DEFAULTS, loadConfig, type LoadedConfig } from '@elevator-sim/core';

import { requireSecret } from './accounts/credentials.js';
import {
  CHALLENGE_ROTATION,
  challengeDefinitionIssues,
  type ChallengeConfig,
} from './challenge/schedule.js';
import type { ChallengeDataFacts } from './challenge/submission.js';
import { createApi, type Api, type ApiDeps } from './http/api.js';
import { OutboxMailer, type Mailer } from './mail/mailer.js';
import { digestOf, type ResolvedDataFacts, type SubmittedRun } from './leaderboard/submission.js';
import type { VerificationResources } from './leaderboard/verify.js';
import { Store } from './store/store.js';

export interface BootstrapOptions {
  /** Where `data/` lives. */
  readonly dataDir: string;
  /** SQLite path, or `':memory:'`. */
  readonly databasePath: string;
  /** `process.env`, or whatever a test wants it to be. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** The public origin confirmation links point at, e.g. `https://elevator.example`. */
  readonly publicOrigin: string;
  /** Injected so a test is not at the mercy of the clock, and a server is. */
  readonly now?: () => number;
  /** Overridden by tests. Defaults to the outbox driver, which production refuses. */
  readonly mailer?: Mailer;
}

export interface Server {
  readonly api: Api;
  readonly store: Store;
  readonly mailer: Mailer;
  readonly config: LoadedConfig;
  close(): void;
}

/** Thrown when the environment asks for a combination that is not safe to run. */
export class UnsafeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeConfigurationError';
  }
}

export async function bootstrap(options: BootstrapOptions): Promise<Server> {
  const secret = requireSecret(options.env);
  const config = await loadConfig(options.dataDir);
  const now = options.now ?? ((): number => Date.now());

  const mailer = options.mailer ?? new OutboxMailer(options.env['ELEVATOR_SIM_OUTBOX'] ?? '.outbox.jsonl');
  if (options.env['NODE_ENV'] === 'production' && mailer instanceof OutboxMailer) {
    throw new UnsafeConfigurationError(
      'The development mailer writes confirmation links to a file in the clear. Configure a real ' +
        'mailer before running in production, or unset NODE_ENV=production.',
    );
  }

  assertChallengesAreRunnable(config);

  const store = new Store({ path: options.databasePath, now });
  const resources: VerificationResources = {
    buildingsById: config.buildingsById,
    dispatcherProfilesById: config.dispatcherProfilesById,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    dispatcherProfiles: config.dispatcherProfiles,
  };

  const deps: ApiDeps = {
    store,
    mailer,
    resources,
    factsFor: factsResolver(config),
    challengeFactsFor: challengeFactsResolver(config),
    secret,
    now,
    confirmUrl: (token) => `${options.publicOrigin.replace(/\/$/u, '')}/api/confirm?token=${encodeURIComponent(token)}`,
  };

  return {
    api: createApi(deps),
    store,
    mailer,
    config,
    close: () => {
      store.close();
    },
  };
}

/**
 * Digest the server's own `data/` for a run — the board identity of § D214 § 4.
 *
 * The digests are over the **resolved records as loaded**, not over the file bytes: a whitespace
 * change to a JSON file must not fork a board, and a population change must. Computed per call
 * rather than cached, because `loadConfig` is done once and the objects do not change under it;
 * caching would add a second source of truth for no measurable gain.
 *
 * Returns `undefined` when any id is unknown, which the API turns into a 404 rather than hashing
 * `undefined` three times and producing a perfectly stable digest of nothing.
 */
export function factsResolver(config: LoadedConfig): (run: SubmittedRun) => ResolvedDataFacts | undefined {
  return (run) => {
    const building = config.buildingsById.get(run.buildingId);
    const dispatcher = config.dispatcherProfilesById.get(run.dispatcherProfileId);
    const template = config.trafficProfiles.demandTemplates.find((entry) => entry.id === run.demandTemplateId);
    if (building === undefined || dispatcher === undefined || template === undefined) return undefined;
    return Object.freeze({
      buildingDigest: digestOf(building),
      dispatcherDigest: digestOf(dispatcher),
      templateDigest: digestOf(template),
      // The engine's draw ordering, not the JSON's schema version. A submission does not choose it
      // — the server runs its own default — but `v1` and `v2` produce different traces from the
      // same seed, so two scores measured under different orderings are not comparable however
      // identical the rest of the configuration is. § D214 § 4's "the engine's own model version".
      trafficModel: TRAFFIC_DEFAULTS.trafficModel,
    });
  };
}

/**
 * Digest the server's own `data/` for a **challenge** — the board identity of § D218 § 2.
 *
 * Three differences from {@link factsResolver}, all forced by the fact that a challenge leaves the
 * dispatcher free. There is no per-profile digest, because there is no single profile; there is a
 * digest of the **whole profile library**, so an edit to any profile forks the whole board at once
 * rather than invalidating one row; and `elevatorSpecs` is digested, because `SimulationConfig`
 * takes it alongside the building and a spec change moves a result without moving the building
 * document. `challenge/submission.ts`'s {@link ChallengeDataFacts} carries the argument in full.
 */
export function challengeFactsResolver(
  config: LoadedConfig,
): (challengeConfig: ChallengeConfig) => ChallengeDataFacts | undefined {
  return (challengeConfig) => {
    const building = config.buildingsById.get(challengeConfig.buildingId);
    const template = config.trafficProfiles.demandTemplates.find(
      (entry) => entry.id === challengeConfig.demandTemplateId,
    );
    if (building === undefined || template === undefined) return undefined;
    return Object.freeze({
      buildingDigest: digestOf(building),
      templateDigest: digestOf(template),
      dispatcherLibraryDigest: digestOf(config.dispatcherProfiles),
      elevatorSpecsDigest: digestOf(config.elevatorSpecs),
      trafficModel: TRAFFIC_DEFAULTS.trafficModel,
    });
  };
}

/**
 * Refuse to boot on a rotation this server cannot run.
 *
 * Two classes of problem, and the second is the one a reviewer would miss: a definition can be
 * perfectly well-formed — a legal duration, five distinct decimal seeds — and still name a building
 * or a demand template that this `data/` directory does not contain. `challengeDefinitionIssues`
 * catches the first class without loading anything; only the loaded configuration can catch the
 * second. Both are boot failures for the same reason the missing secret is: the alternative is a
 * runtime failure at the moment a player commits five simulations' worth of work to a submission.
 */
export function assertChallengesAreRunnable(config: LoadedConfig): void {
  const issues: string[] = [];
  for (const definition of CHALLENGE_ROTATION) {
    issues.push(...challengeDefinitionIssues(definition));
    if (!config.buildingsById.has(definition.config.buildingId)) {
      issues.push(`${definition.slug}: this server does not ship a building "${definition.config.buildingId}"`);
    }
    const template = config.trafficProfiles.demandTemplates.find(
      (entry) => entry.id === definition.config.demandTemplateId,
    );
    if (template === undefined) {
      issues.push(
        `${definition.slug}: this server does not ship a demand template "${definition.config.demandTemplateId}"`,
      );
    }
  }
  if (CHALLENGE_ROTATION.length === 0) issues.push('the challenge rotation is empty');
  if (issues.length > 0) {
    throw new UnsafeConfigurationError(
      `This server ships a challenge rotation it cannot run:\n  ${issues.join('\n  ')}\n` +
        'A challenge is issued to players as data; one that does not resolve would fail at the ' +
        'moment somebody posted to it.',
    );
  }
}
