/**
 * The locator — `shift/trouble.ts`. Three groups, and the middle one is the load-bearing one.
 *
 * 1. **The arithmetic**, on hand-built legs, where every answer can be read off by eye.
 * 2. **Agreement with the instruments in force**, on real runs over shipped buildings: the hold
 *    moment against `core`'s `rushHoldAtLegs`, the legible landings against `legibilityOf`, the
 *    worst wait and the peak queue against `observationsAt`. This is the group that would catch
 *    the locator quietly becoming a second definition, which is the one thing it must never be.
 * 3. **The honesty shape**, asserted mechanically rather than reviewed: no mean anywhere, every
 *    figure with its count, and an ordering that is a run fact rather than a severity.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { RUSH_HOLD_LINE, parseBuilding, resolveBuilding, rushHoldAtLegs } from '@elevator-sim/core';
import { describe, expect, it } from 'vitest';

import type { VizLeg, VizRecording } from '../contract/types.js';
import type { BrowserResources } from '../dev/data.js';
import { shiftLengthForContract, shiftRunConfigOf } from '../dev/state.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import { WAIT_BANDS } from '../live/bands.js';
import { observationsAt } from '../live/observations.js';
import { recordRun } from '../record/recordRun.js';
import { RESOURCES, baseState } from '../scope/probes.test-helper.js';

import { CONTRACTS } from './contracts.js';
import { LEGIBILITY_WINDOW_S, legibilityOf } from './legibility.js';
import { LOCATED_FIGURE_IDS, TROUBLE_SOURCES, troubleOf, type RunTrouble } from './trouble.js';

function leg(over: Partial<VizLeg> & Pick<VizLeg, 'passengerId' | 'arrivedAt'>): VizLeg {
  return {
    originFloorId: 'L',
    destinationFloorId: '5',
    direction: 'up',
    legIndex: 0,
    finalDestinationFloorId: '5',
    ...over,
  };
}

/**
 * A recording carrying only what the leg-driven sources read.
 *
 * `troubleOf` takes a whole `VizRecording` because two of its four sources go through
 * `observationsAt`, which reads the summary. The two that do not are exercised here on a cast so
 * the arithmetic can be read by eye; every source is exercised against a real run below.
 */
function legsOnly(legs: readonly VizLeg[], startedAt: number, endedAt: number): VizRecording {
  return { legs, startedAt, endedAt } as unknown as VizRecording;
}

describe('the arithmetic', () => {
  it('locates a held landing at the second the window closed, with the crowd standing there', () => {
    /* Two riders on L from t=0, one on 3 from t=0. All still standing at the end, so every
     * landing's stretch runs `[60, 400)` — past the 120 s window. */
    const legs = [
      leg({ passengerId: 'a', arrivedAt: 0 }),
      leg({ passengerId: 'b', arrivedAt: 0 }),
      leg({ passengerId: 'c', arrivedAt: 0, originFloorId: '3' }),
    ];
    const trouble = troubleOf(legsOnly(legs, 0, 400));
    expect(trouble.located).toBe(true);
    expect(trouble.asked).toEqual(['held-landing']);
    /* The window closes at 60 + 120 = 180 on both landings; `3` sorts before `L`. */
    expect(trouble.moments.map((m) => [m.source, m.floorId, m.atS])).toEqual([
      ['held-landing', '3', 180],
      ['held-landing', 'L', 180],
    ]);
    const [three, ell] = trouble.moments;
    expect(three?.band.id).toBe('checking-watch');
    expect(three?.bandIndex).toBe(2);
    expect(three?.bar).toEqual({ value: LEGIBILITY_WINDOW_S, unit: 'seconds', sense: 'at-least' });
    /* One standing on `3`, two on `L`, three anywhere — and all three past the 60 s band. */
    expect(three?.figures.find((f) => f.id === 'standing-here')).toMatchObject({ value: 1, of: 3 });
    expect(ell?.figures.find((f) => f.id === 'standing-here')).toMatchObject({ value: 2, of: 3 });
    expect(ell?.figures.find((f) => f.id === 'past-band-here')).toMatchObject({ value: 2, of: 2 });
    expect(ell?.figures.find((f) => f.id === 'past-band-everywhere')).toMatchObject({ value: 3, of: 3 });
  });

  it('locates nothing when no landing holds the window, and says what was asked', () => {
    const legs = [leg({ passengerId: 'a', arrivedAt: 0, boardedAt: 100 })];
    const trouble = troubleOf(legsOnly(legs, 0, 400));
    expect(trouble.located).toBe(false);
    expect(trouble.moments).toEqual([]);
    /*
     * One instrument of four was asked, and `asked` says so. A surface that read an empty result
     * as *nothing went wrong* would be claiming a verdict from a question nobody put, which is why
     * the field exists rather than the caller inferring it from `located`.
     */
    expect(trouble.asked).toEqual(['held-landing']);
  });

  it('does not locate a rider the building turned away — § D266', () => {
    const legs = [leg({ passengerId: 'r', arrivedAt: 0, refusedAt: 0 })];
    expect(troubleOf(legsOnly(legs, 0, 400)).moments).toEqual([]);
  });

  it('gives the hold line a landing, which the core instrument has none to give', () => {
    /* Forty on L and one on 3, all arriving at 0 and never boarding: the line holds at 120. */
    const legs = [
      ...Array.from({ length: RUSH_HOLD_LINE.people }, (_, n) => leg({ passengerId: `p${String(n)}`, arrivedAt: 0 })),
      leg({ passengerId: 'z', arrivedAt: 0, originFloorId: '3' }),
    ];
    const recording = legsOnly(legs, 0, 400);
    expect(rushHoldAtLegs(legs, 0, 400)).toBe(RUSH_HOLD_LINE.overS);

    /* Off by default: a career day is not graded against the rush's line. */
    expect(troubleOf(recording).moments.every((m) => m.source !== 'hold')).toBe(true);

    const holds = troubleOf(recording, { includeHoldLine: true }).moments.filter((m) => m.source === 'hold');
    expect(holds.map((m) => [m.floorId, m.atS])).toEqual([
      ['3', RUSH_HOLD_LINE.overS],
      ['L', RUSH_HOLD_LINE.overS],
    ]);
    expect(holds[0]?.band.id).toBe('taking-the-stairs');
    expect(holds[0]?.bar).toEqual({ value: RUSH_HOLD_LINE.people, unit: 'people', sense: 'at-least' });
    /* 40 of the 41 standing are on L; the 41st is on 3, and all 41 are past two minutes. */
    expect(holds[1]?.figures.find((f) => f.id === 'standing-here')).toMatchObject({ value: 40, of: 41 });
    expect(holds[0]?.figures.find((f) => f.id === 'past-band-everywhere')).toMatchObject({ value: 41, of: 41 });
  });

  it('orders by the run’s clock and never by how bad a moment is', () => {
    /* A crowd on `3` from t=0 and one on `A` from t=200: `3`'s window closes first even though
     * `A` sorts first alphabetically, so the order is the clock and not the label. */
    const legs = [
      leg({ passengerId: 'a', arrivedAt: 0, originFloorId: '3' }),
      leg({ passengerId: 'b', arrivedAt: 0, originFloorId: '3' }),
      leg({ passengerId: 'c', arrivedAt: 200, originFloorId: 'A' }),
    ];
    const trouble = troubleOf(legsOnly(legs, 0, 600));
    expect(trouble.moments.map((m) => [m.floorId, m.atS])).toEqual([
      ['3', 180],
      ['A', 380],
    ]);
  });

  it('is deterministic and order-free in the legs', () => {
    const legs = [
      leg({ passengerId: 'a', arrivedAt: 0 }),
      leg({ passengerId: 'b', arrivedAt: 10, originFloorId: '3' }),
      leg({ passengerId: 'c', arrivedAt: 20, originFloorId: '3' }),
    ];
    const once = troubleOf(legsOnly(legs, 0, 500));
    const twice = troubleOf(legsOnly(legs, 0, 500));
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });
});

/* -------------------------------------------------------------------------- *
 * Agreement with the instruments in force
 * -------------------------------------------------------------------------- */

/** Every shipped building, resolved through the loader `legibility.test.ts` uses. */
function allBuildings(): BrowserResources {
  const entries = CONTRACTS.map((contract) => {
    const config = parseBuilding(
      JSON.parse(readFileSync(join(DATA_DIR, 'buildings', `${contract.buildingId}.json`), 'utf8')),
    );
    return { file: `${contract.buildingId}.json`, config, resolved: resolveBuilding(config, RESOURCES.elevatorSpecs) };
  });
  return { ...RESOURCES, buildings: entries.map((entry) => entry.resolved), entries };
}

/**
 * A day on every contract that has one worth locating, at the sweep's own first seed.
 *
 * The same cell `legibility.test.ts` pins — `collective`, the contract's own shift length, an
 * ordinary day, seed `20 260 824` — so a moment this locates is a moment that table already knows
 * about, and a disagreement is a disagreement with a measurement rather than with a fixture.
 */
function dayFor(resources: BrowserResources, buildingId: string, contractId: string): VizRecording {
  const plan = shiftRunConfigOf(resources, {
    ...baseState(),
    buildingId,
    dispatcherId: 'collective',
    shiftLengthS: shiftLengthForContract(contractId),
    seed: 20_260_824n,
    campaignEventId: 'ordinary',
  });
  return recordRun(plan.config, { recordDecisions: false }).recording;
}

describe('agreement with the instruments in force, on real runs', () => {
  const resources = allBuildings();
  /* Four towers spanning this instrument's whole range, per `legibility.ts`'s own table: one
   * legible on every seed, one on most, one rarely, and one never. */
  const sample = ['c2', 'c5', 'c8', 'c1'].map((id) => {
    const contract = CONTRACTS.find((c) => c.id === id);
    if (contract === undefined) throw new Error(`no contract ${id}`);
    return contract;
  });

  for (const contract of sample) {
    describe(`${contract.id} · ${contract.buildingId}`, () => {
      const recording = dayFor(resources, contract.buildingId, contract.id);

      it('locates exactly the landings § D512’s own union calls legible, at the same second', () => {
        const day = legibilityOf(recording);
        const expected = day.landings
          .filter((landing) => landing.legibleAtS !== undefined)
          .map((landing) => [landing.floorId, landing.legibleAtS])
          .sort((a, b) => Number(a[1]) - Number(b[1]) || String(a[0]).localeCompare(String(b[0])));
        const located = troubleOf(recording).moments
          .filter((m) => m.source === 'held-landing')
          .map((m) => [m.floorId, m.atS]);
        expect(located).toEqual(expected);
        /* And the verdict agrees with the instrument's own, in both directions. */
        expect(located.length > 0).toBe(day.legible);
      });

      it('locates the hold at core’s own bucket, or not at all when core does not', () => {
        const core = rushHoldAtLegs(recording.legs, recording.startedAt, recording.endedAt);
        const holds = troubleOf(recording, { includeHoldLine: true }).moments.filter((m) => m.source === 'hold');
        if (core === undefined) {
          expect(holds).toEqual([]);
          return;
        }
        expect(holds.length).toBeGreaterThan(0);
        expect(new Set(holds.map((m) => m.atS))).toEqual(new Set([core]));
        /* The landings partition the people past the line: no double count, none dropped. */
        const perLanding = holds.map((m) => m.figures.find((f) => f.id === 'standing-here')?.value ?? 0);
        const pastEverywhere = holds[0]?.figures.find((f) => f.id === 'past-band-everywhere')?.value ?? 0;
        expect(pastEverywhere).toBeGreaterThanOrEqual(RUSH_HOLD_LINE.people);
        expect(perLanding.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(pastEverywhere);
      });

      it('locates the worst wait on the leg observationsAt folded, never a second fold', () => {
        const o = observationsAt(recording, recording.endedAt);
        const worst = o.worstWaitSoFarS;
        if (worst === undefined) return;
        /* A ceiling a hair under the observed maximum, so the moment is always emitted here. */
        const moments = troubleOf(recording, { bars: { worstWaitAtMostS: Math.max(0, worst - 1) } }).moments.filter(
          (m) => m.source === 'worst-wait',
        );
        expect(moments).toHaveLength(1);
        const figure = moments[0]?.figures.find((f) => f.id === 'waited');
        expect(figure?.value).toBe(worst);
        expect(figure?.censored).toBe(o.worstWaitIsCensored);
        expect(figure?.of).toBe(o.arrived);
        /* The landing is the leg's own origin, and the clock is when that wait began. */
        const located = recording.legs.find((l) => l.originFloorId === moments[0]?.floorId);
        expect(located).toBeDefined();
        expect(moments[0]?.atS).toBeLessThanOrEqual(recording.endedAt);
      });

      it('does not emit the bar-driven sources when the run stayed inside the bar', () => {
        const o = observationsAt(recording, recording.endedAt);
        const worst = o.worstWaitSoFarS ?? 0;
        const inside = troubleOf(recording, {
          bars: { queueAtMost: o.peakQueue.count + 1, worstWaitAtMostS: worst + 1 },
        });
        expect(inside.moments.filter((m) => m.source === 'deepest-queue')).toEqual([]);
        expect(inside.moments.filter((m) => m.source === 'worst-wait')).toEqual([]);
        /* Asked all four, and said so — which is the sentence an empty result needs. */
        expect(inside.asked).toEqual([...TROUBLE_SOURCES.filter((s) => s !== 'hold')]);
      });

      it('locates the deepest queue where observationsAt put it, and agrees on the depth', () => {
        const o = observationsAt(recording, recording.endedAt);
        const { count, floorId, atS } = o.peakQueue;
        if (floorId === undefined || atS === undefined || count === 0) return;
        const moments = troubleOf(recording, { bars: { queueAtMost: count - 1 } }).moments.filter(
          (m) => m.source === 'deepest-queue',
        );
        expect(moments).toHaveLength(1);
        expect(moments[0]?.floorId).toBe(floorId);
        expect(moments[0]?.atS).toBe(atS);
        /*
         * The crowd this locator counts standing at that landing at that instant **is** the depth
         * `observationsAt` peaked at. Two answers to *how many are standing here* is the divergence
         * this package has a rule about, and this is the assertion that would catch it.
         */
        expect(moments[0]?.figures.find((f) => f.id === 'standing-here')?.value).toBe(count);
      });
    });
  }
});

/* -------------------------------------------------------------------------- *
 * The honesty shape
 * -------------------------------------------------------------------------- */

describe('the honesty shape, asserted rather than reviewed', () => {
  const resources = allBuildings();
  const recording = dayFor(resources, 'midtown-office', 'c2');
  const o = observationsAt(recording, recording.endedAt);
  const everything: RunTrouble = troubleOf(recording, {
    includeHoldLine: true,
    bars: { queueAtMost: 0, worstWaitAtMostS: 0 },
  });

  it('locates something on Midtown Office, which is the point of choosing it', () => {
    /* `legibility.ts`'s table: c2 is legible on 50 of 50 seeds. A shape test over an empty result
     * would assert nothing, so this guard is the test's own precondition. */
    expect(everything.moments.length).toBeGreaterThan(0);
    expect(everything.asked).toEqual([...TROUBLE_SOURCES]);
  });

  it('publishes no mean, and holds no field one could be put in — R3', () => {
    /*
     * The strongest form of *no mean beside a refused one*: there is no mean for one to sit beside.
     * Asserted over the serialised result so a field added later without a thought fails here.
     */
    const json = JSON.stringify(everything).toLowerCase();
    for (const word of ['mean', 'average', 'avg', 'awt']) expect(json).not.toContain(word);
  });

  it('gives every figure its count, and keeps a people count inside it — R13', () => {
    for (const moment of everything.moments) {
      expect(moment.figures.length).toBeGreaterThan(0);
      for (const figure of moment.figures) {
        expect(LOCATED_FIGURE_IDS).toContain(figure.id);
        expect(Number.isFinite(figure.of)).toBe(true);
        expect(figure.of).toBeGreaterThanOrEqual(0);
        if (figure.unit === 'people') {
          expect(figure.value).toBeGreaterThanOrEqual(0);
          expect(figure.value).toBeLessThanOrEqual(figure.of);
        }
      }
    }
  });

  it('names a band from the fixed ladder, never the run-derived one', () => {
    for (const moment of everything.moments) {
      expect(WAIT_BANDS[moment.bandIndex]).toBe(moment.band);
      expect(WAIT_BANDS).toContain(moment.band);
    }
  });

  it('carries every moment inside the run’s own clock', () => {
    for (const moment of everything.moments) {
      expect(moment.atS).toBeGreaterThanOrEqual(recording.startedAt);
      expect(moment.atS).toBeLessThanOrEqual(recording.endedAt);
    }
  });

  it('carries a censored worst wait as a lower bound rather than laundering it', () => {
    const o = observationsAt(recording, recording.endedAt);
    const waited = everything.moments
      .filter((m) => m.source === 'worst-wait')
      .flatMap((m) => m.figures.filter((f) => f.id === 'waited'));
    expect(waited).toHaveLength(1);
    /* The gate `goals.ts#readGoal` applies, carried and not dropped — and the run's own answer. */
    expect(waited[0]?.censored).toBe(o.worstWaitIsCensored);
    expect(waited[0]?.value).toBe(o.worstWaitSoFarS);
  });

  it('writes a span where a figure is only true once it has ended, and an instant otherwise', () => {
    for (const moment of everything.moments) {
      if (moment.source === 'worst-wait') {
        /* Located where the wait began; the duration is only true by `untilS`. */
        expect(moment.untilS).toBeDefined();
        expect(moment.untilS ?? 0).toBeGreaterThanOrEqual(moment.atS);
        const waited = moment.figures.find((f) => f.id === 'waited')?.value ?? 0;
        expect(Math.round((moment.untilS ?? 0) - moment.atS)).toBe(Math.round(waited));
      } else {
        /* Every other source's figures are true at `atS`, so there is no span to write. */
        expect(moment.untilS).toBeUndefined();
      }
    }
  });

  it('reads every bar against the sense the instrument holds it at', () => {
    for (const moment of everything.moments) {
      expect(moment.bar).toBeDefined();
      const bar = moment.bar;
      if (bar === undefined) continue;
      expect(['at-most', 'at-least']).toContain(bar.sense);
      expect(['people', 'seconds']).toContain(bar.unit);
    }
  });

  it('is exhaustive over its own vocabularies', () => {
    expect(new Set(TROUBLE_SOURCES).size).toBe(TROUBLE_SOURCES.length);
    expect(new Set(LOCATED_FIGURE_IDS).size).toBe(LOCATED_FIGURE_IDS.length);
    for (const moment of everything.moments) expect(TROUBLE_SOURCES).toContain(moment.source);
  });
});
