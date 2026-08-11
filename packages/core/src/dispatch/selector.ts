/**
 * **The weight-set selector** — the one mechanism behind two policies, and the reason a
 * dispatcher can now be changed mid-run.
 *
 * `docs/07-handoff.md` § 8's last row read *"a dispatcher or a zone cannot be changed mid-run"*.
 * The cause was one binding: `resolveDispatchConfig` froze a `weights` Map at construction and
 * `WeightedCostDispatchPolicy` handed exactly that Map to `scoreCar` on every decision, for the
 * life of the run. Two deferred pieces of scope needed that binding broken and neither could
 * break it alone:
 *
 * | Deferral | What it wants |
 * |---|---|
 * | Phase 7's undelivered bullet | a **fuzzy** traffic-pattern detector with hysteresis, driving per-pattern weight sets |
 * | Phase 6c — learned control | a **contextual** policy that selects among shipped weight vectors from observed traffic state |
 *
 * They are two policies over one mechanism: both observe traffic state and choose a weight
 * vector. Building the mechanism twice would make it two sources of truth about one question,
 * which is the failure `runner/metrics.ts`'s docstring names. So it is built once, here, and both
 * policies are **data** (CLAUDE.md invariant 7) — `selection.policy` names the rule,
 * `patternSwitching` in `data/dispatcher-profiles.json` names the arms and their signatures, and
 * nothing in this file mentions a profile id, a pattern name or a cost-term id.
 *
 * ## What it costs common random numbers: **nothing**
 *
 * `WAVE6_PLAN.md` § 7 names this as the lane's first risk, and it is the right one to name. A
 * selector that drew a random number would be a new consumer on the shared `StreamSet` and would
 * desynchronize every paired comparison in the project (CLAUDE.md invariant 2). So:
 *
 * - **Every function here is pure and draws nothing.** {@link selectWeightSet} is a function of
 *   the observation, the arm set and the previous state, and of nothing else.
 * - **No clock.** Time arrives as a `SimTime` argument, from the kernel (invariant 3).
 * - **The hysteresis state is explicit** — {@link SelectorState}, threaded in and out — rather
 *   than hidden in a closure, so it is part of deterministic simulation state and a replay is
 *   byte-identical (invariants 4 and 5). {@link ArrivalWindow} is the one mutable object, it is
 *   owned by the policy, and `WeightedCostDispatchPolicy.reset()` clears it with the lifecycles.
 * - **`selection.policy: 'off'` is the default**, and under it the policy never constructs an
 *   {@link ArrivalWindow}, never records an arrival and hands `config.weights` — the same frozen
 *   Map object — to the scorer. A non-selecting configuration is byte-identical by construction
 *   rather than by tolerance.
 *
 * ## The observation, and the one input that is not derivable
 *
 * `data/dispatcher-profiles.json` authored four detector inputs. Three of them are derivable from
 * what a group controller can see and are implemented as {@link SELECTOR_INPUTS}:
 *
 * | input | what it counts |
 * |---|---|
 * | `lobbyArrivalRate` | passengers newly waiting at the bank's **lowest served floor**, travelling up |
 * | `interfloorRate` | passengers newly waiting **above** it, travelling up |
 * | `downPeakRate` | passengers newly waiting **above** it, travelling down |
 *
 * all in passengers per second **per car**, over a trailing window of
 * `selection.observationWindowS`, so one authored membership map is not silently a fact about one
 * building's fleet size. The divisor is the whole window and not the elapsed time, so a run
 * begins with every rate at zero and climbs into its pattern — which is what a cold start *is*,
 * and which avoids a 0.5-second-old run reporting 20 passengers per second.
 *
 * The fourth authored input, `timeOfDay`, is **removed from the shipped detector rather than
 * faked**. `core/` has no wall clock (invariant 3) and the kernel's time is seconds since the
 * start of the run, not since midnight; every shipped operating point is a 900–3600 s window
 * from zero, so a `timeOfDay` derived from it would be a constant near zero dressed as a
 * feature. A declared detector input nothing can supply is precisely the *configured, validated,
 * dead* shape this repository has now shipped eleven times, one level up into data. If a
 * scenario ever carries a start-of-day, this is the file that gains the input.
 *
 * ## Why only the weights switch
 *
 * A weight set, and nothing else. Not `dispatch.callType`, not `dispatch.passengerAssignment`,
 * not the idle stage. Two of those decide the **passenger model**, and `core`'s own
 * `comparabilityOf` lists nine of twenty-three replication metrics as non-comparable across the
 * two models — a run that changed model at t = 600 s would produce a record whose metrics are
 * not comparable with *themselves*. The acceptance question for Phase 6c
 * (`DECISIONS.md` § D126) asks for selection among *the cost-term weight vectors already
 * shipped*, and that is exactly the surface this file switches.
 */

import {
  DAY_PERIOD_WINDOWS,
  RULE_ACTION_WORDS,
  RULE_CONDITION_WORDS,
  type RuleActionId,
  type RuleConditionId,
  type WeightSetPolicy,
} from '../config/types.js';
import type { SimTime } from '../kernel/types.js';
import type { CarSnapshot } from '../model/car/types.js';
import type { Direction } from '../model/types.js';

import { DispatchError, PARK_AT_TOP_FLOOR_INDEX } from './types.js';
import type { CallLifecycle, DispatchContext, ResolvedIdleStage } from './types.js';

/* -------------------------------------------------------------------------- *
 * Vocabulary
 * -------------------------------------------------------------------------- */

/**
 * The traffic-state inputs a detector may name, and the only ones an observation can supply.
 *
 * A declared vocabulary, in the manner of `PARKING_STRATEGIES` and `CALL_TYPES` — not a branch on
 * a name. `resolveWeightSets` rejects an authored `inputs` entry outside this set rather than
 * ignoring it, for the reason `resolveDispatchConfig` rejects an unknown hard constraint: an
 * input that is silently dropped is a detector that silently does not detect.
 */
export const SELECTOR_INPUTS = [
  'lobbyArrivalRate',
  'interfloorRate',
  'downPeakRate',
] as const;

export type SelectorInput = (typeof SELECTOR_INPUTS)[number];

/** Whether a string is one of the three implemented detector inputs. */
export function isSelectorInput(id: string): id is SelectorInput {
  return (SELECTOR_INPUTS as readonly string[]).includes(id);
}

/**
 * The selection rules, re-exported from `config/types.ts` where every schema-validated vocabulary
 * lives.
 *
 * `off` is the default and the reason every shipped run is unchanged. `fuzzy` is Phase 7's
 * undelivered bullet: a trapezoidal membership per pattern over the observed rates, fuzzy AND
 * across an arm's clauses, max-membership defuzzification, dwell hysteresis. `contextual` is
 * Phase 6c: the same arms and the same signatures, with a small learned reparameterization in
 * front of them — see {@link ResolvedSelection}.
 */
export { WEIGHT_SET_POLICIES } from '../config/types.js';
export type { WeightSetPolicy } from '../config/types.js';

/* -------------------------------------------------------------------------- *
 * The observation
 * -------------------------------------------------------------------------- */

/** Traffic state, as the detector sees it. Three rates, passengers per second per car. */
export interface TrafficObservation {
  readonly lobbyArrivalRate: number;
  readonly interfloorRate: number;
  readonly downPeakRate: number;
}

/** The zero observation — what a bank that has seen nothing reports. */
export const IDLE_TRAFFIC: TrafficObservation = Object.freeze({
  lobbyArrivalRate: 0,
  interfloorRate: 0,
  downPeakRate: 0,
});

/** One counted arrival event: passengers that became newly visible at a landing. */
interface ArrivalEntry {
  readonly at: SimTime;
  readonly floorIndex: number;
  readonly direction: Direction;
  readonly count: number;
}

/**
 * A trailing window of counted arrivals, and the one mutable object in this file.
 *
 * It counts **increments in what is waiting**, not calls and not `register()` invocations:
 * `Simulation.#registerCalls` re-registers every live call on every dispatch pass, so counting
 * registrations would multiply one landing queue by however often the bank happened to be asked.
 * `WeightedCostDispatchPolicy.register` computes the delta against the lifecycle it already held
 * and records only that, so what accumulates here is passengers.
 *
 * Deterministic: an append-only array pruned from the front, never a hash structure, and no clock
 * of its own. `reset()` empties it, because a replication that inherited the previous one's
 * traffic history would begin already convinced of a pattern.
 */
export class ArrivalWindow {
  readonly #entries: ArrivalEntry[] = [];

  /** Record `count` passengers newly waiting at `floorIndex` for `direction`, at time `at`. */
  record(at: SimTime, floorIndex: number, direction: Direction, count: number): void {
    if (!(count > 0)) return;
    this.#entries.push({ at, floorIndex, direction, count });
  }

  /** Live entries, oldest first. For tests and for a report; the run reads {@link observe}. */
  get entries(): readonly { at: SimTime; count: number }[] {
    return Object.freeze(this.#entries.map((entry) => ({ at: entry.at, count: entry.count })));
  }

  clear(): void {
    this.#entries.length = 0;
  }

  /**
   * The traffic observation at `at`, over the trailing `windowS` seconds.
   *
   * `cars` supplies how many cars share the demand. `entranceFloorIndices` supplies which floors
   * are lobbies, and it is passed in rather than derived because a car snapshot does not carry
   * the fact: a shaft knows its served floors, their heights and their access zones, and not
   * whether any of them is an entrance.
   *
   * **The fallback, when nobody supplied it, is the shaft's lowest served floor — and that is
   * wrong on a building with a basement.** It is stated here because it was shipped for an hour:
   * on `midtown-office` the `main` bank serves `P1` at index −1 and the lobby `G` at index 0, so
   * a pure up-peak run classified every lobby arrival as interfloor and reported an interfloor
   * rate four times its lobby rate. `Simulation.#groupContext` supplies the real set;
   * a hand-built caller that does not gets the fallback and this paragraph.
   *
   * Prunes as it goes, so the window is bounded by arrivals within `windowS` rather than by the
   * run length.
   */
  observe(
    at: SimTime,
    windowS: number,
    cars: readonly CarSnapshot[],
    entranceFloorIndices?: ReadonlySet<number> | undefined,
  ): TrafficObservation {
    const cutoff = at - windowS;
    let live = 0;
    while (live < this.#entries.length && this.#entries[live]!.at < cutoff) live += 1;
    if (live > 0) this.#entries.splice(0, live);

    if (this.#entries.length === 0 || windowS <= 0) return IDLE_TRAFFIC;

    let lowestIndex = Number.POSITIVE_INFINITY;
    let carCount = 0;
    for (const car of cars) {
      carCount += 1;
      if (car.shaft.lowestIndex < lowestIndex) lowestIndex = car.shaft.lowestIndex;
    }
    if (carCount === 0) return IDLE_TRAFFIC;

    const isEntrance = (floorIndex: number): boolean =>
      entranceFloorIndices === undefined
        ? floorIndex <= lowestIndex
        : entranceFloorIndices.has(floorIndex);

    let lobby = 0;
    let interfloor = 0;
    let down = 0;
    for (const entry of this.#entries) {
      if (entry.direction === 'down') down += entry.count;
      else if (isEntrance(entry.floorIndex)) lobby += entry.count;
      else interfloor += entry.count;
    }

    const scale = windowS * carCount;
    return Object.freeze({
      lobbyArrivalRate: lobby / scale,
      interfloorRate: interfloor / scale,
      downPeakRate: down / scale,
    });
  }
}

/* -------------------------------------------------------------------------- *
 * The arms
 * -------------------------------------------------------------------------- */

/**
 * A membership clause: the raw input value at which membership is 0 and the one at which it is 1.
 *
 * One form, both directions. `[0.05, 0.20]` rises — 0 at or below 0.05, 1 at or above 0.20, linear
 * between. `[0.20, 0.05]` falls, by the same arithmetic read backwards. A degenerate `[x, x]` is a
 * step. Two numbers rather than a trapezoid's four, because a trapezoid is two of these and
 * authoring the pair is what lets a pattern say *"lobby high **and** down low"* without a second
 * shape in the schema.
 */
export type MembershipRamp = readonly [number, number];

/** Membership of one value in one clause, in `[0, 1]`. */
export function rampMembership(value: number, ramp: MembershipRamp): number {
  const [zeroAt, oneAt] = ramp;
  if (zeroAt === oneAt) return value >= oneAt ? 1 : 0;
  const t = (value - zeroAt) / (oneAt - zeroAt);
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

/** One selectable weight set: a pattern, the profile whose weights it borrows, its signature. */
export interface WeightSetArm {
  /** The authored pattern name. Carried for reports; **never** read to decide anything. */
  readonly patternId: string;
  /** The dispatcher-profile id whose weight vector this arm is. Provenance only. */
  readonly weightSetId: string;
  /** That profile's weights, resolved in cost-term registry order. */
  readonly weights: ReadonlyMap<string, number>;
  /** Input id to the ramp this pattern requires of it. Fuzzy AND across the entries. */
  readonly membership: ReadonlyMap<SelectorInput, MembershipRamp>;
}

/** Every arm the detector may choose, in the order `patternDetector.patterns` declares. */
export interface ResolvedWeightSets {
  readonly arms: readonly WeightSetArm[];
  /** The detector's declared type, for provenance. */
  readonly detector: string;
}

/**
 * The resolved `selection` stage: the whole tunable surface this mechanism adds.
 *
 * Six scalars, and that is the answer to `DECISIONS.md` § D28's second objection — *"is a
 * 400-parameter policy vector a declarable tunable?"* No, and this is not that. Every field below
 * is declared in `DISPATCH_PARAMETERS` with a type, a range, a default and an `activeWhen`, so the
 * generic optimizer `tuning/space/collect.ts` discovers it without a line of elevator-specific
 * code, and lane T47's schema-driven control renderer draws it without one either.
 *
 * The three gains and the margin are the **learned** half, and they are gated on
 * `selection.policy: 'contextual'`. At their defaults — gain 1, margin 0 — the contextual policy
 * is arithmetically identical to the fuzzy one, which is deliberate: it makes "what the learning
 * bought" a difference against the fuzzy arm rather than against an unrelated configuration.
 */
export interface ResolvedSelection {
  readonly policy: WeightSetPolicy;
  /** Seconds a chosen weight set must be held before another may take it. */
  readonly hysteresisS: number;
  /** Trailing window the three rates are counted over, seconds. */
  readonly observationWindowS: number;
  /** Learned gain applied to `lobbyArrivalRate` before its memberships are evaluated. */
  readonly lobbyArrivalRateGain: number;
  /** Learned gain applied to `interfloorRate`. */
  readonly interfloorRateGain: number;
  /** Learned gain applied to `downPeakRate`. */
  readonly downPeakRateGain: number;
  /** Membership a challenger must exceed the incumbent's by before it may take the run. */
  readonly switchMargin: number;
}

/* -------------------------------------------------------------------------- *
 * Resolution
 * -------------------------------------------------------------------------- */

/** The `patternSwitching` block, structurally, so `PatternSwitchingConfig` satisfies it. */
export interface PatternSwitchingSource {
  readonly patternDetector: {
    readonly type: string;
    readonly inputs: readonly string[];
    readonly patterns: readonly string[];
    readonly hysteresisS: number;
    readonly membership?:
      | Readonly<Record<string, Readonly<Record<string, readonly number[]>>>>
      | undefined;
  };
  readonly weightSetsByPattern: Readonly<Record<string, string>>;
}

/** What a selector needs beyond its own profile: the arm library, and the profiles it names. */
export interface WeightSetSource {
  readonly patternSwitching: PatternSwitchingSource;
  /** Weights by dispatcher-profile id, already resolved in registry order. */
  readonly weightsByProfileId: ReadonlyMap<string, ReadonlyMap<string, number>>;
}

/**
 * Turn the authored `patternSwitching` block into arms, or refuse.
 *
 * **Four things are rejected rather than tolerated**, and the fourth is this lane's own finding.
 * Each is a claim the mechanism cannot keep, and each would produce a plausible-looking run of a
 * system nobody configured — the same argument `resolveDispatchConfig` makes about an unknown
 * hard constraint and a misspelled term id:
 *
 * - **no `patternSwitching` at all** while `selection.policy` asks for a selector. A dispatcher
 *   that declares it switches weight sets and has none to switch between does not switch.
 * - **an input this file does not implement.** The detector would score every pattern against a
 *   feature nobody measured.
 * - **a pattern with no membership clauses.** Its membership would be a constant, so it either
 *   never wins or always does, and neither is a detection.
 * - **a `weightSetsByPattern` entry naming a profile that does not exist.** This is the shipped
 *   file's own defect: `idle` named `energy-saver`, which was never authored, and `parse.ts`
 *   emitted a *non-fatal* `unknown-weight-set-profile` warning saying *"pattern switching will
 *   fall back until it exists"*. Non-fatal was right while nothing read the block. It is wrong
 *   now: a selector quietly missing one of its five regimes is a dispatcher that cannot express
 *   the regime its own configuration says it has, and the fallback would be silent at exactly the
 *   traffic where the operator asked for something different. The file-level warning stays
 *   non-fatal — nothing forces a profile to opt in — and the *selector* refuses.
 */
export function resolveWeightSets(
  source: WeightSetSource | undefined,
  selection: ResolvedSelection,
  profileId: string,
): ResolvedWeightSets | undefined {
  if (selection.policy === 'off') return undefined;
  if (source === undefined) {
    throw new DispatchError(
      `Dispatcher "${profileId}" sets selection.policy "${selection.policy}" and no patternSwitching library was supplied. A dispatcher that declares it switches weight sets and has none to switch between does not switch; it runs its own weights while claiming otherwise.`,
    );
  }

  const { patternDetector: detector, weightSetsByPattern } = source.patternSwitching;
  for (const input of detector.inputs) {
    if (isSelectorInput(input)) continue;
    throw new DispatchError(
      `Dispatcher "${profileId}" uses a pattern detector declaring input "${input}", which no observation supplies. Implemented inputs: ${SELECTOR_INPUTS.join(', ')}. A detector input nothing can measure is a dimension every pattern scores identically on.`,
    );
  }

  const membershipByPattern = detector.membership ?? {};
  const arms: WeightSetArm[] = [];
  for (const patternId of detector.patterns) {
    const weightSetId = weightSetsByPattern[patternId];
    if (weightSetId === undefined) {
      throw new DispatchError(
        `Dispatcher "${profileId}": pattern "${patternId}" is declared by the detector and named by no weightSetsByPattern entry, so the detector can reach a state the dispatcher has no weights for.`,
      );
    }
    const weights = source.weightsByProfileId.get(weightSetId);
    if (weights === undefined) {
      throw new DispatchError(
        `Dispatcher "${profileId}": pattern "${patternId}" selects weight set "${weightSetId}", which is not an authored dispatcher profile. Known: ${[...source.weightsByProfileId.keys()].join(', ')}. A selector missing one of its regimes falls back silently at exactly the traffic the operator configured it for.`,
      );
    }

    const clauses = membershipByPattern[patternId] ?? {};
    const membership = new Map<SelectorInput, MembershipRamp>();
    for (const input of SELECTOR_INPUTS) {
      const ramp = clauses[input];
      if (ramp === undefined) continue;
      if (ramp.length !== 2 || !ramp.every((bound) => Number.isFinite(bound))) {
        throw new DispatchError(
          `Dispatcher "${profileId}": pattern "${patternId}" declares membership on "${input}" as ${JSON.stringify(ramp)}; it must be two finite numbers, [zeroAt, oneAt].`,
        );
      }
      membership.set(input, [ramp[0]!, ramp[1]!]);
    }
    if (membership.size === 0) {
      throw new DispatchError(
        `Dispatcher "${profileId}": pattern "${patternId}" declares no membership clause, so its membership is a constant and the detector can neither enter nor leave it on evidence. Author patternDetector.membership["${patternId}"] over one or more of ${SELECTOR_INPUTS.join(', ')}.`,
      );
    }

    arms.push(
      Object.freeze({
        patternId,
        weightSetId,
        weights,
        membership: membership as ReadonlyMap<SelectorInput, MembershipRamp>,
      }),
    );
  }

  if (arms.length === 0) {
    throw new DispatchError(
      `Dispatcher "${profileId}" asks for weight-set selection over an empty pattern list.`,
    );
  }

  return Object.freeze({ arms: Object.freeze(arms), detector: detector.type });
}

/* -------------------------------------------------------------------------- *
 * Selection
 * -------------------------------------------------------------------------- */

/**
 * The selector's memory, explicit so it is part of deterministic simulation state.
 *
 * It is not in `Car.estimateCost()` and it could not be: that function is pure (CLAUDE.md
 * invariant 1) and the dispatcher calls it thousands of times per decision. It is not in a
 * closure either, so a replay reconstructs it from the same inputs in the same order.
 */
export interface SelectorState {
  /** Index into {@link ResolvedWeightSets.arms}, or `undefined` before the first selection. */
  readonly activeIndex: number | undefined;
  /** When the active arm took the run. `undefined` while nothing has been selected. */
  readonly since: SimTime | undefined;
}

/** Before anything has been selected. */
export const INITIAL_SELECTOR_STATE: SelectorState = Object.freeze({
  activeIndex: undefined,
  since: undefined,
});

/** What a selection decided, and why. */
export interface WeightSetSelectionResult {
  readonly state: SelectorState;
  /** The chosen arm, or `undefined` when no pattern has any membership and the profile's own weights stand. */
  readonly arm: WeightSetArm | undefined;
  /** The arm the detector would have chosen ignoring hysteresis and margin. */
  readonly preferred: WeightSetArm | undefined;
  /** The preferred arm's membership, after the learned gains. */
  readonly preferredMembership: number;
  /** Whether the active arm changed on this call. */
  readonly switched: boolean;
  /** Why the selection did not move, when it did not. */
  readonly held: 'hysteresis' | 'margin' | 'incumbent-preferred' | undefined;
}

/**
 * Apply the learned gains. At the defaults this is the identity, by construction.
 *
 * The gains multiply the *raw rate* rather than a normalized one, so the authored ramps stay in
 * the units they are authored in and one learned parameter has one meaning. A gain above 1 makes
 * the detector see a given rate as busier than it is — which is a shift of every ramp on that
 * input toward zero, and is the smallest reparameterization that can move where the regimes
 * divide without the optimizer having to rediscover the whole membership map.
 */
function gained(traffic: TrafficObservation, selection: ResolvedSelection): TrafficObservation {
  if (selection.policy !== 'contextual') return traffic;
  return {
    lobbyArrivalRate: traffic.lobbyArrivalRate * selection.lobbyArrivalRateGain,
    interfloorRate: traffic.interfloorRate * selection.interfloorRateGain,
    downPeakRate: traffic.downPeakRate * selection.downPeakRateGain,
  };
}

/** One arm's membership under fuzzy AND: the weakest clause it satisfies. */
export function armMembership(arm: WeightSetArm, traffic: TrafficObservation): number {
  let worst = 1;
  for (const [input, ramp] of arm.membership) {
    const value = rampMembership(traffic[input], ramp);
    if (value < worst) worst = value;
    if (worst === 0) return 0;
  }
  return worst;
}

/**
 * **The mechanism.** Choose a weight set for this instant, or keep the one in force.
 *
 * Pure: no draw, no clock, no mutation of anything the caller did not hand in. `at` comes from the
 * kernel and `state` comes back out, which is what makes a stored run replay byte-identically.
 *
 * Defuzzification is **max-membership**, with ties broken by declaration order in
 * `patternDetector.patterns` — never by iteration over a hash structure (CLAUDE.md invariant 4).
 *
 * Two gates stand between a preference and a switch, and they are different mechanisms:
 *
 * - **`selection.hysteresisS`** is a dwell time. The authored 120 s is a fact about how fast a
 *   building's traffic really changes, and it is what the file's own comment means by *"hysteresis
 *   prevents detector oscillation"*.
 * - **`selection.switchMargin`** is the learned half, inert at its default of 0. It asks the
 *   challenger to be *better* by a margin rather than merely later, which is the gate that bites
 *   when two patterns' memberships are both near 1 and the dwell has already expired.
 *
 * A pattern set whose every membership is 0 selects **nothing**, and the caller runs the profile's
 * own authored weights. That is an abstention rather than a guess: the detector saying "this is
 * none of the regimes I know" is information, and picking the least-bad arm would hide it.
 */
/**
 * Whether the arm in force has held the run for less than the dwell — the one anti-oscillation
 * gate {@link selectWeightSet} and {@link selectRuleArm} share.
 *
 * Factored rather than duplicated for the file header's own "one mechanism, two policies"
 * argument, applied a third time: the dwell arithmetic is one question, and two copies of it
 * would be two answers waiting to disagree about the boundary instant.
 */
function dwellHolds(state: SelectorState, at: SimTime, hysteresisS: number): boolean {
  return state.since !== undefined && at - state.since < hysteresisS;
}

export function selectWeightSet(
  sets: ResolvedWeightSets,
  selection: ResolvedSelection,
  traffic: TrafficObservation,
  state: SelectorState,
  at: SimTime,
): WeightSetSelectionResult {
  const observed = gained(traffic, selection);

  let bestIndex = -1;
  let best = 0;
  sets.arms.forEach((arm, index) => {
    const membership = armMembership(arm, observed);
    // Strictly greater, so the first-declared of two equal patterns wins.
    if (membership > best) {
      best = membership;
      bestIndex = index;
    }
  });

  const incumbent = state.activeIndex === undefined ? undefined : sets.arms[state.activeIndex];
  const preferred = bestIndex < 0 ? undefined : sets.arms[bestIndex];

  if (preferred === undefined) {
    // Nothing is recognized. The incumbent, if there is one, keeps the run — dropping back to the
    // profile's weights on a momentary lull would be the oscillation the hysteresis exists for.
    return {
      state,
      arm: incumbent,
      preferred: undefined,
      preferredMembership: 0,
      switched: false,
      held: incumbent === undefined ? undefined : 'incumbent-preferred',
    };
  }

  if (state.activeIndex === bestIndex) {
    return {
      state,
      arm: preferred,
      preferred,
      preferredMembership: best,
      switched: false,
      held: 'incumbent-preferred',
    };
  }

  if (dwellHolds(state, at, selection.hysteresisS)) {
    return {
      state,
      arm: incumbent,
      preferred,
      preferredMembership: best,
      switched: false,
      held: 'hysteresis',
    };
  }

  if (incumbent !== undefined && selection.switchMargin > 0) {
    const incumbentMembership = armMembership(incumbent, observed);
    if (best - incumbentMembership < selection.switchMargin) {
      return {
        state,
        arm: incumbent,
        preferred,
        preferredMembership: best,
        switched: false,
        held: 'margin',
      };
    }
  }

  return {
    state: Object.freeze({ activeIndex: bestIndex, since: at }),
    arm: preferred,
    preferred,
    preferredMembership: best,
    switched: true,
    held: undefined,
  };
}

/* -------------------------------------------------------------------------- *
 * The Everyday rules — GAMEPLAY_AND_NAVIGATION.md §11.5, compiled onto this mechanism
 * -------------------------------------------------------------------------- */

/**
 * How far a rule raises the cost term it names: `weights[term] = max(styleWeight, RULE_EMPHASIS)`.
 *
 * A named constant rather than a tunable, on `PARK_CALL_HORIZON`'s argument: it enters the
 * arithmetic only as the floor a rule lifts one term to, so declaring it would hand an optimizer
 * a knob degenerate with the style's own weight for that term. Half the canonical
 * `waitTime: 1.0`, and deliberately **not** the aggressive end of any declared range — CLAUDE.md
 * § Tuning discipline leaves aggressive ends as the operator's to opt into, and a rule is a
 * player's sentence, not a tuning pass. Its proof obligation is the moved-control test in
 * `rules.test.ts` — every weight action must change a run at a measured cell — not this number.
 */
export const RULE_EMPHASIS = 0.5;

/**
 * Open landing calls above the named floor at which "calls are stacking" — ≥ 3.
 *
 * A constant, not a tunable, the `PARK_CALL_HORIZON` pattern: one call above a floor is a call,
 * two are a coincidence, three are a queue forming out of the lobby's sight — and a declared
 * knob here would only ever move a threshold the player's own value list (`floor 4/6/8/10`)
 * already parameterises on the axis that matters, which floor "above" starts at.
 */
export const STACKING_MIN_CALLS = 3;

/** The scalar inputs a rule clause may compare. Derived per decision, never from a stream. */
export type RuleScalarId =
  | 'longestWaitS'
  | 'lobbyQueue'
  | 'maxCarLoadFactor'
  | 'carsOutOfService';

/**
 * One compiled crisp clause. A row matches iff **all** its clauses hold.
 *
 * Two comparator kinds rather than the draft's one, because the §11.5 phrasings genuinely
 * differ at the boundary: *a call has waited 60 s* is true at exactly 60 (`scalarAtLeast`),
 * while *the lobby queue passes 12* and *a car is fuller than 70%* are false at exactly the
 * value (`scalarAbove`). A `scalarBelow` was drafted and is deliberately absent — no shipped
 * condition compiles to it, and an unused clause kind is dead vocabulary.
 */
export type RuleClause =
  | { readonly kind: 'scalarAtLeast'; readonly input: RuleScalarId; readonly threshold: number }
  | { readonly kind: 'scalarAbove'; readonly input: RuleScalarId; readonly threshold: number }
  | {
      readonly kind: 'timeWithin';
      /** Seconds after local midnight, half-open `[startS, endS)`; wraps midnight when start > end. */
      readonly startS: number;
      readonly endS: number;
      readonly negate: boolean;
    }
  | { readonly kind: 'callsAbove'; readonly floorIndex: number; readonly minCalls: number }
  | { readonly kind: 'nobodyWaitingBelow'; readonly floorIndex: number };

/**
 * Traffic state as the rules see it — queue lengths, ages, load factors, clock time and
 * structural facts. **No rates**: none of §11.5's conditions is an arrival rate, so rules mode
 * never constructs an {@link ArrivalWindow} and costs common random numbers exactly what the
 * fuzzy detector does — nothing.
 */
export interface RulesObservation {
  /** Max `at − registeredAt` over open lifecycles, seconds. 0 with no open call. */
  readonly longestWaitS: number;
  /** Σ waiting passengers over open calls at entrance floors. Absolute people — the player's value list is people. */
  readonly lobbyQueue: number;
  /** Max load factor over in-service cars. 0 with none. */
  readonly maxCarLoadFactor: number;
  /** Cars whose mode is not `in-service`. */
  readonly carsOutOfService: number;
  /**
   * `(startOfDayS + at) mod 86400`, or `undefined` when the run's template carries no
   * start-of-day — under which every time clause is false, stated rather than silent.
   */
  readonly timeOfDayS: number | undefined;
  /** Every open landing call, for the two floor-parameterised clause kinds. */
  readonly openCalls: readonly {
    readonly floorIndex: number;
    readonly waitingPassengers: number;
  }[];
}

/**
 * One compiled rule row: its clauses and its payload.
 *
 * The payload moves **weights and idle, never dispatch/answer/eligibility mid-run** — the
 * "why only the weights switch" boundary above is about the passenger model, and an idle
 * override does not cross it (`RepositionContext.idleOverride` is Slice 3's shipped precedent).
 * The one eligibility action, `no-new-pickups`, is a **static compile** into
 * `eligibility.maxLoadFactorForAssignment` and never becomes an arm: the engine's stage-2 load
 * ceiling *is* that condition, evaluated per car per decision, and compiling it to an arm would
 * be a second, worse copy of an existing conditional mechanism.
 */
export interface RuleArm {
  /**
   * Provenance: `rule-<n>:<conditionId>[:<value>]`, 1-based row order. Carried for reports and
   * for the stage header's readout; **never** read to decide anything — the same discipline as
   * {@link WeightSetArm.patternId}.
   */
  readonly patternId: string;
  readonly clauses: readonly RuleClause[];
  /** The style's own vector with one term raised to {@link RULE_EMPHASIS}, or absent for an idle-only arm. */
  readonly weights?: ReadonlyMap<string, number> | undefined;
  /** The stage-7 settings in force while this arm holds, or absent for a weight-only arm. */
  readonly idle?: ResolvedIdleStage | undefined;
}

/** The compiled rules, in row order. The sibling of {@link ResolvedWeightSets}. */
export interface ResolvedRuleSets {
  readonly arms: readonly RuleArm[];
}

/** What `resolveRuleArms` hands back: the arms, plus the one statically-compiled field. */
export interface CompiledRules {
  readonly ruleSets: ResolvedRuleSets;
  /**
   * The load ceiling `no-new-pickups` compiled to, or `undefined` when no row used it. Outranks
   * the profile's own authored `eligibility.maxLoadFactorForAssignment`, being the more recent,
   * more explicit statement — the `dev/state.ts` write-order argument, applied to a resolve.
   */
  readonly maxLoadFactorForAssignment: number | undefined;
}

/** The row shape this compiler accepts — structural, so a fixture needs no cast. */
export interface RuleRowSource {
  readonly when: string;
  readonly whenValue?: number | string | undefined;
  readonly then: string;
  readonly thenValue?: number | string | undefined;
}

function isRuleCondition(id: string): id is RuleConditionId {
  return Object.hasOwn(RULE_CONDITION_WORDS, id);
}

function isRuleAction(id: string): id is RuleActionId {
  return Object.hasOwn(RULE_ACTION_WORDS, id);
}

/** The declared value, verified against the id's own list. Refuses, never coerces. */
function ruleValue(
  id: string,
  declared: { readonly values?: readonly { readonly value: number | string }[] | undefined },
  value: number | string | undefined,
  rowIndex: number,
  profileId: string,
): number | string | undefined {
  const values = declared.values;
  if (values === undefined) {
    if (value !== undefined) {
      throw new DispatchError(
        `Dispatcher "${profileId}" rules row ${String(rowIndex + 1)}: "${id}" carries no value, and ${JSON.stringify(value)} was authored. A value nothing reads is decoration wearing a setting's name.`,
      );
    }
    return undefined;
  }
  if (value === undefined || !values.some((option) => option.value === value)) {
    throw new DispatchError(
      `Dispatcher "${profileId}" rules row ${String(rowIndex + 1)}: "${id}" requires one of ${values.map((option) => JSON.stringify(option.value)).join(', ')}; received ${JSON.stringify(value)}. An out-of-list value is refused rather than rounded, because the player's list is the contract.`,
    );
  }
  return value;
}

/** The clauses one condition compiles to. Total over the validated vocabulary. */
function clausesFor(
  when: RuleConditionId,
  value: number | string | undefined,
): readonly RuleClause[] {
  switch (when) {
    case 'call-waited':
      return [{ kind: 'scalarAtLeast', input: 'longestWaitS', threshold: value as number }];
    case 'lobby-queue-passes':
      return [{ kind: 'scalarAbove', input: 'lobbyQueue', threshold: value as number }];
    case 'car-fuller-than':
      return [{ kind: 'scalarAbove', input: 'maxCarLoadFactor', threshold: value as number }];
    case 'time-before':
      return [{ kind: 'timeWithin', startS: 0, endS: value as number, negate: false }];
    case 'time-after':
      return [{ kind: 'timeWithin', startS: value as number, endS: 86400, negate: false }];
    case 'day-period': {
      if (value === 'quiet-stretch') {
        // The complement: outside all three named windows. Expressible because clauses AND.
        return (['morning-rush', 'lunch', 'evening'] as const).map((period): RuleClause => {
          const [startS, endS] = DAY_PERIOD_WINDOWS[period];
          return { kind: 'timeWithin', startS, endS, negate: true };
        });
      }
      const window = DAY_PERIOD_WINDOWS[value as 'morning-rush' | 'lunch' | 'evening'];
      return [{ kind: 'timeWithin', startS: window[0], endS: window[1], negate: false }];
    }
    case 'shaft-out':
      return [{ kind: 'scalarAtLeast', input: 'carsOutOfService', threshold: 1 }];
    case 'calls-stacking-above':
      return [{ kind: 'callsAbove', floorIndex: value as number, minCalls: STACKING_MIN_CALLS }];
    case 'nobody-below':
      return [{ kind: 'nobodyWaitingBelow', floorIndex: value as number }];
  }
}

/** The style's own vector with one term raised to {@link RULE_EMPHASIS}. */
function emphasised(
  styleWeights: ReadonlyMap<string, number>,
  termId: string,
): ReadonlyMap<string, number> {
  const weights = new Map(styleWeights);
  weights.set(termId, Math.max(weights.get(termId) ?? 0, RULE_EMPHASIS));
  return weights;
}

/**
 * Compile a profile's `rules.rows` into ordered arms, or refuse — the {@link resolveWeightSets}
 * posture, row by row: an unknown id, an out-of-list value, an invalid pairing and a duplicated
 * static row each produce a plausible-looking run of a system nobody configured, so each throws
 * with the profile id and row number in the message.
 *
 * The weight actions borrow the style's own vector and raise one term
 * ({@link RULE_EMPHASIS}); the idle actions carry the style's own deadband and energy weight
 * with only the strategy (and, for `park-at-floor`, the floor) replaced — the
 * `RepositionContext.idleOverride` argument, applied per arm: the player's rule is about *where*
 * cars wait, not what a repositioning trip is worth.
 */
export function resolveRuleArms(
  rows: readonly RuleRowSource[],
  styleWeights: ReadonlyMap<string, number>,
  styleIdle: ResolvedIdleStage,
  profileId: string,
): CompiledRules {
  if (rows.length === 0) {
    throw new DispatchError(
      `Dispatcher "${profileId}" sets selection.policy "rules" with no rows. A dispatcher that declares it follows rules and has none to follow does not switch; it runs its own weights while claiming otherwise.`,
    );
  }

  const arms: RuleArm[] = [];
  let maxLoadFactorForAssignment: number | undefined;

  rows.forEach((row, index) => {
    if (!isRuleCondition(row.when)) {
      throw new DispatchError(
        `Dispatcher "${profileId}" rules row ${String(index + 1)}: unknown condition "${row.when}". Known conditions: ${Object.keys(RULE_CONDITION_WORDS).join(', ')}. A condition that is silently dropped is a rule that silently never fires.`,
      );
    }
    if (!isRuleAction(row.then)) {
      throw new DispatchError(
        `Dispatcher "${profileId}" rules row ${String(index + 1)}: unknown action "${row.then}". Known actions: ${Object.keys(RULE_ACTION_WORDS).join(', ')}.`,
      );
    }
    const whenValue = ruleValue(
      row.when,
      RULE_CONDITION_WORDS[row.when],
      row.whenValue,
      index,
      profileId,
    );
    const thenValue = ruleValue(
      row.then,
      RULE_ACTION_WORDS[row.then],
      row.thenValue,
      index,
      profileId,
    );

    if (row.then === 'no-new-pickups') {
      // The static compile. The engine's stage-2 load ceiling *is* the condition "a car is
      // fuller than v", evaluated per car per decision — so this row lands in
      // `eligibility.maxLoadFactorForAssignment` and never becomes an arm. Any other pairing
      // leaves "it" naming nothing, and two such rows would be two writers of one field.
      if (row.when !== 'car-fuller-than') {
        throw new DispatchError(
          `Dispatcher "${profileId}" rules row ${String(index + 1)}: "no-new-pickups" only pairs with "car-fuller-than" — the action stops giving new pickups to *the car that is fuller than v*, so any other condition leaves "it" naming nothing.`,
        );
      }
      if (maxLoadFactorForAssignment !== undefined) {
        throw new DispatchError(
          `Dispatcher "${profileId}" rules row ${String(index + 1)}: a second "no-new-pickups" row. Both would write eligibility.maxLoadFactorForAssignment, and two writers of one field is a rule list that lies about one of them.`,
        );
      }
      maxLoadFactorForAssignment = whenValue as number;
      return;
    }

    const clauses = clausesFor(row.when, whenValue);
    const suffix = whenValue === undefined ? '' : `:${String(whenValue)}`;
    const patternId = `rule-${String(index + 1)}:${row.when}${suffix}`;

    switch (row.then) {
      case 'nearest-car':
        arms.push(
          Object.freeze({
            patternId,
            clauses,
            weights: emphasised(styleWeights, 'distanceTravelled'),
          }),
        );
        return;
      case 'emptiest-car':
        arms.push(
          Object.freeze({ patternId, clauses, weights: emphasised(styleWeights, 'loadFactor') }),
        );
        return;
      case 'jump-queue':
        arms.push(
          Object.freeze({ patternId, clauses, weights: emphasised(styleWeights, 'starvation') }),
        );
        return;
      case 'prefer-same-direction':
        arms.push(
          Object.freeze({
            patternId,
            clauses,
            weights: emphasised(styleWeights, 'directionReversal'),
          }),
        );
        return;
      case 'hold-at-lobby':
        arms.push(
          Object.freeze({
            patternId,
            clauses,
            idle: Object.freeze({ ...styleIdle, parkingStrategy: 'lobby' as const }),
          }),
        );
        return;
      case 'spread-out':
        arms.push(
          Object.freeze({
            patternId,
            clauses,
            idle: Object.freeze({ ...styleIdle, parkingStrategy: 'zone-center' as const }),
          }),
        );
        return;
      case 'park-at-floor': {
        if (thenValue === 'lobby') {
          // "Park at the lobby" and "hold at the lobby" are honestly the same stage-7 fact,
          // compiled identically rather than as differently-labelled copies of one mechanism.
          arms.push(
            Object.freeze({
              patternId,
              clauses,
              idle: Object.freeze({ ...styleIdle, parkingStrategy: 'lobby' as const }),
            }),
          );
          return;
        }
        const floorIndex = thenValue === 'top' ? PARK_AT_TOP_FLOOR_INDEX : (thenValue as number);
        arms.push(
          Object.freeze({
            patternId,
            clauses,
            idle: Object.freeze({
              ...styleIdle,
              parkingStrategy: 'fixed-floor' as const,
              parkingFloorIndex: floorIndex,
            }),
          }),
        );
        return;
      }
    }
  });

  return Object.freeze({
    ruleSets: Object.freeze({ arms: Object.freeze(arms) }),
    maxLoadFactorForAssignment,
  });
}

/**
 * The rules' observation for one decision — pure, per decision, from things the policy already
 * holds. No stream, no clock, no allocation beyond the arrays returned: the same CRN cost as
 * the fuzzy detector, which is zero, asserted by re-running `validation/goldenRuns.test.ts` and
 * `fuzz/determinism.test.ts` rather than by this sentence.
 *
 * The lobby queue **must** use the entrance set, not the lowest served floor — the midtown P1/G
 * regression documented on `DispatchContext.entranceFloorIndices`. A hand-built caller that
 * supplies no context gets the same stated fallback the {@link ArrivalWindow} keeps: the lowest
 * served floor across the cars supplied.
 */
export function rulesObservationOf(
  lifecycles: Iterable<CallLifecycle>,
  cars: readonly CarSnapshot[],
  at: SimTime,
  context: Pick<DispatchContext, 'entranceFloorIndices' | 'startOfDayS'> | undefined,
): RulesObservation {
  let lowestIndex = Number.POSITIVE_INFINITY;
  let maxCarLoadFactor = 0;
  let carsOutOfService = 0;
  for (const car of cars) {
    if (car.shaft.lowestIndex < lowestIndex) lowestIndex = car.shaft.lowestIndex;
    if (car.mode !== 'in-service') {
      carsOutOfService += 1;
      continue;
    }
    if (car.load.loadFactor > maxCarLoadFactor) maxCarLoadFactor = car.load.loadFactor;
  }

  const entrances = context?.entranceFloorIndices;
  const isEntrance = (floorIndex: number): boolean =>
    entrances === undefined ? floorIndex <= lowestIndex : entrances.has(floorIndex);

  let longestWaitS = 0;
  let lobbyQueue = 0;
  const openCalls: { floorIndex: number; waitingPassengers: number }[] = [];
  for (const lifecycle of lifecycles) {
    const waited = at - lifecycle.registeredAt;
    if (waited > longestWaitS) longestWaitS = waited;
    if (isEntrance(lifecycle.call.floorIndex)) lobbyQueue += lifecycle.waitingPassengers;
    openCalls.push({
      floorIndex: lifecycle.call.floorIndex,
      waitingPassengers: lifecycle.waitingPassengers,
    });
  }

  const startOfDayS = context?.startOfDayS;
  return Object.freeze({
    longestWaitS,
    lobbyQueue,
    maxCarLoadFactor,
    carsOutOfService,
    timeOfDayS: startOfDayS === undefined ? undefined : (startOfDayS + at) % 86400,
    openCalls: Object.freeze(openCalls),
  });
}

/** Whether one clause holds. Total; a missing clock makes a time clause false, negated or not. */
export function ruleClauseHolds(clause: RuleClause, observation: RulesObservation): boolean {
  switch (clause.kind) {
    case 'scalarAtLeast':
      return observation[clause.input] >= clause.threshold;
    case 'scalarAbove':
      return observation[clause.input] > clause.threshold;
    case 'timeWithin': {
      const t = observation.timeOfDayS;
      // A clockless crowd fails every time clause, **including negated ones**: `negate` inverts
      // membership of the window, not knowledge of the clock, and a "quiet stretch" asserted
      // about a day with no clock would be a claim about nothing.
      if (t === undefined) return false;
      const inside =
        clause.startS <= clause.endS
          ? t >= clause.startS && t < clause.endS
          : t >= clause.startS || t < clause.endS;
      return clause.negate ? !inside : inside;
    }
    case 'callsAbove': {
      let count = 0;
      for (const call of observation.openCalls) {
        if (call.floorIndex > clause.floorIndex) count += 1;
        if (count >= clause.minCalls) return true;
      }
      return false;
    }
    case 'nobodyWaitingBelow': {
      for (const call of observation.openCalls) {
        if (call.floorIndex < clause.floorIndex && call.waitingPassengers > 0) return false;
      }
      return true;
    }
  }
}

/** Whether every clause of one arm holds — crisp AND, short-circuit, in clause order. */
export function ruleArmMatches(arm: RuleArm, observation: RulesObservation): boolean {
  for (const clause of arm.clauses) {
    if (!ruleClauseHolds(clause, observation)) return false;
  }
  return true;
}

/** What a rule selection decided. The rules sibling of {@link WeightSetSelectionResult}. */
export interface RuleSelectionResult {
  readonly state: SelectorState;
  /** The arm in force after this call, or `undefined` when the style's own settings stand. */
  readonly arm: RuleArm | undefined;
  /** The first matching arm this instant, ignoring the dwell. */
  readonly preferred: RuleArm | undefined;
  readonly switched: boolean;
  /** Why the selection did not move, when it did not. The same vocabulary, minus `margin`. */
  readonly held: 'hysteresis' | 'incumbent-preferred' | undefined;
}

/**
 * **First match wins, and no match releases.** The rules sibling of {@link selectWeightSet} —
 * a separate function rather than a mode flag threaded through it, because the fuzzy tests pin
 * that function's anti-oscillation branches and a flag inside them would be a fork wearing one
 * name. Shared instead of duplicated: {@link SelectorState}, {@link INITIAL_SELECTOR_STATE} and
 * the dwell comparison ({@link dwellHolds}).
 *
 * Two deliberate divergences from the fuzzy semantics, each §11.5's own:
 *
 * - **Ordering decides, not membership.** The scan takes the first row whose clauses all hold;
 *   a later row that "matches harder" does not exist as a concept, and reordering rows is the
 *   player's priority control.
 * - **No match releases the run to the profile's weights** — *"If no rule fits, Steady hand
 *   decides"* — where the fuzzy detector's incumbent keeps it. The release is itself gated by
 *   the dwell, which is what stops *lobby queue passes 12* flapping at 11.9/12.1: a rule keeps
 *   the run for at least `hysteresisS` from when it took it, and so does the released state
 *   (`since` is set on release, so the next rule to fire also waits the dwell out — one
 *   deliberate divergence from {@link SelectorState}'s "`since` undefined while nothing is
 *   selected" reading, documented here because the released state *is* a selection: the
 *   player's fallback line names it).
 *
 * `switchMargin` and the learned gains are meaningless over crisp clauses and are **not read**;
 * the rules editor says so beside the controls rather than leaving them to look live.
 */
export function selectRuleArm(
  arms: readonly RuleArm[],
  selection: ResolvedSelection,
  observation: RulesObservation,
  state: SelectorState,
  at: SimTime,
): RuleSelectionResult {
  let preferredIndex = -1;
  for (let index = 0; index < arms.length; index += 1) {
    if (ruleArmMatches(arms[index]!, observation)) {
      preferredIndex = index;
      break;
    }
  }

  const incumbent = state.activeIndex === undefined ? undefined : arms[state.activeIndex];
  const preferred = preferredIndex < 0 ? undefined : arms[preferredIndex];
  const wantedIndex = preferredIndex < 0 ? undefined : preferredIndex;

  if (wantedIndex === state.activeIndex) {
    return {
      state,
      arm: incumbent,
      preferred,
      switched: false,
      held: incumbent === undefined ? undefined : 'incumbent-preferred',
    };
  }

  if (dwellHolds(state, at, selection.hysteresisS)) {
    return { state, arm: incumbent, preferred, switched: false, held: 'hysteresis' };
  }

  return {
    state: Object.freeze({ activeIndex: wantedIndex, since: at }),
    arm: preferred,
    preferred,
    switched: true,
    held: undefined,
  };
}
