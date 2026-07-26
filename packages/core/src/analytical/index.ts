/**
 * `core/analytical` — the closed-form Barney / CIBSE up-peak round trip time.
 *
 * This module is the project's **primary correctness oracle**. Under pure up-peak the
 * simulator's interval and handling capacity must match these numbers within a few percent;
 * when they do not, the presumption is that the simulation is wrong (`CLAUDE.md`
 * § Correctness oracle, `docs/05-roadmap.md` Phase 2 acceptance).
 *
 * It is therefore **independent of the simulation by construction**. Nothing here imports
 * the kernel, the model, the physics or the dispatcher — not even to reuse a motion
 * profile. The only imports are *types* from `config/`, describing the building under
 * analysis. Every function is pure: no RNG, no wall clock, no mutation.
 *
 * ```ts
 * import { analyzeUpPeak } from '@elevator-sim/core';
 *
 * const config = await loadConfig('data');
 * const analysis = analyzeUpPeak(
 *   config.buildingsById.get('midtown-office')!,
 *   config.elevatorSpecs,
 * );
 *
 * analysis.result.roundTripTimeS;        // 149.54 s
 * analysis.result.intervalS;             // 37.39 s
 * analysis.result.handlingCapacity5Min;  // 102.71 persons / 5 min
 * analysis.result.percentPopulation5Min; //   6.01 %
 * ```
 *
 * Three things to read before trusting a comparison against it:
 *
 * - {@link CLOSED_FORM_ASSUMPTIONS} — every simplification the closed form makes, as data,
 *   each with the direction it biases RTT. Phase 2 asks for agreement "within a few
 *   percent", which is only meaningful once the disagreements are enumerated in advance.
 * - {@link CLOSED_FORM_COMPARISON_RULE} — "a simulated RTT below the closed form means the
 *   simulation is wrong", stated with the precondition that makes it sound. The closed form
 *   is one-sided in its travel and stop terms but not in its load, so the comparison must
 *   be made at the passengers-per-trip the simulator actually carried. Applied without that
 *   scope the rule fails on the shoulders of the mandated rise-and-fall template, where
 *   part-full cars give a correct simulator an RTT legitimately below the closed form.
 * - `UpPeakAnalysis.warnings` — where the specific building strays from that model:
 *   a second entrance, non-uniform floor populations, an express zone, a heterogeneous
 *   group, or destinations that are transfer floors feeding a further bank (which makes the
 *   default population `%POP` is measured against the wrong one).
 *
 * The closed form predicts a mean interval and a handling capacity. It cannot predict AWT,
 * WT95 or `% > 60 s` — it has no queueing model and no variance at all. Those metrics have
 * no analytical baseline and must be validated another way.
 */

export {
  expectedStops,
  handlingCapacity5Min,
  highestReversalFloor,
  interval,
  percentPopulation,
  roundTripTime,
} from './roundTripTime.js';

export { analyzeUpPeak, deriveUpPeakTerms, passengerTransferSecondsFor } from './upPeak.js';

export {
  ANALYTICAL_DEFAULTS,
  ANALYTICAL_ERROR_CODES,
  ANALYTICAL_PARAMETERS,
  AnalyticalError,
  CLOSED_FORM_ASSUMPTIONS,
  CLOSED_FORM_COMPARISON_RULE,
  HANDLING_CAPACITY_WINDOW_S,
  IMPLAUSIBLE_PERCENT_POPULATION_5MIN,
  UP_PEAK_WARNING_CODES,
} from './types.js';

export type {
  AnalyticalErrorCode,
  AnalyticalParameterSpec,
  AnalyticalParameterType,
  ClosedFormAssumption,
  ClosedFormBias,
  ClosedFormComparisonRule,
  ResolvedRoundTripTerms,
  RoundTripResult,
  RoundTripTerms,
  StopTimeBreakdown,
  UpPeakAnalysis,
  UpPeakOptions,
  UpPeakTerms,
  UpPeakWarning,
  UpPeakWarningCode,
} from './types.js';
