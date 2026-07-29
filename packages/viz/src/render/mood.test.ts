/**
 * The building mood gauge, and the three rules it exists to keep.
 *
 * **R1** is the one that decides whether the feature is worth having: at the viewer's own defaults
 * only 14 of 60 shipped building × dispatcher cells produce a quotable mean (**M1**), so a mood
 * derived from a mean is blank on the 46 cells whose mood is worth showing. The test that matters
 * here is therefore not *"is the mood right"* but *"can the mood see an estimate at all"* — and it
 * is answered by mutating every estimate on a **real, saturated** recording and requiring the mood
 * to come out byte-identical.
 *
 * **R2** is about the words: a score is a property of a run and never of a dispatcher.
 *
 * **R6** is about time: an outcome read before the playhead reaches `endedAt` is a preview and must
 * say so.
 */

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { DATA_DIR, breadthConfig, fixtureSummary } from '../fixtures.test-helper.js';
import { recordRun } from '../record/recordRun.js';
import { meansAreSuppressed, queueAt, type FloorQueue } from '../frame/overlay.js';
import type { VizRecording, VizSummary } from '../contract/types.js';
import { MOOD_GLYPH, buildingMood, moodObservationsOf, type MoodObservations } from './mood.js';

let saturated: VizRecording;

beforeAll(async () => {
  const config: LoadedConfig = await loadConfig(DATA_DIR);
  // Measured, not assumed: Midtown Office saturates at the shipped traffic rates over 900 s, and
  // `overlay.test.ts` asserts exactly that. It is the run whose statistics are fully suppressed.
  saturated = recordRun(breadthConfig(config, 'midtown-office')).recording;
}, 600_000);

/* -------------------------------------------------------------------------- *
 * Synthetic inputs, for the rules that need a specific observation
 * -------------------------------------------------------------------------- */

function queue(overrides: Partial<FloorQueue> = {}): FloorQueue {
  return {
    floorId: '7',
    riders: [],
    groups: [],
    total: 0,
    oldestWaitS: 0,
    worstBand: 'settling',
    recentlyBoarded: 0,
    ...overrides,
  };
}

function observations(
  summary: Partial<VizSummary> = {},
  queues: readonly FloorQueue[] = [],
  atS = 900,
): MoodObservations {
  return moodObservationsOf({ summary: fixtureSummary(summary), endedAt: 900 }, queues, atS);
}

/* -------------------------------------------------------------------------- *
 * R1 / R5 — only observations may be scored
 * -------------------------------------------------------------------------- */

describe('R1 — the mood cannot see an estimate, and the type is what says so', () => {
  it('carries no suppressible field into the scorer', () => {
    // The narrowing, asserted on the value rather than only in the types: `moodObservationsOf` is
    // the single place it happens, and a spread that quietly re-admitted a field would show here.
    const keys = Object.keys(observations().summary).sort((a, b) => a.localeCompare(b));
    for (const banned of [
      'meanWaitS',
      'wait95S',
      'meanTimeToDestinationS',
      'awtIsValid',
      'awtInvalidReason',
      'achievedInterval',
      'energy',
    ]) {
      expect(keys, `${banned} must not reach the scorer`).not.toContain(banned);
    }
    // …and it is not empty, which is the way this assertion could pass for the wrong reason.
    expect(keys).toContain('saturated');
    expect(keys).toContain('serviceLevel');
    expect(keys).toContain('handlingCapacity');
  });

  it('is unchanged when every estimate on a real suppressed run is replaced', () => {
    /*
     * The strongest form available: take a run whose statistics really are suppressed, move all
     * five omitted fields to absurd values, and require the mood to be identical. If any of them
     * ever leaked into the gauge — through a helper, a spread, or a "while we are here" — this
     * goes red.
     */
    expect(meansAreSuppressed(saturated)).toBe(true);
    const queues = queueAt(saturated, saturated.endedAt);
    const before = buildingMood(moodObservationsOf(saturated, queues, saturated.endedAt));

    const tampered: VizRecording = {
      ...saturated,
      summary: {
        ...saturated.summary,
        meanWaitS: 1e6,
        wait95S: -1e6,
        meanTimeToDestinationS: Number.NaN,
        awtIsValid: !saturated.summary.awtIsValid,
        awtInvalidReason: 'tampered',
        achievedInterval: { meanS: 1, coefficientOfVariation: 1, count: 1 },
        energy: {
          measured: false,
          workKJ: null,
          workPerServedLegKJ: null,
          deliveredLegCount: 0,
          distanceM: null,
          starts: null,
        },
      },
    };
    const after = buildingMood(moodObservationsOf(tampered, queues, tampered.endedAt));
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  }, 600_000);

  it('renders in full on a run whose statistics are entirely suppressed', () => {
    /*
     * The required evidence for this unit, and the property the whole feature is for. Every part
     * of the gauge is present on a run for which no mean, no percentile and no time-to-destination
     * may be shown — because none of them is what it is made of.
     */
    expect(saturated.summary.saturated).toBe(true);
    expect(saturated.summary.awtIsValid).toBe(false);
    const mid = (saturated.startedAt + saturated.endedAt) / 2;
    const mood = buildingMood(moodObservationsOf(saturated, queueAt(saturated, mid), mid));

    expect(mood.headline.length).toBeGreaterThan(0);
    expect(mood.glyph.length).toBeGreaterThan(0);
    expect(mood.caveat.length).toBeGreaterThan(0);
    expect(mood.drivers).toHaveLength(5);
    for (const driver of mood.drivers) {
      expect(driver.text.length, driver.id).toBeGreaterThan(0);
      // R3, applied here: nothing is blanked, dashed, or replaced by a zero standing in for a
      // refusal. There is no refusal to stand in for — that is the point.
      expect(driver.text).not.toBe('—');
      expect(driver.text).not.toContain('suppressed');
    }
    // And the run it describes really is the one whose queues diverged.
    expect(mood.level).toBe('distressed');
    expect(mood.drivers[0]?.text).toContain('never stopped growing');
  }, 600_000);
});

/* -------------------------------------------------------------------------- *
 * Liveness, per observation
 * -------------------------------------------------------------------------- */

describe('every driver reads its own observation', () => {
  const cases: readonly {
    readonly id: string;
    readonly quiet: Partial<VizSummary>;
    readonly loud: Partial<VizSummary>;
    readonly queues?: readonly FloorQueue[];
    readonly level: string;
  }[] = [
    {
      id: 'overwhelmed',
      quiet: { saturated: false },
      loud: { saturated: true },
      level: 'distressed',
    },
    {
      id: 'abandoned',
      quiet: {},
      loud: {
        serviceLevel: {
          verdict: 'starved',
          longestWaitS: 950,
          longestWaitIsCensored: true,
          overHorizonCount: 7,
          arrivalCount: 46,
          horizonS: 900,
        },
      },
      level: 'distressed',
    },
    { id: 'stranded', quiet: { undelivered: 0 }, loud: { undelivered: 9 }, level: 'frustrated' },
    {
      id: 'demand',
      quiet: { handlingCapacity: { personsPer5Min: 62, offeredPer5Min: 62, pctPopulationPer5Min: 1 } },
      loud: { handlingCapacity: { personsPer5Min: 41, offeredPer5Min: 62, pctPopulationPer5Min: 1 } },
      level: 'frustrated',
    },
  ];

  it.each(cases)('$id moves when its own field moves, and nothing else does', (probe) => {
    const quiet = buildingMood(observations(probe.quiet));
    const loud = buildingMood(observations(probe.loud));
    const quietDriver = quiet.drivers.find((driver) => driver.id === probe.id);
    const loudDriver = loud.drivers.find((driver) => driver.id === probe.id);
    expect(quietDriver?.level).toBe('calm');
    expect(loudDriver?.level).toBe(probe.level);
    expect(loudDriver?.text).not.toBe(quietDriver?.text);
    // The other four are untouched, which is what makes this a *per-field* control rather than a
    // per-feature one. T60 found a mutation coming back green because a value had two readers;
    // this is the shape that would show it.
    for (const other of quiet.drivers.filter((driver) => driver.id !== probe.id)) {
      const matching = loud.drivers.find((driver) => driver.id === other.id);
      expect(matching?.text, other.id).toBe(other.text);
    }
  });

  it('the standing driver reads the queues, not the summary', () => {
    const empty = buildingMood(observations({}, []));
    expect(empty.drivers.find((d) => d.id === 'standing')?.level).toBe('calm');
    expect(empty.drivers.find((d) => d.id === 'standing')?.text).toContain('Nobody is waiting');

    const crowded = buildingMood(
      observations({}, [queue({ total: 41, oldestWaitS: 92, worstBand: 'long' })]),
    );
    const driver = crowded.drivers.find((d) => d.id === 'standing');
    expect(driver?.level).toBe('distressed');
    // Every number in the sentence is read, not typed.
    expect(driver?.text).toContain('41 standing');
    expect(driver?.text).toContain('92 s');
  });

  it('the standing driver bands by the worst person present, not by the average', () => {
    const mixed = buildingMood(
      observations({}, [
        queue({ total: 3, oldestWaitS: 10, worstBand: 'settling' }),
        queue({ floorId: '9', total: 1, oldestWaitS: 700, worstBand: 'abandoned' }),
      ]),
    );
    expect(mixed.drivers.find((d) => d.id === 'standing')?.level).toBe('distressed');
    expect(mixed.drivers.find((d) => d.id === 'standing')?.text).toContain('4 standing at 2');
  });

  it('says a boarding out loud, on a floor and on the gauge', () => {
    const relieved = buildingMood(observations({}, [queue({ recentlyBoarded: 4 })]));
    expect(relieved.drivers.find((d) => d.id === 'standing')?.text).toContain('4 just boarded');
  });
});

describe('the level is the worst thing that happened, not a weighted sum', () => {
  it('is calm only when every observation is', () => {
    const calm = buildingMood(
      observations({
        saturated: false,
        undelivered: 0,
        handlingCapacity: { personsPer5Min: 62, offeredPer5Min: 62, pctPopulationPer5Min: 1 },
      }),
    );
    expect(calm.level).toBe('calm');
    expect(calm.drivers.every((driver) => driver.level === 'calm')).toBe(true);
  });

  it('takes the maximum, so one distressed observation is not averaged away by four calm ones', () => {
    const one = buildingMood(
      observations({
        saturated: false,
        undelivered: 0,
        handlingCapacity: { personsPer5Min: 62, offeredPer5Min: 62, pctPopulationPer5Min: 1 },
        serviceLevel: {
          verdict: 'starved',
          longestWaitS: 950,
          longestWaitIsCensored: true,
          overHorizonCount: 1,
          arrivalCount: 400,
          horizonS: 900,
        },
      }),
    );
    expect(one.level).toBe('distressed');
    expect(one.drivers.filter((driver) => driver.level !== 'calm')).toHaveLength(1);
  });

  it('gives each level a distinct shape — KB-15 at the building scale', () => {
    const shapes = Object.values(MOOD_GLYPH);
    expect(new Set(shapes).size).toBe(shapes.length);
  });
});

/* -------------------------------------------------------------------------- *
 * R2 and R6 — what the words may claim, and when
 * -------------------------------------------------------------------------- */

describe('R2 — a mood is a property of a run, never of a dispatcher', () => {
  it('carries the caveat, and it names the measurement behind it', () => {
    const mood = buildingMood(observations());
    expect(mood.caveat).toContain('one run');
    expect(mood.caveat).toContain('not a verdict on the dispatcher');
    expect(mood.caveat).toContain('6 of 20');
  });

  it('never names a dispatcher and never compares two of them', () => {
    /*
     * A grep over every string the gauge can produce, on a real run. The banned words are the
     * shapes of the sentence R2 forbids — a comparative, a superlative, or an imputation that a
     * particular choice caused a particular rider's bad day.
     */
    const queues = queueAt(saturated, saturated.endedAt);
    const mood = buildingMood(moodObservationsOf(saturated, queues, saturated.endedAt));
    const said = [mood.headline, mood.caveat, ...mood.drivers.map((driver) => driver.text)]
      .join(' ')
      .toLowerCase();
    for (const banned of [
      saturated.dispatcherProfileId,
      ' better than',
      ' worse than',
      'best dispatcher',
      'you caused',
      'your choice',
    ]) {
      expect(said, `mood must not say "${banned}"`).not.toContain(banned);
    }
  }, 600_000);
});

describe('R6 — a mood read before the run ends is a preview and says so', () => {
  it('is provisional until the playhead reaches endedAt', () => {
    expect(buildingMood(observations({}, [], 0)).provisional).toBe(true);
    expect(buildingMood(observations({}, [], 899.9)).provisional).toBe(true);
    expect(buildingMood(observations({}, [], 900)).provisional).toBe(false);
    // Past the end — the playhead is clamped upstream, and this must not un-finish the run.
    expect(buildingMood(observations({}, [], 1e6)).provisional).toBe(false);
  });

  it('says it in the headline, not only in a flag', () => {
    // A flag no renderer is obliged to read is not a retraction. The words carry it too.
    expect(buildingMood(observations({}, [], 100)).headline).toContain('So far');
    expect(buildingMood(observations({}, [], 900)).headline).not.toContain('So far');
  });
});
