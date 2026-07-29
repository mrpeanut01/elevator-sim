/**
 * The run summary, in a reader's register — `docs/10-experience-layer-contract.md` § 7 and § 11 **W2**.
 *
 * `VizSummary` gained eleven fields at schema version 5 and this file is the reason each of them
 * was allowed to arrive. The roadmap's standing requirement is not *"is it reachable?"* but
 * *"name the non-test caller"*, and the design says in as many words that W2 *"is the unit most
 * likely to acquire a field with no consumer"*. So: one field, one figure, same change. The
 * figures are mounted by `src/dev/main.ts`, which is this package's shipped caller for every
 * other pure renderer in `src/render/` too.
 *
 * ## Why a figure list rather than DOM, and rather than canvas calls
 *
 * `src/boundaries.test.ts` confines the DOM to `src/dev/`, so a renderer here returns data and
 * `dev/main.ts` instantiates it — the same split `render/describeFrame.ts` and
 * `controls/render.ts` already use, and the reason the whole package is testable under plain Node
 * with no jsdom.
 *
 * It is **not** drawn on the canvas, and that is a deviation from W2's stated non-test caller
 * (*"`render/overlay.ts` and `render/canvas.ts`"*) with three reasons, recorded rather than
 * assumed:
 *
 * 1. **R3 needs prose.** A suppressed figure is replaced by its *reason*, and the shipped reason
 *    strings run past 200 characters. `render/overlay.ts` already spends four of its lines
 *    wrapping one of them at an approximated monospace advance, and its remaining height is
 *    allocated by arithmetic that three separate browser measurements went into. Adding nine more
 *    rows to that budget would push the bank and car lists off the panel on every building.
 * 2. **R7 needs copyable.** A seed drawn into a bitmap cannot be selected. Text can.
 * 3. **The figures are properties of the *run*, not of the frame.** Nothing here changes as the
 *    playhead moves, so redrawing them 60 times a second onto a canvas is the wrong surface for
 *    the wrong reason.
 *
 * What the canvas *does* gain is the window (§ 7.4): `drawFooter` names it, so the exported PNG
 * says which 300 seconds its numbers cover. That is the one clause of W2 that has to be on the
 * bitmap, because the bitmap is what leaves the building.
 *
 * ## The three rules this file is the enforcement point for
 *
 * - **R3 / R9 — one gate.** {@link meansAreSuppressed} is asked once, here, and it decides
 *   exactly the three figures `RunSummary.awtIsValid` speaks for. Nothing else in this file
 *   re-derives saturation, and nothing else is hidden by it: an observation is drawn on a
 *   saturated run because seeing the divergence is the point.
 * - **R11 — energy is an axis, never a score.** {@link ENERGY_ID} sits between {@link WT95_ID}
 *   and nothing else, `workPerServedLegKJ` is in the same figure as `workKJ`, and no figure's
 *   text combines an energy quantity with a wait quantity. `measured: false` prints
 *   **"not recorded"**, never `0 kJ`.
 * - **R13 — no estimate without its `n`, and no invented denominator.** Every estimate carries
 *   {@link SummaryFigure.count}, and a natural-frequency restatement (*"1 in 20 rides…"*) is
 *   emitted **only** when the sample is at least as large as the denominator it names. Measured:
 *   Garden Apartments, `collective`, seed 42 quotes a valid AWT over **five** legs. There is no
 *   twentieth ride to be one in twenty of.
 */

import { meansAreSuppressed } from '../frame/overlay.js';
import type { VizRecording, VizSummary } from '../contract/types.js';

/* -------------------------------------------------------------------------- *
 * The shape
 * -------------------------------------------------------------------------- */

/**
 * What kind of claim a figure is making. The distinction `docs/10` § 1 says matters — and the one
 * `frame/overlay.ts` already draws one level down — is observation versus estimate, not technical
 * versus plain.
 *
 * - `observation` — a fact about the run that happened. Never suppressed; these are how a reader
 *   *sees* a queue diverging.
 * - `estimate` — a mean or a percentile. Carries its `n`.
 * - `suppressed` — an estimate the run's own summary refuses to stand behind. The value slot says
 *   so and {@link SummaryFigure.note} carries the reason (R3).
 * - `absent` — the run did not measure this. Distinct from `suppressed`, which is a refusal, and
 *   from zero, which is a measurement.
 */
export type SummaryFigureKind = 'observation' | 'estimate' | 'suppressed' | 'absent';

/** Whether a figure is reporting a failure. Never the *only* signal — the words say it too. */
export type SummarySeverity = 'normal' | 'warning';

/** One bar of a paired bar — `docs/10` § 3.5's offered-versus-carried. */
export interface SummaryBar {
  readonly label: string;
  /** `0`–`1` of the row's track, both bars scaled against the same maximum. */
  readonly fraction: number;
  /** The number the bar stands for, formatted. A bar is never the only carrier of its value. */
  readonly text: string;
}

/** One row of the run summary. */
export interface SummaryFigure {
  /** Stable id, for the mount and for the tests. Never used to special-case a style. */
  readonly id: string;
  readonly label: string;
  /**
   * The figure, formatted — or, when suppressed, the word that replaces it.
   *
   * Never a blank, never a dash, never a zero standing in for an absent measurement (R3).
   */
  readonly value: string;
  /** The count the estimate was computed from. Present on every `estimate`. R13. */
  readonly count?: string | undefined;
  /** The caveat, the reason, or the definition. Same visual unit as the value, never a tooltip. */
  readonly note?: string | undefined;
  readonly kind: SummaryFigureKind;
  readonly severity: SummarySeverity;
  /** Paired bars. Empty for a plain row. */
  readonly bars: readonly SummaryBar[];
}

/** Figure ids, exported so the acceptance tests and the mount name the same things. */
export const RUN_ID = 'run';
export const WINDOW_ID = 'window';
export const DEMAND_ID = 'demand';
export const AWT_ID = 'awt';
export const WT95_ID = 'wt95';
export const ENERGY_ID = 'energy';
export const TTD_ID = 'ttd';
export const LONG_WAITS_ID = 'long-waits';
export const INTERVAL_ID = 'interval';
export const SERVICE_LEVEL_ID = 'service-level';

/**
 * The order figures are drawn in, and it is load-bearing in exactly one place.
 *
 * R11 clause 1: the energy axis is shown **only beside** AWT and WT95, never on its own and never
 * as a gauge with a good end and a bad end. `nearest-car` is on the Pareto front at six of eight
 * matrix cells *because it is worse at serving people*, so an energy figure that a reader can see
 * without also seeing what the wait cost is the shape of the mistake, whatever it is labelled.
 */
export const FIGURE_ORDER = [
  RUN_ID,
  WINDOW_ID,
  DEMAND_ID,
  AWT_ID,
  WT95_ID,
  ENERGY_ID,
  TTD_ID,
  LONG_WAITS_ID,
  INTERVAL_ID,
  SERVICE_LEVEL_ID,
] as const;

/* -------------------------------------------------------------------------- *
 * Formatting
 * -------------------------------------------------------------------------- */

const seconds = (value: number, places = 1): string => `${value.toFixed(places)} s`;

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/**
 * `n = 5 rides`. The unit is named because a leg is not a person — the wave-1 defect.
 *
 * Both forms are passed rather than an `s` appended, because the plurals this panel needs are
 * *"ride delivered"* → *"rides delivered"* and *"arrival"* → *"arrivals"*, and a suffix rule gets
 * the first one wrong in the direction that reads as a typo in the number's own label.
 */
const sampleOf = (n: number, one: string, many = `${one}s`): string =>
  `n = ${String(n)} ${plural(n, one, many)}`;

/**
 * The suppression reason, in one place.
 *
 * Identical to `overlayAt`'s fallback on purpose: two surfaces explaining the same refusal in two
 * sentences is how a reader learns to distrust both. `awtInvalidReason` is the summary's own
 * words whenever it has any.
 */
function suppressionReason(summary: VizSummary): string {
  return (
    summary.awtInvalidReason ??
    'the run saturated: the queues did not reach a steady state, so a mean wait describes nothing.'
  );
}

/* -------------------------------------------------------------------------- *
 * The figures
 * -------------------------------------------------------------------------- */

interface Draft {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly count?: string;
  readonly note?: string;
  readonly kind: SummaryFigureKind;
  readonly severity?: SummarySeverity;
  readonly bars?: readonly SummaryBar[];
}

function figure(draft: Draft): SummaryFigure {
  return {
    id: draft.id,
    label: draft.label,
    value: draft.value,
    ...(draft.count === undefined ? {} : { count: draft.count }),
    ...(draft.note === undefined ? {} : { note: draft.note }),
    kind: draft.kind,
    severity: draft.severity ?? 'normal',
    bars: draft.bars ?? [],
  };
}

/**
 * Which run this is — building, dispatcher and **the seed**, which R7 says stays visible in every
 * mode including Basic.
 *
 * It is repeated here rather than left to the status line because this panel is a new surface and
 * a run whose seed is on a different surface is a run somebody will screenshot without it. The
 * figure is rendered as text rather than into the canvas, so it is selectable and copyable.
 */
function runFigure(recording: VizRecording): SummaryFigure {
  return figure({
    id: RUN_ID,
    label: 'run',
    value: `${recording.buildingName} · ${recording.dispatcherProfileId}`,
    note: `seed ${recording.seed} — every number below replays exactly from it.`,
    kind: 'observation',
  });
}

/** § 7.4 — every figure carries its window, so this one states it once for all of them. */
function windowFigure(summary: VizSummary): SummaryFigure {
  const span = summary.reportWindow;
  return figure({
    id: WINDOW_ID,
    label: 'reporting window',
    value: `${span.id} · ${span.startS.toFixed(0)}–${span.endS.toFixed(0)} s`,
    note:
      `${summary.windowSeconds.toFixed(0)} s of simulated time. Every figure below is over this ` +
      'window and over nothing else.',
    kind: 'observation',
  });
}

/**
 * § 3.5 — offered demand beside answered demand, as one paired bar.
 *
 * Two observations, in the same unit, neither suppressible. The design calls it the highest-value
 * single addition in the whole of Phase 9 because it explains saturation *before* the queue
 * visibly diverges: the arriving bar is longer than the carried one, and that is the whole
 * finding.
 */
function demandFigure(summary: VizSummary): SummaryFigure {
  const { offeredPer5Min, personsPer5Min, pctPopulationPer5Min } = summary.handlingCapacity;
  // Both bars against the same track, or the comparison the row exists for is a lie. A run that
  // moved nobody and offered nobody gets an empty track rather than a division by zero.
  const track = Math.max(offeredPer5Min, personsPer5Min);
  const fraction = (value: number): number => (track > 0 ? value / track : 0);
  return figure({
    id: DEMAND_ID,
    label: 'demand answered',
    value:
      `${offeredPer5Min.toFixed(1)} people arrived per 5 min · ` +
      `${personsPer5Min.toFixed(1)} carried per 5 min`,
    note:
      pctPopulationPer5Min === null
        ? 'This record carries no building population, so there is no % of population figure.'
        : `${pctPopulationPer5Min.toFixed(1)} % of the building moved every 5 minutes.`,
    kind: 'observation',
    severity: personsPer5Min < offeredPer5Min ? 'warning' : 'normal',
    bars: [
      { label: 'arriving', fraction: fraction(offeredPer5Min), text: offeredPer5Min.toFixed(1) },
      { label: 'carried', fraction: fraction(personsPer5Min), text: personsPer5Min.toFixed(1) },
    ],
  });
}

/**
 * One of the three figures `awtIsValid` speaks for, drawn or refused.
 *
 * The refusal is a *value*, not an absence: `'suppressed'` in the value slot and the summary's own
 * reason in the note, in the same row. R3 forbids a blank, a dash, a zero and a substituted
 * number, and the panel that already does this correctly — `render/overlay.ts` — is the shape
 * copied here rather than a second invention.
 */
function gatedFigure(
  id: string,
  label: string,
  value: number,
  count: string,
  note: string | undefined,
  suppressed: boolean,
  summary: VizSummary,
): SummaryFigure {
  if (suppressed) {
    return figure({
      id,
      label,
      value: 'suppressed',
      count,
      note: suppressionReason(summary),
      kind: 'suppressed',
      severity: 'warning',
    });
  }
  return figure({
    id,
    label,
    value: seconds(value),
    count,
    ...(note === undefined ? {} : { note }),
    kind: 'estimate',
  });
}

/**
 * WT95's plain-language form, and the denominator check that governs it.
 *
 * § 7.1: *"1 in 20 **rides** waited more than a minute"* — rides, not riders, because `WT95` is
 * computed over legs and a sky-lobby journey boards twice. R13 clause two: the restatement is
 * printed only when the sample is at least as large as the denominator it names. Below twenty
 * legs there is no twentieth ride, and inventing one in the section justified by the
 * natural-frequency literature — which is about making denominators *visible* — is the error the
 * rule exists to stop.
 */
function wait95Note(summary: VizSummary): string {
  if (summary.waitCount >= 20) {
    return `1 in 20 rides waited more than ${summary.wait95S.toFixed(0)} s.`;
  }
  return (
    'Fewer than 20 rides were served in this window, so a one-in-twenty restatement would ' +
    'name a ride the sample does not contain. This is the 95th percentile of the rides there ' +
    'were.'
  );
}

/**
 * The energy axis — R11, in the one figure that carries it.
 *
 * Five numbers in one row, deliberately: the work, the work per ride delivered, that ratio's
 * denominator, the metres and the starts. Splitting them across rows would let a reader see the
 * total without the per-ride figure, and *a configuration that spends less by serving fewer
 * people has not saved anything*.
 */
function energyFigure(summary: VizSummary): SummaryFigure {
  const { energy } = summary;
  const label = 'drive work (proxy)';
  if (!energy.measured || energy.workKJ === null) {
    return figure({
      id: ENERGY_ID,
      label,
      // Never `0 kJ`. `measured: false` means nobody wrote it down, which is not the same fact as
      // the cars not moving, and zeroing it would make every arm tie on energy.
      value: 'not recorded',
      note: 'This run recorded no travel, which is not the same as the cars not having moved.',
      kind: 'absent',
    });
  }
  const perLeg =
    energy.workPerServedLegKJ === null
      ? 'no ride was completed in this window, so there is no per-ride figure'
      : `${energy.workPerServedLegKJ.toFixed(2)} kJ per ride delivered`;
  const movement = [
    energy.distanceM === null ? undefined : `${energy.distanceM.toFixed(0)} m travelled`,
    energy.starts === null
      ? undefined
      : `${energy.starts.toFixed(0)} motor ${plural(energy.starts, 'start', 'starts')}`,
  ].filter((part): part is string => part !== undefined);
  return figure({
    id: ENERGY_ID,
    label,
    value: `${energy.workKJ.toFixed(1)} kJ · ${perLeg}`,
    count: sampleOf(energy.deliveredLegCount, 'ride delivered', 'rides delivered'),
    note:
      `${movement.join(', ')}. Kilojoules of out-of-balance mechanical work, not kWh: it omits ` +
      'acceleration losses, drive and gearing efficiency, door motors and standby power. An axis ' +
      'beside the waits above, never a score — the arm that drives least is the arm that carried ' +
      'fewest people.',
    kind: 'observation',
  });
}

/**
 * % over the long-wait threshold, with the hole in its denominator named beside it.
 *
 * An **observation** — a count over served legs — so it survives suppression, which is why § 5.2
 * lists it as checkable. Its denominator is *served* legs and the unserved are systematically the
 * ones that would have counted, so `unservedCount` is printed every time rather than when it
 * looks bad (§ 7.1: *"Show `unservedCount` beside it, always"*).
 */
function longWaitsFigure(summary: VizSummary): SummaryFigure {
  const threshold = summary.longWaitThresholdS.toFixed(0);
  const censoring =
    `${String(summary.unservedCount)} ${plural(summary.unservedCount, 'ride', 'rides')} arrived ` +
    'in this window and never boarded; they are not in that denominator, and they are the ones ' +
    'that would have counted.';
  if (summary.pctOverLongWait === null) {
    return figure({
      id: LONG_WAITS_ID,
      label: `rides over ${threshold} s`,
      value: 'no ride was served in this window',
      note: censoring,
      kind: 'absent',
    });
  }
  const pct = summary.pctOverLongWait;
  // R13 clause two again, at the denominator this sentence names. "8 in 100" over 41 legs is a
  // rounding artefact wearing a frequency's clothes.
  const frequency =
    summary.waitCount >= 100
      ? ` That is ${pct.toFixed(0)} in 100 rides.`
      : ' Fewer than 100 rides were served, so it is stated as a percentage and not as "n in 100".';
  return figure({
    id: LONG_WAITS_ID,
    label: `rides over ${threshold} s`,
    value: `${pct.toFixed(1)} %`,
    count: sampleOf(summary.waitCount, 'ride served', 'rides served'),
    note: `${censoring}${frequency}`,
    kind: 'observation',
    severity: pct > 0 ? 'warning' : 'normal',
  });
}

/**
 * Achieved INT, and the coefficient of variation printed as a number and never as a word.
 *
 * § 7.2 is explicit that `intervalCoV` gets no plain-language form: mapping a dispersion statistic
 * onto *"clumpy"* versus *"even"* is R10's banned operation one type down, and it would need a
 * threshold nothing in `core` supplies. So the definition is printed beside the number and the
 * reader is left to it.
 */
function intervalFigure(summary: VizSummary): SummaryFigure {
  const { achievedInterval } = summary;
  if (achievedInterval.meanS === null || achievedInterval.count === 0) {
    return figure({
      id: INTERVAL_ID,
      label: 'interval at the terminal',
      value: 'no departure interval could be reconstructed in this window',
      note:
        'Departures are inferred from boardings at the terminal floor; this run has too few, or ' +
        "this building's door timings make a reopen and a departure indistinguishable.",
      kind: 'absent',
    });
  }
  const cov =
    achievedInterval.coefficientOfVariation === null
      ? 'Too few gaps to report a coefficient of variation.'
      : `Spacing CoV ${achievedInterval.coefficientOfVariation.toFixed(2)} — the gaps' standard ` +
        'deviation divided by their mean. This project sets no threshold for it, so it is a ' +
        'number here and not a verdict.';
  return figure({
    id: INTERVAL_ID,
    label: 'interval at the terminal',
    value: `a lift left every ${seconds(achievedInterval.meanS)}`,
    count: sampleOf(achievedInterval.count, 'gap'),
    note: cov,
    kind: 'estimate',
  });
}

/**
 * The service-level verdict — R4's **Abandoned** fail state, and the longest wait behind it.
 *
 * The censoring clause is the one that matters: a rider who never boarded has a wait *so far*,
 * which is a lower bound, so the sentence becomes *"waited at least …"* and says why. § 7.1 asks
 * for exactly that and the alternative — drawing the two cases identically — understates the
 * figure precisely where the service was worst.
 */
function serviceLevelFigure(summary: VizSummary): SummaryFigure {
  const level = summary.serviceLevel;
  const horizon = level.horizonS.toFixed(0);
  if (level.longestWaitS === null) {
    return figure({
      id: SERVICE_LEVEL_ID,
      label: 'the unluckiest rider',
      value: 'no ride arrived in this window',
      note: `Verdict: ${level.verdict}.`,
      kind: 'absent',
    });
  }
  const value = level.longestWaitIsCensored
    ? `waited at least ${seconds(level.longestWaitS)} and never boarded`
    : `waited ${seconds(level.longestWaitS)}`;
  return figure({
    id: SERVICE_LEVEL_ID,
    label: 'the unluckiest rider',
    value,
    count: sampleOf(level.arrivalCount, 'arrival'),
    note:
      `Verdict: ${level.verdict}. ${String(level.overHorizonCount)} ` +
      `${plural(level.overHorizonCount, 'ride', 'rides')} waited past the ${horizon} s ` +
      'abandonment horizon.',
    kind: 'observation',
    severity: level.verdict === 'starved' ? 'warning' : 'normal',
  });
}

/* -------------------------------------------------------------------------- *
 * The panel
 * -------------------------------------------------------------------------- */

/**
 * Every figure of the run summary, ordered by {@link FIGURE_ORDER}.
 *
 * Pure, total, and a function of the recording alone: two recordings that are equal produce equal
 * figures, which is the property that lets `runSummary.test.ts` assert each value against a
 * recomputation from the summary rather than against a literal. A literal expectation is what
 * makes a field replaceable by a constant with the suite still green.
 *
 * The ordering is applied here rather than left to the order the array happens to be written in,
 * because R11's *"only beside AWT and WT95"* is a claim about adjacency and a claim nothing
 * enforces is a comment. A figure missing from {@link FIGURE_ORDER}, or an id in it that no
 * figure produces, throws — the mount would otherwise silently drop the row.
 */
export function runSummaryFigures(recording: VizRecording): readonly SummaryFigure[] {
  const { summary } = recording;
  // Asked once. `docs/10` R9: a module that re-derives saturation from queue samples is a defect,
  // not an optimization, and there were three copies of this expression before § D111.
  const suppressed = meansAreSuppressed(recording);

  const built = [
    runFigure(recording),
    windowFigure(summary),
    demandFigure(summary),
    gatedFigure(
      AWT_ID,
      'average wait',
      summary.meanWaitS,
      sampleOf(summary.waitCount, 'ride'),
      'Registration at the landing to boarding, averaged over the rides in the window.',
      suppressed,
      summary,
    ),
    gatedFigure(
      WT95_ID,
      '95th-percentile wait',
      summary.wait95S,
      sampleOf(summary.waitCount, 'ride'),
      wait95Note(summary),
      suppressed,
      summary,
    ),
    energyFigure(summary),
    gatedFigure(
      TTD_ID,
      'door to door',
      summary.meanTimeToDestinationS,
      sampleOf(summary.timeToDestinationCount, 'journey'),
      'A whole journey, spanning every leg and every transfer — not the same unit as the waits ' +
        'above, which are per ride.',
      suppressed,
      summary,
    ),
    longWaitsFigure(summary),
    intervalFigure(summary),
    serviceLevelFigure(summary),
  ];

  const byId = new Map(built.map((item) => [item.id, item]));
  if (byId.size !== built.length) {
    throw new Error('runSummaryFigures: two figures share an id, so one of them would be lost.');
  }
  const ordered = FIGURE_ORDER.map((id) => {
    const item = byId.get(id);
    if (item === undefined) {
      throw new Error(`runSummaryFigures: FIGURE_ORDER names "${id}" and no figure produced it.`);
    }
    byId.delete(id);
    return item;
  });
  const orphan = [...byId.keys()][0];
  if (orphan !== undefined) {
    throw new Error(
      `runSummaryFigures: figure "${orphan}" is not in FIGURE_ORDER, so nothing decides where ` +
        'it is drawn relative to the energy axis. See R11.',
    );
  }
  return ordered;
}

/**
 * The canvas footer's window clause — § 7.4 on the one surface that leaves the building.
 *
 * `Export PNG` bakes the canvas into a file, so a bitmap whose numbers do not say which 300
 * seconds they cover is a bitmap that will be read as covering the run. Kept here beside the
 * figure that says the same thing in the panel, so the two cannot word it differently.
 */
export function windowClause(summary: VizSummary): string {
  const span = summary.reportWindow;
  return `window ${span.id} ${span.startS.toFixed(0)}–${span.endS.toFixed(0)} s`;
}
