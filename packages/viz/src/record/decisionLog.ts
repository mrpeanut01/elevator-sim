/**
 * Recording *why* a car was chosen, without changing which one was.
 *
 * ## The question this answers, and why nothing else could
 *
 * The viewer has always been able to show what happened. It has never been able to say why, and
 * the design handoff makes the answer a first-class rail section — **WHY IT DID THAT**, six rows,
 * newest first, each one a car, a floor and a sentence (`docs/12-design-handoff.md` § 1.2 L7).
 *
 * The sentence has to be *true*, which rules out the two cheap ways of producing it. It cannot be
 * inferred from the outcome, because *A went to floor 12* is what the picture already shows.
 * And it cannot be recomputed afterwards, because a cost is a function of the world at the
 * instant of the decision — every other car's committed stops, every load, the forecast — and by
 * the time `Simulation.run()` returns, that world is gone. Re-scoring against the final state
 * would produce a fluent explanation of a decision that was never made. This repository's
 * standing defect is a plausible number nobody checked; a plausible *reason* nobody checked is
 * the same defect with better prose.
 *
 * So the reason is captured at the instant it exists. `DispatchDecision.scores` carries every
 * eligible car's weighted cost with a per-term breakdown, best first, and `Simulation` throws all
 * of it away except the winner's id.
 *
 * ## Why the wrapper is safe
 *
 * The same four properties `instrument.ts` argues for the car wrappers, for the same reason —
 * "it looks harmless" is not an argument here.
 *
 * - **Every method delegates and returns the delegate's value unchanged.** The wrapper is a
 *   `Proxy`-free explicit forwarder over the seven-method {@link DispatchPolicy} surface; it
 *   cannot move a decision, because it alters no input to one.
 * - **It draws no random number.** It never touches the `StreamSet`, so common random numbers stay
 *   synchronised (invariant 2) and a comparison made with an instrumented run is still valid.
 * - **It reads no clock.** Every time it records is the `at` the caller passed — the kernel's
 *   (invariant 3).
 * - **It changes no statistic.** `decisionLog.test.ts` runs the same configuration with and
 *   without instrumentation and requires the two `RunRecord`s equal, which is the assertion and
 *   not the reasoning.
 *
 * The hook it goes through is `SimulationConfig.createPolicy`, whose own docstring names
 * *"instrumenting a real run — wrapping the policy to count what each cost term actually
 * evaluated to"* as one of its two reasons to exist. This is that.
 *
 * ## What is kept
 *
 * The winner's three largest term contributions, its cost, and the runner-up's cost. Not every
 * losing car's full breakdown: a busy Vertical City run makes tens of thousands of decisions
 * against thirty-five cars, and storing every bid would make the bids the largest array in the
 * recording by an order of magnitude in order to feed a panel that draws six rows.
 *
 * `retained` and `deferred` decisions are dropped, and that is a display choice with a reason: a
 * log that showed *the call stayed where it was* on every re-score would push the three lines a
 * reader wants off the panel within a second of simulated time.
 */

import type {
  CarScore,
  DispatchCall,
  DispatchContext,
  DispatchDecision,
  DispatchPolicy,
  DispatcherProfile,
  SimTime,
} from '@elevator-sim/core/browser';
import { WeightedCostDispatchPolicy, createPolicyFor } from '@elevator-sim/core/browser';

import type { VizDecision, VizDecisionTerm, VizPatternSwitch } from '../contract/types.js';

import { shortCarLabel } from './instrument.js';

/** How many of the winner's terms to keep. Three carries the sentence; twelve carries a table. */
const TERMS_KEPT = 3;

/**
 * One wrapped policy's selector trace — the policy, the last value seen, the switches so far.
 *
 * `previous` starts at `null` because that is what a policy holds before its first decision: the
 * profile's own weights stand and `activePattern` is `undefined`. So the first sample only
 * records an entry if the very first decision selected an arm, and a detector that abstains for
 * the whole run leaves the list empty — which is the contract's *watched and found nothing*.
 */
interface PolicyTrace {
  readonly policy: WeightedCostDispatchPolicy;
  previous: string | null;
  readonly switches: { atS: SimTime; patternId: string | null }[];
}

/**
 * The growing log, shared by every bank's wrapped policy.
 *
 * One collector per run, not one per bank: the rail shows the group's decisions in time order,
 * and a per-bank log would have to be merged by a consumer that has no reason to know how many
 * banks there were.
 */
export class DecisionCollector {
  readonly #entries: VizDecision[] = [];
  /**
   * Every policy {@link wrapPolicy} enrolled, in creation order — which is bank declaration
   * order, because `Simulation`'s constructor builds one policy per bank in a single loop over
   * `building.banks`. That ordering is what lets {@link buildPatternSwitches} attach a bank id
   * to each trace after the fact: the factory hook receives `(profile, options)` and no bank.
   */
  readonly #policies: DispatchPolicy[] = [];
  /** The selector traces, keyed by policy identity. Only selecting policies get one. */
  readonly #traces = new Map<DispatchPolicy, PolicyTrace>();
  /**
   * Call id to the landing it was registered at.
   *
   * A {@link DispatchDecision} names its call by id and not by floor, because a policy identifies
   * a call by its lifecycle. The floor is on the {@link DispatchCall} handed to `register`, which
   * happens once, before any number of `dispatch` and `reconsider` passes — so it has to be
   * remembered here rather than read off the decision.
   */
  readonly #landings = new Map<string, { floorId: string; direction: DispatchCall['direction'] }>();

  /** Bounded so a long run cannot grow the recording without limit. Oldest are dropped. */
  readonly #limit: number;

  constructor(limit = 4000) {
    this.#limit = Math.max(1, limit);
  }

  /**
   * Register a policy the factory just built, and decide whether it can select.
   *
   * A selector trace is opened only for a {@link WeightedCostDispatchPolicy} whose resolved
   * config carries something to select between — the fuzzy/contextual weight-set library, or
   * the Everyday rules' compiled arms (`ruleSets`), whose provenance ids flow through the same
   * `activePattern` getter and onto the same recording field, so the stage header can say
   * either *everyone arriving* or *rule 2 — the lobby queue passes 12 people* from one field.
   * An auction policy, or a weighted-cost policy with `selection.policy: 'off'`, is enrolled
   * for the ordinal count and traced by nothing: it will never switch, and a trace for it would
   * let the recording claim a watch that never happened.
   */
  enrollPolicy(policy: DispatchPolicy): void {
    this.#policies.push(policy);
    if (
      policy instanceof WeightedCostDispatchPolicy &&
      (policy.config.weightSets !== undefined || policy.config.ruleSets !== undefined)
    ) {
      this.#traces.set(policy, { policy, previous: null, switches: [] });
    }
  }

  /**
   * Sample one policy's pattern-in-force, after a decision.
   *
   * Called from the wrapper's `dispatch` and `reconsider` forwards — the only two methods from
   * which `#refreshWeightSet` runs — so every instant at which `activePattern` can move is
   * observed and the trace is exact, not sampled. Reading a getter mutates nothing, draws no
   * random number and reads no clock, which keeps the wrapper's four safety properties intact.
   */
  notePattern(policy: DispatchPolicy, at: SimTime): void {
    const trace = this.#traces.get(policy);
    if (trace === undefined) return;
    const pattern = trace.policy.activePattern ?? null;
    if (pattern === trace.previous) return;
    trace.previous = pattern;
    trace.switches.push({ atS: at, patternId: pattern });
  }

  /**
   * The selector trace, with bank identities attached — or `undefined` when no policy selected.
   *
   * `bankIds` must be the run's banks in declaration order, because enrollment order is the
   * constructor's bank loop; a length mismatch throws rather than guessing, since a trace
   * attributed to the wrong bank is deterministic, replayable and wrong — this package's worst
   * failure mode. Entries are sorted by `(atS, bankId)`, invariant 4's rule applied to a display
   * artefact, exactly as {@link build} sorts the decisions.
   */
  buildPatternSwitches(bankIds: readonly string[]): readonly VizPatternSwitch[] | undefined {
    if (this.#traces.size === 0) return undefined;
    if (this.#policies.length !== bankIds.length) {
      throw new Error(
        `recordRun: ${String(this.#policies.length)} policies were built for ` +
          `${String(bankIds.length)} banks. The pattern trace maps policies to banks by creation ` +
          'order, so a mismatch would attribute a switch to the wrong bank — refusing is the ' +
          'loud failure this prefers to a quiet misattribution.',
      );
    }
    const merged: VizPatternSwitch[] = [];
    this.#policies.forEach((policy, index) => {
      const trace = this.#traces.get(policy);
      const bankId = bankIds[index];
      if (trace === undefined || bankId === undefined) return;
      for (const entry of trace.switches) {
        merged.push({ atS: entry.atS, bankId, patternId: entry.patternId });
      }
    });
    merged.sort((a, b) => a.atS - b.atS || a.bankId.localeCompare(b.bankId));
    return merged;
  }

  noteCall(call: DispatchCall): void {
    // `register` is idempotent per batch and may be called again for a call already open; the
    // landing cannot change under it, so the first writing wins and a second is a no-op.
    if (!this.#landings.has(call.id)) {
      this.#landings.set(call.id, { floorId: call.floorId, direction: call.direction });
    }
  }

  noteDecision(decision: DispatchDecision, context: DispatchContext | undefined): void {
    if (decision.outcome === 'retained' || decision.outcome === 'deferred') return;
    const landing = this.#landings.get(decision.callId);
    if (landing === undefined) return;

    const winner: CarScore | undefined = decision.scores[0];
    const runnerUp: CarScore | undefined = decision.scores[1];
    const entry: {
      -readonly [K in keyof VizDecision]: VizDecision[K];
    } = {
      at: decision.at,
      callId: decision.callId,
      outcome: decision.outcome,
      floorId: landing.floorId,
      direction: landing.direction,
      eligibleCars: decision.scores.length,
      terms: winner === undefined ? [] : topTerms(winner),
    };
    if (decision.primaryCarId !== undefined) {
      entry.carId = decision.primaryCarId;
      entry.carLabel = labelOf(decision.primaryCarId);
    }
    if (decision.cost !== undefined) entry.cost = decision.cost;
    if (runnerUp !== undefined) entry.runnerUpCost = runnerUp.cost;
    if (decision.reason !== undefined) entry.reason = decision.reason;
    if (context?.waitingPassengers !== undefined) {
      entry.waitingPassengers = context.waitingPassengers;
    }

    this.#entries.push(entry);
    if (this.#entries.length > this.#limit) this.#entries.shift();
  }

  /**
   * The log, sorted by `(at, callId)`.
   *
   * Sorted explicitly rather than trusted to arrive that way: banks are dispatched in declaration
   * order within one kernel instant, so two decisions can share an `at` and their relative order
   * would otherwise be the order a `Map` happened to iterate — invariant 4's rule applied to a
   * display artefact, exactly as `foldPassengers` applies it to the landings.
   */
  build(): readonly VizDecision[] {
    return [...this.#entries].sort((a, b) => a.at - b.at || a.callId.localeCompare(b.callId));
  }
}

/**
 * A `SimulationConfig.createPolicy` that builds the policy `Simulation` would have built and
 * records what it decides.
 *
 * `createPolicyFor` is the same factory `Simulation` calls, given the same `options` — including
 * the derived weight-set library — so the policy behind the wrapper is not *equivalent to* the
 * shipped one, it **is** the shipped one.
 */
export function recordingPolicyFactory(
  collector: DecisionCollector,
): (profile: DispatcherProfile, options: Parameters<typeof createPolicyFor>[1]) => DispatchPolicy {
  return (profile, options) => wrapPolicy(createPolicyFor(profile, options), collector);
}

/** Explicit forwarding, one method at a time. See the module docstring for why not a `Proxy`. */
export function wrapPolicy(inner: DispatchPolicy, collector: DecisionCollector): DispatchPolicy {
  collector.enrollPolicy(inner);
  const wrapped: DispatchPolicy = {
    get id() {
      return inner.id;
    },
    get name() {
      return inner.name;
    },
    get engine() {
      return inner.engine;
    },
    get config() {
      return inner.config;
    },
    get parameters() {
      return inner.parameters;
    },
    get calls() {
      return inner.calls;
    },
    register(call, at, context) {
      collector.noteCall(call);
      return inner.register(call, at, context);
    },
    dispatch(callId, cars, at, context) {
      const decision = inner.dispatch(callId, cars, at, context);
      collector.noteDecision(decision, context);
      collector.notePattern(inner, at);
      return decision;
    },
    reconsider(callId, cars, at, context) {
      const decision = inner.reconsider(callId, cars, at, context);
      collector.noteDecision(decision, context);
      collector.notePattern(inner, at);
      return decision;
    },
    answer(car, call, at, cars) {
      return inner.answer(car, call, at, cars);
    },
  } as DispatchPolicy;

  // Anything the policy surface gains later must forward too, and forwarding it silently is how a
  // wrapper starts changing behaviour. Copy the rest of the own enumerable methods across rather
  // than leaving them absent — a missing method is a `TypeError` at the first call, which is the
  // loud failure this prefers to a quiet one.
  for (const key of ownMethodNames(inner)) {
    if (key in wrapped) continue;
    Object.defineProperty(wrapped, key, {
      value: (...args: unknown[]): unknown =>
        (inner[key as keyof DispatchPolicy] as (...a: unknown[]) => unknown).apply(inner, args),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return wrapped;
}

function ownMethodNames(policy: DispatchPolicy): readonly string[] {
  const names = new Set<string>();
  let cursor: object | null = policy;
  while (cursor !== null && cursor !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(cursor)) {
      if (key === 'constructor') continue;
      const descriptor = Object.getOwnPropertyDescriptor(cursor, key);
      if (descriptor === undefined) continue;
      if (typeof descriptor.value === 'function') names.add(key);
    }
    cursor = Object.getPrototypeOf(cursor) as object | null;
  }
  return [...names];
}

/**
 * The winner's largest contributions, largest first.
 *
 * Ranked by `|contribution|` and not by `contribution`: a term may be a credit as well as a
 * charge, and the term that most explains a choice is the one that moved the total furthest in
 * either direction. Terms that contributed exactly nothing are dropped rather than shown as
 * `0.00`, because a zero-weighted term is not part of this dispatcher.
 */
function topTerms(score: CarScore): readonly VizDecisionTerm[] {
  return [...score.terms]
    .filter((term) => term.contribution !== 0)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, TERMS_KEPT)
    .map((term) => ({
      termId: term.termId,
      weight: term.weight,
      raw: term.raw,
      contribution: term.contribution,
    }));
}

/** `main-A` is `A` on screen, matching what the canvas draws over the shaft. */
function labelOf(carId: string): string {
  const dash = carId.indexOf('-');
  return dash === -1 ? carId : shortCarLabel(carId, carId.slice(0, dash));
}

/** Re-exported so a caller can widen the log without importing two modules. */
export type { SimTime };
