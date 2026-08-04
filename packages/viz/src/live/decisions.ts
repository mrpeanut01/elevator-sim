/**
 * **WHY IT DID THAT** — the left rail's decision log, newest first (design L7, `:163–177`).
 *
 * ## The sentence has to be true, and that is what constrains this module
 *
 * `record/decisionLog.ts` explains why the reason is *captured* rather than reconstructed: a cost
 * is a function of the world at the instant of the decision, and by the time `run()` returns that
 * world is gone. This module is the other half of the same argument. Having gone to the trouble of
 * recording the winner's actual term decomposition, it must not then narrate something the
 * decomposition does not say.
 *
 * Three places where the obvious sentence would be a lie, and what is written instead:
 *
 * 1. **The margin has no unit.** The design's prototype writes *"3.1 s clear of B"*.
 *    `VizDecision.cost` and `runnerUpCost` are **weighted costs** — `Σ wᵢ · normalize(termᵢ)` —
 *    which are dimensionless by construction, because normalising is the whole point (CLAUDE.md:
 *    *raw `waitTime` (0–120 s) and `stopCount` (0–20) on the same scale produce uninterpretable
 *    weights*). So the margin is printed bare: `0.42 clear of the next car`. Attaching seconds to
 *    it would be a unit invented for readability.
 * 2. **The runner-up has no name.** `VizDecision` deliberately keeps the runner-up's *cost* and
 *    not its identity — see its docstring on what a busy Vertical City run would cost to store.
 *    So the phrase is *the next car*, never *B*.
 * 3. **`eligibleCars === 0` is not the same as "every car was full".** `eligibleCars` is
 *    `decision.scores.length`, the number of cars that produced a bid at all. Zero means nobody
 *    bid — a locked-out landing, a service-mode fleet, a bank that does not serve the floor.
 *    A number greater than zero on an `unassigned` decision means cars *did* bid and none could
 *    take it, which is congestion. The recording cannot tell locked-out from all-full when the
 *    count is zero; only `core`'s own `reason` can, and it is surfaced verbatim through
 *    {@link REASON_PHRASES} rather than guessed at.
 *
 * ## Nothing here names a floor or a car the recording does not draw
 *
 * Every label is resolved through `recording.shafts` and `recording.floors`. That is not
 * defensive padding: `record/document.ts` loads recordings **from a file**, written by a build
 * this one cannot vouch for, and a rail that echoed a decision's own `carLabel` would happily
 * announce a shaft that is not on the canvas beside it. `decisions.test.ts` asserts the property
 * directly.
 *
 * ## Pure, and no cache
 *
 * `recording.decisions` is sorted ascending by `(at, callId)`, so the rows for `t` are a suffix of
 * the prefix that has happened — found by scan, reversed, truncated. The playhead scrubs
 * backwards; nothing is remembered between calls.
 */

import { COST_TERMS_BY_ID, type SimTime } from '@elevator-sim/core/browser';

import type { VizDecision, VizDecisionTerm, VizRecording } from '../contract/types.js';

import type { DecisionRow } from './types.js';
import { clockAt } from './timeline.js';

/** How many rows the design's panel draws. */
export const DEFAULT_DECISION_ROWS = 6;

/**
 * Row colours. The design assigns a new assignment the first band colour (`:1808`) and a
 * give-up row the fourth (`:1912`); the middle two follow the same palette, requirement S7.
 */
const OUTCOME_COLORS = Object.freeze({
  assigned: '#3fb27f',
  reassigned: '#e0b040',
  unassigned: '#e0473a',
  empty: '#4d5a6b',
});

/**
 * What each cost term measures, **quoted from `data/dispatcher-profiles.json`'s own `terms`
 * library** and lower-cased to sit inside a sentence.
 *
 * Quoted rather than paraphrased on purpose. The cost-term library is the single description of
 * what a dispatcher is doing; a second set of words here would be a second source of truth about
 * it, and the first thing to happen to a second source of truth in this repository is that it goes
 * stale. `decisions.test.ts` reads the JSON and asserts that this table's ids and wording still
 * match it, so a term renamed in `data/` fails a test rather than producing a rail row describing
 * a term that no longer exists.
 *
 * The **unit** is deliberately not here: it comes from `core`'s `COST_TERMS_BY_ID`, which is where
 * the SI unit of a term's raw value is declared. Copying it would be the third copy.
 */
export const TERM_PHRASES: Readonly<Record<string, { readonly measures: string; readonly serves: string }>> =
  Object.freeze({
    waitTime: { measures: 'estimated wait for the new passenger', serves: 'AWT' },
    rideTime: { measures: 'estimated in-car time for the new passenger', serves: 'TTD' },
    detourPenalty: {
      measures: 'added delay imposed on already-onboard passengers',
      serves: 'Fairness to boarded',
    },
    diversionDetour: {
      measures: 'added delay imposed on already-onboard passengers, when the call diverts the car',
      serves: 'Fairness to boarded, without taxing traffic the diversion never touches',
    },
    existingCallDelay: {
      measures: 'added delay to other already-assigned calls',
      serves: 'Global optimality',
    },
    directionReversal: {
      measures: 'penalty for reversing travel direction',
      serves: 'Collective behavior',
    },
    loadFactor: {
      measures: 'penalty rising as the car approaches capacity',
      serves: 'Capacity awareness',
    },
    stopCount: { measures: 'number of stops added', serves: 'Energy, ride annoyance' },
    distanceTravelled: { measures: 'metres of travel added', serves: 'Energy proxy' },
    starvation: {
      measures: 'escalating penalty on the longest-waiting call',
      serves: 'WT95, % > 60s',
    },
    zoneAffinity: { measures: "deviation from the car's assigned zone", serves: 'Zoning strategies' },
    predictedDemand: {
      measures: 'misalignment with forecast future calls',
      serves: 'Pre-positioning',
    },
    crowding: { measures: 'hall queue length at the pickup floor', serves: 'Parallel service' },
  });

/**
 * `core`'s own `DecisionReason` values, in words a rail can print.
 *
 * One entry per member of `DECISION_REASONS`. Two of them — the batch and defer windows — belong
 * to the `deferred` outcome that `DecisionCollector` drops before it ever reaches a recording;
 * they are here anyway so that a reason arriving from a recording written by a different build
 * produces a sentence rather than a raw identifier.
 */
const REASON_PHRASES: Readonly<Record<string, string>> = Object.freeze({
  'no-eligible-car': 'no car in the group may answer this call',
  'awaiting-batch-window': 'the batch window is still open',
  'awaiting-defer-window': 'the defer window is still open',
  'reassignment-disabled': 'this dispatcher does not reassign',
  committed: 'the holding car is already committed to it',
  'max-reassignments': 'it has been reassigned as often as this dispatcher allows',
  'below-hysteresis': 'the better car was not better by enough to justify the swap',
  'incumbent-best': 'the car that already held it was still the cheapest',
});

/** The design's empty state, verbatim — `:2534`. */
const EMPTY_WHY = 'no calls registered yet — the building is still waking up';

/**
 * The newest `limit` decisions at or before `t`, newest first.
 *
 * Returns the design's single *standing by* row when the recording carries no decision at all —
 * which is a legal state, not a bug: `RecordRunOptions.recordDecisions` turns the instrumentation
 * off for the replication batch, and a recording loaded from a pre-schema-7 file has none.
 */
export function decisionRowsAt(
  recording: VizRecording,
  simTimeS: SimTime,
  limit: number = DEFAULT_DECISION_ROWS,
): readonly DecisionRow[] {
  const t = clamp(simTimeS, recording.startedAt, recording.endedAt);
  const rows: DecisionRow[] = [];
  const wanted = Math.max(0, Math.floor(limit));

  // Ascending by `(at, callId)`, so walking backwards from the end yields newest-first directly
  // and stops as soon as it is past the playhead — no filter, no reverse, no second array.
  for (let index = recording.decisions.length - 1; index >= 0 && rows.length < wanted; index -= 1) {
    const decision = recording.decisions[index];
    if (decision === undefined) continue;
    if (decision.at > t) continue;
    rows.push(rowOf(recording, decision));
  }

  if (rows.length > 0) return rows;
  return [
    {
      key: 'standing-by',
      t: clockAt(t),
      head: 'standing by',
      why: EMPTY_WHY,
      title: EMPTY_WHY,
      color: OUTCOME_COLORS.empty,
      outcome: 'empty',
    },
  ];
}

function rowOf(recording: VizRecording, decision: VizDecision): DecisionRow {
  const floorLabel = floorLabelOf(recording, decision.floorId);
  const carLabel = carLabelOf(recording, decision.carId);
  return {
    key: `${String(decision.at)}-${decision.callId}`,
    t: clockAt(decision.at),
    head: headOf(decision, carLabel, floorLabel),
    why: whyOf(decision),
    title: titleOf(decision),
    color: OUTCOME_COLORS[decision.outcome],
    outcome: decision.outcome,
  };
}

/**
 * `A → Level 12` for an assignment; something honest for the other two.
 *
 * A reassignment is not an assignment and does not get the same arrow: the call already had a car
 * and this is the group changing its mind, which is a different event to a reader watching the
 * same landing twice. An `unassigned` decision has no car at all, so the head says so rather than
 * leaving an empty slot where a car label goes.
 */
function headOf(
  decision: VizDecision,
  carLabel: string | undefined,
  floorLabel: string,
): string {
  if (decision.outcome === 'unassigned') return `no car for ${floorLabel}`;
  if (carLabel === undefined) {
    // Unreachable for a recording this build produced; reachable for one loaded from a file whose
    // shafts this build does not have. Naming the gap beats naming a shaft that is not on screen.
    return `a car outside this recording → ${floorLabel}`;
  }
  return decision.outcome === 'reassigned'
    ? `${carLabel} ⇄ ${floorLabel}`
    : `${carLabel} → ${floorLabel}`;
}

/**
 * One line, built from the recorded term breakdown.
 *
 * The dominant term — `VizDecision.terms` is already sorted by `|contribution|`, largest first —
 * with its **raw** value in its own unit, then how far clear of the next car it was. Raw rather
 * than the contribution, because *`waitTime` 12.4 s* is a fact about the building a reader can
 * check against the picture, whereas *`waitTime` 0.31* is a fact about the normaliser.
 */
function whyOf(decision: VizDecision): string {
  if (decision.outcome === 'unassigned') return unassignedWhy(decision);

  const clauses: string[] = [];
  const top = decision.terms[0];
  clauses.push(
    top === undefined
      // `topTerms` drops terms that contributed exactly zero, so an empty array means every
      // weighted term priced this car the same as every other. The design's own fallback.
      ? "cheapest bid on the group's own cost"
      : `${top.termId} ${formatRaw(top)} carried it`,
  );

  const margin = marginOf(decision);
  if (decision.eligibleCars <= 1) clauses.push('the only car that could take it');
  else if (margin !== undefined) {
    clauses.push(
      margin < 0.005
        ? 'neck and neck with the next car'
        : `${margin.toFixed(2)} clear of the next car`,
    );
  }
  return clauses.join(' · ');
}

/**
 * Why nobody took it — the interesting rows.
 *
 * `eligibleCars === 0` is *nobody bid*; anything above zero on an unassigned decision is *cars bid
 * and none could take it*. That is the whole of the distinction the recording supports, and the
 * two have different fixes: the first is a zoning, access or service-mode problem and no amount of
 * traffic clearing will help it; the second is congestion and will clear.
 */
function unassignedWhy(decision: VizDecision): string {
  const clauses: string[] = [
    decision.eligibleCars === 0
      ? 'no car may answer this call'
      : `${String(decision.eligibleCars)} cars bid and none could take it`,
  ];
  const reason = decision.reason;
  /*
   * `no-eligible-car` is the reason for the clause already written, so appending its phrase gives
   * *"no car may answer this call · no car in the group may answer this call"* — the same sentence
   * twice, which is what a Secure Tower run under `collective` produces on every credentialed
   * floor, six rows at a time. The clause above is the more specific of the two, so the reason is
   * dropped rather than the clause.
   */
  if (reason !== undefined && !(reason === 'no-eligible-car' && decision.eligibleCars === 0)) {
    clauses.push(REASON_PHRASES[reason] ?? reason);
  }
  if (decision.waitingPassengers !== undefined && decision.waitingPassengers > 0) {
    clauses.push(`${String(decision.waitingPassengers)} standing there`);
  }
  return clauses.join(' · ');
}

/**
 * The tooltip: what the dominant term measures, what it serves, and the costs behind the margin.
 *
 * The `measures`/`serves` wording is the cost-term library's own — see {@link TERM_PHRASES}.
 */
function titleOf(decision: VizDecision): string {
  if (decision.outcome === 'unassigned') return unassignedWhy(decision);
  const parts: string[] = [];
  const top = decision.terms[0];
  if (top !== undefined) {
    const phrase = TERM_PHRASES[top.termId];
    parts.push(
      phrase === undefined
        ? `${top.termId}: ${formatRaw(top)}`
        : `${top.termId} — ${phrase.measures} (serves ${phrase.serves}): ${formatRaw(top)}`,
    );
  }
  if (decision.cost !== undefined) {
    parts.push(
      decision.runnerUpCost === undefined
        ? `weighted cost ${decision.cost.toFixed(3)}`
        : `weighted cost ${decision.cost.toFixed(3)}, next best ${decision.runnerUpCost.toFixed(3)}`,
    );
  }
  parts.push(`${String(decision.eligibleCars)} cars eligible`);
  return parts.join('. ');
}

/** `runnerUpCost - cost`, or `undefined` when either is absent. Dimensionless — see the docstring. */
function marginOf(decision: VizDecision): number | undefined {
  const { cost, runnerUpCost } = decision;
  if (cost === undefined || runnerUpCost === undefined) return undefined;
  return Math.max(0, runnerUpCost - cost);
}

/**
 * A term's raw value with its unit, from `core`'s `COST_TERMS_BY_ID`.
 *
 * Dimensionless terms (`stopCount`, `loadFactor`, `crowding`, `directionReversal`) declare `''`
 * and get no suffix. One decimal place throughout, including on counts: `stopCount 3.0` is
 * honest about a value the scorer may hold fractionally, and rounding it to `3` in a rail while
 * the editor's tooltip shows `3.4` is how two surfaces come to disagree.
 */
function formatRaw(term: VizDecisionTerm): string {
  const unit = COST_TERMS_BY_ID.get(term.termId)?.unit ?? '';
  const value = term.raw.toFixed(1);
  return unit === '' ? value : `${value} ${unit}`;
}

/** The shaft's own label, or `undefined` when this recording draws no such car. */
function carLabelOf(recording: VizRecording, carId: string | undefined): string | undefined {
  if (carId === undefined) return undefined;
  return recording.shafts.find((shaft) => shaft.carId === carId)?.label;
}

/** The floor's own label, or its id, or a phrase naming the gap. Never a foreign identifier. */
function floorLabelOf(recording: VizRecording, floorId: string): string {
  const floor = recording.floors.find((candidate) => candidate.id === floorId);
  if (floor === undefined) return 'a floor outside this recording';
  return floor.label ?? floor.id;
}

function clamp(value: number, low: number, high: number): number {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}
