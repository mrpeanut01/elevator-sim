/**
 * Dev-server shims for the two Node builtins `@elevator-sim/core`'s barrel drags in.
 *
 * ## Why this file exists
 *
 * `core/src/config/loader.ts` imports `node:fs/promises` and `node:path`, and its own docstring
 * says the point of keeping it separate from the pure `parse.ts` is that "a browser build can
 * import `parseBuilding`/`resolveBuilding` from `./parse.js` without pulling `node:fs` into its
 * module graph (CLAUDE.md invariant 6, and Phase 4's 'web viewer consuming core')".
 *
 * That intention is defeated one level up: `core`'s barrel (`src/index.ts`) re-exports
 * `loadConfig`, and `core`'s `package.json` publishes exactly one entry point. So *any* import
 * of `@elevator-sim/core` pulls `loader.js` into the graph, and Vite's default externalisation
 * stub throws at module evaluation — before a single line of viewer code runs.
 *
 * `viz` must not edit `core`, so the dev server aliases the two builtins to this file instead.
 * The functions throw if called, which is correct: the browser viewer never calls `loadConfig`
 * — it fetches and uses the pure `parseBuilding`/`resolveBuilding` path (`src/dev/data.ts`). A
 * shim that silently returned empty data would hide a real mistake.
 *
 * ## This is a workaround, and it should not survive
 *
 * The proper fix belongs to `core` and is recorded as a request rather than made here: publish
 * a browser-safe entry point — an `exports` subpath such as `@elevator-sim/core/config` for the
 * fs-free `parse.js`, or move `loadConfig` out of the default barrel. Either makes this file
 * unnecessary. Until then it is confined to `vite.config.ts`, which is dev-only tooling and is
 * outside the TypeScript project.
 */

const refuse = (name) => () => {
  throw new Error(
    `${name} is not available in the browser. The viz dev server stubs it because ` +
      `@elevator-sim/core's barrel re-exports loadConfig; use the fs-free parse path instead.`,
  );
};

/* node:fs/promises */
export const readFile = refuse('readFile');
export const readdir = refuse('readdir');
export const writeFile = refuse('writeFile');

/* node:path */
export const isAbsolute = refuse('isAbsolute');
export const join = refuse('join');
export const resolve = refuse('resolve');

export default {
  readFile,
  readdir,
  writeFile,
  isAbsolute,
  join,
  resolve,
};
