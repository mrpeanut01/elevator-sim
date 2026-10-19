/**
 * `data/engagement-bands.json` is read as shipped, and everything it may not say is refused by name.
 *
 * The file's first reader is `bands.ts`, so these cases are what keep a misspelt edge or an unknown
 * metric from shipping as a band that silently kept its old value. Whether a moved edge actually moves
 * a classification on real runs is `tension.test.ts`'s job, and whether the command reads the file at
 * all is `packages/cli/src/commands/fuzzEngagement.test.ts`'s.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DATA_DIR } from '../validation/harness.js';
import { playStageIdsOf } from '../fuzz/stageSession.js';
import { EngagementBandsError, parseEngagementBands, tensionBandFor } from './bands.js';

const RAW = JSON.parse(readFileSync(join(DATA_DIR, 'engagement-bands.json'), 'utf8')) as Record<string, unknown>;
const STAGE_IDS = playStageIdsOf(JSON.parse(readFileSync(join(DATA_DIR, 'campaign.json'), 'utf8')) as unknown);

/** The shipped file with one path replaced (or removed, with `undefined`). */
function edited(path: readonly string[], value: unknown): unknown {
  const copy = JSON.parse(JSON.stringify(RAW)) as Record<string, unknown>;
  let at: Record<string, unknown> = copy;
  for (const key of path.slice(0, -1)) at = at[key] as Record<string, unknown>;
  const last = path[path.length - 1] as string;
  if (value === undefined) Reflect.deleteProperty(at, last);
  else at[last] = value;
  return copy;
}

describe('the shipped bands file', () => {
  it('parses, against the campaign’s own stage ids', () => {
    const bands = parseEngagementBands(RAW, STAGE_IDS);
    expect(bands.meaningfulChoice.replications).toBe(50);
    expect(bands.masterySlope).toMatchObject({ attempts: 8, seedSet: 'holdout' });
    expect(bands.tensionBand).toMatchObject({
      swingMetric: 'iqr-of-queue-length-samples',
      flatBelow: 2,
      inBandLow: 2,
      inBandHigh: 12,
      runawaySlopePerMin: 0.5,
    });
  });

  it('lays stage 1’s override over the top-level band, and leaves every other stage on the top level', () => {
    const bands = parseEngagementBands(RAW, STAGE_IDS);
    expect(tensionBandFor(bands, 'stage-1-first-call')).toMatchObject({
      flatBelow: 1,
      inBandLow: 1,
      inBandHigh: 6,
      runawaySlopePerMin: 0.5,
      overridden: ['flatBelow', 'inBandLow', 'inBandHigh'],
    });
    const other = STAGE_IDS.find((id) => id !== 'stage-1-first-call') ?? '';
    expect(tensionBandFor(bands, other)).toMatchObject({ flatBelow: 2, inBandLow: 2, inBandHigh: 12, overridden: [] });
  });
});

describe('what the file may not say is refused, never ignored', () => {
  const refusals: readonly (readonly [string, unknown, RegExp])[] = [
    ['a misspelt edge', edited(['tensionBand', 'inBandHi'], 9), /"inBandHi"/u],
    ['an unknown section', edited(['funIndex'], { weight: 1 }), /"funIndex"/u],
    ['an unknown metric', edited(['tensionBand', 'swingMetric'], 'stddev-of-queue'), /cannot compute/u],
    ['a verdict rule the repository forbids', edited(['meaningfulChoice', 'ciMustExcludeZero'], false), /must be true/u],
    ['a flagged run left unsuppressed', edited(['tensionBand', 'suppressWhenSaturated'], false), /must be true/u],
    ['ten replications', edited(['meaningfulChoice', 'replications'], 10), /\[50, 200\]/u],
    ['a slope with no standard error', edited(['masterySlope', 'attempts'], 2), /three points/u],
    ['a seed set the stages do not declare', edited(['masterySlope', 'seedSet'], 'fresh'), /"holdout" or "tuning"/u],
    ['a flat region overlapping the band', edited(['tensionBand', 'flatBelow'], 3), /flatBelow/u],
    ['an empty band', edited(['tensionBand', 'inBandHigh'], 2), /inBandLow/u],
    ['a negative edge', edited(['tensionBand', 'runawaySlopePerMin'], -1), /at least 0/u],
    ['a missing edge', edited(['tensionBand', 'flatBelow'], undefined), /tensionBand\.flatBelow/u],
    ['an override of something that is not an edge', edited(['scenarios', 'stage-1-first-call', 'tensionBand', 'swingMetric'], 'x'), /"swingMetric"/u],
    ['an override that inverts the band', edited(['scenarios', 'stage-1-first-call', 'tensionBand', 'inBandHigh'], 0.5), /inBandHigh/u],
    ['a default that opts out of the default', edited(['scenarios', 'default', 'useTopLevelBands'], false), /must be true/u],
    ['an override for a stage nobody declares', edited(['scenarios', 'stage-1-first-cal'], { tensionBand: { flatBelow: 1 } }), /does not declare/u],
  ];

  it.each(refusals)('refuses %s', (_label, raw, message) => {
    expect(() => parseEngagementBands(raw, STAGE_IDS)).toThrow(EngagementBandsError);
    expect(() => parseEngagementBands(raw, STAGE_IDS)).toThrow(message);
  });

  it('accepts an override for any id when no ids are supplied, and refuses it once they are', () => {
    const raw = edited(['scenarios', 'a-stage-from-elsewhere'], { tensionBand: { flatBelow: 1, inBandLow: 1 } });
    expect(tensionBandFor(parseEngagementBands(raw), 'a-stage-from-elsewhere').flatBelow).toBe(1);
    expect(() => parseEngagementBands(raw, STAGE_IDS)).toThrow(EngagementBandsError);
  });
});
