/**
 * Types for `workflowMatrix.mjs`, so that `validation/ciWorkflowMatrix.test.ts` can import the
 * guard under `tsc -b` without `allowJs`.
 *
 * The guard is plain JavaScript on purpose — `node infra/checks/workflowMatrix.mjs` has to answer
 * "is the Linux leg still x86-64?" on a tree where `npm ci` is what broke, which is the same
 * argument `scripts/blocked-by.d.mts` makes for its own script. This file is the one place the
 * guard's shapes are written down, and it is kept beside the guard rather than beside the test so
 * that a drifted module fails the typecheck instead of quietly satisfying a wish list.
 */

import type { YamlValue } from './miniYaml.mjs';

/** Absolute path to the workflow this guard reads. */
export const CI_WORKFLOW_PATH: string;

/** The job that carries the matrix. */
export const MATRIX_JOB: string;

/** The architecture `docs/15` § 0.2 requires of a Linux leg. */
export const REQUIRED_LINUX_ARCH: string;

/** GitHub-hosted labels that are x86-64 Linux. The `-arm` labels are absent on purpose. */
export const GITHUB_HOSTED_X86_LINUX: ReadonlySet<string>;

/** Labels GitHub hosts itself, on any platform. */
export const GITHUB_HOSTED: ReadonlySet<string>;

/** Every violation of the properties `ci.yml` states about itself, rather than only the first. */
export function findWorkflowViolations(workflow: Record<string, YamlValue>): string[];

/** Read and check the repository's own `ci.yml`. */
export function checkCiWorkflow(path?: string): string[];

/** Render a run's verdict, as the standalone entry point prints it. */
export function summaryOf(violations: readonly string[]): string;
