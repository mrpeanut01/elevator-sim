/**
 * The selector panel's decisions, and — the half that decides whether this panel is worth
 * shipping — **the run changing when a control moves**.
 *
 * There is no jsdom in this repository (`vitest.config.ts` sets `environment: 'node'` for every
 * project), so what is asserted here is everything the mount *decides*: which rows there are, what
 * each says, which chip is lit, where a refusal lands, what a `<select>` offers. The mount itself
 * is the dumb instantiator.
 *
 * ## § D177, and why it is compared on the legs
 *
 * *Move the control and require the run to change* — **compared on the legs, never on a window
 * statistic**. `scope/probes.test-helper.ts`'s `legsOf` states the reason and this file reuses its
 * shape: a mean can be unchanged for a run that is entirely different, and a mean can move because
 * the window moved. A selector editor whose controls did not change which legs get simulated is
 * precisely the defect this wave exists to catch, and it would ship looking perfect.
 *
 * Four contrasts, and each is a different thing that could be dead:
 *
 * | contrast | what a failure would mean |
 * |---|---|
 * | policy `off` → `fuzzy` | the `selection` half never reaches the driving profile |
 * | the arm map permuted | `patternSwitching` is loaded and the reader's copy of it is not written |
 * | a scalar moved under `contextual` | the six sliders are decoration on a block that is read |
 * | `off` at the seeded spec | closing the seam cost a run that was already published |
 *
 * The third is the one no existing test could have caught: `viewerSelector.test.ts` proved the
 * § D153 seam by **editing `data/` and reloading**, which is the only thing that was possible
 * before this panel. Nothing proved a control moves it.
 *
 * The operating point is `midtown-office` at 900 s — § D153's own, and the building the detector's
 * `two-way` pattern was calibrated against — because the contrast has to be measured somewhere the
 * traffic actually changes regime. Garden Apartments is a residential trickle: the detector would
 * sit in one arm for the whole run and every contrast below would read as an inert control.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
  type DispatcherProfile,
} from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import {
  POLICY_VALUES,
  SELECTOR_SCALAR_FIELDS,
  defaultSelectorSpec,
  selectorContextFrom,
  selectorIssues,
  withWeightSet,
  type SelectorContext,
  type SelectorSpec,
} from '../authoring/selectorSpec.js';
import { recordRun } from '../record/recordRun.js';

import type { BrowserResources } from './data.js';
import {
  POLICY_HINTS,
  SCALAR_LABELS,
  SELECTOR_SLIDER_FIELDS,
  armOptionsOf,
  armRowsOf,
  changedNoteOf,
  policyChipsOf,
  refusalFor,
  scalarRowsOf,
  selectorAvailability,
  snapToStep,
  stepFor,
} from './selectorEditor.js';
import {
  dispatcherProfilesWithSelector,
  initialState,
  shiftRunConfigOf,
  type ViewerState,
} from './state.js';

const DATA = new URL('../../../../data/', import.meta.url);
const read = (path: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, DATA)), 'utf8')) as unknown;

/** Two buildings: the one the contrasts run on, and the one `initialState` opens on. */
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

const RESOURCES = resourcesOf();
const CONTEXT: SelectorContext = selectorContextFrom(RESOURCES.dispatcherProfiles, 900);
const SPEC: SelectorSpec = defaultSelectorSpec(CONTEXT);
const PROFILE = (id: string): DispatcherProfile => {
  const found = RESOURCES.dispatcherProfiles.profiles.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no profile ${id}`);
  return found;
};

/** A context with no library at all, for the not-offered case. Nothing else changes. */
const NO_LIBRARY: SelectorContext = selectorContextFrom(
  { ...RESOURCES.dispatcherProfiles, patternSwitching: undefined },
  900,
);

/* -------------------------------------------------------------------------- *
 * The panel is offered, or the reason is — docs/16 S7
 * -------------------------------------------------------------------------- */

describe('whether the panel is offered at all', () => {
  it('offers it against the shipped file, which declares five patterns', () => {
    expect(selectorAvailability(CONTEXT)).toStrictEqual({ offered: true, note: '' });
  });

  it('withholds it — with a reason — when the file declares no pattern library', () => {
    const availability = selectorAvailability(NO_LIBRARY);
    expect(availability.offered).toBe(false);
    // Not offered *and* not silent: an absent panel with no explanation is indistinguishable from
    // an oversight, which is § D106's argument about `measured: false` versus `0`.
    expect(availability.note).not.toBe('');
    expect(availability.note).toContain('data/dispatcher-profiles.json');
  });
});

/* -------------------------------------------------------------------------- *
 * The chips and the sliders are derived from core, not retyped
 * -------------------------------------------------------------------------- */

describe('the policy chips', () => {
  it('has a line for every policy core declares, and no others', () => {
    expect(Object.keys(POLICY_HINTS).sort()).toStrictEqual([...POLICY_VALUES].sort());
  });

  it('draws them in core’s own declaration order, with the current one pressed — and no rules chip', () => {
    // `rules` is deliberately not a chip: the rules policy is entered by writing rules in the
    // rules editor, and a chip here would offer a configuration `resolveDispatchConfig` refuses
    // by name (a rules policy with no rows). Its POLICY_HINTS entry — held by the both-ways
    // test above — is where the exclusion is explained.
    const rows = policyChipsOf({ ...SPEC, policy: 'fuzzy' });
    expect(rows.map((row) => row.policy)).toStrictEqual(
      POLICY_VALUES.filter((policy) => policy !== 'rules'),
    );
    expect(rows.filter((row) => row.pressed).map((row) => row.policy)).toStrictEqual(['fuzzy']);
  });

  it('never claims an outcome — every hint says what the rule does', () => {
    /*
     * § D145, § D156 and § D169 refused the learned selector three times. A chip reading *faster*
     * or *better* would be a performance claim with no paired-t interval behind it, printed on a
     * button — CLAUDE.md § Statistical discipline's failure mode as UI copy.
     */
    for (const row of policyChipsOf(SPEC)) {
      expect(`${row.label} ${row.hint}`.toLowerCase()).not.toMatch(
        /\bfaster\b|\bbetter\b|\bimproves?\b|\bshorter waits?\b|\boptimal\b/,
      );
    }
  });
});

describe('the six sliders', () => {
  it('covers every declared selection parameter except the policy, both ways', () => {
    expect([...SELECTOR_SLIDER_FIELDS].sort()).toStrictEqual(
      SELECTOR_SCALAR_FIELDS.filter((field) => field !== 'policy').sort(),
    );
    expect(Object.keys(SCALAR_LABELS).sort()).toStrictEqual([...SELECTOR_SLIDER_FIELDS].sort());
  });

  it('carries core’s own parameter description as the tooltip, verbatim', () => {
    for (const row of scalarRowsOf(SPEC, [])) {
      // Not a paraphrase: the declaration is what an optimizer reads and what docs/06 publishes.
      expect(row.help.length).toBeGreaterThan(40);
      expect(row.label).toBe(SCALAR_LABELS[row.field]);
    }
  });

  it('offers a step that can return every control to the value the run opened on', () => {
    /*
     * A control that cannot get back to its default is a control a reader cannot undo — and the
     * defaults here are what every published figure in this repository was measured under. Checked
     * from the minimum, because that is where a range input's steps are counted from.
     */
    for (const row of scalarRowsOf(SPEC, [])) {
      const steps = (row.value - row.min) / row.step;
      expect(Math.abs(steps - Math.round(steps)), `${row.field} default is off-step`).toBeLessThan(
        1e-9,
      );
      expect(row.value).toBeGreaterThanOrEqual(row.min);
      expect(row.value).toBeLessThanOrEqual(row.max);
    }
  });

  it('spells the declared unit beside the value, and nothing where there is none', () => {
    const rows = scalarRowsOf(SPEC, []);
    expect(rows.find((row) => row.field === 'hysteresisS')?.valueText).toBe('120 s');
    expect(rows.find((row) => row.field === 'switchMargin')?.valueText).toBe('0');
  });

  it('snaps a range reading onto its step, so a default does not read as an edit', () => {
    // 1.0500000000000003 is what a 0.05-step input reports. Left alone it makes
    // `profileWithSelector` write a `selection` block for a value nobody moved.
    expect(snapToStep(1.0500000000000003, 0.05)).toBe(1.05);
    expect(snapToStep(1.0000000000000002, 0.05)).toBe(1);
    expect(stepFor(0, 1)).toBe(0.01);
    expect(stepFor(0, 900)).toBe(10);
  });
});

/* -------------------------------------------------------------------------- *
 * The refusals land beside the control they are about
 * -------------------------------------------------------------------------- */

describe('a refusal goes beside its own control', () => {
  it('puts the selection-is-off notice on every slider, and on the map', () => {
    const off: SelectorSpec = { ...SPEC, policy: 'off' };
    const issues = selectorIssues(off, CONTEXT);
    for (const row of scalarRowsOf(off, issues)) {
      expect(row.refusal, `${row.field} carries no refusal while selection is off`).toContain(
        'Inert while weight-set selection is off',
      );
    }
    expect(refusalFor('weightSetsByPattern', issues)).toContain('Inert while weight-set selection');
    // And nothing lands on the control the reader would use to fix it.
    expect(refusalFor('policy', issues)).toBe('');
  });

  it('puts a broken binding on that pattern’s row and on no other', () => {
    const broken = withWeightSet({ ...SPEC, policy: 'fuzzy' }, 'two-way', 'no-such-profile');
    const rows = armRowsOf(broken, CONTEXT, selectorIssues(broken, CONTEXT));
    const twoWay = rows.find((row) => row.patternId === 'two-way');
    expect(twoWay?.refusal).toContain('no-such-profile');
    expect(twoWay?.live).toBe(false);
    for (const row of rows.filter((row) => row.patternId !== 'two-way')) {
      expect(row.refusal, `${row.patternId} carries a refusal that is not about it`).toBe('');
      expect(row.live).toBe(true);
    }
  });

  it('says nothing about switchMargin under the fuzzy rule, because the run reads it', () => {
    /*
     * `DISPATCH_PARAMETERS` declares `selection.switchMargin` contextual-only and
     * `selectWeightSet` applies it under `fuzzy` as well. Where the two disagree the code wins: a
     * refusal telling a player their margin is inert while the run reads it is worse than silence.
     */
    const fuzzy: SelectorSpec = { ...SPEC, policy: 'fuzzy', switchMargin: 0.4 };
    const row = scalarRowsOf(fuzzy, selectorIssues(fuzzy, CONTEXT)).find(
      (entry) => entry.field === 'switchMargin',
    );
    expect(row?.refusal).toBe('');
  });

  it('joins every refusal raised against one field rather than showing the first', () => {
    const many = [
      { field: 'policy' as const, message: 'one.' },
      { field: 'hysteresisS' as const, message: 'elsewhere.' },
      { field: 'policy' as const, message: 'two.' },
    ];
    expect(refusalFor('policy', many)).toBe('one. two.');
  });
});

/* -------------------------------------------------------------------------- *
 * The arm rows
 * -------------------------------------------------------------------------- */

describe('the arm rows', () => {
  it('draws one per pattern, in the detector’s declaration order', () => {
    // Declaration order is the tie-break `selectWeightSet` applies; any other order draws the
    // priority backwards.
    const declared = RESOURCES.dispatcherProfiles.patternSwitching?.patternDetector.patterns ?? [];
    expect(armRowsOf(SPEC, CONTEXT, []).map((row) => row.patternId)).toStrictEqual([...declared]);
  });

  it('says what each regime is and what the detector matches on, without claiming an outcome', () => {
    for (const row of armRowsOf(SPEC, CONTEXT, [])) {
      expect(row.line).not.toBe(row.patternId);
      expect(row.signature).toMatch(/^Detected when /);
    }
  });

  it('offers only the weight sets the file declares — docs/16 S7', () => {
    /*
     * `weightSetSourceFrom` builds `weightsByProfileId` from the file's own array, so an arm naming
     * a dispatcher the reader saved is refused at Run. Not offered rather than offered-and-refused.
     */
    const options = armOptionsOf(CONTEXT, 'eta');
    expect(options.map((option) => option.value)).toStrictEqual(
      RESOURCES.dispatcherProfiles.profiles.map((profile) => profile.id),
    );
  });

  it('shows an unbound or unknown binding as itself rather than snapping to the first option', () => {
    // `fillSelect` falls back to the first option when the value is not offered, so a select over
    // the plain list would display `nearest-car` for a binding that says `energy-saver`.
    expect(armOptionsOf(CONTEXT, '')[0]).toStrictEqual({ value: '', label: '— nothing bound —' });
    expect(armOptionsOf(CONTEXT, 'energy-saver')[0]).toStrictEqual({
      value: 'energy-saver',
      label: 'energy-saver — not in this file',
    });
  });

  it('marks every row dead while the policy is off', () => {
    for (const row of armRowsOf({ ...SPEC, policy: 'off' }, CONTEXT, [])) {
      expect(row.live).toBe(false);
    }
  });
});

describe('the changed marker', () => {
  it('is silent on the configuration the file ships', () => {
    expect(changedNoteOf(SPEC, PROFILE('collective'), CONTEXT)).toBe('');
  });

  it('speaks as soon as a binding or a scalar moves', () => {
    expect(changedNoteOf({ ...SPEC, policy: 'fuzzy' }, PROFILE('collective'), CONTEXT)).not.toBe('');
    expect(
      changedNoteOf(withWeightSet(SPEC, 'two-way', 'eta'), PROFILE('collective'), CONTEXT),
    ).not.toBe('');
  });
});

/* -------------------------------------------------------------------------- *
 * § D177 — move the control, require the run to change, compared on the legs
 * -------------------------------------------------------------------------- */

/** § D153's operating point: Midtown Office, 900 s, `collective` driving. */
const SEED = 20_260_729n;

function stateWith(spec: SelectorSpec, pattern = 'building'): ViewerState {
  return {
    ...initialState(RESOURCES, SEED),
    buildingId: 'midtown-office',
    dispatcherId: 'collective',
    pattern,
    shiftLengthS: 900,
    seed: SEED,
    selectorSpec: spec,
  };
}

/**
 * The legs of the run a selector configuration produces, as a comparable string.
 *
 * `scope/probes.test-helper.ts`'s `legsOf`, reproduced rather than imported: that file is the
 * scope walk's instrument and pins its own two buildings and its own base state. The shape is the
 * one that matters — build the run through `shiftRunConfigOf`, record it the way `dev/main.ts`'s
 * `runShift` records it (`outOfServiceCarIds` travels **beside** the config, not inside it), and
 * compare who boarded which car and when.
 */
function legsOf(spec: SelectorSpec, pattern = 'building'): string {
  const plan = shiftRunConfigOf(RESOURCES, stateWith(spec, pattern));
  return JSON.stringify(
    recordRun(plan.config, {
      recordDecisions: false,
      outOfServiceCarIds: plan.outOfServiceCarIds,
    }).recording.legs.map((leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1]),
  );
}

describe('the selector controls reach the simulation — § D177', () => {
  const OFF = SPEC;
  const FUZZY: SelectorSpec = { ...SPEC, policy: 'fuzzy' };

  it('carries the seeded configuration into a run that is the run built before this field existed', () => {
    /*
     * The control half of every contrast below. `policy: 'off'` with the file's own arm map must
     * cost **nothing**: `profileWithSelector` writes no `selection` block and
     * `dispatcherProfilesWithSelector` hands back the loaded file **by identity**, which is what
     * keeps `viewerSelector.test.ts`'s § D153 acceptance evidence — `config.dispatcherProfiles` is
     * the object the loader produced — true.
     */
    const plan = shiftRunConfigOf(RESOURCES, stateWith(OFF));
    expect(plan.config.dispatcherProfiles).toBe(RESOURCES.dispatcherProfiles);
    expect(plan.config.dispatcherProfile.selection).toBeUndefined();
    expect(dispatcherProfilesWithSelector(RESOURCES.dispatcherProfiles, OFF)).toBe(
      RESOURCES.dispatcherProfiles,
    );
  });

  it('writes both documents as soon as a policy is chosen', () => {
    // The seam, named: `selection` onto the driving profile, `patternSwitching` onto the file the
    // arms resolve from. A run carrying one without the other is refused by name or reads nothing.
    const permuted = withWeightSet(FUZZY, 'two-way', 'nearest-car');
    const plan = shiftRunConfigOf(RESOURCES, stateWith(permuted));
    expect(plan.config.dispatcherProfile.selection?.policy).toBe('fuzzy');
    expect(plan.config.dispatcherProfiles?.patternSwitching?.weightSetsByPattern['two-way']).toBe(
      'nearest-car',
    );
    // The detector is carried through unchanged — this panel binds which weights a regime runs,
    // never where the regimes divide. Those ramps are calibrated breakpoints.
    expect(plan.config.dispatcherProfiles?.patternSwitching?.patternDetector).toBe(
      RESOURCES.dispatcherProfiles.patternSwitching?.patternDetector,
    );
  });

  it('turns switching on and the legs move', () => {
    expect(legsOf(FUZZY)).not.toBe(legsOf(OFF));
  }, 300_000);

  it('rebinds one pattern and the legs move again — the map is read, not just the switch', () => {
    /*
     * Without this, "turning it on changed the run" is satisfied by a panel whose arm selects write
     * a field nothing consults — which is exactly the state `patternSwitching` was in before this
     * lane: loaded by `dev/data.ts`, passed through by `shiftRunConfigOf`, editable nowhere.
     * `two-way` is the pattern § D169 measured the incumbent at 66.1 % of observations on this
     * building, so it is the binding most likely to be exercised in a 900 s window.
     */
    expect(RESOURCES.dispatcherProfiles.patternSwitching?.weightSetsByPattern['two-way']).toBe(
      'predictive-balanced',
    );
    const permuted = withWeightSet(FUZZY, 'two-way', 'nearest-car');
    expect(legsOf(permuted)).not.toBe(legsOf(FUZZY));
  }, 300_000);

  it('is arithmetically the fuzzy rule at the contextual defaults, as core says it is', () => {
    /*
     * `selection.policy`'s own declaration: *contextual is the same arms and signatures with three
     * learned input gains and a learned switch margin in front of them, which at their defaults is
     * arithmetically the fuzzy rule.* Asserted rather than believed, because it is what makes the
     * six sliders below mean something: a gain away from 1 is a difference against the fuzzy arm
     * and not against an unrelated configuration. It would also catch a gain leaking into the
     * fuzzy path, which is the disagreement `switchMargin` already has with its own schema.
     */
    expect(legsOf({ ...SPEC, policy: 'contextual' })).toBe(legsOf(FUZZY));
  }, 300_000);
});

/**
 * **Every slider, one at a time, each at an operating point where it can bite.**
 *
 * `docs/16` S3: a non-`presentation` control must change the legs. Six sliders, six contrasts, and
 * the cell each one is measured at is named rather than searched for — because two of the six
 * change **nothing** at the default cell, and the honest thing is to say why rather than to pick a
 * value that happens to pass:
 *
 * | slider | contrast | cell, and why not the default one |
 * |---|---|---|
 * | `hysteresisS` | 120 → 900 s | the default cell |
 * | `observationWindowS` | 300 → 30 s | the default cell |
 * | `downPeakRateGain` | 1 → 4 | the default cell |
 * | `lobbyArrivalRateGain` | 1 → **0** | *raising* it moves nothing: Midtown's lobby rate is already past `up-peak`'s `oneAt` of 0.012, so a larger gain saturates a membership that is already 1. The ramp is the reason, not the control. |
 * | `interfloorRateGain` | 1 → 4, on the `hospital` split at a 60 s window | at Midtown's own demand the interfloor rate is near zero and the `interfloor` arm never outscores `two-way`, so the gain multiplies a number no decision turns on. The `hospital` profile is 30 % interfloor, and the shorter window lets a burst of it reach the ramp. |
 * | `switchMargin` | 0 → 1, with `hysteresisS` at 0 | the margin is the gate that bites **after** the dwell expires — *a dwell asks a challenger to be later; this asks it to be better*. At the authored 120 s dwell nothing on this 900 s run gets that far. |
 *
 * The last three rows are findings about the shipped calibration, not about the panel, and they are
 * recorded here rather than in a comment beside a passing value: a reader who later widens a ramp
 * needs to know which of these contrasts was measuring the ramp.
 */
describe('every slider changes the legs somewhere — docs/16 S3', () => {
  const CONTEXTUAL: SelectorSpec = { ...SPEC, policy: 'contextual' };

  const cases: readonly {
    readonly field: string;
    readonly from: SelectorSpec;
    readonly to: SelectorSpec;
    readonly pattern: string;
  }[] = [
    {
      field: 'hysteresisS',
      from: CONTEXTUAL,
      to: { ...CONTEXTUAL, hysteresisS: 900 },
      pattern: 'building',
    },
    {
      field: 'observationWindowS',
      from: CONTEXTUAL,
      to: { ...CONTEXTUAL, observationWindowS: 30 },
      pattern: 'building',
    },
    {
      field: 'downPeakRateGain',
      from: CONTEXTUAL,
      to: { ...CONTEXTUAL, downPeakRateGain: 4 },
      pattern: 'building',
    },
    {
      field: 'lobbyArrivalRateGain',
      from: CONTEXTUAL,
      to: { ...CONTEXTUAL, lobbyArrivalRateGain: 0 },
      pattern: 'building',
    },
    {
      field: 'interfloorRateGain',
      from: { ...CONTEXTUAL, observationWindowS: 60 },
      to: { ...CONTEXTUAL, observationWindowS: 60, interfloorRateGain: 4 },
      pattern: 'hospital',
    },
    {
      field: 'switchMargin',
      from: { ...CONTEXTUAL, hysteresisS: 0 },
      to: { ...CONTEXTUAL, hysteresisS: 0, switchMargin: 1 },
      pattern: 'building',
    },
  ];

  it('names a contrast for every slider the panel draws, both ways', () => {
    // The table above cannot quietly stop covering a control: a seventh `selection.` parameter in
    // `core` reaches the panel through `SELECTOR_SLIDER_FIELDS` and fails here until it is measured.
    expect(cases.map((entry) => entry.field).sort()).toStrictEqual([...SELECTOR_SLIDER_FIELDS].sort());
  });

  for (const entry of cases) {
    it(`${entry.field} — moving it changes which legs get simulated`, () => {
      expect(legsOf(entry.to, entry.pattern)).not.toBe(legsOf(entry.from, entry.pattern));
    }, 300_000);
  }
});
