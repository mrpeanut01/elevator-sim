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
 * ## Shape is code, numbers are data — and a schedule is neither
 *
 * A ramp is a ramp — that is the code here. Every quantity (`durationMin`, the reported
 * window, the discards, the endpoint mixes) comes from `data/traffic-profiles.json →
 * demandTemplates` or from an explicit override, per CLAUDE.md invariant 7, and each override is
 * declared in `TRAFFIC_PARAMETERS`. There is no `if (template === 'rise-and-fall') { rate = 0.7 }`
 * anywhere: all three templates are the same piecewise-linear evaluator over different phase
 * lists.
 *
 * **That defence is right for a ramp and wrong for a schedule, and § D273 is where the line moved.**
 * A day's phase list is not a shape; it is a *sequence* of them — an up-peak, a lull, a lunch, a
 * lull, a down-peak — and a sixth `if (record.id === 'office-day')` per day profile is exactly the
 * `if (phase === 'evening')` invariant 7 forbids. So {@link fromRecord} takes a record that declares
 * `phases` **before** it looks at `id` at all, and that record's phases are the data. One new code
 * path, and no per-profile code ever again.
 *
 * Nothing about the evaluator changed to allow it, and that is the whole argument. `DemandPhase`
 * already carried per-phase intensity endpoints *and* optional per-phase mix endpoints;
 * {@link intensityAt} and {@link splitAt} are already one piecewise-linear evaluator over one knot
 * list; and `shift-change` already ships six phases with two interior peaks. A day profile is a
 * **longer phase list**, and `traffic/phaseListIdentity.test.ts` proves that by *running* it: a
 * record reproducing `rise-and-fall`'s knots draws the same passengers, at all five buildings, byte
 * for byte.
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
 *
 * ## The hour, and why it moves nothing (`DECISIONS.md` § D244)
 *
 * A template may also declare **when it is**: `ResolvedDemandTemplate.startOfDayS`, resolved from
 * `data/traffic-profiles.json → demandTemplates[].startOfDayMin`. Five of the six shipped
 * templates declare one; `constant-iso` declares none, because ISO's constant demand is a rate held
 * to cross-check an analytical baseline and not a time of day.
 *
 * **A record gets exactly one hour, and that is what forced the sixth record** (`DECISIONS.md`
 * § D263). `evening-egress` was a ballroom emptying *and* the calendar's office end-of-day, so its
 * one hour could only be true of one of them. It is now the venue case at 22:24, and
 * `office-down-peak` is the office case at 17:15. Two records, one meaning each — rather than an
 * hour on the record that any caller could override, which would be a second place a template's
 * clock is defined.
 *
 * **{@link intensityAt}, {@link splitAt} and {@link integratedIntensityS} do not read it, and that
 * is the property the whole feature rests on.** Every arrival instant is drawn against `intensityAt`
 * over `[0, durationS]`, so a run's passengers, batches, routes, masses and metrics are exactly what
 * they were before the field existed — at every seed, in every building, under every template.
 * `traffic/dayStartIdentity.test.ts` proves that with a run rather than with this paragraph: the
 * shipped records are compared, leg for leg and byte for byte, against the same records with the
 * hour stripped. It is also what keeps `sim/oracle.test.ts` green by construction, since the
 * closed-form Barney/CIBSE comparison is a statement about the same unmoved arrivals.
 *
 * So the hour is a **label on the period**, in the way `id` and `name` are, and it is deliberately
 * absent from `TRAFFIC_PARAMETERS`: an optimizer sampling *what hour it is* would be searching a
 * dimension that cannot change a cost. That is the `destination-eta` `rideTime: 0` defect (§ D112)
 * with a different key name, and this is the note that stops it recurring.
 *
 * The invisibility is what makes it free **today**. It stops being free the moment anything
 * statistical reads it — a phase boundary that becomes a measurement boundary, a report that slices
 * a day at 12:00 — and at that moment the authored hours below stop being labels and become inputs.
 * See each template's `$comment` for what is cited and what is assumed.
 */

import { demandPhaseIssues, type DemandPhaseIssue } from '../config/demandPhases.js';
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

/** Seconds in a day. The half-open upper bound on {@link requireTimeOfDay}. */
const SECONDS_PER_DAY = 86_400;

/**
 * A time of day in `[0, 86400)`, or `undefined` passed straight through.
 *
 * Half-open at the top for the reason `config/schema.ts` gives about `startOfDayMin`: 86 400 is the
 * next midnight, which is 0, and two records meaning the same instant must not compare unequal.
 *
 * Validated here as well as in the schema, and that is not belt-and-braces. `resolveDemandTemplate`
 * accepts a hand-built `ResolvedDemandTemplate` and every `*Template()` builder is exported, so a
 * caller can reach these shapes without passing through `config/`; the schema guards the *data*
 * path only.
 */
function requireTimeOfDay(value: number | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0 || value >= SECONDS_PER_DAY) {
    throw new TrafficError(
      `Demand template ${label} must be seconds after local midnight in [0, ${SECONDS_PER_DAY}); received ${value}. It is when the run begins, not how long it lasts.`,
    );
  }
  return value;
}

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
  // Destructured out rather than carried in the spread, so that a template with no hour has **no
  // key** rather than one whose value is `undefined`. `JSON.stringify` erases the difference and
  // `'startOfDayS' in template` does not, and the second is what the identity guards read.
  //
  // `authoredPhaseList` is destructured for the same reason and one more: it is absent on all five
  // shipped templates, so every one of them serializes exactly as it did before § D273 and not one
  // pinned digest moves. A `false` here would move fifteen of them for a key that means "no".
  //
  // `window` joins them since § D285, and for exactly the same reason: it is absent on every run
  // that covers a whole period, which is every run this repository has ever published.
  const { startOfDayS, authoredPhaseList, window, ...rest } = parts;
  const hourS = requireTimeOfDay(startOfDayS, 'startOfDayS');
  let peak = 0;
  let integral = 0;
  for (const phase of rest.phases) {
    peak = Math.max(peak, phase.startIntensity, phase.endIntensity);
    integral += phaseIntegral(phase);
  }
  requireCoherentMix(rest.phases);
  const meanDirectionalSplit = meanSplitOf(rest.phases, rest.durationS);
  return Object.freeze({
    ...rest,
    phases: Object.freeze(rest.phases.map((phase) => Object.freeze({ ...phase }))),
    peakIntensity: peak,
    intensityIntegralS: integral,
    // Omitted, not undefined-valued, when no phase declares a mix: a template from a run that does
    // not use the feature must serialize as the object it was before the feature existed.
    ...(meanDirectionalSplit === undefined ? {} : { meanDirectionalSplit }),
    // The same rule, for the same reason. `constant-iso` has no hour and must carry no key.
    ...(hourS === undefined ? {} : { startOfDayS: hourS }),
    ...(authoredPhaseList === true ? { authoredPhaseList: true as const } : {}),
    ...(window === undefined ? {} : { window: Object.freeze({ ...window }) }),
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

  /*
   * § D275, and it is refused **before** the limit is consulted rather than after.
   *
   * `maxPeakShiftS` takes its bound from the outermost interior knot, which is the right answer for
   * a shape with one busy part and the wrong question for a schedule. A day's first boundary is
   * minutes from the start — the trickle before the doors open — so the limit collapses to those
   * minutes and almost every declared shift is refused with a message naming a phase boundary the
   * author never thought of as the peak. Worse, a shift *inside* that collapsed limit would be
   * accepted and would move **every** knot in the day by the same amount: the lunch and the evening
   * peak would slide together with the morning one, which is not a late peak, it is a late clock —
   * and § D244 rule 4 already settled that a period's hour is not what a peak shift moves.
   *
   * Shaped on the `constant-iso` refusal below, deliberately: a template that has no peak to move
   * and a template whose peaks cannot move together are both cases of a knob meaning nothing here,
   * and both say so by name rather than doing something plausible.
   */
  if (template.authoredPhaseList === true) {
    throw new TrafficError(
      `dayVariation.peakShiftS is not supported on demand template "${template.id}": its phases are authored as a schedule, so it has several busy parts rather than one peak, and a single shift would slide all of them together — a whole day an hour late rather than a peak an hour late. Its interior boundaries also begin minutes into the period, so the shift a shape template could absorb is not the shift this one could. Move the periods in the record, or select a template built from a shape.`,
    );
  }

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
 * **`startOfDayS` is carried unchanged, and that is the modelled answer rather than an omission.**
 * The two endpoints are pinned, so the run still begins when it began; what moved is the busy part
 * *within* the period. A `rise-and-fall` that starts at 08:30 and peaks ten minutes late is a late
 * morning peak, not a period that started at 08:40 — and a shift that also moved the hour would be
 * making the same claim twice.
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
    // Spread-or-omit rather than `startOfDayS: template.startOfDayS`, so a shifted `constant-iso`
    // — which has no hour — does not acquire an `undefined`-valued key the original lacked.
    ...(template.startOfDayS === undefined ? {} : { startOfDayS: template.startOfDayS }),
  });
}

/* -------------------------------------------------------------------------- *
 * Cutting a part out of a period (§ D285)
 * -------------------------------------------------------------------------- */

/** Where a linear segment sits at `timeS`, given its two endpoints. `0` for a degenerate span. */
function lerp(startS: number, endS: number, startValue: number, endValue: number, timeS: number): number {
  const span = endS - startS;
  if (span <= 0) return startValue;
  return startValue + ((endValue - startValue) * (timeS - startS)) / span;
}

/** {@link lerp} applied to all three shares. Not normalized here — {@link finish} does that. */
function splitBetween(phase: DemandPhase, timeS: number): DirectionalSplit | undefined {
  const { startSplit, endSplit } = phase;
  if (startSplit === undefined || endSplit === undefined) return undefined;
  return {
    incoming: lerp(phase.startS, phase.endS, startSplit.incoming, endSplit.incoming, timeS),
    outgoing: lerp(phase.startS, phase.endS, startSplit.outgoing, endSplit.outgoing, timeS),
    interfloor: lerp(phase.startS, phase.endS, startSplit.interfloor, endSplit.interfloor, timeS),
  };
}

/**
 * The same template cut to `[startS, endS)` of its own period, re-based so the cut begins at zero.
 *
 * `DECISIONS.md` § D285, and the field [§ D275](DECISIONS.md) named. This is what makes a ten-hour
 * `office-day` runnable at half an hour **without rescaling it**: the geometry is left exactly as
 * authored and a part of it is selected, so 12:15–12:45 is the cited lunch peak at its cited length
 * rather than a lunch squeezed into a proportion of a shorter day.
 *
 * ## What moves, and what deliberately does not
 *
 * Everything is re-based to the window's own clock — {@link ResolvedDemandTemplate.durationS} is the
 * window's length, the phases are clipped and shifted, `startOfDayS` becomes the *window's* hour —
 * so every downstream reader sees an ordinary period that begins at zero. The kernel's deadline, the
 * report window, the phase strip and the oracle's `[0, durationS]` assumptions all keep working
 * without learning what a window is. {@link ResolvedDemandTemplate.window} is what records that this
 * period was cut out of a longer one, and it carries the length of the longer one so a trace can say
 * *half an hour of a ten-hour day* without re-resolving the record.
 *
 * `peakIntensity`, `intensityIntegralS` and `meanDirectionalSplit` are re-derived by {@link finish}
 * over the window rather than carried across, so the template cannot disagree with itself — the same
 * rule {@link shiftTemplatePeak} follows. A morning window's mean mix is the morning's, not the
 * day's, and that is the honest reading: it *is* a different period.
 *
 * **The report window becomes the whole of the cut.** § D273's argument about a phase list applies
 * with more force to a part of one: five minutes taken out of a lunch peak reports one instant of it
 * and calls it the period. A run that wants a narrower measurement still has
 * `SimulationConfig.reportWindow`, which is where *"show me the busiest five minutes of it"* belongs.
 *
 * **Declaring the whole period is not a window, and returns the template untouched.** A window names
 * a *part*, and the whole is not one; so *"the full day"* and *"no window"* are the same selection
 * spelled two ways, and they produce the same run byte for byte rather than two runs differing in
 * whether a key is present. `traffic/windowIdentity.test.ts` asserts it.
 *
 * @throws TrafficError for a window outside the period, an empty or inverted one, or a second window
 *   on a template that already carries one.
 */
export function windowTemplate(
  template: ResolvedDemandTemplate,
  startS: number,
  endS: number,
): ResolvedDemandTemplate {
  if (template.window !== undefined) {
    throw new TrafficError(
      `Demand template "${template.id}" is already a [${template.window.startS}, ${template.window.endS}) window of a ${template.window.periodS} s period, so it cannot be windowed again: the second window would be measured against the first one's length and "which part of the day" would stop naming a part of the day. Window the period once, from the record.`,
    );
  }
  requireNonNegative(startS, 'windowStartS');
  requireNonNegative(endS, 'windowEndS');
  if (endS <= startS) {
    throw new TrafficError(
      `windowStartS (${startS} s) must be below windowEndS (${endS} s) on demand template "${template.id}": the window is the part of the period the run covers, and a part with no length is a run with no demand rather than a short one.`,
    );
  }
  if (endS > template.durationS) {
    throw new TrafficError(
      `Window [${startS}, ${endS}) s does not fit inside demand template "${template.id}", whose period is ${template.durationS} s. A window selects part of the period the record authors; it cannot extend one. Widen the record, or select a window inside it.`,
    );
  }
  // The whole is not a part. Returning the template untouched is what makes "the full day" and "no
  // window" the same run rather than two runs that differ in a key.
  if (startS === 0 && endS === template.durationS) return template;

  const durationS = endS - startS;
  const phases: DemandPhase[] = [];
  for (const phase of template.phases) {
    const from = Math.max(phase.startS, startS);
    const to = Math.min(phase.endS, endS);
    // Half-open, so a window landing exactly on a boundary takes the phase that starts there and
    // not the one that ends there — the same rule `inReportWindow` and `poissonBatch` follow.
    if (to <= from) continue;
    const startSplit = splitBetween(phase, from);
    const endSplit = splitBetween(phase, to);
    phases.push({
      startS: from - startS,
      endS: to - startS,
      startIntensity: lerp(phase.startS, phase.endS, phase.startIntensity, phase.endIntensity, from),
      endIntensity: lerp(phase.startS, phase.endS, phase.startIntensity, phase.endIntensity, to),
      // Spread-or-omit: a window of a template whose phases declare no mix must declare none either,
      // or the run would acquire a `meanDirectionalSplit` its period never had and change path.
      ...(startSplit === undefined || endSplit === undefined ? {} : { startSplit, endSplit }),
    });
  }
  if (phases.length === 0) {
    throw new TrafficError(
      `Window [${startS}, ${endS}) s of demand template "${template.id}" covers none of its phases, which should be impossible for a window inside its ${template.durationS} s period. The phase list is not contiguous.`,
    );
  }

  return finish({
    id: template.id,
    name: template.name,
    recommended: template.recommended,
    durationS,
    phases,
    // The whole of the cut. See the docstring: a part is reported over the whole of itself.
    reportWindowStartS: 0,
    reportWindowEndS: durationS,
    // The window's hour, not the record's — this is the half of § D244 that stops being free. The
    // hour is now an *input* to a label a player reads, and wrapped modulo a day so a window taken
    // from a period that runs past midnight cannot print a 25th hour.
    ...(template.startOfDayS === undefined
      ? {}
      : { startOfDayS: (template.startOfDayS + startS) % SECONDS_PER_DAY }),
    ...(template.authoredPhaseList === true ? { authoredPhaseList: true as const } : {}),
    window: { startS, endS, periodS: template.durationS },
  });
}

/* -------------------------------------------------------------------------- *
 * Rise and fall (CIBSE Guide D) — the recommended template
 * -------------------------------------------------------------------------- */

/**
 * Overrides for {@link riseAndFallTemplate}. Every **geometric** one is declared in
 * `TRAFFIC_PARAMETERS`; {@link RiseAndFallOptions.startOfDayS} deliberately is not — see its note.
 */
export interface RiseAndFallOptions {
  /** Length of one replication, seconds. Default 1800 (30 min). */
  readonly durationS?: number | undefined;
  /** How long demand holds at peak, which is also the reported window. Default 300 (5 min). */
  readonly peakWindowS?: number | undefined;
  /** Intensity at both ends, as a fraction of peak. Default 0 — the CIBSE shape. */
  readonly baselineFraction?: number | undefined;
  /**
   * When the run begins, seconds after local midnight, `[0, 86400)`. Omitted means no hour.
   *
   * The one field here that is **not** a tunable and not in `TRAFFIC_PARAMETERS`: it is invisible
   * to {@link intensityAt}, so it cannot move a cost, and a declared knob that cannot move a cost
   * is a search dimension nobody can spend. See {@link ResolvedDemandTemplate.startOfDayS}.
   */
  readonly startOfDayS?: number | undefined;
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
    ...(options.startOfDayS === undefined ? {} : { startOfDayS: options.startOfDayS }),
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
  /**
   * When the run begins, seconds after local midnight. See {@link RiseAndFallOptions.startOfDayS}.
   *
   * **The shipped `constant-iso` record declares none, and that is the point of the field being
   * optional.** ISO 8100-32's constant demand is a rate held long enough to cross-check an
   * analytical baseline; it is not an hour of the day, and inventing one for it would put a clock
   * on the page next to a run that has no claim to one. The parameter exists so a caller building
   * a *different* constant period can say when it is — not so the shipped one can be given a time.
   */
  readonly startOfDayS?: number | undefined;
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
    ...(options.startOfDayS === undefined ? {} : { startOfDayS: options.startOfDayS }),
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

/**
 * Overrides for {@link lunchTwoWayTemplate}. Every **geometric and mix** one is declared in
 * `TRAFFIC_PARAMETERS`; {@link LunchTwoWayOptions.startOfDayS} deliberately is not — see
 * {@link RiseAndFallOptions.startOfDayS}.
 */
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
  /**
   * When the period begins, seconds after local midnight. See
   * {@link RiseAndFallOptions.startOfDayS}. The arc's crossover — the instant the mix is 45/45/10 —
   * lands at the period's midpoint, so the hour and the crossover move together.
   */
  readonly startOfDayS?: number | undefined;
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
    ...(options.startOfDayS === undefined ? {} : { startOfDayS: options.startOfDayS }),
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
  /**
   * When the period begins, seconds after local midnight. See
   * {@link RiseAndFallOptions.startOfDayS}. The changeover instant — the trough between the two
   * peaks — is the period's midpoint, so it is the point an authored hour is derived from.
   */
  readonly startOfDayS?: number | undefined;
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
    ...(options.startOfDayS === undefined ? {} : { startOfDayS: options.startOfDayS }),
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
  /**
   * When the run begins, seconds after local midnight. See {@link RiseAndFallOptions.startOfDayS}.
   *
   * The run *begins* on the quiet trickle, so this is not the hour the doors open: full flow is
   * reached at `durationS / 4 + stepS`, which is the instant an authored hour is derived from.
   */
  readonly startOfDayS?: number | undefined;
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
    ...(options.startOfDayS === undefined ? {} : { startOfDayS: options.startOfDayS }),
  });
}

/* -------------------------------------------------------------------------- *
 * Authored phase list — the day schedule, whose shape is its own data (§ D273)
 * -------------------------------------------------------------------------- */

/**
 * Turn the first broken rule into a `TrafficError` naming the phase and the field.
 *
 * The count of the rest goes in the message rather than the detail of them: a phase list that has
 * a gap usually has one mistake and several consequences, and the first one in list order is the
 * one to fix. Reporting all eleven of a shifted list's complaints would bury it.
 */
function throwOnPhaseIssues(id: string, issues: readonly DemandPhaseIssue[]): void {
  const first = issues[0];
  if (first === undefined) return;
  const where = first.index < 0 ? 'phases' : `phases[${first.index}].${first.field}`;
  const rest =
    issues.length > 1
      ? ` (${issues.length - 1} further issue${issues.length > 2 ? 's' : ''} in the same list.)`
      : '';
  throw new TrafficError(
    `Demand template "${id}" authors a phase list this module cannot evaluate — ${where}: ${first.message}.${rest}`,
  );
}

/** Everything {@link phaseListTemplate} needs. Seconds, and the phases already converted. */
export interface PhaseListOptions {
  /** Length of the period, seconds. The last phase must end exactly here. */
  readonly durationS: number;
  /** The authored knots, contiguous and covering `[0, durationS]`. */
  readonly phases: readonly DemandPhase[];
  readonly id: string;
  readonly name: string;
  /**
   * Whether this template supports confidence intervals across replications.
   *
   * Carried from the record rather than assumed, and a day profile's honest answer is **`false`**:
   * a replication of a whole day is one long run whose waiting times are serially correlated in
   * exactly the way `constant-iso`'s are, so *"reported over the whole day"* is a description and
   * not a licence to build an interval across days. See docs/03 § The independence condition.
   */
  readonly recommended: boolean;
  /** Seconds after local midnight at which the period begins. Omitted means no hour (§ D244). */
  readonly startOfDayS?: number | undefined;
}

/**
 * A template whose phases were **authored**, not computed. `DECISIONS.md` § D273.
 *
 * The one builder here that adds no geometry of its own: it validates the list, freezes it and
 * hands it to {@link finish}, which derives `peakIntensity`, `intensityIntegralS` and
 * `meanDirectionalSplit` exactly as it does for the five shapes. That is the point — the evaluator
 * is not extended, it is *fed*, and `traffic/phaseListIdentity.test.ts` measures the difference by
 * running a phase list that reproduces `rise-and-fall`'s knots against `rise-and-fall` itself.
 *
 * ## The report window is the whole period, and that is a modelling answer
 *
 * `lunch-two-way` and `shift-change` already report over the whole run, for the reason
 * `benchmark/arms.ts` states about a mixed pattern: *"this is a pattern rather than a peak, and a
 * 300 s window of it is a sample of the pattern rather than the thing itself"*. A day is that
 * argument at its strongest — a five-minute window cut out of a day reports one of its periods and
 * calls it the day — so a phase-list template has no window field to author and no discards to
 * declare.
 *
 * Narrowing still happens at the **run** level, where it belongs, and the two forms are different
 * questions: `SimulationConfig.reportWindow: 'peak-5min'` *derives* the busiest five minutes it can
 * find (on `office-day` at `midtown-office` that lands mid-morning, not on the up-peak, because the
 * queue is still draining), while an explicit `ReportWindow` **names** an interval — which is the
 * one that answers *"report me the lunch"*. Neither is a way of running a shorter day; that is
 * `windowStartS`/`windowEndS`, which does not exist yet (§ D275).
 *
 * @throws TrafficError for a list that is empty, non-contiguous, descending, short of or past
 *   `durationS`, stepped at a boundary without a ramp, or that declares a mix on some phases only.
 */
export function phaseListTemplate(options: PhaseListOptions): ResolvedDemandTemplate {
  const durationS = requirePositive(options.durationS, 'durationS');
  throwOnPhaseIssues(
    options.id,
    demandPhaseIssues(
      options.phases.map((phase) => ({
        start: phase.startS,
        end: phase.endS,
        startIntensity: phase.startIntensity,
        endIntensity: phase.endIntensity,
        ...(phase.startSplit === undefined ? {} : { startSplit: phase.startSplit }),
        ...(phase.endSplit === undefined ? {} : { endSplit: phase.endSplit }),
      })),
      durationS,
      's',
    ),
  );

  return finish({
    id: options.id,
    name: options.name,
    recommended: options.recommended,
    durationS,
    // Normalized here rather than trusted, the way every other builder normalizes its splits: an
    // author writing 85/5/10 and an author writing 0.85/0.05/0.1 must resolve to the same template.
    phases: options.phases.map((phase) => ({
      startS: phase.startS,
      endS: phase.endS,
      startIntensity: phase.startIntensity,
      endIntensity: phase.endIntensity,
      ...(phase.startSplit === undefined
        ? {}
        : { startSplit: normalizedSplit(phase.startSplit, 'startSplit') }),
      ...(phase.endSplit === undefined
        ? {}
        : { endSplit: normalizedSplit(phase.endSplit, 'endSplit') }),
    })),
    reportWindowStartS: 0,
    reportWindowEndS: durationS,
    ...(options.startOfDayS === undefined ? {} : { startOfDayS: options.startOfDayS }),
    authoredPhaseList: true,
  });
}

/* -------------------------------------------------------------------------- *
 * Resolution from config
 * -------------------------------------------------------------------------- */

/**
 * A resolved template, told apart from an authored record by the **unit its duration is in**.
 *
 * It used to test `'phases' in value`, and § D273 made that wrong in the most dangerous possible
 * way: a record that authors its own phases has the key too, so every day profile handed in as a
 * record would have been waved through as *already resolved* — returned untouched, its minutes read
 * as seconds, its `peakIntensity` and `intensityIntegralS` never derived, and its phase list never
 * validated. It was caught by `phaseListIdentity.test.ts` refusing to see a malformed list refused.
 *
 * `durationS` is the discriminator because it is the one field the two shapes cannot share:
 * `DemandTemplate` is a `strictObject` carrying `durationMin`, and `ResolvedDemandTemplate` is
 * built in seconds and always has `durationS`. Neither can acquire the other's without the schema
 * or the builders changing.
 */
function isResolved(value: unknown): value is ResolvedDemandTemplate {
  return typeof value === 'object' && value !== null && 'durationS' in value;
}

/**
 * A template already resolved passes through; anything else is built from its numbers.
 *
 * **The id is `string`, not {@link DemandTemplateId}, and § D274 is why.** `resolveDemandTemplate`
 * has always looked the id up in the loaded `demandTemplates` **first** and only fallen back to the
 * closed union when no record answered, so the union's runtime role was already the narrower one:
 * *the shapes this module can build with no record to read*. Since § D273 a record can carry its own
 * phases, so the set of ids a shipped configuration answers to is the set of ids in
 * `data/traffic-profiles.json` — a thing the type system cannot see and the loaded catalogue can.
 * The union stays exactly what it always was, the fallback list, and every call site validates a
 * string against the records it actually loaded.
 */
export type DemandTemplateSpec = string | DemandTemplate | ResolvedDemandTemplate;

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
      // The phase-list refusal takes precedence when the marker is set, so a caller who hand-built
      // a schedule and reached for `durationS` is told what a schedule is, rather than the generic
      // "it already carries its geometry" — the same sentence they would get from a record.
      if (spec.authoredPhaseList === true) requireNoPhaseListOverrides(overrides, spec.id);
      requireNoOverrides(overrides, `the already-resolved template "${spec.id}"`);
      requireCoherentMix(spec.phases);
      // The resolved path returns the object untouched, so this is the only place a hand-built
      // template's hour is checked at all — the same reasoning `requireCoherentMix` is applied here
      // for. An hour outside the day would otherwise surface on a clock three layers away.
      requireTimeOfDay(spec.startOfDayS, 'startOfDayS');
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
  // Same shape as `rise-and-fall`, and the id is what differs. See {@link officeDownPeak}.
  if (spec === 'office-down-peak') return officeDownPeak(overrides);
  throw new TrafficError(
    `Unknown demand template "${spec}". With no record to read, the shapes this module can build are: ${DEMAND_TEMPLATE_IDS.join(', ')}. Declare it in data/traffic-profiles.json — a record that authors its own "phases" needs no shape here at all (DECISIONS.md § D273); only a record that selects one of the shapes above by id does.`,
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

/**
 * Refuse every geometry override against an authored phase list, `durationS` **by name**. § D275.
 *
 * `requireNoOverrides` is the precedent and this is the same refusal one level earlier, for a
 * record rather than for an already-resolved template. The reason is the same: a knob that reaches
 * a template it cannot move is a control that silently does nothing, which docs/14 § 5 criterion 2
 * exists to catch. Nine of the ten overrides do not even name a quantity a phase list has — there
 * is no ramp to hold, no trough to raise, no step to lengthen, no discard to take — so they are
 * refused as a group.
 *
 * **`durationS` gets its own sentence because it is the one that looks like it should work, and
 * GitHub issue #81 is what it does instead.** On a shape builder `durationS` *refits the geometry*:
 * a 900 s `rise-and-fall` is a 900 s run with a proportionally shorter ramp and the same 300 s hold,
 * which is a shorter version of the same thing. On a day it would be a sixteen-hour schedule
 * squeezed into a quarter of an hour — a fifteen-minute day with a five-minute lunch, reported as a
 * day. Selecting *which part of a day to run* is a different question and wants a different field
 * (`windowStartS`/`windowEndS`, deliberately not built here — see § D275): it must never be a
 * reinterpretation of `durationS`, because `durationS` travels in every leaderboard submission and
 * giving it a second meaning would silently change what a stored score was measured over.
 */
function requireNoPhaseListOverrides(
  overrides: DemandTemplateOverrides | undefined,
  id: string,
): void {
  const set = Object.entries(overrides ?? {})
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
  if (set.length === 0) return;
  if (set.includes('durationS')) {
    throw new TrafficError(
      `templateOverrides.durationS cannot be applied to demand template "${id}": its phases are authored, not computed, so there is no geometry to refit and a new duration would rescale a whole day's schedule into whatever length was asked for — a fifteen-minute day with a five-minute lunch, reported as a day. Choosing which *part* of a day to run is windowStartS/windowEndS and not this one (§ D285), because durationS travels in every stored result and must keep meaning "how long the run was". Run the period the record declares, window it to a part of itself, or select a shorter template.`,
    );
  }
  throw new TrafficError(
    `templateOverrides (${set.join(', ')}) cannot be applied to demand template "${id}": it authors its phases outright, so it has no ramp to hold, no trough to raise, no step to lengthen and no discard to take. Every geometric number it has is already in the record; edit the record, or select a template built from a shape.`,
  );
}

/**
 * The rise-and-fall shape, with `overrides` beating the record value and then the default.
 *
 * `recordStartOfDayS` has **no `TRAFFIC_DEFAULTS` fallback and no override**, unlike every other
 * argument here, and both absences are deliberate. There is no default because the hour is data and
 * nothing else: a template selected by id with no record to read is a shape without a clock, and a
 * number invented here would put one on it. There is no override because the hour is not a tunable
 * — see {@link RiseAndFallOptions.startOfDayS}.
 */
function riseAndFall(
  overrides: DemandTemplateOverrides | undefined,
  recordDurationS?: number,
  id?: string,
  name?: string,
  recordStartOfDayS?: number,
): ResolvedDemandTemplate {
  return riseAndFallTemplate({
    durationS: overrides?.durationS ?? recordDurationS ?? TRAFFIC_DEFAULTS.riseAndFallDurationS,
    peakWindowS: overrides?.peakWindowS ?? TRAFFIC_DEFAULTS.peakWindowS,
    baselineFraction: overrides?.baselineFraction ?? TRAFFIC_DEFAULTS.baselineFraction,
    ...(id === undefined ? {} : { id }),
    ...(name === undefined ? {} : { name }),
    ...(recordStartOfDayS === undefined ? {} : { startOfDayS: recordStartOfDayS }),
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
  recordStartOfDayS?: number,
): ResolvedDemandTemplate {
  return constantDemandTemplate({
    durationS: overrides?.durationS ?? recordDurationS ?? TRAFFIC_DEFAULTS.constantDurationS,
    discardFirstS:
      overrides?.discardFirstS ?? recordDiscardFirstS ?? TRAFFIC_DEFAULTS.constantDiscardFirstS,
    discardLastS:
      overrides?.discardLastS ?? recordDiscardLastS ?? TRAFFIC_DEFAULTS.constantDiscardLastS,
    ...(id === undefined ? {} : { id }),
    ...(name === undefined ? {} : { name }),
    // Threaded even though the shipped record declares no hour: the resolver must not be the reason
    // a template has none. `constant-iso` has no hour because ISO's constant demand is not a time of
    // day, and that has to be visible in `data/` rather than enforced by a missing argument here.
    ...(recordStartOfDayS === undefined ? {} : { startOfDayS: recordStartOfDayS }),
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
  recordStartOfDayS?: number,
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
    ...(recordStartOfDayS === undefined ? {} : { startOfDayS: recordStartOfDayS }),
  });
}

/** The shift-change shape, with `overrides` beating the record value and then the default. */
function shiftChange(
  overrides: DemandTemplateOverrides | undefined,
  recordDurationS?: number,
  id?: string,
  name?: string,
  recordStartOfDayS?: number,
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
    ...(recordStartOfDayS === undefined ? {} : { startOfDayS: recordStartOfDayS }),
  });
}

/**
 * **The office end-of-day down-peak — the rise-and-fall shape under its own id and its own hour.**
 *
 * Delegates to {@link riseAndFall} rather than authoring a ramp of its own, and that is the honest
 * arrangement rather than a shortcut: an office empties on the same ramp-hold-ramp profile it fills
 * on, and the record's own `$comment` inherits `rise-and-fall`'s geometry precisely so that it adds
 * no duration no source supports — the discipline `lunch-two-way` and `shift-change` were authored
 * under.
 *
 * **So a run of this template draws the same passengers as a run of `rise-and-fall` at the same
 * seed, and that is declared rather than latent.** `traffic/templateAdditionIdentity.test.ts`
 * asserts it on the legs. What the record adds is the **hour** (17:15, placing the reported peak at
 * 17:30) and the period's identity; § D244 rule 1 is that the hour moves nothing, so there is no
 * mechanism here being claimed and not delivered. A record that claimed a shape it did not have
 * would be the § D112 defect — this one names the shape it shares.
 *
 * **Why it is a separate id at all**, when the geometry is identical: `DECISIONS.md` § D263. A
 * template gets exactly one `startOfDayMin`, `evening-egress` was serving both a ballroom and an
 * office end-of-day, and 17:24 and 22:24 are not the same number. Two records, one meaning each.
 *
 * Note that the `traffic.riseAndFall.*` overrides reach this shape too, since they are the
 * parameters of the shape rather than of the id — the same sharing `shift-change` makes of
 * `peakWindowS`, and for the same reason: a second name for one quantity is how a search space grows
 * a dimension nobody meant to add.
 */
function officeDownPeak(
  overrides: DemandTemplateOverrides | undefined,
  recordDurationS?: number,
  id?: string,
  name?: string,
  recordStartOfDayS?: number,
): ResolvedDemandTemplate {
  return riseAndFall(
    overrides,
    recordDurationS,
    id ?? 'office-down-peak',
    name ?? 'Office down-peak template',
    recordStartOfDayS,
  );
}

/** The event-egress shape, with `overrides` beating the record value and then the default. */
function eveningEgress(
  overrides: DemandTemplateOverrides | undefined,
  recordDurationS?: number,
  id?: string,
  name?: string,
  recordStartOfDayS?: number,
): ResolvedDemandTemplate {
  return eveningEgressTemplate({
    durationS: overrides?.durationS ?? recordDurationS ?? TRAFFIC_DEFAULTS.eveningEgressDurationS,
    stepS: overrides?.stepS ?? TRAFFIC_DEFAULTS.eveningEgressStepS,
    holdS: overrides?.holdS ?? TRAFFIC_DEFAULTS.eveningEgressHoldS,
    baselineFraction:
      overrides?.baselineFraction ?? TRAFFIC_DEFAULTS.eveningEgressBaselineFraction,
    ...(id === undefined ? {} : { id }),
    ...(name === undefined ? {} : { name }),
    ...(recordStartOfDayS === undefined ? {} : { startOfDayS: recordStartOfDayS }),
  });
}

function fromRecord(
  record: DemandTemplate,
  overrides?: DemandTemplateOverrides | undefined,
): ResolvedDemandTemplate {
  // Validated even when an override replaces it: a record with a nonsense duration is a data
  // error, and an override that happens to be present must not hide it.
  const durationS = requirePositive(record.durationMin, 'durationMin') * SECONDS_PER_MINUTE;
  // Human units in the reference file, SI in the code — `startOfDayMin` beside `durationMin`, the
  // same conversion, at the same point. Conditional rather than `?? 0`, because a record with no
  // hour must produce a template with no key rather than one that claims to start at midnight.
  const startOfDayS =
    record.startOfDayMin === undefined
      ? undefined
      : requireTimeOfDay(record.startOfDayMin * SECONDS_PER_MINUTE, 'startOfDayMin');

  /*
   * § D273. **Before the id switch, and that ordering is the feature.** A record that authors its
   * own phases selects the phase-list path by *having* them; nothing here compares its id, so a day
   * profile is a record and never a branch. The five shipped templates author none and fall through
   * to exactly the code they always ran.
   */
  if (record.phases !== undefined) {
    requireNoPhaseListOverrides(overrides, record.id);
    // Checked once here **in minutes** before conversion, and again in seconds inside the builder.
    // Not belt-and-braces: `startMin` is what a `data/` author wrote, and being told that
    // `phases[7].startS` is 27300 when the file says `455` is a message about the wrong document.
    // Conversion is an exact multiply by 60, so a list that passes here passes there.
    throwOnPhaseIssues(
      record.id,
      demandPhaseIssues(
        record.phases.map((phase) => ({
          start: phase.startMin,
          end: phase.endMin,
          startIntensity: phase.startIntensity,
          endIntensity: phase.endIntensity,
          ...(phase.startSplit === undefined ? {} : { startSplit: phase.startSplit }),
          ...(phase.endSplit === undefined ? {} : { endSplit: phase.endSplit }),
        })),
        record.durationMin,
        'min',
      ),
    );
    return phaseListTemplate({
      durationS,
      phases: record.phases.map((phase) => ({
        startS: phase.startMin * SECONDS_PER_MINUTE,
        endS: phase.endMin * SECONDS_PER_MINUTE,
        startIntensity: phase.startIntensity,
        endIntensity: phase.endIntensity,
        ...(phase.startSplit === undefined ? {} : { startSplit: phase.startSplit }),
        ...(phase.endSplit === undefined ? {} : { endSplit: phase.endSplit }),
      })),
      id: record.id,
      name: record.name,
      recommended: record.recommended,
      ...(startOfDayS === undefined ? {} : { startOfDayS }),
    });
  }

  if (record.id === 'rise-and-fall') {
    return riseAndFall(overrides, durationS, record.id, record.name, startOfDayS);
  }
  if (record.id === 'constant-iso') {
    return constant(
      overrides,
      durationS,
      (record.discardFirstMin ?? 0) * SECONDS_PER_MINUTE,
      (record.discardLastMin ?? 0) * SECONDS_PER_MINUTE,
      record.id,
      record.name,
      startOfDayS,
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
      startOfDayS,
    );
  }
  if (record.id === 'shift-change') {
    return shiftChange(overrides, durationS, record.id, record.name, startOfDayS);
  }
  if (record.id === 'evening-egress') {
    return eveningEgress(overrides, durationS, record.id, record.name, startOfDayS);
  }
  if (record.id === 'office-down-peak') {
    return officeDownPeak(overrides, durationS, record.id, record.name, startOfDayS);
  }
  throw new TrafficError(
    `Demand template "${record.id}" declares no "phases" and names no shape this module knows. Either author its phases in the record — which needs no code at all (DECISIONS.md § D273) — or give it one of: ${DEMAND_TEMPLATE_IDS.join(', ')}. A genuinely new *shape* is a new builder in traffic/demandTemplate.ts; a new *schedule* is not, and never a new branch at a call site.`,
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
 *
 * **`timeS` is seconds since the start of the run, never seconds since midnight**, and this
 * function does not read {@link ResolvedDemandTemplate.startOfDayS} at all. That is what makes the
 * hour provably invisible to every trace — see the module note, and `dayStartIdentity.test.ts` for
 * the run that holds it.
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
