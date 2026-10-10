/**
 * **The Career brief says every driver clears a day only where a census of that day's crowd says
 * so** — GitHub issue #571's Career half, wave AN lane AP-3, [§ D1301](../../../../DECISIONS.md).
 *
 * Measured, never pinned: a career day's crowd is derived from a base each sitting captures, so a
 * figure written down for *c1 day 6* would describe a crowd the next sitting never meets (§ D914's
 * rule, *a census describes only the runs it was taken on*). The census is therefore the day the
 * desk is about to run, under every driver the select offers, and these cases run it for real.
 */

import { describe, expect, it } from 'vitest';

import { freshTower, openingCareer, towerById, type CampaignCareer } from '../campaign/career.js';
import { careerDaySeedFor, campaignEventFor } from '../campaign/incidents.js';
import { fitOutOf } from '../campaign/fitOut.js';
import { worksHeldCarsOf } from '../campaign/works.js';
import type { VizRecording } from '../contract/types.js';
import { shiftLengthForContract, shiftRunConfigOf, type ViewerState } from '../dev/state.js';
import { recordRun } from '../record/recordRun.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import { RESOURCES, baseState } from '../scope/probes.test-helper.js';
import { openCareer } from '../shift/week.js';

import {
  DAY_CENSUS_CONTRACT_IDS,
  DAY_CENSUS_COPY,
  buildingView,
  censusVerdictOf,
  type CampaignInput,
  type CareerDayCensus,
  type CensusVerdict,
} from './campaignModel.js';
import { createEverydayHost, type EverydayHostBindings } from './host.js';

function legsOf(recording: VizRecording): string {
  return JSON.stringify(
    recording.legs.map((leg) => [leg.passengerId, leg.originFloorId, leg.destinationFloorId, leg.carId ?? '', leg.boardedAt ?? -1]),
  );
}

/** `towerLoop.test.ts`'s harness: a merging patch, a latch, and a press that really simulates. */
function harness(): { bindings: EverydayHostBindings; state: () => ViewerState } {
  let state = baseState();
  let filed: string | undefined;
  const bindings: EverydayHostBindings = {
    resources: RESOURCES,
    state: () => state,
    playheadS: () => 0,
    dayClosed: () => state.recording !== undefined && filed === state.recording.runId,
    runIsOwn: () => true,
    playerHasChosen: () => true,
    dayStartS: () => undefined,
    startRun: () => {
      const plan = shiftRunConfigOf(RESOURCES, state);
      state = { ...state, recording: recordRun(plan.config, { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds }).recording };
    },
    intervene: () => {},
    closeDay: () => {
      if (state.recording !== undefined) filed = state.recording.runId;
    },
    openRunTab: () => {},
    ghostRace: () => ({ pick: 'none' as const, rival: undefined, refusal: undefined, pending: false }),
    raceAgainst: () => {},
    applyPatch: (patch) => {
      state = { ...state, ...patch };
    },
    loadReferenceRuns: () => Promise.resolve([]),
    simulateRecord: () => {
      throw new Error('this harness does not simulate a record');
    },
    enterWatch: () => {},
    stopWatching: () => {},
    playThisCrowd: () => {},
    watching: () => undefined,
    dailyBoard: undefined,
    onChange: () => () => {},
  };
  return { bindings, state: () => state };
}

function inputOf(career: CampaignCareer, census: CareerDayCensus | undefined, dispatcherIds: readonly string[]): CampaignInput {
  return {
    schedule: shippedPriceSchedule(),
    career,
    buildings: new Map([
      ['garden-apartments', { name: 'Garden Apartments', spec: undefined }],
      ['midtown-office', { name: 'Midtown Office', spec: undefined }],
    ]),
    dispatchers: dispatcherIds.map((id) => ({ id, name: id, note: undefined, saved: false })),
    observations: undefined,
    observationsBasis: 'whole-run',
    history: [],
    dayCensus: census,
  };
}

describe('the Career brief’s census line — #571, § D1301', () => {
  it('runs, for the tower’s own standing order, exactly the day the press runs — on the legs', () => {
    const h = harness();
    const host = createEverydayHost(h.bindings);
    const plan = host.careerDayCensusRuns?.('c1');
    expect(plan?.towerDay).toBe(1);
    const standing = towerById(host.campaign(), 'c1')?.dispatcherId;
    const arm = plan?.runs().find((run) => run.dispatcherId === standing);
    expect(arm, 'the census covers the standing order').toBeDefined();
    if (arm === undefined) return;
    const census = recordRun(arm.config, { recordDecisions: false, outOfServiceCarIds: arm.outOfServiceCarIds }).recording;

    host.runCampaignDay('c1');
    const pressed = h.state().recording;
    expect(pressed).toBeDefined();
    if (pressed === undefined) return;
    expect(legsOf(census)).toBe(legsOf(pressed));
    expect(census.seed).toBe(pressed.seed);
    /* And the census asked for every driver the select offers, no more. */
    expect(plan?.runs().map((run) => run.dispatcherId)).toEqual(host.dispatchers().map((profile) => profile.id));
  });

  it('draws the line on a c1 day whose census agrees, from every driver’s own run of that crowd', () => {
    expect(DAY_CENSUS_CONTRACT_IDS).toEqual(['c1']);
    const host = createEverydayHost(harness().bindings);
    const plan = host.careerDayCensusRuns?.('c1');
    const tower = towerById(host.campaign(), 'c1');
    if (plan === undefined || tower === undefined) throw new Error('no census for c1');
    const verdicts = new Map<string, CensusVerdict>();
    for (const run of plan.runs()) {
      const recording = recordRun(run.config, { recordDecisions: false, outOfServiceCarIds: run.outOfServiceCarIds }).recording;
      verdicts.set(run.dispatcherId, censusVerdictOf(tower, recording));
    }
    const ids = [...verdicts.keys()];
    expect(ids.length).toBe(13);
    expect([...verdicts.values()].every((verdict) => verdict === 'cleared'), JSON.stringify([...verdicts])).toBe(true);
    const census: CareerDayCensus = { towerId: 'c1', towerDay: plan.towerDay, verdicts };
    const line = buildingView(inputOf(host.campaign(), census, ids))?.order.census;
    expect(line).toBe(DAY_CENSUS_COPY.allClear);
    /* It claims no mechanism (§ D256): what the runs did, never why. */
    expect(line).not.toMatch(/because|so that|since|thanks to|which is why|means|due to/iu);
    /* A census of another day, or one missing a driver the select offers, draws nothing. */
    expect(buildingView(inputOf(host.campaign(), { ...census, towerDay: 2 }, ids))?.order.census).toBeUndefined();
    expect(buildingView(inputOf(host.campaign(), census, [...ids, 'mine']))?.order.census).toBeUndefined();
    /* And no census, no line: that is today's desk, and the reason this case was red. */
    expect(buildingView(inputOf(host.campaign(), undefined, ids))?.order.census).toBeUndefined();
  });

  it('draws nothing on a c2 day whose drivers’ verdicts differ', () => {
    /*
     * Midtown Office's first career day at the first base of `docs/33` § 4.6's sequence, built the
     * way `runCampaignDay` builds a day (`campaign/shopTiers.sweep.test.ts`'s construction, with the
     * day's own drawn event). Measured by this lane: nine of thirteen clear and four miss.
     */
    const base = 20_260_824n;
    const tower = freshTower({ contractId: 'c2', buildingId: 'midtown-office', dispatcherId: 'collective', rate: 5 });
    const building = RESOURCES.buildings.find((entry) => entry.id === 'midtown-office');
    if (building === undefined) throw new Error('midtown-office is not in the probe resources');
    const event = campaignEventFor({ tower, seed: base });
    const verdicts = new Map<string, CensusVerdict>();
    for (const profile of RESOURCES.dispatcherProfiles.profiles) {
      const state: ViewerState = {
        ...baseState(),
        buildingId: 'midtown-office',
        dispatcherId: profile.id,
        seed: careerDaySeedFor(base, 'c2', 1),
        week: { ...openCareer(), day: 1, dayIdx: 0 },
        outOfServiceCarIds: worksHeldCarsOf(tower, building),
        campaignFitOut: fitOutOf(tower),
        shiftLengthS: shiftLengthForContract('c2'),
        windowStartS: null,
        campaignEventId: event.id,
        interventions: [],
      };
      const plan = shiftRunConfigOf(RESOURCES, state);
      const recording = recordRun(plan.config, { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds }).recording;
      verdicts.set(profile.id, censusVerdictOf(tower, recording));
    }
    const kinds = new Set(verdicts.values());
    expect(kinds.has('cleared') && kinds.has('missed'), JSON.stringify([...verdicts])).toBe(true);
    const career: CampaignCareer = { ...openingCareer('collective'), towers: [tower], openTowerId: 'c2' };
    const census: CareerDayCensus = { towerId: 'c2', towerDay: 1, verdicts };
    expect(buildingView(inputOf(career, census, [...verdicts.keys()]))?.order.census).toBeUndefined();
  });
});
