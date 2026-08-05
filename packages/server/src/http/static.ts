/**
 * Serving the built viewer beside the API, from one origin.
 *
 * The viewer is a static bundle (`packages/viz/dist-web/`, produced by `npm run build:web`) and the
 * API is JSON. Hosting them on one origin rather than two is what lets
 * `ELEVATOR_SIM_ALLOW_ORIGIN` stay at its same-origin default: a browser fetching `/api/boards`
 * from the page that served it is not making a cross-origin request, so there is no CORS policy to
 * get wrong. A split deployment would need one, and *"which origins may call this API"* is a
 * question with a wrong answer that looks exactly like a working one.
 *
 * ## What this is not
 *
 * It is not a general-purpose file server, and the difference matters because a file server that
 * takes a path from a request is a directory-traversal bug waiting to be written. Nothing here
 * joins a request path onto a root. The bundle is **read once at startup into memory** and served
 * from a `Map` keyed by exact URL path — so a request either names something that was in the build
 * output or it does not, and `../` has nothing to traverse because no filesystem call ever sees it.
 * The bundle is a few hundred kilobytes and the process is a container that restarts to deploy, so
 * reading it once costs nothing worth optimising and removes a whole class of defect.
 *
 * ## It also tells the page that this server exists — § D243
 *
 * `viz`'s `dev/main.ts` builds its API client from `<meta name="elevator-sim-api">` and has
 * **no default origin**, deliberately: a client that fell back to the page's own origin would work
 * in development and fail in a build served from a CDN, which is the class of bug that only
 * reproduces where it cannot be debugged (§ D215 § 4). The bundle therefore ships without the tag.
 *
 * The consequence, measured on the deployment rather than reasoned about: `GET /api/challenges` on
 * the live app answers **200** with real data out of Azure PostgreSQL, the served `index.html`
 * carries **no such tag**, and so every account, leaderboard and challenge screen in the shipped
 * viewer dead-ends against a working API on its own origin. That is the root cause behind play-tester
 * issues #21, #28, #29, #30, #32 and #34 — and it would have made a magic-link flow unreachable
 * however carefully it was built.
 *
 * The fix belongs here and not in `viz/index.html`, because the fact being declared is **this
 * process's**, not the bundle's: a bundle does not know whether an API is beside it, and this server
 * does — it is serving both. So {@link loadStaticBundle} injects the tag into `index.html` as it
 * reads it. A bundle served from a CDN with no server never passes through this function, never gets
 * a tag, and keeps exactly today's behaviour, which is the property § D215 § 4 was protecting.
 */

import { readdir, readFile } from 'node:fs/promises';
import { extname, join, posix } from 'node:path';

/** One file from the build output: what to send, and what to call it. */
export interface StaticAsset {
  readonly body: Buffer;
  readonly contentType: string;
  /**
   * Whether the name carries a content hash.
   *
   * Vite emits `assets/index-D0X0Ej_j.js` — the hash changes when the content does — so those may
   * be cached forever. `index.html` and the reference JSON may not: they keep their names across
   * deploys, and a year-long cache on `index.html` is how a browser pins itself to a build that no
   * longer exists.
   */
  readonly immutable: boolean;
}

/** The bundle, by exact URL path (`/index.html`, `/assets/index-D0X0Ej_j.js`, `/__buildings.json`). */
export type StaticBundle = ReadonlyMap<string, StaticAsset>;

/**
 * Content types for what a Vite build actually emits, and nothing else.
 *
 * An unknown extension is served as `application/octet-stream` rather than guessed at: a wrong
 * `content-type` on a file a browser will execute is a security question, not a cosmetic one, and
 * `nosniff` travels with every response so the browser will not second-guess it either.
 */
const CONTENT_TYPES: Readonly<Record<string, string>> = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
});

/** Vite's hashed-asset shape: `name-8charhash.ext`. Conservative — a miss only costs a revalidation. */
const HASHED = /-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/u;

/** The tag `viz`'s `dev/main.ts` reads its API origin out of. Named once, on both sides. */
export const API_ORIGIN_META_NAME = 'elevator-sim-api';

/**
 * The value injected: `"/"`, meaning **the origin that served this page**.
 *
 * Not the configured `ELEVATOR_SIM_ORIGIN`, and the difference is not cosmetic. The client builds
 * every request as `` `${origin.replace(/\/$/, '')}/api/…` ``, so `"/"` becomes the empty string and
 * the requests become `/api/challenges` — same-origin, absolute-path, resolved by the browser
 * against whatever host actually served the page.
 *
 * An absolute origin would have to be *right*, and it has two ways to be wrong that this has none
 * of. It would be stale the moment a custom domain is put in front — which `infra/azure/main.bicep`
 * emits an output specifically warning about — and every mismatch, down to `http` versus `https` or
 * `localhost` versus `127.0.0.1`, turns a same-origin call into a cross-origin one that
 * `ELEVATOR_SIM_ALLOW_ORIGIN`'s deliberately-restrictive default then refuses. A relative value is
 * correct in local development, in a staging slot, behind a custom domain and behind a rewrite,
 * with no configuration to keep in step.
 *
 * It is also the choice that does not trust the `Host` header. Deriving the tag per request from
 * `Host` would be equally configuration-free and would let a request with a forged `Host` produce a
 * page pointing its API at somebody else's server — a shared cache in front of it turns that from
 * self-inflicted into an attack.
 */
export const SAME_ORIGIN_API = '/';

const API_ORIGIN_META_TAG = `<meta name="${API_ORIGIN_META_NAME}" content="${SAME_ORIGIN_API}" />`;

/**
 * Put the tag in a document's `<head>`, unless it already declares one.
 *
 * Idempotent on purpose. A bundle that already carries the tag has been told its origin by somebody
 * who knew something this server does not, and a second tag would leave `querySelector` picking
 * whichever came first — a coin toss between two answers is worse than either.
 *
 * The insertion is after the opening `<head>`, so the tag precedes anything that could act on it,
 * and it falls back to prefixing the document when there is no `<head>` at all — a document with no
 * head is not a viewer build, but silently dropping the tag would be the failure this whole section
 * exists to stop, one level down.
 */
export function withApiOriginTag(html: string): string {
  if (new RegExp(`name=["']${API_ORIGIN_META_NAME}["']`, 'iu').test(html)) return html;
  const head = /<head[^>]*>/iu.exec(html);
  if (head === null) return `${API_ORIGIN_META_TAG}\n${html}`;
  const at = head.index + head[0].length;
  return `${html.slice(0, at)}\n    ${API_ORIGIN_META_TAG}${html.slice(at)}`;
}

/**
 * Read a build output directory into memory.
 *
 * Throws when the directory is absent or holds no `index.html`, rather than starting a server that
 * answers every page request with a 404. A container that came up "healthy" and served nothing
 * would be reported as a viewer bug for as long as it took someone to check the image.
 */
export async function loadStaticBundle(root: string): Promise<StaticBundle> {
  const bundle = new Map<string, StaticAsset>();

  async function walk(dir: string, prefix: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const child = join(dir, entry.name);
      const urlPath = posix.join(prefix, entry.name);
      if (entry.isDirectory()) {
        await walk(child, urlPath);
      } else if (entry.isFile()) {
        const extension = extname(entry.name).toLowerCase();
        const raw = await readFile(child);
        // Only the document, and only at the root. Every other byte of the build is passed through
        // untouched — a rewrite that touched a hashed asset would change content whose name promises
        // it never changes, which is the one thing `immutable` may not be wrong about.
        const isDocument = urlPath === '/index.html';
        bundle.set(urlPath, {
          body: isDocument ? Buffer.from(withApiOriginTag(raw.toString('utf8')), 'utf8') : raw,
          contentType: CONTENT_TYPES[extension] ?? 'application/octet-stream',
          // Unchanged by the injection, and it must be: `index.html` keeps its name across deploys,
          // so it is `no-cache` whatever is in it, and the rewritten document inherits exactly the
          // caching the original had rather than acquiring its own.
          immutable: HASHED.test(entry.name),
        });
      }
    }
  }

  try {
    await walk(root, '/');
  } catch (cause) {
    throw new Error(
      `Could not read the viewer build at ${root}. Run \`npm run build:web -w @elevator-sim/viz\`, ` +
        'or point ELEVATOR_SIM_WEB at the directory that build produced.',
      { cause },
    );
  }

  if (!bundle.has('/index.html')) {
    throw new Error(
      `${root} has no index.html, so it is not a viewer build. A server that started anyway would ` +
        'answer every page request with a 404 and look like a broken viewer rather than a missing one.',
    );
  }
  return bundle;
}

/**
 * The asset a request means, or `undefined`.
 *
 * `/` means `/index.html`. **Nothing else falls back to it.** A single-page app usually wants a
 * catch-all rewrite, and this deliberately does not have one: the viewer has no client-side router,
 * so every real request names a file, and a catch-all would turn a mistyped asset URL into a 200
 * carrying HTML. That failure is markedly harder to read than a 404 — the browser reports a syntax
 * error inside what it was told was JavaScript, pointing at `<!doctype html>`.
 */
export function assetFor(bundle: StaticBundle, path: string): StaticAsset | undefined {
  return bundle.get(path === '/' ? '/index.html' : path);
}

/** `cache-control` for an asset, which is entirely decided by whether its name carries a hash. */
export function cacheControlFor(asset: StaticAsset): string {
  return asset.immutable ? 'public, max-age=31536000, immutable' : 'no-cache';
}
