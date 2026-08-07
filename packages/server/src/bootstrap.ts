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
 * **No outbox in production.** The dev mailer writes sign-in links to a file in the clear, so a
 * production server configured with it would be publishing account-takeover links to disk. Since
 * § D241 that is literal rather than nearly so: the mailed link *is* the credential, and a directory
 * full of them is a directory full of working keys. That combination is refused here rather than
 * trusted to be noticed — the mailer module's own docstring promises this refusal exists, and this
 * is it.
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
import { acsMailerFrom } from './mail/acsMailer.js';
import { OutboxMailer, type Mailer } from './mail/mailer.js';
import { digestOf, type ResolvedDataFacts, type SubmittedRun } from './leaderboard/submission.js';
import type { VerificationResources } from './leaderboard/verify.js';
import type { Sql } from './store/sql.js';
import { Store } from './store/store.js';

export interface BootstrapOptions {
  /** Where `data/` lives. */
  readonly dataDir: string;
  /**
   * The database, already connected.
   *
   * Injected rather than built here, for the reason the mailer is: this function assembles a
   * server out of things it is handed, and a bootstrap that constructed its own connection could
   * only ever be tested against the database it chose. `main.ts` builds the production `PgSql`
   * from the environment and is the named non-test caller; tests hand it a `PgliteSql`, which is
   * PostgreSQL in-process rather than a stand-in for one.
   */
  readonly sql: Sql;
  /** `process.env`, or whatever a test wants it to be. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /**
   * The public origin sign-in links point at, e.g. `https://elevator.example`.
   *
   * **The viewer's origin, which since § D257 need not be this server's.** A sign-in link resolves
   * to a page, and the page can be on a CDN while this process is not; `main.ts`'s
   * `viewerOriginFrom` is what reads it and the only caller that supplies it.
   */
  readonly publicOrigin: string;
  /** Injected so a test is not at the mercy of the clock, and a server is. */
  readonly now?: () => number;
  /**
   * Overridden by tests. Otherwise the environment chooses: Azure Communication Services when it
   * is configured, and the outbox driver — which production refuses — when it is not.
   */
  readonly mailer?: Mailer;
}

export interface Server {
  readonly api: Api;
  readonly store: Store;
  readonly mailer: Mailer;
  readonly config: LoadedConfig;
  close(): Promise<void>;
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

  // Three sources, most explicit first: what a test passed, what the environment configures, and
  // the development driver. The middle one is new — until it existed, `AcsMailer`'s absence meant
  // the refusal below could not be satisfied by *any* environment, so a production boot was not
  // merely refused, it was impossible.
  const mailer = options.mailer ?? acsMailerFrom(options.env) ?? new OutboxMailer(options.env['ELEVATOR_SIM_OUTBOX'] ?? '.outbox.jsonl');
  if (options.env['NODE_ENV'] === 'production' && mailer instanceof OutboxMailer) {
    throw new UnsafeConfigurationError(
      'The development mailer writes sign-in links to a file in the clear, and since § D241 each ' +
        'one signs somebody in. Configure a real ' +
        'mailer before running in production, or unset NODE_ENV=production. Set ' +
        'ELEVATOR_SIM_ACS_ENDPOINT (managed identity) or ELEVATOR_SIM_ACS_CONNECTION_STRING, ' +
        'together with ELEVATOR_SIM_MAIL_FROM.',
    );
  }

  assertChallengesAreRunnable(config);

  const store = await Store.open({ sql: options.sql, now });
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
    signInUrl: signInUrlFor(options.publicOrigin),
  };

  return {
    api: createApi(deps),
    store,
    mailer,
    config,
    close: async () => {
      await store.close();
    },
  };
}

/** The fragment key the viewer reads a sign-in token out of. Named once; the client mirrors it. */
export const SIGN_IN_FRAGMENT_KEY = 'sign-in';

/**
 * Where a sign-in link points: **the viewer, with the token in the URL fragment**.
 *
 * Both halves are security decisions and neither is a formatting preference.
 *
 * **The viewer and not the API**, because a link in a mailbox is fetched by machines. Mail clients
 * prefetch, scanners and link-rewriting appliances resolve every URL in a message before a human
 * sees it, and a link that pointed at a redeeming endpoint would be spent by whichever robot got
 * there first — a login that fails for exactly the people whose employer is careful about links.
 * This URL resolves to a page. `http/api.ts`'s redeem route is a `POST`, which is the second and
 * independent reason the same thing cannot happen.
 *
 * **The fragment and not the query string**, because a fragment is never transmitted. It does not
 * appear in the request line, so it cannot reach an access log, a proxy, an ingress trace or a
 * `Referer` header sent to anything the page later loads. A token in `?token=` is a token in a log
 * file on the way to being a token in a support ticket.
 *
 * The viewer reads {@link SIGN_IN_FRAGMENT_KEY} out of `location.hash`, posts it to
 * `/api/auth/redeem`, and clears the hash.
 *
 * **`publicOrigin` is the viewer's, not this server's, and § D257 is where that stops being the
 * same sentence.** Once the bundle is served from a static host, a link built from this process's
 * own origin opens a page that has no fragment reader on it — the API answers, the browser is shown
 * JSON, and the account is never signed in. Nothing in this function changes; what changed is that
 * the value it is given is now a deploy parameter with a wrong answer that used to be unreachable.
 */
export function signInUrlFor(publicOrigin: string): (token: string) => string {
  const origin = publicOrigin.replace(/\/$/u, '');
  return (token) => `${origin}/#${SIGN_IN_FRAGMENT_KEY}=${encodeURIComponent(token)}`;
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
