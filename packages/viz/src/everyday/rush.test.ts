/**
 * Endless rush's engine half — GitHub issue #220, § D515.
 *
 * Four things, and the first is the one that could silently go wrong: the authored template must be
 * the contract's stream, so its phases are checked against `rushScreenModel.ts`'s own arithmetic
 * rather than against a second copy of the formula. Then the hold line on legs built by hand, both
 * outcomes worded, and the run itself on a shipped building — through `shiftRunConfigOf`, with the
 * rate override the patch writes, compared on the legs against an ordinary day.
 */

import { describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';
import { recordRun } from '../record/recordRun.js';
import { RESOURCES, baseState, legsOf } from '../scope/probes.test-helper.js';
import { shiftRunConfigOf } from '../dev/state.js';
import { RUSH_CONTRACT_ID } from '../shift/week.js';

import {
  RUSH_RESULT_COPY,
  RUSH_SEED,
  RUSH_TEMPLATE_ID,
  heldClock,
  rushBeforeOf,
  rushDisclosureOf,
  rushHoldAt,
  rushOutcomeOf,
  rushPatchOf,
  rushRestorePatchOf,
  rushResultViewOf,
  rushStageHeaderOf,
  rushTopArrivalsPerMinute,
  rushTopRatePctPop5min,
} from './rush.js';
import { waitBandsAt } from '../live/bands.js';

import { RUSH_HOLD_LINE, RUSH_STREAM, arrivalsPerMinute } from './rushScreenModel.js';

const template = RESOURCES.trafficProfiles.demandTemplates.find((entry) => entry.id === RUSH_TEMPLATE_ID);

describe('the template is the contract’s stream — ENGINE_CONTRACT § 3.2', () => {
  it('ships, ninety minutes, full-run window, and no rate of its own', () => {
    expect(template).toBeDefined();
    expect(template?.durationMin).toBe(RUSH_STREAM.lengthS / 60);
    expect(template?.reportWindow).toBe('full-run');
    expect(template?.recommended).toBe(false);
  });

  it('holds each wave’s rate for 150 s and climbs to the next over 30, as intensity against wave 30', () => {
    const phases = template?.phases ?? [];
    expect(phases.length).toBe(59);
    const top = rushTopArrivalsPerMinute();
    expect(top).toBeCloseTo(arrivalsPerMinute(29), 9);
    for (let wave = 0; wave < 30; wave += 1) {
      const hold = phases[2 * wave];
      expect(hold?.startMin).toBe(3 * wave);
      expect(hold?.startIntensity).toBeCloseTo(arrivalsPerMinute(wave) / top, 5);
      expect(hold?.endIntensity).toBe(hold?.startIntensity);
      if (wave < 29) {
        expect(hold?.endMin).toBe(3 * wave + 2.5);
        const climb = phases[2 * wave + 1];
        expect(climb?.endMin).toBe(3 * (wave + 1));
        expect(climb?.endIntensity).toBeCloseTo(arrivalsPerMinute(wave + 1) / top, 5);
      } else {
        expect(hold?.endMin).toBe(90);
      }
    }
    /* Monotone, and never above 1: the ceiling is the override, which is the whole point. */
    let last = 0;
    for (const phase of phases) {
      expect(phase.startIntensity).toBeGreaterThanOrEqual(last - 1e-9);
      expect(phase.endIntensity).toBeGreaterThanOrEqual(phase.startIntensity - 1e-9);
      expect(phase.endIntensity).toBeLessThanOrEqual(1);
      last = phase.endIntensity;
    }
    expect(phases[phases.length - 1]?.endIntensity).toBe(1);
  });

  it('converts wave 30 to a rate of this building’s own population, and the rate leaves the band', () => {
    const pop = 1000;
    expect(rushTopRatePctPop5min(pop)).toBeCloseTo((rushTopArrivalsPerMinute() * 500) / pop, 9);
    expect(() => rushTopRatePctPop5min(0)).toThrow();
    const building = RESOURCES.buildings.find((entry) => entry.id === 'garden-apartments');
    if (building === undefined) throw new Error('garden');
    const band = RESOURCES.trafficProfiles.profiles.find((profile) => profile.id === building.trafficProfile)?.arrivalRatePctPop5min;
    const line = rushDisclosureOf(building, band);
    expect(line).toContain('Busier than a building like this is sized for');
    expect(line).toContain('The figures here are about this day, not about the building type.');
  });
});

/** An ordinary Garden day, and the rush on the same building — both through the shipped path. */
function runOf(rush: boolean): VizRecording {
  const state = baseState();
  const building = RESOURCES.buildings.find((entry) => entry.id === state.buildingId);
  if (building === undefined) throw new Error(state.buildingId);
  const patched = rush ? ({ ...state, ...rushPatchOf(state, building.totalPopulation) } as typeof state) : state;
  return recordRun(shiftRunConfigOf(RESOURCES, patched).config, { recordDecisions: false }).recording;
}

describe('the hold line — forty past two minutes at once, read at the stream’s buckets', () => {
  const day = runOf(false);
  const rush = runOf(true);

  it('is never crossed on an ordinary Garden day, and is crossed by the rush', () => {
    expect(rushHoldAt(day)).toBeUndefined();
    const hold = rushHoldAt(rush);
    expect(hold).toBeDefined();
    /* At the bucket it names, forty are past two minutes; one bucket earlier, fewer were. */
    expect(waitBandsAt(rush, hold ?? 0).counts[3]?.count ?? 0).toBeGreaterThanOrEqual(RUSH_HOLD_LINE.people);
    expect(waitBandsAt(rush, (hold ?? 0) - RUSH_STREAM.bucketS).counts[3]?.count ?? 0).toBeLessThan(RUSH_HOLD_LINE.people);
    expect(RUSH_HOLD_LINE.people).toBe(40);
  });

  it('words both outcomes, and says better about nothing', () => {
    const broke = rushOutcomeOf(rush, undefined);
    expect(broke.kind).toBe('broke');
    expect(broke.atS).toBe(rushHoldAt(rush));
    expect(broke.overLine).toBeGreaterThanOrEqual(40);
    expect(broke.saturation?.verdict).toBe('diverging-queue');
    /* Stopped by hand before the line: the same recording, the other branch. */
    const stopped = rushOutcomeOf(rush, (rushHoldAt(rush) ?? 0) - 60);
    expect(stopped.kind).toBe('stopped');
    expect(stopped.overLine).toBeLessThan(40);
    /* And a day that never crosses is stopped at its own end. */
    expect(rushOutcomeOf(day, undefined).kind).toBe('stopped');
    for (const outcome of [broke, stopped]) {
      const view = rushResultViewOf(outcome, undefined);
      expect(view.figures.map((figure) => figure.label)).toEqual([
        RUSH_RESULT_COPY.furthestWave,
        RUSH_RESULT_COPY.howLong,
        RUSH_RESULT_COPY.carried,
        RUSH_RESULT_COPY.longest,
      ]);
      for (const text of [view.eyebrow, view.head, view.lede, ...view.account, ...view.figures.flatMap((f) => [f.label, f.value, f.note ?? '']), view.footer, view.disclosure ?? '']) expect(text).not.toMatch(/\bbetter\b|\bworse\b|\bbeats?\b/iu);
    }
    const brokeView = rushResultViewOf(broke, undefined);
    expect(brokeView.head).toBe(`Wave ${String(broke.wave)} is where it stopped draining`);
    expect(brokeView.account).toHaveLength(3);
    /* The trend test is quoted from the recording, never computed here. */
    expect(brokeView.account[1]).toContain('people a minute');
    expect(brokeView.account[1]).toContain(`${String(broke.saturation?.sampleCount ?? 0)} samples`);
    const stoppedView = rushResultViewOf(stopped, undefined);
    expect(stoppedView.account).toHaveLength(2);
    expect(stoppedView.footer).toContain('not posted');
    expect(stoppedView.lede).toContain('does not have a breaking point');
  });

  it('shows held time and the wave on the stage header', () => {
    const head = rushStageHeaderOf({ recording: rush, simTimeS: rush.startedAt + 190, driverName: 'Collective' });
    expect(head.held).toBe('3:10');
    expect(head.wave).toBe('WAVE 2');
    expect(head.figures.map((figure) => figure.label)).toContain('past two minutes, of 40');
    expect(heldClock(65)).toBe('1:05');
  });
});

describe('the run — the player’s week parked, the stream on the building, compared on the legs', () => {
  it('patches a rush week and its identity, and the restore puts the week back exactly', () => {
    const state = baseState();
    const patch = rushPatchOf(state, 120);
    expect(patch.week?.contractId).toBe(RUSH_CONTRACT_ID);
    expect(patch.parkedWeeks?.map((week) => week.contractId)).toContain(state.week.contractId);
    expect(patch.freePlay?.demandTemplateId).toBe(RUSH_TEMPLATE_ID);
    expect(patch.shiftLengthS).toBe(RUSH_STREAM.lengthS);
    expect(patch.seed).toBe(RUSH_SEED);
    const during = { ...state, ...patch };
    const back = rushRestorePatchOf(during, rushBeforeOf(state));
    expect(back.week).toEqual(state.week);
    expect(back.seed).toBe(state.seed);
    expect(back.shiftLengthS).toBe(state.shiftLengthS);
  });

  it('runs on Garden Apartments through the shipped path, and the stream is not an ordinary day', () => {
    const state = baseState();
    const building = RESOURCES.buildings.find((entry) => entry.id === state.buildingId);
    if (building === undefined) throw new Error(state.buildingId);
    const rush = { ...state, ...rushPatchOf(state, building.totalPopulation) } as typeof state;
    const recording = runOf(true);
    expect(recording.endedAt - recording.startedAt).toBeGreaterThanOrEqual(RUSH_STREAM.lengthS - 1);
    /* Wave 1 is 6.8 a minute on every tower, so the first three minutes bring about twenty people. */
    const firstWave = recording.legs.filter((leg) => leg.arrivedAt - recording.startedAt < 180).length;
    expect(firstWave).toBeGreaterThan(8);
    expect(firstWave).toBeLessThan(40);
    /* And the climb is real: the last ten minutes of the stream bring many times the first ten. */
    const tenMin = 600;
    const at = (leg: { readonly arrivedAt: number }): number => leg.arrivedAt - recording.startedAt;
    const early = recording.legs.filter((leg) => at(leg) < tenMin).length;
    const late = recording.legs.filter((leg) => at(leg) >= RUSH_STREAM.lengthS - tenMin && at(leg) < RUSH_STREAM.lengthS).length;
    expect(late).toBeGreaterThan(early * 3);
    /* Two lifts and a stream no six-floor building is sized for: the line is crossed, and the sheet says so. */
    expect(rushHoldAt(recording)).toBeDefined();
    expect(recording.summary.saturation?.verdict).toBe('diverging-queue');
    expect(legsOf(rush)).not.toEqual(legsOf(state));
  }, 300_000);
});
