/**
 * Types for `rehearse-revert.mjs`, so that `validation/rehearseRevert.test.ts` can import the pure
 * functions under `tsc -b` without `allowJs`.
 *
 * The script is plain JavaScript for `dead-page.d.mts`'s reason: it is an *operator's* tool, run
 * during an incident or a rehearsal from a checkout that may have installed nothing and built
 * nothing, so it may not depend on a build. This file is the one place its shapes are written down
 * and it is kept beside the script rather than beside the test — a declaration next to the test
 * would describe what the test wishes the script exported, and the test would then pass against a
 * script that had drifted.
 */

/** One thing the rehearsal looked at, and what it saw. */
export interface Observation {
  /** A stable name, so a failing line can be cited from a document. */
  readonly id: string;
  /** What `docs/16` § 11 asserts about this step, in the document's own terms. */
  readonly claim: string;
  /** What the run actually saw. Written even when the observation held. */
  readonly observed: string;
  /** Whether the claim held. */
  readonly ok: boolean;
}

/** A `SESSION_SCHEMA_VERSION` move across a range. `from` is the target's side. */
export interface SchemaBump {
  readonly from: number | undefined;
  readonly to: number | undefined;
}

/**
 * What this harness does not rehearse, in the order `docs/16` § 11.5 lists them.
 *
 * Printed by {@link summaryOf} on every run, including a clean one. The failure this script could
 * have is its own output reading as a full rehearsal.
 */
export const NOT_REHEARSED: readonly string[];

/**
 * The pathspecs a reverted tree is compared over, derived from `deploy-viz.yml`'s own `paths:`.
 *
 * Throws rather than returning a short list: a comparison over an empty pathspec set passes by
 * looking at nothing.
 */
export function artifactPathspecsOf(workflowYaml: string): readonly string[];

/** Every `SESSION_SCHEMA_VERSION` move a `git diff` of `persist/types.ts` carries. */
export function schemaBumpsOf(diffText: string): readonly SchemaBump[];

/**
 * Whether reverting across these bumps costs a player their saved week.
 *
 * Both sides are required: one alone is the constant arriving or leaving, and reporting that as a
 * crossing would make the harness cry wolf on the observation an operator must not learn to ignore.
 */
export function crossesSaveSchema(bumps: readonly SchemaBump[]): boolean;

/** The ten characters the built page shows, matching `vite.config.ts#buildVersion`. */
export function buildVersionOf(sha: string): string;

/** Why a rehearsal failed, in the order the observations were taken. Empty means it held. */
export function issuesOf(observations: readonly Observation[]): readonly string[];

/** The lines the run prints, including {@link NOT_REHEARSED}. */
export function summaryOf(
  observations: readonly Observation[],
  issues: readonly string[],
): string;
