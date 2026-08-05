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
        bundle.set(urlPath, {
          body: await readFile(child),
          contentType: CONTENT_TYPES[extension] ?? 'application/octet-stream',
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
