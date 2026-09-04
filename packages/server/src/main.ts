/**
 * `node dist/main.js` — the executable, and the named non-test caller of `serve.ts` and
 * `bootstrap.ts`.
 *
 * That sentence is the point of the file. This repository's most-repeated defect is a behaviour
 * that is configurable, unit-tested and called from nothing shipped — eleven times in code — and a
 * server whose only caller is its own test would be the twelfth.
 *
 * Everything it reads is an environment variable, and every one of them is listed below with what
 * happens when it is absent. `ELEVATOR_SIM_SECRET` has no default and never will (§ D214 § 5).
 */

import { fileURLToPath } from 'node:url';

import { bootstrap } from './bootstrap.js';
import { serve } from './http/serve.js';
import {
  isPreviewOriginOf,
  loadStaticBundle,
  previewOriginsFor,
  requireOrigin,
  type PreviewOrigins,
  type StaticBundle,
} from './http/static.js';
import { PgSql } from './store/sql.js';

/**
 * The `null` origin: *"no page may call this API cross-origin"*.
 *
 * A real CORS token rather than a placeholder — it is what a browser sends for an opaque origin,
 * and no page the viewer is ever served from matches it. It is the shipped default because an
 * operator who has not thought about CORS should get the answer that cannot be wrong, and because
 * the container serves the page and the API from one origin, where there is no cross-origin request
 * to permit at all (§ D243).
 */
export const NO_CROSS_ORIGIN = 'null';

/**
 * The PostgreSQL connection string, from the environment.
 *
 * **No default**, for `ELEVATOR_SIM_SECRET`'s reason rather than a weaker version of it: a default
 * pointing at a local database is how a server that was meant to be talking to the production one
 * comes up healthy, empty, and wrong. A missing connection string must read as a configuration
 * mistake with an obvious fix, which is what it is.
 */
function requireDatabaseUrl(env: Readonly<Record<string, string | undefined>>): string {
  const url = env['ELEVATOR_SIM_DB'];
  if (url === undefined || url.trim().length === 0) {
    throw new Error(
      'ELEVATOR_SIM_DB is not set. It is the PostgreSQL connection string, e.g. ' +
        'postgres://user:password@host:5432/elevator_sim?sslmode=require. There is deliberately ' +
        'no default: one pointing at localhost is how an empty database gets mistaken for a live one.',
    );
  }
  return url;
}

/**
 * Load the built viewer, or explain why there isn't one.
 *
 * The two cases are deliberately not the same. **`ELEVATOR_SIM_WEB` set** is an operator saying
 * *"serve the viewer from here"*, so a directory that is missing or is not a build is a failure and
 * the process stops — a container that came up serving JSON and no pages would otherwise read as a
 * viewer bug. **`ELEVATOR_SIM_WEB` unset** is the ordinary API-only case, so a missing default
 * build is fine, and the one thing it must not do is be silent about it: a developer who forgot
 * `npm run build:web` and a deployment that shipped without the bundle look identical from the
 * outside, and the startup line is what tells them apart.
 */
async function loadViewer(
  env: Readonly<Record<string, string | undefined>>,
): Promise<StaticBundle | undefined> {
  const configured = env['ELEVATOR_SIM_WEB'];
  if (configured !== undefined && configured.trim().length > 0) return loadStaticBundle(configured);

  const fallback = fileURLToPath(new URL('../../viz/dist-web/', import.meta.url));
  try {
    return await loadStaticBundle(fallback);
  } catch {
    // eslint-disable-next-line no-console -- the alternative is a server that quietly serves no pages.
    console.log(
      `no viewer bundle at ${fallback} — serving the API only. ` +
        'Run `npm run build:web -w @elevator-sim/viz`, or set ELEVATOR_SIM_WEB.',
    );
    return undefined;
  }
}

/**
 * Where the viewer lives — the origin sign-in links point at, and the only page CORS will permit.
 *
 * **It is the viewer's origin and not this server's**, and since § D257 those can differ. A magic
 * link resolves to a *page* (§ D241 § 4), so when the page moves to a CDN the link has to move with
 * it; the value was already a parameter, which is why nothing here is new machinery. What is new is
 * that it is now checked: a typo used to produce a deployment that comes up healthy and mails links
 * nobody can open, and the failure surfaces only in somebody else's inbox.
 *
 * The default is this process's own origin, which is right for local development and for the
 * shipped container — and wrong for every split deployment, which is why the template sets it and
 * `infra/README.md` § 3 says so.
 */
export function viewerOriginFrom(
  env: Readonly<Record<string, string | undefined>>,
  port: number,
): string {
  const configured = env['ELEVATOR_SIM_ORIGIN'];
  if (configured === undefined || configured.trim().length === 0) return `http://localhost:${String(port)}`;
  return requireOrigin(configured, 'ELEVATOR_SIM_ORIGIN');
}

/**
 * The one allowlist entry that is a pattern rather than an origin: this deployment's own previews.
 *
 * A word rather than a hostname, because [§ D330](../../DECISIONS.md)'s second condition is that
 * the pattern is derived from the deployment's own name. An operator who could write the pattern
 * could write a stale one, and a stale allowlist fails closed and looks exactly like GitHub issue
 * #123 again.
 */
const PREVIEWS_ENTRY = 'previews';

/** What `ELEVATOR_SIM_ALLOW_ORIGIN` resolves to: one exact origin, and the previews beside it. */
interface Allowlist {
  /** The exact origin CORS names when nothing else matches, or {@link NO_CROSS_ORIGIN}. */
  readonly origin: string;
  /** The preview pattern this deployment can mint, or `undefined` when previews are not permitted. */
  readonly previews: PreviewOrigins | undefined;
}

/**
 * Read `ELEVATOR_SIM_ALLOW_ORIGIN`, and refuse at boot anything this deployment cannot mint.
 *
 * **The relation is membership, not equality, since [§ D330](../../DECISIONS.md).** What did not
 * change is the argument underneath it: the page a sign-in link opens is the page that then calls
 * this API, so the viewer's origin must be **in** the allowlist, and a deployment where it is not
 * either mails sign-in links to a page that cannot call this API or permits an origin that is not
 * the viewer. Equality enforced that by making the set a singleton. Membership enforces the same
 * thing directly, and adds the second half § D330 asks for: every other member must be an origin
 * this same Static Web App can actually mint.
 *
 * The value is a comma-separated list. Four states, and the middle two are where the cost is:
 *
 * - **Unset** returns {@link NO_CROSS_ORIGIN}. The container serves the page and the API together,
 *   so nothing is cross-origin and nothing needs permitting. This is the shipped state.
 * - **One exact origin**, which must be the viewer's. Byte for byte what it meant before § D330.
 * - **The viewer's origin and `previews`**, which is what a split deployment on Azure Static Web
 *   Apps sets. The second entry is expanded by {@link previewOriginsFor} from `ELEVATOR_SIM_ORIGIN`,
 *   so it names no hostname and cannot drift.
 * - **`*`** is refused, at boot, rather than accepted with a warning nobody reads. The API answers
 *   session-bearing requests and a verification is a whole simulation; a wildcard publishes both to
 *   every page on the web. `requireOrigin` is what refuses it, on every entry.
 *
 * Every refusal here happens before a database is opened or `data/` is loaded, because a
 * configuration mistake that surfaces after those is one the reader meets several seconds and one
 * stack frame away from its cause.
 *
 * **A blank entry is a refusal rather than a skip.** `a,,b` and a trailing comma stop the process,
 * because an entry silently dropped is an origin somebody meant to permit and a failure nobody
 * sees. Surrounding whitespace on an entry is list syntax and is trimmed; whitespace inside the
 * entry is still `requireOrigin`'s to refuse, along with a trailing slash, a path, a query string
 * and an uppercase scheme.
 */
function allowlistFrom(
  env: Readonly<Record<string, string | undefined>>,
  viewerOrigin: string,
): Allowlist {
  const configured = env['ELEVATOR_SIM_ALLOW_ORIGIN'];
  if (configured === undefined || configured.trim().length === 0) {
    return { origin: NO_CROSS_ORIGIN, previews: undefined };
  }
  if (configured.trim() === NO_CROSS_ORIGIN) return { origin: NO_CROSS_ORIGIN, previews: undefined };

  const exact: string[] = [];
  let previewsAsked = false;
  for (const raw of configured.split(',')) {
    const entry = raw.trim();
    if (entry.length === 0) {
      throw new Error(
        `ELEVATOR_SIM_ALLOW_ORIGIN is ${JSON.stringify(configured)}, which has a blank entry. It ` +
          'is a comma-separated allowlist, and an entry dropped for being blank is an origin ' +
          'somebody meant to permit and a refusal nobody sees. Remove the stray comma.',
      );
    }
    if (entry === PREVIEWS_ENTRY) {
      previewsAsked = true;
      continue;
    }
    exact.push(requireOrigin(entry, 'ELEVATOR_SIM_ALLOW_ORIGIN'));
  }

  if (!exact.includes(viewerOrigin)) {
    throw new Error(
      `ELEVATOR_SIM_ALLOW_ORIGIN is ${JSON.stringify(configured)} and ELEVATOR_SIM_ORIGIN is ` +
        `${JSON.stringify(viewerOrigin)}, which it does not permit. They name the same thing, the ` +
        'origin the viewer is served from, so a deployment where the allowlist omits it either ' +
        'mails sign-in links to a page that cannot call this API, or permits an origin that is ' +
        'not the viewer. Set both from one value; see docs/16-static-site-deployment.md § 3.',
    );
  }

  const previews = previewsAsked ? previewOriginsFor(viewerOrigin) : undefined;
  if (previewsAsked && previews === undefined) {
    throw new Error(
      `ELEVATOR_SIM_ALLOW_ORIGIN asks for "${PREVIEWS_ENTRY}", but ELEVATOR_SIM_ORIGIN is ` +
        `${JSON.stringify(viewerOrigin)}, which is not an Azure Static Web App default hostname ` +
        'and therefore mints no preview environments. Expanding it to nothing would permit ' +
        'nothing and say nothing, which is the shape of GitHub issue #123. Drop the entry, or ' +
        'point ELEVATOR_SIM_ORIGIN at the site.',
    );
  }

  const unmintable = exact.filter(
    (origin) =>
      origin !== viewerOrigin && !(previews !== undefined && isPreviewOriginOf(previews, origin)),
  );
  if (unmintable.length > 0) {
    throw new Error(
      `ELEVATOR_SIM_ALLOW_ORIGIN permits ${JSON.stringify(unmintable.join(', '))}, which the ` +
        `deployment at ${JSON.stringify(viewerOrigin)} cannot mint. § D330 widened this list to ` +
        'the production origin and one preview pattern bound to the same Static Web App, and to ' +
        'nothing else: an entry naming any other origin hands a page nobody here deploys an API ' +
        'that answers session-bearing requests. Write the preview pattern as the entry ' +
        `"${PREVIEWS_ENTRY}", which is derived rather than typed.`,
    );
  }

  return { origin: viewerOrigin, previews };
}

/**
 * The exact origin CORS names, or {@link NO_CROSS_ORIGIN}.
 *
 * Since § D330 this is one member of a set rather than the whole of it, and it is the member that
 * answers a caller the previews do not cover. {@link previewOriginsFrom} is the rest of the same
 * decision, read from the same variable by the same parse, so the two cannot disagree about what
 * the environment said.
 */
export function allowOriginFrom(
  env: Readonly<Record<string, string | undefined>>,
  viewerOrigin: string,
): string {
  return allowlistFrom(env, viewerOrigin).origin;
}

/**
 * The previews the allowlist admits, or `undefined` when it admits none.
 *
 * Separate from {@link allowOriginFrom} rather than folded into one return value, because the two
 * answers have different consumers: `siteOriginFrom` and the startup line want the exact origin,
 * and `serve.ts` wants the pattern to match a request's own `Origin` header against. Both call
 * `allowlistFrom`, which is pure and cheap, so the environment is parsed twice at boot and can only
 * be parsed one way.
 */
export function previewOriginsFrom(
  env: Readonly<Record<string, string | undefined>>,
  viewerOrigin: string,
): PreviewOrigins | undefined {
  return allowlistFrom(env, viewerOrigin).previews;
}

/**
 * Where the page is, when this process is not serving it — or `undefined` when it is.
 *
 * **Derived from the two values above rather than read from a seventh.** § D257's whole cost is
 * that three values have to agree; a fourth that could disagree with them would be that cost again,
 * and it would fail the same silent way — a container redirecting to a host that is not the site
 * looks, from every request you can make by hand, exactly like one that is.
 *
 * The derivation is the definition of a split deployment, not a proxy for it. `allowOriginFrom`
 * returns {@link NO_CROSS_ORIGIN} unless an operator has named an origin that may call this API
 * from a browser, and has already refused the case where that origin is not the viewer's — so a
 * value other than `null` **is** the statement *"the page is served somewhere else, and that
 * somewhere is `viewerOrigin`"*. Nothing else can produce one.
 *
 * What this closes is a defect the deployment had for five days and no check could see: the image's
 * own `dist-web` answered `/` with the viewer as it stood when the image was built, while the CDN
 * served the current one. Both were 200s. The stale copy is not a bug in the bundle, in the build,
 * or in the workflow — every one of those was correct — it is that **a second copy of the page
 * existed at all**, and the only durable fix is for this origin to stop having an opinion about
 * what the page looks like. See `ServeOptions.siteOrigin`.
 *
 * It deliberately does **not** consult {@link loadViewer}. A redirect that appeared only when the
 * bundle happened to be missing would make the correct behaviour depend on a build artifact, and
 * the point is that the artifact is *present and wrong*.
 */
export function siteOriginFrom(viewerOrigin: string, allowOrigin: string): string | undefined {
  return allowOrigin === NO_CROSS_ORIGIN ? undefined : viewerOrigin;
}

/**
 * How many trusted reverse proxies sit in front of this process, from the environment.
 *
 * Zero unless an operator says otherwise, and **`ELEVATOR_SIM_TRUST_PROXY` is refused outright**
 * rather than ignored. That variable used to mean *"read the left-most `x-forwarded-for` entry"*,
 * which `clientIpOf` now records as the caller's own text rather than any hop's observation — so an
 * environment still setting it is asking for a behaviour that no longer exists, and the two ways to
 * answer that are to stop the server or to quietly do something else. A server that boots having
 * silently discarded a security setting is the worse of those by a distance.
 *
 * The value is validated as a small non-negative integer, and `Number()` is not used for it:
 * `Number(' 1 ')` is `1`, `Number('')` is `0`, and `Number('1e1')` is `10`. A hop count is a written
 * digit or it is a mistake.
 */
export function trustedHopsFrom(env: Readonly<Record<string, string | undefined>>): number {
  if (env['ELEVATOR_SIM_TRUST_PROXY'] !== undefined) {
    throw new Error(
      'ELEVATOR_SIM_TRUST_PROXY is no longer read. It meant "believe the left-most ' +
        'x-forwarded-for entry", which is the entry the caller writes rather than the one a proxy ' +
        'observed — so it made the per-caller budget forgeable rather than trustworthy. Set ' +
        'ELEVATOR_SIM_TRUSTED_HOPS to the number of trusted reverse proxies in front of this ' +
        'process instead: 0 for none, 1 behind exactly one. See DECISIONS.md § D242.',
    );
  }

  const raw = env['ELEVATOR_SIM_TRUSTED_HOPS'];
  if (raw === undefined || raw.trim().length === 0) return 0;
  if (!/^\d{1,2}$/u.test(raw.trim())) {
    throw new Error(
      `ELEVATOR_SIM_TRUSTED_HOPS is ${JSON.stringify(raw)}. It is a count of trusted reverse ` +
        'proxies — a plain non-negative integer, 0 for none.',
    );
  }
  return Number.parseInt(raw.trim(), 10);
}

/**
 * Read the environment, boot, listen.
 *
 * Exported and takes its environment as an argument so the wiring is testable without spawning a
 * process — the port is the only part a test cannot reach, and it is one call.
 */
export async function main(env: Readonly<Record<string, string | undefined>>): Promise<void> {
  const port = Number(env['PORT'] ?? '8787');
  const viewerOrigin = viewerOriginFrom(env, port);
  // Read before anything is opened. Both refusals in here are configuration mistakes, and a
  // configuration mistake that surfaces after a database connection and a `data/` load is one the
  // reader meets several seconds and one stack frame away from its cause.
  const allowOrigin = allowOriginFrom(env, viewerOrigin);
  // The other half of the same variable, read here rather than inside `serve` so that every
  // refusal § D330 requires happens in one place and before anything is opened.
  const previewOrigins = previewOriginsFrom(env, viewerOrigin);
  // Read with the origins, before anything is opened, because a refused `ELEVATOR_SIM_TRUST_PROXY`
  // is a configuration mistake and those belong next to their cause rather than a database
  // connection away from it.
  const trustedHops = trustedHopsFrom(env);
  const server = await bootstrap({
    dataDir: env['ELEVATOR_SIM_DATA'] ?? fileURLToPath(new URL('../../../data/', import.meta.url)),
    sql: new PgSql(requireDatabaseUrl(env)),
    env,
    publicOrigin: viewerOrigin,
  });

  const viewer = await loadViewer(env);
  const siteOrigin = siteOriginFrom(viewerOrigin, allowOrigin);

  serve({
    api: server.api,
    port,
    // No default of `'*'`, and since § D257 no `'*'` at all: `allowOriginFrom` refuses it outright.
    // An operator who has not decided gets same-origin, which is the safe end of the choice rather
    // than the convenient one — and when the viewer is served from this same origin, as it is in
    // the shipped container, there is no cross-origin request to permit.
    allowOrigin,
    // Since § D330 the allowlist is a membership relation, and `Access-Control-Allow-Origin` can
    // carry exactly one origin. So the previews travel as a pattern and `serve` echoes whichever
    // member the caller actually is; `allowOrigin` is what it answers everyone else.
    previewOrigins,
    // Zero unless an operator counts the proxies in front, because `x-forwarded-for` is a request
    // header and reading it from the wrong end would hand every caller a free rate-limit key.
    // § D242 and `clientIpOf`'s own note say what each value costs.
    trustedHops,
    static: viewer,
    // Set only in a split deployment, where it takes precedence over `static` for every page
    // request. Both are passed rather than one, because the bundle is still what this origin serves
    // when it *is* the viewer — locally, and in the shipped same-origin container.
    siteOrigin,
  });

  // What this process answers a page request with, which since `siteOrigin` is three things rather
  // than two. A bundle that is loaded and then never served is worth saying out loud: it is the
  // state the stale container was in for five days, and the line that would have named it.
  const pageRole =
    siteOrigin !== undefined
      ? `redirecting pages to ${siteOrigin}${viewer === undefined ? '' : ', its own bundle loaded and unused'}`
      : viewer === undefined
        ? 'no page — API only'
        : 'serving its own page';

  // eslint-disable-next-line no-console -- a server's one line of startup output.
  console.log(
    `elevator-sim listening on ${String(port)} — ${pageRole}; ` +
      // Both origins, because since § D257 they can differ and the difference is invisible from
      // outside: a split deployment and a same-origin one answer identically to every request you
      // can make by hand, and disagree only in a browser. This is the line that tells them apart.
      `viewer origin ${viewerOrigin}, cross-origin callers ` +
      `${allowOrigin === NO_CROSS_ORIGIN ? 'none' : allowOrigin}` +
      // Named on its own, because a deployment that permits previews and one that does not answer
      // identically to every request you can make by hand and differ only for a preview's browser.
      `${previewOrigins === undefined ? '' : ` and ${previewOrigins.base}-<pr>.${previewOrigins.suffix}`}`,
  );
}

// `import.meta.main` is the run-as-script check; the module is also imported by its test.
if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  main(process.env).catch((error: unknown) => {
    // The message and nothing else. A missing secret must read as a configuration mistake with an
    // obvious fix, not as a crash.
    // eslint-disable-next-line no-console -- the failure path of a CLI entry point.
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
