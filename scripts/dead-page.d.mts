/**
 * Types for `dead-page.mjs`, so that `validation/deadPage.test.ts` can import the pure functions
 * under `tsc -b` without `allowJs`.
 *
 * The script is plain JavaScript for `blocked-by.d.mts`'s reason, restated because it is the whole
 * argument for the file existing: `deploy-viz.yml` runs it with `node` immediately after an upload,
 * in a job that has checked out the tree and installed nothing, so it may not depend on a build.
 * This file is the one place its shapes are written down and it is kept beside the script rather
 * than beside the test — a declaration next to the test would describe what the test wishes the
 * script exported, and the test would then pass against a script that had drifted.
 */

/** One thing that was fetched, reduced to what the check reads. */
export interface Fetched {
  /** The path as it appears on the site, leading slash included — `/`, `/assets/index-abc.js`. */
  readonly path: string;
  /** The HTTP status, or `0` where the request itself did not complete. */
  readonly status: number;
  /** The `content-type` header, lower-cased and without its parameters, or `''` where absent. */
  readonly contentType: string;
  /** The body, where the check needs to read it. Omitted for assets, which are checked by header. */
  readonly body?: string | undefined;
}

/** Everything one probe of a deployed site produced. */
export interface PageProbe {
  /** The site's own origin, for the message only. */
  readonly origin: string;
  /** `GET /`. */
  readonly page: Fetched;
  /**
   * The API origin this deploy expects the served page to declare, or `''` when unarmed.
   *
   * The same value `deploy-viz.yml` asserts against the artifact **before** the upload. Asserting
   * it again against what is served is the point: `docs/16` § 11 step 4 is *verify what is served,
   * not what the run said*, and a green run is a report about an upload.
   */
  readonly expectedApiOrigin: string;
  /** Every script and stylesheet the served page references, fetched. */
  readonly assets: readonly Fetched[];
  /** The data manifest and every other data document the site serves at its root, fetched. */
  readonly data: readonly Fetched[];
}

/** Why a served page is dead, in the order the checks run. Empty means the page is alive. */
export function deadPageIssues(probe: PageProbe): readonly string[];

/** The same-origin paths the served page references — module scripts and stylesheets. */
export function assetPathsOf(html: string): readonly string[];

/** The API origin the served page declares, or `''` when it declares none. */
export function declaredApiOriginOf(html: string): string;

/**
 * The buildings a fetched `__buildings.json` actually carries, by name, or `[]`.
 *
 * An entry counts only when it has both a name and a body: the manifest holds whole building
 * documents inline (`packages/viz/vite.config.ts` assembles it from `data/buildings/*.json`,
 * because *"the viewer never fetches one: HTTP has no directory listing"*), so a list of names with
 * nothing under them is the same failure as a list with no names.
 */
export function manifestBuildingsOf(body: string | undefined): readonly string[];

/** The lines the run prints and writes to the job summary. */
export function summaryOf(probe: PageProbe, issues: readonly string[]): string;

/** The markers a served page must carry to be the application rather than a placeholder. */
export const SHELL_MARKERS: readonly string[];

/** How many assets are fetched, at most. A bundle with hundreds would otherwise be a spider. */
export const MAX_ASSETS: number;
