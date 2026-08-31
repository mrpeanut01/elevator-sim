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
  type DispatcherProfiles,
  type ElevatorSpecs,
  type PatienceConfig,
  type ResolvedBuilding,
  type RunInterventionConfig,
  type SimulationConfig,
} from '@elevator-sim/core/browser';

import {
  DEFAULT_LEVERS,
  doorTimingFor,
  profileFromSpec,
  specFromProfile,
  specIsDirty as dispatcherSpecIsDirty,
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
  patternIsDirty,
  specFromTrafficProfile,
  trafficProfilesWithPattern,
  type PatternSpec,
} from '../authoring/patternSpec.js';
import { profileWithRules, rulesFromProfile, type RuleRow } from '../authoring/ruleSpec.js';
import {
  patternSwitchingWithSelector,
  profileWithSelector,
  selectorContextFrom,
  // `dispatcherSpec.ts` exports a `specFromProfile` over a different shape, imported above. The
  // two are aliased at every site that needs both — see `selectorSpec.ts`'s own naming hazard.
  specFromProfile as selectorSpecFromProfile,
  type SelectorSpec,
} from '../authoring/selectorSpec.js';
import type { VizRecording } from '../contract/types.js';
import type { DisclosureMode } from '../live/types.js';
import type { ViewMode } from '../mode/types.js';
import { contractById, contractForBuilding, CONTRACTS } from '../shift/contracts.js';
import { runsWholeDay, wholeDayFor } from '../shift/dayLength.js';
import { shiftRunPatch, baseDemandOf } from '../shift/events.js';
import { grownBuilding } from '../shift/growth.js';
import { withIncidents } from '../shift/incidents.js';
import { shiftReportWindowFor } from '../shift/reportWindow.js';
import {
  calendarDayFor,
  calendarLine,
  calendarPatch,
  scheduledEventFor,
  type CalendarAskInput,
  type CalendarPeriod,
} from '../shift/calendar.js';
import { commissionedBuilding } from '../commissioning/building.js';
import {
  RETROFIT_CONSTRAINT_ID,
  commissionableClasses,
  type CommissioningChoices,
} from '../commissioning/types.js';
import {
  FREE_PLAY_CONTRACT_ID,
  SANDBOX_CONTRACT_ID,
  closeDay,
  nextDay,
  openWeek,
  switchWeek,
} from '../shift/week.js';
import type { TomorrowBriefing } from '../shift/tomorrow.js';
import type { DayOutcome, ShiftEvent, WeekState } from '../shift/types.js';
import type { ShapedDayReport } from '../shift/report.js';
import type { PlayMode } from '../scope/types.js';

import type { BrowserResources } from './data.js';
import { PREFERRED_VIEWER_DISPATCHERS, preferredId } from './defaults.js';
import type { RailSegment, TabName } from './elementMap.js';

/*
 * `SHIFT_LENGTHS` stood here: four narrative options, *Short shift — 15 min* to *Full period — 2 h*,
 * writing the same `shiftLengthS` field that Free play's five numeric *Run length* options wrote
 * (issue #82). Both are gone — § D286. The options now come from `partsOfDay`, derived from the
 * loaded records' own hours, and they are the same options in both modes: one name, one list, one
 * meaning. Nothing is authored here because there is nothing left to author — a part's length is the
 * period it names and its label is its clock. See `menu/partsOfDay.ts` for the derivation, and for
 * why a length control could not be relabelled into an honest one.
 */

/**
 * The shift a page with no scenario opens on, seconds — `rise-and-fall`'s own thirty minutes.
 *
 * Unchanged by § D286 and for its original reason: it is the horizon every number in
 * `docs/05-roadmap.md` was measured over, so the first thing a reader sees is comparable with the
 * project's own results. It is a *length* rather than a part because a contract declares a length
 * (`ScenarioContract.shiftLengthS`) and the scenarios were authored against the templates' periods;
 * {@link ViewerState.windowStartS} opens at `null`, the whole of whatever period that is.
 */
export const DEFAULT_SHIFT_LENGTH_S = 1800;

/**
 * The shift a scenario opens on — its own, when it authors one, else the shipped default.
 * § D234, issue #27.
 *
 * Called from **three** places, and the set is the decision rather than the count:
 * {@link initialState}, because the page opens on `CONTRACTS[0]`; `scenariosPanel`'s `take`,
 * because taking an assignment restarts the week and is the one moment a player has asked for this
 * scenario rather than for this shift length; and — since GitHub issue #223 —
 * `everyday/host.ts#runCampaignDay`, which is § 8's *Lock it in and run day N* and is that same
 * moment on the campaign's side of the door. A campaign tower's id **is** a contract id, § 8 offers
 * no length control for the seed to overwrite, and the measurement below is why it needs one: the
 * one building `openingCareer` holds is the one building this constant exists for.
 *
 * (This paragraph read *"called from exactly two places"* until that third caller landed. A count
 * in prose is a fact nothing re-derives — § D227 — so it is stated here as the set and its reasons,
 * which is what a reader adding a fourth actually needs.)
 *
 * It is deliberately **not** called from `withBuilding`. Changing building from the coach select is
 * not taking an assignment — the player is on day 4 with a streak and they still are — and
 * re-seeding there would throw away a length they had chosen, which is the inert-control failure
 * with the sign flipped: the control would move and then move back on its own.
 *
 * `ScenarioContract.shiftLengthS` says why one building needs this at all, with the measurement.
 */
export function shiftLengthForContract(contractId: string): number {
  return contractById(contractId)?.shiftLengthS ?? DEFAULT_SHIFT_LENGTH_S;
}

/**
 * The demand template a shift will actually run, given a state — the id the parts are derived from.
 *
 * Exported because `dev/main.ts` needs the same answer `shiftRunConfigOf` reaches, and two
 * expressions for *which template is running* is how the select comes to offer parts of a period
 * the run is not using. The calendar's own override is deliberately **not** consulted: a period may
 * swap the template for a scheduled day, and offering the player parts of a template the calendar
 * chose for them would let a control move something the calendar owns.
 *
 * ## Three sources, in the order a disagreement between them should be settled
 *
 * **Free Play's select wins**, because it is the only one of the three a player typed. Then the
 * **whole authored day** the state's own window asks for; then the pattern.
 *
 * The middle clause is `ISSUE_VERIFICATION_FINDINGS.md` § AB's fix, and it reads the *window*
 * rather than a new field on purpose. `state.windowStartS`/`shiftLengthS` are already the two
 * halves § D286 split one control into — *which part of the day you run* — and a run that covers
 * the whole of a ten-hour period is asking for the record whose period that is. Deriving the
 * template from the window is what makes the two one decision instead of two that agree by habit,
 * and the failure the habit would produce is not a wrong caption: `shiftRunConfigOf` writes
 * `templateOverrides.durationS` exactly when `windowStartS` is `null`, and `core` refuses that
 * override on a phase-list record **by name** (§ D285), so a state naming a day without naming its
 * window **throws**. `shift/dayLength.ts` owns both halves and the argument for both.
 *
 * The last clause's `'rise-and-fall'` is the line § AB names: `initialState` opens on
 * `pattern: 'building'`, `selectedPatternSpec` answers `undefined` for it, and so **every**
 * Everyday day — residential tower and thirty-floor office alike — fell through to one hard-coded
 * thirty-minute up-peak. It is left exactly where it is, because it is still the right answer for
 * the three shipped crowds no authored day covers.
 */
export function shiftDemandTemplateId(
  resources: BrowserResources,
  state: ViewerState,
  building: BuildingConfig | undefined,
): string {
  const spec = selectedPatternSpec(resources, state, building);
  const fromPattern = spec === undefined ? 'rise-and-fall' : demandFromSpec(spec).demandTemplate;
  const chosen = state.freePlay?.demandTemplateId;
  if (chosen !== undefined) return chosen;
  const day = wholeDayFor(resources.trafficProfiles, building);
  if (day !== undefined && runsWholeDay(day, state.shiftLengthS, state.windowStartS)) {
    return day.templateId;
  }
  return fromPattern;
}

/**
 * The four inputs a calendar period's asks are decided against, for a given state — GitHub
 * issue #140.
 *
 * ## Why this is a function and not four expressions at two call sites
 *
 * {@link shiftRunConfigOf} passes them to `calendarPatch`, and `scope/runIdentity.ts` needs the
 * **same four** to ask `shift/calendar.ts#calendarAsks` *did the period's mix bias actually reach
 * the run?* — because a refusal naming a bias the engine withheld is exactly the wrong-reason
 * failure § D227 rates below the gap it fixes. Two expressions for one set of inputs is
 * `scheduledEventFor`'s subject at a different seam: the run and the sentence describing it would
 * agree until somebody changed one of them.
 *
 * `templateChosenByPlayer` is the field that makes this worth a function rather than a comment. It
 * is *"the player used Free Play's template select"*, spelled `state.freePlay?.demandTemplateId
 * !== undefined`, and it is the difference between a period imposing `office-down-peak` and a
 * period being told it may not — a difference a second copy of that expression could lose in one
 * edit.
 *
 * The `building` argument is {@link shiftDemandTemplateId}'s and is passed straight through, which
 * is why it admits `undefined`: `runIdentityIssues` is the predicate that has to survive a state
 * naming a building `data/buildings/` does not ship, and `shiftRunConfigOf` **throws** on one.
 */
export function calendarAskInputOf(
  resources: BrowserResources,
  state: ViewerState,
  building: BuildingConfig | undefined,
): Omit<CalendarAskInput, 'day'> {
  return {
    // The cast `shiftDemandTemplateId` already forces on its callers: it answers with a plain
    // string because `FreePlaySelection` carries one, and the id it returns is a template's.
    demandTemplateId: shiftDemandTemplateId(resources, state, building) as CalendarAskInput['demandTemplateId'],
    demandTemplates: resources.trafficProfiles.demandTemplates,
    runLengthS: state.shiftLengthS,
    templateChosenByPlayer: state.freePlay?.demandTemplateId !== undefined,
  };
}

/**
 * The two demand axes a **finished run** was simulated with, for anything that has to describe it.
 *
 * ## Why this exists rather than two field reads at each site
 *
 * Two surfaces describe a run they did not build: the leaderboard submission and the Day report's
 * `single-run` subject. Both read these two axes, and both read them from **`menuState.freePlay`** —
 * *what the menu currently has selected* — instead of from `state`, which is what
 * {@link shiftDemandTemplateId} reads when the run is actually built.
 *
 * They agree until somebody moves the *Traffic shape* or *Arrival rate* select after a run and
 * before posting, and then only one of them describes the seed. The submission is the expensive
 * half: `packages/server`'s `verifySubmission` replays the **submitted** ids, does not reproduce,
 * and answers `422 metrics-do-not-reproduce` — **this product's one accusation, aimed at a player
 * who did nothing wrong.** `scope/runIdentity.ts`'s docstring already names that exact outcome as
 * the thing a client/server disagreement produces; this was a client disagreeing with *itself*.
 *
 * The argument was already written down, four lines below the defect. `submitScore`'s comment on
 * `windowStartS` says *"this is the window the run was simulated with, and the menu holds the window
 * currently selected"* — correct, load-bearing, and not applied to the two lines above it. A
 * sentence that explains one field and not its neighbours is how this repository loses a rule, so
 * the answer here is a **function** rather than a longer comment: the two sites now cannot disagree,
 * because there is one derivation and it is this one (`docs/16` S5).
 *
 * ## What a campaign run carries, and why it is not a special case
 *
 * `state.freePlay` is `undefined` outside Free Play, and the fallbacks are not invented for this
 * function — they are the ones the **run itself** used. The template comes from
 * {@link shiftDemandTemplateId}, which is what `shiftRunConfigOf` resolves through, so a campaign
 * submission names the contract's own template rather than whatever the Free Play select happens to
 * be left on. The rate is `null`, which is not "unknown": a `null` rate passes nothing and means
 * *the building's own profile*, which is exactly what a campaign day runs under.
 *
 * So there is no branch on play mode here. A run knows what it ran; the menu only knows what is
 * selected next.
 */
export function shiftSubmittedSelection(
  resources: BrowserResources,
  state: ViewerState,
  building: BuildingConfig | undefined,
): { readonly demandTemplateId: string; readonly arrivalRatePctPop5min: number | null } {
  return {
    demandTemplateId: shiftDemandTemplateId(resources, state, building),
    arrivalRatePctPop5min: state.freePlay?.arrivalRatePctPop5min ?? null,
  };
}

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
  /* --- which game is being played ----------------------------------------- */
  /**
   * Which play mode this state belongs to — `docs/16` § 3, and `scope/types.ts`'s `PlayMode`.
   *
   * ## Why this is a field and not an inference
   *
   * The shell had exactly one signal for *"is this a week or a single run?"*: `freePlay !==
   * undefined`. That happens to be true today, because `enterFreePlay` is the only writer of
   * `freePlay` and the campaign never sets it — and it is the shape of fact that stops being true
   * the day somebody adds a second writer, silently, in a sheet that has already been wrong about
   * this once.
   *
   * It also could not be inferred the obvious other way. A Free Play run on `midtown-office` keeps
   * that building's **contract id** on its fresh week, because `enterFreePlay` calls
   * `openWeek(contractForBuilding(id)?.id)` to keep the scenario label honest — so *"no contract"*
   * never meant *"no week"*, and that is precisely the mechanism by which the report came to print
   * *"Scenario 2 · 1 of 2 clean shifts banked"* over a run banking nothing.
   *
   * `docs/16` S1: an absence indistinguishable from an oversight is not a declaration. So the mode
   * is named.
   */
  readonly playMode: PlayMode;
  /**
   * The calendar period in force, or `null` for an ordinary week.
   *
   * `between-games` — a period is chosen above the week and holds for a stretch of days, which is
   * what makes it a different *game* rather than a different day. `calendarDayFor` decides whether
   * today is inside it; this field is only the placement.
   */
  readonly calendar: CalendarPeriod | null;
  /**
   * What the reader commissioned, per bank. Empty is *as built*, and byte-identical to it.
   *
   * `between-games` and nothing else: `scope/permits.ts` forbids `within-day` for `commissioning`
   * with the reason that a commissioning screen letting a player move a dispatcher weight would be
   * the shift week with a different title. The fabric is chosen, and then you live with it.
   */
  readonly commissioning: CommissioningChoices;
  /**
   * Which capital constraint the fabric is judged against — *retrofit*, *refurbishment*, *new build*.
   *
   * `presentation` rather than `between-games`, and the distinction is the whole of what a
   * constraint is: it decides which choices the **screen** offers and what it refuses, and it moves
   * no leg by itself. What moves the run is the choice a player then makes under it, which is
   * `viewer.commissioning`. A constraint that changed a run directly would be a difficulty setting,
   * which `docs/10` § 5.5 bans.
   */
  readonly commissioningConstraintId: string;

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
  /**
   * Contextual editor tabs the rail has opened. See `surfaces.ts`.
   *
   * Consulted in Casual only — § D330 gave Engineer no gate — and it outlives the page: the set is
   * stored per browser, so *revealed* means revealed rather than revealed until the tab is closed.
   */
  readonly revealedTabs: ReadonlySet<TabName>;
  readonly railSegment: RailSegment;
  readonly drawerOpen: boolean;

  /* --- what is running ---------------------------------------------------- */
  readonly buildingId: string;
  readonly dispatcherId: string;
  readonly pattern: PatternSelection;
  readonly shiftLengthS: number;
  /**
   * Where in the demand template's period this shift begins, seconds — `null` for the whole of it.
   *
   * `DECISIONS.md` § D286, and the other half of {@link shiftLengthS}. Together they are *which part
   * of the day you run*: a length says how much demand, this says which part of the schedule it is
   * cut from, and neither has taken on the other's meaning. `shiftLengthS` still travels into the
   * leaderboard's `durationS` meaning exactly what it always meant.
   *
   * `null` rather than `0`, and carried into `SimulationConfig` as *no field at all*: a run over the
   * whole of a period is byte-identical to the run before this existed, which is the property
   * `traffic/windowIdentity.test.ts` holds to.
   */
  readonly windowStartS: number | null;
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
  /**
   * The player's mid-run interventions, in press order — Everyday Mode's run record (contract
   * § 1.4, `run = { seed, config, interventions[] }`). `[]` until a stage intervention control
   * is pressed — parking the fleet or handing the day to another dispatcher; a campaign
   * incident's answer joins the same log on the day its dock lands.
   *
   * ## What survives, and what clears it — the decision, stated
   *
   * The log is a fact about **this day's run**, so it lives and dies with the day rather than
   * with the session:
   *
   * - **It survives a plain re-run of the same day** — levers moved, patience set, the Run
   *   button pressed again. The contract's whole point is that the record replays: a re-run that
   *   silently dropped the log would put a different day on screen under the same stamp.
   * - **It clears when the day changes** — *Open the doors on tomorrow* (`dev/reportPanel.ts`),
   *   taking the next assignment, starting a scenario, and `enterFreePlay`, each of which
   *   already clears `outOfServiceCarIds` on the same argument: a run inheriting Thursday's
   *   intervention would not be the run the screen just described.
   * - **It clears when the building changes** ({@link withBuilding}) — an intervention is
   *   stamped against one day in one tower, and the contract's own line is that changing the
   *   tower is a different kind of act than changing your mind.
   *
   * It deliberately survives a **seed** change: the log is part of the record being re-rolled,
   * and re-rolling the crowd under the same change of mind is a legitimate question to ask. What
   * makes that honest rather than sneaky is `scope/runIdentity.ts`, which refuses to post any
   * run carrying a non-empty log — no selection, CLI line or submission can express one yet.
   *
   * Not persisted (`persist.test.ts`'s ledger): a within-day attempt, on
   * `outOfServiceCarIds`' exact ground.
   */
  readonly interventions: readonly RunInterventionConfig[];
  readonly levers: GroupLevers;
  /**
   * The weight-set selector's configuration — `docs/17` § 5 finding 6, given a surface.
   *
   * ## Why it sits beside {@link ViewerState.levers} rather than inside `dispatcherSpec`
   *
   * For the reason `GroupLevers` sits there: it is applied **on top of whichever dispatcher is
   * driving**, including a shipped one nobody has edited, so folding it into the dispatcher's
   * working copy would mean that switching the selector on silently forked the profile named in
   * the rail. `dispatcherSpec` is a document being edited and saved; this is a lever being pulled.
   *
   * ## Why one field and not two, when the write side is two documents
   *
   * `selection` is per profile and `patternSwitching` is file-level (`selectorSpec.ts`'s *"two
   * documents, not one"*), and {@link shiftRunConfigOf} writes both — through
   * `profileWithSelector` and {@link dispatcherProfilesWithSelector} respectively. But they are
   * one *decision*: a player who binds `up-peak` to `capacity-aware` and never chooses a policy has
   * configured nothing, and a state that could hold half of that is a state two panels can
   * disagree about. The split belongs to the loader, not to the reader.
   *
   * At its seeded value — every scalar at `DISPATCH_PARAMETERS`' default, `policy: 'off'`, and the
   * file's own arm map copied verbatim — the run it produces is **byte-identical** to the run built
   * before this field existed. That is asserted rather than asserted-in-prose; see
   * `selectorEditor.test.ts`.
   */
  readonly selectorSpec: SelectorSpec;

  /**
   * The Everyday rules rows — GAMEPLAY §11.5's when/then list, in priority order.
   *
   * Beside {@link ViewerState.selectorSpec} and {@link ViewerState.levers} because it is the same
   * kind of thing: applied on top of whichever dispatcher is driving, never a fork of one.
   * {@link shiftRunConfigOf} writes it **last** of the three — `profileWithRules` after
   * `profileWithSelector` — because a written rule list is the reader's most explicit statement
   * about how the dispatcher behaves during the run, and it sets `selection.policy: 'rules'`
   * over whatever the switching panel chose (`selectorEditor.ts#rulesOverrideNoteOf` is where
   * that override is said to the player).
   *
   * At its seeded value — the empty list — `profileWithRules` returns the profile **by object
   * identity**, so the run is byte-identical to one built before this field existed; the
   * `scope/probes` measured cell holds that as a measurement, not a promise.
   */
  readonly ruleRows: readonly RuleRow[];

  /**
   * The patience curve the Parameters tab is showing, or `null` for *nobody leaves*.
   *
   * ## Why this field exists — the UI readiness audit's **B4**
   *
   * The Parameters tab drew **114 live controls over 12 schemas** and bound none of them:
   * `mountParameterForm` handed back a `candidate()` that nothing in `packages/viz/src` or
   * `packages/cli/src` called, and the values lived in a closure local rather than here — so
   * `scope/scope.test.ts`, which derives its key set from this interface, could not see them and
   * never probed them. A player could set `sim.patience.meanS` to 120, press Run, and get the same
   * run byte for byte.
   *
   * `sim.patience.*` is the schema that is now wired, and it was chosen rather than being first
   * alphabetically: it is fully built in `core` (`sim/patience.ts`, wave 13), it is the one whose
   * effect a player can *see* on the stage — people give up and walk away — and its consequence for
   * the statistics is already enforced everywhere else in the product, so making it reachable adds
   * a control and no new claim.
   *
   * ## Why `null` and not a default curve
   *
   * `core`'s rule, not a choice made here. `sim/patience.ts`: *"there is no default and there
   * deliberately is not one: a default patience would put an unstated behaviour into every run"*.
   * At `null` this field writes nothing onto the config and the run is byte-identical to the run
   * before the field existed, which is what `scope/probes.test-helper.ts`'s probe measures from.
   *
   * ## Read this beside the mean, never instead of it
   *
   * Abandonment **improves** AWT by construction — it removes the longest waits from the sample. At
   * `midtown-office` 6 % with a 120 s mean patience the mean goes 61.9 s → 23.3 s with fifty-one
   * riders gone. `metrics/awtValidity.ts`'s fifth ground suppresses the mean outright above 2 %,
   * and `RunSummary.abandonment` is published beside it; nothing this field does needs a new rule,
   * because the rule was written when the mechanism was.
   */
  readonly patience: PatienceConfig | null;

  /* --- the week ----------------------------------------------------------- */
  readonly week: WeekState;
  /**
   * The weeks that are **not** on screen — one per assignment the player has stepped away from,
   * GitHub issue #107.
   *
   * ## Why a second field rather than a map the live week is read out of
   *
   * The obvious shape is *all the weeks, keyed by contract*, with `week` derived from
   * `contractId`. It was not taken: `state.week` is read in some forty places across this package
   * and a derived accessor would put a lookup — and a `| undefined` — on every one of them, for a
   * value that is never absent. Two fields keep `week` exactly what it has always been and give the
   * others somewhere to wait.
   *
   * The cost is an invariant that has to be maintained rather than typed: **no parked week carries
   * `week.contractId`**. `shift/week.ts#switchWeek` is the only function that writes this field and
   * it is what maintains it, which is why the field is not written anywhere else — a second writer
   * is how the screen comes to disagree with itself about what day it is.
   *
   * `[]` is a player who has only ever been on one assignment, and a first visit. It is not a
   * stand-in for weeks nobody kept: before issue #107 there was one slot and every other week had
   * already been destroyed, so an empty list is the **measured** state of a session written by an
   * older build — see `persist/types.ts`, which reads one that way for exactly that reason.
   */
  readonly parkedWeeks: readonly WeekState[];

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
  readonly report: ShapedDayReport | undefined;
  /** What the last run refused to configure, from `shiftRunPatch`. Shown, never swallowed. */
  readonly withheld: readonly string[];
  /**
   * The between-day beat — GitHub issue #91. `undefined` until a day has been closed.
   *
   * An **output**, on exactly {@link report}'s footing and for the same reason: it is built by
   * `closeShift` from the whole recording plus the two buildings, and no control writes it. It is
   * held on the state rather than derived in the panel because deriving it costs a
   * `parseBuilding`/`resolveBuilding` of *tomorrow's* building, which a render running at 60 Hz may
   * not do — see {@link tomorrowFactsOf}.
   */
  readonly tomorrow: TomorrowBriefing | undefined;
}

/* -------------------------------------------------------------------------- *
 * Whose progress is this? — § D231
 * -------------------------------------------------------------------------- */

/**
 * Whether a run in this play mode may write {@link ViewerState.week} — § D231.
 *
 * ## The defect this exists to end, which was data loss rather than a wrong caption
 *
 * `dev/main.ts`'s `closeShift` shaped the report sheet's `subject` on `playMode` and called
 * `closeDay(state.week, outcome)` **above that branch, unconditionally**. So a Free Play run — the
 * one whose own sheet prints *"one run, not part of a week — nothing is banked"* — closed a day
 * into the week, and `saveSessionNow()` on the next line wrote it to `localStorage`. A player who
 * had banked clean shifts on a scenario and then pressed **Free play** to try a silly dispatcher
 * came back to a week whose Day-1 history entry was the free-play run's, and it survived a reload
 * (issue #64).
 *
 * It is the same class as `closeShift`'s own *"three panels, two answers"* comment one layer down:
 * there, the sheet said *your own building* while the rail counted the shift as banked; here, the
 * sheet says *nothing is banked* while the week is being overwritten. The comment fixed what the
 * sheet **said**. This fixes what the run **does**.
 *
 * ## Why an exhaustive switch and not `mode === 'free-play'`
 *
 * A ninth {@link PlayMode} must be a compile error here rather than a silent `false` — or, worse,
 * a silent `true`, which is the direction that loses somebody's week. `scope/types.ts` makes the
 * same argument for the union itself: *a named category is a compile error when a fifth one
 * appears.*
 *
 * ## Endless banks nothing and still advances the week, which is not a contradiction
 *
 * `week.ts`'s `ENDLESS_CONTRACT_ID` is a sentinel that resolves to no contract, so
 * `closeDay` already banks nothing and clears nothing there. What endless *does* have is a week —
 * days, growth, a streak, a seven-day history — and *"the same week with no assignment: it grows"*
 * is the menu row's own promise. A mode that stopped closing days would stop growing the building,
 * which is the whole of what a player pressed **Keep going** for.
 *
 * Free Play is the opposite: `enterFreePlay` opens a *fresh* week at day 1 precisely so the run is
 * reproducible from its own selection and postable to a leaderboard. That week is scaffolding for
 * one run, and writing it over the campaign's is the bug.
 */
export function advancesTheWeek(mode: PlayMode): boolean {
  switch (mode) {
    case 'shift-week':
    case 'endless':
      return true;
    case 'free-play':
    case 'ranked':
    case 'stage-campaign':
    case 'incidents':
    case 'calendar':
    case 'commissioning':
      return false;
  }
}

/**
 * The week a closed day produces — the whole of {@link advancesTheWeek}'s consequence, in one
 * place a test can reach.
 *
 * Returns {@link ViewerState.week} **unchanged, by identity** when the mode does not advance it, so
 * *"the scenario week is untouched"* is checkable with `toBe` rather than with a deep compare that
 * a future field could slip past.
 *
 * `recordGrew` passes through to `closeDay` untouched — `docs/20` defect 17. It is a fact about
 * *why this close is happening* (an intervention re-simulation, per ENGINE_CONTRACT § 1.4, is the
 * same run's record growing rather than a new attempt), which only the shell knows; the mode gate
 * here neither needs it nor may reinterpret it.
 */
export function closedWeekOf(
  state: ViewerState,
  outcome: DayOutcome,
  recordGrew = false,
): WeekState {
  if (!advancesTheWeek(state.playMode)) return state.week;
  return closeDay(state.week, outcome, recordGrew);
}

/** What was last read back out of the slot, or `undefined` on a first visit. */
export interface StoredWeeks {
  readonly week: WeekState;
  readonly parkedWeeks: readonly WeekState[];
}

/**
 * The weeks that belong in the saved session — § D231, and the other half of the same guard.
 *
 * `saveSessionNow` writes the whole of `ViewerState`, and `closeShift` is not its only caller:
 * changing a setting saves too. So a guard on `closeDay` alone still lost the week the moment a
 * free-play player flipped the theme, because `enterFreePlay` has *already* replaced
 * `state.week` in memory by then. The week on disk is the campaign's and stays the campaign's
 * until a mode that owns one closes a day.
 *
 * `stored` is what `loadSession` last read back, or `undefined` on a first visit — in which case
 * there is nothing to protect and the current pair is written, which is the ordinary path.
 *
 * ## Why this returns both weeks and not one — GitHub issue #107
 *
 * It answered `week` alone until the parked weeks landed, and a sibling `parkedWeeksForSession`
 * would have been two functions that have to agree. They cannot be allowed to disagree: the live
 * week and the parked list are one campaign, and the invariant that binds them — **no parked week
 * carries the live week's `contractId`** — is a property of the *pair*. Held back separately, a
 * free-play save would write the campaign's stored week beside the in-memory parked list, and
 * `enterFreePlay` reaches this state through `withBuilding` and — since issue #125 —
 * {@link withFreePlayWeek}, one or both of which has just parked that very week. The player would
 * reload onto a campaign holding Garden Apartments twice, on two different days.
 *
 * So the pair is chosen at one instant, from one side, and `persist.test.ts` drives that case
 * rather than trusting this paragraph.
 */
export function weeksForSession(state: ViewerState, stored: StoredWeeks | undefined): StoredWeeks {
  if (advancesTheWeek(state.playMode)) {
    return { week: state.week, parkedWeeks: state.parkedWeeks };
  }
  return stored ?? { week: state.week, parkedWeeks: state.parkedWeeks };
}

/**
 * Change which building is running, taking the editors' working copies with it **when they are
 * untouched**.
 *
 * The two halves are both needed and they pull against each other. Leaving a copy alone means
 * opening the building editor after picking Vertical City shows Garden Apartments, which is a panel
 * describing a building nobody is looking at. Re-seeding it unconditionally means a reader who has
 * spent five minutes dragging an elevation loses it by touching the building select.
 *
 * So: re-seed only when the copy still equals the thing it was read from. That is the ordinary
 * rule for a working copy, and it is checkable here because `buildingSpec.ts` already has to answer
 * *is this dirty?* for the editor's own **edited — not saved** flag. One question, one answer.
 *
 * ## Two working copies, not one — GitHub issue #65
 *
 * The rule above was applied to `buildingSpec` and to nothing else, and the traffic editor is read
 * from the building too: `sourcePatternOf` resolves `editingPatternId: 'building'` through
 * `state.buildingId`, so the moment the building changed, the editor's untouched copy of Garden
 * Apartments' profile was being compared against Vertical City's — and the panel said
 * **edited — not saved** about a document nobody had edited. That is a *stale refusal*'s mirror
 * image: a claim that work is at risk when none is, which trains a reader to ignore the one flag
 * that means something. `patternSpec` now follows `buildingSpec`, under the same pristine guard and
 * for the same reason.
 *
 * ## And the fabric does not follow — it is cleared
 *
 * {@link ViewerState.commissioning} is a `BankChoice` per **bank id**, and bank ids are a fact about
 * one building. Carrying Garden Apartments' `main` over to Vertical City makes a choice set that
 * `commissionedBuilding` will apply by name to whatever bank happens to share the id and drop on
 * the floor otherwise — so the commissioning screen drew the previous scenario's shafts under the
 * new building's name, and the review's capital figure was summed over hardware that is not there
 * (issue #46).
 *
 * Empty is *as built*, and byte-identical to it, so clearing is the one value that means **nothing
 * has been decided about this building** — which is exactly true the instant a different building
 * arrives. It is not a re-seed for the same reason `asBuiltChoices` is not stored: a screen that
 * has not been opened has decided nothing, and `commissioningInput` builds the as-built set when it
 * needs one.
 *
 * There is no pristine guard on this half, and that is the difference rather than an omission. A
 * working copy can be dirty *against its source* because it is a document being edited; a choice
 * set cannot, because the bank ids it is keyed by stop existing. Nothing is preserved by keeping
 * it — see `state.test.ts`, which moves the fabric, changes building, and requires the fabric to be
 * gone.
 */
export function withBuilding(
  state: ViewerState,
  resources: BrowserResources,
  buildingId: string,
): ViewerState {
  /*
   * The week follows the building into its scenario — **and out of one, which is the half that was
   * missing.**
   *
   * Each shipped building *is* a scenario, so picking Midtown Office while the week sits on
   * Scenario 1 produced a sheet headed *Midtown Office* and footed *Scenario 1 — Learn the ropes*,
   * banking a Garden Apartments shift against a run that never touched it. The handoff's own
   * `pickPreset` restarts the week for exactly this reason.
   *
   * This paragraph used to continue: *"a building the reader drew belongs to no scenario, and then
   * the week keeps the one it had and the sheet says the shift is not being banked — which is
   * `contractStatus`'s own answer and the honest one."* **It was wrong, and it was wrong in the
   * direction this function exists to prevent.** Keeping the week meant keeping its `contractId`,
   * which `contractById` resolves perfectly — so a drawn tower inherited Scenario 2, the ribbon read
   * *Scenario · day 4 · 1 clean shift banked*, and `closeDay` banked against it. Two clean days on
   * an invented building cleared Scenario 2, which is measured in `state.test.ts` rather than
   * argued: it is the forgery the leaderboard's replay apparatus refuses, arriving through the
   * campaign's front door.
   *
   * So a building with no scenario takes {@link SANDBOX_CONTRACT_ID}. The week keeps its day, its
   * streak and its history — the player has not left the week, they have changed what it is *of* —
   * and it stops claiming to be an assignment. `contractById` returns `undefined`, which is the
   * answer the old comment claimed and did not produce.
   *
   * **And the week that is left behind is parked rather than destroyed** — GitHub issue #107. Until
   * `switchWeek` existed this line was a bare `takeContract`, so *every* change of contract opened a
   * fresh week: a player on Garden Apartments day 4 who looked at Midtown Office and came straight
   * back got Garden Apartments **day 1**, with four cleared days, the streak and 40 tenants of
   * growth gone and no confirmation, no warning and no undo. The rule that a scenario is a fresh
   * seven days is kept exactly — it is what a *first* visit still does — and the second visit is now
   * a resume. `shift/week.ts#switchWeek` owns the whole of that decision, including which week is
   * evicted and how `completed` is merged, because a transition written inside this function is one
   * `week.test.ts` cannot reach.
   */
  const contract = contractForBuilding(buildingId);
  const switched = switchWeek(
    state.week,
    state.parkedWeeks,
    contract?.id ?? SANDBOX_CONTRACT_ID,
    // `resume`, and the rule is the control: this is a `<select>` labelled *building*, sitting above
    // **Run this shift**, and it reads like a setting. Nothing in the shell tells a player that
    // touching it restarts a week, so it may not. `WeekArrival` is where the other answer is
    // defended, on the surfaces whose own copy promises a restart.
    'resume',
  );
  /*
   * The fabric is dropped whenever the building actually moves, and left alone when it does not —
   * `withBuilding` is called from the coach select on every `change`, including one that re-picks
   * the building already running, and a re-pick that silently discarded a fabric would be the
   * control moving back on its own.
   */
  const moved = buildingId !== state.buildingId;
  const next: ViewerState = {
    ...state,
    buildingId,
    week: switched.week,
    parkedWeeks: switched.parked,
    // The intervention log goes with the fabric and under the same guard: it is stamped against
    // one day in one tower, and a re-pick of the running building may not discard it — see
    // ViewerState.interventions for the full clearing ledger.
    ...(moved ? { commissioning: [], interventions: [] } : {}),
  };
  const withPattern = moved ? withReseededPattern(next, resources, state) : next;
  const source = buildingConfigOf(resources, state.savedBuildings, state.editingBuildingId);
  const pristine =
    source !== undefined &&
    !buildingSpecIsDirty(state.buildingSpec, specFromBuilding(source, state.editingBuildingId));
  if (!pristine) return withPattern;
  const wanted = buildingConfigOf(resources, state.savedBuildings, buildingId);
  if (wanted === undefined) return withPattern;
  return {
    ...withPattern,
    buildingSpec: specFromBuilding(wanted, buildingId),
    editingBuildingId: buildingId,
  };
}

/**
 * Put down whatever week is on screen and open Free Play's — GitHub issue #125.
 *
 * **A decision number is owed for this function.** The argument is here rather than in
 * `DECISIONS.md` because the lane that wrote it was told not to claim a `## D3xx` heading it could
 * not reserve; the numbered entry, when it lands, should say no more than this docstring does.
 *
 * ## The defect
 *
 * `menu/enterFreePlay.ts` composed its state as `{ ...withBuilding(state, …), week: openWeek(…) }`.
 * `withBuilding` parks the week it is leaving — that is {@link withBuilding}'s half of issue #107 —
 * and then the spread **overwrote the result**. On a building the campaign is not on, no harm is
 * done: the campaign week was already parked one line up, and what is discarded is the destination's
 * week, which {@link switchWeek} had just opened or resumed. On the campaign's **own** building the
 * two ids are equal, `switchWeek` returns `{ week, parked }` untouched by its first line, and the
 * week the player has been banking against is replaced in memory by a day-1 week wearing its id.
 *
 * `weeksForSession` keeps the disk copy — that is § D231, and it is why the loss is recoverable at
 * all — so the week comes back on reload and only on reload. Driven on the shipped code before
 * anything was changed: `midtown-office` day 4 → **Free play on midtown-office** → `week.day` is 1,
 * `weeksForSession` still answers 4, and moving the building select away and straight back gives
 * day 1, because the day-4 week is no longer anywhere in memory to resume.
 *
 * **Pre-existing, and measured as such rather than assumed.** The same sequence run on the tree
 * *before* § D312 (`58d4216^`) produces the same four figures: the in-memory loss and the disk
 * protection both predate the parked weeks. What § D312 changed is only that the *other* door — free
 * play on a different building — stopped losing anything.
 *
 * ## The decision, of the three the issue holds open
 *
 * **(a) park the campaign week.** A building switch already parks and resumes. Free play entering
 * the campaign's building is the same shape of departure — the player leaves a week and expects to
 * come back to it — and a second, different answer to one shape is the state this repository keeps
 * paying for.
 *
 * *(b) refuse, and say the campaign is on that building*, was rejected: Free Play is documented as
 * *"Any building, any dispatcher, any traffic"*, and refusing it on one building makes the campaign
 * a lock rather than a save.
 *
 * *(c) keep the behaviour and say so* was rejected because the sentence it needs — *your progress is
 * safe, reload to see it* — is a promise the screen is actively contradicting.
 * `shift/weekLabel.ts#weekKeptLine` already refuses that shape one function over: a claim that a week
 * is kept, on a build that shows day 1, has to be **true**, and telling a player to reload to check
 * is not the same thing as it being true.
 *
 * ## Why it is not the one-line `switchWeek(…, 'resume')` the issue sketches
 *
 * Because that call is a no-op, and parking under the borrowed id is worse than a no-op. Both were
 * driven. `switchWeek(week, parked, week.contractId, …)` returns its arguments — that arm exists so
 * the coach select can fire `change` on a re-pick without shuffling anything. And a hand-rolled park
 * that puts `c2` in the list while `c2` is live breaks {@link ViewerState.parkedWeeks}' invariant in
 * the direction that loses the week anyway: `switchWeek`'s `kept` filter drops every entry sharing
 * the departing week's id, so the first later building change replaces the parked campaign week with
 * the free-play scaffold. The week would be back for exactly as long as nobody touched a control.
 *
 * So the fix is one field further down: `shift/week.ts#FREE_PLAY_CONTRACT_ID` makes a free-play week
 * a week on no assignment, `switchWeek` can then tell it from the campaign's, and this function is
 * an ordinary `restart` arrival like the scenario card's. `restart` and not `resume`: free play is
 * day 1 by `docs/16` S6, and resuming a previous free-play week would be the mode running a day its
 * own screen did not name.
 *
 * ## Why it runs *after* {@link withBuilding} rather than before
 *
 * Before, it would park the campaign week and `withBuilding` would then immediately switch away from
 * the free-play week and back onto the destination's contract, which is the same overwrite with two
 * more steps. After, the week being put down is whatever `withBuilding` left live — the campaign's
 * own when the building did not move, and the destination's freshly resumed one when it did. That
 * second case is a loss of its own and it is closed by the same line: a player on `midtown-office`
 * with `garden-apartments` parked on day 7 who started free play on Garden used to have `withBuilding`
 * resume day 7 into the live slot and the spread discard it.
 *
 * ## Its non-test caller
 *
 * `menu/enterFreePlay.ts#enterFreePlay`, and only that. It is exported for the same reason
 * {@link withBuilding} is: `enterFreePlay` is a pure function in another module and the week and the
 * parked list are `dev/state.ts`'s to decide, not the menu's — *"re-implementing either here would be
 * the second answer to a question `dev/state.ts` has already answered"* is that module's own rule,
 * and this is the question it names.
 */
export function withFreePlayWeek(state: ViewerState): ViewerState {
  const switched = switchWeek(
    state.week,
    state.parkedWeeks,
    FREE_PLAY_CONTRACT_ID,
    // `restart`. Entering free play a second time is the one arrival that reaches `switchWeek`'s
    // same-id line, and it is harmless there: a free-play week never advances — `advancesTheWeek`
    // is false for the mode — so the week it declines to touch is already day 1 with nothing in it.
    'restart',
  );
  return { ...state, week: switched.week, parkedWeeks: switched.parked };
}

/**
 * Take the traffic editor's working copy to the new building, when it is still the old one's.
 *
 * Only ever called for `editingPatternId: 'building'`, and that is the whole of the condition: a
 * reader editing a *named* profile or one they saved is editing a document that has nothing to do
 * with which building is running, and re-seeding there would throw their work away on a control
 * that was not about it. `'building'` is the one selection whose source `sourcePatternOf` resolves
 * through `state.buildingId`, so it is the one that goes stale when the building changes.
 *
 * `before` is the state as it was, because the dirty question is *"is this copy still the old
 * building's profile?"* and the new building's is the wrong thing to ask it against.
 */
function withReseededPattern(
  next: ViewerState,
  resources: BrowserResources,
  before: ViewerState,
): ViewerState {
  if (before.editingPatternId !== 'building') return next;
  const was = buildingConfigOf(resources, before.savedBuildings, before.buildingId);
  const source = specFromTrafficProfile(resources.trafficProfiles, was?.trafficProfile);
  if (patternIsDirty(before.patternSpec, source)) return next;
  const wanted = buildingConfigOf(resources, next.savedBuildings, next.buildingId);
  if (wanted === undefined) return next;
  return {
    ...next,
    patternSpec: specFromTrafficProfile(resources.trafficProfiles, wanted.trafficProfile),
  };
}

/**
 * Change which dispatcher is driving, taking the editor's working copy with it — GitHub issue #65.
 *
 * `withBuilding`'s rule, on the other rail card, and it was missing for exactly as long: the rail
 * wrote `dispatcherId` alone, so picking **collective** from the list left `editingDispatcherId` and
 * `dispatcherSpec` on whatever profile had been opened before — a cost-function line, an advice
 * sentence and a weight grid describing a dispatcher nobody is running, under a card marked
 * *selected*. `runThisDispatcherStateOf` then offered *use this one* about the profile already
 * driving, because it compares the two ids.
 *
 * The pristine guard is the same and it is load-bearing for the same reason: a reader who has spent
 * five minutes moving weights and then wants to see what `collective` does keeps their copy, and the
 * editor's **edited — not saved** flag goes on saying so. `specIsDirty` is the one question, asked
 * once, exactly as `buildingSpecIsDirty` is above.
 */
export function withDispatcher(
  state: ViewerState,
  resources: BrowserResources,
  dispatcherId: string,
): ViewerState {
  const next: ViewerState = { ...state, dispatcherId };
  if (dispatcherId === state.dispatcherId) return next;
  const source = allDispatchers(resources, state.savedDispatchers).find(
    (profile) => profile.id === state.editingDispatcherId,
  );
  if (dispatcherSpecIsDirty(state.dispatcherSpec, source)) return next;
  const wanted = allDispatchers(resources, state.savedDispatchers).find(
    (profile) => profile.id === dispatcherId,
  );
  if (wanted === undefined) return next;
  return {
    ...next,
    dispatcherSpec: specFromProfile(wanted, wanted.name),
    editingDispatcherId: dispatcherId,
  };
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
    playMode: 'shift-week',
    calendar: null,
    commissioning: [],
    // Retrofit: the fabric is what the building already has. The opening position is the one that
    // takes nothing away and adds nothing — a player has not asked to rebuild anything yet.
    commissioningConstraintId: RETROFIT_CONSTRAINT_ID,
    mode: 'basic',
    showMaths: true,
    tab: 'run',
    // A first visit's reveal, not every boot's. Since § D330 (issue #130) `dev/main.ts` reads the
    // stored set over this before the first render, so a returning player keeps the strip they
    // earned; this module cannot do it itself, because it may not touch `localStorage`.
    revealedTabs: new Set<TabName>(),
    railSegment: 'dispatcher',
    drawerOpen: false,
    buildingId,
    dispatcherId,
    pattern: 'building',
    // The opening scenario's own shift, which for `c1` is an hour — § D234. The page opens on
    // `CONTRACTS[0]`, so the length the tutorial is graded over is the length it opens on.
    shiftLengthS: shiftLengthForContract(contractForBuilding(buildingId)?.id ?? ''),
    // The whole of whatever period the opening template declares. `null` rather than `0`, so the
    // first run a reader sees is byte-identical to the run before § D285 existed.
    windowStartS: null,
    // `undefined`, not a default template. The campaign owns the run until Free Play says
    // otherwise, and every published figure in this repository was measured with no override.
    freePlay: undefined,
    seed,
    outOfServiceCarIds: [],
    // Nothing has been intervened on. The stage control is the only writer; see the field's
    // docstring for what clears it.
    interventions: [],
    levers: DEFAULT_LEVERS,
    /*
     * Seeded from the opening dispatcher and the loaded file, not from a blank: every shipped
     * profile authors no `selection` at all, so this is the declared defaults plus the file's own
     * five bindings — the configuration a reader is already running, drawn rather than invented.
     * An editor that opened on an empty arm map would make a player author five bindings before
     * they could see what the mechanism is.
     */
    selectorSpec: selectorSpecFromProfile(profile, selectorContextFrom(resources.dispatcherProfiles)),
    /*
     * Seeded from the opening dispatcher, the selectorSpec's own argument one field up: a profile
     * that authored rules opens with its rows in the editor rather than with a blank list lying
     * about the run. Every shipped profile authors none, so this is `[]` on every boot the
     * product ships and the opening run is the run it was before the rules editor existed
     * (`profileWithRules` at `[]` is the identity — see {@link ViewerState.ruleRows}).
     */
    ruleRows: rulesFromProfile(profile),
    /*
     * `null`, which is `sim.patience.distribution`'s own declared default (`'none'`) read back as a
     * config: a page that has just loaded has nobody abandoning, and the opening run is the run it
     * was before this field existed. See {@link ViewerState.patience}.
     */
    patience: null,
    week: openWeek(contractForBuilding(buildingId)?.id),
    // Nothing has been stepped away from yet. `switchWeek` is the only thing that fills this.
    parkedWeeks: [],
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
    // No day has closed, so there is no overnight to reveal. `undefined` rather than an empty
    // briefing: an empty one would draw the captions *Tomorrow* and *Yesterday* over nothing,
    // which is `docs/10` R3's blank-where-a-number-should-be at the layout's scale.
    tomorrow: undefined,
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
    preferredId(PREFERRED_VIEWER_DISPATCHERS, profiles) ?? profiles[0]?.id ?? 'collective'
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

/**
 * The profile this state actually drives — the base by id, then the levers, then the selector,
 * then the rules, in {@link shiftRunConfigOf}'s own order and extracted from it so there is one
 * derivation rather than two (review finding 2: the stage's switch-dispatcher control must
 * compare against *the vector actually driving*, and a private copy of this chain in `dev/main.ts`
 * would be the second answer that drifts).
 *
 * The selector is written over the profile the levers already produced, because it is the
 * reader's most explicit statement about how the dispatcher should behave *during* the run and
 * because `profileFromSpec` carries the base profile's own `selection` through its spread — so
 * writing it first would leave the working copy losing to a field it was seeded from. The rules
 * write **after** the selector — the reader's most explicit statement writes last, the same
 * ordering argument the selector makes against the levers one step up. With no rows
 * `profileWithRules` is the identity (the same object), so a reader who has written nothing runs
 * exactly the profile the two writes above produced.
 */
export function drivingProfileOf(
  resources: BrowserResources,
  state: ViewerState,
): DispatcherProfile {
  const base = profileById(resources, state.savedDispatchers, state.dispatcherId);
  return profileWithRules(
    profileWithSelector(
      profileFromSpec(specFromProfile(base, base.name), {
        id: base.id,
        base,
        levers: state.levers,
      }),
      state.selectorSpec,
    ),
    state.ruleRows,
  );
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

/**
 * The building the state is *pointing at*, resolved — for the chrome to describe before a run
 * exists. § D234, issue #36.
 *
 * ## What this is not, and why the distinction is the whole of the fix
 *
 * `ShiftRunConfig.building` is the building a run **resolved to**: grown to the day, commissioned,
 * with the day's incidents written onto it. That is the right thing for the header to describe
 * while a recording is on screen, and `dev/main.ts` holds it from the last `runShift`.
 *
 * It is the wrong thing to describe when there is **no** recording, and the shell had nothing else.
 * Pressing *Take the next assignment* moves `buildingId` and clears the recording without running,
 * so the header drew the new building's **name** — read from `state.buildingId` — beside the
 * previous building's **specs**, held from the last run: `Midtown Office · 6 floors · 2 cars ·
 * 0.63 m/s · 135 people`, where Midtown Office is 21 floors, 4 cars, 2.5 m/s and 1,710 people. A
 * player reading that is told the next challenge is the size of the tutorial.
 *
 * ## The half of that argument that was wrong, and how it was found — GitHub issue #300, § D390
 *
 * § D390 supersedes the closing paragraph of § D234's argument for this function and nothing else
 * in it; the paragraph above is § D234's and still stands.
 *
 * The sentence that used to close the paragraph above read: *"So: the **shipped** building, not a
 * grown one. Nothing has been run, so there is no day to have grown it to."* The first clause was
 * right about #36 and the second was **not a fact about the state**. `week.day` is a field, not a
 * consequence of a recording: it is 3 on Wednesday morning whether or not Wednesday has been run,
 * and `shiftRunConfigOf` grows the fabric to it either way. So there was always a day to grow to,
 * and *"nothing has been run"* was answering a different question from the one being asked.
 *
 * Measured on the tree at `f13d455`, walking days 1–3 and comparing this function's answer against
 * `shiftRunConfigOf(...).building.totalPopulation` on the same state:
 *
 * | building | day 1 | day 2 | day 3 |
 * |---|---|---|---|
 * | `garden-apartments` | 120 = 120 | 120 vs **135** | 120 vs **145** |
 * | `midtown-office` | 1 710 = 1 710 | 1 710 vs **1 900** | 1 710 vs **2 090** |
 * | `chancery-house` | 612 = 612 | 612 vs **684** | 612 vs **738** |
 *
 * Growth was not the only producer, and the second one is larger. A calendar period scales the same
 * floors through `calendar.ts#calendarPatch` → `growth.ts#scaledBuilding`, so on `midtown-office`
 * under `public-holiday` the brief said **1 710** about a run of **437**, and under `vacation`
 * **1 710** about **1 026**. Commissioning is a third: a bank widened by two shafts left the
 * brief's `Lifts` row reading **4** against a run of **6**. One defect, three producers, and a fix
 * that named only the one the issue named would have left the two larger halves standing.
 *
 * ## So this asks the run, rather than reproducing what the run does
 *
 * The answer is `shiftRunConfigOf(...).building` — grown to the day, commissioned, scaled by the
 * calendar, with the day's incidents on it. Not a second copy of that chain: the three producers
 * above sit within a few statements of each other inside `shiftRunConfigOf` and are **not
 * separable from the demand derivation** — `calendarPatch` needs the mix the day's event actually
 * produced, and `withIncidents` needs that patch's incidents — so a sibling that reproduced them
 * would be the *"two implementations that agree until somebody changes one"* failure `growth.ts`,
 * `tomorrow.ts` and `calendar.ts` each already have a docstring about, and the next producer to be
 * added would have to be remembered twice. `today.ts`'s own module docstring is the rule in one
 * line: *they ask this module once, and it asks `shift/` once.*
 *
 * **#36 is kept by construction rather than by a branch.** `growthFactor(1)` is exactly 1, and
 * `Math.round` is the identity on the integers `data/` declares, so a week on day 1 with no
 * calendar returns the shipped populations — the three day-1 rows above are that, measured. What
 * the issue asked for was not *"always grow"* but *"grow when there is a day to grow to"*, and the
 * day-1 identity is what makes those the same sentence. #36's actual defect — the new building's
 * name beside the previous building's specs — is untouched: both still come from the standing
 * `state.buildingId`, and the only thing that changed is which day's version of it.
 *
 * ## Cost, since this went from a lookup to an assembly
 *
 * Measured on `midtown-office`, 200 calls: **0.643 ms** against the old path's **0.0003 ms**. That
 * matters here rather than being a footnote, because {@link ViewerState.tomorrow} exists precisely
 * to keep a `parseBuilding`/`resolveBuilding` off a 60 Hz render — so the same bar has to be
 * cleared, and it is cleared by *reaching*, not by being cheap.
 *
 * **No 60 Hz path reaches this.** `dev/main.ts#tick` renders at 60 Hz only while a `playback`
 * exists; `playback` is assigned at exactly one place (`adopt`), every caller of which sets or
 * already holds `state.recording`, and the one branch that has no run to adopt writes
 * `playback = undefined` instead. So `playback !== undefined` implies `recording !== undefined`,
 * and `viewAt` reaches this function only on its `recording === undefined` arm — the two are
 * disjoint. Everything else that asks is a discrete render: a screen mount, a `host.subscribe`
 * notification, a resize.
 *
 * `undefined` when the id resolves to nothing, which is the same answer `buildingConfigOf` gives
 * and the same one the chrome already handles. Asked **first**, and that is what keeps this total:
 * `shiftRunConfigOf` throws on exactly that id rather than returning an answer, so the lookup is
 * the guard rather than a shortcut.
 */
export function resolvedBuildingOf(
  resources: BrowserResources,
  state: ViewerState,
): ResolvedBuilding | undefined {
  if (buildingConfigOf(resources, state.savedBuildings, state.buildingId) === undefined) {
    return undefined;
  }
  return shiftRunConfigOf(resources, state).building;
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
  /** What the calendar did to today, in one line, or `''` on an ordinary day. */
  readonly calendarLine: string;
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
  const specs = specsWithSaved(resources, state.savedClasses);

  /*
   * 2b — the fabric the reader commissioned, **before growth and before the resolve**.
   *
   * Ordering is forced rather than stylistic. `shiftRunPatch` calls `carsToDerate` on the *resolved*
   * building, and `withIncidents` writes `serviceEvents` naming `(bankId, carId)` pairs — so a
   * commissioning applied later would derate a car that no longer exists, or miss the shaft that
   * was added. It follows the specs widening so a machine class the reader saved is commissionable.
   *
   * Against growth the order is free (disjoint fields — commissioning writes `banks`, growth writes
   * `floors`) and chosen for what it says: **the fabric is decided before the week opens, and
   * growth is a thing that happens to the fabric.** That is the mode's whole premise — you choose,
   * then you live with it — expressed in the sequence rather than only in prose.
   *
   * `commissionedBuilding` is total: an unknown class leaves the bank alone, `shafts < 1` clamps,
   * and a double-deck class in an unpaired bank commissions single-deck. So there is no guard here;
   * the screen gates with `reviewCommissioning`, and a run is never unloadable.
   */
  const classes = commissionableClasses(specs);
  const fabric = commissionedBuilding(authored, state.commissioning, classes);

  // 1 — grown to the day, then the dwell lever written onto the cars, then re-parsed so a grown
  // building is validated like any other.
  const grown = withDoorTiming(grownBuilding(fabric, state.week.day), doorTimingFor(state.levers));
  const building = resolveBuilding(parseBuilding(grown as unknown), specs);

  // 3 — the dispatcher, plus the levers, plus the weight-set selector, through the one
  // derivation {@link drivingProfileOf} holds.
  const dispatcherProfile = drivingProfileOf(resources, state);
  const dispatcherProfiles = dispatcherProfilesWithSelector(
    resources.dispatcherProfiles,
    state.selectorSpec,
  );

  /*
   * 4 — the calendar's day, then the demand, then the day's event over it.
   *
   * The event goes through `scheduledEventFor` because a period may name today's — `moving-week` is
   * *`move-in` every day but Sunday* — and `shiftRunPatch` has to be handed the event the run is
   * actually under, not the one the ordinary schedule would have produced.
   *
   * **This line used to be the ternary that function now holds**, and it was the only place in the
   * viewer that got the question right: GitHub issue #135 is the four surfaces that answered it
   * with `eventFor` alone. It is a call rather than a copy so that the run and the surfaces
   * describing it cannot drift — see `shift/calendar.ts#scheduledEventFor` for the four and for the
   * guard that stops a fifth.
   */
  const calendarDay = calendarDayFor(state.calendar, state.week.day, state.week.dayIdx);
  const event = scheduledEventFor(state.calendar, state.week.day, state.week.dayIdx);
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
  /*
   * Through {@link calendarAskInputOf} rather than spelled out here, and the two are the same
   * expression: `state.freePlay?.demandTemplateId ?? pattern.demandTemplate` **is**
   * `shiftDemandTemplateId`, which that helper is built on. What the helper adds is that the three
   * fields `calendarPatch` is handed below and the three `scope/runIdentity.ts` decides a period's
   * asks against are now one value rather than two copies of four expressions (issue #140).
   */
  const askInput = calendarAskInputOf(resources, state, authored);
  const demandTemplate = askInput.demandTemplateId as typeof pattern.demandTemplate;
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

  /*
   * 4b — the calendar's edit to the building and the demand, **after the event patch and before the
   * incidents**.
   *
   * After the patch because its `split` input must be the mix the run actually has: a fire drill
   * inside a vacation week is still a drill, pulled flatter. The cars are a separate matter and no
   * longer depend on this ordering: `calendarPatch` is handed the day's `event` and asks
   * `events.ts#eventCarChoice` itself, which is what stops a reserved goods car being the same car
   * the move-in derate already took — the car the incident's own return event would otherwise hand
   * back to passengers mid-shift.
   *
   * Before the incidents because the schedule has to be written onto the building the calendar
   * returns, so one parse-and-resolve covers both edits rather than two.
   *
   * **The event and the player's holds, rather than a list of car ids — GitHub issue #272.** This
   * line used to pass `spokenForCarIds: patch.outOfServiceCarIds`: the event's whole-shift holds
   * alone, which is `[]` on every day this build can produce, so the paragraph above described a
   * mechanism the product did not reach. On `midtown-office` / `moving-week` / day 1 the reservation
   * and `move-in`'s derate both picked `main-D`, the schedule returned it at 1 200 s of an 1 800 s
   * shift, and 114 people rode the car the caption reserved for the movers.
   * `calendar.test.ts`'s harness built the right list all along and was never compared against this
   * one on a day with a period.
   *
   * No caller builds that list now. `calendarPatch` derives it from the event through
   * `events.ts#eventCarChoice` — the same function `shiftRunPatch` decided this run's own holds and
   * incidents with, three statements above — so the run and the caption cannot pick different cars.
   */
  const calendar = calendarPatch({
    day: calendarDay,
    building: grown,
    split: patch.demand.directionalSplit ?? baseOf(resources, authored, demand).split,
    ...askInput,
    event,
    playerHeldCarIds: state.outOfServiceCarIds,
  });

  const outOfServiceCarIds = [
    ...new Set([
      ...state.outOfServiceCarIds,
      ...patch.outOfServiceCarIds,
      ...calendar.outOfServiceCarIds,
    ]),
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
  const withEvents = withIncidents(calendar.building, patch.incidents, state.shiftLengthS);
  const finalBuilding =
    withEvents === grown ? building : resolveBuilding(parseBuilding(withEvents as unknown), specs);

  /*
   * 6 — the window the figures are read over. Asked of the **authored** building id rather than of
   * `finalBuilding.id`, and the two are the same string: growth, commissioning and incidents all
   * edit a building without renaming it, and asking the resolved one would make the answer look
   * like it could depend on the day. It cannot; the matrix measures buildings, not days.
   */
  const reportWindow = shiftReportWindowFor(authored.id);

  return {
    building: finalBuilding,
    event,
    /*
     * The calendar's caption, built here rather than by the ribbon — `docs/16` S5's rule. It is a
     * statement about **what was applied**, and only this function knows that: a template the run
     * length refused never reaches it, and a population is the one `expandFloors` counted on the
     * edited building rather than the factor that was asked for.
     */
    calendarLine: calendarDay === null ? '' : calendarLine(calendar),
    outOfServiceCarIds,
    withheld: [...patch.withheld, ...calendar.withheld],
    config: {
      building: finalBuilding,
      dispatcherProfile,
      trafficProfiles,
      elevatorSpecs: specs,
      dispatcherProfiles,
      seed: state.seed,
      /*
       * `durationS` **or** a window, never both — § D286, and the branch is what makes the control
       * honest rather than what makes it work.
       *
       * `durationS` becomes `templateOverrides.durationS` inside `runSimulation`, which *refits the
       * template's geometry*: a 900 s `rise-and-fall` is a shorter ramp around the same five-minute
       * hold, which is issue #81's rescale. So a part of the day may not travel as one. It travels
       * as `windowStartS`/`windowEndS`, which leave the schedule exactly as authored and select
       * from it, and the run's demand horizon then comes from the window rather than from here.
       *
       * On a phase-list template `core` would refuse the override outright (§ D275), so this is not
       * merely tidier: passing both would throw on the one template that has parts to select.
       */
      ...(state.windowStartS === null
        ? { durationS: state.shiftLengthS }
        : {
            windowStartS: state.windowStartS,
            windowEndS: state.windowStartS + state.shiftLengthS,
          }),
      /*
       * **Which window the figures are read over** — `docs/20` defect 5, and the *third* kind of
       * window on this object rather than a variant of the two above it.
       *
       * `durationS` decides how much day is generated and `windowStartS`/`windowEndS` decide how
       * much of it is run; this decides how much of what ran is **measured**. `core`'s own
       * `SimulationConfig.reportWindow` says the distinction in as many words, and it matters here
       * because the shift path set none — so the sheet inherited the demand template's fixed
       * five-minute band and Garden Apartments day 1, the first sheet a new player ever sees,
       * withheld both of its headline numbers under *"the reporting window held no arrivals"* on a
       * day of forty riders who all turned up outside it.
       *
       * `shiftReportWindowFor` reads the conclusion `benchmark/arms.ts` § 2 already measured rather
       * than deciding one here, and returns `undefined` — *leave the template's band alone* — for
       * every building the matrix does not unanimously report full-run. Spread-or-omit, because an
       * absent key and a present `undefined` are different claims to `core` and only the first
       * means *the template's own*.
       */
      ...(reportWindow === undefined ? {} : { reportWindow }),
      demandTemplate: (calendar.demandTemplateId ?? demandTemplate) as typeof demandTemplate,
      demand: { ...demand, ...patch.demand, ...calendar.demand },
      /*
       * The Parameters tab's one applied schema — the audit's B4, and `dev/parameterForm.ts`'s
       * `APPLIED_SCHEMA`.
       *
       * **Spread rather than written as `patience: state.patience ?? undefined`**, so a run with no
       * curve carries no `patience` key at all. `sim/patience.ts` is explicit that an absent block
       * and a present-but-off one are different claims — *"a run which did not ask for a feature
       * must be the run it was before the feature existed"* — and `scope/probes.test-helper.ts`
       * compares the two arms on the legs, so *byte-identical at null* is asserted rather than
       * asserted-in-prose.
       */
      ...(state.patience === null ? {} : { patience: state.patience }),
      /*
       * The run record's intervention log — contract § 1.4, and plain data, so it crosses the
       * shift worker's structured clone like every other field here. **Spread rather than written
       * as `interventions: state.interventions`**, for `patience`'s stated reason one line up: an
       * empty log carries no key at all, and `core` promises a run with no `interventions` key is
       * byte-identical to one built before the field existed — `sim/interventions.test.ts` pins
       * that with a fingerprint, and this spread is what lets the viewer inherit the pin.
       */
      ...(state.interventions.length === 0 ? {} : { interventions: state.interventions }),
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

/* -------------------------------------------------------------------------- *
 * Tomorrow — GitHub issue #91
 * -------------------------------------------------------------------------- */

/** What the between-day beat states about tomorrow. Every field is measured, none is a caption. */
export interface TomorrowFacts {
  /** `ResolvedBuilding.totalPopulation` — the floor sum `core` counts arrivals against. */
  readonly population: number;
  /** `calendarLine`, or `''` when the week is under no period. */
  readonly calendarLine: string;
  /** What tomorrow's configuration refuses, verbatim. */
  readonly withheld: readonly string[];
}

/**
 * Tomorrow, measured — by building tomorrow's run plan and reading it.
 *
 * ## Why it goes all the way through `shiftRunConfigOf` rather than calling `growthFactor`
 *
 * `shift/growth.ts`'s own docstring names the alternative and calls it a lying seam: *"a growth
 * factor that only reached the tenant count in the header would be the twelfth dead seam, and it
 * would be a lying one"*. The population a player is shown for tomorrow has to be the population
 * tomorrow's kernel counts arrivals against, which means the same `commissionedBuilding` →
 * `grownBuilding` → `calendarPatch` → `parseBuilding`/`resolveBuilding` chain the run uses, in the
 * same order, with the same rounding. Anything cheaper is a number that agrees with the run until
 * a calendar period is open or a bank has been commissioned, and then quietly does not.
 *
 * The other two facts come free from the same call and would otherwise each need their own partial
 * re-derivation: `calendarLine` is `shiftRunConfigOf`'s own caption for the period, and `withheld`
 * is what tomorrow's configuration refuses.
 *
 * `plan.event` is deliberately **not** carried, and the reason has changed since it was written.
 * It used to be that this event was the *patched* one and the Day report's *Tomorrow* card named
 * `eventFor`'s unpatched schedule, so carrying it would have put two disagreeing event names on one
 * screen. GitHub issue #135 closed that disagreement — the card goes through
 * `shift/calendar.ts#scheduledEventFor` now, so the two agree by construction. What survives is the
 * *other* half of the argument, which never depended on the defect: two names for one event on one
 * screen is § D223's two-answers shape whether or not they happen to match, and one of them would
 * be the one a later edit forgot. The card names it; this does not.
 *
 * ## What it costs, and why that is affordable exactly here
 *
 * Two `parseBuilding`/`resolveBuilding` passes — no simulation, no RNG, no kernel. It is called
 * **once per closed day**, from `closeShift`, and never from a render: the shell redraws at 60 Hz
 * during playback and a resolve on that path would be a per-frame document parse. That is the
 * reason {@link ViewerState.tomorrow} is a stored output rather than something the report panel
 * derives when it draws.
 *
 * ## `nextDay`, not `day + 1`
 *
 * The week is advanced through `shift/week.ts#nextDay`, so the weekday index wraps the way the
 * shipped transition wraps and the beat cannot describe a Saturday the button will not open on.
 * Reconstructing `{ ...week, day: week.day + 1 }` here would be a second implementation of the one
 * transition this whole feature is a preview of.
 */
export function tomorrowFactsOf(
  resources: BrowserResources,
  state: ViewerState,
): TomorrowFacts {
  const plan = shiftRunConfigOf(resources, { ...state, week: nextDay(state.week) });
  return {
    population: plan.building.totalPopulation,
    calendarLine: plan.calendarLine,
    withheld: plan.withheld,
  };
}

/**
 * The dispatcher-profile **file** the run resolves its weight-set arms from, with the reader's arm
 * map written into it.
 *
 * `SimulationConfig.dispatcherProfiles` is what `weightSetSourceFrom` turns into the arm library,
 * and the block it reads is file-level — so an editor that bound `up-peak` to a different weight
 * set and wrote it only onto a profile would have edited a field the loader has nowhere to put.
 * This is the other half of `selectorSpec.ts`'s *"two documents, not one"*, and it is the half that
 * had **no seam at all** before this lane: `shiftRunConfigOf` passed `resources.dispatcherProfiles`
 * straight through, so `patternSwitching` was loadable (§ D153's limitation, closed) and
 * unwritable.
 *
 * ## The identity return is the point, not an optimisation
 *
 * When the reader's map is the file's own map, **the file object itself comes back** — not a copy
 * that happens to be equal. `viewerSelector.test.ts`'s § D153 acceptance evidence asserts
 * `configFrom(shipped).dispatcherProfiles` **is** the loaded file, and the criterion behind that
 * assertion is the one worth keeping: closing a seam must cost nothing while nothing opts in.
 *
 * Arms may only name profiles the **file** declares, because that is the set
 * `weightSetSourceFrom` builds `weightsByProfileId` from; a dispatcher the reader saved is not in
 * it. The editor therefore offers only those (`docs/16` S7 — a control that cannot be honoured is
 * not offered), rather than offering a saved dispatcher and refusing it at Run.
 */
export function dispatcherProfilesWithSelector(
  file: DispatcherProfiles,
  spec: SelectorSpec,
): DispatcherProfiles {
  const next = patternSwitchingWithSelector(spec, selectorContextFrom(file));
  const before = file.patternSwitching;
  if (next === undefined || before === undefined) return file;
  if (sameArmMap(before.weightSetsByPattern, next.weightSetsByPattern)) return file;
  return { ...file, patternSwitching: next };
}

/** Two arm maps binding the same patterns to the same weight sets. Key order is not a difference. */
function sameArmMap(
  a: Readonly<Record<string, string>>,
  b: Readonly<Record<string, string>>,
): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
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
  // Accepted and unused (see `void building` below), and widened to admit `undefined` so that
  // `shiftDemandTemplateId` — whose caller looks a building up by id and may not find one — can
  // reach the same answer without inventing a building to satisfy a parameter nobody reads.
  building: BuildingConfig | undefined,
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
/**
 * The shipped specs widened by every class the reader saved.
 *
 * Exported because the commissioning screen has to offer the **same** class list the run will
 * resolve against: a screen built from the shipped six while the run uses seven would refuse a
 * choice the week then honours, which is a refusal a player cannot act on.
 */
export function specsWithSaved(
  resources: BrowserResources,
  saved: readonly MachineClass[],
): ElevatorSpecs {
  let specs: ElevatorSpecs = resources.elevatorSpecs;
  for (const machineClass of saved) specs = specsWithClass(specs, machineClass);
  return specs;
}

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
