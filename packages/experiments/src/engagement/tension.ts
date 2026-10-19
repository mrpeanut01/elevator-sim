/**
 * **Proxy 2, the tension band: how much a run's queue swings, and whether it ran away.**
 *
 * The claim it tests is pillar 4's *rising tension*: a run whose queue never moves is boring, a run
 * whose queue only grows is a loss the player cannot affect, and engagement is supposed to live in
 * between. This is a **premise about people**, uncalibrated, and every output says so; nothing here is
 * `Measured` until a human ground-truth set moves a band edge (the spec's calibration step).
 *
 * ## Per replication
 *
 * - **Swing**: the interquartile range of the queue samples inside the report window, in persons,
 *   by `core`'s type 7 percentile (`percentile`, its default method).
 * - **Direction**: `linearTrend` over the same samples, `x` in seconds from the window's start, so the
 *   slope is persons per **second**; it is multiplied by 60 and compared, in persons per **minute**,
 *   with the bands file's `runawaySlopePerMin`. That is the unit `SaturationThresholds` states its
 *   own slope gate in, and the factor is the only conversion anywhere in this module.
 *
 * Then, using the scenario's resolved band (`bands.ts#tensionBandFor`):
 *
 * | class | when |
 * |---|---|
 * | `runaway` | `awtIsValid` is false **and** the slope is above `runawaySlopePerMin` |
 * | `suppressed` | `awtIsValid` is false on any other footing, or fewer than two samples |
 * | `flat` | swing below `flatBelow` |
 * | `below-band` | swing in `[flatBelow, inBandLow)`, empty while the two edges are equal |
 * | `in-band` | swing in `[inBandLow, inBandHigh]` |
 * | `above-band` | swing above `inBandHigh`, the case the spec's persona would call chaotic |
 *
 * A flagged run's swing is not published (`NaN`), exactly as its AWT is not: the spec's *a fun proxy
 * built on a bogus run is bogus*. Its slope is published, because the slope is what makes it runaway.
 *
 * ## Which queue series, and a correction to the brief this was built from
 *
 * The brief named `queueLengthSeries`. `core` says recorded samples are always preferred, because
 * only the simulation knows about a rider who left a queue for a reason other than boarding, and
 * `summarizeRun` fits its saturation trend (one half of the runaway clause) on the recorded samples
 * whenever the window holds enough of them. So this reads the series **the summary itself used**,
 * named by `summary.saturation.source`: the record's own samples inside the window when it says
 * `recorded`, `queueLengthSeries` over the window at its default sampling when it says `derived`.
 * Both halves of the runaway clause are then measured on one series. Every shipped stage run records
 * its samples (120 over a 900 s day on `stage-1-first-call`), so the derived branch is reached only by
 * a record that carries none.
 *
 * **The window is the summary's, not the record's.** A stage run's `RunRecord.reportWindow` is the
 * demand template's band, while the stage summarises over the window `reportWindowForBuilding`
 * chooses (`full-run` on Garden Apartments). The summary's `window` is the one its `awtIsValid` was
 * decided over, so that is the one read here.
 *
 * ## The fraction, and why a flagged run stays in its denominator
 *
 * {@link tallyTension} reports `in-band` as `k of n` over **every** replication, with each class
 * counted beside it. A flagged run is never in band and is never left out of `n`: dropping it would
 * be § D158's selection on the outcome, because the runs that fall out are the hard ones. Two arms
 * are compared by {@link pairedTension}, on 0/1 in-band indicators paired by replication seed, never
 * by setting two `k of n` intervals side by side.
 *
 * Pure: every function here reads its arguments and nothing else. The decisions bind nothing outside
 * `engagement/` (§ D405); the proxies as a whole are § D1595.
 */

import {
  linearTrend,
  percentile,
  queueLengthSeries,
  windowContains,
  type QueueSample,
  type RunRecord,
  type RunSummary,
} from '@elevator-sim/core';

import type { TensionBand } from './bands.js';
import { pairedComparison, type KOfN, type PairedComparison } from './counts.js';

/** Every class a replication can land in, in reading order. */
export const TENSION_CLASSES = ['flat', 'below-band', 'in-band', 'above-band', 'runaway', 'suppressed'] as const;

export type TensionClass = (typeof TENSION_CLASSES)[number];

/** The four summary fields the band reads. */
export type TensionSummary = Pick<RunSummary, 'window' | 'awtIsValid' | 'awtInvalidGround' | 'saturation'>;

/** The record fields the band reads. */
export type TensionRecord = Pick<RunRecord, 'seed' | 'replication' | 'queueSamples' | 'passengers'>;

/** The queue series a summary's saturation test was fitted on, inside its window, in time order. */
export interface TensionSeries {
  readonly source: 'recorded' | 'derived' | 'none';
  readonly samples: readonly QueueSample[];
}

/** The series {@link tensionOf} measures. See the module docstring for why it follows the summary. */
export function tensionSeriesOf(record: TensionRecord, summary: TensionSummary): TensionSeries {
  const { window } = summary;
  if (summary.saturation.source === 'recorded') {
    return Object.freeze({
      source: 'recorded',
      samples: Object.freeze(
        record.queueSamples.filter((sample) => windowContains(window, sample.at)).sort((a, b) => a.at - b.at),
      ),
    });
  }
  if (summary.saturation.source === 'derived') {
    return Object.freeze({ source: 'derived', samples: queueLengthSeries(record.passengers, { window }) });
  }
  return Object.freeze({ source: 'none', samples: Object.freeze([]) });
}

/** One replication's swing, direction and class. */
export interface TensionReading {
  /** The run's master seed: what a paired comparison pairs on. */
  readonly seed: string;
  readonly replication: number | undefined;
  readonly source: TensionSeries['source'];
  readonly sampleCount: number;
  /** Interquartile range of the window's queue samples, persons. `NaN` on a flagged run. */
  readonly swingPersons: number;
  /** Fitted queue growth over the window, persons per minute. */
  readonly slopePersonsPerMinute: number;
  readonly tensionClass: TensionClass;
  /** The `awtIsValid` ground, or why the swing could not be taken. Present on `runaway` and `suppressed`. */
  readonly suppressedBecause?: string | undefined;
}

/** Classify one replication against a band. */
export function tensionOf(record: TensionRecord, summary: TensionSummary, band: TensionBand): TensionReading {
  const series = tensionSeriesOf(record, summary);
  const trend = linearTrend(series.samples.map((sample) => ({ x: sample.at - summary.window.startS, y: sample.waiting })));
  // persons per second × 60 = persons per minute, the unit `runawaySlopePerMin` is written in.
  const slopePersonsPerMinute = trend.slope * 60;
  const base = {
    seed: record.seed,
    replication: record.replication,
    source: series.source,
    sampleCount: series.samples.length,
    slopePersonsPerMinute,
  };
  if (!summary.awtIsValid) {
    return Object.freeze({
      ...base,
      swingPersons: Number.NaN,
      tensionClass: slopePersonsPerMinute > band.runawaySlopePerMin ? 'runaway' : 'suppressed',
      suppressedBecause: summary.awtInvalidGround ?? 'refused',
    });
  }
  if (series.samples.length < 2) {
    return Object.freeze({
      ...base,
      swingPersons: Number.NaN,
      tensionClass: 'suppressed',
      suppressedBecause: 'fewer than two queue samples in the window',
    });
  }
  const values = series.samples.map((sample) => sample.waiting);
  const swingPersons = percentile(values, 75) - percentile(values, 25);
  const tensionClass: TensionClass =
    swingPersons < band.flatBelow
      ? 'flat'
      : swingPersons < band.inBandLow
        ? 'below-band'
        : swingPersons <= band.inBandHigh
          ? 'in-band'
          : 'above-band';
  return Object.freeze({ ...base, swingPersons, tensionClass });
}

/** What a set of replications says, as counts. */
export interface TensionTally {
  readonly n: number;
  readonly counts: Readonly<Record<TensionClass, number>>;
  /** Replications in band, of every replication. */
  readonly inBand: KOfN;
}

export function tallyTension(readings: readonly TensionReading[]): TensionTally {
  const counts = Object.fromEntries(TENSION_CLASSES.map((tensionClass) => [tensionClass, 0])) as Record<TensionClass, number>;
  for (const reading of readings) counts[reading.tensionClass] += 1;
  return Object.freeze({
    n: readings.length,
    counts: Object.freeze(counts),
    inBand: Object.freeze({ k: counts['in-band'], n: readings.length }),
  });
}

/**
 * Two arms' in-band indicators, paired replication by replication: candidate minus baseline, so
 * `HIGHER` means the candidate lands in band on more of the shared seeds.
 *
 * @throws Error when the two arms are not on the same seeds in the same order: an interval over
 *   unpaired runs is the confident nonsense CLAUDE.md is written against.
 */
export function pairedTension(candidate: readonly TensionReading[], baseline: readonly TensionReading[]): PairedComparison {
  if (candidate.length !== baseline.length) {
    throw new Error(`pairedTension: ${String(candidate.length)} candidate replications against ${String(baseline.length)}; a pair needs one of each`);
  }
  for (const [index, reading] of candidate.entries()) {
    if (reading.seed !== baseline[index]?.seed) {
      throw new Error(`pairedTension: pair ${String(index)} is seed ${reading.seed} against ${String(baseline[index]?.seed)}, which is not a pair`);
    }
  }
  const inBand = (reading: TensionReading): number => (reading.tensionClass === 'in-band' ? 1 : 0);
  return pairedComparison(candidate.map(inBand), baseline.map(inBand));
}

/* -------------------------------------------------------------------------- *
 * The persona's half
 * -------------------------------------------------------------------------- */

/** What a persona says a run felt like. The spec's three words. */
export type FeltTension = 'flat' | 'in-band' | 'chaotic';

export interface FeltRun {
  readonly seed: string;
  readonly felt: FeltTension;
}

export interface TensionMismatches {
  /**
   * Measured in band, felt flat or chaotic: the swing happened and did not read on screen. The spec
   * calls this the high-value finding, a pacing or legibility defect rather than a balance one.
   */
  readonly inBandButNotFelt: readonly { readonly reading: TensionReading; readonly felt: FeltTension }[];
  /** Felt in band, measured otherwise. */
  readonly feltButNotInBand: readonly { readonly reading: TensionReading; readonly felt: FeltTension }[];
  /** Narrations about a seed no reading carries. */
  readonly unmatched: readonly FeltRun[];
}

/**
 * The persona's narration against the telemetry, seed by seed. There is no narration until the
 * playtest phase, so the baseline calls this with none and every list comes back empty.
 */
export function tensionMismatches(readings: readonly TensionReading[], felt: readonly FeltRun[]): TensionMismatches {
  const bySeed = new Map(readings.map((reading) => [reading.seed, reading]));
  const inBandButNotFelt: { reading: TensionReading; felt: FeltTension }[] = [];
  const feltButNotInBand: { reading: TensionReading; felt: FeltTension }[] = [];
  const unmatched: FeltRun[] = [];
  for (const run of felt) {
    const reading = bySeed.get(run.seed);
    if (reading === undefined) unmatched.push(run);
    else if (reading.tensionClass === 'in-band' && run.felt !== 'in-band') inBandButNotFelt.push({ reading, felt: run.felt });
    else if (reading.tensionClass !== 'in-band' && run.felt === 'in-band') feltButNotInBand.push({ reading, felt: run.felt });
  }
  return Object.freeze({
    inBandButNotFelt: Object.freeze(inBandButNotFelt),
    feltButNotInBand: Object.freeze(feltButNotInBand),
    unmatched: Object.freeze(unmatched),
  });
}
