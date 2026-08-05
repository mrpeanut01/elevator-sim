/**
 * The traffic editor's decisions, against the shipped demand templates.
 *
 * Two of these carry more weight than the rest. The **preview strip** must be the day the shift
 * actually makes, so the assertion is that it moves when an override the run reads moves — a strip
 * that ignored `peakWindowS` would be a picture of a different run wearing this one's name. And the
 * **two rows that write nothing** must be drawn as refusals rather than as sliders, which is
 * `docs/05-roadmap.md`'s standing requirement pointed at a control.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
  type TrafficProfiles,
} from '@elevator-sim/core/browser';

import {
  DEFAULT_PATTERN,
  PATTERN_ROWS,
  specFromTrafficProfile,
  trafficProfilesWithPattern,
  type PatternSpec,
} from '../authoring/patternSpec.js';
import { DAY_START_S, hhmm } from '../live/timeline.js';
import { recordRun } from '../record/recordRun.js';

import type { BrowserResources } from './data.js';
import { initialState, shiftRunConfigOf, type ViewerState } from './state.js';
import {
  formatPatternValue,
  inertPatternRows,
  orderChipsOf,
  patternPatchFor,
  patternRowsOf,
  previewKindOf,
  previewSegmentsOf,
  previewTemplateOf,
  previewTicksOf,
} from './trafficEditor.js';

const DATA = new URL('../../../../data/', import.meta.url);
const read = (path: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, DATA)), 'utf8')) as unknown;
const TRAFFIC: TrafficProfiles = parseTrafficProfiles(read('traffic-profiles.json'));
const TEMPLATES = TRAFFIC.demandTemplates;
const SHIFT_S = 1800;

/** The run tier's fixture. Only the buildings the leg comparison at the bottom of this file names. */
const RESOURCES: BrowserResources = (() => {
  const elevatorSpecs = parseElevatorSpecs(read('elevator-specs.json'));
  const entries = ['garden-apartments', 'midtown-office'].map((id) => {
    const config = parseBuilding(read(`buildings/${id}.json`));
    return { file: `${id}.json`, config, resolved: resolveBuilding(config, elevatorSpecs) };
  });
  return {
    elevatorSpecs,
    trafficProfiles: TRAFFIC,
    dispatcherProfiles: parseDispatcherProfiles(read('dispatcher-profiles.json')),
    buildings: entries.map((entry) => entry.resolved),
    entries,
    trafficProfileIds: new Set(TRAFFIC.profiles.map((profile) => profile.id)),
    warnings: [],
  };
})();

const TWO_WAY: PatternSpec = { ...DEFAULT_PATTERN, order: 'two-way' };

describe('the peak-order chips', () => {
  it('offers three, presses exactly the selected one, and carries its note', () => {
    const chips = orderChipsOf(DEFAULT_PATTERN);
    expect(chips.map((chip) => chip.order)).toStrictEqual(['up-first', 'down-first', 'two-way']);
    expect(chips.filter((chip) => chip.pressed).map((chip) => chip.order)).toStrictEqual([
      'up-first',
    ]);
    expect(chips[2]?.note).toContain('lunch');
  });
});

describe('the rows are the engine’s parameters', () => {
  it('groups them and heads each group exactly once', () => {
    const rows = patternRowsOf(DEFAULT_PATTERN);
    const headings = rows.filter((row) => row.heading !== '').map((row) => row.heading);
    expect(headings).toStrictEqual([...new Set(headings)]);
    expect(headings).toContain('INTENSITY');
  });

  it('shows the mix-amplitude row only under the two-way order', () => {
    expect(patternRowsOf(DEFAULT_PATTERN).map((row) => row.row.key)).not.toContain('mixAmplitude');
    expect(patternRowsOf(TWO_WAY).map((row) => row.row.key)).toContain('mixAmplitude');
  });

  /*
   * This assertion used to read the other way — `live` false, refusal naming
   * `SimulationDemandOptions`. It is inverted rather than deleted, and inverting it is not a
   * weakening: the sentence it pinned had **already expired**, so the old test was holding a
   * refusal in place after the thing it refused had been built. `trafficProfilesWithPattern` is
   * called by `dev/state.ts`'s `shiftRunConfigOf` on the way to `SimulationConfig.trafficProfiles`,
   * which is a named non-test caller, and the run test at the bottom of this file is the part that
   * cannot go stale the way the sentence did.
   */
  it('draws the mean group size as a live control, because the traffic file carries it', () => {
    const batch = patternRowsOf(DEFAULT_PATTERN).find((row) => row.row.key === 'batchMean');
    expect(batch?.live).toBe(true);
    expect(batch?.refusal).toBeUndefined();
    expect(inertPatternRows(DEFAULT_PATTERN)['batchMean']).toBeUndefined();
    expect(inertPatternRows(TWO_WAY)['batchMean']).toBeUndefined();
  });

  it('says the same thing in the tooltip as in the row, which is what issue #66 caught', () => {
    // The defect was two explanations of one control disagreeing: the tooltip claimed the field was
    // written, the sub-line claimed no passenger moved. Whatever the row's verdict is, the help text
    // beside it may not assert the opposite.
    const row = PATTERN_ROWS.find((entry) => entry.key === 'batchMean');
    expect(row?.help).toContain('batchSize.mean');
    expect(row?.help).not.toContain('no field');
    expect(row?.help).not.toContain('SimulationDemandOptions');
  });

  it('refuses the interfloor share under two-way and offers it under the other two', () => {
    const under = (spec: PatternSpec): boolean | undefined =>
      patternRowsOf(spec).find((row) => row.row.key === 'interfloorShare')?.live;
    expect(under(DEFAULT_PATTERN)).toBe(true);
    expect(under({ ...DEFAULT_PATTERN, order: 'down-first' })).toBe(true);
    expect(under(TWO_WAY)).toBe(false);
    expect(inertPatternRows(TWO_WAY)['interfloorShare']).toContain('planDemand refuses');
  });

  it('formats each row in its own declared unit', () => {
    const rows = patternRowsOf(DEFAULT_PATTERN);
    const value = (key: string): string | undefined =>
      rows.find((row) => row.row.key === key)?.value;
    expect(value('ratePctPop5min')).toBe('12.0 %pop/5 min');
    expect(value('peakWindowS')).toBe('300 s');
    expect(value('interfloorShare')).toBe('10%');

    const shares = PATTERN_ROWS.find((row) => row.key === 'batchSharesDestination');
    expect(shares).toBeDefined();
    if (shares === undefined) return;
    expect(formatPatternValue({ ...DEFAULT_PATTERN, batchSharesDestination: true }, shares)).toBe(
      'together',
    );
    expect(formatPatternValue(DEFAULT_PATTERN, shares)).toBe('separately');
  });

  it('patches the field the row names, and the boolean row as a boolean', () => {
    expect(patternPatchFor('ratePctPop5min', 18)).toStrictEqual({ ratePctPop5min: 18 });
    expect(patternPatchFor('batchSharesDestination', 1)).toStrictEqual({
      batchSharesDestination: true,
    });
    expect(patternPatchFor('batchSharesDestination', 0)).toStrictEqual({
      batchSharesDestination: false,
    });
    // `name` and `order` are in the key type and have no slider; a patch for one changes nothing.
    expect(patternPatchFor('name', 1)).toStrictEqual({});
  });
});

describe('the preview strip is the day this makes', () => {
  it('resolves the template the spec selects, with the run’s own overrides', () => {
    const resolution = previewTemplateOf(DEFAULT_PATTERN, TEMPLATES, SHIFT_S);
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.template.id).toBe('rise-and-fall');
    expect(resolution.template.durationS).toBe(SHIFT_S);
    expect(previewTemplateOf(TWO_WAY, TEMPLATES, SHIFT_S)).toMatchObject({ ok: true });
  });

  it('draws the template’s own phases, contiguous over the whole shift', () => {
    const resolution = previewTemplateOf(DEFAULT_PATTERN, TEMPLATES, SHIFT_S);
    if (!resolution.ok) throw new Error(resolution.reason);
    const segments = previewSegmentsOf(resolution.template, DEFAULT_PATTERN);
    expect(segments.map((segment) => segment.kind)).toStrictEqual([
      'ramp-up',
      'hold',
      'ramp-down',
    ]);
    expect(segments[0]?.startS).toBe(0);
    expect(segments[segments.length - 1]?.endS).toBe(SHIFT_S);
    for (const [index, segment] of segments.entries()) {
      if (index === 0) continue;
      expect(segment.startS).toBe(segments[index - 1]?.endS);
    }
    // Not the handoff's seven office phases, and not a single unlabelled band either.
    expect(segments.map((segment) => segment.short)).toStrictEqual(['FILLING', 'PEAK', 'EASING']);
  });

  it('moves when an override the run reads moves — the whole point of mirroring traceConfigFor', () => {
    const holdOf = (peakWindowS: number): number => {
      const resolution = previewTemplateOf(
        { ...DEFAULT_PATTERN, peakWindowS },
        TEMPLATES,
        SHIFT_S,
      );
      if (!resolution.ok) throw new Error(resolution.reason);
      const hold = previewSegmentsOf(resolution.template, DEFAULT_PATTERN).find(
        (segment) => segment.kind === 'hold',
      );
      return hold?.span ?? 0;
    };
    expect(holdOf(300)).toBe(300);
    expect(holdOf(900)).toBe(900);
  });

  it('rates each segment from the spec’s own demand, never from a placeholder', () => {
    const resolution = previewTemplateOf(DEFAULT_PATTERN, TEMPLATES, SHIFT_S);
    if (!resolution.ok) throw new Error(resolution.reason);
    const segments = previewSegmentsOf(resolution.template, DEFAULT_PATTERN);
    const hold = segments.find((segment) => segment.kind === 'hold');
    expect(hold?.ratePctPop5min).toBeCloseTo(DEFAULT_PATTERN.ratePctPop5min, 6);
    // The ramp starts at nothing and averages half the peak over its span.
    expect(segments[0]?.ratePctPop5min).toBeCloseTo(DEFAULT_PATTERN.ratePctPop5min / 2, 6);
    expect(hold?.title).toContain('%pop/5 min');
  });

  it('marks which segments lie inside the only quotable part of the run', () => {
    const resolution = previewTemplateOf(DEFAULT_PATTERN, TEMPLATES, SHIFT_S);
    if (!resolution.ok) throw new Error(resolution.reason);
    const segments = previewSegmentsOf(resolution.template, DEFAULT_PATTERN);
    expect(segments.find((segment) => segment.kind === 'hold')?.inReportWindow).toBe(true);
  });

  it('names a phase from its two endpoint intensities', () => {
    const phase = (from: number, to: number): { startS: number; endS: number; startIntensity: number; endIntensity: number } => ({
      startS: 0,
      endS: 10,
      startIntensity: from,
      endIntensity: to,
    });
    expect(previewKindOf(phase(0, 1), 1)).toBe('ramp-up');
    expect(previewKindOf(phase(1, 0), 1)).toBe('ramp-down');
    expect(previewKindOf(phase(1, 1), 1)).toBe('hold');
    expect(previewKindOf(phase(0.4, 0.4), 1)).toBe('flat');
    expect(previewKindOf(phase(0, 0), 1)).toBe('quiet');
  });

  it('rules the tick row with the shift’s real clock span', () => {
    const ticks = previewTicksOf(SHIFT_S);
    expect(ticks).toHaveLength(5);
    expect(ticks[0]?.label).toBe(hhmm(DAY_START_S));
    expect(ticks[4]?.label).toBe(hhmm(DAY_START_S + SHIFT_S));
    // A thirty-minute shift is half an hour, not the handoff's fixed 06:00–22:00 ruler.
    expect(ticks[4]?.label).toBe('06:30');
  });

  it('returns a reason rather than throwing when the overrides cannot be applied', () => {
    // A negative peak window is not a template this resolver will build.
    const resolution = previewTemplateOf(
      { ...DEFAULT_PATTERN, peakWindowS: -1 },
      TEMPLATES,
      SHIFT_S,
    );
    expect(resolution.ok).toBe(false);
    if (!resolution.ok) expect(resolution.reason.length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- *
 * The standing requirement, pointed at the row that used to refuse
 * -------------------------------------------------------------------------- */

/**
 * Move the control and require the **run** to change — `docs/05-roadmap.md`'s standing requirement
 * and § D177's rule, compared on the legs rather than on a window statistic.
 *
 * This is the assertion that would have caught issue #66 in either direction. A row drawn as live
 * that moves no passenger is the dead seam this repository has shipped eleven times; a row drawn as
 * a refusal that *did* move passengers is the same defect with the sign flipped, and that is the one
 * that was actually here — the refusal outlived `trafficProfilesWithPattern`, which
 * `shiftRunConfigOf` has called since wave 13.
 *
 * `midtown-office` under `office-standard` at 900 s, because **neither arm may be empty**: a
 * fingerprint of zero legs equals any other fingerprint of zero legs, so an instrument that can go
 * silent passes exactly when the control dies. This arm carries several hundred legs on both sides.
 * Everything but the batch mean is held equal — same building, same seed, same dispatcher, same
 * shift length, same selected pattern — so the mean is the only thing that moved.
 */
describe('mean group size is not decoration — the standing requirement, issue #66', () => {
  const specAt = (batchMean: number): PatternSpec => ({
    ...specFromTrafficProfile(RESOURCES.trafficProfiles, 'office-standard'),
    batchMean,
  });

  const legsOf = (batchMean: number): readonly (readonly [string, string, number])[] => {
    const state: ViewerState = {
      ...initialState(RESOURCES, 20260805n),
      buildingId: 'midtown-office',
      shiftLengthS: 900,
      savedPatterns: [{ id: 'pat-1', spec: specAt(batchMean) }],
      pattern: 'pat-1',
    };
    return recordRun(shiftRunConfigOf(RESOURCES, state).config, {
      recordDecisions: false,
    }).recording.legs.map(
      (leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1] as const,
    );
  };

  it('widens the traffic file the run resolves against, and only the profile named', () => {
    const widened = trafficProfilesWithPattern(
      RESOURCES.trafficProfiles,
      'office-standard',
      specAt(3.5),
    );
    expect(widened.profiles.find((entry) => entry.id === 'office-standard')?.batchSize.mean).toBe(
      3.5,
    );
    for (const profile of widened.profiles.filter((entry) => entry.id !== 'office-standard')) {
      const before = RESOURCES.trafficProfiles.profiles.find((entry) => entry.id === profile.id);
      expect(profile.batchSize.mean).toBe(before?.batchSize.mean);
    }
  });

  it('and the run itself moves — the legs differ when the mean does', () => {
    const alone = legsOf(1);
    const crowds = legsOf(4);
    expect(alone).not.toHaveLength(0);
    expect(crowds).not.toHaveLength(0);
    expect(JSON.stringify(crowds)).not.toBe(JSON.stringify(alone));
  });

  it('and it moves in the direction the model says it should', () => {
    /*
     * Not merely *different* — different is satisfied by a sign error. At a fixed arrival rate,
     * bigger groups deliver the same demand in fewer, fuller batches, so the served-leg count over a
     * fixed window must fall as the mean rises. Asserted as an ordering rather than as a figure,
     * because the figure belongs to this arm and the ordering belongs to the model.
     */
    expect(legsOf(4).length).toBeLessThan(legsOf(1).length);
  });
});
