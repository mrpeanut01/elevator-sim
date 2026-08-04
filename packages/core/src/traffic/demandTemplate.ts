/**
 * Demand templates: the shape of demand over a run, and which slice of it is reported.
 *
 * ## Why the shape matters statistically, not just physically
 *
 * docs/03-traffic-and-statistics.md § The independence condition: confidence-interval maths
 * requires each replication's average waiting time to be independent of every other's, and
 * waiting times *within* one run are correlated. So a single long constant-demand run
 * supports no confidence interval at all, however long it is.
 *
 * The **rise-and-fall** template (CIBSE Guide D) resolves that. Each replication is a short,
 * self-contained terminating simulation — demand ramps up from nothing, holds at the peak
 * for five minutes, ramps back down — and results are reported over the peak five minutes.
 * Every replication is an independently generated passenger set, so replications are
 * independent and a paired-t interval across them means something. This is the recommended
 * template, and the default.
 *
 * The **constant** template (draft ISO 8100-32) is the alternative the literature also
 * documents: one 120-minute run at a steady rate, discarding the first 15 minutes of warm-up
 * and the last 5 of cool-down. It is supported for cross-checking a single run against the
 * analytical baseline. It is **not** a basis for comparing two dispatchers.
 *
 * ## Shape is code, numbers are data
 *
 * A ramp is a ramp — that is the code here. Every quantity (`durationMin`, the reported
 * window, the discards, the endpoint mixes) comes from `data/traffic-profiles.json →
 * demandTemplates` or from an explicit override, per CLAUDE.md invariant 7, and each override is
 * declared in `TRAFFIC_PARAMETERS`. There is no `if (template === 'rise-and-fall') { rate = 0.7 }`
 * anywhere: all three templates are the same piecewise-linear evaluator over different phase
 * lists.
 *
 * ## The third template, and the one thing it adds
 *
 * The **lunch two-way** template (CIBSE Guide D) is the only one whose *directional mix* moves
 * within a run: occupants ride down to leave the building and back up on their return, so the same
 * period is outgoing-dominant early and incoming-dominant late. `DECISIONS.md` § D156 measured the
 * other two flat in the mix — largest standardized deviation +1.83 σ across eight operating points
 * — because `DemandPhase` carried a scalar intensity and nothing else. It now carries an optional
 * pair of endpoint mixes, read by the same evaluator, and {@link splitAt} is `intensityAt`'s twin.
 *
 * **Opt-in, and byte-identical when unused** (§ D151 § 7): a phase that declares no mix leaves
 * every floor on its own traffic profile's split, which is what every published figure in this
 * repository was measured under, and `traffic/mixIdentity.test.ts` holds the two shipped templates
 * to that byte for byte.
 */

import type { DemandTemplate, DirectionalSplit } from '../config/types.js';

import {
  DEMAND_TEMPLATE_IDS,
  TRAFFIC_DEFAULTS,
  TrafficError,
  type DemandPhase,
  type DemandTemplateId,
  type DemandTemplateOverrides,
  type ResolvedDemandTemplate,
} from './types.js';

const SECONDS_PER_MINUTE = 60;

function requirePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TrafficError(`Demand template ${label} must be positive and finite; received ${value}`);
  }
  return value;
}

function requireNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new TrafficError(
      `Demand template ${label} must be non-negative and finite; received ${value}`,
    );
  }
  return value;
}

/** `∫ intensity dt` over one linear segment: the trapezoid. */
function phaseIntegral(phase: DemandPhase): number {
  return ((phase.startIntensity + phase.endIntensity) / 2) * (phase.endS - phase.startS);
}

/** Rescale to sum to 1, rejecting a mix nobody could travel. */
function normalizedSplit(split: DirectionalSplit, label: string): DirectionalSplit {
  for (const [name, value] of Object.entries(split)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new TrafficError(
        `Demand template ${label}.${name} must be non-negative and finite; received ${value}`,
      );
    }
  }
  const total = split.incoming + split.outgoing + split.interfloor;
  if (total <= 0) {
    throw new TrafficError(
      `Demand template ${label} gives every direction a zero share, which is a building nobody travels in rather than a demand pattern.`,
    );
  }
  return {
    incoming: split.incoming / total,
    outgoing: split.outgoing / total,
    interfloor: split.interfloor / total,
  };
}

/**
 * The **time-average** of the phases' splits, or `undefined` when no phase declares one.
 *
 * Exact rather than quadrature: each phase's split is linear in `t`, so its integral is the
 * trapezoid `(start + end)/2 · span`, the same shape {@link phaseIntegral} uses for intensity.
 *
 * Time-weighted rather than demand-weighted, and the distinction is worth stating because it
 * *could* matter and on the shipped template does not: `lunch-two-way`'s intensity is symmetric
 * about the run's midpoint and its mix arc is antisymmetric about the same point, so the two
 * averages coincide exactly at 45/45/10. Time-weighted is the one that can be computed in closed
 * form from the phase list alone, which is why it is the one recorded.
 */
function meanSplitOf(phases: readonly DemandPhase[], durationS: number): DirectionalSplit | undefined {
  let declared = false;
  let incoming = 0;
  let outgoing = 0;
  let interfloor = 0;
  for (const phase of phases) {
    const { startSplit, endSplit } = phase;
    if (startSplit === undefined || endSplit === undefined) continue;
    declared = true;
    const span = phase.endS - phase.startS;
    incoming += ((startSplit.incoming + endSplit.incoming) / 2) * span;
    outgoing += ((startSplit.outgoing + endSplit.outgoing) / 2) * span;
    interfloor += ((startSplit.interfloor + endSplit.interfloor) / 2) * span;
  }
  if (!declared || durationS <= 0) return undefined;
  return normalizedSplit({ incoming, outgoing, interfloor }, 'meanDirectionalSplit');
}

/**
 * Every phase declares both endpoint mixes or neither.
 *
 * Applied to a template this module *builds* and to one a caller hands in already resolved, which
 * is not belt-and-braces: the resolved path returns the object untouched, so a hand-built template
 * with one authored endpoint would otherwise reach the generator, resolve its missing end to
 * `undefined`, and drop the whole arc silently at the first phase that lacked one.
 */
function requireCoherentMix(phases: readonly DemandPhase[]): void {
  for (const phase of phases) {
    if ((phase.startSplit === undefined) !== (phase.endSplit === undefined)) {
      throw new TrafficError(
        `Demand phase [${phase.startS}, ${phase.endS}] declares one endpoint mix and not the other. A phase interpolates between the two, so one alone would give the run an endpoint nobody authored.`,
      );
    }
  }
}

function finish(
  parts: Omit<
    ResolvedDemandTemplate,
    'peakIntensity' | 'intensityIntegralS' | 'meanDirectionalSplit'
  >,
): ResolvedDemandTemplate {
  let peak = 0;
  let integral = 0;
  for (const phase of parts.phases) {
    peak = Math.max(peak, phase.startIntensity, phase.endIntensity);
    integral += phaseIntegral(phase);
  }
  requireCoherentMix(parts.phases);
  const meanDirectionalSplit = meanSplitOf(parts.phases, parts.durationS);
  return Object.freeze({
    ...parts,
    phases: Object.freeze(parts.phases.map((phase) => Object.freeze({ ...phase }))),
    peakIntensity: peak,
    intensityIntegralS: integral,
    // Omitted, not undefined-valued, when no phase declares a mix: a template from a run that does
    // not use the feature must serialize as the object it was before the feature existed.
    ...(meanDirectionalSplit === undefined ? {} : { meanDirectionalSplit }),
  });
}

/* -------------------------------------------------------------------------- *
 * Moving the peak (docs/14 § 2.3)
 * -------------------------------------------------------------------------- */

/**
 * How far this template's peak can move in either direction, seconds. `0` means it cannot.
 *
 * The movable knots are the phase boundaries strictly inside `(0, durationS)`. The run's start and
 * end are fixed — a shift is *when the busy part happens*, not a shorter or longer day — so the
 * limit is whichever endpoint the outermost interior knot reaches first.
 *
 * **`constant-iso` returns 0, and that is the answer rather than a limitation.** It has one phase
 * and no interior boundary, so it has no peak to move; shifting only its report window would
 * change which passengers were measured without changing a single one of them, which is noise
 * dressed as a model. {@link shiftTemplatePeak} refuses a nonzero shift here rather than silently
 * doing nothing, because a control that silently does nothing is the defect docs/14 § 5
 * criterion 2 exists to catch.
 */
export function maxPeakShiftS(template: ResolvedDemandTemplate): number {
  let earliest = Number.POSITIVE_INFINITY;
  let latest = Number.NEGATIVE_INFINITY;
  for (const phase of template.phases) {
    for (const knot of [phase.startS, phase.endS]) {
      if (knot <= 0 || knot >= template.durationS) continue;
      if (knot < earliest) earliest = knot;
      if (knot > latest) latest = knot;
    }
  }
  if (!Number.isFinite(earliest)) return 0;
  return Math.max(0, Math.min(earliest, template.durationS - latest));
}

/**
 * Refuse a peak-shift **bound** this template cannot absorb, before anything is drawn from it.
 *
 * Called on the declared `dayVariation.peakShiftS` and not only on the value drawn, which is the
 * whole point: a bound of 900 s on a template that can take 750 s would otherwise run fine on
 * every draw inside 750 and throw on the rest, so the same configuration would pass at one seed
 * and fail at another. A configuration error must not be a coin flip.
 *
 * @throws TrafficError with the template's own limit in the message.
 */
export function requirePeakShiftFits(
  template: ResolvedDemandTemplate,
  magnitudeS: number,
): void {
  if (!Number.isFinite(magnitudeS) || magnitudeS < 0) {
    throw new TrafficError(
      `dayVariation.peakShiftS must be a finite, non-negative number of seconds; received ${magnitudeS}. It is the largest shift in *either* direction, so a negative bound is not a shift the other way.`,
    );
  }
  if (magnitudeS === 0) return;

  const limit = maxPeakShiftS(template);
  if (limit <= 0) {
    throw new TrafficError(
      `Demand template "${template.id}" has no interior phase boundary, so it has no peak to move; a ${magnitudeS} s dayVariation.peakShiftS cannot be applied to it. Its intensity is flat, and shifting only its measurement window would change which passengers were counted without changing a single arrival.`,
    );
  }
  if (magnitudeS > limit) {
    throw new TrafficError(
      `A ${magnitudeS} s peak shift does not fit inside demand template "${template.id}": its outermost phase boundary is ${limit} s from an end of the ${template.durationS} s run. Shorten dayVariation.peakShiftS or lengthen the run.`,
    );
  }
}

/**
 * The same template with its peak `shiftS` seconds later (or earlier, for a negative value).
 *
 * **Total demand is conserved exactly, not approximately.** Every interior knot moves by the same
 * amount and the two endpoints are pinned, so the up-ramp lengthens by precisely as much as the
 * down-ramp shortens and `∫ intensity dt` is unchanged — which is what makes this knob orthogonal
 * to {@link DayVariationConfig.minDemandFactor}: one moves *when* people arrive, the other moves
 * *how many*. `demandTemplate.test.ts` asserts the integral rather than assuming the algebra.
 *
 * The measurement window travels with the peak. It has to: the window exists to measure the busy
 * part, and a window that stayed put while the hold moved out from under it would report a slice
 * of a ramp — the defect {@link riseAndFallTemplate} centres its window to avoid.
 *
 * **A mix-varying template's period mean moves slightly, and that is a modelled consequence.**
 * Each phase keeps its own endpoint mixes and changes span, so `meanDirectionalSplit` — a
 * *time*-weighted average — shifts: a later peak spends longer in the early, outgoing-dominant
 * part of a `lunch-two-way` arc. That is what a late lunch is. It is recomputed by {@link finish}
 * from the shifted phases rather than carried over, so the template cannot disagree with itself.
 *
 * @throws TrafficError for a template with no interior phase boundary, or a shift larger than
 *   {@link maxPeakShiftS}.
 */
export function shiftTemplatePeak(
  template: ResolvedDemandTemplate,
  shiftS: number,
): ResolvedDemandTemplate {
  if (!Number.isFinite(shiftS)) {
    throw new TrafficError(`Peak shift must be a finite number of seconds; received ${shiftS}`);
  }
  if (shiftS === 0) return template;
  requirePeakShiftFits(template, Math.abs(shiftS));

  const move = (timeS: number): number =>
    timeS <= 0 || timeS >= template.durationS ? timeS : timeS + shiftS;

  return finish({
    id: template.id,
    name: template.name,
    recommended: template.recommended,
    durationS: template.durationS,
    phases: template.phases.map((phase) => ({
      ...phase,
      startS: move(phase.startS),
      endS: move(phase.endS),
    })),
    reportWindowStartS: move(template.reportWindowStartS),
    reportWindowEndS: move(template.reportWindowEndS),
  });
}

/* -------------------------------------------------------------------------- *
 * Rise and fall (CIBSE Guide D) — the recommended template
 * -------------------------------------------------------------------------- */

/** Overrides for {@link riseAndFallTemplate}. Every one is declared in `TRAFFIC_PARAMETERS`. */
export interface RiseAndFallOptions {
  /** Length of one replication, seconds. Default 1800 (30 min). */
  readonly durationS?: number | undefined;
  /** How long demand holds at peak, which is also the reported window. Default 300 (5 min). */
  readonly peakWindowS?: number | undefined;
  /** Intensity at both ends, as a fraction of peak. Default 0 — the CIBSE shape. */
  readonly baselineFraction?: number | undefined;
  readonly id?: string | undefined;
  readonly name?: string | undefined;
}

/**
 * Ramp up to the peak, hold for the reported window, ramp symmetrically down.
 *
 * The ramps are equal halves of whatever the hold leaves over, so the reported window sits
 * exactly in the middle of the run and the peak the metrics describe is the peak the
 * elevators actually saw — an off-centre window would report a slice of a ramp and quietly
 * understate demand.
 *
 * @throws TrafficError if the hold does not fit inside the duration, or the baseline is
 *   outside `[0, 1]`.
 */
export function riseAndFallTemplate(options: RiseAndFallOptions = {}): ResolvedDemandTemplate {
  const durationS = requirePositive(
    options.durationS ?? TRAFFIC_DEFAULTS.riseAndFallDurationS,
    'durationS',
  );
  const peakWindowS = requirePositive(options.peakWindowS ?? TRAFFIC_DEFAULTS.peakWindowS, 'peakWindowS');
  const baselineFraction = requireNonNegative(
    options.baselineFraction ?? TRAFFIC_DEFAULTS.baselineFraction,
    'baselineFraction',
  );
  if (baselineFraction > 1) {
    throw new TrafficError(
      `Demand template baselineFraction must lie in [0, 1]; received ${baselineFraction}. It is a fraction of the peak, not a rate.`,
    );
  }
  if (peakWindowS > durationS) {
    throw new TrafficError(
      `A ${peakWindowS} s peak hold does not fit inside a ${durationS} s run. Shorten the window or lengthen the run.`,
    );
  }

  const rampS = (durationS - peakWindowS) / 2;
  const holdStartS = rampS;
  const holdEndS = rampS + peakWindowS;

  const phases: DemandPhase[] = [];
  if (rampS > 0) {
    phases.push({ startS: 0, endS: holdStartS, startIntensity: baselineFraction, endIntensity: 1 });
  }
  phases.push({ startS: holdStartS, endS: holdEndS, startIntensity: 1, endIntensity: 1 });
  if (rampS > 0) {
    phases.push({ startS: holdEndS, endS: durationS, startIntensity: 1, endIntensity: baselineFraction });
  }

  return finish({
    id: options.id ?? 'rise-and-fall',
    name: options.name ?? 'CIBSE rise-and-fall template',
    recommended: true,
    durationS,
    phases,
    reportWindowStartS: holdStartS,
    reportWindowEndS: holdEndS,
  });
}

/* -------------------------------------------------------------------------- *
 * Constant demand (draft ISO 8100-32) — cross-checking only
 * -------------------------------------------------------------------------- */

/** Overrides for {@link constantDemandTemplate}. */
export interface ConstantDemandOptions {
  /** Length of the run, seconds. Default 7200 (120 min). */
  readonly durationS?: number | undefined;
  /** Warm-up discarded before measurement, seconds. Default 900 (15 min). */
  readonly discardFirstS?: number | undefined;
  /** Cool-down discarded at the end, seconds. Default 300 (5 min). */
  readonly discardLastS?: number | undefined;
  readonly id?: string | undefined;
  readonly name?: string | undefined;
}

/**
 * A steady rate for the whole run, reported over the middle.
 *
 * `recommended` is `false`, and deliberately so: it is carried through onto the trace so a
 * downstream analysis can refuse to build a confidence interval across replications of a
 * template that does not support one, rather than relying on whoever configured the run to
 * have remembered.
 *
 * @throws TrafficError if the discards leave no measurement window.
 */
export function constantDemandTemplate(options: ConstantDemandOptions = {}): ResolvedDemandTemplate {
  const durationS = requirePositive(options.durationS ?? TRAFFIC_DEFAULTS.constantDurationS, 'durationS');
  const discardFirstS = requireNonNegative(
    options.discardFirstS ?? TRAFFIC_DEFAULTS.constantDiscardFirstS,
    'discardFirstS',
  );
  const discardLastS = requireNonNegative(
    options.discardLastS ?? TRAFFIC_DEFAULTS.constantDiscardLastS,
    'discardLastS',
  );
  if (discardFirstS + discardLastS >= durationS) {
    throw new TrafficError(
      `Discarding ${discardFirstS} s + ${discardLastS} s of a ${durationS} s run leaves no measurement window.`,
    );
  }

  return finish({
    id: options.id ?? 'constant-iso',
    name: options.name ?? 'ISO 8100-32 constant demand',
    recommended: false,
    durationS,
    phases: [{ startS: 0, endS: durationS, startIntensity: 1, endIntensity: 1 }],
    reportWindowStartS: discardFirstS,
    reportWindowEndS: durationS - discardLastS,
  });
}

/* -------------------------------------------------------------------------- *
 * Lunch two-way (CIBSE Guide D) — the one template whose directional mix moves
 * -------------------------------------------------------------------------- */

/**
 * The mix arc's authored endpoints, and the derivation behind them.
 *
 * **Cited.** The lunch period's directional mix is 45 % incoming / 45 % outgoing / 10 % interfloor
 * — CIBSE Guide D (2010, carried into the 2020 edition), the split the British Council for Offices
 * *Guide to Specification 2014* pairs with a 13 %/5 min lunchtime two-way demand. The literature's
 * alternatives are 40/40/20 (Barney 2003a) and 42/42/16 (BCO 2009); Guide D is this project's
 * primary reference, so its figure is the one taken.
 *
 * **Derived, and said plainly, because no table publishes it.** Guide D gives the period's mix as
 * a single triple; it does not give the mix as a function of time within the period. The endpoints
 * below are constructed from the mechanism the same sources describe — occupants ride down to the
 * terminal to leave and ride back up on their return, so the *same* period is outgoing-dominant
 * early and incoming-dominant late — plus three stated assumptions:
 *
 * 1. At the instant the period opens, nobody has returned yet, so `incoming = 0`.
 * 2. The interfloor share is background traffic and is held at the cited 10 % throughout.
 * 3. The arc is linear in time and symmetric about the midpoint.
 *
 * The arithmetic then closes: `(0 + 0.90)/2 = 0.45` incoming, `(0.90 + 0)/2 = 0.45` outgoing,
 * `(0.10 + 0.10)/2 = 0.10` interfloor. **The cited 45/45/10 is reproduced by the endpoints rather
 * than asserted beside them**, which is what makes the amplitude a derivation rather than a taste.
 *
 * **The limitation, stated because it cuts the wrong way.** An endpoint of exactly zero incoming
 * is the *widest* arc consistent with the cited mean, and a measured building's arc is smoother at
 * its ends — real departures and returns overlap. A wider arc is the one a weight-set selector
 * would find easiest to exploit, so this is not a conservative choice and must not be reported as
 * one. {@link LunchTwoWayOptions.mixAmplitude} is the knob that narrows it, and 0 is the flat
 * control `DECISIONS.md` § D162 condition 5 requires.
 */
export const LUNCH_TWO_WAY_SPLIT_AT_START: DirectionalSplit = Object.freeze({
  incoming: 0,
  outgoing: 0.9,
  interfloor: 0.1,
});

/** The mirror of {@link LUNCH_TWO_WAY_SPLIT_AT_START}. See it for the citation and derivation. */
export const LUNCH_TWO_WAY_SPLIT_AT_END: DirectionalSplit = Object.freeze({
  incoming: 0.9,
  outgoing: 0,
  interfloor: 0.1,
});

/** Overrides for {@link lunchTwoWayTemplate}. Every one is declared in `TRAFFIC_PARAMETERS`. */
export interface LunchTwoWayOptions {
  /** Length of the period, seconds. Default 1800, inherited from the rise-and-fall run length. */
  readonly durationS?: number | undefined;
  /** Length of the intensity hold, seconds. Default 300 — the rise-and-fall value, unchanged. */
  readonly peakWindowS?: number | undefined;
  /** Intensity at both ends as a fraction of peak. Default 0 — the CIBSE shape, unchanged. */
  readonly baselineFraction?: number | undefined;
  /** Mix at `t = 0`. Default {@link LUNCH_TWO_WAY_SPLIT_AT_START}. */
  readonly startSplit?: DirectionalSplit | undefined;
  /** Mix at `t = durationS`. Default {@link LUNCH_TWO_WAY_SPLIT_AT_END}. */
  readonly endSplit?: DirectionalSplit | undefined;
  /** How much of the arc to keep, `[0, 1]`. Default 1; 0 is the flat-mix control. */
  readonly mixAmplitude?: number | undefined;
  readonly id?: string | undefined;
  readonly name?: string | undefined;
}

/**
 * The lunch mixed peak: the rise-and-fall intensity, with the directional mix swinging across it.
 *
 * ## What is new here, and what is deliberately not
 *
 * **New:** the mix arc, and only the mix arc. Every geometric number — the 1800 s period, the 300 s
 * hold, the zero baseline — is {@link riseAndFallTemplate}'s own default, taken unchanged, so this
 * template introduces no duration that no source supports. `docs/03` § Demand targets already
 * names two-way traffic as a governing peak; what the shipped templates could not express is that
 * a two-way period is *not* a constant two-way mix, which is the finding `DECISIONS.md` § D156
 * measured rather than assumed.
 *
 * **Not new:** the reporting rule. The window is the whole run, for the reason `benchmark/arms.ts`
 * already gives about `MIDTOWN_INTERFLOOR_MIX` — *"this is a pattern rather than a peak, and a
 * 300 s window of it is a sample of the pattern rather than the thing itself"*. A 5-minute window
 * cut out of a mix arc reports one point of it and calls it the period.
 *
 * @throws TrafficError if the hold does not fit, the baseline or amplitude is outside `[0, 1]`, or
 *   either endpoint mix gives every direction a zero share.
 */
export function lunchTwoWayTemplate(options: LunchTwoWayOptions = {}): ResolvedDemandTemplate {
  const durationS = requirePositive(
    options.durationS ?? TRAFFIC_DEFAULTS.lunchTwoWayDurationS,
    'durationS',
  );
  const peakWindowS = requirePositive(
    options.peakWindowS ?? TRAFFIC_DEFAULTS.peakWindowS,
    'peakWindowS',
  );
  const baselineFraction = requireNonNegative(
    options.baselineFraction ?? TRAFFIC_DEFAULTS.baselineFraction,
    'baselineFraction',
  );
  const mixAmplitude = requireNonNegative(
    options.mixAmplitude ?? TRAFFIC_DEFAULTS.mixAmplitude,
    'mixAmplitude',
  );
  if (baselineFraction > 1) {
    throw new TrafficError(
      `Demand template baselineFraction must lie in [0, 1]; received ${baselineFraction}. It is a fraction of the peak, not a rate.`,
    );
  }
  if (mixAmplitude > 1) {
    throw new TrafficError(
      `Demand template mixAmplitude must lie in [0, 1]; received ${mixAmplitude}. It is the fraction of the authored mix arc to keep, and above 1 would take the mix outside the endpoints anybody authored or cited.`,
    );
  }
  if (peakWindowS > durationS) {
    throw new TrafficError(
      `A ${peakWindowS} s peak hold does not fit inside a ${durationS} s run. Shorten the window or lengthen the run.`,
    );
  }

  const startSplit = normalizedSplit(
    options.startSplit ?? LUNCH_TWO_WAY_SPLIT_AT_START,
    'startSplit',
  );
  const endSplit = normalizedSplit(options.endSplit ?? LUNCH_TWO_WAY_SPLIT_AT_END, 'endSplit');
  const mean: DirectionalSplit = {
    incoming: (startSplit.incoming + endSplit.incoming) / 2,
    outgoing: (startSplit.outgoing + endSplit.outgoing) / 2,
    interfloor: (startSplit.interfloor + endSplit.interfloor) / 2,
  };
  /** The arc at a fraction of the run, damped towards its own mean by `mixAmplitude`. */
  const splitAtFraction = (fraction: number): DirectionalSplit => {
    const lerp = (from: number, to: number): number => from + fraction * (to - from);
    const damp = (value: number, centre: number): number =>
      centre + mixAmplitude * (value - centre);
    return {
      incoming: damp(lerp(startSplit.incoming, endSplit.incoming), mean.incoming),
      outgoing: damp(lerp(startSplit.outgoing, endSplit.outgoing), mean.outgoing),
      interfloor: damp(lerp(startSplit.interfloor, endSplit.interfloor), mean.interfloor),
    };
  };

  const rampS = (durationS - peakWindowS) / 2;
  const holdStartS = rampS;
  const holdEndS = rampS + peakWindowS;

  const bounds: readonly (readonly [number, number, number, number])[] =
    rampS > 0
      ? [
          [0, holdStartS, baselineFraction, 1],
          [holdStartS, holdEndS, 1, 1],
          [holdEndS, durationS, 1, baselineFraction],
        ]
      : [[holdStartS, holdEndS, 1, 1]];

  const phases: DemandPhase[] = bounds.map(([startS, endS, startIntensity, endIntensity]) => ({
    startS,
    endS,
    startIntensity,
    endIntensity,
    startSplit: splitAtFraction(startS / durationS),
    endSplit: splitAtFraction(endS / durationS),
  }));

  return finish({
    id: options.id ?? 'lunch-two-way',
    name: options.name ?? 'CIBSE Guide D lunch two-way template',
    recommended: true,
    durationS,
    phases,
    // The whole run. See the module note above: a peak window cut out of a mix arc reports one
    // point of the arc and calls it the period.
    reportWindowStartS: 0,
    reportWindowEndS: durationS,
  });
}

/* -------------------------------------------------------------------------- *
 * Shift change — the only shipped template with two interior peaks
 * -------------------------------------------------------------------------- */

/** Overrides for {@link shiftChangeTemplate}. */
export interface ShiftChangeOptions {
  readonly durationS?: number | undefined;
  /** Length of each peak hold, seconds. */
  readonly peakWindowS?: number | undefined;
  /** Intensity between the two peaks, as a fraction of peak. Must lie in `(0, 1)` — see below. */
  readonly troughFraction?: number | undefined;
  readonly id?: string | undefined;
  readonly name?: string | undefined;
}

/**
 * Two peaks separated by a trough the building never empties into.
 *
 * The shape a hospital, a factory or a call centre actually runs, and the one no existing template
 * could express: `rise-and-fall` has a single interior maximum and `constant-iso` has none, so
 * *"the outgoing shift leaves while the incoming shift arrives, twice"* had to be approximated by a
 * **wider single peak** — which spreads the same demand instead of concentrating it twice, and is a
 * different question.
 *
 * Six phases, symmetric about the midpoint: rise to the first peak, hold, fall to the trough, rise
 * to the second peak, hold, fall away. The peaks are centred on 1/4 and 3/4 of the period.
 *
 * **The trough is required to be non-zero**, and that is the template's defining constraint rather
 * than a validation nicety. A trough of zero is two separate rise-and-falls with a dead period
 * between them, which is a different building — the fact a shift change turns on is that the place
 * is still occupied and still being served while the changeover happens.
 *
 * The report window is the **whole run**, for the reason `lunch-two-way`'s is: the quantity of
 * interest spans both peaks and the trough, and reporting one peak would measure a rise-and-fall
 * with extra steps.
 *
 * @throws TrafficError if the trough is not in `(0, 1)`, or if the two holds do not fit.
 */
export function shiftChangeTemplate(options: ShiftChangeOptions = {}): ResolvedDemandTemplate {
  const durationS = requirePositive(
    options.durationS ?? TRAFFIC_DEFAULTS.shiftChangeDurationS,
    'durationS',
  );
  const peakWindowS = requirePositive(
    options.peakWindowS ?? TRAFFIC_DEFAULTS.shiftChangePeakWindowS,
    'peakWindowS',
  );
  const troughFraction = options.troughFraction ?? TRAFFIC_DEFAULTS.shiftChangeTroughFraction;
  if (!Number.isFinite(troughFraction) || troughFraction <= 0 || troughFraction >= 1) {
    throw new TrafficError(
      `shift-change troughFraction must lie in (0, 1); received ${troughFraction}. Zero would make this two separate rise-and-falls with a dead period between them, and the fact a shift change turns on is that the building is still occupied while it happens; one would make it constant.`,
    );
  }
  if (2 * peakWindowS >= durationS) {
    throw new TrafficError(
      `Two ${peakWindowS} s peak holds do not fit inside a ${durationS} s run with ramps between them. Shorten the window or lengthen the run.`,
    );
  }

  const half = peakWindowS / 2;
  const firstHoldStartS = durationS / 4 - half;
  const firstHoldEndS = durationS / 4 + half;
  const secondHoldStartS = (3 * durationS) / 4 - half;
  const secondHoldEndS = (3 * durationS) / 4 + half;

  const phases: DemandPhase[] = [
    { startS: 0, endS: firstHoldStartS, startIntensity: troughFraction, endIntensity: 1 },
    { startS: firstHoldStartS, endS: firstHoldEndS, startIntensity: 1, endIntensity: 1 },
    { startS: firstHoldEndS, endS: durationS / 2, startIntensity: 1, endIntensity: troughFraction },
    { startS: durationS / 2, endS: secondHoldStartS, startIntensity: troughFraction, endIntensity: 1 },
    { startS: secondHoldStartS, endS: secondHoldEndS, startIntensity: 1, endIntensity: 1 },
    { startS: secondHoldEndS, endS: durationS, startIntensity: 1, endIntensity: troughFraction },
  ];

  return finish({
    id: options.id ?? 'shift-change',
    name: options.name ?? 'Shift-change template',
    recommended: false,
    durationS,
    phases,
    reportWindowStartS: 0,
    reportWindowEndS: durationS,
  });
}

/* -------------------------------------------------------------------------- *
 * Event egress — the template whose leading edge is the point
 * -------------------------------------------------------------------------- */

/** Overrides for {@link eveningEgressTemplate}. */
export interface EveningEgressOptions {
  readonly durationS?: number | undefined;
  /** Seconds from the baseline to full flow. The step. */
  readonly stepS?: number | undefined;
  /** Seconds of sustained full flow before the decay begins. */
  readonly holdS?: number | undefined;
  /** Intensity before the doors open, as a fraction of peak. */
  readonly baselineFraction?: number | undefined;
  readonly id?: string | undefined;
  readonly name?: string | undefined;
}

/**
 * A near-flat baseline, a **step** to full flow, a sustained maximum, then a decay.
 *
 * A ballroom emptying, a cinema turning out, a conference floor breaking at once. It differs from
 * `rise-and-fall` in its **leading edge** rather than its magnitude: a rise-and-fall ramps over
 * minutes, and an egress steps — the doors open and the whole population is on the landing inside a
 * minute. That is the case a batch window or a deferred-assignment setting is decided by, and no
 * other shipped template produces it.
 *
 * The baseline is deliberately **not zero**: a venue before its doors open still has staff and
 * stragglers moving, and a zero baseline would make the run's first arrival coincide exactly with
 * the step, which is a coincidence rather than a building.
 *
 * @throws TrafficError if the step and hold leave no decay, or the baseline is outside `[0, 1)`.
 */
export function eveningEgressTemplate(options: EveningEgressOptions = {}): ResolvedDemandTemplate {
  const durationS = requirePositive(
    options.durationS ?? TRAFFIC_DEFAULTS.eveningEgressDurationS,
    'durationS',
  );
  const stepS = requirePositive(options.stepS ?? TRAFFIC_DEFAULTS.eveningEgressStepS, 'stepS');
  const holdS = requirePositive(options.holdS ?? TRAFFIC_DEFAULTS.eveningEgressHoldS, 'holdS');
  const baselineFraction =
    options.baselineFraction ?? TRAFFIC_DEFAULTS.eveningEgressBaselineFraction;
  if (!Number.isFinite(baselineFraction) || baselineFraction < 0 || baselineFraction >= 1) {
    throw new TrafficError(
      `evening-egress baselineFraction must lie in [0, 1); received ${baselineFraction}. It is the trickle before the doors open, as a fraction of the peak that follows, so it cannot equal or exceed it.`,
    );
  }

  const quietS = durationS / 4;
  const stepEndS = quietS + stepS;
  const holdEndS = stepEndS + holdS;
  if (holdEndS >= durationS) {
    throw new TrafficError(
      `A ${stepS} s step and a ${holdS} s hold beginning at ${quietS} s do not fit inside a ${durationS} s run with any decay left. Shorten them or lengthen the run.`,
    );
  }

  const phases: DemandPhase[] = [
    { startS: 0, endS: quietS, startIntensity: baselineFraction, endIntensity: baselineFraction },
    { startS: quietS, endS: stepEndS, startIntensity: baselineFraction, endIntensity: 1 },
    { startS: stepEndS, endS: holdEndS, startIntensity: 1, endIntensity: 1 },
    { startS: holdEndS, endS: durationS, startIntensity: 1, endIntensity: baselineFraction },
  ];

  return finish({
    id: options.id ?? 'evening-egress',
    name: options.name ?? 'Event egress template',
    recommended: false,
    durationS,
    phases,
    reportWindowStartS: stepEndS,
    reportWindowEndS: holdEndS,
  });
}

/* -------------------------------------------------------------------------- *
 * Resolution from config
 * -------------------------------------------------------------------------- */

function isResolved(value: unknown): value is ResolvedDemandTemplate {
  return typeof value === 'object' && value !== null && 'phases' in value;
}

/** A template already resolved passes through; anything else is built from its numbers. */
export type DemandTemplateSpec = DemandTemplateId | DemandTemplate | ResolvedDemandTemplate;

/**
 * Build a runtime template from a `data/traffic-profiles.json → demandTemplates` record, from
 * a template id, or from an already-resolved template.
 *
 * The record supplies the numbers; the id selects the shape; `overrides` beat both. An id
 * outside {@link DEMAND_TEMPLATE_IDS} throws rather than falling back, because a typo
 * silently changing a 30-minute peaked run into a 120-minute flat one would move every
 * reported statistic without moving anything visibly.
 *
 * Overrides are what make the `traffic.riseAndFall.*` and `traffic.constant.*` entries of
 * `TRAFFIC_PARAMETERS` honest. A declared id that only a hand-built `ResolvedDemandTemplate`
 * can reach is a claim the system cannot keep: an optimizer that writes the winning value
 * into a configuration gets a run at the default instead, and nothing says so.
 *
 * @param spec The template id, the authored record, or a resolved template.
 * @param templates The `demandTemplates` array to look an id up in. Required when `spec` is
 *   an id; supply `profiles.demandTemplates`.
 * @param overrides Geometry to apply on top of the record. Rejected for an already-resolved
 *   template, which carries its own geometry and would silently ignore them.
 * @throws TrafficError for an unknown id or shape, or for overrides on a resolved template.
 */
export function resolveDemandTemplate(
  spec: DemandTemplateSpec,
  templates?: readonly DemandTemplate[] | undefined,
  overrides?: DemandTemplateOverrides | undefined,
): ResolvedDemandTemplate {
  if (typeof spec !== 'string') {
    if (isResolved(spec)) {
      requireNoOverrides(overrides, `the already-resolved template "${spec.id}"`);
      requireCoherentMix(spec.phases);
      if ((spec.meanDirectionalSplit === undefined) !== (spec.phases[0]?.startSplit === undefined)) {
        throw new TrafficError(
          `The already-resolved template "${spec.id}" disagrees with itself about whether it varies the directional mix: meanDirectionalSplit is ${spec.meanDirectionalSplit === undefined ? 'absent' : 'present'} while its first phase ${spec.phases[0]?.startSplit === undefined ? 'declares no mix' : 'declares one'}. The generator branches on meanDirectionalSplit, so the disagreement would resolve silently in its favour.`,
        );
      }
      return spec;
    }
    return fromRecord(spec, overrides);
  }

  const found = templates?.find((template) => template.id === spec);
  if (found !== undefined) return fromRecord(found, overrides);
  // No record to draw numbers from: fall back to the documented defaults for the shape.
  if (spec === 'rise-and-fall') return riseAndFall(overrides);
  if (spec === 'constant-iso') return constant(overrides);
  if (spec === 'lunch-two-way') return lunchTwoWay(overrides);
  if (spec === 'shift-change') return shiftChange(overrides);
  if (spec === 'evening-egress') return eveningEgress(overrides);
  throw new TrafficError(
    `Unknown demand template "${spec}". Supported: ${DEMAND_TEMPLATE_IDS.join(', ')}. Declare it in data/traffic-profiles.json and add its shape in traffic/demandTemplate.ts.`,
  );
}

/** Guard against an override silently doing nothing. */
function requireNoOverrides(overrides: DemandTemplateOverrides | undefined, what: string): void {
  const set = Object.entries(overrides ?? {})
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
  if (set.length > 0) {
    throw new TrafficError(
      `templateOverrides (${set.join(', ')}) cannot be applied to ${what}: it already carries its geometry. Build it with the override baked in, or select the template by id.`,
    );
  }
}

/** The rise-and-fall shape, with `overrides` beating the record value and then the default. */
function riseAndFall(
  overrides: DemandTemplateOverrides | undefined,
  recordDurationS?: number,
  id?: string,
  name?: string,
): ResolvedDemandTemplate {
  return riseAndFallTemplate({
    durationS: overrides?.durationS ?? recordDurationS ?? TRAFFIC_DEFAULTS.riseAndFallDurationS,
    peakWindowS: overrides?.peakWindowS ?? TRAFFIC_DEFAULTS.peakWindowS,
    baselineFraction: overrides?.baselineFraction ?? TRAFFIC_DEFAULTS.baselineFraction,
    ...(id === undefined ? {} : { id }),
    ...(name === undefined ? {} : { name }),
  });
}

/** The constant shape, with `overrides` beating the record values and then the defaults. */
function constant(
  overrides: DemandTemplateOverrides | undefined,
  recordDurationS?: number,
  recordDiscardFirstS?: number,
  recordDiscardLastS?: number,
  id?: string,
  name?: string,
): ResolvedDemandTemplate {
  return constantDemandTemplate({
    durationS: overrides?.durationS ?? recordDurationS ?? TRAFFIC_DEFAULTS.constantDurationS,
    discardFirstS:
      overrides?.discardFirstS ?? recordDiscardFirstS ?? TRAFFIC_DEFAULTS.constantDiscardFirstS,
    discardLastS:
      overrides?.discardLastS ?? recordDiscardLastS ?? TRAFFIC_DEFAULTS.constantDiscardLastS,
    ...(id === undefined ? {} : { id }),
    ...(name === undefined ? {} : { name }),
  });
}

/** The lunch two-way shape, with `overrides` beating the record values and then the defaults. */
function lunchTwoWay(
  overrides: DemandTemplateOverrides | undefined,
  recordDurationS?: number,
  recordStartSplit?: DirectionalSplit,
  recordEndSplit?: DirectionalSplit,
  id?: string,
  name?: string,
): ResolvedDemandTemplate {
  return lunchTwoWayTemplate({
    durationS: overrides?.durationS ?? recordDurationS ?? TRAFFIC_DEFAULTS.lunchTwoWayDurationS,
    peakWindowS: overrides?.peakWindowS ?? TRAFFIC_DEFAULTS.peakWindowS,
    baselineFraction: overrides?.baselineFraction ?? TRAFFIC_DEFAULTS.baselineFraction,
    mixAmplitude: overrides?.mixAmplitude ?? TRAFFIC_DEFAULTS.mixAmplitude,
    ...(recordStartSplit === undefined ? {} : { startSplit: recordStartSplit }),
    ...(recordEndSplit === undefined ? {} : { endSplit: recordEndSplit }),
    ...(id === undefined ? {} : { id }),
    ...(name === undefined ? {} : { name }),
  });
}

/** The shift-change shape, with `overrides` beating the record value and then the default. */
function shiftChange(
  overrides: DemandTemplateOverrides | undefined,
  recordDurationS?: number,
  id?: string,
  name?: string,
): ResolvedDemandTemplate {
  return shiftChangeTemplate({
    durationS: overrides?.durationS ?? recordDurationS ?? TRAFFIC_DEFAULTS.shiftChangeDurationS,
    // `peakWindowS` is shared with rise-and-fall's override of the same name, deliberately: it
    // means the same thing on both shapes — how long the peak is held — and a second name for one
    // quantity is how a search space grows a dimension nobody meant to add.
    peakWindowS: overrides?.peakWindowS ?? TRAFFIC_DEFAULTS.shiftChangePeakWindowS,
    troughFraction: overrides?.troughFraction ?? TRAFFIC_DEFAULTS.shiftChangeTroughFraction,
    ...(id === undefined ? {} : { id }),
    ...(name === undefined ? {} : { name }),
  });
}

/** The event-egress shape, with `overrides` beating the record value and then the default. */
function eveningEgress(
  overrides: DemandTemplateOverrides | undefined,
  recordDurationS?: number,
  id?: string,
  name?: string,
): ResolvedDemandTemplate {
  return eveningEgressTemplate({
    durationS: overrides?.durationS ?? recordDurationS ?? TRAFFIC_DEFAULTS.eveningEgressDurationS,
    stepS: overrides?.stepS ?? TRAFFIC_DEFAULTS.eveningEgressStepS,
    holdS: overrides?.holdS ?? TRAFFIC_DEFAULTS.eveningEgressHoldS,
    baselineFraction:
      overrides?.baselineFraction ?? TRAFFIC_DEFAULTS.eveningEgressBaselineFraction,
    ...(id === undefined ? {} : { id }),
    ...(name === undefined ? {} : { name }),
  });
}

function fromRecord(
  record: DemandTemplate,
  overrides?: DemandTemplateOverrides | undefined,
): ResolvedDemandTemplate {
  // Validated even when an override replaces it: a record with a nonsense duration is a data
  // error, and an override that happens to be present must not hide it.
  const durationS = requirePositive(record.durationMin, 'durationMin') * SECONDS_PER_MINUTE;

  if (record.id === 'rise-and-fall') {
    return riseAndFall(overrides, durationS, record.id, record.name);
  }
  if (record.id === 'constant-iso') {
    return constant(
      overrides,
      durationS,
      (record.discardFirstMin ?? 0) * SECONDS_PER_MINUTE,
      (record.discardLastMin ?? 0) * SECONDS_PER_MINUTE,
      record.id,
      record.name,
    );
  }
  if (record.id === 'lunch-two-way') {
    return lunchTwoWay(
      overrides,
      durationS,
      record.directionalSplitAtStart,
      record.directionalSplitAtEnd,
      record.id,
      record.name,
    );
  }
  if (record.id === 'shift-change') {
    return shiftChange(overrides, durationS, record.id, record.name);
  }
  if (record.id === 'evening-egress') {
    return eveningEgress(overrides, durationS, record.id, record.name);
  }
  throw new TrafficError(
    `Demand template "${record.id}" has no shape in this module. Supported: ${DEMAND_TEMPLATE_IDS.join(', ')}. Adding one is a new shape in traffic/demandTemplate.ts, not a new branch at a call site.`,
  );
}

/* -------------------------------------------------------------------------- *
 * Evaluation
 * -------------------------------------------------------------------------- */

/**
 * The rate multiplier at a time, in `[0, 1]`.
 *
 * Times outside `[0, durationS]` return 0: nothing arrives before the run starts or after it
 * ends. Pure, and cheap enough to call once per proposed arrival.
 */
export function intensityAt(template: ResolvedDemandTemplate, timeS: number): number {
  if (!Number.isFinite(timeS) || timeS < 0 || timeS > template.durationS) return 0;
  for (const phase of template.phases) {
    if (timeS < phase.startS || timeS > phase.endS) continue;
    const span = phase.endS - phase.startS;
    if (span <= 0) return phase.endIntensity;
    const fraction = (timeS - phase.startS) / span;
    return phase.startIntensity + fraction * (phase.endIntensity - phase.startIntensity);
  }
  return 0;
}

/**
 * The directional mix at a time, or `undefined` when the template declares none.
 *
 * The same piecewise-linear evaluator {@link intensityAt} is, over the same knots — which is the
 * whole design: a template's mix and its level are two readings of one phase list, so a phase
 * boundary is a boundary for both and nothing can drift between them.
 *
 * Times outside `[0, durationS]` clamp to the nearest endpoint rather than returning `undefined`.
 * Nothing arrives outside the run, so the value is unobservable in a trace; clamping keeps it a
 * total function, so a caller integrating over a window that overhangs the run does not have to
 * special-case the overhang.
 */
export function splitAt(
  template: ResolvedDemandTemplate,
  timeS: number,
): DirectionalSplit | undefined {
  if (template.meanDirectionalSplit === undefined) return undefined;
  const clamped = Number.isFinite(timeS)
    ? Math.max(0, Math.min(timeS, template.durationS))
    : 0;
  for (const phase of template.phases) {
    if (clamped < phase.startS || clamped > phase.endS) continue;
    const { startSplit, endSplit } = phase;
    if (startSplit === undefined || endSplit === undefined) return undefined;
    const span = phase.endS - phase.startS;
    if (span <= 0) return endSplit;
    const fraction = (clamped - phase.startS) / span;
    return {
      incoming: startSplit.incoming + fraction * (endSplit.incoming - startSplit.incoming),
      outgoing: startSplit.outgoing + fraction * (endSplit.outgoing - startSplit.outgoing),
      interfloor: startSplit.interfloor + fraction * (endSplit.interfloor - startSplit.interfloor),
    };
  }
  return undefined;
}

/**
 * `∫ intensity dt` over `[fromS, toS]`, seconds.
 *
 * Multiplied by a passenger rate this gives the **expected** number of passengers over a
 * window — the analytic value the rate-conversion tests check the sampler against, so that a
 * statistical test failing points at the sampler rather than at an argument about what the
 * right answer was.
 */
export function integratedIntensityS(
  template: ResolvedDemandTemplate,
  fromS = 0,
  toS: number = template.durationS,
): number {
  const start = Math.max(0, Math.min(fromS, template.durationS));
  const end = Math.max(0, Math.min(toS, template.durationS));
  if (end <= start) return 0;

  let total = 0;
  for (const phase of template.phases) {
    const lo = Math.max(start, phase.startS);
    const hi = Math.min(end, phase.endS);
    if (hi <= lo) continue;
    total += ((intensityAt(template, lo) + intensityAt(template, hi)) / 2) * (hi - lo);
  }
  return total;
}

/** Expected passengers over a window, given the rate at full intensity. */
export function expectedPassengers(
  template: ResolvedDemandTemplate,
  peakPassengersPerSecond: number,
  fromS = 0,
  toS: number = template.durationS,
): number {
  return peakPassengersPerSecond * integratedIntensityS(template, fromS, toS);
}

/** Whether a time falls inside the template's measurement window. Half-open: `[start, end)`. */
export function inReportWindow(template: ResolvedDemandTemplate, timeS: number): boolean {
  return timeS >= template.reportWindowStartS && timeS < template.reportWindowEndS;
}
