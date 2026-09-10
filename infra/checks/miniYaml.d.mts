/**
 * Types for `miniYaml.mjs`, so that `validation/ciWorkflowMatrix.test.ts` can import the reader
 * under `tsc -b` without `allowJs`.
 *
 * The reader is plain JavaScript on purpose — it must be runnable by `node` with nothing installed,
 * because its whole subject is a file that decides whether `npm ci` even happens. This file is the
 * one place its shapes are written down, and it is kept beside the reader rather than beside the
 * test for the reason `scripts/blocked-by.d.mts` gives: a declaration next to the test would
 * describe what the test wishes the module exported, and the test would then pass against a module
 * that had drifted.
 */

/** Every value this reader can produce. Numbers stay strings on purpose — see the module docstring. */
export type YamlValue = string | boolean | null | YamlValue[] | { [key: string]: YamlValue };

/**
 * Parse a single-document YAML subset into plain JavaScript values.
 *
 * Throws on any construct it does not fully support, which is the only property that matters: a
 * reader that silently returns `undefined` turns every assertion downstream into a vacuous pass.
 */
export function parseYaml(source: string): Record<string, YamlValue>;
