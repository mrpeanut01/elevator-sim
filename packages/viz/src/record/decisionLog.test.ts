/**
 * The one assertion that makes the decision log usable: **it changes nothing.**
 *
 * Everything else this file checks is a property of the log's content. This is a property of the
 * run, and it is the reason the log is allowed to exist at all — a wrapper that moved a decision
 * would invalidate every comparison made with an instrumented recording, silently, because the
 * recording would still be deterministic and would still replay identically.
 */

import { describe, expect, it } from 'vitest';

import {
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
  type SimulationConfig,
} from '@elevator-sim/core/browser';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { recordRun } from './recordRun.js';

const DATA = new URL('../../../../data/', import.meta.url);

function read(path: string): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL(path, DATA)), 'utf8')) as unknown;
}

function configFor(dispatcherId: string, durationS = 600): SimulationConfig {
  const specs = parseElevatorSpecs(read('elevator-specs.json'));
  const traffic = parseTrafficProfiles(read('traffic-profiles.json'));
  const profiles = parseDispatcherProfiles(read('dispatcher-profiles.json'));
  const building = resolveBuilding(parseBuilding(read('buildings/midtown-office.json')), specs);
  const profile = profiles.profiles.find((candidate) => candidate.id === dispatcherId);
  if (profile === undefined) throw new Error(`no profile "${dispatcherId}"`);
  return {
    building,
    dispatcherProfile: profile,
    trafficProfiles: traffic,
    elevatorSpecs: specs,
    dispatcherProfiles: profiles,
    seed: 20260730n,
    durationS,
    onTimeout: 'report',
  };
}

describe('the decision log does not change the run', () => {
  it('produces an identical RunRecord instrumented and uninstrumented', () => {
    const config = configFor('collective');
    const withLog = recordRun(config, { recordDecisions: true });
    const without = recordRun(config, { recordDecisions: false });

    // The whole record, not a digest of it: a digest is a second thing that can be wrong.
    expect(JSON.stringify(withLog.result.record)).toBe(JSON.stringify(without.result.record));
    expect(withLog.result.summary).toStrictEqual(without.result.summary);
    expect(withLog.result.conservation).toStrictEqual(without.result.conservation);
    // And the picture, which is the artefact the wrapper is nearest to.
    expect(JSON.stringify(withLog.recording.shafts)).toBe(
      JSON.stringify(without.recording.shafts),
    );
  });

  it('records nothing when asked not to, and something when asked', () => {
    const config = configFor('eta');
    expect(recordRun(config, { recordDecisions: false }).recording.decisions).toHaveLength(0);
    expect(recordRun(config, { recordDecisions: true }).recording.decisions.length).toBeGreaterThan(
      0,
    );
  });
});

describe('what a decision carries', () => {
  const recording = recordRun(configFor('eta')).recording;

  it('is sorted by (at, callId) and never ahead of the run', () => {
    const decisions = recording.decisions;
    for (let i = 1; i < decisions.length; i += 1) {
      const previous = decisions[i - 1];
      const current = decisions[i];
      if (previous === undefined || current === undefined) continue;
      expect(current.at).toBeGreaterThanOrEqual(previous.at);
      if (current.at === previous.at) {
        expect(current.callId.localeCompare(previous.callId)).toBeGreaterThanOrEqual(0);
      }
    }
    for (const decision of decisions) {
      expect(decision.at).toBeGreaterThanOrEqual(recording.startedAt);
      expect(decision.at).toBeLessThanOrEqual(recording.endedAt);
    }
  });

  it('names a landing that exists on the building', () => {
    const floorIds = new Set(recording.floors.map((floor) => floor.id));
    for (const decision of recording.decisions) {
      expect(floorIds.has(decision.floorId)).toBe(true);
    }
  });

  it('names a car that exists, whenever it names one', () => {
    const carIds = new Set(recording.shafts.map((shaft) => shaft.carId));
    for (const decision of recording.decisions) {
      if (decision.carId === undefined) continue;
      expect(carIds.has(decision.carId)).toBe(true);
    }
  });

  it('gives an assigned decision a winner and a decomposition', () => {
    const assigned = recording.decisions.filter((decision) => decision.outcome === 'assigned');
    expect(assigned.length).toBeGreaterThan(0);
    for (const decision of assigned) {
      expect(decision.carId).toBeDefined();
      expect(decision.cost).toBeDefined();
      expect(decision.eligibleCars).toBeGreaterThan(0);
    }
    // `eta` weights one term, so at least one decision must decompose to it and nothing else.
    const decomposed = assigned.filter((decision) => decision.terms.length > 0);
    expect(decomposed.length).toBeGreaterThan(0);
    for (const decision of decomposed) {
      expect(decision.terms.length).toBeLessThanOrEqual(3);
      for (const term of decision.terms) {
        expect(term.contribution).not.toBe(0);
        expect(Number.isFinite(term.contribution)).toBe(true);
        expect(Number.isFinite(term.raw)).toBe(true);
      }
      // Largest contribution first, by magnitude.
      const magnitudes = decision.terms.map((term) => Math.abs(term.contribution));
      expect([...magnitudes].sort((a, b) => b - a)).toStrictEqual(magnitudes);
    }
  });

  it('survives a JSON round trip unchanged', () => {
    const round = JSON.parse(JSON.stringify(recording.decisions)) as unknown;
    expect(round).toStrictEqual(recording.decisions);
  });
});

describe('the demand phases', () => {
  const recording = recordRun(configFor('collective', 1800)).recording;

  it('covers the run contiguously and ascending', () => {
    expect(recording.demandPhases.length).toBeGreaterThan(0);
    let previousEnd = recording.demandPhases[0]?.startS ?? 0;
    for (const phase of recording.demandPhases) {
      expect(phase.startS).toBeCloseTo(previousEnd, 6);
      expect(phase.endS).toBeGreaterThan(phase.startS);
      previousEnd = phase.endS;
    }
    // Scaled onto the run's own duration, not the template's. See `describePhases`.
    expect(previousEnd).toBeCloseTo(1800, 6);
  });

  it('names at least one segment inside the reporting window', () => {
    expect(recording.demandPhases.some((phase) => phase.inReportWindow)).toBe(true);
  });

  it('states a rate or states nothing, and never states zero for a peak', () => {
    for (const phase of recording.demandPhases) {
      if (phase.ratePctPop5min === null) continue;
      expect(Number.isFinite(phase.ratePctPop5min)).toBe(true);
      if (phase.kind === 'hold') expect(phase.ratePctPop5min).toBeGreaterThan(0);
    }
  });
});

describe('holding a car out of service', () => {
  it('records what it applied, and the group runs one car short', () => {
    const config = configFor('collective');
    const full = recordRun(config, { recordDecisions: false });
    const short = recordRun(config, {
      recordDecisions: false,
      outOfServiceCarIds: ['main-A'],
    });
    expect(short.recording.outOfServiceCarIds).toStrictEqual(['main-A']);
    expect(full.recording.outOfServiceCarIds).toStrictEqual([]);

    // The withheld car takes nobody. This is the assertion that says the mode reached dispatch
    // rather than only the picture.
    const carried = short.recording.legs.filter((leg) => leg.carId === 'main-A');
    expect(carried).toHaveLength(0);
    // Not vacuous: the same car carries people when it is in service, so the emptiness above is
    // the mode and not an idle shaft. Asserted on the *legs* and not on a window statistic —
    // `summary.counts` is computed over the peak five minutes, and at this duration the remaining
    // three cars absorb the fourth's share inside that window, so the two runs report the same
    // delivered count while being visibly different runs.
    expect(full.recording.legs.some((leg) => leg.carId === 'main-A')).toBe(true);
    expect(JSON.stringify(short.recording.shafts)).not.toBe(
      JSON.stringify(full.recording.shafts),
    );
  });

  it('refuses a car id the building does not have', () => {
    expect(() =>
      recordRun(configFor('collective'), { outOfServiceCarIds: ['main-Z'] }),
    ).toThrow(/no such car/);
  });
});

describe('alightedAt', () => {
  it('is present on delivered legs and absent on legs still riding', () => {
    const recording = recordRun(configFor('collective')).recording;
    const delivered = recording.legs.filter((leg) => leg.alightedAt !== undefined);
    expect(delivered.length).toBeGreaterThan(0);
    for (const leg of delivered) {
      expect(leg.boardedAt).toBeDefined();
      expect(leg.alightedAt ?? 0).toBeGreaterThanOrEqual(leg.boardedAt ?? 0);
    }
    // Boarding is not delivery: on any run that ends with people in transit the two counts differ,
    // which is the whole reason the field exists.
    const boarded = recording.legs.filter((leg) => leg.boardedAt !== undefined);
    expect(delivered.length).toBeLessThanOrEqual(boarded.length);
  });
});
