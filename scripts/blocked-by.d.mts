/**
 * Types for `blocked-by.mjs`, so that `validation/blockedBy.test.ts` can import the pure functions
 * under `tsc -b` without `allowJs`.
 *
 * The script is plain JavaScript on purpose — `review.yml`'s gates job and this one's workflow run
 * it with `node` and no install, so it may not depend on a build. This file is the one place its
 * shapes are written down, and it must be kept beside the script rather than beside the test: a
 * declaration next to the test would describe what the test wishes the script exported, and the
 * test would then pass against a script that had drifted.
 */

/** What the check reads from GitHub's issues endpoint, reduced to the fields it uses. */
export interface OpenIssue {
  readonly number: number;
  readonly title: string;
  readonly body: string | null | undefined;
}

/** A comment already on an issue, reduced to the one field the marker lives in. */
export interface IssueComment {
  readonly body: string | null | undefined;
}

/** An open issue with at least one declared blocker that has closed. */
export interface Unblocked {
  readonly number: number;
  readonly title: string;
  /** Declared blockers GitHub reports closed. */
  readonly closed: readonly number[];
  /** Declared blockers that are open, or could not be fetched. */
  readonly stillOpen: readonly number[];
}

/** An unblocked issue that has not yet been told about at least one of its closed blockers. */
export interface ToComment extends Unblocked {
  readonly newlyClosed: readonly number[];
}

export interface Report {
  /** `Blocked by #N` lines found across every open issue body. */
  readonly declarations: number;
  readonly floor: number;
  /** The vacuity verdict, and nothing else: false only when `declarations < floor`. */
  readonly ok: boolean;
  readonly unblocked: readonly Unblocked[];
  readonly toComment: readonly ToComment[];
}

export const DECLARATION: RegExp;
export const VACUITY_FLOOR: number;
export function declaredBlockersOf(body: string | null | undefined): number[];
export function unblockedOf(openIssues: readonly OpenIssue[], closedIds: ReadonlySet<number>): Unblocked[];
export function markerFor(blockerId: number): string;
export function alreadyReported(comments: readonly IssueComment[], blockerId: number): boolean;
export function commentBodyFor(entry: Unblocked, newlyClosed: readonly number[]): string;
export function reportOf(
  openIssues: readonly OpenIssue[],
  closedIds: ReadonlySet<number>,
  commentsByIssue?: ReadonlyMap<number, readonly IssueComment[]>,
): Report;
export function summaryOf(
  report: Report,
  options?: { readonly unknownBlockers?: readonly number[]; readonly dryRun?: boolean },
): string;
