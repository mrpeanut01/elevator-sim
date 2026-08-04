/**
 * **Move the control and require the run to change** — § D177's standing requirement, pointed at
 * Free Play's three remaining axes.
 *
 * The rule exists because this repository has shipped inert controls: a slider bound to a field
 * nothing read, a select that changed a label and no leg. § D177 found three of them and one false
 * claim about a mechanism *before a single editor was mounted*, and the rule it wrote is that a
 * control lands with a test that moves it and compares **the legs**, not a window statistic — a
 * mean can be unchanged for a run that is entirely different, and a mean can move because the
 * window moved.
 *
 * So: the demand template, the arrival rate and the run length each get an arm here, and each is
 * compared against the same selection with that one axis at its default. The negative control is
 * the one that makes the other three mean something — `freePlay: undefined` must be **byte-for-byte
 * identical** to the state that predates the field, or every published figure measured before it
 * has quietly changed.
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

const BUILDING_IDS = ['garden-apartments', 'midtown-office'] as const;

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
const base = (): ViewerState => ({
  ...initialState(resources, 20260804n),
  buildingId: 'garden-apartments',
  shiftLengthS: 900,
});

function legs(state: ViewerState): readonly (readonly [string, string, number])[] {
  const { config } = shiftRunConfigOf(resources, state);
  return recordRun(config, { recordDecisions: false }).recording.legs.map((leg) => [
    leg.passengerId,
    leg.carId ?? '',
    leg.boardedAt ?? -1,
  ]);
}

/** The legs as a comparable string. Legs, not a mean — that is the whole rule. */
function legsOf(state: ViewerState): string {
  return JSON.stringify(legs(state));
}

/* -------------------------------------------------------------------------- *
 * The negative control
 * -------------------------------------------------------------------------- */

describe('the field that was added', () => {
  it('changes nothing at all when Free Play has not been used', () => {
    // The state that predates `freePlay` is the state with it `undefined`, and `initialState` sets
    // it so. If this ever fails, every figure this repository published before the field existed
    // was measured on a different run than the one the code now produces.
    const before = base();
    const after = { ...before, freePlay: undefined };
    expect(legsOf(after)).toBe(legsOf(before));
    expect(JSON.stringify(shiftRunConfigOf(resources, after).config.demand)).toBe(
      JSON.stringify(shiftRunConfigOf(resources, before).config.demand),
    );
  });

  it('leaves the pattern select in charge when Free Play names no rate', () => {
    // `null` means "the building's own profile", which must be expressed by passing **no** rate —
    // not by reconstructing the profile's number. A reconstruction that rounded would be a
    // different run wearing the same name.
    const withNullRate = {
      ...base(),
      freePlay: { demandTemplateId: 'rise-and-fall', arrivalRatePctPop5min: null },
    };
    const { config } = shiftRunConfigOf(resources, withNullRate);
    expect(config.demand?.arrivalRatePctPop5min).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- *
 * The three axes
 * -------------------------------------------------------------------------- */

describe('every axis Free Play offers reaches the run', () => {
  it('the demand template changes the legs', () => {
    // Two hours, because `constant-iso` declares `durationMin: 120` and the kernel throws below it.
    // That constraint is the reason `freePlayIssues` grew a cross-field rule rather than letting a
    // player meet it at Start; here it just means the two arms are compared at a length both
    // templates accept.
    const at = (id: string): ViewerState => ({
      ...base(),
      shiftLengthS: 7200,
      freePlay: { demandTemplateId: id, arrivalRatePctPop5min: 6 },
    });
    const riseAndFall = at('rise-and-fall');
    const constantIso = at('constant-iso');
    // The template reaches the config...
    expect(shiftRunConfigOf(resources, constantIso).config.demandTemplate).toBe('constant-iso');
    // ...and the config reaches the traffic. A template that changed the field and not the legs
    // would be the exact defect this test exists for.
    expect(legsOf(constantIso)).not.toBe(legsOf(riseAndFall));
  });

  it('every template the catalogue offers is a template the run accepts', () => {
    // Derived from `data/`, not listed. A template that ships and cannot be run would be offered
    // in the menu and fail at Start, which is the worst place to find out (§ D213).
    for (const template of resources.trafficProfiles.demandTemplates) {
      const state = {
        ...base(),
        // Each at its own declared period. A run shorter than that is refused by `freePlayIssues`
        // in words, which `menu.test.ts` asserts; what is asserted here is that a run *at* it works.
        shiftLengthS: Math.max(900, template.durationMin * 60),
        freePlay: { demandTemplateId: template.id, arrivalRatePctPop5min: 6 },
      };
      expect(() => shiftRunConfigOf(resources, state), template.id).not.toThrow();
      expect(shiftRunConfigOf(resources, state).config.demandTemplate, template.id).toBe(template.id);
    }
    expect(resources.trafficProfiles.demandTemplates.length).toBeGreaterThanOrEqual(5);
  });

  it('the arrival rate changes the legs, and more traffic means more of them', () => {
    const light = { ...base(), freePlay: { demandTemplateId: 'rise-and-fall', arrivalRatePctPop5min: 3 } };
    const heavy = { ...base(), freePlay: { demandTemplateId: 'rise-and-fall', arrivalRatePctPop5min: 12 } };
    expect(legsOf(light)).not.toBe(legsOf(heavy));
    // Direction as well as difference. A rate wired to the wrong sign would pass the inequality
    // above and be exactly backwards.
    expect(legs(heavy).length).toBeGreaterThan(legs(light).length);
  });

  it('the run length changes the run, and a longer one serves more people', () => {
    const short = { ...base(), shiftLengthS: 300 };
    const long = { ...base(), shiftLengthS: 1800 };
    expect(shiftRunConfigOf(resources, long).config.durationS).toBe(1800);
    expect(legs(long).length).toBeGreaterThan(legs(short).length);
  });
});
