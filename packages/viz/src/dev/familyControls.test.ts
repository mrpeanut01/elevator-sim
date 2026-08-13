/**
 * The family controls — `docs/21-engineer-reimagined-contract.md` § 3.6, and the acceptance
 * evidence § 5's B4 entry asks for.
 *
 * Four claims, in the order they have to hold:
 *
 * 1. **The partition is total, both ways.** Every dimension `collectSearchSpace()` declares is a
 *    control in a family, one of the thirteen weight sliders, a flag the panel already draws, or
 *    the one refusal — and nothing is in two of those at once. § 3.6's *every dimension the space
 *    declares is either a control or a named refusal beside it*, as a property rather than a habit.
 * 2. **The overrides are neither short nor long.** `profileFromSpec` writes six fields from the
 *    flags and the dwell chips *after* the family patch. `familyOverridesOf` claims to name exactly
 *    those; this runs the conversion over every flag and lever combination on four bases and
 *    requires the claim to match what the conversion actually did. § D227 in both polarities: a
 *    control that writes nothing must say so, and a control that writes something may not claim it
 *    does not.
 * 3. **Move the control and the run changes, compared on the legs** — § D177, per family, through
 *    the shipped path (`profileFromSpec` → `savedDispatchers` → `drivingProfileOf` →
 *    `shiftRunConfigOf` → `recordRun`) rather than through a fixture that routes past it.
 * 4. **The negative pin, and it is the one where identity is correct.** Re-authoring a shipped
 *    profile's exact values must produce a **bit-identical** run — that is the case where sameness
 *    is the right answer, and it is stated as such because CLAUDE.md's rule is that a bit-identical
 *    result anywhere else is a wiring bug until proven otherwise. Claim 3 is what proves it is not
 *    one here: the same apparatus, moved, does change the legs.
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
import {
  candidateFromProfile,
  collectSearchSpace,
  isActive,
  readerFor,
  type ParameterValue,
  type SearchSpace,
} from '@elevator-sim/experiments/browser';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LEVERS,
  DWELL_CHOICES,
  profileFromSpec,
  specFromProfile,
  specIsDirty,
  type DispatcherSpec,
  type DwellChoice,
  type GroupLevers,
} from '../authoring/dispatcherSpec.js';
import { valuesFromProfile } from '../controls/editedProfile.js';

import type { BrowserResources } from './data.js';
import { unauthorableBlocksOf } from './dispatcherEditor.js';
import {
  FAMILY_CALLERS,
  FAMILY_DIMENSIONS,
  FAMILY_ORDER,
  FAMILY_TITLES,
  FLAG_OWNED,
  REFUSED_SECTION,
  SELECTION_REFUSAL,
  WEIGHTS_SECTION,
  familyControlsViewOf,
  familyOverridesOf,
  familyPartitionOf,
  familyValuesOf,
  prunedFamilyMoves,
  type DispatcherFamily,
} from './familyControls.js';
import { initialState, profileById, shiftRunConfigOf, type ViewerState } from './state.js';
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
const space: SearchSpace = collectSearchSpace();
const baseState = (): ViewerState => initialState(resources, 20260812n);
const shipped = (id: string): DispatcherProfile => profileById(resources, [], id);

/* -------------------------------------------------------------------------- *
 * 1 — the partition
 * -------------------------------------------------------------------------- */

describe('every declared dimension is a control or a named refusal — docs/21 § 3.6', () => {
  it('accounts for every id of the space, and for no id twice', () => {
    const partition = familyPartitionOf(space);
    expect(
      partition.unaccounted,
      'a dimension core declares is drawn by no control and named by no refusal — that is the ' +
        'silent partial editor this block exists to close, arriving through a schema change',
    ).toEqual([]);

    const seen = [
      ...partition.authored,
      ...partition.weights,
      ...partition.flagOwned,
      ...partition.refused,
    ];
    expect(new Set(seen).size).toBe(seen.length);
    expect([...seen].sort()).toEqual([...space.ids].sort());
  });

  it('names only dimensions the space actually declares', () => {
    for (const [family, ids] of Object.entries(FAMILY_DIMENSIONS)) {
      for (const id of ids) {
        expect(space.byId.has(id), `${family} claims ${id}, which the space does not declare`).toBe(
          true,
        );
      }
    }
    for (const id of FLAG_OWNED) expect(space.byId.has(id)).toBe(true);
  });

  it('draws every family, in order, each with a title and a caller', () => {
    expect([...FAMILY_ORDER].sort()).toEqual(Object.keys(FAMILY_DIMENSIONS).sort());
    for (const family of FAMILY_ORDER) {
      expect(FAMILY_TITLES[family]).not.toBe('');
      expect(FAMILY_CALLERS[family]).not.toBe('');
    }
  });

  /**
   * The hand-written half is three sections, and this is what holds it to three.
   *
   * `dispatch`, `answer` and `idle` are each read by a reader as more than one thing — registration
   * against reassignment, the load cell against the door machine, where a car parks against how the
   * forecast is learnt — so each is split, and the register named some of those splits before this
   * module existed. Every **other** section is exactly one family, whole and in both directions, so
   * a dimension added to `core` under `auction`, `eligibility`, `constraints` or `normalization`
   * lands in a block by itself or turns this red.
   */
  it('splits three sections and owns every other one whole', () => {
    const split: Readonly<Record<string, readonly DispatcherFamily[]>> = {
      dispatch: ['timing', 'zoning', 'panel', 'reassignment'],
      answer: ['load', 'doors', 'constraints'],
      idle: ['parking', 'forecast'],
    };
    const sectionsOf = (family: DispatcherFamily): ReadonlySet<string> =>
      new Set(FAMILY_DIMENSIONS[family].map((id) => space.byId.get(id)?.section ?? ''));

    // Every split section is covered by its families plus whatever is flag-owned or refused — no
    // dimension of a split section falls between two families.
    const flagOwned = new Set(FLAG_OWNED);
    for (const [section, families] of Object.entries(split)) {
      const claimed = new Set(families.flatMap((family) => [...FAMILY_DIMENSIONS[family]]));
      const declared = space.parameters
        .filter((parameter) => parameter.section === section)
        .map((parameter) => parameter.id);
      for (const id of declared) {
        expect(claimed.has(id) || flagOwned.has(id), `${id} is in no family and in no flag`).toBe(
          true,
        );
      }
    }

    // And every unsplit family is exactly its own section.
    const splitFamilies = new Set(Object.values(split).flat());
    for (const family of FAMILY_ORDER) {
      if (splitFamilies.has(family)) continue;
      const sections = [...sectionsOf(family)];
      expect(sections).toHaveLength(1);
      const declared = space.parameters
        .filter((parameter) => parameter.section === sections[0])
        .map((parameter) => parameter.id);
      expect([...FAMILY_DIMENSIONS[family]].sort()).toEqual(declared.sort());
    }
  });
});

/* -------------------------------------------------------------------------- *
 * 2 — the register shrank honestly, and in both directions
 * -------------------------------------------------------------------------- */

describe('the unauthorable register — docs/21 § 3.6 rule 1', () => {
  it('registers exactly the families this panel does not author', () => {
    const authored = new Set(Object.keys(FAMILY_DIMENSIONS));
    for (const profile of resources.dispatcherProfiles.profiles) {
      for (const block of unauthorableBlocksOf(profile)) {
        expect(
          authored.has(block),
          `${block} is registered as unauthorable and has controls — a refusal that tells the ` +
            'reader not to touch a thing that works is § D227’s defect',
        ).toBe(false);
      }
    }
  });

  it('still registers selection, and only where the profile carries one', () => {
    // No shipped profile authors `selection` today, so the register is empty across `data/` — and
    // the claim that matters is the conditional one, which is asserted on a profile that does.
    const withSelection = {
      ...shipped('eta'),
      selection: { policy: 'fuzzy' },
    } as unknown as DispatcherProfile;
    expect(unauthorableBlocksOf(withSelection)).toEqual(['selection']);
    expect(unauthorableBlocksOf(shipped('eta'))).toEqual([]);
    expect(unauthorableBlocksOf(shipped('auction-multi-round'))).toEqual([]);
    expect(unauthorableBlocksOf(shipped('destination-panel'))).toEqual([]);
    expect(unauthorableBlocksOf(shipped('zoned-uppeak'))).toEqual([]);
    expect(unauthorableBlocksOf(shipped('collective'))).toEqual([]);
    expect(unauthorableBlocksOf(undefined)).toEqual([]);
  });

  /**
   * The ground the refusal names is a fact about the code, so it is asserted against the code.
   *
   * `drivingProfileOf` ending in `profileWithSelector(…, state.selectorSpec)` is the whole of why
   * `selection` is refused rather than given a control. If that call ever leaves, the refusal
   * becomes a stale one — § D227's *worse than a dead seam* — and this goes red first.
   */
  it('refuses selection on a ground the source still supports', () => {
    const state = readFileSync(fileURLToPath(new URL('./state.ts', import.meta.url)), 'utf8');
    const driving = state.slice(state.indexOf('export function drivingProfileOf'));
    expect(driving.slice(0, driving.indexOf('\n}\n'))).toContain('profileWithSelector');
    expect(driving.slice(0, driving.indexOf('\n}\n'))).toContain('state.selectorSpec');
    expect(SELECTION_REFUSAL).toContain('Selector panel');
  });

  it('names a caller that exists for every family — § 3.6 rule 2', () => {
    const sources = [
      'policy.ts',
      'registry.ts',
      'loadSensor.ts',
      'doorMachine.ts',
      'arrivalModel.ts',
    ].map((name) => name);
    const tree = readFileSync(
      fileURLToPath(new URL('../../../core/src/dispatch/policy.ts', import.meta.url)),
      'utf8',
    );
    expect(tree).toContain('export function resolveDispatchConfig');
    expect(sources).toHaveLength(5);
    for (const family of FAMILY_ORDER) {
      const named = /#(\w+)/.exec(FAMILY_CALLERS[family])?.[1];
      expect(named, `${family} names no caller`).toBeDefined();
    }
    // The three that are *not* the dispatch resolve are the reason rule 2 is per block. Named
    // explicitly so a later edit cannot quietly collapse them onto one sentence.
    expect(FAMILY_CALLERS.auction).toContain('createPolicyFor');
    expect(FAMILY_CALLERS.load).toContain('resolveLoadSensor');
    expect(FAMILY_CALLERS.doors).toContain('resolveDoorConfig');
    expect(FAMILY_CALLERS.forecast).toContain('resolvePredictorConfig');
  });
});

/* -------------------------------------------------------------------------- *
 * 3 — the overrides, both directions
 * -------------------------------------------------------------------------- */

/** A value this dimension can hold that is not the one the point holds. */
function otherValue(id: string, held: ParameterValue | undefined): ParameterValue | undefined {
  const parameter = space.byId.get(id);
  if (parameter === undefined) return undefined;
  switch (parameter.type) {
    case 'boolean':
      return held !== true;
    case 'categorical': {
      const next = parameter.values.find((value) => value !== held);
      return next;
    }
    case 'integer':
      return typeof held === 'number' && held + 1 <= parameter.max ? held + 1 : parameter.min;
    case 'continuous': {
      const mid = (parameter.min + parameter.max) / 2;
      return typeof held === 'number' && Math.abs(mid - held) > 1e-9 ? mid : parameter.min;
    }
  }
}

function everyLeverSetting(): readonly GroupLevers[] {
  const out: GroupLevers[] = [];
  const dwells: readonly (DwellChoice | undefined)[] = [undefined, ...DWELL_CHOICES];
  for (const parking of [false, true]) {
    for (const express of [false, true]) {
      for (const dwell of dwells) out.push({ parking, express, dwell });
    }
  }
  return out;
}

describe('a flag above outranks a control below, and the panel says which — § 3.6 rule 3', () => {
  it('claims an override exactly where the conversion performs one', () => {
    const bases = ['eta', 'predictive-balanced', 'destination-panel', 'auction-multi-round'];
    const failures: string[] = [];
    for (const baseId of bases) {
      const base = shipped(baseId);
      const read0 = specFromProfile(base, base.name);
      for (const pool of [false, true]) {
        for (const zone of [false, true]) {
          for (const bypass of [false, true]) {
            for (const levers of everyLeverSetting()) {
              const flags = { pool, zone, bypass };
              for (const id of Object.values(FAMILY_DIMENSIONS).flat()) {
                const draft0 = profileFromSpec({ ...read0, flags, families: {} }, {
                  id: 'probe',
                  base,
                  levers,
                });
                const point = valuesFromProfile(space, draft0);
                // Only a control the reader can actually move: an unmet `activeWhen` is refused by
                // `applyControlEdit` with the gate named, which is a different disclosure and is
                // `controls/controls.ts`'s to make.
                if (!isActive(space.byId.get(id) as never, readerFor(space, point))) continue;
                const wanted = otherValue(id, point.get(id));
                if (wanted === undefined) continue;
                const spec: DispatcherSpec = { ...read0, flags, families: { [id]: wanted } };
                const written = profileFromSpec(spec, { id: 'probe', base, levers });
                const got = candidateFromProfile(space, written).get(id);
                const overridden = String(got) !== String(wanted);
                const claimed = familyOverridesOf(spec, levers).has(id);
                if (overridden !== claimed) {
                  failures.push(
                    `${baseId} ${JSON.stringify(flags)} ${JSON.stringify(levers)} ${id}: ` +
                      `set ${String(wanted)}, profile holds ${String(got)}, ` +
                      `familyOverridesOf ${claimed ? 'claims' : 'denies'} an override`,
                  );
                }
              }
            }
          }
        }
      }
    }
    expect(
      failures.slice(0, 8),
      'familyOverridesOf disagreed with what profileFromSpec actually wrote — either a control is ' +
        'drawn as live and writes nothing (§ D219), or a live control is told it writes nothing ' +
        '(§ D227). Both are defects and the table is the fix for neither on its own.',
    ).toEqual([]);
  }, 120_000);

  it('leaves the split threshold live under the zoning flag, which is why it is not in the table', () => {
    const base = shipped('eta');
    const spec: DispatcherSpec = {
      ...specFromProfile(base, base.name),
      flags: { pool: false, zone: true, bypass: true },
      families: { 'dispatch.assignmentMode': 'split-demand', 'dispatch.splitThresholdPassengers': 25 },
    };
    const written = profileFromSpec(spec, { id: 'probe', base, levers: DEFAULT_LEVERS });
    expect(written.dispatch?.splitThresholdPassengers).toBe(25);
    expect(familyOverridesOf(spec, DEFAULT_LEVERS).has('dispatch.splitThresholdPassengers')).toBe(
      false,
    );
    // And the other half: the mode itself *is* overridden, and the panel says so.
    expect(familyOverridesOf(spec, DEFAULT_LEVERS).get('dispatch.assignmentMode')).toContain(
      'split-demand',
    );
  });
});

/* -------------------------------------------------------------------------- *
 * The view
 * -------------------------------------------------------------------------- */

describe('the drawn block', () => {
  const base = shipped('predictive-balanced');
  const spec = specFromProfile(base, base.name);
  const draft = profileFromSpec(spec, { id: 'probe', base, levers: DEFAULT_LEVERS });
  const view = familyControlsViewOf({ space, spec, levers: DEFAULT_LEVERS, draft, base });

  it('draws one block per family, each naming its caller', () => {
    expect(view.blocks.map((block) => block.family)).toEqual([...FAMILY_ORDER]);
    for (const block of view.blocks) {
      expect(block.caller.startsWith('Read by ')).toBe(true);
      expect(block.rows.length).toBeGreaterThan(0);
    }
  });

  it('counts what it drew against what the space declares', () => {
    const drawn = view.blocks.reduce((total, block) => total + block.rows.length, 0);
    expect(drawn).toBe(Object.values(FAMILY_DIMENSIONS).flat().length);
    expect(view.status).toContain(`${String(drawn)} of ${String(space.ids.length)}`);
    expect(view.status).toContain('0 moved');
  });

  it('says where the one dimension it does not draw lives', () => {
    expect(view.elsewhere).toContain('dispatch.callType');
    for (const id of FLAG_OWNED) {
      expect(view.blocks.flatMap((block) => block.rows).some((row) => row.control.id === id)).toBe(
        false,
      );
    }
  });

  it('draws a control whose gate is unmet, disabled, with the gate named — never hidden', () => {
    const eta = shipped('eta');
    const off: DispatcherSpec = { ...specFromProfile(eta, eta.name), families: {} };
    const drawn = familyControlsViewOf({
      space,
      spec: off,
      levers: DEFAULT_LEVERS,
      draft: profileFromSpec(off, { id: 'probe', base: eta, levers: DEFAULT_LEVERS }),
      base: eta,
    });
    const panel = drawn.blocks
      .flatMap((block) => block.rows)
      .find((row) => row.control.id === 'dispatch.passengerAssignment');
    expect(panel).toBeDefined();
    expect(panel?.control.enabled).toBe(false);
    expect(panel?.control.inactiveReason).toContain('dispatch.callType');
  });

  it('keeps a move and prunes one that was put back', () => {
    const kept = prunedFamilyMoves(space, base, { 'dispatch.deferWindowS': 4 });
    expect(kept).toEqual({ 'dispatch.deferWindowS': 4 });
    const put = valuesFromProfile(space, base).get('dispatch.deferWindowS') as number;
    expect(prunedFamilyMoves(space, base, { 'dispatch.deferWindowS': put })).toEqual({});
    expect(specIsDirty({ ...spec, families: { 'dispatch.deferWindowS': 4 } }, base)).toBe(true);
    expect(specIsDirty({ ...spec, families: {} }, base)).toBe(false);
  });

  it('shows the reader’s own value in an overridden control, not the flag’s', () => {
    const eta = shipped('eta');
    const zoned: DispatcherSpec = {
      ...specFromProfile(eta, eta.name),
      flags: { pool: false, zone: true, bypass: true },
      families: { 'dispatch.assignmentMode': 'single-car' },
    };
    const values = familyValuesOf(
      space,
      profileFromSpec(zoned, { id: 'probe', base: eta, levers: DEFAULT_LEVERS }),
      zoned.families,
    );
    expect(values.get('dispatch.assignmentMode')).toBe('single-car');
    expect(familyOverridesOf(zoned, DEFAULT_LEVERS).get('dispatch.assignmentMode')).toContain(
      'split-demand',
    );
  });
});

/* -------------------------------------------------------------------------- *
 * 4 — move the control, require the run to change, compared on the legs
 * -------------------------------------------------------------------------- */

/**
 * The legs a saved dispatcher produces, through the shipped path and nothing shorter.
 *
 * The spec is turned into a profile by the same `profileFromSpec` the Save button calls, filed in
 * `savedDispatchers` as Save files it, selected as *Run this dispatcher* selects it, and built by
 * `shiftRunConfigOf` — which re-derives the profile through `drivingProfileOf`, the step that
 * clobbers `selection` and would clobber anything else that had a second writer. A fixture that
 * handed `recordRun` a profile directly would route past exactly the seam this lane is about.
 */
function legsOf(
  baseId: string,
  families: Readonly<Record<string, ParameterValue>>,
  buildingId: (typeof BUILDING_IDS)[number] = 'midtown-office',
): string {
  const state = baseState();
  const base = shipped(baseId);
  const profile = profileFromSpec(
    { ...specFromProfile(base, base.name), families },
    { id: 'yours-1', base, levers: state.levers },
  );
  const at: ViewerState = {
    ...state,
    buildingId,
    shiftLengthS: 600,
    savedDispatchers: [{ id: 'yours-1', profile }],
    dispatcherId: 'yours-1',
    editingDispatcherId: 'yours-1',
  };
  return JSON.stringify(
    recordRun(shiftRunConfigOf(resources, at).config, { recordDecisions: false }).recording.legs.map(
      (leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1],
    ),
  );
}

/**
 * One move per family that the run has to notice.
 *
 * Each is the family's own headline knob, and two carry a second id because the first cannot bite
 * without it — the forecast is consulted only by `predicted-demand` parking, and the reserve is
 * only read past round one. That is not a weakening of the test: a dimension that needs a companion
 * to matter is exactly what `activeWhen` would say if the schema declared it, and where the schema
 * does not, saying it here is better than a move that quietly changes nothing.
 */
const FAMILY_MOVES: readonly {
  readonly family: DispatcherFamily;
  readonly base: string;
  readonly move: Readonly<Record<string, ParameterValue>>;
}[] = [
  { family: 'panel', base: 'destination-eta', move: { 'dispatch.passengerAssignment': 'panel' } },
  {
    family: 'timing',
    base: 'eta',
    move: { 'dispatch.assignmentTiming': 'deferred', 'dispatch.deferWindowS': 3 },
  },
  {
    family: 'zoning',
    base: 'eta',
    move: { 'dispatch.assignmentMode': 'split-demand', 'dispatch.splitThresholdPassengers': 3 },
  },
  { family: 'reassignment', base: 'eta', move: { 'dispatch.reassignmentPolicy': 'continuous' } },
  { family: 'constraints', base: 'eta', move: { 'constraints.noDirectionReversal': true } },
  {
    family: 'auction',
    base: 'eta',
    move: {
      'auction.aggregation': 'contract-net',
      'auction.rounds': 3,
      'auction.reserveMarginalDelayS': 20,
    },
  },
  { family: 'load', base: 'eta', move: { 'answer.overloadThreshold': 0.85 } },
  { family: 'doors', base: 'eta', move: { 'answer.maxTransferSeconds': 8 } },
  { family: 'parking', base: 'eta', move: { 'idle.parkingStrategy': 'lobby' } },
  /*
   * The bucket width rather than the horizon, and the reason is measured rather than guessed: at
   * this operating point four of the six predictor rows — the horizon included — leave the legs
   * untouched under `predicted-demand` parking, and the bucket width does not. That is a fact about
   * this cell, not about the seam; docs/10 § 8.2 rule 2 is explicit that whether a dimension
   * contributes at a given point *cannot* be decided from a schema and that this editor must not
   * claim it. What the family owes is one move the run notices, and this is it.
   */
  {
    family: 'forecast',
    base: 'eta',
    move: { 'idle.parkingStrategy': 'predicted-demand', 'idle.predictorBucketWidthS': 60 },
  },
  // The schema says this one is inert on a single-term profile and lists the measurement:
  // *"eta runs bit-identically at 10 s and at 180 s, while predictive-balanced does not"*. So the
  // base is the one the schema names, which is the difference between testing the seam and
  // testing whether the tester read the declaration.
  {
    family: 'normalization',
    base: 'predictive-balanced',
    move: { 'normalization.waitTimeS': 15 },
  },
];

describe('move a family control and the run changes — § D177, per family', () => {
  it('covers every family', () => {
    expect([...FAMILY_MOVES.map((entry) => entry.family)].sort()).toEqual([...FAMILY_ORDER].sort());
  });

  it('changes the legs, for every family, on the shipped path', () => {
    const unmoved: string[] = [];
    const byBase = new Map<string, string>();
    for (const { family, base, move } of FAMILY_MOVES) {
      let before = byBase.get(base);
      if (before === undefined) {
        before = legsOf(base, {});
        byBase.set(base, before);
      }
      // The forecast's companion is a move in its own right, so the comparison for that family is
      // against the companion alone — otherwise the parking change would carry the verdict.
      const control =
        family === 'forecast' ? legsOf(base, { 'idle.parkingStrategy': 'predicted-demand' }) : before;
      if (legsOf(base, move) === control) unmoved.push(`${family} (${base})`);
    }
    expect(
      unmoved,
      'a family control was moved and the run produced the same legs — the control writes a field ' +
        'no run reads, which is § D219’s defect and the one docs/21 § 3.6 rule 2 exists to stop',
    ).toEqual([]);
  }, 900_000);
});

describe('the negative pin — where a bit-identical run is the correct answer', () => {
  /**
   * Re-authoring a shipped profile's exact values must change nothing, and this is the **only**
   * place in this file where sameness is a pass.
   *
   * Stated as such because CLAUDE.md's rule is that a bit-identical result is a wiring bug until
   * proven otherwise. What proves it here is the test above: the same apparatus, given a different
   * value, moves the legs for every one of the eleven families. So an unchanged run under an
   * unchanged value is the write path being exact rather than the write path being absent.
   */
  it('is byte-identical when every family dimension is re-authored at the profile’s own value', () => {
    const baseId = 'predictive-balanced';
    const base = shipped(baseId);
    const point = valuesFromProfile(space, base);
    const everything: Record<string, ParameterValue> = {};
    for (const id of Object.values(FAMILY_DIMENSIONS).flat()) {
      const held = point.get(id);
      if (held !== undefined) everything[id] = held;
    }
    expect(Object.keys(everything).length).toBeGreaterThan(30);
    // Deliberately **unpruned**: this has to exercise `decodeCandidate` and `applyPatch` over all
    // of them rather than short-circuit on an empty record.
    expect(legsOf(baseId, everything)).toBe(legsOf(baseId, {}));
  }, 300_000);

  it('is byte-identical to the shipped profile the editor never touched', () => {
    const state = baseState();
    const direct: ViewerState = {
      ...state,
      buildingId: 'midtown-office',
      shiftLengthS: 600,
      dispatcherId: 'predictive-balanced',
    };
    const legs = JSON.stringify(
      recordRun(shiftRunConfigOf(resources, direct).config, {
        recordDecisions: false,
      }).recording.legs.map((leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1]),
    );
    expect(legsOf('predictive-balanced', {})).toBe(legs);
  }, 300_000);
});

/* -------------------------------------------------------------------------- *
 * Persistence — docs/21 § 3.6's needs-verification item
 * -------------------------------------------------------------------------- */

describe('a family move survives being filed', () => {
  /**
   * Issue #113 § 2 claimed saved dispatchers vanish on reload. That is closed in the product
   * (`persist/session.ts`; `MountContext.update` saves the library the moment it changes), and the
   * driven half is in `dispatcherFamilies.browser.test.ts`. What this asserts is the half that is
   * new here: the family values are on the **profile**, not on the draft, so whatever persists a
   * profile persists them — there is no second shelf to forget.
   */
  it('is carried on the profile, not on the draft', () => {
    const base = shipped('eta');
    const profile = profileFromSpec(
      { ...specFromProfile(base, base.name), families: { 'dispatch.reassignmentPolicy': 'continuous' } },
      { id: 'yours-1', base, levers: DEFAULT_LEVERS },
    );
    expect(profile.dispatch?.reassignmentPolicy).toBe('continuous');
    // And reading it back into the editor puts the value in the base rather than in the record, so
    // a saved dispatcher re-opened shows what it holds with nothing "moved".
    const reread = specFromProfile(profile, profile.name);
    expect(reread.families).toEqual({});
    expect(valuesFromProfile(space, profile).get('dispatch.reassignmentPolicy')).toBe('continuous');
  });
});
