# T10 — `core` gets a browser entry point

Decision record for `fix/core-browser-entry`. Fixes wave-1 finding **C2**.

## The defect

`packages/core/src/index.ts` re-exported `loadConfig`; `loadConfig` lives in
`config/loader.ts`, which imports `node:fs/promises` and `node:path`. A bundler replaces a
Node builtin with a stub that throws **at module evaluation**, so *any* browser import of
`@elevator-sim/core` died before running a line. Phase 4's viewer worked around it by
aliasing the two builtins to a throwing shim in `packages/viz/dev-shims/`.

Three docstrings — `config/loader.ts`, `config/index.ts` and the old `src/index.ts` — each
asserted that a browser build could take the pure parsing path "without pulling `node:fs`
into its module graph". All three were wrong for the whole of Phase 4, and each of them
reads as correct in isolation. Only the *graph* showed it. That fact set the shape of the
guard below.

Reproduced before the fix, with the Node builtins a browser lacks made unresolvable:

```
THROW packages/core/dist/index.js
      BROWSER-UNSAFE: node:fs/promises is not available in this environment
      (imported by …/packages/core/dist/config/loader.js)
```

## Decision 1 — restructure, not a subpath beside the default barrel

The brief offered two shapes: add an `@elevator-sim/core/config` subpath beside the existing
default barrel, or move `loadConfig` off the default barrel. **Neither in its pure form was
available**, and the reason is worth recording because it drove the answer.

- *Subpath beside the barrel* leaves the default specifier broken. `packages/viz/src/frame/
  frameAt.ts` and `dev/main.ts` import values from `@elevator-sim/core`, so deleting
  `dev-shims/` would break the dev server until `viz/src` migrated — and `viz/src` belongs to
  another builder this wave. It also loses on the "who re-breaks it" test: the barrel that
  everyone reaches for by default stays the unsafe one, and the safe one is opt-in.
- *Removing `loadConfig` from `.` outright* is the right long-run API, but `loadConfig` is
  imported from `@elevator-sim/core` by `experiments` (5 files), `cli/src/data.ts` and four
  `viz` test files. All three packages are out of this task's ownership, and `npx tsc -b`
  must stay clean.

The shape that satisfies both: **`src/browser.ts` becomes the whole barrel, `src/index.ts`
becomes `export * from './browser.js'` plus `loadConfig`, and `package.json` routes the two
apart with an export condition.**

```jsonc
".": {
  "types":   "./dist/index.d.ts",
  "browser": { "types": "./dist/browser.d.ts", "default": "./dist/browser.js" },
  "default": "./dist/index.js"
},
"./browser": { "types": "./dist/browser.d.ts", "default": "./dist/browser.js" }
```

| specifier | environment | resolves to | `loadConfig`? |
|---|---|---|---|
| `@elevator-sim/core` | Node | `dist/index.js` | yes — 388 exports |
| `@elevator-sim/core` | bundler, `browser` condition | `dist/browser.js` | no — 387 exports |
| `@elevator-sim/core/browser` | any | `dist/browser.js` | no — 387 exports |

Why this and not a `browser` field, or a lazy `await import('./loader.js')` inside
`loadConfig`:

- The `browser` **condition** (not the legacy `browser` field) is the standard mechanism and
  is what Vite already resolves for a client build. No aliasing, no stub, no bundler-specific
  configuration. Measured: Vite loaded `dist/browser.js` and never requested
  `dist/config/loader.js`.
- A dynamic `import()` would have kept one barrel, but it is not a fix. Rollup and Vite
  follow a dynamic import into a chunk, so `node:fs` would still be in the build — the
  failure would move from load time to build time, not disappear. The guard treats
  `import()` as a graph edge for exactly this reason.
- Zero blast radius outside `core`: no consumer's import specifier changes, and the Node
  entry's public surface is byte-for-byte what it was.

**Direction of the default matters.** The *unsafe* export now needs a deliberate act — it can
only be added to `src/index.ts`, a 48-line file whose entire subject is that it is the Node
side of a split. The *safe* barrel is where every ordinary export goes, and it is the one the
guard walks. Before, the polarity was reversed: the safe path was the opt-in one and nobody
opted in.

## Decision 2 — the guard walks the graph, and its complement is asserted

`src/browser.test.ts` does a breadth-first walk of the real static import graph from
`src/browser.ts`, resolving `./x.js → x.ts` the way `tsc` emits, and asserts:

1. no `node:` specifier — and no bare builtin name (`fs`, `path`, …) — anywhere in the graph,
   reported as `<file> imports <specifier>` so a failure names the edge;
2. `config/loader.ts` is not reachable, and `config/parse.ts` still is;
3. the external packages in the graph are **exactly** `['zod']` — an asserted equality, so
   dragging a new npm dependency into the browser bundle is a deliberate edit to that line;
4. every relative specifier resolves (a broken import is also a failure);
5. **the complement is exactly `['config/loader.ts', 'index.ts']`** — of the package's 88
   non-test modules, the walk reaches 86, and the two it misses are the two that make up the
   Node side. This is the assertion that would catch the *extractor* silently missing an
   import form, which is the real failure mode of a guard like this;
6. the two barrels differ by exactly `loadConfig`, in both directions, with identical
   bindings;
7. `package.json` names both entry points and every target has a source file.

Dynamic `import()` and `require()` count as edges. Type-only imports count too: the rule is
cheap to keep and the alternative is a test that has to reason about what erases, which is
the kind of subtlety that let the original defect hide behind three correct docstrings.

The `import`/`export` patterns are anchored at a statement boundary rather than matched on a
bare `from`, because `config/resolveCar.ts` builds the message ``cannot read a … divisor from
"${…}"`` and an unanchored pattern reads that template literal as an import.

The guard was watched failing three ways before being trusted — see the delivery report.

## Decision 3 — where the guard lives

In `core`, not in `viz/src/boundaries.test.ts`. Invariant 6 runs one way: `core` must build
and test with `viz` absent, so a `core` invariant cannot be enforced from `viz`.
`boundaries.test.ts` supplied the technique and keeps its own four rules unchanged.

## One thing the split nearly broke, silently

`dispatch/deadCode.test.ts` distinguishes a *caller* from a *barrel re-export*, and it
identified barrels by `basename(path) === 'index.ts'`. `src/browser.ts` is a barrel by role
and not by name, so the first green build after the split counted the 950-line barrel as a
real consumer of everything it re-exports — and all fourteen `PUBLIC_API_ONLY` entries
reported "now has a caller". The audit that exists to stop dead code reading as live had
been made to read everything as live.

It failed loudly, which is the point: the test asserts its allowlist in both directions, so
the regression surfaced as fourteen named entries rather than as a quietly weaker check.
`isBarrel` now recognises `core/src/browser.ts` as well, with the reason recorded inline.

## Consequences and limitations

- **TypeScript does not apply the `browser` condition.** Under `moduleResolution: NodeNext`,
  a browser-only file importing `@elevator-sim/core` still sees `loadConfig` in the types
  even though the bundle will not contain it. Calling it would typecheck and fail at runtime.
  The mitigation is the explicit `@elevator-sim/core/browser` subpath, whose types are
  `dist/browser.d.ts` and therefore match the runtime. Browser-only code should use it; the
  request to `packages/viz/src/` is in the delivery report.
- `vitest.config.ts` gained an alias for `@elevator-sim/core/browser` ahead of the existing
  `@elevator-sim/core` entry — these are prefix matches, so the shorter key would otherwise
  swallow the subpath and resolve it to `…/src/index.ts/browser`.
- `config/index.ts` no longer re-exports `loadConfig`. Inside `core`, tests already imported
  it from `../config/loader.js`; the one exception (`analytical/docFormula.test.ts`) was
  updated. `index.test.ts` gained `config/loader` as a submodule of its own so its
  "re-exports everything / invents nothing" pair stays total.
- `packages/viz/dev-shims/` and the `resolve.alias` block in `packages/viz/vite.config.ts`
  are deleted.
