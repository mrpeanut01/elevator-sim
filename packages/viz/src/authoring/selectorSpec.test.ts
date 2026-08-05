/**
 * The selector editor's model, against the shipped data file and against `core`'s own selector.
 *
 * Three kinds of test, in the order they matter:
 *
 * 1. **The round trip.** A profile read into the editor and written back is the same profile,
 *    field for field, `$comment` included. It is the test that stops this module quietly becoming
 *    a second definition of what `selection` means — `dispatcherSpec.ts`'s header makes the same
 *    argument about `specRoundTrips`.
 * 2. **The derivations, both ways.** The scalar fields come from `DISPATCH_PARAMETERS`, the pattern
 *    ids from the shipped detector, the input phrases from `SELECTOR_INPUTS`. Each is asserted in
 *    both directions, so a vocabulary that grows in `core` or in `data/` turns this file red rather
 *    than drawing a blank card.
 * 3. **The refusals, driven through `core` rather than asserted.** Every inertness claim
 *    {@link selectorIssues} makes is checked against `selectWeightSet` / `resolveWeightSets`
 *    themselves: the gains really are inert under `fuzzy`, `policy: 'off'` really does resolve to no
 *    arms, and — the one that matters most — `switchMargin` really is **live** under `fuzzy`, which
 *    is why no refusal is emitted for it there even though `DISPATCH_PARAMETERS` declares it
 *    `contextual`-only. `docs/05-roadmap.md`'s standing requirement is *move the control and require
 *    the run to change*; an inertness claim is that requirement read backwards, and it needs the
 *    same evidence.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  DISPATCH_DEFAULTS,
  DISPATCH_PARAMETERS,
  INITIAL_SELECTOR_STATE,
  SELECTOR_INPUTS,
  WEIGHT_SET_POLICIES,
  dispatchParameter,
  parseDispatcherProfiles,
  resolveWeightSets,
  selectWeightSet,
  type DispatcherProfile,
  type DispatcherProfiles,
  type PatternSwitchingConfig,
  type ResolvedSelection,
  type ResolvedWeightSets,
  type SelectorInput,
  type TrafficObservation,
  type WeightSetPolicy,
  type WeightSetSource,
} from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import {
  INPUT_PHRASES,
  PATTERN_LINES,
  POLICY_VALUES,
  SELECTOR_SCALAR_FIELDS,
  defaultSelectorSpec,
  helpFor,
  parameterIdFor,
  patternCards,
  patternLine,
  patternSwitchingWithSelector,
  policyLine,
  profileWithSelector,
  rangeFor,
  selectorContextFrom,
  selectorIssues,
  signatureLine,
  specFromProfile,
  specIsDirty,
  withWeightSet,
  type SelectorContext,
  type SelectorScalarField,
  type SelectorSpec,
} from './selectorSpec.js';

/* -------------------------------------------------------------------------- *
 * The shipped file
 * -------------------------------------------------------------------------- */

const DATA = new URL('../../../../data/', import.meta.url);
const FILE: DispatcherProfiles = parseDispatcherProfiles(
  JSON.parse(
    readFileSync(fileURLToPath(new URL('dispatcher-profiles.json', DATA)), 'utf8'),
  ) as unknown,
);

const CONTEXT: SelectorContext = selectorContextFrom(FILE);
const SWITCHING: PatternSwitchingConfig = (() => {
  const block = FILE.patternSwitching;
  if (block === undefined) throw new Error('data/dispatcher-profiles.json declares no patternSwitching');
  return block;
})();
const PATTERNS: readonly string[] = SWITCHING.patternDetector.patterns;

const profile = (id: string): DispatcherProfile => {
  const found = FILE.profiles.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no profile "${id}"`);
  return found;
};

/** A profile with a `selection` block bolted on, for the cases `data/` does not ship. */
const withSelection = (id: string, selection: Record<string, unknown>): DispatcherProfile =>
  ({ ...profile(id), selection } as unknown as DispatcherProfile);

/* -------------------------------------------------------------------------- *
 * 1. The round trip
 * -------------------------------------------------------------------------- */

describe('the round trip', () => {
  /*
   * The record, stated because the brief for this lane assumed otherwise: **no shipped profile
   * declares patternSwitching, and none declares `selection` either.** `patternSwitching` is
   * file-level — one block on DispatcherProfiles, shared by every profile, exactly as the cost-term
   * library is — so "a shipped profile that declares patternSwitching" is not a thing that can
   * exist. The load-bearing round trip is therefore two assertions rather than one: the thirteen
   * shipped profiles rebuild unchanged, and the file-level block rebuilds unchanged.
   */
  it('is what the shipped file actually looks like', () => {
    expect(FILE.profiles.length).toBeGreaterThan(10);
    expect(FILE.profiles.filter((entry) => entry.selection !== undefined)).toEqual([]);
    expect(Object.keys(FILE as unknown as Record<string, unknown>)).toContain('patternSwitching');
  });

  it('rebuilds every shipped profile exactly', () => {
    for (const entry of FILE.profiles) {
      const rebuilt = profileWithSelector(entry, specFromProfile(entry, CONTEXT));
      expect(rebuilt, `profile ${entry.id} did not round-trip`).toEqual(entry);
      // Not merely deep-equal: a `selection` key holding an empty object would be a profile that
      // now declares a stage it never declared, and toEqual would still pass on `undefined`.
      expect(Object.keys(rebuilt as unknown as Record<string, unknown>)).not.toContain('selection');
    }
  });

  it('rebuilds the file-level patternSwitching block exactly', () => {
    const spec = specFromProfile(profile('collective'), CONTEXT);
    expect(patternSwitchingWithSelector(spec, CONTEXT)).toEqual(SWITCHING);
  });

  it('rebuilds a fully authored selection block exactly', () => {
    const authored = withSelection('collective', {
      policy: 'contextual',
      hysteresisS: 240,
      observationWindowS: 600,
      lobbyArrivalRateGain: 1.5,
      interfloorRateGain: 0.5,
      downPeakRateGain: 2,
      switchMargin: 0.25,
    });
    expect(profileWithSelector(authored, specFromProfile(authored, CONTEXT))).toEqual(authored);
  });

  it('rebuilds a partial block without spelling out the defaults it left absent', () => {
    const authored = withSelection('collective', { policy: 'fuzzy' });
    const rebuilt = profileWithSelector(authored, specFromProfile(authored, CONTEXT));
    expect(rebuilt).toEqual(authored);
    expect(rebuilt.selection).toEqual({ policy: 'fuzzy' });
  });

  it('keeps a field authored at its own default value, and drops it when the reader moves it back', () => {
    // The asymmetry is deliberate and is what makes the round trip exact for a profile that says
    // `"policy": "off"` out loud. Once the reader changes the value, the absent spelling is the
    // honest one — an authored default is a decision only while somebody authored it.
    const authored = withSelection('collective', { policy: 'off', hysteresisS: 120 });
    expect(profileWithSelector(authored, specFromProfile(authored, CONTEXT))).toEqual(authored);

    const moved = profileWithSelector(authored, {
      ...specFromProfile(authored, CONTEXT),
      hysteresisS: 200,
    });
    expect(moved.selection).toEqual({ policy: 'off', hysteresisS: 200 });

    const back = profileWithSelector(moved, { ...specFromProfile(moved, CONTEXT), hysteresisS: 120 });
    expect(back.selection).toEqual({ policy: 'off' });
  });

  it('carries an author’s $comment through a save', () => {
    const authored = withSelection('collective', {
      $comment: 'switched by hand for the lunch cell',
      policy: 'fuzzy',
    });
    expect(profileWithSelector(authored, specFromProfile(authored, CONTEXT))).toEqual(authored);
  });

  /* -- negative control: a file with no arm library at all ------------------ */

  it('round-trips a profile when the file declares no patternSwitching', () => {
    const bare: SelectorContext = { profiles: FILE.profiles, patternSwitching: undefined };
    const spec = specFromProfile(profile('collective'), bare);
    expect(spec.weightSetsByPattern).toEqual({});
    expect(profileWithSelector(profile('collective'), spec)).toEqual(profile('collective'));
    expect(patternSwitchingWithSelector(spec, bare)).toBeUndefined();
    // …and an authored selection block still round-trips, because the two documents are separate.
    const authored = withSelection('eta', { policy: 'fuzzy', hysteresisS: 300 });
    expect(profileWithSelector(authored, specFromProfile(authored, bare))).toEqual(authored);
  });

  it('writes a rebinding into the file-level block and nothing into the profile', () => {
    const spec = withWeightSet(specFromProfile(profile('collective'), CONTEXT), 'up-peak', 'eta');
    expect(patternSwitchingWithSelector(spec, CONTEXT)?.weightSetsByPattern['up-peak']).toBe('eta');
    // The detector is carried through untouched: this editor binds regimes, not breakpoints.
    expect(patternSwitchingWithSelector(spec, CONTEXT)?.patternDetector).toEqual(
      SWITCHING.patternDetector,
    );
    expect(profileWithSelector(profile('collective'), spec)).toEqual(profile('collective'));
  });

  it('reports dirt only when something moved', () => {
    const base = profile('collective');
    const spec = specFromProfile(base, CONTEXT);
    expect(specIsDirty(spec, base, CONTEXT)).toBe(false);
    expect(specIsDirty({ ...spec, policy: 'fuzzy' }, base, CONTEXT)).toBe(true);
    expect(specIsDirty(withWeightSet(spec, 'idle', 'eta'), base, CONTEXT)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- *
 * 2. Derivations, both ways
 * -------------------------------------------------------------------------- */

describe('derivations', () => {
  it('takes its scalar fields from core’s parameter declarations, both ways', () => {
    const declared = DISPATCH_PARAMETERS.filter((parameter) => parameter.id.startsWith('selection.'))
      .map((parameter) => parameter.id)
      .sort();
    const derived = [...SELECTOR_SCALAR_FIELDS].map(parameterIdFor).sort();
    expect(derived).toEqual(declared);

    const spec = defaultSelectorSpec(CONTEXT);
    const specFields = Object.keys(spec)
      .filter((key) => key !== 'weightSetsByPattern')
      .sort();
    expect(specFields).toEqual([...SELECTOR_SCALAR_FIELDS].sort());
  });

  it('takes its defaults from the same place the resolver does', () => {
    // DISPATCH_PARAMETERS is what an optimizer reads; DISPATCH_DEFAULTS is what
    // `resolveSelection` falls back to. They are two objects, and a control drawn from one while
    // the run uses the other is a slider whose zero point is a fact about this file.
    const spec = defaultSelectorSpec(CONTEXT);
    expect(spec.policy).toBe(DISPATCH_DEFAULTS.selectionPolicy);
    expect(spec.hysteresisS).toBe(DISPATCH_DEFAULTS.selectionHysteresisS);
    expect(spec.observationWindowS).toBe(DISPATCH_DEFAULTS.selectionObservationWindowS);
    expect(spec.lobbyArrivalRateGain).toBe(DISPATCH_DEFAULTS.selectionInputGain);
    expect(spec.interfloorRateGain).toBe(DISPATCH_DEFAULTS.selectionInputGain);
    expect(spec.downPeakRateGain).toBe(DISPATCH_DEFAULTS.selectionInputGain);
    expect(spec.switchMargin).toBe(DISPATCH_DEFAULTS.selectionSwitchMargin);
  });

  it('offers the policy vocabulary core declares, and no other', () => {
    expect(POLICY_VALUES).toEqual([...WEIGHT_SET_POLICIES]);
  });

  it('quotes core’s own help text rather than paraphrasing it', () => {
    for (const field of SELECTOR_SCALAR_FIELDS) {
      const parameter = dispatchParameter(parameterIdFor(field));
      expect(parameter, `no declaration for ${field}`).toBeDefined();
      expect(helpFor(field)).toBe(parameter?.description);
      expect(rangeFor(field)).toEqual(parameter?.range);
    }
    // The categorical one has no range; every other field has one, or a control has no bounds.
    expect(rangeFor('policy')).toBeUndefined();
    for (const field of SELECTOR_SCALAR_FIELDS) {
      if (field === 'policy') continue;
      expect(rangeFor(field), `${field} has no declared range`).toBeDefined();
    }
  });

  it('has a plain-language line for exactly the patterns the shipped detector declares', () => {
    expect(Object.keys(PATTERN_LINES).sort()).toEqual([...PATTERNS].sort());
    for (const patternId of PATTERNS) {
      const line = patternLine(patternId);
      expect(line, `no line for ${patternId}`).toBeDefined();
      // A sentence, not a label: it ends in a full stop and is longer than a metric name.
      expect(line ?? '').toMatch(/\.$/u);
      expect((line ?? '').length).toBeGreaterThan(40);
    }
    expect(patternLine('rush-hour')).toBeUndefined();
  });

  it('says nothing about performance in any player-facing line', () => {
    /*
     * The one copy rule this module has, enforced rather than reviewed. Describing what a regime IS
     * is a fact about traffic; saying switching is better, faster or more efficient is a comparison,
     * and this project refused exactly that claim for the learned selector three times (§ D145,
     * § D156, § D169). A single adjective is how a refused claim comes back.
     */
    const banned = /\b(better|best|faster|improv|optimal|efficien|saves?|reduc|outperform|beats?)/iu;
    const spec = { ...defaultSelectorSpec(CONTEXT), policy: 'fuzzy' as WeightSetPolicy };
    const copy = [
      ...Object.values(PATTERN_LINES),
      ...Object.values(INPUT_PHRASES).flatMap((phrases) => [phrases.high, phrases.low]),
      ...PATTERNS.map((patternId) => signatureLine(patternId, CONTEXT) ?? ''),
      policyLine(spec, CONTEXT),
      policyLine(defaultSelectorSpec(CONTEXT), CONTEXT),
    ];
    for (const line of copy) {
      expect(line, `player-facing copy makes a performance claim: ${line}`).not.toMatch(banned);
    }
  });

  it('phrases exactly the three detector inputs core implements, both ways', () => {
    expect(Object.keys(INPUT_PHRASES).sort()).toEqual([...SELECTOR_INPUTS].sort());
    for (const input of SELECTOR_INPUTS) {
      const phrases = INPUT_PHRASES[input as SelectorInput];
      expect(phrases.high).not.toBe(phrases.low);
    }
    // `timeOfDay` was authored in `data/` once and removed rather than faked; it is not an input,
    // so it has no phrase, and a phrase for it would be the first half of it coming back.
    expect(Object.keys(INPUT_PHRASES)).not.toContain('timeOfDay');
  });

  it('derives each pattern’s signature from the authored ramps rather than restating them', () => {
    // up-peak rises on lobby arrivals and falls on down traffic — read off `[0.004, 0.012]` and
    // `[0.008, 0.002]`, so a recalibration moves the sentence with it.
    expect(signatureLine('up-peak', CONTEXT)).toBe(
      'Detected when the lobby is filling up and few people are heading down.',
    );
    expect(signatureLine('down-peak', CONTEXT)).toBe(
      'Detected when the lobby is quiet and a lot of people are heading down.',
    );
    expect(signatureLine('idle', CONTEXT)).toBe(
      'Detected when the lobby is quiet and the upper floors are quiet and few people are heading down.',
    );
    expect(signatureLine('rush-hour', CONTEXT)).toBeUndefined();

    // Both ways: flip one ramp in a fixture and the sentence flips with it.
    const flipped: SelectorContext = {
      ...CONTEXT,
      patternSwitching: {
        ...SWITCHING,
        patternDetector: {
          ...SWITCHING.patternDetector,
          membership: {
            ...(SWITCHING.patternDetector.membership ?? {}),
            'up-peak': { lobbyArrivalRate: [0.012, 0.004] },
          },
        },
      },
    };
    expect(signatureLine('up-peak', flipped)).toBe('Detected when the lobby is quiet.');
  });

  it('draws the cards in the detector’s declaration order, which is its tie-break order', () => {
    const cards = patternCards({ ...defaultSelectorSpec(CONTEXT), policy: 'fuzzy' }, CONTEXT);
    expect(cards.map((card) => card.patternId)).toEqual([...PATTERNS]);
    expect(cards.every((card) => card.live)).toBe(true);
    expect(cards.map((card) => card.weightSetId)).toEqual(
      PATTERNS.map((patternId) => SWITCHING.weightSetsByPattern[patternId]),
    );
    // The name is the profile's own, so a card names the dispatcher rather than its id.
    expect(cards[0]?.weightSetName).toBe(profile('capacity-aware').name);
    // Off: every card is drawn and none is live. Drawn, because hiding the mechanism is the finding.
    const off = patternCards(defaultSelectorSpec(CONTEXT), CONTEXT);
    expect(off).toHaveLength(PATTERNS.length);
    expect(off.some((card) => card.live)).toBe(false);
  });

  it('appends a binding the detector does not declare rather than hiding it', () => {
    const spec = withWeightSet(
      { ...defaultSelectorSpec(CONTEXT), policy: 'fuzzy' },
      'rush-hour',
      'eta',
    );
    const cards = patternCards(spec, CONTEXT);
    expect(cards.map((card) => card.patternId)).toEqual([...PATTERNS, 'rush-hour']);
    expect(cards[cards.length - 1]?.live).toBe(false);
  });
});

/* -------------------------------------------------------------------------- *
 * 3. Refusals, and the code that proves each one
 * -------------------------------------------------------------------------- */

const LIVE: SelectorSpec = { ...defaultSelectorSpec(CONTEXT), policy: 'fuzzy' };

const fieldsOf = (issues: readonly { readonly field: string }[]): readonly string[] =>
  issues.map((issue) => issue.field);

describe('refusals', () => {
  it('negative control: a live, fully bound configuration has none', () => {
    expect(selectorIssues(LIVE, CONTEXT)).toEqual([]);
    expect(selectorIssues({ ...LIVE, policy: 'contextual' }, CONTEXT)).toEqual([]);
    // …and it really does resolve, which is the claim "no issues" is making.
    expect(resolveWeightSets(sourceOf(CONTEXT), resolved('fuzzy'), 'collective')?.arms).toHaveLength(
      PATTERNS.length,
    );
  });

  it('refuses every other control when the policy is off, one refusal per control', () => {
    const issues = selectorIssues(defaultSelectorSpec(CONTEXT), CONTEXT);
    expect([...fieldsOf(issues)].sort()).toEqual(
      [...SELECTOR_SCALAR_FIELDS.filter((field) => field !== 'policy'), 'weightSetsByPattern'].sort(),
    );
    for (const issue of issues) expect(issue.message).toMatch(/off/u);
    // The claim, proved on core: with the policy off there are no arms at all, so every field
    // above is decoration rather than a weak influence.
    expect(resolveWeightSets(sourceOf(CONTEXT), resolved('off'), 'collective')).toBeUndefined();
  });

  it('refuses a policy with no library to switch between', () => {
    const bare: SelectorContext = { profiles: FILE.profiles, patternSwitching: undefined };
    const issues = selectorIssues({ ...LIVE, weightSetsByPattern: {} }, bare);
    expect(fieldsOf(issues)).toEqual(['policy']);
    expect(() => resolveWeightSets(undefined, resolved('fuzzy'), 'collective')).toThrow(
      /does not switch/u,
    );
  });

  it('refuses a pattern bound to a dispatcher the file does not declare', () => {
    const spec = withWeightSet(LIVE, 'idle', 'energy-saver');
    expect(fieldsOf(selectorIssues(spec, CONTEXT))).toEqual(['weightSetsByPattern.idle']);
    // The shipped file's own historical defect: `idle` named `energy-saver`, which was never
    // authored. `resolveWeightSets` now throws on it; this refusal is the same fact, said before
    // the player presses Run.
    expect(() =>
      resolveWeightSets(sourceOf(CONTEXT, spec.weightSetsByPattern), resolved('fuzzy'), 'collective'),
    ).toThrow(/not an authored dispatcher profile/u);
  });

  it('refuses a declared pattern with nothing bound to it', () => {
    const partial = { ...LIVE.weightSetsByPattern };
    delete partial['two-way'];
    const spec: SelectorSpec = { ...LIVE, weightSetsByPattern: partial };
    expect(fieldsOf(selectorIssues(spec, CONTEXT))).toEqual(['weightSetsByPattern.two-way']);
    expect(() =>
      resolveWeightSets(sourceOf(CONTEXT, partial), resolved('fuzzy'), 'collective'),
    ).toThrow(/named by no weightSetsByPattern entry/u);
  });

  it('refuses a binding for a pattern the detector does not declare — the quiet one', () => {
    const spec = withWeightSet(LIVE, 'rush-hour', 'eta');
    const issues = selectorIssues(spec, CONTEXT);
    expect(fieldsOf(issues)).toEqual(['weightSetsByPattern.rush-hour']);
    // Quiet is the point: nothing downstream objects. The resolver iterates the detector's own
    // pattern list, so the extra entry resolves cleanly and is read by nobody.
    const resolvedSets = resolveWeightSets(
      sourceOf(CONTEXT, spec.weightSetsByPattern),
      resolved('fuzzy'),
      'collective',
    );
    expect(resolvedSets?.arms.map((arm) => arm.patternId)).toEqual([...PATTERNS]);
  });

  it('refuses a selector whose every regime runs the same weights', () => {
    const same = Object.fromEntries(PATTERNS.map((patternId) => [patternId, 'eta']));
    const issues = selectorIssues({ ...LIVE, weightSetsByPattern: same }, CONTEXT);
    expect(fieldsOf(issues)).toEqual(['weightSetsByPattern']);
    expect(issues[0]?.message).toMatch(/change no decision/u);
    // Two different regimes is enough to clear it.
    expect(
      selectorIssues(
        { ...LIVE, weightSetsByPattern: { ...same, 'down-peak': 'fairness-first' } },
        CONTEXT,
      ),
    ).toEqual([]);
  });

  it('refuses a value outside the range the optimizer and the loader share', () => {
    expect(fieldsOf(selectorIssues({ ...LIVE, hysteresisS: 5000 }, CONTEXT))).toEqual([
      'hysteresisS',
    ]);
    expect(fieldsOf(selectorIssues({ ...LIVE, switchMargin: -1 }, CONTEXT))).toContain(
      'switchMargin',
    );
  });

  it('refuses a dwell at least as long as the run, when the surface knows the run length', () => {
    const timed = selectorContextFrom(FILE, 900);
    expect(selectorIssues(LIVE, timed)).toEqual([]);
    const issues = selectorIssues({ ...LIVE, hysteresisS: 900 }, timed);
    expect(fieldsOf(issues)).toEqual(['hysteresisS']);
    // A surface that does not know the run length simply does not draw it.
    expect(selectorIssues({ ...LIVE, hysteresisS: 900 }, CONTEXT)).toEqual([]);
  });

  it('refuses a detector input this build does not implement', () => {
    const stale: SelectorContext = {
      ...CONTEXT,
      patternSwitching: {
        ...SWITCHING,
        patternDetector: {
          ...SWITCHING.patternDetector,
          inputs: [...SWITCHING.patternDetector.inputs, 'timeOfDay'],
        },
      },
    };
    expect(fieldsOf(selectorIssues(LIVE, stale))).toEqual(['policy']);
    expect(() =>
      resolveWeightSets(sourceOf(stale), resolved('fuzzy'), 'collective'),
    ).toThrow(/which no observation supplies/u);
  });

  it('refuses a pattern with no membership clause the detector can evaluate', () => {
    const constant: SelectorContext = {
      ...CONTEXT,
      patternSwitching: {
        ...SWITCHING,
        patternDetector: {
          ...SWITCHING.patternDetector,
          membership: Object.fromEntries(
            Object.entries(SWITCHING.patternDetector.membership ?? {}).filter(
              ([patternId]) => patternId !== 'interfloor',
            ),
          ),
        },
      },
    };
    expect(fieldsOf(selectorIssues(LIVE, constant))).toEqual(['weightSetsByPattern.interfloor']);
    expect(() => resolveWeightSets(sourceOf(constant), resolved('fuzzy'), 'collective')).toThrow(
      /declares no membership clause/u,
    );
  });
});

/* -------------------------------------------------------------------------- *
 * The inertness claims, driven through core's own selector
 * -------------------------------------------------------------------------- */

/** The observation that separates the two policies: below every rise point until a gain lifts it. */
const QUIET_LOBBY: TrafficObservation = Object.freeze({
  lobbyArrivalRate: 0.002,
  interfloorRate: 0,
  downPeakRate: 0,
});

/** Lobby and down both moderate: two-way outscores up-peak, but only just. */
const BOTH_WAYS: TrafficObservation = Object.freeze({
  lobbyArrivalRate: 0.006,
  interfloorRate: 0,
  downPeakRate: 0.004,
});

function sourceOf(
  context: SelectorContext,
  weightSetsByPattern?: Readonly<Record<string, string>>,
): WeightSetSource {
  const block = context.patternSwitching;
  if (block === undefined) throw new Error('no patternSwitching in this context');
  return {
    patternSwitching:
      weightSetsByPattern === undefined ? block : { ...block, weightSetsByPattern },
    weightsByProfileId: new Map(
      context.profiles.map((entry) => [entry.id, new Map(Object.entries(entry.weights))]),
    ),
  };
}

function resolved(policy: WeightSetPolicy, overrides: Partial<ResolvedSelection> = {}): ResolvedSelection {
  return {
    policy,
    hysteresisS: DISPATCH_DEFAULTS.selectionHysteresisS,
    observationWindowS: DISPATCH_DEFAULTS.selectionObservationWindowS,
    lobbyArrivalRateGain: DISPATCH_DEFAULTS.selectionInputGain,
    interfloorRateGain: DISPATCH_DEFAULTS.selectionInputGain,
    downPeakRateGain: DISPATCH_DEFAULTS.selectionInputGain,
    switchMargin: DISPATCH_DEFAULTS.selectionSwitchMargin,
    ...overrides,
  };
}

const armsOf = (context: SelectorContext, policy: WeightSetPolicy): ResolvedWeightSets => {
  const sets = resolveWeightSets(sourceOf(context), resolved(policy), 'collective');
  if (sets === undefined) throw new Error('no arms');
  return sets;
};

describe('the inertness claims, measured', () => {
  it('the gains move the contextual detector', () => {
    const sets = armsOf(CONTEXT, 'contextual');
    const flat = selectWeightSet(
      sets,
      resolved('contextual'),
      QUIET_LOBBY,
      INITIAL_SELECTOR_STATE,
      0,
    );
    const gained = selectWeightSet(
      sets,
      resolved('contextual', { lobbyArrivalRateGain: 4 }),
      QUIET_LOBBY,
      INITIAL_SELECTOR_STATE,
      0,
    );
    expect(flat.arm).toBeUndefined();
    expect(gained.arm?.patternId).toBe('up-peak');
  });

  it('…and do nothing at all under the fuzzy rule, which is why the refusal exists', () => {
    const sets = armsOf(CONTEXT, 'fuzzy');
    const flat = selectWeightSet(sets, resolved('fuzzy'), QUIET_LOBBY, INITIAL_SELECTOR_STATE, 0);
    const gained = selectWeightSet(
      sets,
      resolved('fuzzy', { lobbyArrivalRateGain: 4, interfloorRateGain: 4, downPeakRateGain: 4 }),
      QUIET_LOBBY,
      INITIAL_SELECTOR_STATE,
      0,
    );
    expect(gained).toEqual(flat);

    const issues = selectorIssues({ ...LIVE, lobbyArrivalRateGain: 4 }, CONTEXT);
    expect(fieldsOf(issues)).toEqual(['lobbyArrivalRateGain']);
    // A gain left at its default under fuzzy is not worth a refusal: nothing was asked for.
    expect(selectorIssues(LIVE, CONTEXT)).toEqual([]);
    // Under contextual the same value is live, so no refusal.
    expect(selectorIssues({ ...LIVE, policy: 'contextual', lobbyArrivalRateGain: 4 }, CONTEXT)).toEqual(
      [],
    );
  });

  /*
   * **The disagreement between the declaration and the code, pinned in both directions.**
   *
   * `DISPATCH_PARAMETERS` declares `selection.switchMargin` active only under `contextual`;
   * `selectWeightSet` reads it whatever the policy is. So this editor emits no refusal for a margin
   * under `fuzzy` — a refusal saying "inert" about a value the run applies would be worse than
   * silence.
   *
   * If somebody closes the gap in either direction this test goes red, which is the point: either
   * `activeWhen` gains `fuzzy` (and the first expectation fails) or `gained()`-style gating is
   * extended to the margin (and the second does). Both are decisions, and neither should land
   * silently.
   */
  it('the switch margin is declared contextual-only and applied under fuzzy too', () => {
    expect(dispatchParameter('selection.switchMargin')?.activeWhen).toEqual({
      'selection.policy': ['contextual'],
    });

    const sets = armsOf(CONTEXT, 'fuzzy');
    const incumbent = { activeIndex: 0, since: 0 };
    const free = selectWeightSet(
      sets,
      resolved('fuzzy', { hysteresisS: 0 }),
      BOTH_WAYS,
      incumbent,
      1000,
    );
    const gated = selectWeightSet(
      sets,
      resolved('fuzzy', { hysteresisS: 0, switchMargin: 0.2 }),
      BOTH_WAYS,
      incumbent,
      1000,
    );
    expect(free.switched).toBe(true);
    expect(free.arm?.patternId).toBe('two-way');
    expect(gated.switched).toBe(false);
    expect(gated.held).toBe('margin');

    // …so no refusal is drawn for it under fuzzy.
    expect(selectorIssues({ ...LIVE, switchMargin: 0.2 }, CONTEXT)).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- *
 * The header line
 * -------------------------------------------------------------------------- */

describe('the header line', () => {
  it('describes the mechanism, with the numbers the run will use', () => {
    expect(policyLine(defaultSelectorSpec(CONTEXT), CONTEXT)).toMatch(/one weight vector/iu);
    const line = policyLine(LIVE, CONTEXT);
    expect(line).toMatch(new RegExp(String(PATTERNS.length), 'u'));
    expect(line).toMatch(/300 s trailing window/u);
    expect(line).toMatch(/120 s once chosen/u);
    expect(policyLine({ ...LIVE, policy: 'contextual' }, CONTEXT)).toMatch(/learned gains/u);
  });
});

/* -------------------------------------------------------------------------- *
 * One fact about the data worth pinning, because two numbers look like one
 * -------------------------------------------------------------------------- */

it('does not bind the detector’s own hysteresisS, which nothing reads', () => {
  /*
   * `patternSwitching.patternDetector.hysteresisS` is required by the schema, authored as 120 in
   * `data/`, and read by **no** runtime path: `resolveWeightSets` consults `type`, `inputs`,
   * `patterns` and `membership` and never this field, and `selectWeightSet` takes its dwell from
   * `selection.hysteresisS`. The 120 the editor shows is `DISPATCH_DEFAULTS.selectionHysteresisS`,
   * which `parameters.ts` says in a comment is *quoted from* the data file — a hand-maintained copy,
   * not a derivation.
   *
   * Pinned here rather than fixed here: this file may not edit `core/` or `data/`. A surface that
   * labelled its dwell control "120 s, from the data file" would be naming a number nothing reads.
   */
  expect(SWITCHING.patternDetector.hysteresisS).toBe(DISPATCH_DEFAULTS.selectionHysteresisS);
  expect(SELECTOR_SCALAR_FIELDS as readonly string[]).not.toContain('patternDetector.hysteresisS');
  const spec: SelectorSpec = { ...LIVE, hysteresisS: 300 };
  // Editing the dwell writes the profile and leaves the data block's copy exactly where it was.
  expect(patternSwitchingWithSelector(spec, CONTEXT)?.patternDetector.hysteresisS).toBe(120);
  expect(
    (profileWithSelector(profile('collective'), spec).selection as { hysteresisS?: number })
      .hysteresisS,
  ).toBe(300);
});

/* A field list that reads as one thing and is checked as another would be the whole defect. */
it('names every scalar field in a form the panel can bind', () => {
  const fields: readonly SelectorScalarField[] = SELECTOR_SCALAR_FIELDS;
  expect(fields.length).toBe(7);
  expect([...fields]).toContain('policy');
});
