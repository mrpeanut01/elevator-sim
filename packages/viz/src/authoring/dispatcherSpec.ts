/**
 * The dispatcher editor's model: a flat, slider-shaped struct that becomes a real
 * {@link DispatcherProfile} the simulator dispatches with.
 *
 * ## Why a separate shape at all
 *
 * A `DispatcherProfile` is nested — `weights`, `dispatch`, `answer`, `idle`, `eligibility`,
 * `auction`, `selection` — and every field is optional with a resolver-side default. That is right
 * for a file somebody authors and wrong for a panel of sliders: a control bound to
 * `profile.answer?.bypassLoadThreshold` has to invent what "unset" means every time it draws, and
 * the two inventions drift.
 *
 * So the editor edits a total, flat {@link DispatcherSpec} and this module owns the two
 * conversions. `fromProfile` is total — every shipped profile has a spec — and `toProfile` emits
 * only the fields the reader actually moved, so a spec built from `collective` and saved unchanged
 * produces a profile that resolves identically to `collective`. {@link specRoundTrips} asserts
 * exactly that on all twelve shipped profiles, which is the test that stops this module quietly
 * becoming a second dispatcher definition.
 *
 * ## The anti-inertness rule
 *
 * `data/dispatcher-profiles.json` already contains one instance of this repository's signature
 * defect: `destination-eta` shipped with `weights.rideTime: 0` and a destination call type, so the
 * destination reached `estimateCost` and changed no decision — bit-identical to `eta` at 8 of 8
 * matrix cells (`DECISIONS.md` § D112). A weight the engine declares inert is a slider that moves
 * nothing.
 *
 * Two consequences here, and both are enforced rather than documented:
 *
 * 1. {@link inertTerms} names, for a given spec, every weighted term the engine will not read —
 *    today that is `rideTime` under a non-destination `callType`, which is exactly § D112's case.
 *    The editor draws the refusal beside the control rather than dropping it (the pattern
 *    `docs/10` § 11 W4 established for the generated parameter form).
 * 2. {@link toProfile} never writes a weight of zero. Saturating normalization maps a raw zero to
 *    zero, so an explicit `0` and an absent term score identically — and an absent term is the
 *    honest spelling, because it does not claim the dispatcher considers something it does not.
 */

import type { DispatcherProfile } from '@elevator-sim/core/browser';
import {
  applyPatch,
  candidateFromProfile,
  collectSearchSpace,
  decodeCandidate,
  type ParameterValue,
  type SearchSpace,
} from '@elevator-sim/experiments/browser';

/** The twelve term ids, in the order `data/dispatcher-profiles.json` declares them. */
export type TermId = string;

/**
 * The three flags the handoff's editor exposes — `docs/12-design-handoff.md` § 1.3 M8.
 *
 * The handoff has exactly three and they are the three a reader can reason about. Note what
 * `pool` is **not**: it is destination *disclosure* (`callType: mobile-credential`,
 * `passengerAssignment: none`), the Level-0 arm. Level 1 — the landing panel naming a car — is a
 * passenger-model change that makes nine of the twenty-three replication metrics uncomparable
 * (`docs/09` § 1.1, `DECISIONS.md` § D27), and putting it behind the same switch as "pool riders by
 * destination" would let a reader change the passenger model by accident. It stays reachable only
 * by choosing the shipped `destination-panel` profile, where the choice is named.
 */
export interface DispatcherFlags {
  /** Ask where they are going. `dispatch.callType: mobile-credential`. */
  readonly pool: boolean;
  /** Give each car a slice of the tower. `idle.parkingStrategy: zone-center` + `split-demand`. */
  readonly zone: boolean;
  /** Read the load sensor. `answer.bypassLoadThreshold`. */
  readonly bypass: boolean;
}

/** The editor's whole state. Flat, total, and directly bindable to a control. */
export interface DispatcherSpec {
  readonly name: string;
  /** Term id to a `0..100` slider position. `weight = position / 100`. */
  readonly weights: Readonly<Record<TermId, number>>;
  readonly flags: DispatcherFlags;
  /**
   * The family controls' moves — `docs/21` § 3.6, `dev/familyControls.ts`.
   *
   * A dotted `collectSearchSpace()` id to the value the reader set, and **only** the ids they
   * actually moved. Not a full point: a record of every dimension would author every default onto
   * every saved profile, and the module docstring's rule is that a profile which spells out a value
   * it inherited is not the same document as one that inherited it.
   *
   * Flat rather than nested by section for the reason the whole spec is flat — the ids are the
   * schema's own paths, so nothing here has to invent what a section is. {@link profileFromSpec}
   * turns them back into nested JSON through `decodeCandidate`, which is the shipped conversion an
   * optimizer's winner goes through, not a second one written here.
   */
  readonly families: Readonly<Record<string, ParameterValue>>;
}

/**
 * The group levers — `docs/12` § 1.3 M8's *apply to whoever is driving* block.
 *
 * Separate from {@link DispatcherSpec} on purpose. A spec is a dispatcher a reader saved; the
 * levers are overrides applied on top of **whichever** dispatcher is selected, including a shipped
 * one they have not edited. Folding them into the spec would mean pulling a lever silently forked
 * the profile, and the picture would then be of a dispatcher that is not the one named in the rail.
 */
export interface GroupLevers {
  /** Park in the lobby before the rush. `idle.parkingStrategy: lobby`. */
  readonly parking: boolean;
  /** Express zoning. `idle.parkingStrategy: zone-center`. Outranks {@link parking}. */
  readonly express: boolean;
  /**
   * Door dwell: snappy, normal, patient — or **`undefined`, meaning the dispatcher's own**.
   *
   * The fourth state is not a fourth chip and it is not optional. A lever whose default value is
   * itself an override silently rewrites every profile that authored a dwell: `energy-aware` ships
   * `dwellPolicy: 'adaptive'` with a gain of 0.2 and a 10 s ceiling, and a *normal* chip pressed by
   * nobody replaced all three the moment the page loaded. That was caught by the run-identity test
   * in `authoring.test.ts`, which is the only place it could have been caught — the page looked
   * right and the dispatcher was not the one named in the rail.
   *
   * So the levers start at *inherit*, {@link dwellChoiceOf} presses a chip when the running
   * profile's own dwell happens to be one of the three, and nothing is written until a reader
   * chooses. The handoff's three chips are unchanged; what changed is which of them is lit before
   * anybody touches it.
   */
  readonly dwell: DwellChoice | undefined;
}

export const DWELL_CHOICES = ['snappy', 'normal', 'patient'] as const;
export type DwellChoice = (typeof DWELL_CHOICES)[number];

/**
 * How each dwell choice reaches the simulation — **and the knob it took two attempts to find.**
 *
 * The obvious mapping is `answer.maxDwellS`, and it is decoration. Under the default
 * `dwellPolicy: 'fixed'` the door machine holds for `dwellCarCallS`/`dwellHallCallS` — which come
 * from the **car**, resolved out of `data/elevator-specs.json` — and `maxDwellS` only bounds the
 * transfer. Three chips writing `maxDwellS` produced three byte-identical runs, which
 * `authoring.test.ts` caught before this shipped. That is the eleventh dead seam, avoided by
 * requiring the run to change rather than by reading the field name.
 *
 * The real knobs are two, and using both is what makes the handoff's own copy true:
 *
 * - **`dwellCarCallS` / `dwellHallCallS` on every car** — the base hold. The three values are
 *   `data/elevator-specs.json`'s own `doors.dwellHallCallS` band, `{min: 4, typical: 5, max: 7}`,
 *   and its `dwellCarCallS` band, `{min: 2, typical: 3, max: 4}`. *Snappy* is the **code minimum**
 *   rather than something faster: a dwell below the minimum is not a setting an operator has, it is
 *   a door closing on people, and the simulator would be modelling a building nobody could
 *   commission.
 * - **`answer.dwellPolicy: 'adaptive'` for *patient*** — the door extends with the queue at the
 *   landing, capped by `maxDwellS`. That is the half of *"everybody gets on"* a longer fixed hold
 *   cannot express, because a fixed hold waits just as long at an empty landing.
 */
export interface DwellSetting {
  /** Seconds a door holds after a car call. `doors.dwellCarCallS` in the reference data. */
  readonly dwellCarCallS: number;
  /** Seconds a door holds after a hall call. `doors.dwellHallCallS`. */
  readonly dwellHallCallS: number;
  readonly dwellPolicy: 'fixed' | 'adaptive';
  /** Only read under `adaptive`: seconds added per waiting passenger. */
  readonly dwellAdaptationGain: number;
  /** The ceiling. Must be at least the larger base dwell, or `resolveDoorConfig` throws. */
  readonly maxDwellS: number;
}

export const DWELL_SETTINGS: Readonly<Record<DwellChoice, DwellSetting>> = Object.freeze({
  snappy: Object.freeze({
    dwellCarCallS: 2,
    dwellHallCallS: 4,
    dwellPolicy: 'fixed' as const,
    dwellAdaptationGain: 0,
    maxDwellS: 20,
  }),
  normal: Object.freeze({
    dwellCarCallS: 3,
    dwellHallCallS: 5,
    dwellPolicy: 'fixed' as const,
    dwellAdaptationGain: 0,
    maxDwellS: 20,
  }),
  patient: Object.freeze({
    dwellCarCallS: 4,
    dwellHallCallS: 7,
    dwellPolicy: 'adaptive' as const,
    dwellAdaptationGain: 0.6,
    maxDwellS: 14,
  }),
});

export const DWELL_HINTS: Readonly<Record<DwellChoice, string>> = Object.freeze({
  snappy:
    'Doors close as soon as the code minimum allows — 4 s on a hall call. Faster round trips, and more riders left behind at a busy floor.',
  normal: 'The reference dwell for a hall call — 5 s, from data/elevator-specs.json.',
  patient:
    'A 7 s hold that extends further while people are still arriving. Everybody gets on, and each stop costs longer — which is what round-trip time is made of.',
});

export const DEFAULT_LEVERS: GroupLevers = Object.freeze({
  parking: false,
  express: false,
  dwell: undefined,
});

/** `hallCallBypassThreshold` from `data/elevator-specs.json`'s `loadSensor` block. */
const BYPASS_ON = 0.8;
/**
 * Full, and not a hundredth more.
 *
 * The first attempt at *blind to the load sensor* was `1.11` — just past
 * `loadSensor.overloadAlarmThreshold` — on the reasoning that a threshold above overload can never
 * fire. `resolveLoadSensor` rejects it: **the threshold is a fraction of rated load in `(0, 1]`**,
 * and a car whose sensor is configured outside that range is a `ModelError` rather than a car with
 * the sensor off.
 *
 * So *off* is `1`: a car stops taking hall calls only when it is completely full, which is the
 * physical fact the sensor cannot be argued out of, and the 80 % courtesy bypass — *"the real
 * production feature behind skip floors that have been called"*, in `elevator-specs.json`'s own
 * words — is what the flag removes. That is exactly the handoff's blurb: *"turn it off and watch it
 * sail past people"*.
 */
const BYPASS_OFF = 1;

/**
 * The dispatcher search space, built once.
 *
 * Memoised because {@link profileFromSpec} runs on every render of four panels and on every build
 * of a run, and `collectSearchSpace()` walks every declared schema each time it is called. The
 * space is a pure function of `core`'s declarations, so one copy is one answer.
 */
let searchSpace: SearchSpace | undefined;

function familySpace(): SearchSpace {
  searchSpace ??= collectSearchSpace();
  return searchSpace;
}

/**
 * A base profile with the family controls' moves merged onto it, per field within each section.
 *
 * `decodeCandidate` + `applyPatch` are `tuning/space/encode.ts`'s own pair — the conversion an
 * optimizer's winner goes through on its way to a profile — rather than a second walk written here.
 * That buys three things this module would otherwise have had to re-decide: `constraints.*` is
 * emitted as the `hardConstraints` **array** it is authored as, sections merge field by field so a
 * move under `idle.*` does not drop the base's `predictorHorizonS`, and an id the space does not
 * declare is refused rather than written.
 *
 * Identity when nothing moved, and that is structural rather than an optimisation: the acceptance
 * criterion for the family controls is that re-authoring a shipped profile's exact values produces
 * a **bit-identical** run, and the cheapest way to be sure is for the empty case to return the same
 * object it was handed.
 */
function withFamilies(
  base: DispatcherProfile | undefined,
  families: Readonly<Record<string, ParameterValue>>,
): DispatcherProfile | undefined {
  const ids = Object.keys(families);
  if (ids.length === 0) return base;
  const space = familySpace();
  const candidate = new Map<string, ParameterValue>();
  for (const id of ids) {
    if (space.byId.has(id)) candidate.set(id, families[id] as ParameterValue);
  }
  if (candidate.size === 0) return base;
  const source = base ?? ({ id: 'draft', name: 'draft', weights: {} } as DispatcherProfile);
  return applyPatch(space, source, decodeCandidate(space, candidate)) as unknown as DispatcherProfile;
}

/** Read a shipped or saved profile into the editor's shape. Total. */
export function specFromProfile(profile: DispatcherProfile, name?: string): DispatcherSpec {
  const weights: Record<string, number> = {};
  for (const [term, weight] of Object.entries(profile.weights ?? {})) {
    weights[term] = Math.round(weight * 100);
  }
  return {
    name: name ?? `Copy of ${profile.name}`,
    weights,
    // Empty, and never read back off the profile: the profile *is* the base the family controls
    // are moves against, so a record populated from it would say every field had been moved and
    // `profileFromSpec` would author the lot.
    families: {},
    flags: {
      pool: profile.dispatch?.callType !== undefined && profile.dispatch.callType !== 'up-down-buttons',
      zone: profile.idle?.parkingStrategy === 'zone-center',
      // Absent means the resolver's default, which reads the sensor.
      bypass: (profile.answer?.bypassLoadThreshold ?? BYPASS_ON) <= 1,
    },
  };
}

/** A spec with every term at zero, for a reader starting from nothing. */
export function blankSpec(termIds: readonly TermId[]): DispatcherSpec {
  const weights: Record<string, number> = {};
  for (const term of termIds) weights[term] = 0;
  return {
    name: 'My dispatcher',
    weights,
    families: {},
    flags: { pool: false, zone: false, bypass: true },
  };
}

export interface ToProfileOptions {
  readonly id: string;
  /** Applied on top, so a lever moves a shipped dispatcher without forking it. */
  readonly levers?: GroupLevers | undefined;
  /**
   * The profile this spec was read from.
   *
   * Supplied so a field the editor does not expose — `auction.rounds`, `dispatch.deferWindowS`,
   * `selection` — survives an edit instead of being silently reset to the resolver's default.
   * Without it, editing `auction-multi-round`'s weights would quietly turn it into a single-round
   * auction, which is a different dispatcher wearing the same name.
   */
  readonly base?: DispatcherProfile | undefined;
}

/**
 * Turn the editor's shape into a profile the simulator will dispatch with.
 *
 * Every field written here is one the reader moved, or one {@link ToProfileOptions.base} already
 * carried. Nothing is written to its default value: a profile that spells out the defaults is
 * indistinguishable from one that meant them, and the next reader cannot tell which fields are
 * decisions.
 */
export function profileFromSpec(spec: DispatcherSpec, options: ToProfileOptions): DispatcherProfile {
  /*
   * The family moves are merged onto the base **first**, so everything below writes over them.
   *
   * That ordering is a decision and it is drawn on screen. Six fields are written from the three
   * flags and the dwell chips — `dispatch.callType`, `dispatch.assignmentMode`,
   * `answer.bypassLoadThreshold`, the three dwell fields and `idle.parkingStrategy` — and a reader
   * looking at both controls has to be told which one the run obeys. Flags win, because they are
   * the coarse control a reader reaches first and the one whose label makes a claim about the
   * whole dispatcher; `dev/familyControls.ts#familyOverridesOf` names each override at the control
   * it outranks, and `familyControls.test.ts` proves the list is neither short nor long by running
   * this conversion over every flag and lever combination.
   */
  const base = withFamilies(options.base, spec.families);
  const levers = options.levers ?? DEFAULT_LEVERS;

  const weights: Record<string, number> = {};
  for (const [term, position] of Object.entries(spec.weights)) {
    // Never a zero. See the module docstring: an explicit 0 and an absent term score identically,
    // and only one of the two is honest about what the dispatcher considers.
    if (position > 0) weights[term] = position / 100;
  }

  const dispatch: Record<string, unknown> = { ...(base?.dispatch ?? {}) };
  if (spec.flags.pool) {
    dispatch['callType'] = base?.dispatch?.callType ?? 'mobile-credential';
  } else {
    delete dispatch['callType'];
    // A panel with no destination is not a configuration; drop the Level-1 switch with it.
    delete dispatch['passengerAssignment'];
  }
  if (spec.flags.zone || levers.express) {
    dispatch['assignmentMode'] = 'split-demand';
    dispatch['splitThresholdPassengers'] = dispatch['splitThresholdPassengers'] ?? 10;
  }

  const answer: Record<string, unknown> = { ...(base?.answer ?? {}) };
  answer['bypassLoadThreshold'] = spec.flags.bypass ? BYPASS_ON : BYPASS_OFF;
  if (levers.dwell !== undefined) {
    const dwell = DWELL_SETTINGS[levers.dwell];
    answer['dwellPolicy'] = dwell.dwellPolicy;
    answer['dwellAdaptationGain'] = dwell.dwellAdaptationGain;
    answer['maxDwellS'] = dwell.maxDwellS;
  }

  const idle: Record<string, unknown> = { ...(base?.idle ?? {}) };
  const parking = parkingFor(spec.flags, levers, base?.idle?.parkingStrategy);
  if (parking === undefined) delete idle['parkingStrategy'];
  else idle['parkingStrategy'] = parking;

  const profile: Record<string, unknown> = {
    ...(base ?? {}),
    id: options.id,
    name: spec.name.trim() === '' ? 'My dispatcher' : spec.name.trim(),
    engine: 'weighted-cost',
    weights,
  };
  assignOrDelete(profile, 'dispatch', dispatch);
  assignOrDelete(profile, 'answer', answer);
  assignOrDelete(profile, 'idle', idle);
  return profile as unknown as DispatcherProfile;
}

/**
 * Which parking strategy wins.
 *
 * Ordering, and the reason for each step:
 *
 * 1. **Express zoning** — the reader pulled a lever that says *give each car a slice*, and
 *    `zone-center` is what that means to the idle stage.
 * 2. **The flag** — the same claim made on the dispatcher rather than on the group.
 * 3. **Lobby parking** — the other lever, which is weaker than zoning because a car cannot park
 *    both in its zone's centre and in the lobby, and zoning is the more specific instruction.
 * 4. **The profile's own** — `predictive-balanced` parks on the forecast and nothing above asked
 *    otherwise, so it keeps doing that.
 */
function parkingFor(
  flags: DispatcherFlags,
  levers: GroupLevers,
  base: string | undefined,
): string | undefined {
  if (levers.express || flags.zone) return 'zone-center';
  if (levers.parking) return 'lobby';
  return base;
}

function assignOrDelete(target: Record<string, unknown>, key: string, value: object): void {
  if (Object.keys(value).length === 0) delete target[key];
  else target[key] = value;
}

/**
 * Terms this spec weights that the engine will not read, with the reason.
 *
 * `rideTime` is the whole of the list today, and it is § D112's defect stated as a rule rather than
 * discovered again: the term's own `activeWhen` declares it inert unless the call carries a
 * destination, so weighting it under `up-down-buttons` is authoring decoration.
 *
 * Returned rather than corrected. Silently turning the flag on would change the passenger model
 * under a reader who moved a slider; silently dropping the weight would hide that they had asked
 * for something. The editor draws the sentence.
 */
export function inertTerms(spec: DispatcherSpec): readonly { readonly termId: TermId; readonly why: string }[] {
  const out: { termId: TermId; why: string }[] = [];
  if ((spec.weights['rideTime'] ?? 0) > 0 && !spec.flags.pool) {
    out.push({
      termId: 'rideTime',
      why:
        'inert until the call carries a destination — turn on “Pool riders by destination” or this ' +
        'weight changes no decision, which is exactly what destination-eta shipped doing (§ D112).',
    });
  }
  return out;
}

/** Whether the editor's copy differs from the profile it was read from. */
export function specIsDirty(spec: DispatcherSpec, source: DispatcherProfile | undefined): boolean {
  if (source === undefined) return true;
  const original = specFromProfile(source, spec.name);
  /*
   * A family move counts as dirty — and it is checked against the source profile's own value
   * rather than against the record being non-empty, because `dev/familyControls.ts` keeps the
   * record pruned and this function must agree with it. A panel that said *unsaved changes* about
   * a control the reader had put back is the stale-confirmation defect the mount's
   * `forgetConfirmation` exists for, arriving from the other direction.
   */
  const space = familySpace();
  const point = candidateFromProfile(space, source);
  for (const [id, value] of Object.entries(spec.families)) {
    const held = point.get(id) ?? space.byId.get(id)?.default;
    if (String(held) !== String(value)) return true;
  }
  const terms = new Set([...Object.keys(original.weights), ...Object.keys(spec.weights)]);
  for (const term of terms) {
    if ((original.weights[term] ?? 0) !== (spec.weights[term] ?? 0)) return true;
  }
  return (
    original.flags.pool !== spec.flags.pool ||
    original.flags.zone !== spec.flags.zone ||
    original.flags.bypass !== spec.flags.bypass
  );
}

/** `cost = 1.00·wait + 0.30·starvation` — the handoff's summary line, § 1.3 M8. */
export function costFunctionLine(
  spec: DispatcherSpec,
  shortNameOf: (termId: TermId) => string,
): string {
  const parts = Object.entries(spec.weights)
    .filter(([, position]) => position > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([term, position]) => `${(position / 100).toFixed(2)}·${shortNameOf(term)}`);
  return parts.length === 0
    ? 'cost = nothing — every term is zero'
    : `cost = ${parts.join(' + ')}`;
}

/**
 * One sentence of advice about the vector, from the handoff's own table (§ M8).
 *
 * Each branch is a claim about a trade the reader has made, and every one of them is a claim this
 * simulator can support from its own term table. None of them says a configuration is *better*,
 * because one run cannot say that (R2) and this text is drawn beside one run.
 */
export function adviceFor(spec: DispatcherSpec): string {
  const w = (term: string): number => spec.weights[term] ?? 0;
  if (Object.values(spec.weights).every((position) => position === 0)) {
    return 'Every term is zero, so every car costs the same and the first eligible one always wins. Worth watching once.';
  }
  if (w('distanceTravelled') + w('stopCount') > w('waitTime')) {
    return 'Energy outranks people: cars will sit still and let calls age. A real thing to build, and a lesson when you watch it.';
  }
  if (w('loadFactor') + w('crowding') < 15) {
    return 'With load and crowding ignored, a nearly full car will be sent to the busiest floor and drive straight past it.';
  }
  if (w('starvation') > 70) {
    return 'Starvation this high chases the oldest call across the building. Your worst wait falls; the average may get worse.';
  }
  return 'Twelve terms, same as the shipped cost engine. Each is a trade, never a free win.';
}

/**
 * The per-car door timings a dwell choice asks for.
 *
 * Separate from {@link profileFromSpec} because it writes a different document: a dwell is a fact
 * about the **car**, and the profile is a fact about the **group**. The run builder applies this to
 * every car of the building it is about to run, which is why it returns the two fields rather than
 * a car — a caller with a `BuildingConfig` spreads them, and a caller with a spec puts them in it.
 */
export function doorTimingFor(levers: GroupLevers):
  | { readonly dwellCarCallS: number; readonly dwellHallCallS: number }
  | undefined {
  if (levers.dwell === undefined) return undefined;
  const dwell = DWELL_SETTINGS[levers.dwell];
  return { dwellCarCallS: dwell.dwellCarCallS, dwellHallCallS: dwell.dwellHallCallS };
}

/**
 * Which chip a profile's own authored dwell corresponds to, or `undefined` when it matches none.
 *
 * Used to light a chip on load without writing anything. A profile that authored something the
 * three chips cannot express — `energy-aware`'s adaptive 0.2 / 10 s — lights none, which is the
 * honest picture: the reader has not chosen, and what is running is not one of the three.
 */
export function dwellChoiceOf(profile: DispatcherProfile): DwellChoice | undefined {
  const answer = profile.answer;
  if (answer?.dwellPolicy === undefined && answer?.maxDwellS === undefined) return undefined;
  for (const choice of DWELL_CHOICES) {
    const setting = DWELL_SETTINGS[choice];
    if (
      answer?.dwellPolicy === setting.dwellPolicy &&
      (answer.maxDwellS ?? setting.maxDwellS) === setting.maxDwellS
    ) {
      return choice;
    }
  }
  return undefined;
}
