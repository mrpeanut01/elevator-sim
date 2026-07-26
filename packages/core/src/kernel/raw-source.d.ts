/**
 * Vite/vitest `?raw` imports — the file's own text, as a string.
 *
 * The kernel's source-invariant tests scan their own source. Reading it with `node:fs` would
 * make `core/` depend on Node ambient types (`node:fs`, `URL`, `import.meta.url`), which this
 * package's tsconfig deliberately does not provide: `lib` is `["ES2022"]` and no `types` are
 * declared, so those references fail `tsc -b` with TS2591/TS2304/TS2339 and take the whole
 * build graph down with them.
 *
 * The `?raw` loader supplies the same text with none of that: no Node globals, no
 * `import.meta`, and it type-checks under `lib: ["ES2022"]` alone. It is a test-only
 * mechanism; no kernel source file uses it.
 */
declare module '*?raw' {
  const content: string;
  export default content;
}
