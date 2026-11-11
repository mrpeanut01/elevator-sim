import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseDispatcherProfiles } from '@elevator-sim/core';
import { describe, expect, it } from 'vitest';

import { DEFAULT_LEVERS, specFromProfile } from '../authoring/dispatcherSpec.js';
import { defaultSelectorSpec, selectorContextFrom } from '../authoring/selectorSpec.js';
import { batchLibraryOf } from '../batch/library.js';
import type { BatchReport } from '../batch/report.js';
import { BATCH_METRICS } from '../batch/types.js';

import {
  TEST_BED_CROWDS,
  TEST_BED_DEFAULT_CROWD,
  TEST_BED_HEADLINE,
  TEST_BED_RUN_S,
  TEST_BED_VERDICT_WORDS,
  TEST_BED_WORKING_ID,
  testBedProfilesOf,
  testBedRequestOf,
  testBedVerdictWordOf,
  testBedViewOf,
  testBedBuildingLabelOf,
  testBedWorkingProfileOf,
} from './testBedModel.js';

const FILE = parseDispatcherProfiles(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../../../data/dispatcher-profiles.json', import.meta.url)),
      'utf8',
    ),
  ),
);
const SHIPPED = FILE.profiles[0];
if (SHIPPED === undefined) throw new Error('data/ ships no dispatcher');
const BUILT = {
  spec: specFromProfile(SHIPPED, SHIPPED.name),
  levers: DEFAULT_LEVERS,
  selector: defaultSelectorSpec(selectorContextFrom(FILE, 900)),
  rows: [],
};

describe('the run a press makes', () => {
  const choice = { buildingId: 'midtown-office', crowdId: 'heavy', rivalId: 'eta', replications: 50 };

  it('puts the rival first and the working copy second, so every interval reads as yours minus theirs', () => {
    const request = testBedRequestOf(choice, 424242n);
    expect(request.arms.map((arm) => arm.dispatcherProfileId)).toEqual(['eta', TEST_BED_WORKING_ID]);
    expect(request).toMatchObject({
      buildingId: 'midtown-office',
      seed: '424242',
      durationS: TEST_BED_RUN_S,
      replications: 50,
      arrivalRatePctPop5min: 4,
    });
  });

  it('offers rates, opens on one of them, and falls back to the building’s own profile for an unknown id', () => {
    expect(TEST_BED_CROWDS.map((crowd) => crowd.id)).toContain(TEST_BED_DEFAULT_CROWD);
    expect(testBedRequestOf({ ...choice, crowdId: 'no-such-crowd' }, 1n).arrivalRatePctPop5min).toBeNull();
  });
});

describe('the building list', () => {
  it('marks a tower of the player’s own, and leaves a shipped one as it is named', () => {
    expect(testBedBuildingLabelOf('Midtown Office', false)).toBe('Midtown Office');
    expect(testBedBuildingLabelOf('My tower', true)).toBe('My tower (yours)');
  });
});

describe('the working copy rides unsaved', () => {
  it('is a profile the batch library admits beside the shipped ones, under a name that says whose it is', () => {
    const working = testBedWorkingProfileOf(BUILT, SHIPPED, selectorContextFrom(FILE, 900));
    expect(working.id).toBe(TEST_BED_WORKING_ID);
    expect(working.name).toBe(`Yours (${SHIPPED.name})`);
    const library = batchLibraryOf(FILE, testBedProfilesOf([], working));
    expect(library.ok).toBe(true);
  });

  it('never rides twice', () => {
    const working = testBedWorkingProfileOf(BUILT, SHIPPED, selectorContextFrom(FILE, 900));
    const profiles = testBedProfilesOf([working, { ...SHIPPED, id: 'yours-1', name: 'Mine' }], working);
    expect(profiles.map((profile) => profile.id)).toEqual(['yours-1', TEST_BED_WORKING_ID]);
  });
});

describe('the words beside a row', () => {
  it('gives a direction only to a resolved row, and never calls an under-budget one better', () => {
    expect(testBedVerdictWordOf('resolved', 'candidate')).toBe(TEST_BED_VERDICT_WORDS.better);
    expect(testBedVerdictWordOf('resolved', 'baseline')).toBe(TEST_BED_VERDICT_WORDS.worse);
    for (const verdict of ['under-budget', 'unresolved', 'shown', 'suppressed', 'unmeasured'] as const) {
      const word = testBedVerdictWordOf(verdict, 'candidate');
      expect(word).toBe(TEST_BED_VERDICT_WORDS[verdict]);
      expect(word).not.toMatch(/BETTER|WORSE/);
    }
  });

  it('leads with measures the batch really reports', () => {
    for (const metric of TEST_BED_HEADLINE) expect(BATCH_METRICS).toContain(metric);
  });
});

describe('the dock’s reading of a report', () => {
  const row = (metric: (typeof BATCH_METRICS)[number], verdict: 'resolved' | 'shown', favours: 'candidate' | 'baseline' | null) => ({
    metric,
    label: metric,
    metricClass: 'estimate' as const,
    verdict,
    estimate: null,
    pairs: 50,
    totalPairs: 50,
    suppressedPairs: 0,
    unmeasuredPairs: 0,
    sentence: `sentence about ${metric}`,
    note: 'note',
    favours,
  });
  const report = {
    buildingName: 'Midtown Office',
    demandClause: 'at 2 % of population arriving per 5 minutes',
    replications: 50,
    crnSentence: 'Common random numbers held.',
    budgetNote: null,
    arms: [{ dispatcherProfileName: 'Rival', sentence: 'in 50 runs, 0 saturated' }],
    comparisons: [
      {
        rows: [
          row('awtS', 'resolved', 'candidate'),
          row('wt95S', 'resolved', 'baseline'),
          row('energyKJ', 'shown', null),
        ],
        summary: { sentence: 'Of 3 measures…' },
      },
    ],
  } as unknown as BatchReport;

  it('keeps the report’s own sentences, splits the headline from the rest, and tones only a direction', () => {
    const view = testBedViewOf(report);
    expect(view?.ran).toBe('Midtown Office · at 2 % of population arriving per 5 minutes · 50 runs');
    expect(view?.headline.map((entry) => [entry.metric, entry.tone])).toEqual([
      ['awtS', 'good'],
      ['wt95S', 'bad'],
    ]);
    expect(view?.rest.map((entry) => [entry.metric, entry.tone, entry.sentence])).toEqual([
      ['energyKJ', 'flat', 'sentence about energyKJ'],
    ]);
    expect(view?.budgetNote).toBeUndefined();
    expect(view?.summary).toBe('Of 3 measures…');
  });

  it('answers nothing for a batch with no comparison in it', () => {
    expect(testBedViewOf({ ...report, comparisons: [] } as unknown as BatchReport)).toBeUndefined();
  });
});
