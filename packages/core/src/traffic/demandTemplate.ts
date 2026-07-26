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
 * window, the discards) comes from `data/traffic-profiles.json → demandTemplates` or from an
 * explicit override, per CLAUDE.md invariant 7, and each override is declared in
 * `TRAFFIC_PARAMETERS`. There is no `if (template === 'rise-and-fall') { rate = 0.7 }`
 * anywhere: both templates are the same piecewise-linear evaluator over different phase
 * lists.
 */

import type { DemandTemplate } from '../config/types.js';

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

function finish(
  parts: Omit<ResolvedDemandTemplate, 'peakIntensity' | 'intensityIntegralS'>,
): ResolvedDemandTemplate {
  let peak = 0;
  let integral = 0;
  for (const phase of parts.phases) {
    peak = Math.max(peak, phase.startIntensity, phase.endIntensity);
    integral += phaseIntegral(phase);
  }
  return Object.freeze({
    ...parts,
    phases: Object.freeze(parts.phases.map((phase) => Object.freeze({ ...phase }))),
    peakIntensity: peak,
    intensityIntegralS: integral,
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
      return spec;
    }
    return fromRecord(spec, overrides);
  }

  const found = templates?.find((template) => template.id === spec);
  if (found !== undefined) return fromRecord(found, overrides);
  // No record to draw numbers from: fall back to the documented defaults for the shape.
  if (spec === 'rise-and-fall') return riseAndFall(overrides);
  if (spec === 'constant-iso') return constant(overrides);
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
