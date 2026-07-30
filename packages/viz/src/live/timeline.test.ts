/**
 * The transport's timeline, the tick row and the shift clock.
 *
 * The two claims that matter are structural rather than cosmetic:
 *
 * 1. **The bar covers the run, contiguously.** A segmented bar with a gap in it, or one that
 *    overhangs `endedAt`, makes the playhead percentage a lie — and the playhead is how the
 *    reader scrubs. Asserted on real runs of every shipped building, because the segments come
 *    from the resolved demand template and each building runs a different one.
 * 2. **An empty schedule draws one unlabelled band, never an invented one.** `demandPhases` is
 *    legally empty for a recording written before schema 7. `docs/12` § 4.1 is explicit that a
 *    label which does not describe the demand underneath it is the failure the honesty card
 *    exists to prevent, so the fallback is asserted to be exactly one band with no label.
 */

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import type { VizPhase, VizRecording } from '../contract/types.js';
import { BUILDING_IDS, DATA_DIR, breadthConfig } from '../fixtures.test-helper.js';
import { recordRun } from '../record/recordRun.js';

import {
  DAY_START_S,
  clockAt,
  hhmm,
  phaseAt,
  playheadPctOf,
  tickLabelsOf,
  timelineOf,
} from './timeline.js';
import { syntheticRecording } from './synthetic.test-helper.js';

let config: LoadedConfig;
const recordings = new Map<string, VizRecording>();

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  for (const id of BUILDING_IDS) {
    recordings.set(id, recordRun(breadthConfig(config, id)).recording);
  }
}, 600_000);

function recordingOf(id: string): VizRecording {
  const recording = recordings.get(id);
  if (recording === undefined) throw new Error(`no recording for ${id}`);
  return recording;
}

describe('the clock is the day start plus the kernel’s own seconds', () => {
  it('starts the shift at 06:00', () => {
    expect(DAY_START_S).toBe(6 * 3600);
    expect(clockAt(0)).toBe('06:00');
    expect(clockAt(1800)).toBe('06:30');
    expect(clockAt(4320)).toBe('07:12');
  });

  it('wraps rather than growing a third hour digit', () => {
    expect(hhmm(0)).toBe('00:00');
    expect(hhmm(23 * 3600 + 59 * 60)).toBe('23:59');
    expect(hhmm(24 * 3600 + 60)).toBe('00:01');
    expect(hhmm(-60)).toBe('23:59');
  });
});

describe.each(BUILDING_IDS)('%s — the bar covers the run', (buildingId) => {
  it('is contiguous over [startedAt, endedAt] with no gap and no overhang', () => {
    const recording = recordingOf(buildingId);
    const segments = timelineOf(recording);
    expect(segments.length).toBeGreaterThan(0);
    expect(segments[0]?.startS).toBeCloseTo(recording.startedAt, 6);
    expect(segments[segments.length - 1]?.endS).toBeCloseTo(recording.endedAt, 6);
    for (let index = 1; index < segments.length; index += 1) {
      expect(segments[index]?.startS).toBeCloseTo(segments[index - 1]?.endS ?? Number.NaN, 6);
    }
    const covered = segments.reduce((sum, segment) => sum + segment.span, 0);
    expect(covered).toBeCloseTo(recording.endedAt - recording.startedAt, 6);
    const widths = segments.reduce((sum, segment) => sum + segment.widthPct, 0);
    expect(widths).toBeCloseTo(100, 6);
  }, 300_000);

  it('titles every segment `LABEL · hh:mm` and adds the rate only when the run has one', () => {
    for (const segment of timelineOf(recordingOf(buildingId))) {
      expect(segment.title.startsWith(`${segment.label} · `)).toBe(true);
      expect(segment.title).toMatch(/ · \d{2}:\d{2}/);
      if (segment.ratePctPop5min === null) {
        expect(segment.title).not.toContain('%pop/5 min');
      } else {
        expect(segment.title).toContain('%pop/5 min');
      }
    }
  }, 300_000);

  it('puts the playhead in a segment at every instant, and gives the same answer backwards', () => {
    const recording = recordingOf(buildingId);
    const span = recording.endedAt - recording.startedAt;
    const times = Array.from({ length: 11 }, (_unused, i) => recording.startedAt + (span * i) / 10);
    const forwards = times.map((t) => JSON.stringify(phaseAt(recording, t)));
    for (const [index, t] of times.entries()) {
      const segment = phaseAt(recording, t);
      expect(segment, `no segment at ${String(t)}`).toBeDefined();
      expect(playheadPctOf(recording, t)).toBeCloseTo((index / 10) * 100, 6);
    }
    const backwards = [...times]
      .reverse()
      .map((t) => JSON.stringify(phaseAt(recording, t)))
      .reverse();
    expect(backwards).toEqual(forwards);
  }, 300_000);
});

describe('an empty schedule', () => {
  it('draws exactly one unlabelled band over the run', () => {
    const segments = timelineOf(syntheticRecording({ startedAt: 0, endedAt: 1800 }));
    expect(segments).toHaveLength(1);
    const only = segments[0];
    expect(only?.id).toBe('whole-run');
    expect(only?.label).toBe('');
    expect(only?.kind).toBeUndefined();
    expect(only?.startS).toBe(0);
    expect(only?.endS).toBe(1800);
    expect(only?.widthPct).toBe(100);
    // A clock span is a fact about the run; a phase name would not be.
    expect(only?.title).toBe('06:00–06:30');
    expect(only?.ratePctPop5min).toBeNull();
  });

  it('still answers `phaseAt`, so the header pill is never blank', () => {
    const recording = syntheticRecording({ startedAt: 0, endedAt: 1800 });
    expect(phaseAt(recording, 900)?.id).toBe('whole-run');
    expect(phaseAt(recording, 1800)?.id).toBe('whole-run');
  });
});

describe('the drain — the schedule is shorter than the run, and usually is', () => {
  it('bands the tail rather than leaving a hole the playhead can sit in', () => {
    // Measured: Midtown Office runs to 1 938 s against a 900 s schedule. Reproduced synthetically
    // so the assertion does not depend on how far a particular seed happens to overrun.
    const recording = syntheticRecording({
      startedAt: 0,
      endedAt: 1200,
      demandPhases: [
        {
          id: '0-hold',
          kind: 'hold',
          label: 'PEAK',
          startS: 0,
          endS: 900,
          startIntensity: 1,
          endIntensity: 1,
          ratePctPop5min: 12,
          inReportWindow: true,
        },
      ],
    });
    const segments = timelineOf(recording);
    expect(segments).toHaveLength(2);
    const drain = segments[1];
    expect(drain?.id).toBe('drain');
    expect(drain?.label).toBe('DRAIN');
    expect(drain?.kind).toBeUndefined();
    expect(drain?.startS).toBe(900);
    expect(drain?.endS).toBe(1200);
    // No rate is claimed for it: the template says nothing about this stretch, and a `0` would
    // read as a measurement that nobody is arriving — which is false on a building with a sky lobby.
    expect(drain?.ratePctPop5min).toBeNull();
    expect(drain?.title).toBe('DRAIN · 06:15–06:20 · past the demand schedule');
    expect(phaseAt(recording, 1000)?.id).toBe('drain');
  });

  it('adds no band when the schedule already covers the run', () => {
    const recording = syntheticRecording({
      endedAt: 900,
      demandPhases: [
        {
          id: '0-hold',
          kind: 'hold',
          label: 'PEAK',
          startS: 0,
          endS: 900,
          startIntensity: 1,
          endIntensity: 1,
          ratePctPop5min: 12,
          inReportWindow: true,
        },
      ],
    });
    expect(timelineOf(recording)).toHaveLength(1);
  });
});

describe('the segment palette', () => {
  const phase = (kind: VizPhase['kind'], startIntensity: number, endIntensity: number): VizPhase => ({
    id: `0-${kind}`,
    kind,
    label: kind.toUpperCase(),
    startS: 0,
    endS: 600,
    startIntensity,
    endIntensity,
    ratePctPop5min: 11.4,
    inReportWindow: true,
  });

  it('gives each kind its own pair, and distinguishes a quiet flat from a steady one', () => {
    const pairs = new Map<string, string>();
    for (const [kind, startIntensity, endIntensity] of [
      ['ramp-up', 0, 1],
      ['hold', 1, 1],
      ['ramp-down', 1, 0],
      ['flat', 0.5, 0.5],
      ['flat', 0, 0],
    ] as const) {
      const segment = timelineOf(
        syntheticRecording({
          endedAt: 600,
          demandPhases: [phase(kind, startIntensity, endIntensity)],
        }),
      )[0];
      pairs.set(`${kind}-${String(startIntensity)}`, `${segment?.bg ?? ''}/${segment?.fg ?? ''}`);
    }
    expect(new Set(pairs.values()).size).toBe(5);
    expect(pairs.get('hold-1')).toBe('#2a2033/#c69ad8');
    expect(pairs.get('ramp-up-0')).toBe('#2c2418/#dbb075');
    expect(pairs.get('ramp-down-1')).toBe('#20291f/#9fc48a');
    expect(pairs.get('flat-0.5')).toBe('#161e2a/#6d7b8d');
    expect(pairs.get('flat-0')).toBe('#131a24/#5d6b7d');
  });

  it('formats the title as the design writes it', () => {
    const segment = timelineOf(
      syntheticRecording({ endedAt: 600, demandPhases: [phase('hold', 1, 1)] }),
    )[0];
    expect(segment?.title).toBe('HOLD · 06:00 · 11.4 %pop/5 min');
  });
});

describe('the o’clock row', () => {
  it('rules the run’s own times, evenly, both ends inclusive', () => {
    const recording = syntheticRecording({ startedAt: 0, endedAt: 1800 });
    const ticks = tickLabelsOf(recording, 5);
    expect(ticks.map((tick) => tick.label)).toEqual([
      '06:00',
      '06:07',
      '06:15',
      '06:22',
      '06:30',
    ]);
    expect(ticks.map((tick) => tick.pct)).toEqual([0, 25, 50, 75, 100]);
  });

  it('returns a start marker rather than an empty row when asked for one', () => {
    const ticks = tickLabelsOf(syntheticRecording(), 1);
    expect(ticks).toHaveLength(1);
    expect(ticks[0]?.label).toBe('06:00');
  });

  it('honours a caller that starts the shift somewhere else', () => {
    const ticks = tickLabelsOf(syntheticRecording({ endedAt: 3600 }), 2, { dayStartS: 7 * 3600 });
    expect(ticks.map((tick) => tick.label)).toEqual(['07:00', '08:00']);
  });
});
