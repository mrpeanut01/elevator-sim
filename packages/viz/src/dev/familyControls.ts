/**
 * The dispatcher editor's family controls — `docs/21-engineer-reimagined-contract.md` § 3.6.
 *
 * ## What was wrong, in the product's own words
 *
 * `data/dispatcher-profiles.json` advertises five families and **two of them were authorable**.
 * `dispatcherEditor.ts#unauthorableBlocksOf` was the register: seven blocks the editor named and
 * could not write — `auction`, `zoning`, `panel`, `reassignment`, `timing`, `constraints`,
 * `selection` — *reported rather than fixed*, on the rule that a **silent** partial editor is the
 * defect. This module is the fix for six of the seven; the seventh is refused here with its ground,
 * and the register shrinks to it.
 *
 * ## Generated from the schema, never hand-built per block
 *
 * CLAUDE.md invariants 7 and 8 are the design. Every tunable already declares its type, range,
 * default and `activeWhen`; `collectSearchSpace()` already returns the dimension set; and
 * `controls/controls.ts` already turns a space plus a point into one control per dimension with no
 * elevator knowledge in it. So there is **no control-drawing code in this file** — it names which
 * dimensions belong to which family, reads the point off the profile, and hands both to
 * `controlsFor`. The mount instantiates the result through `parameterForm.ts#instantiateControlNode`,
 * which is `campaignPanel.ts`'s pattern and deliberately not a second `createElement` walk.
 *
 * ## The rule that decided what is built and what is refused — § 3.6 rule 2
 *
 * *Before any block gets a control, name the non-test caller that reads the field on a shipped run
 * path.* That is § D219's lesson (`patternSwitching`: authored, calibrated, loaded, resolved, and
 * writable by nothing) applied **before** the panel is written rather than after. Each family in
 * {@link FAMILY_CALLERS} carries the caller that was found, and it is drawn on screen beside the
 * block rather than only asserted here — a reader tuning `auction.rounds` can see that
 * `createPolicyFor` is what reads it.
 *
 * The one family that failed the test is `selection`, and its refusal is
 * {@link SELECTION_REFUSAL}: the fields resolve, but `dev/state.ts#drivingProfileOf` rebuilds
 * `profile.selection` from `ViewerState.selectorSpec` on **every** run
 * (`authoring/selectorSpec.ts#profileWithSelector` writes the whole block from the spec and deletes
 * what the spec does not carry), so a second writer here would be overwritten before the run. The
 * correct deliverable for a block that fails the caller test is a refusal naming the real ground,
 * and the real ground is *another panel already owns this field*, not *nothing reads it*.
 *
 * ## Completeness is a property, not a habit
 *
 * § 3.6: *every dimension the space declares is either a control or a named refusal beside it.*
 * {@link familyPartitionOf} states that as a partition — every id of `collectSearchSpace()` is in a
 * family, in the thirteen weight sliders, in {@link FLAG_OWNED}, or in {@link REFUSED_SECTION} —
 * and `familyControls.test.ts` asserts it **in both directions**, so a dimension added to `core`
 * lands in a family or turns the suite red rather than becoming a silent gap.
 *
 * ## Inert-by-configuration is drawn — § 3.6 rule 3
 *
 * Two ways a control here can fail to reach the run, and both are said beside it:
 *
 * 1. **An unmet `activeWhen`.** `controls/controls.ts` already draws the gate with the reason, and
 *    `applyControlEdit` refuses the write. Nothing is added here.
 * 2. **A flag or lever above that outranks it.** `authoring/dispatcherSpec.ts#profileFromSpec`
 *    writes six fields from the three flags and the dwell chips, and it writes them **after** the
 *    family patch, so those six are the profile's regardless of what the control below holds.
 *    {@link familyOverridesOf} names each one with the control that outranks it. This is § D227
 *    both ways: a control that writes nothing must say so, and the sentence is pinned by a run —
 *    `familyControls.test.ts` requires each tabled id to actually be overridden and every untabled
 *    family id to actually survive, over every flag and lever combination.
 *
 * ## Where this module's decisions are recorded — [§ D405](../../../../DECISIONS.md)
 *
 * **This docstring is the record, and that is the answer rather than an omission.** GitHub issue
 * #172 item 8 reported that B4 landed with nothing in `DECISIONS.md` while its two sibling lanes
 * each got a heading (§ D336, § D337), and read that as debt. § D405 — written after that issue —
 * settles the rule it was applying: an entry in that file is called for when a decision **reaches
 * past the module that took it**, and otherwise the module's own docstring is the record the
 * working agreement asks for.
 *
 * Measured against that rule, the four decisions this file made are all its own. The partition
 * (§ 3.6 completeness) is asserted here in both directions rather than argued anywhere else; the
 * `selection` refusal names `dev/state.ts#drivingProfileOf` as the ground but changes nothing
 * there; the override table is § D227 applied, not moved; and none of the four reverses anything
 * already recorded. What would have reached past this module — changing who owns
 * `profile.selection` — is exactly what {@link SELECTION_REFUSAL} declines to do.
 */

import type { DispatcherProfile } from '@elevator-sim/core/browser';
import type { ParameterValue, SearchSpace } from '@elevator-sim/experiments/browser';

import type { DispatcherSpec, GroupLevers } from '../authoring/dispatcherSpec.js';
import { controlsFor } from '../controls/controls.js';
import { valuesFromProfile } from '../controls/editedProfile.js';
import type { Control, ControlValues } from '../controls/types.js';

/* -------------------------------------------------------------------------- *
 * Which dimensions are which family
 * -------------------------------------------------------------------------- */

/**
 * The families this panel authors.
 *
 * Six of the names are `UnauthorableBlock`'s own, so the register and the fix share a vocabulary
 * and a block cannot be "closed" against a different meaning of the word than the one it was
 * registered under. The other five — `doors`, `load`, `parking`, `forecast`, `normalization` — are
 * **not** in the register and never were: they are dimensions `core` declares, a dispatcher profile
 * holds and a run reads, that no viewer control had reached. Naming them here rather than folding
 * them into a registered block keeps the register's own arithmetic honest.
 */
export type DispatcherFamily =
  | 'timing'
  | 'zoning'
  | 'panel'
  | 'reassignment'
  | 'constraints'
  | 'auction'
  | 'doors'
  | 'load'
  | 'parking'
  | 'forecast'
  | 'normalization';

/**
 * One family: the dimensions it owns, in the order they are drawn.
 *
 * A hand-written table rather than a derivation from `SearchParameter.section`, and only because
 * one section genuinely holds four families: `dispatch.*` is registration, assignment, zoning and
 * reassignment at once, and the register named those separately because a reader thinks of them
 * separately. Every other family is exactly a section, and the test asserts that too — so the
 * hand-written half is four rows, not eleven, and the rest cannot drift.
 */
export const FAMILY_DIMENSIONS: Readonly<Record<DispatcherFamily, readonly string[]>> =
  Object.freeze({
    timing: Object.freeze([
      'dispatch.batchWindowS',
      'dispatch.assignmentTiming',
      'dispatch.deferWindowS',
    ]),
    zoning: Object.freeze(['dispatch.assignmentMode', 'dispatch.splitThresholdPassengers']),
    panel: Object.freeze(['dispatch.passengerAssignment']),
    reassignment: Object.freeze([
      'dispatch.reassignmentPolicy',
      'dispatch.commitmentPoint',
      'dispatch.reassignmentHysteresisS',
      'dispatch.maxReassignmentsPerCall',
    ]),
    constraints: Object.freeze([
      'constraints.noDirectionReversal',
      'eligibility.allowOppositeDirectionPickup',
      'eligibility.enRouteDiversion',
      'eligibility.maxLoadFactorForAssignment',
      'answer.allowBypassIfSoleEligibleCar',
    ]),
    auction: Object.freeze([
      'auction.aggregation',
      'auction.rounds',
      'auction.reserveMarginalDelayS',
    ]),
    doors: Object.freeze([
      'answer.dwellPolicy',
      'answer.dwellAdaptationGain',
      'answer.maxDwellS',
      'answer.reopenOnLateArrival',
      'answer.maxReopensPerStop',
      'answer.maxTransferSeconds',
    ]),
    /*
     * One row, and the other one is in {@link FLAG_OWNED} — a finding rather than a decision.
     * `answer.bypassLoadThreshold` was drawn here first and the both-direction override sweep
     * caught it: `profileFromSpec` writes that field from the *Read the load sensor* switch on
     * every save, unconditionally, so a control over it could never write. A control that is
     * overridden in every state is not a control with a caveat, it is § D219's defect with a
     * sentence beside it, and the honest repair is to say the switch above owns the field.
     */
    load: Object.freeze(['answer.overloadThreshold']),
    parking: Object.freeze([
      'idle.parkingStrategy',
      'idle.parkingFloorIndex',
      'idle.repositionThresholdS',
      'idle.repositionEnergyWeight',
    ]),
    forecast: Object.freeze([
      'idle.predictorHorizonS',
      'idle.predictorLearningRate',
      'idle.predictorBucketWidthS',
      'idle.predictorCycleS',
      'idle.predictorPriorRatePerS',
      'idle.predictorPriorStrength',
    ]),
    normalization: Object.freeze(['normalization.waitTimeS', 'normalization.distanceM']),
  });

/** The draw order, which is the order a call travels through the engine's stages. */
export const FAMILY_ORDER: readonly DispatcherFamily[] = Object.freeze([
  'panel',
  'timing',
  'zoning',
  'reassignment',
  'constraints',
  'auction',
  'load',
  'doors',
  'parking',
  'forecast',
  'normalization',
]);

/** What each block is called on screen. One phrase, in the reader's words, naming the stage. */
export const FAMILY_TITLES: Readonly<Record<DispatcherFamily, string>> = Object.freeze({
  panel: 'The destination panel — who is told which car, and when',
  timing: 'Registration and assignment timing',
  zoning: 'Operational zoning — splitting a landing across cars',
  reassignment: 'Reassignment — when a promise stops being changeable',
  constraints: 'Eligibility and hard constraints',
  auction: 'The auction — who aggregates the bids',
  load: 'The load sensor',
  doors: 'Doors and dwell',
  parking: 'Where an idle car waits',
  forecast: 'The arrival forecast',
  normalization: 'Cost normalization — the half-cost points',
});

/**
 * **The named non-test caller, per family, drawn on screen** — § 3.6 rule 2's evidence.
 *
 * Each of these was read on the shipped path before the control was built, and the two that are
 * *not* `resolveDispatchConfig` are the reason the rule is per block rather than per panel:
 * `auction.*` is read by nobody in `resolveDispatchConfig` — `ResolvedDispatchConfig` has no
 * auction field at all — and the predictor rows are read by an object `Simulation` builds per bank
 * rather than by the dispatch resolve. A lane that had named one caller for the whole panel would
 * have been wrong about three families and would not have known it.
 */
export const FAMILY_CALLERS: Readonly<Record<DispatcherFamily, string>> = Object.freeze({
  panel: 'dispatch/policy.ts#resolveDispatchConfig, from dev/state.ts#shiftRunConfigOf',
  timing: 'dispatch/policy.ts#resolveDispatchConfig, from dev/state.ts#shiftRunConfigOf',
  zoning: 'dispatch/policy.ts#resolveDispatchConfig, from dev/state.ts#shiftRunConfigOf',
  reassignment: 'dispatch/policy.ts#resolveDispatchConfig, from dev/state.ts#shiftRunConfigOf',
  constraints: 'dispatch/policy.ts#resolveDispatchConfig, from dev/state.ts#shiftRunConfigOf',
  auction: 'dispatch/policies/registry.ts#createPolicyFor, from sim/simulation.ts — not the dispatch resolve, which never reads this block',
  load: 'model/car/loadSensor.ts#resolveLoadSensor, from model/car/car.ts',
  doors: 'physics/doors/doorMachine.ts#resolveDoorConfig, from model/car/car.ts',
  parking: 'dispatch/policy.ts#resolveDispatchConfig, from dev/state.ts#shiftRunConfigOf',
  forecast:
    'dispatch/predictor/arrivalModel.ts#resolvePredictorConfig, from createArrivalModel in sim/simulation.ts',
  normalization: 'dispatch/policy.ts#resolveDispatchConfig, from dev/state.ts#shiftRunConfigOf',
});

/**
 * The two dimensions this panel leaves to controls it already has.
 *
 * Both are written by `profileFromSpec` from a flag **unconditionally**, so a second control over
 * either could never write: `dispatch.callType` is *Ask where they are going*
 * (`DispatcherFlags.pool`) and `answer.bypassLoadThreshold` is *Read the load sensor*
 * (`DispatcherFlags.bypass`), and both toggles have been in the flags block since the editor was
 * built.
 *
 * The second entry is here because a test put it there. It was drawn as a `load` control first, and
 * `familyControls.test.ts`'s both-direction override sweep reported it overridden in every one of
 * the states it swept — which is the difference between a control with a caveat and a control that
 * does nothing. Named rather than silently absent, because a dimension that is in the space and in
 * no block is exactly the gap this module exists to close.
 */
export const FLAG_OWNED: readonly string[] = Object.freeze([
  'dispatch.callType',
  'answer.bypassLoadThreshold',
]);

/** The section whose dimensions are the thirteen weight sliders the panel has always drawn. */
export const WEIGHTS_SECTION = 'weights';

/** The section this panel refuses, with {@link SELECTION_REFUSAL} as its ground. */
export const REFUSED_SECTION = 'selection';

/**
 * Why `selection.*` gets a refusal rather than a control — the § 3.6 rule 2 finding.
 *
 * Not *"nothing reads it"*: `resolveDispatchConfig` resolves all seven fields and the run honours
 * them. The ground is that **something else already writes them on the way to the run**, so a
 * control here would be a control whose value never arrives — § D219's defect with a different
 * cause. It names the panel that does own the field, which is the half the register's old sentence
 * (*"its mid-run weight-set selection"*) left the reader to find.
 */
export const SELECTION_REFUSAL =
  'Its mid-run weight-set selection is not editable here, and not because nothing reads it: the ' +
  'Selector panel owns those seven fields, and the run rebuilds selection from what that panel ' +
  'holds — so a second copy set here would be overwritten before the shift started. Saving keeps ' +
  'this dispatcher’s own selection block exactly as it is.';

/* -------------------------------------------------------------------------- *
 * The partition — § 3.6's completeness clause as a value
 * -------------------------------------------------------------------------- */

/** Where every dimension of a space ends up. Total by construction; asserted both ways in the test. */
export interface FamilyPartition {
  /** Ids with a control in a family block. */
  readonly authored: readonly string[];
  /** Ids drawn as the thirteen weight sliders. */
  readonly weights: readonly string[];
  /** Ids whose control is a flag this panel already draws — {@link FLAG_OWNED}. */
  readonly flagOwned: readonly string[];
  /** Ids refused, with {@link SELECTION_REFUSAL} beside them. */
  readonly refused: readonly string[];
  /** Ids in none of the four. **Must be empty**, and the test says so. */
  readonly unaccounted: readonly string[];
}

export function familyPartitionOf(space: SearchSpace): FamilyPartition {
  const authored = new Set(Object.values(FAMILY_DIMENSIONS).flat());
  const flagOwned = new Set(FLAG_OWNED);
  const partition = {
    authored: [] as string[],
    weights: [] as string[],
    flagOwned: [] as string[],
    refused: [] as string[],
    unaccounted: [] as string[],
  };
  for (const parameter of space.parameters) {
    if (parameter.section === WEIGHTS_SECTION) partition.weights.push(parameter.id);
    else if (parameter.section === REFUSED_SECTION) partition.refused.push(parameter.id);
    else if (flagOwned.has(parameter.id)) partition.flagOwned.push(parameter.id);
    else if (authored.has(parameter.id)) partition.authored.push(parameter.id);
    else partition.unaccounted.push(parameter.id);
  }
  return partition;
}

/* -------------------------------------------------------------------------- *
 * The point, and what the reader moved
 * -------------------------------------------------------------------------- */

/**
 * The point the family controls draw at: the draft profile's own values, with the reader's moves
 * laid back over the top.
 *
 * The overlay is what makes an **overridden** control honest. `profileFromSpec` writes six fields
 * from the flags and the dwell chips after the family patch, so reading the point off the draft
 * alone would show the flag's value in a control the reader had set to something else — the move
 * would appear not to have happened. Laying `moved` back on shows what they asked for, and
 * {@link familyOverridesOf} says beside it what the run will use instead.
 */
export function familyValuesOf(
  space: SearchSpace,
  draft: DispatcherProfile,
  moved: Readonly<Record<string, ParameterValue>>,
): ControlValues {
  const values = new Map(valuesFromProfile(space, draft));
  for (const [id, value] of Object.entries(moved)) {
    if (space.byId.has(id)) values.set(id, value);
  }
  return values;
}

/**
 * The moves that are still moves — the record with anything back at the base's own value dropped.
 *
 * Pruning matters for exactly one property, and it is the acceptance criterion's negative half:
 * **re-authoring a shipped profile's exact values must produce a bit-identical run.** A record that
 * remembered a dimension the reader had put back would author it explicitly, and a profile that
 * spells out a value it inherited is not the same document as one that inherited it — `predictive-
 * balanced` with `dispatch.commitmentPoint` written out is still the same *run*, but the
 * distinction is one `profileFromSpec` is explicit about keeping, and a record that quietly widened
 * it would be this panel deciding what a dispatcher is.
 */
export function prunedFamilyMoves(
  space: SearchSpace,
  base: DispatcherProfile | undefined,
  moved: Readonly<Record<string, ParameterValue>>,
): Readonly<Record<string, ParameterValue>> {
  if (base === undefined) return moved;
  const origin = valuesFromProfile(space, base);
  const kept: Record<string, ParameterValue> = {};
  for (const [id, value] of Object.entries(moved)) {
    if (!space.byId.has(id)) continue;
    if (String(origin.get(id)) === String(value)) continue;
    kept[id] = value;
  }
  return kept;
}

/* -------------------------------------------------------------------------- *
 * Which controls a flag outranks — § 3.6 rule 3, and § D227 both ways
 * -------------------------------------------------------------------------- */

/**
 * The fields `authoring/dispatcherSpec.ts#profileFromSpec` writes from a flag or a lever, and the
 * control that writes them — as a sentence, at the control it outranks.
 *
 * Read this table beside `profileFromSpec` and nowhere else: every entry is a line in that function
 * that assigns into `dispatch`, `answer` or `idle` **after** the family patch has been merged onto
 * the base. `dispatch.splitThresholdPassengers` is deliberately absent — the zoning flag writes it
 * with `??`, so a value set here survives — and `familyControls.test.ts` proves both halves by
 * running the conversion over every flag and lever combination rather than by reading the code
 * twice.
 *
 * `dispatch.passengerAssignment` is also absent, and for a better reason: `profileFromSpec` deletes
 * it exactly when `flags.pool` is off, which is exactly when its declared `activeWhen` on
 * `dispatch.callType` is unsatisfied — so the schema's own gate already refuses the edit and draws
 * the reason. A second sentence about it would be the panel agreeing with itself.
 */
export function familyOverridesOf(
  spec: DispatcherSpec,
  levers: GroupLevers,
): ReadonlyMap<string, string> {
  const zoned = spec.flags.zone || levers.express;
  const parked = zoned || levers.parking;
  const notes = new Map<string, string>();
  if (zoned) {
    notes.set(
      'dispatch.assignmentMode',
      'A zoning control above is on — “Give each car a slice of the tower”, or the Express zoning ' +
        'lever — and it writes split-demand into this field, so the run uses that. Turn it off and ' +
        'this control decides again.',
    );
  }
  if (parked) {
    notes.set(
      'idle.parkingStrategy',
      'A parking control above is on — the zoning switch, Express zoning or Park in the lobby — ' +
        'and it writes this field, so the run uses its answer. Turn them off and this control ' +
        'decides again.',
    );
  }
  if (levers.dwell !== undefined) {
    const said =
      'A door-dwell chip is pressed above, and the chip writes this field, so the run uses the ' +
      'chip’s value. Press the lit chip again to return to the dispatcher’s own dwell and this ' +
      'control decides.';
    notes.set('answer.dwellPolicy', said);
    notes.set('answer.dwellAdaptationGain', said);
    notes.set('answer.maxDwellS', said);
  }
  return notes;
}

/* -------------------------------------------------------------------------- *
 * The view
 * -------------------------------------------------------------------------- */

/** One control as this block draws it: the schema's control, plus what outranks it. */
export interface FamilyRowView {
  readonly control: Control;
  /** The sentence naming the control above that writes this field, or `undefined`. */
  readonly overriddenBy: string | undefined;
}

/** One family block. */
export interface FamilyBlockView {
  readonly family: DispatcherFamily;
  readonly title: string;
  /** *Read by …* — the named non-test caller, on screen. */
  readonly caller: string;
  readonly rows: readonly FamilyRowView[];
}

/** The whole block, as the mount draws it and as the honesty corpus sweeps it. */
export interface FamilyControlsView {
  readonly eyebrow: string;
  readonly note: string;
  readonly blocks: readonly FamilyBlockView[];
  /** How many dimensions are drawn, how many are live, how many the reader has moved. */
  readonly status: string;
  /**
   * The dimensions this panel leaves to a control it already has, named rather than absent.
   *
   * The other refusal — {@link SELECTION_REFUSAL} — is deliberately **not** a field here. It is a
   * fact about the profile rather than about this block, and the editor has drawn facts about the
   * profile under its summary line since the register existed; carrying it in both places would be
   * two answers to *what can this panel not write*, which is the shape the register was built to
   * stop.
   */
  readonly elsewhere: string;
}

export const FAMILY_EYEBROW = 'THE FIVE FAMILIES';

/**
 * What this block is, said once above it.
 *
 * It names the two things a reader has to know before touching thirty-eight controls they have
 * never seen: every one of them is generated from the schema `core` declares (so the range beside
 * it is the range an optimizer would search, not a range this panel invented), and every block says
 * which function reads it.
 */
export const FAMILY_NOTE =
  'Everything below is generated from the schema core declares — the same dimensions a tuning run ' +
  'would search, with their own ranges, defaults and gates. Each block names the function that ' +
  'reads it on a real run, so a control here is never a control over a field nothing consults. A ' +
  'control whose gate is unmet is drawn disabled with the gate named, never hidden.';

/** The {@link FLAG_OWNED} sentence — said rather than left out. */
export const FAMILY_ELSEWHERE =
  'Two dimensions are missing from these blocks on purpose, and both already have a control: ' +
  'dispatch.callType is the “Ask where they are going” switch above, and answer.bypassLoadThreshold ' +
  'is “Read the load sensor”. Each of those switches writes its field on every save, so a second ' +
  'control here would be a control that never wrote anything.';

export interface FamilyControlsInput {
  readonly space: SearchSpace;
  readonly spec: DispatcherSpec;
  readonly levers: GroupLevers;
  /** The profile the draft currently describes — flags, levers and family moves already applied. */
  readonly draft: DispatcherProfile;
  /** The profile the draft was read from, for the moved count. `undefined` for a blank spec. */
  readonly base: DispatcherProfile | undefined;
}

/**
 * The whole block as data — pure, so the honesty corpus can sweep every string without a document.
 *
 * `controlsFor` is called **once** over the whole space and the result is partitioned into blocks,
 * rather than once per block over a narrowed space: `activeWhen` is evaluated against the point,
 * and a point narrowed to one family would have no value for the gate a dimension in another
 * family declares. `dispatch.passengerAssignment` gates on `dispatch.callType`, which this block
 * does not draw at all — narrowing first is how that gate would have silently read `undefined`.
 */
export function familyControlsViewOf(input: FamilyControlsInput): FamilyControlsView {
  const values = familyValuesOf(input.space, input.draft, input.spec.families);
  const overrides = familyOverridesOf(input.spec, input.levers);
  const byId = new Map(controlsFor(input.space, values).map((control) => [control.id, control]));

  const blocks: FamilyBlockView[] = [];
  let drawn = 0;
  let live = 0;
  for (const family of FAMILY_ORDER) {
    const rows: FamilyRowView[] = [];
    for (const id of FAMILY_DIMENSIONS[family]) {
      const control = byId.get(id);
      if (control === undefined) continue;
      drawn += 1;
      if (control.enabled) live += 1;
      rows.push({ control, overriddenBy: overrides.get(id) });
    }
    if (rows.length === 0) continue;
    blocks.push({
      family,
      title: FAMILY_TITLES[family],
      caller: `Read by ${FAMILY_CALLERS[family]}.`,
      rows,
    });
  }

  const moved = Object.keys(prunedFamilyMoves(input.space, input.base, input.spec.families)).length;
  return {
    eyebrow: FAMILY_EYEBROW,
    note: FAMILY_NOTE,
    blocks,
    status:
      `${String(drawn)} of ${String(input.space.ids.length)} declared dimensions are drawn here · ` +
      `${String(live)} live at this setting · ${String(moved)} moved from the dispatcher you opened`,
    elsewhere: FAMILY_ELSEWHERE,
  };
}
