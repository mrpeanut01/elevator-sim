/**
 * `docs/10-experience-layer-contract.md` § 11 **W2**, asserted rather than described.
 *
 * W2's stated risk is *"this is the unit most likely to acquire a field with no consumer"*, and
 * its stated liveness standard is *"per field, replace it with a constant and watch a test go
 * red"*. A field can go dead in two independent places, so this file checks both:
 *
 * 1. **The recorder** — `describeSummary` must *copy* the field from the `RunSummary` the
 *    simulation produced. A recorder that wrote a plausible constant would satisfy every renderer
 *    test in the file and describe a different run. § *copied from the run* below compares each
 *    field with the `SimulationResult` `recordRun` hands back beside the recording.
 * 2. **The renderer** — `runSummaryFigures` must *read* the field. § *every field moves a figure*
 *    is a table with one row per field: change the field, and the named figure's text must change.
 *    A renderer that ignored it leaves the text identical, and the row goes red.
 *
 * Together they are the pair the `✅ test` mark in `UX.md` means: the number on screen is this
 * run's number, and it is on screen because the run produced it.
 *
 * The rule assertions — R3, R7, R9, R11, R13 — are separate, because *"the figure changed"* and
 * *"the figure is honest"* are different claims and the second is the one this phase exists for.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';

import {
  BUILDING_IDS,
  DATA_DIR,
  FIXTURE_DOOR_CONFIG,
  breadthConfig,
  fixtureConfig,
  fixtureSummary,
} from '../fixtures.test-helper.js';
import { constantSeries } from '../contract/series.js';
import { VIZ_SCHEMA_VERSION, type VizRecording, type VizSummary } from '../contract/types.js';
import { recordRun } from '../record/recordRun.js';
import {
  AWT_ID,
  DEMAND_ID,
  ENERGY_ID,
  FIGURE_ORDER,
  INTERVAL_ID,
  LONG_WAITS_ID,
  RUN_ID,
  SERVICE_LEVEL_ID,
  TTD_ID,
  WINDOW_ID,
  WT95_ID,
  runSummaryFigures,
  windowClause,
  type SummaryFigure,
} from './runSummary.js';

/* -------------------------------------------------------------------------- *
 * A synthetic recording, so a mutation table can move one field at a time
 * -------------------------------------------------------------------------- */

function recordingWith(summary: VizSummary, overrides: Partial<VizRecording> = {}): VizRecording {
  return {
    schemaVersion: VIZ_SCHEMA_VERSION,
    runId: 'synthetic',
    seed: '20260728',
    buildingId: 'synthetic',
    buildingName: 'Synthetic Tower',
    dispatcherProfileId: 'collective',
    passengerModel: 'conventional',
    status: 'completed',
    startedAt: 0,
    endedAt: 600,
    floors: [{ id: 'G', index: 0, heightM: 0, isEntrance: true, isTransferFloor: false, population: 0 }],
    shafts: [
      {
        carId: 'main-A',
        bankId: 'main',
        label: 'A',
        startFloorId: 'G',
        startHeightM: 0,
        servedFloorIds: ['G'],
        capacityPersons: 13,
        doorConfig: FIXTURE_DOOR_CONFIG,
        motions: [],
        doorMarks: [],
        occupants: constantSeries(0),
        loadFactor: constantSeries(0),
      },
    ],
    landings: [],
    legs: [],
    progress: {
      waiting: constantSeries(0),
      boardedLegs: constantSeries(0),
      meanWaitS: constantSeries(0),
    },
    summary,
    // Version 7. Empty is the legal value for a fixture that exercises none of the three:
    // the timeline draws one unlabelled band, the decision log draws its empty state, and
    // no shaft is dark. See `contract/types.ts`.
    demandPhases: [],
    decisions: [],
    outOfServiceCarIds: [],
    warnings: [],
    ...overrides,
  };
}

/**
 * Everything a figure puts on screen, in one string.
 *
 * A bar's number and its length count, and so does {@link SummaryFigure.severity} — it is the
 * class the mount puts on the row, so a field that only moves the severity is still a field the
 * reader sees. Leaving it out would let `serviceLevel.verdict` be replaced by a constant with the
 * liveness table still green, which is the exact defect the table exists to catch.
 */
function textOf(item: SummaryFigure): string {
  return [
    item.label,
    item.value,
    item.count ?? '',
    item.note ?? '',
    item.severity,
    ...item.bars.map((bar) => `${bar.label} ${bar.text} ${String(bar.fraction)}`),
  ].join(' | ');
}

function figureOf(recording: VizRecording, id: string): SummaryFigure {
  const found = runSummaryFigures(recording).find((item) => item.id === id);
  if (found === undefined) throw new Error(`no figure "${id}"`);
  return found;
}

const BASE = recordingWith(fixtureSummary());

/** Every leaf of a summary that `JSON.stringify` would silently turn into `null`. */
function nonFiniteLeaves(value: unknown, prefix = ''): readonly string[] {
  if (typeof value === 'number') return Number.isFinite(value) ? [] : [`${prefix} = ${String(value)}`];
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) =>
    nonFiniteLeaves(child, prefix === '' ? key : `${prefix}.${key}`),
  );
}

/* -------------------------------------------------------------------------- *
 * The liveness table — one row per field W2 adds
 * -------------------------------------------------------------------------- */

interface LivenessRow {
  /** The `VizSummary` path, exactly as the delivery report's acceptance table names it. */
  readonly field: string;
  /** The figure that must move. */
  readonly figureId: string;
  readonly mutate: (summary: VizSummary) => VizSummary;
}

const ROWS: readonly LivenessRow[] = [
  {
    field: 'reportWindow.id',
    figureId: WINDOW_ID,
    mutate: (s) => ({ ...s, reportWindow: { ...s.reportWindow, id: 'full-run' } }),
  },
  {
    field: 'reportWindow.startS',
    figureId: WINDOW_ID,
    mutate: (s) => ({ ...s, reportWindow: { ...s.reportWindow, startS: 61 } }),
  },
  {
    field: 'reportWindow.endS',
    figureId: WINDOW_ID,
    mutate: (s) => ({ ...s, reportWindow: { ...s.reportWindow, endS: 361 } }),
  },
  { field: 'windowSeconds', figureId: WINDOW_ID, mutate: (s) => ({ ...s, windowSeconds: 301 }) },
  {
    field: 'handlingCapacity.personsPer5Min',
    figureId: DEMAND_ID,
    mutate: (s) => ({ ...s, handlingCapacity: { ...s.handlingCapacity, personsPer5Min: 42 } }),
  },
  {
    field: 'handlingCapacity.offeredPer5Min',
    figureId: DEMAND_ID,
    mutate: (s) => ({ ...s, handlingCapacity: { ...s.handlingCapacity, offeredPer5Min: 63 } }),
  },
  {
    field: 'handlingCapacity.pctPopulationPer5Min',
    figureId: DEMAND_ID,
    mutate: (s) => ({
      ...s,
      handlingCapacity: { ...s.handlingCapacity, pctPopulationPer5Min: null },
    }),
  },
  { field: 'meanWaitS', figureId: AWT_ID, mutate: (s) => ({ ...s, meanWaitS: 13 }) },
  { field: 'waitCount', figureId: AWT_ID, mutate: (s) => ({ ...s, waitCount: 45 }) },
  { field: 'wait95S', figureId: WT95_ID, mutate: (s) => ({ ...s, wait95S: 31 }) },
  {
    field: 'meanTimeToDestinationS',
    figureId: TTD_ID,
    mutate: (s) => ({ ...s, meanTimeToDestinationS: 41 }),
  },
  {
    field: 'timeToDestinationCount',
    figureId: TTD_ID,
    mutate: (s) => ({ ...s, timeToDestinationCount: 41 }),
  },
  { field: 'pctOverLongWait', figureId: LONG_WAITS_ID, mutate: (s) => ({ ...s, pctOverLongWait: 10 }) },
  {
    field: 'longWaitThresholdS',
    figureId: LONG_WAITS_ID,
    mutate: (s) => ({ ...s, longWaitThresholdS: 90 }),
  },
  { field: 'unservedCount', figureId: LONG_WAITS_ID, mutate: (s) => ({ ...s, unservedCount: 3 }) },
  {
    field: 'achievedInterval.meanS',
    figureId: INTERVAL_ID,
    mutate: (s) => ({ ...s, achievedInterval: { ...s.achievedInterval, meanS: 31 } }),
  },
  {
    field: 'achievedInterval.coefficientOfVariation',
    figureId: INTERVAL_ID,
    mutate: (s) => ({
      ...s,
      achievedInterval: { ...s.achievedInterval, coefficientOfVariation: 0.5 },
    }),
  },
  {
    field: 'achievedInterval.count',
    figureId: INTERVAL_ID,
    mutate: (s) => ({ ...s, achievedInterval: { ...s.achievedInterval, count: 12 } }),
  },
  {
    field: 'serviceLevel.verdict',
    figureId: SERVICE_LEVEL_ID,
    mutate: (s) => ({ ...s, serviceLevel: { ...s.serviceLevel, verdict: 'starved' } }),
  },
  {
    field: 'serviceLevel.longestWaitS',
    figureId: SERVICE_LEVEL_ID,
    mutate: (s) => ({ ...s, serviceLevel: { ...s.serviceLevel, longestWaitS: 89 } }),
  },
  {
    field: 'serviceLevel.longestWaitIsCensored',
    figureId: SERVICE_LEVEL_ID,
    mutate: (s) => ({ ...s, serviceLevel: { ...s.serviceLevel, longestWaitIsCensored: true } }),
  },
  {
    field: 'serviceLevel.overHorizonCount',
    figureId: SERVICE_LEVEL_ID,
    mutate: (s) => ({ ...s, serviceLevel: { ...s.serviceLevel, overHorizonCount: 1 } }),
  },
  {
    field: 'serviceLevel.arrivalCount',
    figureId: SERVICE_LEVEL_ID,
    mutate: (s) => ({ ...s, serviceLevel: { ...s.serviceLevel, arrivalCount: 47 } }),
  },
  {
    field: 'serviceLevel.horizonS',
    figureId: SERVICE_LEVEL_ID,
    mutate: (s) => ({ ...s, serviceLevel: { ...s.serviceLevel, horizonS: 600 } }),
  },
  {
    field: 'energy.measured',
    figureId: ENERGY_ID,
    mutate: (s) => ({ ...s, energy: { ...s.energy, measured: false } }),
  },
  {
    field: 'energy.workKJ',
    figureId: ENERGY_ID,
    mutate: (s) => ({ ...s, energy: { ...s.energy, workKJ: 1300 } }),
  },
  {
    field: 'energy.workPerServedLegKJ',
    figureId: ENERGY_ID,
    mutate: (s) => ({ ...s, energy: { ...s.energy, workPerServedLegKJ: 31.9 } }),
  },
  {
    field: 'energy.deliveredLegCount',
    figureId: ENERGY_ID,
    mutate: (s) => ({ ...s, energy: { ...s.energy, deliveredLegCount: 41 } }),
  },
  {
    field: 'energy.distanceM',
    figureId: ENERGY_ID,
    mutate: (s) => ({ ...s, energy: { ...s.energy, distanceM: 2200 } }),
  },
  {
    field: 'energy.starts',
    figureId: ENERGY_ID,
    mutate: (s) => ({ ...s, energy: { ...s.energy, starts: 97 } }),
  },
];

describe('every field W2 adds moves a figure — the liveness table', () => {
  it.each(ROWS)('$field moves the "$figureId" figure', ({ figureId, mutate }) => {
    const before = textOf(figureOf(BASE, figureId));
    const after = textOf(figureOf(recordingWith(mutate(fixtureSummary())), figureId));
    expect(after).not.toBe(before);
  });

  it('covers every version-5 field of the summary, derived rather than hand-listed', () => {
    // The guard the table itself needs. A field added to `VizSummary` without a row here would
    // otherwise be exactly the defect W2 is warned about: shipped, typed, tested in isolation and
    // drawn by nothing. The version-4 fields are named because they predate this unit; every
    // other leaf of the summary must appear in {@link ROWS}.
    const inherited = new Set([
      'saturated',
      'awtIsValid',
      'awtInvalidReason',
      'generated',
      'delivered',
      'undelivered',
    ]);
    const leaves: string[] = [];
    const walk = (value: unknown, prefix: string): void => {
      if (value !== null && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
          walk(child, prefix === '' ? key : `${prefix}.${key}`);
        }
        return;
      }
      leaves.push(prefix);
    };
    walk(fixtureSummary(), '');

    const covered = new Set(ROWS.map((row) => row.field));
    const uncovered = leaves.filter((leaf) => !inherited.has(leaf) && !covered.has(leaf));
    expect(uncovered).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- *
 * The rules
 * -------------------------------------------------------------------------- */

describe('R3 and R9 — one gate, and suppression replaces the number', () => {
  const suppressed = recordingWith(
    fixtureSummary({
      saturated: true,
      awtIsValid: false,
      awtInvalidReason: 'Queue length rose by 148.1 persons over the 300 s reporting window.',
    }),
  );

  it('replaces the three gated figures with the reason, and never with a blank, a dash or a zero', () => {
    for (const id of [AWT_ID, WT95_ID, TTD_ID]) {
      const item = figureOf(suppressed, id);
      expect(item.kind).toBe('suppressed');
      expect(item.value).toBe('suppressed');
      expect(item.note).toContain('148.1 persons');
      expect(item.value).not.toMatch(/^\s*(?:|—|-|0(?:\.0+)?)\s*$/);
    }
  });

  it('suppresses exactly the three figures `awtIsValid` speaks for, and no others', () => {
    const gated = runSummaryFigures(suppressed)
      .filter((item) => item.kind === 'suppressed')
      .map((item) => item.id);
    expect(gated).toEqual([AWT_ID, WT95_ID, TTD_ID]);
  });

  it('keeps every observation on screen, because seeing the divergence is the point', () => {
    // R4: a suppressed run is a *result*. The demand bar and the long-wait count are how a reader
    // sees why, and hiding them with the mean would remove the diagnosis along with the estimate.
    expect(figureOf(suppressed, DEMAND_ID).kind).toBe('observation');
    expect(figureOf(suppressed, LONG_WAITS_ID).kind).toBe('observation');
    expect(figureOf(suppressed, SERVICE_LEVEL_ID).kind).toBe('observation');
    expect(figureOf(suppressed, DEMAND_ID).bars).toHaveLength(2);
  });

  it('falls back to the same sentence `overlayAt` uses when the summary gives no reason', () => {
    const noReason = recordingWith(fixtureSummary({ saturated: true, awtIsValid: false }));
    expect(figureOf(noReason, AWT_ID).note).toContain('the run saturated');
  });
});

describe('R11 — energy is an axis, never a score', () => {
  it('draws the energy figure between the two wait figures and nothing else', () => {
    const order = [...FIGURE_ORDER];
    expect(order.indexOf(ENERGY_ID)).toBe(order.indexOf(WT95_ID) + 1);
    expect(order.indexOf(WT95_ID)).toBe(order.indexOf(AWT_ID) + 1);
    expect(runSummaryFigures(BASE).map((item) => item.id)).toEqual(order);
  });

  it('renders `measured: false` as "not recorded", and never as a zero', () => {
    const unmeasured = recordingWith(
      fixtureSummary({
        energy: {
          measured: false,
          workKJ: null,
          workPerServedLegKJ: null,
          deliveredLegCount: 0,
          distanceM: null,
          starts: null,
        },
      }),
    );
    const item = figureOf(unmeasured, ENERGY_ID);
    expect(item.value).toBe('not recorded');
    expect(item.kind).toBe('absent');
    expect(textOf(item)).not.toMatch(/\b0(?:\.0+)?\s*(?:kJ|m|starts?)\b/);
  });

  it('puts `workPerServedLegKJ` and its denominator in the same figure as `workKJ`', () => {
    const item = figureOf(BASE, ENERGY_ID);
    expect(item.value).toContain('1234.5 kJ');
    expect(item.value).toContain('30.80 kJ per ride delivered');
    expect(item.count).toBe('n = 40 rides delivered');
  });

  it('combines no energy quantity with a wait quantity into one number', () => {
    // The mechanical form of clause 2. Any figure that mentions kilojoules must not also carry a
    // wait figure — a "seconds per kilojoule" or an efficiency grade would fail here, and so
    // would a row that quietly put the AWT beside the work as though the two were one score.
    const summary = BASE.summary;
    const waitNumbers = [
      summary.meanWaitS,
      summary.wait95S,
      summary.meanTimeToDestinationS,
      summary.serviceLevel.longestWaitS ?? Number.NaN,
    ]
      .filter((value) => Number.isFinite(value))
      .map((value) => value.toFixed(1));
    for (const item of runSummaryFigures(BASE)) {
      if (!textOf(item).includes('kJ')) continue;
      for (const wait of waitNumbers) {
        expect(textOf(item), `${item.id} mixes energy with a wait`).not.toContain(`${wait} s`);
      }
    }
  });
});

describe('R13 — no estimate without its count, and no invented denominator', () => {
  it('gives every estimate a count', () => {
    for (const item of runSummaryFigures(BASE)) {
      if (item.kind !== 'estimate') continue;
      expect(item.count, `${item.id} is an estimate with no n`).toBeDefined();
      expect(item.count).toMatch(/^n = \d+ /);
    }
  });

  it('states "1 in 20 rides" only when there are at least twenty rides', () => {
    // Measured, § 1 R13: Garden Apartments at seed 42 quotes a valid AWT over five legs. A
    // "1 in 20" printed over that sample invents a twentieth ride, in the section justified by
    // the literature on making denominators visible.
    expect(figureOf(recordingWith(fixtureSummary({ waitCount: 20 })), WT95_ID).note).toContain(
      '1 in 20 rides',
    );
    const thin = figureOf(recordingWith(fixtureSummary({ waitCount: 5 })), WT95_ID);
    expect(thin.note).not.toContain('1 in 20');
    expect(thin.count).toBe('n = 5 rides');
  });

  it('states "n in 100 rides" only when there are at least a hundred rides', () => {
    expect(
      figureOf(recordingWith(fixtureSummary({ waitCount: 100 })), LONG_WAITS_ID).note,
    ).toContain('in 100 rides');
    expect(figureOf(recordingWith(fixtureSummary({ waitCount: 99 })), LONG_WAITS_ID).note).not.toContain(
      'in 100 rides',
    );
  });

  it('shows `unservedCount` beside the long-wait percentage, always', () => {
    for (const unservedCount of [0, 7]) {
      const item = figureOf(recordingWith(fixtureSummary({ unservedCount })), LONG_WAITS_ID);
      expect(item.note).toContain(`${String(unservedCount)} ride`);
      expect(item.note).toContain('never boarded');
    }
  });
});

describe('R7 — the seed stays visible', () => {
  it('names the seed in the first figure', () => {
    const item = figureOf(BASE, RUN_ID);
    expect(FIGURE_ORDER[0]).toBe(RUN_ID);
    expect(textOf(item)).toContain('20260728');
    expect(textOf(item)).toContain('Synthetic Tower');
    expect(textOf(item)).toContain('collective');
  });
});

describe('the absent cases print a reason, never a zero and never a dash', () => {
  it('says so when no ride was served, no interval was reconstructed and nobody arrived', () => {
    const empty = recordingWith(
      fixtureSummary({
        pctOverLongWait: null,
        achievedInterval: { meanS: null, coefficientOfVariation: null, count: 0 },
        serviceLevel: {
          verdict: 'no-arrivals',
          longestWaitS: null,
          longestWaitIsCensored: false,
          overHorizonCount: 0,
          arrivalCount: 0,
          horizonS: 900,
        },
      }),
    );
    expect(figureOf(empty, LONG_WAITS_ID).value).toBe('no ride was served in this window');
    expect(figureOf(empty, INTERVAL_ID).value).toContain('no departure interval');
    expect(figureOf(empty, SERVICE_LEVEL_ID).value).toBe('no ride arrived in this window');
    for (const item of runSummaryFigures(empty)) {
      expect(item.value.trim(), item.id).not.toBe('');
      expect(item.value.trim(), item.id).not.toBe('—');
      expect(textOf(item), item.id).not.toMatch(/NaN|undefined|null/);
    }
  });

  it('reports a censored longest wait as a lower bound', () => {
    const censored = recordingWith(
      fixtureSummary({
        serviceLevel: {
          verdict: 'starved',
          longestWaitS: 922.7,
          longestWaitIsCensored: true,
          overHorizonCount: 3,
          arrivalCount: 40,
          horizonS: 900,
        },
      }),
    );
    const item = figureOf(censored, SERVICE_LEVEL_ID);
    expect(item.value).toBe('waited at least 922.7 s and never boarded');
    expect(item.severity).toBe('warning');
    expect(item.note).toContain('900 s abandonment horizon');
  });

  it('refuses to translate the interval CoV into a word', () => {
    // § 7.2: mapping a dispersion statistic onto "clumpy" versus "even" is R10's banned operation
    // one type down, and it would need a threshold nothing in `core` supplies.
    const note = figureOf(BASE, INTERVAL_ID).note ?? '';
    expect(note).toContain('0.40');
    expect(note).not.toMatch(/\b(?:clump|bunch|even|regular|irregular)/i);
  });
});

/* -------------------------------------------------------------------------- *
 * The recorder — every field is copied from the run, not invented
 * -------------------------------------------------------------------------- */

describe('the summary is copied from the run', () => {
  let config: LoadedConfig;
  beforeAll(async () => {
    config = await loadConfig(DATA_DIR);
  });

  it('reproduces every version-5 field from the `RunSummary` the simulation produced', () => {
    const { recording, result } = recordRun(fixtureConfig(config));
    const summary = recording.summary;
    const source = result.summary;

    expect(summary.reportWindow).toEqual({
      id: source.window.id,
      startS: source.window.startS,
      endS: source.window.endS,
    });
    expect(summary.windowSeconds).toBe(source.windowSeconds);
    expect(summary.waitCount).toBe(source.waiting.count);
    expect(summary.timeToDestinationCount).toBe(source.timeToDestination.count);
    expect(summary.longWaitThresholdS).toBe(source.waiting.longWaitThresholdS);
    expect(summary.unservedCount).toBe(source.waiting.unservedCount);
    expect(summary.pctOverLongWait).toBe(
      Number.isFinite(source.waiting.pctOverLongWait) ? source.waiting.pctOverLongWait : null,
    );
    expect(summary.handlingCapacity.personsPer5Min).toBe(source.handlingCapacity.personsPer5Min);
    expect(summary.handlingCapacity.offeredPer5Min).toBe(source.handlingCapacity.offeredPer5Min);
    expect(summary.handlingCapacity.pctPopulationPer5Min).toBe(
      source.handlingCapacity.pctPopulationPer5Min ?? null,
    );
    expect(summary.achievedInterval.count).toBe(source.achievedInterval.count);
    expect(summary.serviceLevel.verdict).toBe(source.serviceLevel.verdict);
    expect(summary.serviceLevel.longestWaitIsCensored).toBe(
      source.serviceLevel.longestWaitIsCensored,
    );
    expect(summary.serviceLevel.overHorizonCount).toBe(source.serviceLevel.overHorizonCount);
    expect(summary.serviceLevel.arrivalCount).toBe(source.serviceLevel.arrivalCount);
    expect(summary.serviceLevel.horizonS).toBe(source.serviceLevel.horizonS);
    expect(summary.energy.measured).toBe(source.energy.measured);
    expect(summary.energy.deliveredLegCount).toBe(source.counts.alighted);
    // The `NaN`-to-`null` conversion, asserted in both directions rather than assumed.
    for (const [ours, theirs] of [
      [summary.achievedInterval.meanS, source.achievedInterval.meanS],
      [summary.achievedInterval.coefficientOfVariation, source.achievedInterval.coefficientOfVariation],
      [summary.serviceLevel.longestWaitS, source.serviceLevel.longestWaitS],
      [summary.energy.workKJ, source.energy.workKJ],
      [summary.energy.workPerServedLegKJ, source.energy.workPerServedLegKJ],
      [summary.energy.distanceM, source.energy.distanceM],
      [summary.energy.starts, source.energy.starts],
    ] as const) {
      expect(ours).toBe(Number.isFinite(theirs) ? theirs : null);
    }
  }, 120_000);

  it.each(BUILDING_IDS)(
    '%s — the summary survives a JSON round trip exactly, so a loaded run draws what a fresh one does',
    (buildingId) => {
      // The reason the contract says `null` where `core` says `NaN`. `JSON.stringify(NaN)` is
      // `null`, so a `number`-typed field holding `NaN` comes back as a `null` the type system
      // says is a number — on the *loaded* copy only, which is the half no unit test builds by
      // hand. `toEqual` here would pass on `NaN` too, so the guard below is what makes it bite.
      const { recording } = recordRun(breadthConfig(config, buildingId));
      const roundTripped = JSON.parse(JSON.stringify(recording)) as VizRecording;
      expect(roundTripped.summary).toEqual(recording.summary);
      // `toEqual` alone would pass on a `NaN` too — vitest treats `NaN` as equal to itself — and
      // `NaN` is exactly what would survive in memory and become `null` in the file. So the
      // absence of `NaN` is asserted separately, which is the whole reason the contract encodes
      // "not measured" as `null` rather than inheriting `core`'s convention unchanged.
      expect(nonFiniteLeaves(recording.summary)).toEqual([]);
    },
    300_000,
  );

  it.each(BUILDING_IDS)('%s — every figure is drawable, on the run the viewer produces', (buildingId) => {
    const { recording } = recordRun(breadthConfig(config, buildingId));
    const figures = runSummaryFigures(recording);
    expect(figures.map((item) => item.id)).toEqual([...FIGURE_ORDER]);
    for (const item of figures) {
      expect(item.value.trim(), `${buildingId} ${item.id}`).not.toBe('');
      // The honesty floor: no figure may ever print the three words that mean a renderer read
      // something it should not have. A `NaN` on screen is the shape of the defect this contract
      // encodes `null` to avoid.
      expect(textOf(item), `${buildingId} ${item.id}`).not.toMatch(/NaN|undefined/);
      if (item.kind === 'estimate') expect(item.count, `${buildingId} ${item.id}`).toBeDefined();
    }
    expect(windowClause(recording.summary)).toContain(recording.summary.reportWindow.id);
  }, 300_000);
});
