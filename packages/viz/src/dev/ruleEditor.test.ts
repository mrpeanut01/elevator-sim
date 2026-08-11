/**
 * The rules editor's pure halves, and the seam to a run.
 *
 * The mount itself is DOM and is excluded from the honesty derivation with the other editor
 * mounts; what this file drives is everything the mount decides *with* — the select options,
 * the per-row refusal strings — plus the two seams that make the panel a control rather than a
 * decoration: `shiftRunConfigOf` carries the rows onto the driving profile (and carries nothing,
 * by object identity, when the list is empty), and a rules run's switches land in the recording
 * under the rule's provenance id, which the stage header names in the player's words.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  RULE_ACTIONS,
  RULE_CONDITIONS,
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
} from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import { patternReadoutAt } from '../live/patternReadout.js';
import { recordRun } from '../record/recordRun.js';

import type { BrowserResources } from './data.js';
import {
  actionOptions,
  conditionOptions,
  rowRefusalOf,
  thenValueOptions,
  whenValueOptions,
} from './ruleEditor.js';
import { rulesOverrideNoteOf } from './selectorEditor.js';
import { initialState, shiftRunConfigOf } from './state.js';

const DATA = new URL('../../../../data/', import.meta.url);
const read = (path: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, DATA)), 'utf8')) as unknown;

function resourcesOf(): BrowserResources {
  const elevatorSpecs = parseElevatorSpecs(read('elevator-specs.json'));
  const entries = ['garden-apartments', 'midtown-office'].map((id) => {
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

describe('the pure view models', () => {
  it('offers exactly the declared vocabulary — the two refused actions are not rows here', () => {
    expect(conditionOptions().map((option) => option.id)).toEqual([...RULE_CONDITIONS]);
    expect(actionOptions().map((option) => option.id)).toEqual([...RULE_ACTIONS]);
    const ids = actionOptions().map((option) => option.id);
    expect(ids).not.toContain('skip-above');
    expect(ids).not.toContain('urgent-up-calls');
  });

  it('labels a select option with the template, an ellipsis where the value goes', () => {
    const waited = conditionOptions().find((option) => option.id === 'call-waited');
    expect(waited?.label).toBe('a call has waited …');
    // Never the raw placeholder on screen.
    for (const option of [...conditionOptions(), ...actionOptions()]) {
      expect(option.label).not.toContain('{v}');
    }
  });

  it('offers the declared value list per id, and none for a valueless one', () => {
    expect(whenValueOptions('call-waited').map((option) => option.value)).toEqual([
      30, 45, 60, 90, 120,
    ]);
    expect(whenValueOptions('shaft-out')).toEqual([]);
    expect(thenValueOptions('park-at-floor').map((option) => option.label)).toEqual([
      'the lobby',
      'floor 5',
      'floor 7',
      'floor 9',
      'the top floor',
    ]);
  });

  it('joins every refusal raised against one row, and only that row’s', () => {
    const issues = [
      { field: 'rows.0.when', message: 'first.' },
      { field: 'rows.0.then', message: 'second.' },
      { field: 'rows.1.when', message: 'other row.' },
    ];
    expect(rowRefusalOf(0, issues)).toBe('first. second.');
    expect(rowRefusalOf(1, issues)).toBe('other row.');
    expect(rowRefusalOf(2, issues)).toBe('');
  });

  it('tells the switching panel when written rules take the run, and is silent otherwise', () => {
    expect(rulesOverrideNoteOf(0)).toBe('');
    expect(rulesOverrideNoteOf(2)).toContain('2 Everyday rules');
    expect(rulesOverrideNoteOf(1)).toContain('not');
  });
});

describe('the rows reach a run', () => {
  it('carries the rows onto the driving profile, and carries nothing by identity when empty', () => {
    const state = initialState(resources, 20260811n);
    const empty = shiftRunConfigOf(resources, { ...state, shiftLengthS: 300 });
    expect(empty.config.dispatcherProfile.rules).toBeUndefined();

    const ruled = shiftRunConfigOf(resources, {
      ...state,
      shiftLengthS: 300,
      ruleRows: [{ when: 'day-period', whenValue: 'morning-rush', then: 'hold-at-lobby' }],
    });
    expect(ruled.config.dispatcherProfile.selection?.policy).toBe('rules');
    expect(ruled.config.dispatcherProfile.rules?.rows).toEqual([
      { when: 'day-period', whenValue: 'morning-rush', then: 'hold-at-lobby' },
    ]);
  });

  it('records a rules run’s switches under the rule’s provenance id, and the header names it in player words', () => {
    /*
     * The S4b readout, extended to rules — the task's rule-11 verification. Garden Apartments
     * at 300 s under the default rise-and-fall (startOfDayS 08:30), with a rule whose morning
     * window covers the whole run: the arm takes the run at the first decision, the recording's
     * `patternSwitches` carries `rule-1:day-period:morning-rush`, and `patternReadoutAt` renders
     * the rule's words from the same core table the editor draws — never the raw id.
     */
    const state = initialState(resources, 20260811n);
    const plan = shiftRunConfigOf(resources, {
      ...state,
      buildingId: 'garden-apartments',
      shiftLengthS: 300,
      ruleRows: [{ when: 'day-period', whenValue: 'morning-rush', then: 'hold-at-lobby' }],
    });
    const { recording } = recordRun(plan.config);
    const switches = recording.patternSwitches ?? [];
    expect(switches.length).toBeGreaterThan(0);
    expect(switches[0]?.patternId).toBe('rule-1:day-period:morning-rush');

    const readout = patternReadoutAt(recording, switches[0]!.atS);
    expect(readout.kind).toBe('pattern');
    expect(readout.label).toBe('rule 1 — the day is in the morning rush');
    expect(readout.label).not.toContain('rule-1:');
  }, 120_000);
});
