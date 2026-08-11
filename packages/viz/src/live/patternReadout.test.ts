/**
 * The header's pattern readout is a pure function of `(recording, playhead)` — slice 4b.
 *
 * Synthetic recordings, because the states under test are precisely the ones a shipped
 * replication cannot be made to produce on demand: an absent trace beside an empty one, a
 * playhead parked exactly on a switch, two banks in disagreement, and a pattern id this build
 * has no name for. The end-to-end half — a real selecting run writing the trace — lives in
 * `record/recordRun.test.ts`, on the § D153 operating point.
 */

import { describe, expect, it } from 'vitest';

import { PATTERN_NAMES } from '../authoring/selectorSpec.js';
import type { VizPatternSwitch, VizRecording } from '../contract/types.js';

import { patternReadoutAt } from './patternReadout.js';
import { syntheticRecording } from './synthetic.test-helper.js';

function withTrace(switches: readonly VizPatternSwitch[] | undefined): VizRecording {
  const base = syntheticRecording({ startedAt: 0, endedAt: 600 });
  return switches === undefined ? base : { ...base, patternSwitches: switches };
}

describe('the honest absences', () => {
  it('reads no-detector, with an empty label, when the recording carries no trace', () => {
    // The field is absent on every run whose `selection.policy` is `off` — every shipped
    // profile — and the header hides the pill on `''`. A placeholder here would read as a
    // pattern the run never detected.
    const readout = patternReadoutAt(withTrace(undefined), 300);
    expect(readout.kind).toBe('no-detector');
    expect(readout.label).toBe('');
    expect(readout.title).toBe('');
    expect(readout.patternIds).toEqual([]);
  });

  it('reads no-pattern when a detector watched and never left abstention', () => {
    // Present-but-empty is a different claim from absent: the detector was live and no declared
    // regime fit. One phrase, and no pattern name anywhere in it.
    const readout = patternReadoutAt(withTrace([]), 300);
    expect(readout.kind).toBe('no-pattern');
    expect(readout.label).toBe('no clear pattern');
    expect(readout.patternIds).toEqual([]);
  });

  it('reads no-pattern before the first switch, and again after a null switch', () => {
    const recording = withTrace([
      { atS: 100, bankId: 'main', patternId: 'up-peak' },
      { atS: 400, bankId: 'main', patternId: null },
    ]);
    expect(patternReadoutAt(recording, 0).kind).toBe('no-pattern');
    expect(patternReadoutAt(recording, 99.9).kind).toBe('no-pattern');
    // The abstention mid-run: the profile's own weights stand again.
    expect(patternReadoutAt(recording, 500).kind).toBe('no-pattern');
  });
});

describe('the pattern in force', () => {
  const recording = withTrace([
    { atS: 100, bankId: 'main', patternId: 'up-peak' },
    { atS: 400, bankId: 'main', patternId: 'two-way' },
  ]);

  it('names the pattern with the model’s words, never the engine id', () => {
    const readout = patternReadoutAt(recording, 200);
    expect(readout.kind).toBe('pattern');
    expect(readout.label).toBe(PATTERN_NAMES['up-peak']);
    expect(readout.label).not.toContain('up-peak');
    expect(readout.patternIds).toEqual(['up-peak']);
    // The title is the pattern's own authored sentence, for the pill's tooltip.
    expect(readout.title).toMatch(/\.$/u);
  });

  it('is right-continuous: a switch at t is in force at t, and updates across it', () => {
    expect(patternReadoutAt(recording, 399.9).patternIds).toEqual(['up-peak']);
    expect(patternReadoutAt(recording, 400).patternIds).toEqual(['two-way']);
    expect(patternReadoutAt(recording, 400).label).toBe(PATTERN_NAMES['two-way']);
  });

  it('clamps the playhead into the run, matching every other sampler', () => {
    expect(patternReadoutAt(recording, -50).kind).toBe('no-pattern');
    expect(patternReadoutAt(recording, 10_000).patternIds).toEqual(['two-way']);
  });

  it('renders rule 11’s honest fallback for a pattern this build has no name for', () => {
    // A recording written against an edited data file can carry any id. The fallback is a plain
    // phrase plus the id — a content bug made visible, never a bare engine id posing as a name.
    const stray = withTrace([{ atS: 100, bankId: 'main', patternId: 'rush-hour' }]);
    const readout = patternReadoutAt(stray, 200);
    expect(readout.label).toBe('a pattern this build cannot name (rush-hour)');
    expect(readout.title).toBe('');
  });
});

describe('several banks', () => {
  it('agreeing banks read as one pattern', () => {
    const recording = withTrace([
      { atS: 100, bankId: 'low', patternId: 'up-peak' },
      { atS: 150, bankId: 'high', patternId: 'up-peak' },
    ]);
    const readout = patternReadoutAt(recording, 200);
    expect(readout.kind).toBe('pattern');
    expect(readout.patternIds).toEqual(['up-peak']);
  });

  it('disagreeing banks are said, not silently collapsed to one', () => {
    const recording = withTrace([
      { atS: 100, bankId: 'low', patternId: 'up-peak' },
      { atS: 150, bankId: 'high', patternId: 'idle' },
    ]);
    const readout = patternReadoutAt(recording, 200);
    expect(readout.kind).toBe('mixed');
    expect(readout.patternIds).toEqual(['idle', 'up-peak']);
    expect(readout.label).toContain(PATTERN_NAMES['idle'] ?? '');
    expect(readout.label).toContain(PATTERN_NAMES['up-peak'] ?? '');
  });

  it('a bank standing on the profile’s own weights does not outvote the one that selected', () => {
    const recording = withTrace([
      { atS: 100, bankId: 'low', patternId: 'up-peak' },
      { atS: 150, bankId: 'high', patternId: null },
    ]);
    const readout = patternReadoutAt(recording, 200);
    expect(readout.kind).toBe('pattern');
    expect(readout.patternIds).toEqual(['up-peak']);
  });
});

describe('purity', () => {
  it('two derivations at one playhead are byte-equal', () => {
    const recording = withTrace([{ atS: 100, bankId: 'main', patternId: 'up-peak' }]);
    expect(JSON.stringify(patternReadoutAt(recording, 250))).toBe(
      JSON.stringify(patternReadoutAt(recording, 250)),
    );
  });
});
