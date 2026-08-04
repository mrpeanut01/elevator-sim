/**
 * **The weight-set selector's editing model** — the flat, total shape a surface can bind a control
 * to, for the one mechanism in this simulator that adapts *inside* a run.
 *
 * ## Why this file exists
 *
 * `docs/17-play-experience-audit.md` § 5 finding 6: *"the weight-set selector has no surface"*.
 * § 1.2 of the same document establishes why that finding is sharper than it looks — `Simulation.run()`
 * is one synchronous call and invariant 3 keeps the wall clock out of `core/`, so **a control cannot
 * steer a day, it re-rolls one**. Every other knob the product exposes is a re-run. The selector is
 * the exception: `core/src/dispatch/selector.ts` classifies traffic into the five patterns
 * `data/dispatcher-profiles.json` authors and swaps weight vectors mid-run behind a 120 s dwell. The
 * player's genuine within-day lever is therefore *configuring an automatic policy in advance*, and
 * it is reachable from no mode's own screen.
 *
 * ## What this is **not** a claim about
 *
 * `DECISIONS.md` § D145 and § D156 refused the **learned** selector: a contextual policy that
 * searched for a weight-set schedule did not beat `collective` — ΔTTD `−0.213 [−0.440, +0.014]` at
 * § D145's cell, NOT ACCEPTED at all five PRIMARY cells of § D151's sweep, and refused a third time
 * on `lunch-two-way` (§ D169). What this file exposes is the **hand-authored** map in `data/`, which
 * is shipped and works. **Nothing here says switching helps.** No copy below claims a wait, an
 * energy figure or a comparison; the pattern lines describe what a regime *is*, which is a fact
 * about traffic, not a performance claim. If a line in this file ever asserts an outcome, it needs a
 * paired-t interval behind it or it is the failure mode CLAUDE.md § *Statistical discipline* names.
 *
 * ## Its non-test caller: **none yet, and that is stated rather than implied**
 *
 * The surface the lead mounts is a selector panel in `packages/viz/src/dev/`, alongside
 * `dev/dispatcherEditor.ts` — the panel that mounts `authoring/dispatcherSpec.ts` the same way, and
 * whose `profileFromSpec` result reaches a run through `dev/state.ts`'s `shiftRunConfigOf`. The seam
 * that panel needs is already open: `dev/data.ts` bundles the whole of `data/dispatcher-profiles.json`
 * **including** the file-level `patternSwitching` block (§ D153's known limitation, closed), and
 * `viewerSelector.test.ts` proves a profile that opts into `selection.policy` changes the viewer's
 * run and that permuting the arm map changes it again.
 *
 * **At the time of writing nothing outside `selectorSpec.test.ts` imports this module.** That is the
 * literal shape of the defect `docs/05-roadmap.md`'s standing requirement is about, and § D192 found
 * two docstrings in `packages/viz` naming callers that do not call. So this paragraph names no
 * caller: it names the mount the lead is doing, and until that lands `packages/viz/src/deadCode.test.ts`
 * will classify every export here as an unexplained dead symbol. **Mount it or list it; do not
 * silence it.**
 *
 * ## Two documents, not one — and it is the engine that splits them
 *
 * `SelectionStageConfig` (the six scalars and the policy) is authored **per profile**;
 * `PatternSwitchingConfig` (the detector and `weightSetsByPattern`) is **file-level**, shared by
 * every profile, exactly as the cost-term library is. One editing surface spans both, so the write
 * side is two functions over one spec: {@link profileWithSelector} and
 * {@link patternSwitchingWithSelector}. That is the same split `dispatcherSpec.ts`'s
 * `doorTimingFor` makes for the same reason — a dwell is a fact about the car and the profile is a
 * fact about the group — and collapsing it here would mean an editor that appeared to save a
 * per-dispatcher arm map the loader has nowhere to put.
 *
 * The consequence for the read side: {@link specFromProfile} takes a {@link SelectorContext} as well
 * as the profile, because **the profile alone does not contain the arm map**.
 *
 * ## The anti-inertness rule, applied
 *
 * `dispatcherSpec.ts`'s header states it: an inert term is drawn as a refusal beside the control and
 * never dropped. The selector has more ways to be inert than any other editor in this package, and
 * {@link selectorIssues} enumerates them as data rather than as prose:
 *
 * - `policy: 'off'` — the resolver returns no arms at all, the policy never builds an `ArrivalWindow`
 *   and hands the same frozen weight Map to the scorer for the life of the run. **Every other control
 *   on the panel is decoration**, and each gets its own refusal so the player sees it beside the
 *   control they moved.
 * - `policy: 'fuzzy'` — the three learned gains are multiplied by nothing: `gained()` returns the
 *   observation unchanged unless the policy is `contextual`.
 * - A pattern naming a weight set the file does not declare, a pattern the detector declares and the
 *   map does not name, a pattern with no membership clause, a detector input this build does not
 *   implement — each of these makes `resolveWeightSets` **throw**, so the refusal is not "this knob
 *   is quiet", it is "pressing Run fails by name". Said in words a player can act on, in advance.
 * - A map entry naming a pattern the detector does not declare is the opposite failure and the
 *   quieter one: `resolveWeightSets` iterates `patternDetector.patterns`, so the entry is *silently
 *   ignored*. That is § D112's defect shape in a new field, and it is refused here because nothing
 *   downstream will refuse it.
 * - Every pattern selecting the same weight vector — a selector that switches between identical
 *   vectors changes no decision, which is the whole of what `destination-eta` shipped doing.
 *
 * ## Derived, not retyped
 *
 * The five pattern ids are **data**: `core` declares no pattern vocabulary, only the three detector
 * inputs ({@link SELECTOR_INPUTS}) and the three policies (`WEIGHT_SET_POLICIES`). So every pattern
 * id here comes from the supplied {@link PatternSwitchingConfig} at run time; {@link PATTERN_LINES}
 * is the one authored table (prose cannot be derived) and `selectorSpec.test.ts` asserts its key set
 * against the shipped detector's `patterns` **in both directions**. Defaults, ranges and help text
 * come from `DISPATCH_PARAMETERS` — `core`'s own schema declarations (CLAUDE.md invariant 8) — so a
 * control's bounds cannot drift from the optimizer's.
 *
 * ## Naming hazard for the mount
 *
 * `authoring/dispatcherSpec.ts` exports a function also called `specFromProfile`, over a different
 * shape. A file mounting both must alias one of them.
 */

import {
  DISPATCH_PARAMETERS,
  SELECTOR_INPUTS,
  WEIGHT_SET_POLICIES,
  dispatchParameter,
  type DispatcherProfile,
  type DispatcherProfiles,
  type MembershipRamp,
  type PatternSwitchingConfig,
  type SelectionStageConfig,
  type SelectorInput,
  type WeightSetPolicy,
} from '@elevator-sim/core/browser';

/* -------------------------------------------------------------------------- *
 * The spec
 * -------------------------------------------------------------------------- */

/**
 * The selector editor's whole state. Flat, total, and directly bindable to a control.
 *
 * Total in the sense `DispatcherSpec` is total: no field is optional, so a control never has to
 * invent what "unset" means. The defaults come from `DISPATCH_PARAMETERS`, and
 * {@link profileWithSelector} writes back only what differs from them, so a shipped profile that
 * authored nothing round-trips to a profile that still authors nothing.
 *
 * `weightSetsByPattern` keeps the data file's own field name deliberately: it binds to
 * `patternSwitching.weightSetsByPattern` one-for-one, and a near-miss rename is exactly the kind of
 * difference a reader stops noticing.
 */
export interface SelectorSpec {
  /** Whether the weight vector may change during the run, and by what rule. */
  readonly policy: WeightSetPolicy;
  /** Seconds a chosen weight set must be held before another may take it. */
  readonly hysteresisS: number;
  /** Trailing window the three traffic rates are counted over, seconds. */
  readonly observationWindowS: number;
  /** Learned gain on the lobby arrival rate. Inert at 1, and inert under `fuzzy` at any value. */
  readonly lobbyArrivalRateGain: number;
  /** Learned gain on the interfloor rate. Inert at 1, and inert under `fuzzy` at any value. */
  readonly interfloorRateGain: number;
  /** Learned gain on the down-travelling rate. Inert at 1, and inert under `fuzzy` at any value. */
  readonly downPeakRateGain: number;
  /** Membership a challenger must beat the incumbent's by before it may take the run. Inert at 0. */
  readonly switchMargin: number;
  /** Pattern id to the dispatcher-profile id whose weight vector that regime runs. */
  readonly weightSetsByPattern: Readonly<Record<string, string>>;
}

/** The scalar half of {@link SelectorSpec} — everything that is one control with one value. */
export type SelectorScalarField = Exclude<keyof SelectorSpec, 'weightSetsByPattern'>;

/**
 * A field a refusal can be drawn beside.
 *
 * The map's entries are addressed individually — `weightSetsByPattern.up-peak` — because a panel
 * draws one row per pattern and a refusal about `interfloor` belongs beside `interfloor`. The bare
 * `'weightSetsByPattern'` addresses the block as a whole, for the refusals that are about the map
 * rather than about one row.
 */
export type SelectorField = keyof SelectorSpec | `weightSetsByPattern.${string}`;

/**
 * A reason a control cannot take effect, in words a player can act on.
 *
 * Deliberately the shape `menu/menu.ts`'s `SelectionIssue` uses — `{ field, message }` — so a
 * surface that already knows how to draw one list of refusals draws this one without a second
 * mechanism.
 */
export interface SelectorIssue {
  readonly field: SelectorField;
  readonly message: string;
}

/**
 * Everything the spec needs that is not on the profile.
 *
 * Two of the three are unavoidable: the arm map is file-level, and validating a map entry requires
 * the profile library it names. `durationS` is optional and buys one refusal — a dwell longer than
 * the run means the detector picks once and never switches — which a surface that knows the run
 * length can show and one that does not simply omits.
 */
export interface SelectorContext {
  /** Every dispatcher profile the file declares. A pattern may only select one of these. */
  readonly profiles: readonly DispatcherProfile[];
  /** The file-level arm library, or `undefined` when the file declares none. */
  readonly patternSwitching: PatternSwitchingConfig | undefined;
  /** The run length in simulated seconds, when the surface knows it. */
  readonly durationS?: number | undefined;
}

/** Read the context straight out of a parsed `data/dispatcher-profiles.json`. */
export function selectorContextFrom(
  file: DispatcherProfiles,
  durationS?: number | undefined,
): SelectorContext {
  return Object.freeze({
    profiles: file.profiles,
    patternSwitching: file.patternSwitching,
    ...(durationS === undefined ? {} : { durationS }),
  });
}

/* -------------------------------------------------------------------------- *
 * The declared schema — defaults, ranges and help, from core
 * -------------------------------------------------------------------------- */

/** The dotted-path prefix `DISPATCH_PARAMETERS` gives every field of the selection stage. */
const SELECTION_PREFIX = 'selection.';

/**
 * The scalar fields, **derived from `core`'s parameter declarations** rather than listed here.
 *
 * The cast is the one unchecked step in the derivation, and `selectorSpec.test.ts` closes it in both
 * directions: every id `DISPATCH_PARAMETERS` declares under `selection.` has a field on
 * {@link SelectorSpec}, and every scalar field of {@link SelectorSpec} has a declaration. A
 * parameter added to `core` and not to this editor therefore turns the suite red rather than
 * shipping a knob the panel cannot reach — which, one level down, is how `tuning/` came to be
 * reachable from nothing.
 */
export const SELECTOR_SCALAR_FIELDS: readonly SelectorScalarField[] = Object.freeze(
  DISPATCH_PARAMETERS.filter((parameter) => parameter.id.startsWith(SELECTION_PREFIX)).map(
    (parameter) => parameter.id.slice(SELECTION_PREFIX.length) as SelectorScalarField,
  ),
);

/** The `DISPATCH_PARAMETERS` id a spec field binds to. One rule, no table. */
export function parameterIdFor(field: SelectorScalarField): string {
  return `${SELECTION_PREFIX}${field}`;
}

/**
 * `core`'s own description of a control, verbatim.
 *
 * Not paraphrased: the parameter declaration is what an optimizer reads and what
 * `docs/06-parameterization-and-tuning.md` publishes, and a second wording of the same fact is a
 * second thing to keep true. A surface that wants shorter copy should shorten it in the surface.
 */
export function helpFor(field: SelectorScalarField): string {
  return parameterOrThrow(field).description;
}

/** The inclusive `[min, max]` a control may offer, or `undefined` for the categorical policy. */
export function rangeFor(field: SelectorScalarField): readonly [number, number] | undefined {
  return parameterOrThrow(field).range;
}

/** The admissible values of the one categorical field, from `WEIGHT_SET_POLICIES`. */
export const POLICY_VALUES: readonly WeightSetPolicy[] = Object.freeze([...WEIGHT_SET_POLICIES]);

function parameterOrThrow(field: SelectorScalarField): {
  readonly default: number | string | boolean;
  readonly description: string;
  readonly range?: readonly [number, number] | undefined;
} {
  const parameter = dispatchParameter(parameterIdFor(field));
  if (parameter === undefined) {
    // Unreachable while the both-ways test above is green; thrown rather than defaulted because a
    // silently invented bound is a control whose limits are a fact about this file.
    throw new Error(
      `No dispatch parameter is declared for "${parameterIdFor(field)}". The selector editor's ` +
        `fields are derived from DISPATCH_PARAMETERS; one of them has moved.`,
    );
  }
  return parameter;
}

function numberDefault(field: SelectorScalarField): number {
  const value = parameterOrThrow(field).default;
  if (typeof value !== 'number') {
    throw new Error(`Dispatch parameter "${parameterIdFor(field)}" declares a non-numeric default.`);
  }
  return value;
}

function policyDefault(): WeightSetPolicy {
  const value = parameterOrThrow('policy').default;
  const policy = POLICY_VALUES.find((candidate) => candidate === value);
  if (policy === undefined) {
    throw new Error(
      `Dispatch parameter "selection.policy" declares a default of ${JSON.stringify(value)}, which ` +
        `is not one of ${POLICY_VALUES.join(', ')}.`,
    );
  }
  return policy;
}

/* -------------------------------------------------------------------------- *
 * Read
 * -------------------------------------------------------------------------- */

/**
 * The spec of a profile that has authored nothing — every scalar at its declared default, and the
 * file's own arm map.
 *
 * The arm map is copied rather than blanked: the shipped map is the thing being exposed, and an
 * editor that opened on an empty map would make the player author five bindings before they could
 * see the mechanism at all.
 */
export function defaultSelectorSpec(context: SelectorContext): SelectorSpec {
  return Object.freeze({
    policy: policyDefault(),
    hysteresisS: numberDefault('hysteresisS'),
    observationWindowS: numberDefault('observationWindowS'),
    lobbyArrivalRateGain: numberDefault('lobbyArrivalRateGain'),
    interfloorRateGain: numberDefault('interfloorRateGain'),
    downPeakRateGain: numberDefault('downPeakRateGain'),
    switchMargin: numberDefault('switchMargin'),
    weightSetsByPattern: armMapOf(context),
  });
}

/**
 * Read a shipped or saved profile into the editor's shape. Total.
 *
 * The second argument is not optional and is not a convenience: `weightSetsByPattern` is file-level,
 * so a `SelectorSpec` built from a profile alone would carry an empty map and a save would then
 * appear to have deleted five bindings the profile never owned.
 */
export function specFromProfile(profile: DispatcherProfile, context: SelectorContext): SelectorSpec {
  const authored = profile.selection;
  const fallback = defaultSelectorSpec(context);
  if (authored === undefined) return fallback;
  const policy = POLICY_VALUES.find((candidate) => candidate === authored.policy);
  return Object.freeze({
    policy: policy ?? fallback.policy,
    hysteresisS: authored.hysteresisS ?? fallback.hysteresisS,
    observationWindowS: authored.observationWindowS ?? fallback.observationWindowS,
    lobbyArrivalRateGain: authored.lobbyArrivalRateGain ?? fallback.lobbyArrivalRateGain,
    interfloorRateGain: authored.interfloorRateGain ?? fallback.interfloorRateGain,
    downPeakRateGain: authored.downPeakRateGain ?? fallback.downPeakRateGain,
    switchMargin: authored.switchMargin ?? fallback.switchMargin,
    weightSetsByPattern: fallback.weightSetsByPattern,
  });
}

/**
 * The file's arm map, in the detector's declaration order, with any entry the detector does not
 * declare kept on the end.
 *
 * Declaration order is not cosmetic: `selectWeightSet` breaks a membership tie by *"the
 * first-declared of two equal patterns wins"*, so a panel that listed the patterns in some other
 * order would be drawing the tie-break backwards. The stragglers are kept rather than dropped
 * because dropping them is the silent behaviour {@link selectorIssues} exists to refuse.
 */
function armMapOf(context: SelectorContext): Readonly<Record<string, string>> {
  const source = context.patternSwitching;
  if (source === undefined) return Object.freeze({});
  const map: Record<string, string> = {};
  for (const patternId of source.patternDetector.patterns) {
    const weightSetId = source.weightSetsByPattern[patternId];
    if (weightSetId !== undefined) map[patternId] = weightSetId;
  }
  for (const [patternId, weightSetId] of Object.entries(source.weightSetsByPattern)) {
    if (!(patternId in map)) map[patternId] = weightSetId;
  }
  return Object.freeze(map);
}

/* -------------------------------------------------------------------------- *
 * Write
 * -------------------------------------------------------------------------- */

/**
 * Turn the editor's shape back into a profile the simulator will dispatch with.
 *
 * Two rules, and the round-trip test is what they are for:
 *
 * 1. **Nothing is written to its default value** unless the profile already wrote it to that value.
 *    `dispatcherSpec.ts` argues the first half — a profile that spells out its defaults is
 *    indistinguishable from one that meant them — and the second half is what makes the round trip
 *    exact for a profile that *did* author `"policy": "off"` explicitly. A reader who moves such a
 *    field back to its default drops it, because at that point the two differ and the absent
 *    spelling is the honest one.
 * 2. **`$comment` survives.** It is the only field of `SelectionStageConfig` this editor does not
 *    model, and silently deleting an author's note on save is a data loss the round-trip test would
 *    otherwise catch and nobody would want fixed by removing the test.
 *
 * The arm map is not written here. It is file-level; see {@link patternSwitchingWithSelector}.
 */
export function profileWithSelector(profile: DispatcherProfile, spec: SelectorSpec): DispatcherProfile {
  const authored = profile.selection;
  const selection: Record<string, unknown> = {};
  if (authored?.$comment !== undefined) selection['$comment'] = authored.$comment;

  for (const field of SELECTOR_SCALAR_FIELDS) {
    const value = spec[field];
    const declared = parameterOrThrow(field).default;
    const wasAuthored = authored !== undefined && authored[field] !== undefined;
    if (value !== declared || (wasAuthored && authored[field] === value)) {
      selection[field] = value;
    }
  }

  const next: Record<string, unknown> = { ...profile };
  if (Object.keys(selection).length === 0) delete next['selection'];
  else next['selection'] = selection as SelectionStageConfig;
  return next as unknown as DispatcherProfile;
}

/**
 * Turn the editor's arm map back into the file-level `patternSwitching` block.
 *
 * The detector — its type, inputs, patterns, membership ramps and its own `hysteresisS` — is carried
 * through **unchanged**. This editor binds which weight set each regime runs, not where the regimes
 * divide: the ramps are calibrated breakpoints measured through the shipped engine at eight
 * operating points (the block's own `$comment` records the medians), and a slider over them would be
 * a control that silently invalidates that calibration.
 *
 * Returns `undefined` when the file declares no library, because there is then nothing to write
 * into and inventing a detector would be authoring five pattern names in code — CLAUDE.md
 * invariant 7's exact failure.
 */
export function patternSwitchingWithSelector(
  spec: SelectorSpec,
  context: SelectorContext,
): PatternSwitchingConfig | undefined {
  const source = context.patternSwitching;
  if (source === undefined) return undefined;
  return Object.freeze({
    ...source,
    weightSetsByPattern: Object.freeze({ ...spec.weightSetsByPattern }),
  });
}

/** Bind one pattern to a weight set, leaving every other binding alone. */
export function withWeightSet(spec: SelectorSpec, patternId: string, weightSetId: string): SelectorSpec {
  return Object.freeze({
    ...spec,
    weightSetsByPattern: Object.freeze({ ...spec.weightSetsByPattern, [patternId]: weightSetId }),
  });
}

/** Whether the editor's copy differs from the profile and file it was read from. */
export function specIsDirty(
  spec: SelectorSpec,
  profile: DispatcherProfile,
  context: SelectorContext,
): boolean {
  const original = specFromProfile(profile, context);
  for (const field of SELECTOR_SCALAR_FIELDS) {
    if (original[field] !== spec[field]) return true;
  }
  const keys = new Set([
    ...Object.keys(original.weightSetsByPattern),
    ...Object.keys(spec.weightSetsByPattern),
  ]);
  for (const key of keys) {
    if (original.weightSetsByPattern[key] !== spec.weightSetsByPattern[key]) return true;
  }
  return false;
}

/* -------------------------------------------------------------------------- *
 * Refusals
 * -------------------------------------------------------------------------- */

/**
 * Everything about this configuration that cannot take effect, or that will refuse to run.
 *
 * Returns **all** of them rather than the first, for `freePlayIssues`' reason: a player who fixes
 * one and is then told about the next has been made to guess how many there are.
 *
 * Three severities are deliberately *not* modelled as a field, because the message says which it is
 * and a surface that grades them would need a policy about grading:
 *
 * - **inert** — the control is drawn, the run happens, and the value changes no decision;
 * - **refused** — `resolveWeightSets` throws and pressing Run fails by name;
 * - **ignored** — the loader accepts it and the selector never looks at it, which is the quietest
 *   of the three and the one this repository keeps shipping.
 *
 * Every claim below is a claim about `core/src/dispatch/selector.ts` as written, not about
 * `DISPATCH_PARAMETERS`' `activeWhen` declarations. Where the two disagree the code wins and the
 * test records the disagreement: `selection.switchMargin` is declared `contextual`-only and
 * `selectWeightSet` applies it under `fuzzy` as well, so **no refusal is emitted for it under
 * `fuzzy`** — a refusal that told a player their margin was inert when the run reads it would be
 * worse than no refusal at all.
 */
export function selectorIssues(spec: SelectorSpec, context: SelectorContext): readonly SelectorIssue[] {
  const issues: SelectorIssue[] = [];
  const source = context.patternSwitching;

  if (spec.policy === 'off') {
    for (const field of SELECTOR_SCALAR_FIELDS) {
      if (field === 'policy') continue;
      issues.push({
        field,
        message:
          'Inert while weight-set selection is off: the dispatcher holds one weight vector for the ' +
          'whole run and the detector is never built. Choose fuzzy or contextual for this to mean ' +
          'anything.',
      });
    }
    issues.push({
      field: 'weightSetsByPattern',
      message:
        'Inert while weight-set selection is off. These bindings are read only when a policy is ' +
        'chosen; with it off the dispatcher runs its own weights from the first second to the last.',
    });
    return Object.freeze(issues);
  }

  if (source === undefined) {
    issues.push({
      field: 'policy',
      message:
        'This dispatcher says it switches weight sets and no pattern library is loaded, so there is ' +
        'nothing to switch between. The run is refused by name rather than quietly running one ' +
        'vector.',
    });
    return Object.freeze(issues);
  }

  if (spec.policy === 'fuzzy') {
    for (const field of ['lobbyArrivalRateGain', 'interfloorRateGain', 'downPeakRateGain'] as const) {
      if (spec[field] === numberDefault(field)) continue;
      issues.push({
        field,
        message:
          'Inert under the fuzzy rule: the gains are the learned half of the contextual rule and ' +
          'the fuzzy detector reads the observed rates untouched. Switch to contextual, or leave ' +
          'this at 1.',
      });
    }
  }

  for (const field of SELECTOR_SCALAR_FIELDS) {
    const range = rangeFor(field);
    const value = spec[field];
    if (range === undefined || typeof value !== 'number') continue;
    if (value < range[0] || value > range[1]) {
      issues.push({
        field,
        message:
          `Outside the declared range ${String(range[0])}–${String(range[1])}. The optimizer and ` +
          'the loader share these bounds; a value beyond them is not a setting the simulator has.',
      });
    }
  }

  if (spec.observationWindowS <= 0) {
    issues.push({
      field: 'observationWindowS',
      message:
        'A window of zero seconds means the detector counts nothing: every rate reads zero for the ' +
        'whole run, so the traffic is never recognised as anything but quiet.',
    });
  }

  const duration = context.durationS;
  if (duration !== undefined && spec.hysteresisS >= duration) {
    issues.push({
      field: 'hysteresisS',
      message:
        `A ${String(Math.round(spec.hysteresisS))} s hold is at least as long as the ` +
        `${String(Math.round(duration))} s run, so the detector picks once and can never change its ` +
        'mind. That is one weight vector for the run with extra steps.',
    });
  }

  const declared = source.patternDetector.patterns;
  const implemented = new Set<string>(SELECTOR_INPUTS);
  for (const input of source.patternDetector.inputs) {
    if (implemented.has(input)) continue;
    issues.push({
      field: 'policy',
      message:
        `The loaded detector declares the input "${input}", which nothing measures. The run is ` +
        `refused by name. Implemented inputs: ${SELECTOR_INPUTS.join(', ')}.`,
    });
  }

  const membership = source.patternDetector.membership ?? {};
  const profileIds = new Set(context.profiles.map((profile) => profile.id));
  for (const patternId of declared) {
    const field: SelectorField = `weightSetsByPattern.${patternId}`;
    const weightSetId = spec.weightSetsByPattern[patternId];
    if (weightSetId === undefined || weightSetId === '') {
      issues.push({
        field,
        message:
          `The detector can decide the traffic is "${patternId}" and no weight set is bound to it, ` +
          'so the run is refused by name rather than reaching a regime it has no weights for.',
      });
    } else if (!profileIds.has(weightSetId)) {
      issues.push({
        field,
        message:
          `"${weightSetId}" is not a dispatcher this file declares, so the run is refused by name. ` +
          'A selector missing one of its regimes would fall back silently at exactly the traffic it ' +
          'was configured for.',
      });
    }
    const clauses = membership[patternId] ?? {};
    const usable = Object.keys(clauses).filter((input) => implemented.has(input));
    if (usable.length === 0) {
      issues.push({
        field,
        message:
          `"${patternId}" declares no membership clause the detector can evaluate, so its score is a ` +
          'constant and the traffic can never be recognised as it — nor recognised as anything else ' +
          'once it wins. The run is refused by name.',
      });
    }
  }

  const declaredSet = new Set(declared);
  for (const patternId of Object.keys(spec.weightSetsByPattern)) {
    if (declaredSet.has(patternId)) continue;
    issues.push({
      field: `weightSetsByPattern.${patternId}`,
      message:
        `The detector does not declare a "${patternId}" pattern, so this binding is read by nothing ` +
        'and the loader will not complain. It is authored decoration until the detector declares it.',
    });
  }

  if (declared.length > 1) {
    const vectors = declared.map((patternId) =>
      weightVectorOf(context, spec.weightSetsByPattern[patternId]),
    );
    const first = vectors[0];
    if (
      first !== undefined &&
      vectors.every((vector) => vector !== undefined && sameWeights(vector, first))
    ) {
      issues.push({
        field: 'weightSetsByPattern',
        message:
          'Every pattern selects the same weight vector, so the detector can classify the traffic ' +
          'perfectly and change no decision. Bind at least two regimes to different weights, or ' +
          'turn selection off and say so.',
      });
    }
  }

  return Object.freeze(issues);
}

/** A profile's weight vector by id, or `undefined` when the file declares no such profile. */
function weightVectorOf(
  context: SelectorContext,
  weightSetId: string | undefined,
): Readonly<Record<string, number>> | undefined {
  if (weightSetId === undefined) return undefined;
  return context.profiles.find((profile) => profile.id === weightSetId)?.weights;
}

/**
 * Whether two weight vectors score identically.
 *
 * Zero-weighted terms are dropped before the comparison, for `dispatcherSpec.ts`'s reason: under
 * saturating normalization an explicit `0` and an absent term contribute the same nothing, so two
 * vectors differing only in which zeros they spell out are one dispatcher written twice.
 */
function sameWeights(
  a: Readonly<Record<string, number>>,
  b: Readonly<Record<string, number>>,
): boolean {
  const live = (weights: Readonly<Record<string, number>>): Map<string, number> =>
    new Map(Object.entries(weights).filter(([, weight]) => weight !== 0));
  const left = live(a);
  const right = live(b);
  if (left.size !== right.size) return false;
  for (const [term, weight] of left) {
    if (right.get(term) !== weight) return false;
  }
  return true;
}

/* -------------------------------------------------------------------------- *
 * Plain language
 * -------------------------------------------------------------------------- */

/**
 * What each pattern *is*, in the words a building manager uses.
 *
 * `docs/12-design-handoff.md` § 2.2 makes this a requirement rather than a flavour: *"every handoff
 * label is a sentence a building manager would say"*, and the current surface's labels are metric
 * names. A card reading `up-peak → capacity-aware` is configuration; a card reading *"nearly
 * everybody is arriving"* is the thing the configuration is about.
 *
 * **Every line describes traffic and none describes an outcome.** Saying a regime exists is a fact
 * about a building's day; saying a weight set is better in it is a claim needing a paired-t interval
 * that excludes zero, and this project has three refusals on record (§ D145, § D156, § D169) for the
 * learned version of exactly that claim.
 *
 * Authored rather than derived because prose cannot be derived. The **keys** are not authored
 * knowledge: `selectorSpec.test.ts` asserts this table's key set against the shipped detector's
 * `patterns` in both directions, so a sixth pattern in `data/` fails the suite instead of drawing a
 * blank card, and a line for a pattern the detector dropped fails it too.
 */
export const PATTERN_LINES: Readonly<Record<string, string>> = Object.freeze({
  'up-peak':
    'Nearly everybody is arriving. The queue forms in the lobby and almost nowhere else — the morning intake, or the start of a shift.',
  'down-peak':
    'The building is emptying. The queue forms on every floor at once instead of in one lobby, and the cars come down full.',
  'two-way':
    'The lobby and the upper floors are busy at the same time — lunch, or a shift change. A car is rarely empty in the direction somebody needs.',
  'interfloor':
    'People are moving between upper floors and the lobby is quiet — a meeting-heavy afternoon, or a building whose tenants visit each other.',
  'idle':
    'Almost nobody is calling. Whatever the cars do now, they are mostly waiting for the next person to press a button.',
});

/** The plain-language line for a pattern, or `undefined` when this build has no sentence for it. */
export function patternLine(patternId: string): string | undefined {
  return PATTERN_LINES[patternId];
}

/**
 * What each detector input reads like at the top and the bottom of its ramp.
 *
 * Two phrases rather than one label, because a ramp has a direction and *"lobby arrivals: low"* is
 * not a sentence anybody says. With both, {@link signatureLine} composes *"Detected when the lobby
 * is filling up and few people are heading down"* — which is § 2.2's requirement met by
 * construction rather than by a copy pass.
 *
 * Three entries, and the key set is `SELECTOR_INPUTS` — `core`'s own vocabulary, asserted both ways
 * in the test. The fourth input `data/` once declared, `timeOfDay`, is not here because it is not in
 * `SELECTOR_INPUTS`: `core` has no wall clock and the detector dropped it rather than faking it.
 */
export const INPUT_PHRASES: Readonly<
  Record<SelectorInput, { readonly high: string; readonly low: string }>
> = Object.freeze({
  lobbyArrivalRate: Object.freeze({
    high: 'the lobby is filling up',
    low: 'the lobby is quiet',
  }),
  interfloorRate: Object.freeze({
    high: 'people are moving between the upper floors',
    low: 'the upper floors are quiet',
  }),
  downPeakRate: Object.freeze({
    high: 'a lot of people are heading down',
    low: 'few people are heading down',
  }),
});

/**
 * The signature the detector actually matches on, **derived from the authored ramps**.
 *
 * A ramp is `[zeroAt, oneAt]`: **rising** when `oneAt > zeroAt`, **falling** when it is smaller, and
 * a step when they are equal — a step reads as the rising phrase, because membership is 1 at or
 * above the breakpoint. So *"the lobby is filling up and few people are heading down"* is read off
 * the data rather than transcribed beside it, which matters because those breakpoints were
 * calibrated against eight measured operating points and a hand-written summary would go stale the
 * first time one moved.
 *
 * The clauses are joined with *and* because that is the arithmetic: `armMembership` takes the
 * **weakest** clause (fuzzy AND), so a pattern is detected when every clause holds, not when any
 * does.
 *
 * Returns `undefined` for a pattern the detector does not declare, or one with no clause: a
 * signature sentence for a pattern with no signature would be the decoration
 * {@link selectorIssues} is refusing.
 */
export function signatureLine(patternId: string, context: SelectorContext): string | undefined {
  const detector = context.patternSwitching?.patternDetector;
  if (detector === undefined || !detector.patterns.includes(patternId)) return undefined;
  const clauses = detector.membership?.[patternId];
  if (clauses === undefined) return undefined;

  const parts: string[] = [];
  for (const input of SELECTOR_INPUTS) {
    const ramp = clauses[input] as MembershipRamp | undefined;
    if (ramp === undefined) continue;
    const [zeroAt, oneAt] = ramp;
    parts.push(oneAt < zeroAt ? INPUT_PHRASES[input].low : INPUT_PHRASES[input].high);
  }
  if (parts.length === 0) return undefined;
  return `Detected when ${parts.join(' and ')}.`;
}

/** One pattern, as a card a surface can draw without knowing anything about the detector. */
export interface PatternCard {
  readonly patternId: string;
  /** The plain-language sentence, or `undefined` — draw the id rather than inventing one. */
  readonly line: string | undefined;
  /** What the detector matches on, derived from the ramps. */
  readonly signature: string | undefined;
  /** The bound dispatcher-profile id, or `''` when nothing is bound. */
  readonly weightSetId: string;
  /** That profile's display name, or the id when the file declares no such profile. */
  readonly weightSetName: string;
  /** False when this card cannot take effect: selection off, unbound, or bound to nothing real. */
  readonly live: boolean;
}

/**
 * The five cards, in the detector's declaration order.
 *
 * Declaration order, again, because it is the tie-break `selectWeightSet` applies when two
 * memberships are equal — a panel that sorted alphabetically would be showing the priority wrong.
 * Bindings the detector does not declare are **appended rather than hidden**, marked not live, so a
 * player can see the entry their refusal is about.
 */
export function patternCards(spec: SelectorSpec, context: SelectorContext): readonly PatternCard[] {
  const declared = context.patternSwitching?.patternDetector.patterns ?? [];
  const extras = Object.keys(spec.weightSetsByPattern).filter(
    (patternId) => !declared.includes(patternId),
  );
  const nameOf = (weightSetId: string): string =>
    context.profiles.find((profile) => profile.id === weightSetId)?.name ?? weightSetId;

  return Object.freeze(
    [...declared, ...extras].map((patternId) => {
      const weightSetId = spec.weightSetsByPattern[patternId] ?? '';
      const known = context.profiles.some((profile) => profile.id === weightSetId);
      return Object.freeze({
        patternId,
        line: patternLine(patternId),
        signature: signatureLine(patternId, context),
        weightSetId,
        weightSetName: weightSetId === '' ? '' : nameOf(weightSetId),
        live: spec.policy !== 'off' && known && declared.includes(patternId),
      });
    }),
  );
}

/**
 * One sentence describing what this configuration will do, for the panel's header.
 *
 * Says what the mechanism *is* and never what it buys. The `off` line in particular is written to be
 * accurate rather than discouraging: one weight vector for the run is what every published figure in
 * this repository was measured under.
 */
export function policyLine(spec: SelectorSpec, context: SelectorContext): string {
  if (spec.policy === 'off') {
    return 'One weight vector for the whole run. The dispatcher does not change its mind about what it is optimising.';
  }
  const patterns = context.patternSwitching?.patternDetector.patterns.length ?? 0;
  const rule =
    spec.policy === 'contextual'
      ? 'the same detector with three learned gains and a switch margin in front of it'
      : 'a fuzzy detector over the three arrival rates';
  return (
    `${rule.charAt(0).toUpperCase()}${rule.slice(1)}, over ${String(patterns)} traffic patterns, ` +
    `counted across a ${String(Math.round(spec.observationWindowS))} s trailing window and held for ` +
    `at least ${String(Math.round(spec.hysteresisS))} s once chosen.`
  );
}
