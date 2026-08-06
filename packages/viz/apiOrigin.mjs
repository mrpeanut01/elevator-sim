/**
 * Telling a **statically hosted** page where its API is — the second producer of one tag.
 *
 * ## Why there are two producers, and why exactly one may fire
 *
 * `viz/src/dev/main.ts` builds its API client from `<meta name="elevator-sim-api">` and has **no
 * default origin** (§ D215 § 4). With no tag the client is `undefined` and every account,
 * leaderboard and challenge screen dead-ends — which is not hypothetical: it shipped, and it is the
 * root cause behind play-tester issues #21, #28, #29, #30, #32 and #34 (§ D243).
 *
 * § D243 closed that by having the **server** inject the tag as it reads the build off disk, with
 * the value `"/"`. That fix is exactly right for the deployment it was written for — one Container
 * App serving the page and the API from one origin — and it cannot reach a bundle a CDN serves,
 * because such a bundle never passes through `loadStaticBundle`. Moving the viewer onto Static Web
 * Apps therefore needs a second producer, and this is it (§ D257).
 *
 * The two are **mutually exclusive by construction**, not by convention:
 *
 * | Build | `ELEVATOR_SIM_API_ORIGIN` | This plugin | The server |
 * |---|---|---|---|
 * | `vite dev` | unset | emits nothing | not involved |
 * | the container image (`Dockerfile`) | unset | emits nothing | injects `"/"` |
 * | the static host (`deploy-viz.yml`) | `https://…` | emits an absolute tag | never sees it |
 *
 * `withApiOriginTag` in `packages/server/src/http/static.ts` is idempotent — a document that
 * already declares a tag keeps its own — so even a static bundle handed to the container keeps the
 * absolute origin rather than acquiring a second, contradictory tag. That property is asserted from
 * both sides in `packages/server/src/http/static.test.ts`, which drives this module and that one in
 * the same file, because neither can see the other.
 *
 * ## Why the value has to be absolute here, and what answers § D243's objection to that
 *
 * § D243 § 2 rejected an absolute origin, on two grounds that have not stopped being true: it goes
 * stale the moment a custom domain goes in front, and any mismatch — down to `http` versus `https`
 * — turns a same-origin call into a cross-origin one that `ELEVATOR_SIM_ALLOW_ORIGIN`'s restrictive
 * default then refuses.
 *
 * Neither ground is dodged here. The answer is that the origin is a **deploy parameter**, never a
 * committed constant: the repository holds no hostname, `index.html` is unchanged, and a custom
 * domain is one variable moving in one place (`docs/16-static-site-deployment.md` § 7). And the
 * second ground is answered by making the mismatch **impossible to have silently**: the same
 * parameter that writes this tag also writes the API's `ELEVATOR_SIM_ALLOW_ORIGIN`, so the two
 * cannot disagree without somebody editing one of them alone.
 *
 * `originIssues` exists so that a value which is *nearly* an origin fails the build rather than the
 * page. A trailing slash, a path, a stray query string or `HTTPS://` in capitals all produce a
 * document that loads perfectly and a client that cannot reach anything, which is the failure mode
 * this whole module is here to stop happening a second time.
 *
 * ## Not a `.ts` file, deliberately
 *
 * `packages/viz/tsconfig.json` includes `src/**` only, so `tsc -b` never compiles this and the
 * shipped library surface cannot come to depend on it. Plain ESM with no imports means a test can
 * load it directly without dragging `vite` — or this package's compilation — in behind it.
 */

/** The tag `viz`'s `dev/main.ts` reads its API origin out of. Named once here, once in `static.ts`. */
export const API_ORIGIN_META_NAME = 'elevator-sim-api';

/** The build parameter. Unset is the shipped state and means "the server will say" (§ D243). */
export const API_ORIGIN_ENV = 'ELEVATOR_SIM_API_ORIGIN';

/**
 * The switch that turns *absence* into a build failure.
 *
 * Set by the deploying workflow and by nothing else. It exists because the two silent states are
 * not the same silence: a build with no origin is **correct** for `vite dev` and for the container
 * image, and **catastrophic** for a static host, where it ships a page whose social surfaces all
 * dead-end with no failing status code anywhere. Only the caller knows which one it is, so only the
 * caller can say — and when it says "static host", an unset origin stops the build.
 */
export const API_ORIGIN_REQUIRED_ENV = 'ELEVATOR_SIM_API_ORIGIN_REQUIRED';

/**
 * Everything wrong with a value offered as an exact origin, or an empty array.
 *
 * Deliberately strict about the things that are *nearly* right, because those are the ones that
 * produce a working-looking page: an origin is a scheme, a host and a port, and nothing else. A
 * trailing slash fails here rather than in the browser, where `https://api.example/` and
 * `https://api.example` are the same origin for CORS and different strings for a header comparison.
 */
export function originIssues(value) {
  const issues = [];
  if (typeof value !== 'string' || value.trim().length === 0) {
    return ['it is empty'];
  }
  if (value !== value.trim()) issues.push('it has leading or trailing whitespace');
  const trimmed = value.trim();

  if (trimmed === '*') {
    return [
      'it is "*", which is not an origin. A wildcard here would publish an API that answers ' +
        'session-bearing requests from any page on the web',
    ];
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return [`it is not an absolute URL — expected something like "https://elevator-sim.example"`];
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    issues.push(`its scheme is "${url.protocol.replace(':', '')}" — expected http or https`);
  }
  if (url.username !== '' || url.password !== '') issues.push('it carries credentials');
  if (url.pathname !== '/') issues.push(`it has a path ("${url.pathname}") — an origin has none`);
  if (url.search !== '') issues.push('it has a query string');
  if (url.hash !== '') issues.push('it has a fragment');
  // The whole-string comparison is the one that catches a trailing slash, an uppercase scheme and a
  // redundant `:443`, none of which the field-by-field checks above see.
  if (issues.length === 0 && trimmed !== url.origin) {
    issues.push(`it is not in canonical form — write it as "${url.origin}"`);
  }
  return issues;
}

/** The exact origin a value denotes, or a thrown error naming every reason it is not one. */
export function requireOrigin(value, what) {
  const issues = originIssues(value);
  if (issues.length > 0) {
    throw new Error(
      `${what} is not a usable origin (${JSON.stringify(value)}):\n  ${issues.join('\n  ')}\n` +
        'An origin is a scheme, a host and an optional port — for example ' +
        'https://elevsim-app.example.azurecontainerapps.io — with no trailing slash.',
    );
  }
  return value.trim();
}

/** The tag itself. One function, so the two producers cannot disagree about its shape. */
export function apiOriginMetaTag(origin) {
  return `<meta name="${API_ORIGIN_META_NAME}" content="${origin}" />`;
}

/**
 * Whether a document **declares** the tag — the same test `withApiOriginTag` applies, comments and
 * all.
 *
 * The comment strip is a bug a test found rather than a precaution. `index.html` carries a comment
 * telling the next reader not to write this tag by hand, and such a comment necessarily contains
 * the attribute it warns about; a plain regex matched the warning, concluded the document was
 * already told its origin, and emitted nothing. The prose written to prevent a dead-ending viewer
 * produced one. `querySelector` — what the page itself runs — does not see comments, and this has
 * to agree with it.
 */
export function declaresApiOrigin(html) {
  return new RegExp(`name=["']${API_ORIGIN_META_NAME}["']`, 'iu').test(
    html.replace(/<!--[\s\S]*?-->/gu, ''),
  );
}

/**
 * What the build should do, decided from an environment and nothing else.
 *
 * Split out from the plugin so a test can drive the decision without a bundler. Returns the origin
 * to declare, or `undefined` to declare nothing; throws when the environment asks for something
 * that cannot be right.
 */
export function apiOriginFrom(env) {
  const raw = env[API_ORIGIN_ENV];
  const required = env[API_ORIGIN_REQUIRED_ENV]?.trim().toLowerCase() === 'true';
  const declared = raw !== undefined && raw.trim().length > 0;

  if (!declared) {
    if (required) {
      throw new Error(
        `${API_ORIGIN_REQUIRED_ENV}=true, but ${API_ORIGIN_ENV} is not set.\n` +
          'A statically hosted bundle carries no server, so the page has to be told where the API ' +
          'is at build time. Built without it, the site loads, draws, and every account, ' +
          'leaderboard and challenge screen dead-ends with no failing status code anywhere — ' +
          'play-tester issues #21, #28, #29, #30, #32 and #34, exactly (§ D243).\n' +
          `Set ${API_ORIGIN_ENV} to the API's origin, e.g. ` +
          'https://elevsim-app.example.azurecontainerapps.io — and see ' +
          'docs/16-static-site-deployment.md § 3.',
      );
    }
    return undefined;
  }
  return requireOrigin(raw, API_ORIGIN_ENV);
}

/**
 * Widen a hosting config's `connect-src` to permit the declared API origin.
 *
 * The committed `staticwebapp.config.json` says `connect-src 'self'`, which is correct for the
 * artifact as committed — a page that contacts nothing may permit nothing — and forbids exactly the
 * request the whole deployment exists to make once an origin is declared. So the two move together
 * or neither does, and the coupling is asserted in both directions by the test: a declared origin
 * must appear in `connect-src`, and with none declared `connect-src` must permit nothing extra,
 * because an origin permitted for a page that never contacts it is dead configuration.
 *
 * Textual, on the one directive, and it **throws when it finds nothing to widen** rather than
 * returning the input unchanged — a CSP that silently failed to be widened is a site that loads
 * and cannot call its API, which is this lane's whole failure mode wearing a different hat.
 */
export function hostConfigWithApiOrigin(json, origin) {
  if (origin === undefined) return json;
  const config = JSON.parse(json);
  const csp = config.globalHeaders?.['Content-Security-Policy'];
  if (typeof csp !== 'string' || !csp.includes("connect-src 'self'")) {
    throw new Error(
      "the hosting config has no `connect-src 'self'` to widen, so declaring an API origin would " +
        'produce a site whose page loads and whose every request is blocked by its own CSP.',
    );
  }
  config.globalHeaders['Content-Security-Policy'] = csp.replace(
    "connect-src 'self'",
    `connect-src 'self' ${origin}`,
  );
  return `${JSON.stringify(config, null, 2)}\n`;
}

/**
 * The Vite plugin: declare the tag, or declare nothing.
 *
 * `head-prepend` so the tag precedes anything that could act on it, matching where the server
 * injects its own. Idempotent for the same reason `withApiOriginTag` is — a document that already
 * declares an origin has been told by somebody who knew something this build does not, and two tags
 * leave `querySelector` picking whichever came first.
 */
export function apiOriginPlugin(env) {
  const origin = apiOriginFrom(env);
  return {
    name: 'elevator-sim-api-origin',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (origin === undefined || declaresApiOrigin(html)) return html;
        return {
          html,
          tags: [
            {
              tag: 'meta',
              attrs: { name: API_ORIGIN_META_NAME, content: origin },
              injectTo: 'head-prepend',
            },
          ],
        };
      },
    },
  };
}
