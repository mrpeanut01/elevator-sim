/**
 * **`data/engagement-bands.json`, read with validation that refuses rather than ignores.**
 *
 * The three fun proxies (`tension.ts`, `choice.ts`, `mastery.ts`) read every threshold they apply
 * from this file and from nowhere else: band edges, the runaway slope limit, the replication count
 * a choice is judged on, the attempt count and seed set a mastery slope needs. CLAUDE.md invariant 7
 * puts anything tunable in data, and this module is the file's first reader, so it is also the place
 * that decides what the file may say.
 *
 * ## Refuse, never ignore
 *
 * A parser that skipped an unknown key would let a misspelt edge (`inBandHi`) ship as a band that
 * silently kept its old value, which is the shape of the defect the standing requirement counts. So
 * every object here declares the keys it accepts and an unknown one is an error that names it. The
 * same holds for values with a fixed vocabulary: `swingMetric` names one metric this module can
 * compute, and any other name is refused rather than computed as the nearest one.
 *
 * Three fields can only hold one value, and they are read anyway so the file cannot claim otherwise:
 *
 * - `ciMustExcludeZero` (twice) must be `true`. CLAUDE.md § Statistical discipline permits no other
 *   verdict rule, so a `false` here would be a file asking for something the repository forbids.
 * - `suppressWhenSaturated` must be `true`, for the same reason: a flagged run's wait-based figure is
 *   suppressed exactly as its AWT is, whatever a data file says.
 * - `scenarios.default.useTopLevelBands` must be `true`. It is a declaration that an unlisted scenario
 *   reads the top-level band, which is what {@link tensionBandFor} does; `false` has no meaning here.
 *
 * ## The budget is the repository's, not the file's
 *
 * `meaningfulChoice.replications` must sit in CLAUDE.md's 50 to 200 budget
 * (`RECOMMENDED_MIN_REPLICATIONS` is the floor `reports/compare.ts` already states). A mastery slope
 * needs at least three attempts, because `linearTrend` has no residual degrees of freedom below that
 * and its standard error is infinite.
 *
 * ## Per-scenario overrides
 *
 * A scenario entry may move any of the four numeric tension edges (`flatBelow`, `inBandLow`,
 * `inBandHigh`, `runawaySlopePerMin`) and nothing else. The merged band is validated again, so an
 * override cannot produce a band whose flat region overlaps its in-band region. When the caller passes
 * the ids it knows (the CLI passes the campaign's stage ids), a scenario id the campaign does not
 * declare is refused, because an override nobody can reach is a typo rather than a setting.
 *
 * Pure: it takes the parsed JSON and reads no file. The decisions here bind nothing outside
 * `engagement/` and are recorded here (§ D405); the proxies as a whole are § D1595.
 */

import type { PlaySeedSet } from '../fuzz/stageSession.js';
import { RECOMMENDED_MIN_REPLICATIONS } from '../reports/compare.js';

/** Raised when the bands file says something this module refuses to read. */
export class EngagementBandsError extends Error {
  override readonly name = 'EngagementBandsError';
}

/** The top of CLAUDE.md's 50 to 200 replication budget. The floor is `RECOMMENDED_MIN_REPLICATIONS`. */
export const MAX_ENGAGEMENT_REPLICATIONS = 200;

/** The swing metrics this module can compute. One today: the interquartile range of the queue samples. */
export const SWING_METRICS = ['iqr-of-queue-length-samples'] as const;

export type SwingMetric = (typeof SWING_METRICS)[number];

/** The four numbers a tension band is made of, every one of them a premise about people. */
export interface TensionBandEdges {
  /** A swing below this many persons reads as flat. */
  readonly flatBelow: number;
  /** The in-band region is `[inBandLow, inBandHigh]` persons of swing, inclusive at both ends. */
  readonly inBandLow: number;
  readonly inBandHigh: number;
  /** Persons per **minute** of fitted queue growth above which a flagged run is runaway. */
  readonly runawaySlopePerMin: number;
}

export interface TensionBand extends TensionBandEdges {
  readonly swingMetric: SwingMetric;
  /** Always `true`; see the module docstring. */
  readonly suppressWhenSaturated: true;
}

/** A tension band as it applies to one scenario, with the edges its override moved. */
export interface ResolvedTensionBand extends TensionBand {
  readonly scenarioId: string;
  /** The edges the scenario's own entry moved, in the file's order. Empty when the top-level band applies. */
  readonly overridden: readonly (keyof TensionBandEdges)[];
}

export interface MeaningfulChoiceBands {
  /** Replications a choice is judged over, inside CLAUDE.md's 50 to 200 budget. */
  readonly replications: number;
  readonly ciMustExcludeZero: true;
  /** The file's own statement of the verdict rule, printed and never parsed. */
  readonly verdict: string;
}

export interface MasterySlopeBands {
  /** Attempts a slope needs before it is published at all. */
  readonly attempts: number;
  /** The seed set each attempt must be judged on. */
  readonly seedSet: PlaySeedSet;
  readonly ciMustExcludeZero: true;
  readonly verdict: string;
}

export interface EngagementBands {
  readonly meaningfulChoice: MeaningfulChoiceBands;
  readonly tensionBand: TensionBand;
  readonly masterySlope: MasterySlopeBands;
  /** Each listed scenario's tension override, by scenario id. `default` is not a scenario and is not here. */
  readonly tensionOverrides: ReadonlyMap<string, Partial<TensionBandEdges>>;
}

/* -------------------------------------------------------------------------- *
 * Reading
 * -------------------------------------------------------------------------- */

const EDGE_KEYS = ['flatBelow', 'inBandLow', 'inBandHigh', 'runawaySlopePerMin'] as const satisfies readonly (keyof TensionBandEdges)[];

type Json = Readonly<Record<string, unknown>>;

function objectAt(path: string, value: unknown, allowed: readonly string[]): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new EngagementBandsError(`${path} must be an object; found ${JSON.stringify(value) ?? 'nothing'}.`);
  }
  const record = value as Json;
  const unknown = Object.keys(record).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new EngagementBandsError(
      `${path} has ${unknown.length === 1 ? 'a key' : 'keys'} this reader does not know: ${unknown.map((key) => `"${key}"`).join(', ')}. ` +
        `It accepts ${allowed.map((key) => `"${key}"`).join(', ')}, and refuses the rest rather than ignore a setting it cannot apply.`,
    );
  }
  return record;
}

function stringAt(path: string, value: unknown): string {
  if (typeof value === 'string') return value;
  throw new EngagementBandsError(`${path} must be a string; found ${JSON.stringify(value) ?? 'nothing'}.`);
}

function optionalStringAt(path: string, value: unknown): void {
  if (value !== undefined) stringAt(path, value);
}

function edgeAt(path: string, value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  throw new EngagementBandsError(`${path} must be a finite number of at least 0; found ${JSON.stringify(value) ?? 'nothing'}.`);
}

function integerAt(path: string, value: unknown, min: number, max: number, why: string): number {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max) return value;
  throw new EngagementBandsError(
    `${path} must be a whole number in [${String(min)}, ${String(max)}]; found ${JSON.stringify(value) ?? 'nothing'}. ${why}`,
  );
}

function trueAt(path: string, value: unknown, why: string): true {
  if (value === true) return true;
  throw new EngagementBandsError(`${path} must be true; found ${JSON.stringify(value) ?? 'nothing'}. ${why}`);
}

/** The ordering every band must keep, asked of the top-level band and of every merged override. */
function checkedBand(path: string, band: TensionBand): TensionBand {
  if (band.flatBelow > band.inBandLow) {
    throw new EngagementBandsError(
      `${path}: flatBelow (${String(band.flatBelow)}) is above inBandLow (${String(band.inBandLow)}), so a swing could read as both flat and in band.`,
    );
  }
  if (band.inBandLow >= band.inBandHigh) {
    throw new EngagementBandsError(
      `${path}: inBandLow (${String(band.inBandLow)}) must be below inBandHigh (${String(band.inBandHigh)}), or no swing is in band.`,
    );
  }
  return band;
}

const STATISTICAL_LAW = 'CLAUDE.md § Statistical discipline permits no verdict without a paired interval that excludes zero.';

function meaningfulChoiceOf(value: unknown): MeaningfulChoiceBands {
  const path = 'meaningfulChoice';
  const raw = objectAt(path, value, ['verdict', 'replications', 'ciMustExcludeZero', 'comment']);
  optionalStringAt(`${path}.comment`, raw['comment']);
  return Object.freeze({
    replications: integerAt(
      `${path}.replications`,
      raw['replications'],
      RECOMMENDED_MIN_REPLICATIONS,
      MAX_ENGAGEMENT_REPLICATIONS,
      'CLAUDE.md budgets 50 to 200 replications per configuration; ten produced a 12 % error in the reference study.',
    ),
    ciMustExcludeZero: trueAt(`${path}.ciMustExcludeZero`, raw['ciMustExcludeZero'], STATISTICAL_LAW),
    verdict: stringAt(`${path}.verdict`, raw['verdict']),
  });
}

function tensionBandOf(value: unknown): TensionBand {
  const path = 'tensionBand';
  const raw = objectAt(path, value, ['swingMetric', ...EDGE_KEYS, 'suppressWhenSaturated', 'comment']);
  optionalStringAt(`${path}.comment`, raw['comment']);
  const metric = raw['swingMetric'];
  if (!(SWING_METRICS as readonly unknown[]).includes(metric)) {
    throw new EngagementBandsError(
      `${path}.swingMetric names ${JSON.stringify(metric) ?? 'nothing'}, which this module cannot compute. Known: ${SWING_METRICS.join(', ')}.`,
    );
  }
  return checkedBand(
    path,
    Object.freeze({
      swingMetric: metric as SwingMetric,
      flatBelow: edgeAt(`${path}.flatBelow`, raw['flatBelow']),
      inBandLow: edgeAt(`${path}.inBandLow`, raw['inBandLow']),
      inBandHigh: edgeAt(`${path}.inBandHigh`, raw['inBandHigh']),
      runawaySlopePerMin: edgeAt(`${path}.runawaySlopePerMin`, raw['runawaySlopePerMin']),
      suppressWhenSaturated: trueAt(
        `${path}.suppressWhenSaturated`,
        raw['suppressWhenSaturated'],
        'A flagged run’s wait-based figure is suppressed exactly as its AWT is (CLAUDE.md § Statistical discipline).',
      ),
    }),
  );
}

function masterySlopeOf(value: unknown): MasterySlopeBands {
  const path = 'masterySlope';
  const raw = objectAt(path, value, ['attempts', 'seedSet', 'verdict', 'ciMustExcludeZero', 'comment']);
  optionalStringAt(`${path}.comment`, raw['comment']);
  const seedSet = raw['seedSet'];
  if (seedSet !== 'holdout' && seedSet !== 'tuning') {
    throw new EngagementBandsError(
      `${path}.seedSet must be "holdout" or "tuning", a campaign stage's two declared seed sets; found ${JSON.stringify(seedSet) ?? 'nothing'}.`,
    );
  }
  return Object.freeze({
    attempts: integerAt(
      `${path}.attempts`,
      raw['attempts'],
      3,
      Number.MAX_SAFE_INTEGER,
      'A fitted slope has no standard error below three points, so no interval could be formed.',
    ),
    seedSet,
    ciMustExcludeZero: trueAt(`${path}.ciMustExcludeZero`, raw['ciMustExcludeZero'], STATISTICAL_LAW),
    verdict: stringAt(`${path}.verdict`, raw['verdict']),
  });
}

function overridesOf(
  value: unknown,
  top: TensionBand,
  knownScenarioIds: readonly string[] | undefined,
): ReadonlyMap<string, Partial<TensionBandEdges>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new EngagementBandsError(`scenarios must be an object keyed by scenario id; found ${JSON.stringify(value) ?? 'nothing'}.`);
  }
  const scenarios = value as Json;
  const overrides = new Map<string, Partial<TensionBandEdges>>();
  for (const [id, entry] of Object.entries(scenarios)) {
    const path = `scenarios.${id}`;
    if (id === 'default') {
      const raw = objectAt(path, entry, ['useTopLevelBands', 'comment']);
      optionalStringAt(`${path}.comment`, raw['comment']);
      trueAt(
        `${path}.useTopLevelBands`,
        raw['useTopLevelBands'],
        'An unlisted scenario reads the top-level band; the entry declares that and can declare nothing else.',
      );
      continue;
    }
    if (knownScenarioIds !== undefined && !knownScenarioIds.includes(id)) {
      throw new EngagementBandsError(
        `${path} names a scenario the campaign does not declare, so its override could never apply. Known: ${knownScenarioIds.join(', ')}.`,
      );
    }
    const raw = objectAt(path, entry, ['tensionBand', 'comment']);
    optionalStringAt(`${path}.comment`, raw['comment']);
    const edges: Partial<Record<keyof TensionBandEdges, number>> = {};
    if (raw['tensionBand'] !== undefined) {
      const band = objectAt(`${path}.tensionBand`, raw['tensionBand'], EDGE_KEYS);
      for (const key of EDGE_KEYS) {
        if (band[key] !== undefined) edges[key] = edgeAt(`${path}.tensionBand.${key}`, band[key]);
      }
    }
    checkedBand(path, { ...top, ...edges });
    overrides.set(id, Object.freeze(edges));
  }
  return overrides;
}

/**
 * The bands file, parsed and checked.
 *
 * @param knownScenarioIds the scenario ids an override may name. Omitted, any id is accepted.
 * @throws EngagementBandsError on an unknown key, an unknown metric, a value outside its range, or a
 *   band whose regions overlap.
 */
export function parseEngagementBands(raw: unknown, knownScenarioIds?: readonly string[]): EngagementBands {
  const top = objectAt('the engagement bands file', raw, [
    'generatedBy',
    'contract',
    'meaningfulChoice',
    'tensionBand',
    'masterySlope',
    'scenarios',
  ]);
  optionalStringAt('generatedBy', top['generatedBy']);
  optionalStringAt('contract', top['contract']);
  const tensionBand = tensionBandOf(top['tensionBand']);
  return Object.freeze({
    meaningfulChoice: meaningfulChoiceOf(top['meaningfulChoice']),
    tensionBand,
    masterySlope: masterySlopeOf(top['masterySlope']),
    tensionOverrides: overridesOf(top['scenarios'], tensionBand, knownScenarioIds),
  });
}

/** The tension band a scenario reads: its own override laid over the top-level band, or the top-level band. */
export function tensionBandFor(bands: EngagementBands, scenarioId: string): ResolvedTensionBand {
  const override = bands.tensionOverrides.get(scenarioId) ?? {};
  return Object.freeze({
    ...bands.tensionBand,
    ...override,
    scenarioId,
    overridden: Object.freeze(EDGE_KEYS.filter((key) => override[key] !== undefined)),
  });
}
