/**
 * The `SimulationConfig` the viewer's **Run** button builds.
 *
 * ## Why this is a function and not a literal inside `runOnce`
 *
 * It was a literal until T75, and the literal is what made `DECISIONS.md` § D153's
 * known-limitation unfixable-without-noticing: *"the browser viewer still cannot enable a
 * selector … a selecting profile is refused there **by name** rather than run."* The seam that was
 * missing is one field — `SimulationConfig.dispatcherProfiles`, the whole of
 * `data/dispatcher-profiles.json` rather than the one profile being dispatched with — and a field
 * missing from a literal inside a DOM handler cannot be tested for, because the handler needs a
 * document, a canvas and a click.
 *
 * So the decision *what a viewer run is* moved out here, where a test asserts it against the same
 * function `main.ts` calls, and `runOnce` kept only the parts that are genuinely about the page:
 * reading the inputs, and drawing what came back. `batch/runBatch.ts` and `campaign/stageRun.ts`
 * already had their config builders factored out this way; this is the third and last.
 *
 * ## What it does not do
 *
 * It does not turn a selector **on**. All twelve shipped profiles keep `selection.policy` at
 * `off`, under which `resolveWeightSets` returns before reading a field of the derived library —
 * so supplying the file is byte-identical to omitting it, which `viewerSelector.test.ts` asserts
 * as *the same record*, not as the same statistics. What it makes possible is a reader **opting
 * in as data** (CLAUDE.md invariant 7): six scalars in `data/dispatcher-profiles.json`, no flag,
 * and the same opt-in that already works for `elevator-sim run`.
 */

import type { DispatcherProfile, ResolvedBuilding, SimulationConfig } from '@elevator-sim/core/browser';

import type { BrowserResources } from './data.js';

/** What the page contributes: the two selections, the seed and the duration. */
export interface ViewerRunInput {
  /** The building as it will be simulated — shipped or edited, already resolved. */
  readonly building: ResolvedBuilding;
  readonly dispatcherProfile: DispatcherProfile;
  readonly seed: bigint;
  readonly durationS: number;
}

export function viewerRunConfig(
  resources: BrowserResources,
  input: ViewerRunInput,
): SimulationConfig {
  return {
    building: input.building,
    dispatcherProfile: input.dispatcherProfile,
    trafficProfiles: resources.trafficProfiles,
    elevatorSpecs: resources.elevatorSpecs,
    /**
     * The file the profile came from, beside the profile — § D153, and the field this module
     * exists to stop being forgotten.
     *
     * `Simulation` derives the weight-set library from it through `weightSetSourceFrom`, which is
     * the only path by which a profile's `selection.policy` can be honoured rather than refused.
     * Supplied unconditionally: the derivation is total and cheap, and under `off` nothing reads
     * it.
     */
    dispatcherProfiles: resources.dispatcherProfiles,
    seed: input.seed,
    durationS: input.durationS,
    /**
     * `report`, not the kernel's default `throw`.
     *
     * At the shipped traffic rates, Mixed-Use High-Rise, Secure Tower and Vertical City
     * routinely end a 900 s run with people still in the system, and `Simulation` treats that
     * as a failed run — correctly, because a mean over a system that never cleared is the
     * confident nonsense this project exists to avoid. But under `throw` there is no recording
     * at all, so pressing **Run** on three of the five shipped buildings produced an error
     * message and an empty canvas rather than the playback UX.md RV-01 promises.
     *
     * `report` gives the viewer the recording it has to be able to draw, and the run's
     * `timed-out` status and undelivered count now lead the canvas banner as well as the
     * status line — UX.md RV-16. Nothing about the statistics moves: `awtIsValid` still comes
     * from the summary and still suppresses every mean, in the header and in the overlay.
     */
    onTimeout: 'report',
  };
}
