import { describe, expect, it } from 'vitest';

import type { VizFloor, VizLeg, VizPhase } from '../contract/types.js';
import { approachBarsOf, dayShapeOf, drawApproach, drawDayShape, type StripBrush } from './arrivalsStrip.js';
import {
  ARRIVALS_AHEAD_S,
  ARRIVALS_DAY_COLUMNS,
  ARRIVALS_SCALE_FLOOR,
  ARRIVALS_SLOT_S,
  stageArrivalsAheadAt,
  stageArrivalsDescriptionOf,
  stageArrivalsIndexOf,
  type ArrivalsSource,
} from './stageArrivals.js';

const FLOORS: readonly VizFloor[] = [
  { id: 'L', index: 0, heightM: 0, isEntrance: true, isTransferFloor: false, population: 0 },
  { id: '5', index: 5, heightM: 20, isEntrance: false, isTransferFloor: false, population: 100 },
];

function leg(id: string, arrivedAt: number, originFloorId: string, more: Partial<VizLeg> = {}): VizLeg {
  return {
    passengerId: id,
    originFloorId,
    destinationFloorId: originFloorId === 'L' ? '5' : 'L',
    direction: originFloorId === 'L' ? 'up' : 'down',
    arrivedAt,
    legIndex: 0,
    ...more,
  } as VizLeg;
}

function phase(startS: number, endS: number, startIntensity: number, endIntensity: number): VizPhase {
  return { id: `${String(startS)}`, kind: 'flat', label: '', startS, endS, startIntensity, endIntensity, ratePctPop5min: null } as VizPhase;
}

function source(legs: readonly VizLeg[], demandPhases: readonly VizPhase[] = []): ArrivalsSource {
  return { legs, floors: FLOORS, startedAt: 0, endedAt: 3600, demandPhases };
}

describe('stageArrivalsIndexOf', () => {
  it('counts only first legs, because a transfer leg is the dispatcher’s and not the crowd’s', () => {
    const index = stageArrivalsIndexOf(source([leg('a', 100, 'L'), leg('a', 400, '5', { legIndex: 1 })]));
    expect(index.times).toEqual([100]);
  });

  it('reads the journey’s own start and origin where a route opens with an escalator', () => {
    const index = stageArrivalsIndexOf(
      source([leg('a', 121, '5', { journeyStartedAt: 100, journeyOriginFloorId: 'L' })]),
    );
    expect(index.times).toEqual([100]);
    expect(index.atDoors).toEqual([true]);
  });

  it('draws the day from the schedule, and draws none where the recording carries no phases', () => {
    expect(stageArrivalsIndexOf(source([leg('a', 100, 'L')])).day).toEqual([]);
    const day = stageArrivalsIndexOf(source([], [phase(0, 1800, 0, 1), phase(1800, 3600, 1, 1)])).day;
    expect(day).toHaveLength(ARRIVALS_DAY_COLUMNS);
    expect(day[0]?.intensity).toBeLessThan(0.05);
    expect(day.at(-1)?.intensity).toBe(1);
  });
});

describe('stageArrivalsAheadAt', () => {
  const legs = [
    leg('a', 10, 'L'),
    leg('b', 40, 'L'),
    leg('c', 45, '5'),
    leg('d', 590, 'L'),
    leg('e', 700, 'L'),
    leg('f', 3000, 'L'),
  ];
  const index = stageArrivalsIndexOf(source(legs));

  it('counts the people strictly ahead of the playhead and inside the window, by where they turn up', () => {
    const ahead = stageArrivalsAheadAt(index, 0);
    expect([ahead.doors, ahead.floors, ahead.total]).toEqual([3, 1, 4]);
    expect(ahead.headline).toBe('4 people in the next 10 minutes');
    expect(ahead.split).toBe('3 walking in at the doors · 1 calling from the floors');
    /* The key's two lines are the split's two halves, and bare labels when nobody is due. */
    expect([ahead.doorsLine, ahead.floorsLine]).toEqual(['3 walking in at the doors', '1 calling from the floors']);
    const quiet = stageArrivalsAheadAt(index, 1000);
    expect([quiet.doorsLine, quiet.floorsLine]).toEqual(['walking in at the doors', 'calling from the floors']);
  });

  it('empties a slot as its people walk in', () => {
    const before = stageArrivalsAheadAt(index, 39).slots[0];
    const after = stageArrivalsAheadAt(index, 41).slots[0];
    expect((before?.doors ?? 0) + (before?.floors ?? 0)).toBe(2);
    expect((after?.doors ?? 0) + (after?.floors ?? 0)).toBe(1);
  });

  it('keeps slots on absolute boundaries, so a column slides and never reshuffles', () => {
    const ahead = stageArrivalsAheadAt(index, 20);
    expect(ahead.slots[0]?.startsInS).toBe(-20);
    expect(ahead.slots[1]?.startsInS).toBe(ARRIVALS_SLOT_S - 20);
    expect(ahead.slots.at(-1)?.endsInS).toBeGreaterThanOrEqual(ARRIVALS_AHEAD_S);
  });

  it('says nothing about anybody past the window: a quiet window does not say when the next person comes', () => {
    const ahead = stageArrivalsAheadAt(index, 1000);
    expect(ahead.total).toBe(0);
    expect(ahead.headline).toBe('Nobody is due in the next 10 minutes');
    expect(ahead.split).toBe('');
    expect(stageArrivalsDescriptionOf(ahead)).not.toMatch(/\d{3,}|3000|today/);
    /* And the last window of the day reads the same as any other empty one. */
    expect(stageArrivalsAheadAt(index, 3100).headline).toBe(ahead.headline);
  });

  it('scales against the tallest slot up to the window’s far edge, never the day’s', () => {
    const crowd = [...Array.from({ length: 5 }, (_, i) => leg(`x${String(i)}`, 10, 'L')), ...Array.from({ length: 40 }, (_, i) => leg(`y${String(i)}`, 3000, 'L'))];
    const peaky = stageArrivalsIndexOf(source(crowd));
    expect(stageArrivalsAheadAt(peaky, 0).scalePeople).toBe(ARRIVALS_SCALE_FLOOR);
    expect(stageArrivalsAheadAt(peaky, 2500).scalePeople).toBe(40);
    /* It only grows: after the peak has walked in, its height is still the scale. */
    expect(stageArrivalsAheadAt(peaky, 3200).scalePeople).toBe(40);
  });

  it('names a crowd that is building or easing only past a batch’s worth of difference', () => {
    const rising = stageArrivalsIndexOf(
      source([leg('p', 250, 'L'), ...Array.from({ length: 12 }, (_, i) => leg(`q${String(i)}`, 320 + i, 'L'))]),
    );
    expect(stageArrivalsAheadAt(rising, 300).trend).toBe('building');
    expect(stageArrivalsAheadAt(rising, 300).outlook).toBe('the crowd is building');
    const falling = stageArrivalsIndexOf(
      source([...Array.from({ length: 12 }, (_, i) => leg(`q${String(i)}`, 200 + i, 'L')), leg('p', 350, 'L')]),
    );
    expect(stageArrivalsAheadAt(falling, 300).trend).toBe('easing');
  });
});

describe('the two pictures', () => {
  const index = stageArrivalsIndexOf(
    source([leg('a', 40, 'L'), leg('b', 45, '5'), leg('c', 400, 'L')], [phase(0, 3600, 0.5, 0.5)]),
  );
  const box = { width: 406, height: 44 };

  it('puts a nearer slot nearer the door, and splits a column by where its people turn up', () => {
    const bars = approachBarsOf(stageArrivalsAheadAt(index, 0), box);
    expect(bars).toHaveLength(2);
    expect(bars[0]?.x).toBeLessThan(bars[1]?.x ?? 0);
    expect(bars[0]?.doorsHeight).toBeCloseTo(bars[0]?.floorsHeight ?? -1);
    expect(bars[1]?.floorsHeight).toBe(0);
  });

  it('moves a column toward the door as the clock runs', () => {
    const early = approachBarsOf(stageArrivalsAheadAt(index, 0), box).at(-1);
    const later = approachBarsOf(stageArrivalsAheadAt(index, 200), box).at(-1);
    expect(later?.x).toBeLessThan(early?.x ?? 0);
  });

  it('marks the playhead and the window on the schedule', () => {
    const shape = dayShapeOf(stageArrivalsAheadAt(index, 1800), index, box);
    expect(shape.nowX).toBeCloseTo(203);
    expect(shape.aheadX).toBeCloseTo(203 + (ARRIVALS_AHEAD_S / 3600) * 406);
    expect(shape.columns).toHaveLength(ARRIVALS_DAY_COLUMNS);
  });

  it('paints rectangles and no words', () => {
    const calls: string[] = [];
    const brush: StripBrush = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      clearRect: () => calls.push('clear'),
      fillRect: () => calls.push('fill'),
      strokeRect: () => calls.push('stroke'),
    };
    const ahead = stageArrivalsAheadAt(index, 0);
    drawApproach(brush, ahead, box);
    drawDayShape(brush, ahead, index, box);
    expect(calls.filter((call) => call === 'clear')).toHaveLength(2);
    expect(calls).toContain('stroke');
    expect(Object.keys(brush)).not.toContain('fillText');
  });
});
