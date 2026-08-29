/** SCRATCH — issue #296 verification. Deleted before commit. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  COST_TERMS_BY_ID,
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
} from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import type { BrowserResources } from './resources.js';
import { initialState, profileById, shiftRunConfigOf, type ViewerState } from './state.js';
import { costFunctionLine, specIsDirty } from '../authoring/dispatcherSpec.js';
import { applyPlainLever, type PlainLeverId } from '../mode/plainLevers.js';
import { recordRun } from '../record/recordRun.js';

const DATA = new URL('../../../../data/', import.meta.url);
const read = (path: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, DATA)), 'utf8')) as unknown;

const BUILDING_IDS = ['midtown-office', 'garden-apartments'] as const;

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

/** The issue's own operating point: midtown-office, 900 s, seed 20260827, collective. */
function baseState(): ViewerState {
  const state = initialState(resources, 20260827n);
  return {
    ...state,
    buildingId: 'midtown-office',
    shiftLengthS: 900,
    dispatcherId: 'collective',
    editingDispatcherId: 'collective',
  };
}

/** The issue's own leg tuple, through the shipped path and nothing shorter. */
function legsOf(at: ViewerState): string {
  return JSON.stringify(
    recordRun(shiftRunConfigOf(resources, at).config, { recordDecisions: false }).recording.legs.map(
      (leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1, leg.arrivedAt ?? -1],
    ),
  );
}

/** The Everyday host's own write path — `host.ts#setPlainLever`, verbatim. */
function withLever(at: ViewerState, id: PlainLeverId, value: number | boolean): ViewerState {
  const applied = applyPlainLever(at.dispatcherSpec, at.levers, id, value);
  return { ...at, dispatcherSpec: applied.spec, levers: applied.levers };
}

describe('#296 — the four levers on the legs', () => {
  it('reports each lever', () => {
    const base = baseState();
    const control = legsOf(base);
    const rows: string[] = [];
    for (const [id, hi, lo] of [
      ['patience', 100, 0],
      ['room', 100, 0],
      ['spread', true, false],
      ['lobby', true, false],
    ] as [PlainLeverId, number | boolean, number | boolean][]) {
      const high = legsOf(withLever(base, id, hi));
      const low = legsOf(withLever(base, id, lo));
      rows.push(
        `${id.padEnd(9)} hi-vs-base=${high === control ? 'IDENTICAL' : 'CHANGED  '} ` +
          `hi-vs-lo=${high === low ? 'IDENTICAL' : 'CHANGED'}`,
      );
    }
    // eslint-disable-next-line no-console
    console.log(`legs in base run: ${String((JSON.parse(control) as unknown[]).length)}\n${rows.join('\n')}`);
    expect(rows.length).toBe(4);
  }, 240_000);

  it('reports the 13 weights and 3 flags driven to extremes', () => {
    const base = baseState();
    const control = legsOf(base);
    const termIds = [...COST_TERMS_BY_ID.keys()];
    const flags = base.dispatcherSpec.flags as unknown as Record<string, boolean>;
    const flagIds = Object.keys(flags);
    const allHigh: ViewerState = {
      ...base,
      dispatcherSpec: {
        ...base.dispatcherSpec,
        weights: Object.fromEntries(termIds.map((id) => [id, 100])) as never,
        flags: Object.fromEntries(flagIds.map((id) => [id, !flags[id]])) as never,
      },
    };
    const moved = legsOf(allHigh);
    // eslint-disable-next-line no-console
    console.log(
      `terms(${String(termIds.length)})=${termIds.join(',')}\nflags(${String(flagIds.length)})=${flagIds.join(',')}\n` +
        `all-weights-at-100 + all-flags-inverted vs base: ${moved === control ? 'IDENTICAL' : 'CHANGED'}\n` +
        `driving weights: ${JSON.stringify(shiftRunConfigOf(resources, allHigh).config.dispatcherProfile.weights)}\n` +
        `driving flags: ${JSON.stringify(shiftRunConfigOf(resources, allHigh).config.dispatcherProfile.flags)}\n` +
        `driving id/name: ${shiftRunConfigOf(resources, allHigh).config.dispatcherProfile.id}`,
    );
    expect(true).toBe(true);
  }, 240_000);

  it('reports each of the 13 terms and each of the 3 flags one at a time', () => {
    const base = baseState();
    const control = legsOf(base);
    const moved: string[] = [];
    const inert: string[] = [];
    for (const termId of COST_TERMS_BY_ID.keys()) {
      const at: ViewerState = {
        ...base,
        dispatcherSpec: {
          ...base.dispatcherSpec,
          weights: { ...base.dispatcherSpec.weights, [termId]: 100 },
        },
      };
      (legsOf(at) === control ? inert : moved).push(termId);
    }
    const flags = base.dispatcherSpec.flags as unknown as Record<string, boolean>;
    for (const key of Object.keys(flags)) {
      const at: ViewerState = {
        ...base,
        dispatcherSpec: { ...base.dispatcherSpec, flags: { ...base.dispatcherSpec.flags, [key]: !flags[key] } },
      };
      (legsOf(at) === control ? inert : moved).push(`flags.${key}`);
    }
    // eslint-disable-next-line no-console
    console.log(`MOVED THE LEGS (${String(moved.length)}): ${moved.join(', ') || '(none)'}\nINERT (${String(inert.length)}): ${inert.join(', ')}`);
    expect(true).toBe(true);
  }, 300_000);

  it('shows the printed cost expression DOES move — the window statistic the browser test asserts on', () => {
    const base = baseState();
    const withPatience = withLever(base, 'patience', 64);
    // eslint-disable-next-line no-console
    console.log(
      `printed line, base:      ${costFunctionLine(base.dispatcherSpec, (id) => id)}\n` +
        `printed line, patience=64: ${costFunctionLine(withPatience.dispatcherSpec, (id) => id)}\n` +
        `DRIVING weights, base:      ${JSON.stringify(shiftRunConfigOf(resources, base).config.dispatcherProfile.weights)}\n` +
        `DRIVING weights, patience=64: ${JSON.stringify(shiftRunConfigOf(resources, withPatience).config.dispatcherProfile.weights)}`,
    );
    expect(true).toBe(true);
  }, 120_000);

  it('reports what workingCopyIsDirty() answers for each lever', () => {
    const base = baseState();
    const source = profileById(resources, [], 'collective');
    const control = legsOf(base);
    const rows: string[] = [];
    for (const [id, value] of [
      ['patience', 100],
      ['room', 100],
      ['spread', true],
      ['lobby', true],
    ] as [PlainLeverId, number | boolean][]) {
      const at = withLever(base, id, value);
      // `workshopScreen.ts#workingCopyIsDirty`, verbatim: rules non-empty, or the spec is dirty.
      const dirty = at.ruleRows.length > 0 || specIsDirty(at.dispatcherSpec, source);
      const travels = legsOf(at) !== control;
      rows.push(
        `${id.padEnd(9)} travels=${String(travels).padEnd(5)} barSays=${
          dirty ? '"Unsaved changes travel with the run."' : '"Nothing changed yet."     '
        }  ${travels === dirty ? 'AGREES' : '*** BAR IS WRONG ***'}`,
      );
    }
    // eslint-disable-next-line no-console
    console.log(rows.join('\n'));
    expect(rows.length).toBe(4);
  }, 240_000);
});
