/**
 * The tension band on real stage runs: the series it reads, the baseline it reports, and the band
 * edges moved in the data file with the classification required to move on the same runs.
 *
 * The last block is the standing requirement applied to `data/engagement-bands.json`, which this
 * module made a file with a reader: a band edge that moved nothing on a run would be data nobody
 * reads, the shape § D112 measured in `destination-eta`'s zero weight.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadConfig, runSimulation, type LoadedConfig, type SimulationResult } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { PlaySessions } from '../fuzz/play.js';
import { stageSessionConfigFor } from '../fuzz/stageSession.js';
import { playContextFor, type PlayContext } from '../fuzz/verbs.js';
import { DATA_DIR } from '../validation/harness.js';
import { parseEngagementBands, tensionBandFor, type TensionBand } from './bands.js';
import { stageBaselineRuns } from './runs.js';
import {
  pairedTension,
  tallyTension,
  tensionMismatches,
  tensionOf,
  tensionSeriesOf,
  type TensionReading,
} from './tension.js';

const STAGE = 'stage-1-first-call';
const read = (file: string): unknown => JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8')) as unknown;
const RAW_BANDS = read('engagement-bands.json') as Record<string, unknown>;

/** The shipped bands file with one path replaced, parsed and resolved for stage 1. */
function bandWith(path: readonly string[], value: unknown): TensionBand {
  const copy = JSON.parse(JSON.stringify(RAW_BANDS)) as Record<string, unknown>;
  let at: Record<string, unknown> = copy;
  for (const key of path.slice(0, -1)) at = at[key] as Record<string, unknown>;
  at[path[path.length - 1] as string] = value;
  return tensionBandFor(parseEngagementBands(copy), STAGE);
}

let config: LoadedConfig;
let context: PlayContext;
let tuning: readonly SimulationResult[];
let holdout: readonly SimulationResult[];
const SHIPPED = tensionBandFor(parseEngagementBands(RAW_BANDS), STAGE);
const classify = (runs: readonly SimulationResult[], band: TensionBand): readonly TensionReading[] =>
  runs.map((run) => tensionOf(run.record, run.summary, band));

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  context = playContextFor({ config, campaign: read('campaign.json'), priceSchedule: read('price-schedule.json'), stageId: STAGE });
  const sessions = new PlaySessions(context);
  tuning = stageBaselineRuns(sessions, 'tuning');
  holdout = stageBaselineRuns(sessions, 'holdout');
});

describe('the series is the one the summary fitted its saturation test on', () => {
  it('reads the recorded samples in the summary’s window, and its slope is the summary’s, in persons per minute', () => {
    for (const run of [...tuning, ...holdout]) {
      const series = tensionSeriesOf(run.record, run.summary);
      expect(series.source).toBe('recorded');
      expect(series.samples.length).toBe(run.summary.saturation.sampleCount);
      expect(series.samples.every((sample) => sample.at >= run.summary.window.startS && sample.at < run.summary.window.endS)).toBe(true);
      expect(tensionOf(run.record, run.summary, SHIPPED).slopePersonsPerMinute).toBeCloseTo(run.summary.saturation.slopePersonsPerMinute, 9);
    }
  });

  it('reads the summary’s window, not the record’s: a stage-1 record carries the template band, the summary the full run', () => {
    const run = tuning[0] as SimulationResult;
    expect(run.summary.window).toMatchObject({ id: 'full-run', startS: 0, endS: 900 });
    expect(run.record.reportWindow).not.toEqual(run.summary.window);
    expect(tensionSeriesOf(run.record, run.summary).samples.length).toBe(120);
  });
});

describe('the stage-1 baseline, pinned to the runs that produced it', () => {
  it('is 1 of 50 in band on the tuning seeds and 1 of 50 on the holdout seeds, every other run flat', () => {
    for (const [runs, inBandReplication] of [
      [tuning, 47],
      [holdout, 46],
    ] as const) {
      const readings = classify(runs, SHIPPED);
      const tally = tallyTension(readings);
      expect(tally.inBand).toEqual({ k: 1, n: 50 });
      expect(tally.counts).toEqual({ flat: 49, 'below-band': 0, 'in-band': 1, 'above-band': 0, runaway: 0, suppressed: 0 });
      expect(readings.filter((reading) => reading.tensionClass === 'in-band').map((reading) => reading.replication)).toEqual([inBandReplication]);
      // The swing that put it there is one person, and every other run's is none at all.
      expect(readings.map((reading) => reading.swingPersons).filter((swing) => swing !== 0)).toEqual([1]);
    }
  });
});

describe('a band edge moved in the data moves a classification, on the same runs', () => {
  it('without stage 1’s override the one in-band run reads flat', () => {
    const topLevel = bandWith(['scenarios', STAGE, 'tensionBand'], {});
    const moved = classify(tuning, topLevel);
    const shipped = classify(tuning, SHIPPED);
    const changed = moved.filter((reading, index) => reading.tensionClass !== shipped[index]?.tensionClass);
    expect(changed.map((reading) => [reading.replication, reading.tensionClass])).toEqual([[47, 'flat']]);
    expect(tallyTension(moved).inBand).toEqual({ k: 0, n: 50 });
  });

  it('with the flat edge and the band’s floor at zero, every run is in band', () => {
    const moved = bandWith(['scenarios', STAGE, 'tensionBand'], { flatBelow: 0, inBandLow: 0, inBandHigh: 6 });
    expect(tallyTension(classify(tuning, moved)).inBand).toEqual({ k: 50, n: 50 });
  });

  it('with the band’s ceiling below one person, the in-band run reads above the band', () => {
    const moved = bandWith(['scenarios', STAGE, 'tensionBand'], { flatBelow: 0.25, inBandLow: 0.25, inBandHigh: 0.5 });
    expect(tallyTension(classify(tuning, moved)).counts['above-band']).toBe(1);
  });
});

describe('runaway needs both halves, and is never in band', () => {
  /** Stage 1's building and day at a demand two cars cannot carry: every run here saturates. */
  let overrun: readonly SimulationResult[] = [];
  beforeAll(() => {
    const stage = { ...context.stage, arrivalRatePctPop5min: 100 };
    overrun = [0, 1, 2, 3].map((replication) => runSimulation(stageSessionConfigFor(stage, context.resources, replication)));
  });

  it('reads a saturated run with a steep slope as runaway, its swing withheld and its ground named', () => {
    for (const reading of classify(overrun, SHIPPED)) {
      expect(reading.tensionClass).toBe('runaway');
      expect(Number.isNaN(reading.swingPersons)).toBe(true);
      expect(reading.suppressedBecause).toBe('saturated');
      expect(reading.slopePersonsPerMinute).toBeGreaterThan(SHIPPED.runawaySlopePerMin);
    }
  });

  it('moves the same runs to suppressed when the slope limit is raised past their slope in the data', () => {
    const moved = bandWith(['tensionBand', 'runawaySlopePerMin'], 1000);
    const tally = tallyTension(classify(overrun, moved));
    expect(tally.counts).toMatchObject({ runaway: 0, suppressed: 4, 'in-band': 0 });
    // A flagged run stays in the denominator: four runs, none in band, none left out.
    expect(tally.inBand).toEqual({ k: 0, n: 4 });
  });

  it('never reads a steep slope as runaway on a run whose mean is valid', () => {
    const steepButValid = classify(tuning, bandWith(['tensionBand', 'runawaySlopePerMin'], 0));
    expect(steepButValid.some((reading) => reading.slopePersonsPerMinute > 0)).toBe(true);
    expect(steepButValid.filter((reading) => reading.tensionClass === 'runaway')).toEqual([]);
  });
});

describe('two arms are compared paired, on the same seeds, and never otherwise', () => {
  it('reads an arm against itself as identical, and the stage against its overrun as fewer in band', () => {
    const shipped = classify(tuning, SHIPPED);
    expect(pairedTension(shipped, shipped)).toMatchObject({ verdict: 'INDISTINGUISHABLE', identical: true, pairs: 50 });
    const allInBand = classify(tuning, bandWith(['scenarios', STAGE, 'tensionBand'], { flatBelow: 0, inBandLow: 0, inBandHigh: 6 }));
    expect(pairedTension(allInBand, shipped).verdict).toBe('HIGHER');
    expect(pairedTension(shipped, allInBand).verdict).toBe('LOWER');
  });

  it('refuses to pair the tuning arm with the holdout arm, which are not on the same seeds', () => {
    expect(() => pairedTension(classify(tuning, SHIPPED), classify(holdout, SHIPPED))).toThrow(/not a pair/u);
  });

  it('suppresses a comparison on fewer than fifty pairs', () => {
    const few = classify(tuning, SHIPPED).slice(0, 10);
    expect(pairedTension(few, few)).toMatchObject({ verdict: 'SUPPRESSED', pairs: 10 });
  });
});

describe('the persona’s narration', () => {
  it('is empty with no narration, and names a felt mismatch seed by seed when there is one', () => {
    const readings = classify(tuning, SHIPPED);
    expect(tensionMismatches(readings, [])).toEqual({ inBandButNotFelt: [], feltButNotInBand: [], unmatched: [] });
    const inBand = readings.find((reading) => reading.tensionClass === 'in-band') as TensionReading;
    const flat = readings.find((reading) => reading.tensionClass === 'flat') as TensionReading;
    const found = tensionMismatches(readings, [
      { seed: inBand.seed, felt: 'flat' },
      { seed: flat.seed, felt: 'in-band' },
      { seed: 'no-such-seed', felt: 'chaotic' },
    ]);
    expect(found.inBandButNotFelt.map((row) => row.reading.seed)).toEqual([inBand.seed]);
    expect(found.feltButNotInBand.map((row) => row.reading.seed)).toEqual([flat.seed]);
    expect(found.unmatched).toEqual([{ seed: 'no-such-seed', felt: 'chaotic' }]);
  });
});
