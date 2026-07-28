/**
 * `@elevator-sim/core` — the default entry point, resolved under Node.
 *
 * This file is **the browser barrel plus `loadConfig`**, and it is deliberately that thin. All
 * of the package's surface — kernel, random, config parsing, physics, model, traffic, dispatch,
 * metrics, analytical, sim — is declared in `./browser.ts`, which is documented, guarded and
 * environment-free. The only thing that cannot live there is the one function that reads a
 * filesystem.
 *
 * ## The two entry points, and how a specifier picks one
 *
 * `package.json` publishes:
 *
 * | specifier | environment | resolves to | has `loadConfig`? |
 * |---|---|---|---|
 * | `@elevator-sim/core` | Node (default condition) | `dist/index.js` | yes |
 * | `@elevator-sim/core` | a bundler building for the browser (`browser` condition) | `dist/browser.js` | no |
 * | `@elevator-sim/core/browser` | any | `dist/browser.js` | no |
 *
 * The `browser` condition is what lets a browser bundle import the package by its plain name and
 * get something that loads. Before this split, that import threw at module *evaluation* —
 * `config/loader.ts` imports `node:fs/promises` and `node:path`, a bundler stubs those with a
 * module that throws when evaluated, and so the viewer died before running a line. Phase 4 worked
 * around it by aliasing the two builtins in its dev server; that alias and its shim are deleted.
 *
 * `@elevator-sim/core/browser` is the *explicit* form and is the better one for code that is only
 * ever going to run in a browser, because TypeScript's `NodeNext` resolution does not apply the
 * `browser` condition — under the plain specifier a browser file still sees `loadConfig` in the
 * types even though the bundle will not contain it. The subpath narrows the types to match the
 * runtime.
 *
 * ## Adding an export
 *
 * Add it to `./browser.ts`. It reaches both entry points from there, and `browser.test.ts` walks
 * the transitive import graph of that file and fails if what you added pulls a `node:` builtin —
 * or any new external package — into a browser bundle. Add an export *here* only when it truly
 * cannot run outside Node, and expect `index.test.ts` to make you say so: it asserts the two
 * barrels differ by exactly the names listed below.
 */

export * from './browser.js';

/* -------------------------------------------------------------------------- *
 * config/loader — the package's only filesystem access, and the only reason
 * this file exists separately from `./browser.ts`. Node only.
 * -------------------------------------------------------------------------- */

export { loadConfig } from './config/loader.js';
