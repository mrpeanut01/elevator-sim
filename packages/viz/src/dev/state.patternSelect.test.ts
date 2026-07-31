/**
 * CO-02's positive half: the coach ribbon's arrival-pattern select really moves the run.
 *
 * `state.test.ts` asserts the negative — under `'building'`, the comparable default,
 * `shiftRunConfigOf` hands the run **no** demand override — and until this file nothing asserted
 * the positive, which made the busiest control in the ribbon the one place § D177's rule was not
 * applied: the four editors each require a moved control to change the legs, and the select that
 * decides *which demand runs at all* required nothing. So the two cases here are the standing
 * requirement pointed at the select: picking a shipped non-default pattern must change the config
 * it hands the simulator **and** the run itself, compared on the legs rather than on a window
 * statistic.
 *
 * A separate file rather than `state.test.ts` because wave 12 partitions the two: that file is
 * lane V's, this row is lane T's.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
} from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import { recordRun } from '../record/recordRun.js';

import type { BrowserResources } from './data.js';
import { initialState, shiftRunConfigOf, type ViewerState } from './state.js';

const DATA = new URL('../../../../data/', import.meta.url);
const read = (path: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, DATA)), 'utf8')) as unknown;

const BUILDING_IDS = [
  'garden-apartments',
  'midtown-office',
  'secure-tower',
  'mixed-use-high-rise',
  'vertical-city',
] as const;

function resourcesOf(): BrowserResources {
  const elevatorSpecs = parseElevatorSpecs(read('elevator-specs.json'));
  const entries = BUILDING_IDS.map((id) => {
    const config = parseBuilding(read(`buildings/${id}.json`));
    return { file: `${id}.json`, config, resolved: resolveBuilding(config, elevatorSpecs) };
  });
  const trafficProfiles = parseTrafficProfiles(read('traffic-profiles.json'));
  return {
    elevatorSpecs,
    trafficProfiles,
    dispatcherProfiles: parseDispatcherProfiles(read('dispatcher-profiles.json')),
    buildings: entries.map((entry) => entry.resolved),
    entries,
    trafficProfileIds: new Set(trafficProfiles.profiles.map((profile) => profile.id)),
    warnings: [],
  };
}

const resources = resourcesOf();
const base = (): ViewerState => initialState(resources, 20260730n);

/*
 * The non-default arm is `office-standard` on Garden Apartments — a shipped pattern, and about as
 * far from the building's own `residential` profile as the file gets: 12 %pop/5 min up-peak with a
 * 1.4 batch mean against a 5 % down-peak trickle at 1.8. A delta that size is decision-flip sized
 * by construction; a pattern near the building's own would risk a false "inert" finding.
 */
const PATTERN = 'office-standard';

const legsOf = (state: ViewerState): string => {
  const plan = shiftRunConfigOf(resources, state);
  return JSON.stringify(
    recordRun(plan.config, { recordDecisions: false }).recording.legs.map((leg) => [
      leg.passengerId,
      leg.carId ?? '',
      leg.boardedAt ?? -1,
    ]),
  );
};

describe('the arrival-pattern select is not decoration — CO-02', () => {
  it('a shipped non-default pattern hands the run a demand override', () => {
    // The exact positive of state.test.ts's negative: `'building'` overrides nothing, so anything
    // else must override something, or the select is a label over the same run.
    expect(base().pattern).toBe('building');
    const plan = shiftRunConfigOf(resources, { ...base(), pattern: PATTERN });
    expect(plan.config.demand).not.toStrictEqual({});
    expect(plan.config.demand?.arrivalRatePctPop5min).toBeDefined();
  });

  it('and the run itself moves — the legs differ from the building’s own profile', () => {
    /*
     * Same building, same seed, same day, same event — the select is the only thing that moved. And
     * neither arm may be empty: a fingerprint of zero legs equals anything, so an instrument that
     * could go silent would pass exactly when the control died.
     */
    const control = legsOf({ ...base(), shiftLengthS: 300 });
    const moved = legsOf({ ...base(), shiftLengthS: 300, pattern: PATTERN });
    expect(JSON.parse(control)).not.toHaveLength(0);
    expect(JSON.parse(moved)).not.toHaveLength(0);
    expect(moved).not.toBe(control);
  });
});
