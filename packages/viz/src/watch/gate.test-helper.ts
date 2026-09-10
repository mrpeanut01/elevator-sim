/**
 * **The reproduction gate, composed and run synchronously** — for tests, and for tests only.
 *
 * ## Why this is a test helper and used to be shipped code
 *
 * `watch/library.ts` exported `checkedRun`: `watchGateBefore` and `watchGateAfter` composed around
 * a caller-supplied simulator. It existed because one shell ran the gate synchronously and the
 * other did not — GitHub issue #165 split the halves out so `dev/watchPanel.ts` could put its
 * simulation on a worker, and `everyday/host.ts#watchRun` kept calling the whole thing because
 * `EverydayHost.watchRun` returned a row and could not wait for one.
 *
 * Issue **#410** moved that shell too, so the composition lost its last non-test caller and was
 * deleted from `watch/library.ts` rather than left there — a behaviour reachable from nothing
 * outside its own tests is the defect CLAUDE.md's standing requirement is about, and § D131 closed
 * two of the deck API's five members the same way. What is kept here is the *convenience*: a dozen
 * cases across three files want the gate's answer in one expression and do not care that the
 * shipped product reaches it in two.
 *
 * **It is not the shipped path and no case may treat it as one.** The claim *the halves agree with
 * the composition* was worth asserting while two shells took two routes; it is not worth asserting
 * about a helper and its own definition, so `watch/record.test.ts`'s case that made it is gone and
 * says so where it stood.
 *
 * Recorded under [§ D405](../../../../DECISIONS.md): this helper serves the three suites that
 * import it and binds nothing else, so this docstring is the record the working agreement asks for.
 */

import type { SimulationConfig } from '@elevator-sim/core/browser';

import type { VizRecording } from '../contract/types.js';
import type { BrowserResources } from '../dev/data.js';
import type { ViewerState } from '../dev/state.js';

import { watchGateAfter, watchGateBefore, type CheckedRun } from './library.js';
import type { WatchableRun } from './types.js';

/**
 * The gate's verdict for `run`, with `simulate` used only if the row reaches a simulation.
 *
 * The two rows `watchGateBefore` settles — already blocked, or a record this build cannot read —
 * never call `simulate`, which is what lets a case hand in a thrower to assert that a refusal costs
 * no run.
 */
export function checkedRunForTest(
  run: WatchableRun,
  resources: BrowserResources,
  base: ViewerState,
  simulate: (config: SimulationConfig) => VizRecording,
): CheckedRun {
  const gate = watchGateBefore(run, resources, base);
  if (gate.kind === 'settled') return gate.checked;
  return watchGateAfter(run, simulate(gate.config));
}
