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

/** Where the session schema version this procedure can destroy is declared. */
export const SESSION_TYPES: string;

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

/** A commit as `git log --format="%H<sep>%P"` reports it: its sha and its parents' shas. */
export interface LoggedCommit {
  readonly sha: string;
  readonly parents: readonly string[];
}

/** One `git revert` invocation {@link planRevertSteps} plans for a single commit. */
export interface RevertStep {
  readonly sha: string;
  readonly isMerge: boolean;
  readonly args: readonly string[];
}

/** Which of GitHub issue #540's history problems a target has, or none. */
export interface HistoryProblem {
  readonly blocked: boolean;
  readonly reason: 'shallow-history' | 'unknown-revision' | 'not-an-ancestor' | null;
}

/** The result of {@link safeRevertTo}. */
export type SafeRevertResult =
  | {
      readonly ok: true;
      readonly revertSha: string;
      readonly stepCount: number;
      readonly merges: readonly string[];
    }
  | { readonly ok: false; readonly reason: string; readonly detail: string };

/** Whether a logged commit is a merge — see {@link planRevertSteps}. */
export function isMergeCommit(commit: LoggedCommit): boolean;

/** `git log --format="%H<sep>%P" target..tip` parsed into {@link LoggedCommit}s, newest first. */
export function parseCommitLog(logText: string, sep?: string): readonly LoggedCommit[];

/**
 * The ordered, one-commit-at-a-time `git revert` invocations that put the tree back to `target` —
 * never the ranged form, which is GitHub issue #540's first failure mode.
 */
export function planRevertSteps(commitsNewestFirst: readonly LoggedCommit[]): readonly RevertStep[];

/**
 * Distinguishes GitHub issue #540's second failure mode (a shallow checkout that never fetched
 * `target`) from a target that does not exist, and from one that is not an ancestor of `tip`.
 */
export function classifyHistoryProblem(observed: {
  readonly isShallow: boolean;
  readonly objectExistsLocally: boolean;
  readonly isAncestorOfTip: boolean;
}): HistoryProblem;

/** The message for a {@link classifyHistoryProblem} result, precise about which of the three it is. */
export function historyProblemMessage(problem: HistoryProblem, target: string, tip: string): string;

/**
 * Executes {@link planRevertSteps}'s plan against `cwd` for real: one `git revert --no-commit` per
 * commit, then a single `git commit` over the whole plan — the ranged form is never issued. On any
 * step's failure, aborts the sequencer, hard-resets to the commit `cwd` started on, and cleans, so
 * a partial revert is never committed. `identityArgs` is prepended to the commit invocation.
 */
export function safeRevertTo(
  cwd: string,
  target: string,
  tip: string,
  commitMessage?: string,
  identityArgs?: readonly string[],
  revertRunner?: (cwd: string, args: readonly string[]) => { readonly code: number; readonly output: string },
): SafeRevertResult;

/** Why a rehearsal failed, in the order the observations were taken. Empty means it held. */
export function issuesOf(observations: readonly Observation[]): readonly string[];

/** The lines the run prints, including {@link NOT_REHEARSED}. */
export function summaryOf(
  observations: readonly Observation[],
  issues: readonly string[],
): string;
