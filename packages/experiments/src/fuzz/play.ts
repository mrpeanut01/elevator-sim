/**
 * **The adversarial persona's properties: a verb log, replayed on a stage, and judged.**
 *
 * The spec's three pillar-anchored properties, scoped to what this package can honestly see, plus
 * the six building properties (`properties.ts`) asked again under the verb log. Each is a predicate
 * over a finished session and each is **re-derived from the trace and the record**, never read back
 * off the summary it is checking, which is `properties.ts`'s header rule.
 *
 * ## What a clean run here means, and what it does not
 *
 * **No player can press any of these verbs on a Scenario stage.** A stage from `data/campaign.json`
 * is played in the viewer's `everyday/stagePlayScreen.ts`, which judges a *move* (a shipped profile
 * plus dial edits, priced against the rung) and replays replication 0 for its watch step; the seven
 * verbs are offered only on the live day screen (`everyday/stageScreen.ts`), whose contexts are Career
 * days, Rush, the daily crowd and Watch. So on a Scenario stage this family is an **engine stress
 * test on that stage's building and crowd**, not a replay of a player's session, and a green run says
 * that the engine survives these logs on this tower. It does not say that players cannot break the
 * stage, because players cannot press anything here at all. The command prints that sentence in its
 * header for the same reason.
 *
 * ## The properties
 *
 * - **P-PLAY-1, `no-softlock`, at the engine.** The session runs to its horizon: no throw, no
 *   `ModelError`, no refused report, no exhausted event budget, and a summary a verdict can be formed
 *   from (a valid mean that is a number, or a refusal that names its ground and says why). The engine
 *   declines no part of a log the generator built legally (a warning that an `interventions[…]`
 *   entry or effect was *not scheduled* is a finding; a disclaimer that a switch kept the run's own
 *   passenger model is the documented design and is not). And the six building properties, P5 (deadlock) and P6 (starvation) among them with
 *   their saturation escape unchanged, hold under the log; they report under their own names.
 *
 *   **Named gap.** The spec's screen half, *no available next verb*, is decided by the viewer's
 *   `live/interventions.ts` and `everyday/stageScreenModel.ts` (`stageInterventionsOf`), which this
 *   package cannot call. It is not rebuilt here, because a second copy of the screen's offer would be
 *   exactly the two-sources defect this repository keeps finding.
 * - **P-PLAY-2, `readable-verdict`.** Whenever any of `awtIsValid`'s five grounds holds, recounted
 *   from the record (saturation, an empty window, censoring above the unserved limit, abandonment
 *   above its limit, a leg past the 900 s horizon), the summary publishes no mean. The limits are
 *   `core`'s published defaults, and the session sets no `summarize` override, so they are the limits
 *   the summary was taken under. Saturation is re-run through `core`'s own `detectSaturation` over the
 *   record's queue series, so what this ground can catch is a summary that ignored its detector, not a
 *   detector that is wrong. The bound is the finding and never the obstacle (`fuzz-1001074`).
 * - **P-PLAY-3, `reachable-goal`.** Every stage carries `beat-the-baseline`, judged on a paired
 *   interval between the stage's own setting and the player's, over the stage's own crowds. What this
 *   package can check without the viewer's goal readers is whether a session can be *paired* at all:
 *   the verb log must leave the crowd exactly as it was (the trace digest equals the empty log's on
 *   the same replication), and a session that publishes a valid verdict must publish every figure that
 *   comparison is taken on (AWT, WT95, mean time to destination) as a number. A valid verdict whose
 *   comparison has nothing to pair is the stranding the spec names.
 *
 *   **Named gap.** The count goals (`deliver-everyone`, `answer-the-demand`, `long-waits-under`,
 *   `no-divergence`, `nobody-abandoned`) are judged by the viewer's `scenario/goals.ts#measureGoalRate`
 *   and whether a batch's rows resolve by its `batch/report.ts`. Neither is reimplemented here.
 *   Stage 1 carries only `beat-the-baseline`, which `scenario/goals.ts` classes batch-only, so on
 *   stage 1 there is no per-run goal reader to drive and the check above is the whole of what the goal
 *   asks of a single session.
 *
 * The decisions here bind nothing outside `fuzz/` and are recorded in this docstring, per § D405.
 */

import {
  AWT_INVALID_GROUNDS,
  DEFAULT_MAX_ABANDONMENT_FRACTION,
  DEFAULT_MAX_UNSERVED_FRACTION,
  DEFAULT_MAX_WAIT_HORIZON_S,
  DISPATCH_DEFAULTS,
  SATURATION_DEFAULTS,
  SimulationError,
  detectSaturation,
  queueLengthSeries,
  runSimulation,
  type AuctionPolicyOptions,
  type DispatchPolicy,
  type DispatcherProfile,
  type RunInterventionConfig,
  type SimulationConfig,
  type SimulationResult,
} from '@elevator-sim/core';

import { metricOf, type ReplicationMetric } from '../runner/metrics.js';
import { traceDigest } from '../runner/replication.js';
import { checkAll, type PropertyContext } from './properties.js';
import { stageSessionConfigFor } from './stageSession.js';
import { PROPERTY_BOUNDS, type FuzzProperty, type PropertyBounds } from './types.js';
import type { PlayCase, PlayContext } from './verbs.js';

/* -------------------------------------------------------------------------- *
 * Vocabulary
 * -------------------------------------------------------------------------- */

/** The three properties the spec adds. Ordered as it lists them. */
export const PLAY_PROPERTIES = [
  /** P-PLAY-1: the session reaches its horizon and a verdict can be formed from it. */
  'no-softlock',
  /** P-PLAY-2: no mean is published where any of the five refusal grounds holds. */
  'readable-verdict',
  /** P-PLAY-3: the session can be paired against the stage's own setting on the same crowd. */
  'reachable-goal',
] as const;

export type PlayProperty = (typeof PLAY_PROPERTIES)[number];

/** One failure. A building property keeps its own name, so a reader knows which rule broke. */
export interface PlayViolation {
  readonly property: PlayProperty | FuzzProperty;
  readonly message: string;
  readonly subject?: string | undefined;
}

/** One session's verdict and what it cost. */
export interface PlayOutcome {
  readonly case: PlayCase;
  readonly violations: readonly PlayViolation[];
  /** An exception that is not a property verdict. Always a finding as well. */
  readonly threw?: string | undefined;
  readonly status: string;
  readonly generatedPassengers: number;
  readonly simulatedSeconds: number;
  /** The session's own verdict, or `undefined` when it produced none. */
  readonly awtIsValid: boolean | undefined;
}

/**
 * Deliberate breakages, for the suite that proves each property can fail. Never set by the campaign
 * or the command: `fuzz.ts` ships no fault flag, for § D118's reason.
 */
export interface PlayFaults {
  /** `SimulationConfig.createPolicy`, forwarded: a policy that breaks dispatch and nothing else. */
  readonly createPolicy?:
    | ((profile: DispatcherProfile, options: AuctionPolicyOptions) => DispatchPolicy)
    | undefined;
  /** Rewrite the finished session before it is judged, as a defective summarizer would. */
  readonly interpose?: ((result: SimulationResult) => SimulationResult) | undefined;
}

/** The metrics `beat-the-baseline`'s comparison is taken on, as `experiments` projects them. */
const PAIRED_METRICS: readonly ReplicationMetric[] = ['awtS', 'wt95S', 'ttdMeanS'];

function messageOf(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/* -------------------------------------------------------------------------- *
 * P-PLAY-1
 * -------------------------------------------------------------------------- */

/** P-PLAY-1's engine half, over a finished session. The six building properties run beside it. */
export function checkNoSoftlock(result: SimulationResult): PlayViolation[] {
  const violations: PlayViolation[] = [];
  const fail = (message: string): void => {
    violations.push({ property: 'no-softlock', message });
  };
  if (result.status === 'aborted') {
    fail(`the session exhausted its event budget after ${String(result.events)} events and never reached its horizon`);
  }
  const { summary } = result;
  if (typeof summary.awtIsValid !== 'boolean') fail('the summary carries no verdict at all');
  if (summary.awtIsValid) {
    if (!Number.isFinite(summary.waiting.meanS)) {
      fail(`the summary calls its mean valid and the mean is ${String(summary.waiting.meanS)}`);
    }
  } else {
    if (typeof summary.awtInvalidReason !== 'string' || summary.awtInvalidReason === '') {
      fail('the summary refuses its mean and does not say why');
    }
    if (summary.awtInvalidGround === undefined || !AWT_INVALID_GROUNDS.includes(summary.awtInvalidGround)) {
      fail(`the summary refuses its mean on ground "${String(summary.awtInvalidGround)}", which core does not declare`);
    }
  }
  /*
   * A **refusal** is a warning that says an entry or an effect was *not scheduled*: `Simulation`'s
   * deadline, before-the-press and fixed-range grounds all say so in those words, and the generator
   * builds none of them, so one here means the generator and the engine disagree about what is
   * legal. A **disclaimer** is a different thing that travels in the same list: a switch to a profile
   * of the other passenger model is applied (its weights) and the run says it kept its own model,
   * which is the documented design rather than a decline. The first draft of this check read both
   * as refusals, and the deep tier's first run found 38 of them, every one that disclaimer.
   */
  for (const warning of result.warnings) {
    if (/^interventions\[\d+\]/u.test(warning) && /not scheduled/u.test(warning)) {
      fail(`the engine declined part of a log the generator built as legal: ${warning}`);
    }
  }
  return violations;
}

/* -------------------------------------------------------------------------- *
 * P-PLAY-2
 * -------------------------------------------------------------------------- */

/**
 * The five refusal grounds, recounted from the record, as sentences — empty when none holds.
 *
 * Exported so the suite can show each ground firing on a real run rather than on a hand-built one.
 */
export function refusalGroundsOf(result: SimulationResult): string[] {
  const { record, summary } = result;
  const window = summary.window;
  const inWindow = (at: number): boolean => at >= window.startS && at < window.endS;
  const legs = record.passengers.filter((leg) => inWindow(leg.arrivedAt));
  const grounds: string[] = [];

  const recorded = record.queueSamples.filter((sample) => inWindow(sample.at));
  const useRecorded = recorded.length >= SATURATION_DEFAULTS.minSamples;
  const series = useRecorded ? record.queueSamples : queueLengthSeries(record.passengers, { window });
  const saturation = detectSaturation(series, { window, source: useRecorded ? 'recorded' : 'derived' });
  if (saturation.saturated) {
    grounds.push(
      `saturated: the queue rose ${saturation.projectedGrowthPersons.toFixed(1)} persons over the window at ${saturation.slopePersonsPerMinute.toFixed(2)}/min`,
    );
  }

  const served = legs.filter((leg) => leg.boardedAt !== undefined).length;
  if (served === 0) grounds.push(`empty-window: none of the ${String(legs.length)} arrivals in the window boarded`);

  if (legs.length > 0) {
    const abandoned = legs.filter((leg) => leg.abandonedAt !== undefined).length;
    if (abandoned / legs.length > DEFAULT_MAX_ABANDONMENT_FRACTION) {
      grounds.push(`abandoned: ${String(abandoned)} of ${String(legs.length)} arrivals in the window left`);
    }
    const unserved = legs.length - served;
    if (unserved / legs.length > DEFAULT_MAX_UNSERVED_FRACTION) {
      grounds.push(`censored: ${String(unserved)} of ${String(legs.length)} arrivals in the window never boarded`);
    }
  }

  for (const leg of legs) {
    const endedAt = leg.boardedAt ?? leg.abandonedAt ?? leg.refusedAt ?? leg.strandedAt ?? record.endedAt;
    const waitS = Math.max(0, endedAt - leg.arrivedAt);
    if (waitS > DEFAULT_MAX_WAIT_HORIZON_S) {
      grounds.push(
        `starved: leg "${leg.passengerId}" (${leg.originFloorId} to ${leg.destinationFloorId}) waited ${waitS.toFixed(1)} s, past the ${String(DEFAULT_MAX_WAIT_HORIZON_S)} s horizon`,
      );
      break;
    }
  }
  return grounds;
}

/** P-PLAY-2: a mean published as valid while a refusal ground holds. */
export function checkReadableVerdict(result: SimulationResult): PlayViolation[] {
  if (!result.summary.awtIsValid) return [];
  return refusalGroundsOf(result).map((ground) => ({
    property: 'readable-verdict' as const,
    message: `the summary publishes a mean of ${result.summary.waiting.meanS.toFixed(1)} s as valid while a refusal ground holds on the record: ${ground}`,
  }));
}

/* -------------------------------------------------------------------------- *
 * P-PLAY-3
 * -------------------------------------------------------------------------- */

/** P-PLAY-3: the session can be paired against the empty log on the same replication. */
export function checkReachableGoal(session: SimulationResult, baseline: SimulationResult): PlayViolation[] {
  const violations: PlayViolation[] = [];
  const sessionDigest = traceDigest(session.trace);
  const baselineDigest = traceDigest(baseline.trace);
  if (sessionDigest !== baselineDigest) {
    violations.push({
      property: 'reachable-goal',
      message: `the verb log changed the crowd: trace digest ${sessionDigest} against the empty log's ${baselineDigest} on the same replication, so the stage's comparison would pair two different populations`,
    });
  }
  if (session.summary.awtIsValid) {
    for (const metric of PAIRED_METRICS) {
      const value = metricOf(session.summary, metric);
      if (Number.isFinite(value)) continue;
      violations.push({
        property: 'reachable-goal',
        message: `the session publishes a valid verdict and its ${metric} is ${String(value)}, so the paired comparison the stage's goal is judged on has nothing to pair`,
      });
    }
  }
  return violations;
}

/* -------------------------------------------------------------------------- *
 * Running sessions
 * -------------------------------------------------------------------------- */

/**
 * Sessions on one stage, with the empty-log baseline of each replication run once and kept.
 *
 * The baseline is the stage's own run on that crowd. It is what P-PLAY-3 pairs against and what
 * P-DESIGN-1 ranks against, so it is computed once per replication rather than once per case.
 */
export class PlaySessions {
  readonly #baselines = new Map<number, SimulationResult>();

  constructor(
    readonly context: PlayContext,
    readonly bounds: PropertyBounds = PROPERTY_BOUNDS,
  ) {}

  /** The config one session runs as. Exported through this method so a case can be re-run by hand. */
  configFor(log: readonly RunInterventionConfig[], replication: number, faults: PlayFaults = {}): SimulationConfig {
    const config = stageSessionConfigFor(this.context.stage, this.context.resources, replication, log);
    return faults.createPolicy === undefined ? config : { ...config, createPolicy: faults.createPolicy };
  }

  /** The stage's own run on replication `replication`, with no verb pressed. */
  baseline(replication: number): SimulationResult {
    const cached = this.#baselines.get(replication);
    if (cached !== undefined) return cached;
    const result = this.run([], replication);
    this.#baselines.set(replication, result);
    return result;
  }

  /** One session's run, unjudged: what P-DESIGN-1 ranks. Throws as `runSimulation` throws. */
  run(log: readonly RunInterventionConfig[], replication: number): SimulationResult {
    return runSimulation(this.configFor(log, replication));
  }

  /** Run one case and check all nine properties against it. Never throws for a case-level problem. */
  evaluate(playCase: PlayCase, faults: PlayFaults = {}): PlayOutcome {
    const own: PlayViolation[] = [];
    let result: SimulationResult | undefined;
    let threw: string | undefined;
    try {
      result = runSimulation(this.configFor(playCase.log, playCase.replication, faults));
    } catch (error) {
      if (error instanceof SimulationError && error.result !== undefined) {
        // A refused report is a softlock with a body attached: the rest is still checked on it.
        result = error.result;
        own.push({ property: 'no-softlock', message: `the session refused to report: ${messageOf(error)}` });
      } else {
        threw = messageOf(error);
        own.push({ property: 'no-softlock', message: `the session threw: ${threw}` });
      }
    }
    if (result !== undefined && faults.interpose !== undefined) result = faults.interpose(result);
    if (result === undefined) {
      return {
        case: playCase,
        violations: Object.freeze(own),
        threw,
        status: 'threw',
        generatedPassengers: 0,
        simulatedSeconds: 0,
        awtIsValid: undefined,
      };
    }

    const opening = this.context.resources.openingProfile;
    const propertyContext: PropertyContext = {
      case: { callType: opening.dispatch?.callType ?? DISPATCH_DEFAULTS.callType },
      building: this.context.resources.building,
      dispatcherProfile: opening,
      elevatorSpecs: this.context.resources.elevatorSpecs,
      result,
      bounds: this.bounds,
      // The log's effects, in log order: the schedule the run carried beyond the building's own.
      serviceSchedule: playCase.log.flatMap((entry) => ('serviceEvents' in entry.change ? entry.change.serviceEvents : [])),
    };
    const violations: PlayViolation[] = [
      ...own,
      ...checkNoSoftlock(result),
      ...checkAll(propertyContext),
      ...checkReadableVerdict(result),
      ...checkReachableGoal(result, this.baseline(playCase.replication)),
    ];
    return {
      case: playCase,
      violations: Object.freeze(violations),
      threw,
      status: result.status,
      generatedPassengers: result.trace.passengerCount,
      simulatedSeconds: result.record.endedAt - result.record.startedAt,
      awtIsValid: result.summary.awtIsValid,
    };
  }
}

/** Whether an outcome is a finding: a violated property, or an exception. */
export function isPlayFailure(outcome: PlayOutcome): boolean {
  return outcome.violations.length > 0 || outcome.threw !== undefined;
}
