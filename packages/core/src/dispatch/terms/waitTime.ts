/**
 * `waitTime` — estimated wait for the new passenger. Serves AWT.
 *
 * The raw value is `estimateCost().etaSeconds`: seconds from now until the car is levelled at
 * the call floor, having served every committed stop it reaches first, with the real
 * jerk-limited travel time between them and the real door time (open + dwell + close, dwell
 * including the passenger-transfer term) at each. It is **not** `distance / ratedSpeed` —
 * that error is what makes a naive simulator conclude faster elevators always help
 * (docs/02-elevator-reference.md § Motion parameters).
 *
 * ## What it deliberately excludes
 *
 * The time the passenger has *already* waited. That is a different quantity serving a
 * different metric: a term that mixed the two would make an old call cheap for every car at
 * once, which moves nobody, whereas an escalating penalty on the longest-waiting call moves
 * exactly the right one. It is the `starvation` term, and it lands in Phase 5.
 *
 * Pure. Reads only the shared estimate.
 */

import type { CostTermDefinition, TermContext } from '../types.js';

/** Seconds until the car reaches the call floor. `Infinity` never reaches here: stage 2 filters it. */
export function waitTimeSeconds(context: TermContext): number {
  return Math.max(0, context.estimate.etaSeconds);
}

/**
 * `waitTime: 1.0` alone is the ETA dispatcher, and with the `noDirectionReversal` hard
 * constraint it is conventional collective. Both are rows in
 * `data/dispatcher-profiles.json`, neither is a class.
 */
export const waitTimeTerm: CostTermDefinition = Object.freeze({
  id: 'waitTime',
  unit: 's',
  measures: 'Estimated wait for the new passenger',
  normalization: Object.freeze({ mode: 'saturating', scale: 'waitTimeS' } as const),
  evaluate: waitTimeSeconds,
});
