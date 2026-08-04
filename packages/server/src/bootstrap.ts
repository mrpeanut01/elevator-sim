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
 */

import { TRAFFIC_DEFAULTS, loadConfig, type LoadedConfig } from '@elevator-sim/core';

import { requireSecret } from './accounts/credentials.js';
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
