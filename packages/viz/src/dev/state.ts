/**
 * The viewer's state, and the one function that turns it into a run.
 *
 * ## Why the state is a value and the mounts are functions of it
 *
 * The shipped viewer kept its state in the closure of a 1 060-line `boot()`. That is workable for
 * nine controls and a canvas. It is not workable for the handoff's surface: eleven panels read the
 * same shift, four editors write configuration that three of the others display, and the right
 * rail's selection decides what the header says. Every one of those is a chance for two panels to
 * disagree about what is running.
 *
 * So there is one {@link ViewerState}, the mounts are `(elements, state, actions) => void`, and
 * **nothing outside this module decides what a run is**. {@link shiftRunConfigOf} is the single
 * answer to *what is the simulator being asked for*, which is the same reason `dev/runConfig.ts`
 * existed before it: a decision made inside a click handler cannot be tested, because the handler
 * needs a document, a canvas and a click.
 *
 * ## What is deliberately not here
 *
 * Any DOM. This module is in `dev/` because `boundaries.test.ts` confines the DOM to `dev/` and
 * this is the state *of* the DOM layer — but it touches none, and its tests run under plain Node
 * like everything else in this repository.
 */

import {
  parseBuilding,
  resolveBuilding,
  type BuildingConfig,
  type DispatcherProfile,
  type ElevatorSpecs,
  type ResolvedBuilding,
  type SimulationConfig,
} from '@elevator-sim/core/browser';

import {
  DEFAULT_LEVERS,
  doorTimingFor,
  profileFromSpec,
  specFromProfile,
  type DispatcherSpec,
  type GroupLevers,
} from '../authoring/dispatcherSpec.js';
import {
  BLANK_SPEC as BLANK_BUILDING,
  buildingFromSpec,
  specFromBuilding,
  specIsDirty as buildingSpecIsDirty,
  type BuildingSpec,
} from '../authoring/buildingSpec.js';
import {
  classesFromSpecs,
  specFromClass,
  specsWithClass,
  type MachineClass,
  type MachineSpec,
} from '../authoring/machineSpec.js';
import {
  DEFAULT_PATTERN,
  demandFromSpec,
  specFromTrafficProfile,
  trafficProfilesWithPattern,
  type PatternSpec,
} from '../authoring/patternSpec.js';
import type { VizRecording } from '../contract/types.js';
import type { DisclosureMode } from '../live/types.js';
import type { ViewMode } from '../mode/types.js';
import { contractForBuilding, CONTRACTS } from '../shift/contracts.js';
import { eventFor, shiftRunPatch, baseDemandOf } from '../shift/events.js';
import { grownBuilding } from '../shift/growth.js';
import { withIncidents } from '../shift/incidents.js';
import { openWeek, takeContract } from '../shift/week.js';
import type { DayReport, ShiftEvent, WeekState } from '../shift/types.js';

import type { BrowserResources } from './data.js';
import { PREFERRED_VIEWER_DISPATCHERS, preferredDispatcherId } from './defaults.js';
import type { RailSegment, TabName } from './elementMap.js';

/**
 * How long a shift is, in simulated seconds of demand.
 *
 * The handoff's day is sixteen hours and this simulator does not have one — `docs/12` § 4.1 is the
 * argument and this select is the consequence. The four lengths are the two shipped demand
 * templates' own horizons and two multiples of the recommended one: `rise-and-fall` is 30 minutes
 * and `constant-iso` is two hours, so a reader can run a shift that matches a published figure's
 * horizon exactly rather than one this UI invented.
 *
 * The default is **30 minutes**, the template's own, for the same reason: it is the horizon every
 * number in `docs/05-roadmap.md` was measured over, so the first thing a reader sees is comparable
 * with the project's own results.
 */
export const SHIFT_LENGTHS: readonly { readonly seconds: number; readonly label: string }[] =
  Object.freeze([
    { seconds: 900, label: 'Short shift — 15 min' },
    { seconds: 1800, label: 'Standard shift — 30 min' },
    { seconds: 3600, label: 'Long shift — 1 h' },
    { seconds: 7200, label: 'Full period — 2 h' },
  ]);

export const DEFAULT_SHIFT_LENGTH_S = 1800;

/** A dispatcher the reader saved. */
export interface SavedDispatcher {
  readonly id: string;
  readonly profile: DispatcherProfile;
}

/** An arrival pattern the reader saved. */
export interface SavedPattern {
  readonly id: string;
  readonly spec: PatternSpec;
}

/** A building the reader saved. */
export interface SavedBuilding {
  readonly id: string;
  readonly config: BuildingConfig;
}

/**
 * Which arrival pattern is running.
 *
 * `'building'` means *the building's own `trafficProfile`* — the shipped demand every published
 * figure was measured under, and the honest default. Anything else is a shipped profile id or a
 * pattern the reader saved, and choosing one is choosing to leave the comparable case.
 */
export type PatternSelection = 'building' | string;

/** The two Free Play axes the pattern editor's vocabulary cannot express. See {@link ViewerState.freePlay}. */
export interface FreePlayOverride {
  readonly demandTemplateId: string;
  /** `null` is the building's own profile — a distinct selection, not a missing one. */
  readonly arrivalRatePctPop5min: number | null;
}

export interface ViewerState {
  /* --- disclosure --------------------------------------------------------- */
  readonly mode: ViewMode;
  /**
   * Whether the honesty card's *maths* paragraph is disclosed.
   *
   * Starts `true`, so an engineer's first view matches the design's own screenshot and the button
   * reads *hide the maths*. It is only consulted where `HonestyCard.hasMaths` is true, which is
   * engineer mode — see `leftRail.ts`'s `mathsDisclosureOf` for why the design's own rule made this
   * field inert and what replaced it.
   */
  readonly showMaths: boolean;

  /* --- navigation --------------------------------------------------------- */
  readonly tab: TabName;
  /** Contextual editor tabs the rail has opened. See `surfaces.ts`. */
  readonly revealedTabs: ReadonlySet<TabName>;
  readonly railSegment: RailSegment;
  readonly drawerOpen: boolean;

  /* --- what is running ---------------------------------------------------- */
  readonly buildingId: string;
  readonly dispatcherId: string;
  readonly pattern: PatternSelection;
  readonly shiftLengthS: number;
  /**
   * What Free Play asked for, over and above the pattern select — or `undefined`, which is the
   * campaign's state and every published figure's.
   *
   * Two axes the pattern editor cannot express, and that is why they are here rather than folded
   * into a `PatternSpec`. The editor's demand template is *derived* from its peak order
   * (`PEAK_ORDER_INFO`), which reaches two of the shipped templates; Free Play offers all of them,
   * because `constant-iso` and `shift-change` are real shapes to play against and a menu that
   * listed them and then ran `rise-and-fall` would be § D177's inert control with a label on it.
   *
   * `arrivalRatePctPop5min: null` is *the building's own profile* and is expressed by passing **no
   * override at all**, the same way `selectedPatternSpec` expresses `'building'`. Reconstructing
   * the profile's rate and passing it back in would be a different run wearing the same name.
   */
  readonly freePlay: FreePlayOverride | undefined;
  readonly seed: bigint;
  /** Cars the reader took out of service by clicking a badge under a shaft. § 1.5 B7. */
  readonly outOfServiceCarIds: readonly string[];
  readonly levers: GroupLevers;

  /* --- the week ----------------------------------------------------------- */
  readonly week: WeekState;

  /* --- what the reader has authored --------------------------------------- */
  readonly savedDispatchers: readonly SavedDispatcher[];
  readonly savedPatterns: readonly SavedPattern[];
  readonly savedClasses: readonly MachineClass[];
  readonly savedBuildings: readonly SavedBuilding[];

  /* --- the four editors' working copies ----------------------------------- */
  readonly dispatcherSpec: DispatcherSpec;
  readonly editingDispatcherId: string;
  readonly patternSpec: PatternSpec;
  readonly editingPatternId: PatternSelection;
  readonly machineSpec: MachineSpec;
  readonly editingClassId: string;
  readonly buildingSpec: BuildingSpec;
  readonly editingBuildingId: string;

  /* --- the run ------------------------------------------------------------ */
  readonly recording: VizRecording | undefined;
  readonly report: DayReport | undefined;
  /** What the last run refused to configure, from `shiftRunPatch`. Shown, never swallowed. */
  readonly withheld: readonly string[];
}

/**
 * Change which building is running, taking the editor's working copy with it **when it is
 * untouched**.
 *
 * The two halves are both needed and they pull against each other. Leaving the copy alone means
 * opening the building editor after picking Vertical City shows Garden Apartments, which is a panel
 * describing a building nobody is looking at. Re-seeding it unconditionally means a reader who has
 * spent five minutes dragging an elevation loses it by touching the building select.
 *
 * So: re-seed only when the copy still equals the building it was read from. That is the ordinary
 * rule for a working copy, and it is checkable here because `buildingSpec.ts` already has to answer
 * *is this dirty?* for the editor's own **edited — not saved** flag. One question, one answer.
 */
export function withBuilding(
  state: ViewerState,
  resources: BrowserResources,
  buildingId: string,
): ViewerState {
  /*
   * The week follows the building into its scenario.
   *
   * Each of the five shipped buildings *is* a scenario, so picking Midtown Office while the week
   * sits on Scenario 1 produced a sheet headed *Midtown Office* and footed *Scenario 1 — Learn the
   * ropes*, banking a Garden Apartments shift against a run that never touched it. The handoff's
   * own `pickPreset` restarts the week for exactly this reason.
   *
   * A building the reader drew belongs to no scenario, and then the week keeps the one it had and
   * the sheet says the shift is not being banked — which is `contractStatus`'s own answer and the
   * honest one.
   */
  const contract = contractForBuilding(buildingId);
  const week =
    contract === undefined || contract.id === state.week.contractId
      ? state.week
      : takeContract(state.week, contract.id);
  const next: ViewerState = { ...state, buildingId, week };
  const source = buildingConfigOf(resources, state.savedBuildings, state.editingBuildingId);
  const pristine =
    source !== undefined &&
    !buildingSpecIsDirty(state.buildingSpec, specFromBuilding(source, state.editingBuildingId));
  if (!pristine) return next;
  const wanted = buildingConfigOf(resources, state.savedBuildings, buildingId);
  if (wanted === undefined) return next;
  return { ...next, buildingSpec: specFromBuilding(wanted, buildingId), editingBuildingId: buildingId };
}

/** The disclosure mode in the handoff's own words. `mode/` calls the two levels basic/advanced. */
export function disclosureOf(mode: ViewMode): DisclosureMode {
  return mode === 'advanced' ? 'engineer' : 'casual';
}

/**
 * The state the page opens on.
 *
 * The opening dispatcher is `collective` and not `nearest-car`, which is § D134's move and is not
 * cosmetic: `nearest-car` is on the Pareto front at six of eight matrix cells *because it is best
 * on energy and worst on wait*, so opening on it shows a reader the weakest shipped dispatcher and
 * calls it the default.
 */
export function initialState(resources: BrowserResources, seed: bigint): ViewerState {
  const buildingId = CONTRACTS[0]?.buildingId ?? 'garden-apartments';
  const dispatcherId = preferredDispatcher(resources);
  const profile = profileById(resources, [], dispatcherId);
  const classes = classesFromSpecs(resources.elevatorSpecs);
  const building = buildingConfigOf(resources, [], buildingId);
  return {
    mode: 'basic',
    showMaths: true,
    tab: 'run',
    revealedTabs: new Set<TabName>(),
    railSegment: 'dispatcher',
    drawerOpen: false,
    buildingId,
    dispatcherId,
    pattern: 'building',
    shiftLengthS: DEFAULT_SHIFT_LENGTH_S,
    // `undefined`, not a default template. The campaign owns the run until Free Play says
    // otherwise, and every published figure in this repository was measured with no override.
    freePlay: undefined,
    seed,
    outOfServiceCarIds: [],
    levers: DEFAULT_LEVERS,
    week: openWeek(contractForBuilding(buildingId)?.id),
    savedDispatchers: [],
    savedPatterns: [],
    savedClasses: [],
    savedBuildings: [],
    dispatcherSpec: specFromProfile(profile, profile.name),
    editingDispatcherId: dispatcherId,
    patternSpec: specFromTrafficProfile(resources.trafficProfiles, building?.trafficProfile),
    editingPatternId: 'building',
    machineSpec: specFromClass(classes[2] ?? (classes[0] as MachineClass)),
    editingClassId: classes[2]?.id ?? classes[0]?.id ?? 'geared-traction',
    buildingSpec:
      building === undefined ? BLANK_BUILDING : specFromBuilding(building, buildingId),
    editingBuildingId: buildingId,
    recording: undefined,
    report: undefined,
    withheld: [],
  };
}

/**
 * `collective` when the file has it, else whatever it does have. § D134.
 *
 * The preference list is `dev/defaults.ts`'s — the one `defaults.test.ts` pins against § D134's
 * measurement — not a private literal. This function re-derived `['collective', 'eta']` on its
 * own until the fifth dead-code audit found the constant enforced by a duplicate (§ D192): two
 * sites answering *what does the viewer open on* is how one of them goes stale unread.
 */
function preferredDispatcher(resources: BrowserResources): string {
  const profiles = resources.dispatcherProfiles.profiles;
  return (
    preferredDispatcherId(PREFERRED_VIEWER_DISPATCHERS, profiles) ?? profiles[0]?.id ?? 'collective'
  );
}

/* -------------------------------------------------------------------------- *
 * Lookups — every one total, every one preferring what the reader saved
 * -------------------------------------------------------------------------- */

export function allDispatchers(
  resources: BrowserResources,
  saved: readonly SavedDispatcher[],
): readonly DispatcherProfile[] {
  return [...resources.dispatcherProfiles.profiles, ...saved.map((entry) => entry.profile)];
}

export function profileById(
  resources: BrowserResources,
  saved: readonly SavedDispatcher[],
  id: string,
): DispatcherProfile {
  const found = allDispatchers(resources, saved).find((profile) => profile.id === id);
  if (found !== undefined) return found;
  const first = resources.dispatcherProfiles.profiles[0];
  if (first === undefined) throw new Error('data/dispatcher-profiles.json declares no profiles.');
  return first;
}

export function allBuildingIds(
  resources: BrowserResources,
  saved: readonly SavedBuilding[],
): readonly string[] {
  return [...resources.entries.map((entry) => entry.config.id), ...saved.map((entry) => entry.id)];
}

export function buildingConfigOf(
  resources: BrowserResources,
  saved: readonly SavedBuilding[],
  id: string,
): BuildingConfig | undefined {
  const mine = saved.find((entry) => entry.id === id);
  if (mine !== undefined) return mine.config;
  return resources.entries.find((entry) => entry.config.id === id)?.config;
}

/** The building's display name, without loading the whole document to read it. */
export function buildingNameOf(
  resources: BrowserResources,
  saved: readonly SavedBuilding[],
  id: string,
): string {
  return buildingConfigOf(resources, saved, id)?.name ?? id;
}

export function allClasses(
  resources: BrowserResources,
  saved: readonly MachineClass[],
): readonly MachineClass[] {
  return [...saved, ...classesFromSpecs(resources.elevatorSpecs)];
}

export function classById(
  resources: BrowserResources,
  saved: readonly MachineClass[],
  id: string,
): MachineClass | undefined {
  return allClasses(resources, saved).find((entry) => entry.id === id);
}

/* -------------------------------------------------------------------------- *
 * The run
 * -------------------------------------------------------------------------- */

export interface ShiftRunConfig {
  readonly config: SimulationConfig;
  readonly building: ResolvedBuilding;
  readonly event: ShiftEvent;
  /** Cars held out of service — the reader's, plus any the day's event withheld. */
  readonly outOfServiceCarIds: readonly string[];
  /** Anything the shift patch refused to configure, with its reason. Shown, never swallowed. */
  readonly withheld: readonly string[];
}

/**
 * What the simulator is being asked for. The single answer, and the one thing every surface reads.
 *
 * The order of composition is the order the facts belong to, and it is not arbitrary:
 *
 * 1. **The building**, grown to the day. Tenants moving in is a building edit, so it happens to the
 *    `BuildingConfig` and goes through `parseBuilding`/`resolveBuilding` like any other — which is
 *    what makes the growth reach the simulation rather than only the header.
 * 2. **The machine class**, when the reader saved one. It widens the `ElevatorSpecs` the building
 *    resolves against; a class that only existed in the editor would be the twelfth dead seam.
 * 3. **The dispatcher**, with the group levers applied on top. A lever moves a shipped profile
 *    without forking it (see `authoring/dispatcherSpec.ts`).
 * 4. **The demand**, from the pattern the reader picked, then the day's event applied over it.
 *    `shiftRunPatch` refuses rather than throws when the two cannot be combined, and the refusal
 *    travels out in {@link ShiftRunConfig.withheld}.
 */
export function shiftRunConfigOf(
  resources: BrowserResources,
  state: ViewerState,
): ShiftRunConfig {
  const authored = buildingConfigOf(resources, state.savedBuildings, state.buildingId);
  if (authored === undefined) {
    throw new Error(
      `No building "${state.buildingId}" — the page offers only what data/buildings/ and the ` +
        'reader have between them.',
    );
  }

  // 2 — the specs the building resolves against, widened by anything the reader saved.
  let specs: ElevatorSpecs = resources.elevatorSpecs;
  for (const machineClass of state.savedClasses) specs = specsWithClass(specs, machineClass);

  // 1 — grown to the day, then the dwell lever written onto the cars, then re-parsed so a grown
  // building is validated like any other.
  const grown = withDoorTiming(grownBuilding(authored, state.week.day), doorTimingFor(state.levers));
  const building = resolveBuilding(parseBuilding(grown as unknown), specs);

  // 3 — the dispatcher, plus the levers.
  const base = profileById(resources, state.savedDispatchers, state.dispatcherId);
  const dispatcherProfile = profileFromSpec(specFromProfile(base, base.name), {
    id: base.id,
    base,
    levers: state.levers,
  });

  // 4 — the demand, then the day's event over it.
  const event = eventFor(state.week.day, state.week.dayIdx);
  const spec = selectedPatternSpec(resources, state, authored);
  const pattern = spec === undefined ? { demandTemplate: 'rise-and-fall' as const, demand: {} } : demandFromSpec(spec);
  /*
   * Free Play's two axes, applied **over** the pattern's — § D215. Last rather than first, because
   * they are the reader's most recent and most explicit statement about what to run: a player who
   * picked `constant-iso` in the menu picked it after whatever the pattern select was left on.
   *
   * A `null` rate passes nothing, which is what makes "the building's own profile" a real
   * selection rather than a reconstruction of one.
   */
  const demandTemplate = (state.freePlay?.demandTemplateId ?? pattern.demandTemplate) as typeof pattern.demandTemplate;
  const rate = state.freePlay?.arrivalRatePctPop5min;
  const demand =
    rate === undefined || rate === null
      ? pattern.demand
      : { ...pattern.demand, arrivalRatePctPop5min: rate };
  /*
   * Mean group size is not a `demand` option — it lives on the traffic profile, so a pattern that
   * moved it widens the file the run resolves against. See `patternSpec.ts`'s
   * `trafficProfilesWithPattern` for why a slider bound to `demand` would have written nothing.
   */
  const trafficProfiles =
    spec === undefined
      ? resources.trafficProfiles
      : trafficProfilesWithPattern(resources.trafficProfiles, authored.trafficProfile, spec);
  const patch = shiftRunPatch({
    event,
    building,
    base: baseOf(resources, authored, demand),
    templateVariesMix: demandTemplate === 'lunch-two-way',
  });

  const outOfServiceCarIds = [
    ...new Set([...state.outOfServiceCarIds, ...patch.outOfServiceCarIds]),
  ].sort((a, b) => a.localeCompare(b));

  /*
   * 5 — the day's incidents, written onto the building as `serviceEvents`.
   *
   * **After** the patch and before the second resolve, because the incident has to be part of the
   * building document the kernel is handed: `serviceEvents` is read by `sim/events.ts` during the
   * run, not by `recordRun` before it, so unlike `outOfServiceCarIds` it cannot travel beside the
   * config. This is `BuildingConfig.serviceEvents`' first non-test caller anywhere in the repository
   * — see `shift/incidents.ts` for what it was and why that mattered.
   *
   * The building is re-parsed and re-resolved rather than patched in place, so an incident naming a
   * car no bank declares is refused by `core`'s own four service-event issue codes rather than by a
   * check written here. `grownBuilding` already established that pattern: a building edit goes back
   * through the loader like any other.
   */
  const withEvents = withIncidents(grown, patch.incidents, state.shiftLengthS);
  const finalBuilding =
    withEvents === grown ? building : resolveBuilding(parseBuilding(withEvents as unknown), specs);

  return {
    building: finalBuilding,
    event,
    outOfServiceCarIds,
    withheld: patch.withheld,
    config: {
      building: finalBuilding,
      dispatcherProfile,
      trafficProfiles,
      elevatorSpecs: specs,
      dispatcherProfiles: resources.dispatcherProfiles,
      seed: state.seed,
      durationS: state.shiftLengthS,
      demandTemplate,
      demand: { ...demand, ...patch.demand },
      /*
       * `report`, not the kernel's default `throw`. At the shipped traffic rates three of the five
       * buildings routinely end a run with people still in the system, and `Simulation` treats
       * that as a failure — correctly, because a mean over a system that never cleared is the
       * confident nonsense this project exists to avoid. Under `throw` there is no recording at
       * all, so the shift would end with an error message and an empty canvas rather than the
       * picture of a building being outrun, which is the single most instructive thing the viewer
       * can draw. Nothing about the statistics moves: `awtIsValid` still suppresses every mean.
       */
      onTimeout: 'report',
    },
  };
}

/**
 * The demand the selected pattern asks for.
 *
 * `'building'` means the building's own `trafficProfile`, which is the case every published figure
 * in this repository was measured under — so it is expressed by handing the run **no** demand
 * override at all rather than by reconstructing the profile's numbers and passing them back in. A
 * reconstruction that rounded would be a different run wearing the same name.
 */
function selectedPatternSpec(
  resources: BrowserResources,
  state: ViewerState,
  building: BuildingConfig,
): PatternSpec | undefined {
  // `undefined` is the comparable default: no override at all. See the docstring above.
  if (state.pattern === 'building') return undefined;
  const saved = state.savedPatterns.find((entry) => entry.id === state.pattern);
  if (saved !== undefined) return saved.spec;
  const shipped = resources.trafficProfiles.profiles.find(
    (profile) => profile.id === state.pattern,
  );
  if (shipped !== undefined) return specFromTrafficProfile(resources.trafficProfiles, shipped.id);
  void building;
  return DEFAULT_PATTERN;
}

/**
 * The rate and split an event's multiplier is applied *to*.
 *
 * `shiftRunPatch` multiplies a base, and the base is whatever the pattern already asked for. When
 * the pattern asked for nothing — the `'building'` case, which is the comparable default — there is
 * no number here to multiply, and the base is the building's **own traffic profile** at its typical
 * level. That is what `baseDemandOf` is for, and it is why the event has to be applied here rather
 * than inside `shift/`: a fire drill means five times the demand *this building normally sees*, and
 * five times a residential trickle is not five times an office up-peak.
 */
function baseOf(
  resources: BrowserResources,
  building: BuildingConfig,
  demand: NonNullable<SimulationConfig['demand']>,
): Parameters<typeof shiftRunPatch>[0]['base'] {
  const rate = demand.arrivalRatePctPop5min;
  const split = demand.directionalSplit;
  if (rate !== undefined && split !== undefined) {
    return { ratePctPop5min: rate, split };
  }
  const profile = resources.trafficProfiles.profiles.find(
    (candidate) => candidate.id === building.trafficProfile,
  );
  if (profile === undefined) {
    /*
     * Cannot happen against a building the loader accepted — `trafficProfile` is cross-checked
     * against `data/traffic-profiles.json` at parse time. Written as a total function anyway,
     * because the alternative is a non-null assertion on a field somebody else validated.
     */
    return { ratePctPop5min: 12, split: { incoming: 0.85, outgoing: 0.05, interfloor: 0.1 } };
  }
  return baseDemandOf(profile);
}

/**
 * The dwell lever reaching the cars — the second half of a dwell choice, and the half that was
 * configurable, unit-tested and unapplied until the fifth audit (§ D192, candidate 3).
 *
 * `profileFromSpec` writes the profile half (`answer.dwellPolicy`, `dwellAdaptationGain`,
 * `maxDwellS`); this writes the car half (`dwellCarCallS`/`dwellHallCallS`), which is the *only*
 * half that separates snappy from normal — both are `fixed` with the same ceiling, so without
 * this write two of the three chips ran the same building. See `dispatcherSpec.ts`'s
 * {@link DwellSetting} for why a dwell is a car field, and `state.test.ts`'s three-runs test for
 * § D177's rule pointed at this builder.
 *
 * `undefined` — the *inherit* state — returns the config untouched, object identity included: an
 * unpressed chip must not overwrite a car's own authored dwell.
 */
function withDoorTiming(
  config: BuildingConfig,
  timing: ReturnType<typeof doorTimingFor>,
): BuildingConfig {
  if (timing === undefined) return config;
  return {
    ...config,
    banks: config.banks.map((bank) => ({
      ...bank,
      cars: bank.cars.map((car) => ({
        ...car,
        dwellCarCallS: timing.dwellCarCallS,
        dwellHallCallS: timing.dwellHallCallS,
      })),
    })),
  };
}

/** Re-exported so a mount does not import `buildingFromSpec` and this module for the same job. */
export { buildingFromSpec, baseDemandOf };
