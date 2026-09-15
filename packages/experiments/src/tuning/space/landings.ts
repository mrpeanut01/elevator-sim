/**
 * **A per-floor panel set, as a search space** — GitHub issue #534 item 5, `DECISIONS.md` § D553
 * item 8, § D571.
 *
 * ## The gap this closes, and the two it deliberately does not
 *
 * § D553 gave a floor its own hall fixture (`FloorConfig.landingCallType`) and recorded, in item 8,
 * that the set of them has no dimension anywhere: `tuning/space` takes numbers, strings and
 * booleans, and a per-floor set is none of those. It also said where such a dimension belongs —
 * *"it is keyed by floor id, which is a building's, so it belongs to a per-building space rather
 * than to a dispatcher profile's"* — and that stage 1 built neither.
 *
 * This module builds the per-building one, and only that. It is **not** collected by
 * `collectSearchSpace`, and it must not be: that space's membership rule is *"a dispatcher profile
 * can hold this id"*, decided by writing the value into a profile and parsing it, and
 * `landings.<floorId>.destinationPanel` fails that rule for the reason § D553 gives — the id names a
 * floor, and a floor belongs to a building.
 *
 * ## Why a boolean per floor and not a categorical per floor
 *
 * § D553 item 8 offers both: *"one categorical per floor over `CALL_TYPES` — or a boolean* panel
 * here *over one destination type"*. The boolean is built, and the reason is **stage 2's pricing**
 * rather than a preference between two encodings:
 *
 * - `docs/38` § 2.1 prices destination panels **per landing**, through PR #527's rate × quantity
 *   seam. The quantity is *how many landings have a panel*, which a boolean set answers exactly:
 *   {@link panelCountOf}. A categorical over three call types does not — it would make the
 *   quantity a question about which fixtures are the same *fitting*, and nothing in the schedule
 *   says whether a kiosk, a reader and a button are priced alike. Guessing would be the mechanism
 *   this repository refuses to state without measuring.
 * - The two are not alternatives forever. A categorical per floor is a **widening** of this
 *   dimension, not a replacement: the ids stay, and `true` gains a second axis saying *which*
 *   fixture. Stage 2 extends it on the commit the schedule prices the fixtures separately, and not
 *   before.
 *
 * So what waits on stage 2 is the fixture axis and the price row, and what does not wait is the
 * set itself — because the set is what the fuzzer, the survivor sweep (§ D528) and the pricing all
 * need first, and none of them can be written against a dimension that does not exist.
 *
 * ## `true` means the dispatcher's own panel, and `false` means a button
 *
 * A landing's `landingCallType` is **tri-state**: absent (follow the dispatcher), a destination
 * fixture, or a button. A boolean has two states, so the mapping has to make absent expressible or
 * the encoding would change what a run means:
 *
 * - **the default is read off the resolved stage**, not written down as a constant. Under a
 *   dispatcher whose call type carries a destination every landing defaults to `true`; under a
 *   conventional one, to `false`. So {@link defaultCandidate} of this space decodes to the building
 *   exactly as it ships — § D553 clause 1's identity, which `sim/landingPanelIdentity.test.ts`
 *   holds byte for byte over every shipped building.
 * - **the value `true` decodes to the dispatcher's own call type** wherever that carries a
 *   destination, so a `true` landing under a destination dispatcher is byte-identical to an
 *   undeclared one rather than merely equivalent.
 *
 * ## What the space refuses, and what it does not
 *
 * Nothing. The declared box **is** the feasible set here, and saying so is a claim rather than a
 * gap: any subset of a building's landings may carry a panel, and the two refusals `core` makes
 * about landing fixtures are properties of the *fixture* and not of the set — a `destination-entry`
 * landing under a deferring dispatcher (`Simulation`'s constructor) and a panel under a call type
 * that cannot ask for a destination (`resolveDispatchConfig`). Both are decided by
 * {@link panelCallTypeFor} before a candidate exists, which is why `validate` has nothing left to
 * ask. `collectSearchSpace`'s space needs a `validate` because an optimizer sampling its rows
 * independently leaves the feasible box one draw in eight; this one cannot.
 *
 * ## Determinism (CLAUDE.md invariant 2)
 *
 * Every draw comes from the caller's injected `Rng`. There is no `Math.random()` here and no state
 * between calls: `landingPanelSpaceFor(floors, stage)` is a pure function of its arguments.
 */

import { isDestinationCallType, type CallType } from '@elevator-sim/core';

import type {
  BooleanParameter,
  Candidate,
  ParameterValue,
  SearchParameter,
  SearchSpace,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Ids
 * -------------------------------------------------------------------------- */

/**
 * The section every landing dimension lives in.
 *
 * Deliberately **not** one of `PROFILE_SECTIONS`: a dispatcher profile has no `landings` section
 * and `parseDispatcherProfiles` would refuse one, which is the mechanical form of § D553 item 8's
 * ruling. A reader who sees this prefix in a candidate knows immediately that the candidate is a
 * building's rather than a dispatcher's.
 */
export const LANDING_SECTION = 'landings';

/** The key every landing dimension carries under its floor. */
export const LANDING_PANEL_KEY = 'destinationPanel';

/** `landings.<floorId>.destinationPanel` — the dotted id of one landing's dimension. */
export function landingPanelParameterId(floorId: string): string {
  return `${LANDING_SECTION}.${floorId}.${LANDING_PANEL_KEY}`;
}

/*
 * **There is deliberately no inverse of {@link landingPanelParameterId} here.**
 *
 * One was written — `floorIdOfLandingParameter`, parsing a floor id back out of a dotted id — and
 * deleted before this file landed, because nothing calls it: {@link landingCallTypesFrom} and
 * {@link panelCountOf} iterate the space's own `floorIds` rather than the candidate's keys, on
 * purpose, so a candidate carrying a stray id cannot inflate a count. An exported function whose
 * only callers are its own tests is the standing requirement's defect (`CLAUDE.md` § *name the
 * non-test caller*), and `tuning/deadCode.test.ts` said so on the first run. Stage 2 adds one on
 * the commit something needs it.
 */

/* -------------------------------------------------------------------------- *
 * What the two values mean for one dispatcher
 * -------------------------------------------------------------------------- */

/** The half of a resolved dispatch stage a landing set has to read. */
export interface LandingStage {
  readonly callType: CallType;
  /** Whether restricted landings in this building would be locked out by an uncredentialed call. */
  readonly callCarriesCredential?: boolean | undefined;
}

/** The fixture a `false` landing declares. A button is a button under every dispatcher. */
export const BUTTON_CALL_TYPE: CallType = 'up-down-buttons';

/**
 * The fixture a `true` landing declares, for a dispatcher and a building.
 *
 * Three cases, and the third exists to avoid manufacturing a defect that is **open in `core`**:
 *
 * 1. The dispatcher's call type already carries a destination — use it, so a `true` landing is
 *    byte-identical to an undeclared one (§ D553 clause 1).
 * 2. It does not — use `mobile-credential`, the rung that knows both the destination and the
 *    credential, so a panel landing under a conventional dispatcher is a reader rather than a
 *    kiosk.
 * 3. It carries a destination but **no credential**, and the building has access-restricted
 *    landings — use `mobile-credential` anyway. A destination call with no credential whose head
 *    of queue is bound for a restricted floor strands everybody behind them; that is `C35`,
 *    measured at 32 failures in 2 000 deep fuzz cases and **unfixed** (`DECISIONS.md` § D128,
 *    `fuzz/generate.ts` § *What the widening found*). A generator that drew it would report a
 *    known-open `core` defect as a finding of its own, which is the same mistake the `unroutable`
 *    skip exists to keep out of the campaign — so the combination is not drawn, and this comment is
 *    the record that it is avoided rather than absent.
 */
export function panelCallTypeFor(stage: LandingStage, hasAccessZones: boolean): CallType {
  if (!isDestinationCallType(stage.callType)) return 'mobile-credential';
  if (hasAccessZones && stage.callCarriesCredential === false) return 'mobile-credential';
  return stage.callType;
}

/* -------------------------------------------------------------------------- *
 * The space
 * -------------------------------------------------------------------------- */

/** What {@link landingPanelSpaceFor} needs to know about the building and the dispatcher. */
export interface LandingPanelSpaceOptions {
  /** Every landing of the building, in building order. A floor no bank serves is still a landing. */
  readonly floorIds: readonly string[];
  /** The resolved dispatch stage the set will run under. */
  readonly stage: LandingStage;
  /** Whether the building declares access zones. See {@link panelCallTypeFor}. */
  readonly hasAccessZones?: boolean | undefined;
}

/** A landing set's space, plus the two call types its booleans decode to. */
export interface LandingPanelSpace {
  readonly space: SearchSpace;
  readonly panelCallType: CallType;
  readonly buttonCallType: CallType;
  /** Floor ids in the order the dimensions were built, which is building order. */
  readonly floorIds: readonly string[];
}

/**
 * One boolean dimension per landing, in building order.
 *
 * The result is a real {@link SearchSpace}: `sampleCandidate`, `sampleCandidates`,
 * `perturbCandidate`, `defaultCandidate` and `candidatesEqual` all take it unchanged, which is the
 * whole point — *"do not build a dimension the search cannot actually sample"*. The fuzz campaign
 * draws one per case through `sampleCandidate` (`fuzz/generate.ts`), which is this module's
 * non-test caller.
 *
 * @throws Error if two landings share an id, which would make one dimension shadow the other.
 */
export function landingPanelSpaceFor(options: LandingPanelSpaceOptions): LandingPanelSpace {
  const panelCallType = panelCallTypeFor(options.stage, options.hasAccessZones ?? false);
  const panelIsDefault = isDestinationCallType(options.stage.callType);

  const parameters: SearchParameter[] = [];
  const defaults = new Map<string, ParameterValue>();
  const seen = new Set<string>();
  for (const floorId of options.floorIds) {
    if (seen.has(floorId)) {
      throw new Error(
        `building declares floor "${floorId}" twice, so its landing dimension would shadow itself.`,
      );
    }
    seen.add(floorId);
    const parameter: BooleanParameter = {
      id: landingPanelParameterId(floorId),
      section: LANDING_SECTION,
      key: `${floorId}.${LANDING_PANEL_KEY}`,
      type: 'boolean',
      // Read off the resolved stage rather than written down: the default has to decode to the
      // building as it ships, and what that is depends on the dispatcher. See the module docstring.
      default: panelIsDefault,
      description:
        'Whether this landing carries a destination panel. True declares FloorConfig.landingCallType as the dispatcher’s own destination fixture; false declares up/down buttons. The count of true landings is the quantity a per-panel price multiplies (docs/38 § 2.1).',
      declaredBy: ['landingPanelSpaceFor'],
    };
    parameters.push(parameter);
    defaults.set(parameter.id, parameter.default);
  }

  const byId = new Map(parameters.map((parameter) => [parameter.id, parameter]));
  const space: SearchSpace = Object.freeze({
    parameters: Object.freeze(parameters),
    byId,
    ids: Object.freeze(parameters.map((parameter) => parameter.id)),
    allById: byId,
    defaults,
    // Nothing to refuse — see the module docstring. Stated as a function that always answers
    // `undefined` rather than omitted, because `SearchSpace` requires one and a reader should meet
    // the claim here rather than infer it from a missing field.
    validate: () => undefined,
    unsearchable: Object.freeze(new Map<string, string>()),
  });

  return Object.freeze({
    space,
    panelCallType,
    buttonCallType: BUTTON_CALL_TYPE,
    floorIds: Object.freeze([...options.floorIds]),
  });
}

/* -------------------------------------------------------------------------- *
 * Decoding
 * -------------------------------------------------------------------------- */

/**
 * A candidate as the `landingCallType` each floor should declare.
 *
 * Every landing the space covers gets an entry, including the ones whose value equals the
 * dispatcher's own fixture: an explicit declaration of the dispatcher's own call type is
 * byte-identical to no declaration (§ D553 clause 1, held by `sim/landingPanels.test.ts` AC1 and
 * measured over every shipped building by `sim/landingPanelIdentity.test.ts`), so writing it is
 * honest and omitting it would make the encoding lossy — a reader could not tell *this landing has
 * a button* from *this landing was not in the space*.
 *
 * A landing the candidate does not carry takes the space's default, so a subspace draw decodes to a
 * whole building rather than to a partial one.
 */
export function landingCallTypesFrom(
  panels: LandingPanelSpace,
  candidate: Candidate,
): Readonly<Record<string, CallType>> {
  const out: Record<string, CallType> = {};
  for (const floorId of panels.floorIds) {
    const id = landingPanelParameterId(floorId);
    const value = candidate.get(id) ?? panels.space.defaults.get(id);
    out[floorId] = value === true ? panels.panelCallType : panels.buttonCallType;
  }
  return out;
}

/**
 * How many landings this candidate puts a panel on — the **quantity** a per-panel price multiplies.
 *
 * The one number stage 2's pricing needs from this dimension, and the reason the dimension is a
 * boolean per floor rather than a categorical per floor. Counted over the space's own floor ids so
 * a candidate carrying a stray id cannot inflate it.
 */
export function panelCountOf(panels: LandingPanelSpace, candidate: Candidate): number {
  let count = 0;
  for (const floorId of panels.floorIds) {
    const id = landingPanelParameterId(floorId);
    if ((candidate.get(id) ?? panels.space.defaults.get(id)) === true) count += 1;
  }
  return count;
}

/**
 * Whether this candidate would make the run `hybrid` — some landings naming a car and some not.
 *
 * Only ever true under a dispatcher that assigns: `metrics/comparability.ts#landingPassengerModelOf`
 * makes every landing `conventional` when `dispatch.passengerAssignment` is not `panel`, whatever
 * its fixture discloses. So the caller passes that in rather than this module guessing it, which is
 * the same split `passengerModelOf` makes.
 */
export function wouldBeHybrid(
  panels: LandingPanelSpace,
  candidate: Candidate,
  stageAssigns: boolean,
): boolean {
  if (!stageAssigns) return false;
  if (!isDestinationCallType(panels.panelCallType)) return false;
  const count = panelCountOf(panels, candidate);
  return count > 0 && count < panels.floorIds.length;
}
