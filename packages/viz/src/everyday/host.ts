/**
 * **The Everyday data host** — the typed façade through which Everyday screens reach the
 * simulation machinery, and the one channel `dev/main.ts` publishes it on.
 *
 * ## Why a façade, and why it is plain data in and plain data out
 *
 * Everything real — the week, the resources, the saved dispatchers, the runner — lives inside
 * `dev/main.ts`'s `boot()` closure, where no screen may reach: a screen that imported `dev/main`
 * would couple the Everyday product to the Engineer shell's internals, and the import cycle it
 * creates (`main` → `everyday/types` → … → `main`) is the temporal-dead-zone class of defect the
 * shell's own docstrings keep a register of. So the closure implements {@link EverydayHostBindings}
 * against its own state and hands it to {@link createEverydayHost}, and screens see only
 * {@link EverydayHost} on their {@link import('./screens.js').EverydayScreenContext}.
 *
 * Every method is **plain data in, plain data out** — the same discipline `dev/shiftRunner.ts`'s
 * worker seam enforces with a structured clone. Nothing here hands back a live `Simulation`, a
 * `Playback`, or an element; the largest things that cross are `ViewerState` fields, which are
 * already the values the persistence layer round-trips. That is what keeps a screen testable
 * without a document and keeps the host mockable with an object literal.
 *
 * ## What is deliberately NOT on the host, and why the absences are named
 *
 * A façade method with no caller is this repository's dead-seam shape — a behaviour that is typed,
 * tested and reached by nothing — so the surface below is exactly what the guide's screens read
 * (door/brief/report/week/campaign read the day record; the workshop reads and writes the plain
 * levers; the stage needs the run actions) and nothing speculative. Named absences, for the lane
 * that needs one to add with its consumer:
 *
 * - ~~no standalone building setter~~ — **built, and the absence is corrected here rather than left
 *   standing.** `dev/state.ts#withBuilding` parks a week as it goes (issue #107), which is why there
 *   was none for two waves: § 6's whole premise is *one building, one crowd, one seed, everybody*,
 *   and a control that changed the tower on the front door would be changing the day out from under
 *   the score. {@link EverydayHost.applyBuildingSpec} is that setter and it arrived **with its two
 *   consumers** — GAMEPLAY § 13's *Run a day in it* and § 3.3's tuner primary — rather than ahead of
 *   them, which is the rule these absences exist to keep. It honours the parking argument rather
 *   than routing around it: `stateRunningSaved` goes through `withBuilding`, and the sandbox
 *   contract is what says a drawn tower belongs to no scenario. The daily loop's own *"you can
 *   change all of them and the run stops counting"* routes to the tuner — **and the tuner is built**,
 *   so the clause that called it unbuilt and quoted `screens.ts`'s refusal went with the screen that
 *   landed, on the same commit, which is § D227's rule applied to a docstring.
 *   {@link EverydayHost.runCampaignDay} is **not** the exception it looks like: it writes a tower's
 *   building id *and* its dispatcher id *and* presses run, as one indivisible campaign press, so no
 *   screen can use it to move the standing selection without running the day that selection belongs
 *   to — which is the § 8.5 press, not a setter wearing its clothes.
 *   **There is a dispatcher setter now** ({@link EverydayHost.startFromDispatcher}), added with the
 *   § 11 workshop screen that presses it, so the older form of this bullet — *"no dispatcher or
 *   building setter"* — is corrected here rather than left standing: a stated absence that has
 *   stopped being true is § D227's defect with its polarity reversed, a refusal telling a reader
 *   not to look for something that is there;
 * - ~~no campaign works booking, no contract acceptance~~ — **built**: {@link EverydayHost.campaign}
 *   and {@link EverydayHost.campaignAct} are GAMEPLAY § 8's three screens' whole surface, and the
 *   career they read is described in `campaign/career.ts`;
 * - **no transport control** (pause, speed, seek) and no `playing` flag — **and this absence is now
 *   a decision rather than a gap.** The § 7 Everyday stage exists (`everyday/stageScreen.ts`) and it
 *   owns its own transport: {@link EverydayHost.recording} hands it the finished recording, which is
 *   plain data, and it constructs its own `Playback` over it. A transport *method* here would be a
 *   second clock — the Engineer surface has one and the stage has one, and a façade that let either
 *   drive the other is how the two get to disagree about where the playhead is. What does cross is
 *   the one place they must agree: {@link EverydayHost.intervene} takes the caller's playhead
 *   explicitly, and `dev/main.ts` seeks its own transport to it, so an intervention stamped on the
 *   Everyday stage lands at the instant the Everyday stage was showing;
 * - **no second recording, so no § 7.4 ghost** — `dev/ghostRun.ts` builds a rival inside the
 *   Engineer closure, and nothing here reaches it. The stage draws `raceStripViewOf`'s *nobody* arm
 *   and names the absence (`everyday/stageScreenModel.ts#STAGE_NO_GHOST`); a ghost method with no
 *   rival behind it would be worse than none;
 * - **no watch entry** — § 14's spectator flow has no Everyday surface yet;
 * - **no saved-pattern or saved-building *shelf* to browse** — and the narrowing is the point.
 *   {@link EverydayHost.applyBuildingSpec} and {@link EverydayHost.applyPatternSpec} both *write* to
 *   those shelves and hand back the id they took, because § 13's designer and § 3.3's tuner press
 *   them. What no listed screen reads is the **list**, so no method answers one. The bullet used to
 *   say the shelves were untouched, and a stated absence that has stopped being true is § D227's
 *   defect with its polarity reversed.
 *
 * ## Change notification
 *
 * {@link EverydayHost.subscribe} fires on **state changes** — every path through `dev/main.ts`'s
 * `renderAll()` — and deliberately not per animation frame: the 60 Hz playhead is a *pull*
 * (`runState().playheadS` reads the live transport at call time), so a screen that wants a moving
 * clock animates itself, and a screen that only draws facts redraws exactly when a fact moved.
 */

import type {
  BuildingConfig,
  DispatcherProfile,
  DispatcherProfiles,
  ElevatorSpecs,
  ResolvedBuilding,
  RunInterventionConfig,
  TrafficProfile,
} from '@elevator-sim/core/browser';

import { specFromBuilding, type BuildingSpec } from '../authoring/buildingSpec.js';
import {
  specFromProfile,
  specIsDirty,
  type DispatcherSpec,
  type DwellChoice,
  type GroupLevers,
} from '../authoring/dispatcherSpec.js';
import { specFromTrafficProfile, type PatternSpec } from '../authoring/patternSpec.js';
import { templateHasClock, type RuleRow } from '../authoring/ruleSpec.js';
import {
  selectorContextFrom,
  type SelectorContext,
  type SelectorSpec,
} from '../authoring/selectorSpec.js';
import {
  applyCampaignAction,
  openingCareer,
  towerById,
  type CampaignAction,
  type CampaignCareer,
} from '../campaign/career.js';
import type { VizRecording } from '../contract/types.js';
import { savedBuildingFrom, stateRunningSaved } from '../dev/buildingEditor.js';
import type { BrowserResources } from '../dev/data.js';
import { nextSavedId } from '../dev/dispatcherEditor.js';
import {
  allBuildingIds,
  allDispatchers,
  buildingConfigOf,
  resolvedBuildingOf,
  shiftDemandTemplateId,
  specsWithSaved,
  withDispatcher,
  type SavedDispatcher,
  type ViewerState,
} from '../dev/state.js';
import { observationsAt } from '../live/observations.js';
import {
  applyPlainLever,
  plainLeversOf,
  type PlainLeverId,
  type PlainLeverView,
} from '../mode/plainLevers.js';
import type { CalendarPeriod } from '../shift/calendar.js';
import { contractById, statLineOf } from '../shift/contracts.js';
import { runHorizonOf, wholeDayFor, wholeDayRun, type WholeDay } from '../shift/dayLength.js';
import { goalsForDay, readGoals } from '../shift/goals.js';
import { shiftObservationsOf } from '../shift/observations.js';
import type { ShapedDayReport } from '../shift/report.js';
import type { TomorrowBriefing } from '../shift/tomorrow.js';
import type {
  DayOutcome,
  GoalObservations,
  GoalReading,
  RunHorizon,
  ScenarioContract,
  WeekState,
} from '../shift/types.js';
import { nextDay } from '../shift/week.js';

/**
 * What an Everyday screen may know and do. The exact method list is the contract the six screen
 * lanes build against; the module docstring carries what is deliberately absent.
 */
export interface EverydayHost {
  /* ---------------------------------------------------------------- reads */

  /** The whole week — day, streak, history (each entry a {@link DayOutcome}), banked progress. */
  week(): WeekState;

  /** The contract the week is on, or `undefined` on a sandbox/free-play week. */
  contract(): ScenarioContract | undefined;

  /**
   * The calendar period the week is under, or `null` — `ViewerState.calendar`.
   *
   * On the host rather than left to a screen, because *which event is today under?* has exactly one
   * composition (`shift/calendar.ts#scheduledEventFor`) and that composition needs the period.
   * Issue #135 is what happens without it: `eventFor` is the ordinary schedule, a period may
   * overrule it, and four surfaces that asked the schedule described a day the run was not
   * running. `eventSeam.test.ts` derives every caller from disk, so a screen that reached for the
   * schedule directly would be red rather than merely wrong.
   */
  calendarPeriod(): CalendarPeriod | null;

  /**
   * Today's goals, read at the current playhead — the same derivation the Engineer rail draws
   * (`readGoals` over the live fold). Before any run every reading is `pending`, because zero
   * arrivals sits under the wake-up gate; that is the gate doing its work, not a stand-in.
   */
  goalsToday(): readonly GoalReading[];

  /** The last filed day's sheet, or `undefined` while no closed day's report is standing. */
  lastReport(): ShapedDayReport | undefined;

  /** The most recently closed day's record, or `undefined` before any day has closed. */
  lastOutcome(): DayOutcome | undefined;

  /** What the standing config points at — the ids the next run will be built from. */
  selection(): { readonly buildingId: string; readonly dispatcherId: string };

  /**
   * The crowd the next run will meet, as the number two players compare — `ViewerState.seed`.
   *
   * § 6 prints it on the door and on the brief *"so two players can confirm they had the same
   * morning"*, which is the whole of why a seed is on a player-facing surface at all. It is also
   * CLAUDE.md invariant 5 read from the other end: every persisted run carries its seed, so the
   * seed is the one identifier that makes a day re-askable.
   */
  seed(): bigint;

  /**
   * The building the next run will be built from, resolved — floors expanded, cars resolved,
   * population summed.
   *
   * Beside {@link buildingById} rather than instead of it, because the two answer different
   * questions. `buildingById` is the authored document for *an id*, which is what a picker needs;
   * this is *the standing selection*, resolved, which is what a screen quoting facts needs — and
   * the facts differ: `resolveBuilding` expands `floorRanges` and treats the **floor sum** as
   * authoritative over a declared `totalPopulation`, which is the figure the kernel counts
   * arrivals against (`shift/tomorrow.ts` says so about the same number). A screen that read the
   * declared total would print a population the run does not have.
   *
   * `undefined` when the standing id names no document this build knows — {@link buildingById}'s
   * honest-lookup rule, and the same one, since a substituted answer is a false statement about
   * the thing asked after.
   */
  resolvedBuilding(): ResolvedBuilding | undefined;

  /**
   * What changed overnight, as the between-day beat holds it — `ViewerState.tomorrow`.
   *
   * `undefined` before any day has closed, and on a mode that does not advance the week. Read
   * rather than composed: `shift/tomorrow.ts` measures every figure in it and `dev/main.ts` writes
   * it at close, so a screen that rebuilt the beat would be the second computation of a judgement
   * § D237 spent an issue removing. § 6.5's report order names it — *what changed overnight … the
   * calendar already knows all of it; say it here* — and this is where the report reads it from.
   */
  tomorrowBriefing(): TomorrowBriefing | undefined;

  /** Every building id on offer — shipped plus saved. Read-only. */
  buildingIds(): readonly string[];

  /**
   * The building document for an id, or `undefined`. Honest lookup — no substitution: an id this
   * build does not know answers `undefined` rather than the first shipped building, for
   * `dev/main.ts#dispatcherNameOf`'s stated reason (a substituted answer is a false statement
   * about the thing asked after, not a missing one).
   */
  buildingById(id: string): BuildingConfig | undefined;

  /** Every dispatcher on offer — shipped plus saved. Read-only. */
  dispatchers(): readonly DispatcherProfile[];

  /** The dispatcher profile for an id, or `undefined`. Honest lookup, as {@link buildingById}. */
  dispatcherById(id: string): DispatcherProfile | undefined;

  /** The traffic profile for an id, or `undefined`. Honest lookup, as {@link buildingById}. */
  trafficProfileById(id: string): TrafficProfile | undefined;

  /**
   * `shift/contracts.ts#statLineOf`'s line for a building — `9 floors · 3 lifts · 240 people` — or
   * `undefined` for an id this build did not resolve.
   *
   * On the host rather than in the screen because the line is generated from a **resolved**
   * building (`docs/12` § 4.4: the file wins over any authored stat line), and resolving one needs
   * the elevator specs the boot closure holds. A screen given only {@link buildingById}'s document
   * would have to resolve it a second way, which is the two-copies-of-one-fact shape § 4.4 exists
   * to prevent.
   */
  buildingSpecLine(id: string): string | undefined;

  /**
   * The career GAMEPLAY § 8's three campaign screens read — the whole record, as plain data.
   *
   * One object for all three screens, which is § 16 rule 14: *"the brief, the stage, the report and
   * the calendar all read it"*. `campaign/career.ts` owns its shape and `campaign/economy.ts`
   * derives every figure from it, so no screen counts anything.
   */
  campaign(): CampaignCareer;

  /** The dispatchers the reader saved, id and profile. Read-only. */
  savedDispatchers(): readonly SavedDispatcher[];

  /**
   * The dispatcher the workshop has open, and whether it has changes that are not saved.
   *
   * Added with its consumer — the § 20.10 gauntlet gate, which *"must require a saved dispatcher"*
   * and whose button *"says why"* when it refuses. The dirty question is asked exactly where
   * `dev/dispatcherEditor.ts#runThisStateOf` asks it and collapsed the same way: a working copy
   * that differs from its source and a source that no longer exists are one answer, because a run
   * can be pointed at neither. Two answers to *what does saved mean* is the disagreement a
   * standing public rating cannot survive — `scope/runIdentity.ts` makes the same argument about
   * the leaderboard, and it points the same way here.
   */
  editedDispatcher(): {
    readonly id: string;
    readonly name: string;
    readonly dirty: boolean;
  };

  /**
   * The reference machine table the next run resolves against — `data/elevator-specs.json` widened
   * by every class the reader saved, which is exactly what `shiftRunConfigOf` hands `parseBuilding`.
   *
   * On the host rather than imported by the screen, for GAMEPLAY § 13's designer: its machine-class
   * panel offers the classes a run can actually be built from, and its specification block feeds
   * `authoring/buildingSpec.ts#upPeakAnalysisOf`, which takes these specs as its second argument.
   * A screen that read the shipped file directly would offer a class list the run does not have.
   */
  elevatorSpecs(): ElevatorSpecs;

  /**
   * The building the next run will be built from, as the authoring model's editable spec — the
   * same `specFromBuilding` reading the Engineer building editor opens with, so the two drawing
   * boards cannot disagree about what the standing tower is.
   *
   * `undefined` when the standing id names no building this build knows, on {@link buildingById}'s
   * honest-lookup rule.
   */
  buildingSpec(): BuildingSpec | undefined;

  /**
   * The demand the next run is under, as the pattern editor's spec.
   *
   * Read through the **selection**, never through the editor's working copy: `state.patternSpec` is
   * what the Engineer traffic panel has under its sliders and reaches no run until it is saved, so
   * a screen that read it would draw numbers the simulation is not using. What this answers is the
   * spec behind `state.pattern` — the saved pattern it names, the shipped profile it names, or the
   * building's own profile when the selection is `'building'`.
   */
  patternSpec(): PatternSpec;

  /**
   * The door-dwell chip the group levers hold, or `undefined` for *the dispatcher's own* —
   * `GroupLevers.dwell`'s fourth state, which is not a fourth chip and must not be defaulted.
   */
  doorDwell(): DwellChoice | undefined;

  /**
   * The four plain levers over the current working spec and group levers —
   * `mode/plainLevers.ts`'s own views, so the workshop and the Engineer editor cannot disagree
   * about what a lever holds (they are two renderings of one vector).
   */
  plainLevers(): readonly PlainLeverView[];

  /* ------------------------------------------- the workshop's document */

  /**
   * The whole of `data/dispatcher-profiles.json`, not its `profiles` array.
   *
   * The workshop needs three file-level blocks the profile list does not carry: the **cost-term
   * library** (thirteen rows with their `measures` sentences), the **play styles**
   * (`core`'s `PlayStyle` — §11.2's six cards, in `data/` for invariant 7's reason), and
   * `patternSwitching`, which the switching block's arm map is validated against. `dev/data.ts`
   * carries the whole file for the same reason and `honesty/surfaces.ts#HonestyContext` names it
   * the same way.
   */
  dispatcherProfilesFile(): DispatcherProfiles;

  /**
   * The dispatcher being edited — the Engineer editor's own working copy, the identical object.
   *
   * Not a second document. `mode/plainLevers.ts`'s standing rule is that the tinker drawer and the
   * thirteen-term drawer are two renderings of one vector; this extends it to a third surface, so
   * a weight moved in the workshop is moved in the Engineer editor and in the next run.
   */
  workingSpec(): DispatcherSpec;

  /** The group levers applied over whichever dispatcher drives — see `GroupLevers`' docstring. */
  groupLevers(): GroupLevers;

  /** The profile the working copy was read from, or `undefined` when it no longer exists. */
  editingSource(): DispatcherProfile | undefined;

  /** The authored rule rows — `authoring/ruleSpec.ts`'s shape, which is the profile's own. */
  ruleRows(): readonly RuleRow[];

  /** The traffic-pattern switching spec — `authoring/selectorSpec.ts`'s flat, total document. */
  selectorSpec(): SelectorSpec;

  /**
   * What the selector spec is validated against: the profile library, the file-level arm map and
   * the run length. Derived from the same resources the run is built from, so a refusal the
   * workshop draws is a refusal the run would make.
   */
  selectorContext(): SelectorContext;

  /**
   * Whether the crowd the next run will use has a start-of-day.
   *
   * The one fact `authoring/ruleSpec.ts#RuleContext` carries, and it is not cosmetic: `core`
   * evaluates a clockless time clause as never-matching, so without this the three time
   * conditions would be §D227's exact defect — a control that writes nothing and does not say so.
   * Derived through `dev/state.ts#shiftDemandTemplateId`, the same route `dev/ruleEditor.ts` takes.
   */
  crowdHasClock(): boolean;

  /* --------------------------------------- the workshop's own actions */

  /** Replace the working spec wholesale — the term sliders, the flags and the name field. */
  setWorkingSpec(spec: DispatcherSpec): void;

  /** Replace the group levers wholesale — the parking and express toggles, and the dwell chips. */
  setGroupLevers(levers: GroupLevers): void;

  /** Replace the rule rows. Takes effect on the next run: rules are config, never mid-run. */
  setRuleRows(rows: readonly RuleRow[]): void;

  /** Replace the switching spec. Also next-run, and for the same reason. */
  setSelectorSpec(spec: SelectorSpec): void;

  /**
   * Load a shipped or saved dispatcher into the working copy, with the two group settings a §11.2
   * play style carries — the *press a style card* action.
   *
   * It writes the working copy **and** `dispatcherId`, because §11.2 says selecting a style
   * *"resets the working copy to that style"* and a copy that was not also what drives would put a
   * second answer to *which dispatcher is running* on the screen. Unlike
   * `dev/state.ts#withDispatcher` it does not keep a dirty copy: a style card is an explicit
   * request to start again, which is precisely what that guard exists to protect against doing by
   * accident.
   *
   * An id this build does not know writes nothing — the honest lookup rule, as {@link buildingById}.
   */
  startFromDispatcher(
    dispatcherId: string,
    settings?: { readonly parking: boolean; readonly zone: boolean },
  ): void;

  /**
   * The run on the stage, as GAMEPLAY § 18's state model asks for it.
   *
   * - `hasRun` — a recording is on the stage (including boot's own demo run and a loaded file);
   * - `dayClosed` — the run on the stage has been filed as a day;
   * - `playheadS` — where the transport stands, in simulated seconds, read live at call time;
   * - `open` — **§ 3.4's latch**: a run is open in the sense that leaving it mid-way loses
   *   something of the player's. That is narrower than `hasRun && !dayClosed`, deliberately:
   *   the run must also be one *this shell simulated* (a watched or file-loaded run is somebody
   *   else's — § 3.4's own rule for `watch`: *there is nothing of yours to lose*) and one *the
   *   player asked for* (§ D232 / issue #39: boot runs a full demo shift before anybody chooses
   *   anything, and a confirm strip warning about that run would be theatre — the exact class
   *   § 3.4 exempts).
   */
  runState(): {
    readonly hasRun: boolean;
    readonly dayClosed: boolean;
    readonly playheadS: number;
    readonly open: boolean;
  };

  /**
   * The finished recording on the stage, or `undefined` before any run has landed.
   *
   * Plain data, on this façade's own rule: a `VizRecording` already crosses a structured clone on
   * its way out of `dev/shiftWorker.ts`, so handing one to a screen adds no coupling that the
   * worker seam does not already require. A screen replays it with its own `Playback`; nothing live
   * crosses.
   *
   * **Identity is the signal a screen watches.** The object is replaced wholesale on every run —
   * a new day, a retry, and an {@link intervene} re-simulation all produce a new one — so a screen
   * that keeps the last reference knows a fresh recording has arrived by `!==` and nothing else.
   * `runId` is *not* that signal: § 1.4's re-simulation is the same run's record growing.
   */
  recording(): VizRecording | undefined;

  /**
   * Where the run on the stage starts on the clock, seconds since midnight, or `undefined` when
   * its template declares no hour.
   *
   * Passed straight through to `live/timeline.ts#clockAt`, which owns the `DAY_START_S` fallback —
   * so a screen never restates 06:00 and the stage's clock, the intervention stamp and the Engineer
   * transport's ruler can never disagree about what `09:14` means.
   */
  dayStartS(): number | undefined;

  /** Today's intervention log, in press order — § 1.4's `run = (seed, config, interventions[])`. */
  interventions(): readonly RunInterventionConfig[];

  /* -------------------------------------------------------------- actions */

  /**
   * Run today with the current standing config — the same latching press as the Engineer shell's
   * **Run this shift** (`MountContext.runShift`), so the run it produces may file. Returns before
   * the run lands (the simulation is on a worker); the landing arrives as a {@link subscribe}
   * notification.
   */
  startRun(): void;

  /**
   * File the day on the stage — § 3.3's *Close the day* (*stops the clock and writes the
   * report*). All of `closeShift`'s gates hold: a run nobody started, somebody else's run, and an
   * already-filed day all file nothing.
   */
  closeDay(): void;

  /**
   * Advance to tomorrow and run it — the report sheet's *Open the doors on tomorrow*, as one
   * action. A no-op while no closed day's sheet is standing (`lastReport()` undefined): there is
   * nothing to advance *from*, and the screen's § 3.3 primary is expected to be gated on the same
   * fact.
   */
  openTomorrow(): void;

  /**
   * § 7.6's intervention: append `change` to today's record at `atS` and re-simulate from t = 0.
   *
   * **The playhead is the caller's, and that is the whole reason it is a parameter.** The Everyday
   * stage runs its own transport (see the module docstring), so the shell's playhead and the stage's
   * are two numbers; stamping at the wrong one would put a change at an instant the player was not
   * looking at. `dev/main.ts` appends at `atS` and seeks its own transport there once the run lands,
   * which is what makes the two agree afterwards rather than by luck.
   *
   * A no-op while no run is on the stage — there is no record to grow — and the screen's control is
   * expected to refuse on the same fact rather than relying on this.
   *
   * The re-simulated prefix is bit-identical by construction (`sim/interventions.test.ts`), so the
   * picture does not jump; only the future changes. The run lands as a {@link subscribe}
   * notification with a **new** {@link recording} object, which is how a screen knows to re-seek.
   */
  intervene(atS: number, change: RunInterventionConfig['change']): void;

  /**
   * Put a dispatcher in charge of the next run — § 6.2's *who drives today*.
   *
   * `dev/state.ts#withDispatcher`'s exact composition, patched in, so the Everyday brief and the
   * Engineer rail cannot disagree about what picking a dispatcher does: the pristine guard that
   * keeps an edited working spec, the `editingDispatcherId` that stops the editor describing a
   * dispatcher nobody is running, and the no-op on re-picking the standing one are all that
   * function's and none of them is restated here.
   *
   * Takes effect on the **next** run, exactly as {@link setPlainLever} does — the simulator runs a
   * whole day in milliseconds and plays the recording back, so there is no mid-day change
   * (`docs/16` § 1) and the control that changes the driver is a control that changes tomorrow's
   * question rather than today's answer.
   *
   * An id no profile carries writes nothing: `withDispatcher` leaves the spec alone, so the run is
   * built from a dispatcher that exists rather than from a name that does not.
   */
  setDispatcher(dispatcherId: string): void;

  /**
   * Write one plain lever — `mode/plainLevers.ts`'s seam, the identical route the Engineer
   * editor's `pullPlainLever` takes, so the two drawers stay two renderings of one vector. Takes
   * effect on the next run, exactly as the editor's levers do.
   */
  setPlainLever(id: PlainLeverId, value: number | boolean): void;

  /**
   * Move the career — `campaign/career.ts#applyCampaignAction`, and the only writer of it.
   *
   * One channel rather than a method per verb, because an action is plain data and eleven methods
   * would be eleven more names on a façade whose docstring argues for the smallest surface that has
   * callers. The reducer refuses an action the record cannot legally take, and every control the
   * screens draw is gated on the same predicate — so this arm is the second lock, never the first.
   */
  campaignAct(action: CampaignAction): void;

  /**
   * Run a campaign day on one tower — § 8.5's *"Lock it in and run day N"*, as one press.
   *
   * **This is what makes the standing order reach the simulation.** It writes the tower's building
   * and its dispatcher into the run selection and then latches the same run press
   * {@link startRun} does, so moving the select on the triage screen changes the legs of the next
   * run rather than only a label — the standing requirement this repository has paid to learn,
   * applied to a control before the panel around it was written.
   *
   * A no-op for a tower the career does not hold, and for one whose building this build did not
   * resolve: running the shipped default under another building's name would be a substituted
   * answer, which `buildingById`'s docstring already refuses one layer down.
   */
  runCampaignDay(towerId: string): void;

  /**
   * Save a drawn building **and stand the next run on it**, answering the id it took.
   *
   * The exact two presses the Engineer building editor's *Save* and *Run it* make, in one call:
   * `savedBuildingFrom` allocates a fresh id and runs the document through the real loader (so a
   * spec the parser refuses throws here rather than at run time), and `stateRunningSaved` selects
   * it through `withBuilding` — which is the load-bearing half. A bare `buildingId` write would
   * leave the week's `contractId` in place and bank a drawn tower against a real assignment; the
   * sandbox contract is what says a drawn building belongs to no scenario.
   *
   * It does **not** run. GAMEPLAY § 13's *Run a day in it* and § 3.3's tuner primary are
   * *apply, then run*, and the two are separate because the designer's *Save as a new building*
   * is the same apply with no run after it. Composition beats a second method that differs by a
   * boolean.
   */
  applyBuildingSpec(spec: BuildingSpec): string;

  /**
   * Save a demand pattern and point the next run at it, answering the id it took.
   *
   * `savedPatterns` **and** `pattern`, in one patch, for `dev/trafficEditor.ts`'s stated reason:
   * *"a pattern the run cannot be pointed at is the dead seam this repository keeps finding"*.
   * `patternSpec` is written alongside so the Engineer traffic panel opens on what is running
   * rather than on whatever it was last left at.
   */
  applyPatternSpec(spec: PatternSpec): string;

  /**
   * Write the door-dwell chip — `GroupLevers.dwell`, the seam that reaches the run as every car's
   * `dwellCarCallS`/`dwellHallCallS` through `shiftRunConfigOf`'s `withDoorTiming`.
   *
   * `undefined` restores *the dispatcher's own*, which is a real fourth value rather than a
   * missing one: writing a chip nobody pressed silently replaces an authored `dwellPolicy`.
   */
  setDoorDwell(choice: DwellChoice | undefined): void;

  /**
   * Hear about state changes, so a screen re-renders. Returns the unsubscribe. See the module
   * docstring for the cadence (state changes, never per frame).
   */
  subscribe(listener: () => void): () => void;
}

/**
 * What `dev/main.ts`'s boot closure supplies — raw facts and raw presses, so every derivation
 * above them lives in {@link createEverydayHost} where it is testable without a document.
 */
export interface EverydayHostBindings {
  /** The loaded resources. Stable for the life of the page. */
  readonly resources: BrowserResources;
  /** The live state. Read fresh on every host call — never captured. */
  state(): ViewerState;
  /** The transport's playhead in simulated seconds, or the recording's start, or `0`. */
  playheadS(): number;
  /** Whether the run on the stage has been filed (`filedRunId === recording.runId`). */
  dayClosed(): boolean;
  /** Whether the run on the stage is the one this shell simulated (object identity). */
  runIsOwn(): boolean;
  /** § D232's flag: the player asked for play on purpose. */
  playerHasChosen(): boolean;
  /**
   * Where the run on the stage starts on the clock — the runner's `startOfDayS`, not a constant.
   * `undefined` is the honest answer for a template that declares no hour.
   */
  dayStartS(): number | undefined;
  /** The latching run press — `MountContext.runShift`. */
  startRun(): void;
  /**
   * § 1.4's *record growing*: append at `atS`, re-run with cause `'intervention'`, and seek the
   * shell's own transport to `atS` once the new recording is adopted. One implementation, shared
   * with the Engineer stage's own button — two would be two different runs from one press.
   */
  intervene(atS: number, change: RunInterventionConfig['change']): void;
  /** `closeShift`, with all its gates. */
  closeDay(): void;
  /** Put the Engineer surface on its run tab — `MountContext.openTab('run')`. */
  openRunTab(): void;
  /** Merge a patch into the state and re-render — `MountContext.update`. */
  applyPatch(patch: Partial<ViewerState>): void;
  /** Register a listener on `renderAll`'s notification list. Returns the unsubscribe. */
  onChange(listener: () => void): () => void;
}

/**
 * The goal inputs at the playhead when there is no recording — the same zero fold
 * `dev/leftRail.ts#goalObservationsOf` answers, kept byte-identical on purpose: `arrived: 0` is
 * below the wake-up gate, so every reading comes back `pending` and nothing here is a stand-in
 * observation.
 */
const NO_RUN_OBSERVATIONS: GoalObservations = Object.freeze({
  arrived: 0,
  carryPct: 100,
  minutePct: 100,
  peakQueue: 0,
  abandoned: 0,
  worstWaitS: 0,
  worstWaitIsCensored: false,
});

/**
 * The patch that opens tomorrow — the same composition as `dev/reportPanel.ts`'s
 * *Open the doors on tomorrow* press, which owns the argument for each field: the recording, the
 * sheet and the between-day beat are cleared in the same patch that advances the day (a sheet left
 * standing would caption a day that has not happened), and yesterday's intervention log does not
 * replay onto a different day. That press is pinned by `reportPanel.test.ts`'s exactly-once text
 * guards, which is why this is a sibling composition here rather than an import there.
 */
function openTomorrowPatch(week: WeekState): Partial<ViewerState> {
  return {
    week: nextDay(week),
    recording: undefined,
    report: undefined,
    tomorrow: undefined,
    withheld: [],
    interventions: [],
  };
}

/* -------------------------------------------------------------------------- *
 * The day is a whole day — `ISSUE_VERIFICATION_FINDINGS.md` § AB
 * -------------------------------------------------------------------------- */

/**
 * The whole authored day the standing selection may run, or `undefined`.
 *
 * One expression, read by the two things that must not disagree: {@link dayPatchFor}, which sets
 * the run up, and {@link horizonOf}, which decides what today's goals ask of it. A second copy of
 * this lookup is how a ten-hour run comes to be graded against a thirty-minute ceiling.
 */
function dayFor(b: EverydayHostBindings): WholeDay | undefined {
  const state = b.state();
  return wholeDayFor(
    b.resources.trafficProfiles,
    buildingConfigOf(b.resources, state.savedBuildings, state.buildingId),
  );
}

/**
 * The patch that makes today a whole day — `ISSUE_VERIFICATION_FINDINGS.md` § AB, and the seam that
 * turns a shipped-but-unreachable record into the run a player actually watches.
 *
 * ## Why this is here rather than on the contract or in `initialState`
 *
 * The product owner's ruling on § AB is **Everyday day only, stages unchanged**, and this is what
 * *only* looks like in code: the Everyday product's own run press sets the Everyday product's own
 * day. `dev/state.ts#initialState`, `dev/scenariosPanel.ts`'s *take* and `DEFAULT_SHIFT_LENGTH_S`
 * are all untouched, so the Engineer shell opens on exactly the thirty minutes every number in
 * `docs/05-roadmap.md` was measured over, and no published figure moves.
 *
 * ## Why it is not the length control § D286 deleted
 *
 * Nothing here is offered to anybody. § D286 removed `SHIFT_LENGTHS`' four narrative options and
 * Free Play's five numeric ones because *a length names the demand schedule and says nothing about
 * the drain*, and because a longer length **rescaled** the day rather than showing more of it
 * (issues #80, #81, #82). This writes no length a player picked: it writes the period the record
 * declares, and it writes it as a window precisely so the schedule is **not** rescaled —
 * `shift/dayLength.ts#wholeDayRun` carries the argument, and `core` refuses the rescaling override
 * on a day by name. A part's length is the period it names, which is § D286's own sentence.
 *
 * Returns `{}` for a building with no authored day, which is three of the eight shipped ones. An
 * empty patch is the honest answer there — their day is the slice it always was, and inventing a
 * day for a residential, hotel or hospital crowd out of an office one is the modelling claim
 * `dayLength.ts` refuses.
 */
function dayPatchFor(b: EverydayHostBindings): Partial<ViewerState> {
  const day = dayFor(b);
  return day === undefined ? {} : wholeDayRun(day);
}

/**
 * Which kind of run today's goals are being asked of — `shift/goals.ts#goalsForDay`'s second
 * argument.
 *
 * Read off the **state**, not off {@link dayPatchFor}'s intent: until the patch has landed the day
 * is still a slice, and a rail that graded an unrun slice against a day's ceiling would be the
 * report describing a run that has not happened. `runsWholeDay` is the same predicate
 * `shiftDemandTemplateId` asks, so the template the run resolves against and the bar it is judged
 * by cannot disagree.
 *
 * **The predicate is `shift/dayLength.ts#runHorizonOf`'s and no longer this file's**, which is the
 * correction to {@link dayFor}'s warning rather than a tidy-up of it. That warning said a second
 * copy of the lookup is how a ten-hour run comes to be graded against a thirty-minute ceiling, and
 * it was right about the mechanism and wrong about where to look: the Engineer shell had no copy at
 * all, so its rail graded this product's whole day against 230 s while this one graded it against
 * 460. One expression in a directory both shells import is the only shape that can hold, because
 * `dev/` may not import this one — see `runHorizonOf`'s docstring for the whole argument.
 */
function horizonOf(b: EverydayHostBindings): RunHorizon {
  const state = b.state();
  return runHorizonOf(
    b.resources.trafficProfiles,
    buildingConfigOf(b.resources, state.savedBuildings, state.buildingId),
    state,
  );
}

/**
 * Build the host over the closure's bindings. Pure over its input: every derivation reads
 * `bindings.state()` fresh, so the host never holds a stale copy of anything.
 */
export function createEverydayHost(bindings: EverydayHostBindings): EverydayHost {
  const b = bindings;

  /*
   * The career, held here and nowhere else.
   *
   * It is **not** on `ViewerState`, and that is a decision rather than a shortcut: the campaign's
   * twenty-day contracts, purses and wear clocks are a second progression beside `state.week`, and
   * putting them on the persisted state would mean a schema, a migration and a reconciliation
   * between two records that both claim to know what day it is. `campaign/career.ts`'s docstring
   * carries the argument and names the cost — the **campaign's** career is not written to this
   * device, which `CAMPAIGN_ABSENCES`'s third entry says on the screens it applies to. It used to
   * say *the rail already says it*; #214 pointed the rail's line at the persisted week instead, so
   * that sentence stopped being true. The week and the campaign career are different records with
   * different lifetimes, and conflating them here is what made the old wording plausible.
   *
   * Held in this closure rather than in a screen, because the three campaign screens mount and
   * unmount as the player moves between them and a record that lived in one of them would be lost
   * on every navigation. Seeded from the standing dispatcher so a fresh career's one building
   * starts on whatever is driving today rather than on an id this module chose.
   */
  let career: CampaignCareer = openingCareer(b.state().dispatcherId);
  const campaignListeners = new Set<() => void>();
  const notifyCampaign = (): void => {
    for (const listener of [...campaignListeners]) listener();
  };

  return {
    week: () => b.state().week,
    contract: () => contractById(b.state().week.contractId),
    calendarPeriod: () => b.state().calendar,
    goalsToday: () => {
      const state = b.state();
      const observations =
        state.recording === undefined
          ? NO_RUN_OBSERVATIONS
          : shiftObservationsOf(observationsAt(state.recording, b.playheadS()));
      return readGoals(goalsForDay(state.week.day, horizonOf(b)), observations);
    },
    lastReport: () => b.state().report,
    lastOutcome: () => b.state().week.history.at(-1),
    selection: () => {
      const state = b.state();
      return { buildingId: state.buildingId, dispatcherId: state.dispatcherId };
    },
    seed: () => b.state().seed,
    resolvedBuilding: () => resolvedBuildingOf(b.resources, b.state()),
    tomorrowBriefing: () => b.state().tomorrow,
    buildingIds: () => allBuildingIds(b.resources, b.state().savedBuildings),
    buildingById: (id) => buildingConfigOf(b.resources, b.state().savedBuildings, id),
    dispatchers: () => allDispatchers(b.resources, b.state().savedDispatchers),
    dispatcherById: (id) =>
      allDispatchers(b.resources, b.state().savedDispatchers).find((profile) => profile.id === id),
    trafficProfileById: (id) =>
      b.resources.trafficProfiles.profiles.find((profile) => profile.id === id),
    buildingSpecLine: (id) => {
      const resolved = b.resources.buildings.find((building) => building.id === id);
      return resolved === undefined ? undefined : statLineOf(resolved);
    },
    campaign: () => career,
    savedDispatchers: () => b.state().savedDispatchers,
    recording: () => b.state().recording,
    dayStartS: () => b.dayStartS(),
    interventions: () => b.state().interventions,
    editedDispatcher: () => {
      const state = b.state();
      const source = allDispatchers(b.resources, state.savedDispatchers).find(
        (profile) => profile.id === state.editingDispatcherId,
      );
      return {
        id: state.editingDispatcherId,
        name: state.dispatcherSpec.name,
        dirty: specIsDirty(state.dispatcherSpec, source),
      };
    },
    elevatorSpecs: () => specsWithSaved(b.resources, b.state().savedClasses),
    buildingSpec: () => {
      const state = b.state();
      const config = buildingConfigOf(b.resources, state.savedBuildings, state.buildingId);
      return config === undefined ? undefined : specFromBuilding(config, state.buildingId);
    },
    patternSpec: () => {
      const state = b.state();
      if (state.pattern !== 'building') {
        const saved = state.savedPatterns.find((entry) => entry.id === state.pattern);
        if (saved !== undefined) return saved.spec;
        return specFromTrafficProfile(b.resources.trafficProfiles, state.pattern);
      }
      const config = buildingConfigOf(b.resources, state.savedBuildings, state.buildingId);
      return specFromTrafficProfile(b.resources.trafficProfiles, config?.trafficProfile);
    },
    doorDwell: () => b.state().levers.dwell,
    plainLevers: () => {
      const state = b.state();
      return plainLeversOf(state.dispatcherSpec, state.levers);
    },
    dispatcherProfilesFile: () => b.resources.dispatcherProfiles,
    workingSpec: () => b.state().dispatcherSpec,
    groupLevers: () => b.state().levers,
    editingSource: () => {
      const state = b.state();
      return allDispatchers(b.resources, state.savedDispatchers).find(
        (profile) => profile.id === state.editingDispatcherId,
      );
    },
    ruleRows: () => b.state().ruleRows,
    selectorSpec: () => b.state().selectorSpec,
    selectorContext: () =>
      selectorContextFrom(b.resources.dispatcherProfiles, b.state().shiftLengthS),
    crowdHasClock: () => {
      const state = b.state();
      const building = buildingConfigOf(b.resources, state.savedBuildings, state.buildingId);
      return templateHasClock(
        b.resources.trafficProfiles,
        shiftDemandTemplateId(b.resources, state, building),
      );
    },
    setWorkingSpec: (spec) => {
      b.applyPatch({ dispatcherSpec: spec });
    },
    setGroupLevers: (levers) => {
      b.applyPatch({ levers });
    },
    setRuleRows: (rows) => {
      b.applyPatch({ ruleRows: rows });
    },
    setSelectorSpec: (spec) => {
      b.applyPatch({ selectorSpec: spec });
    },
    startFromDispatcher: (dispatcherId, settings) => {
      const state = b.state();
      const wanted = allDispatchers(b.resources, state.savedDispatchers).find(
        (profile) => profile.id === dispatcherId,
      );
      // Honest lookup — see the interface docstring. An unknown id writes nothing rather than
      // loading the first shipped profile under the name the player pressed.
      if (wanted === undefined) return;
      const spec = specFromProfile(wanted, wanted.name);
      b.applyPatch({
        dispatcherId,
        editingDispatcherId: dispatcherId,
        dispatcherSpec:
          settings === undefined
            ? spec
            : { ...spec, flags: { ...spec.flags, zone: settings.zone } },
        ...(settings === undefined ? {} : { levers: { ...state.levers, parking: settings.parking } }),
      });
    },
    runState: () => {
      const hasRun = b.state().recording !== undefined;
      const dayClosed = hasRun && b.dayClosed();
      return {
        hasRun,
        dayClosed,
        playheadS: b.playheadS(),
        open: hasRun && b.runIsOwn() && !dayClosed && b.playerHasChosen(),
      };
    },
    startRun: () => {
      /*
       * The day is set up on the press rather than on a mount — § AB, and {@link dayPatchFor} for
       * why the Everyday product's own press is the right owner. On the press, because it is the
       * one moment a player has asked for *today* rather than for a screen, and because a mount
       * that patched state would repaint every other surface reading it.
       *
       * Before `startRun`, and the order is load-bearing: `dev/main.ts#runShift` reads the state
       * synchronously to build the config, so a patch landing after the press would run yesterday's
       * length under today's caption.
       *
       * **Nothing at all** for a crowd with no authored day, rather than an empty patch: `applyPatch`
       * is `MountContext.update`, which re-renders, and a press that repainted every surface to
       * write no field would be doing work a player could see for a change nobody made.
       */
      const day = dayFor(b);
      if (day !== undefined) b.applyPatch(wholeDayRun(day));
      b.startRun();
    },
    closeDay: () => {
      b.closeDay();
    },
    intervene: (atS, change) => {
      // Gated here as well as on the control, because the record cannot grow before it exists and
      // a façade that appended to nothing would produce a run of a day nobody watched.
      if (b.state().recording === undefined) return;
      b.intervene(atS, change);
    },
    openTomorrow: () => {
      const state = b.state();
      // Nothing to advance from — see the interface docstring. The screen gates its primary on
      // the same fact, so this early return is the API refusing what the control never offers.
      if (state.report === undefined) return;
      // Tomorrow is a day of the same kind today was — the whole-day patch rides in the same merge
      // rather than in a second one, so no render sees a week advanced onto a horizon it is not
      // running yet.
      b.applyPatch({ ...openTomorrowPatch(state.week), ...dayPatchFor(b) });
      b.openRunTab();
      b.startRun();
    },
    setDispatcher: (dispatcherId) => {
      const state = b.state();
      const next = withDispatcher(state, b.resources, dispatcherId);
      /*
       * The three fields `withDispatcher` writes, patched rather than the whole state replaced —
       * `applyPatch` is `MountContext.update`, which merges, and handing it a full `ViewerState`
       * would make this host the writer of every field a concurrent press had just changed.
       */
      b.applyPatch({
        dispatcherId: next.dispatcherId,
        dispatcherSpec: next.dispatcherSpec,
        editingDispatcherId: next.editingDispatcherId,
      });
    },
    setPlainLever: (id, value) => {
      const state = b.state();
      const applied = applyPlainLever(state.dispatcherSpec, state.levers, id, value);
      b.applyPatch({ dispatcherSpec: applied.spec, levers: applied.levers });
    },
    campaignAct: (action) => {
      const next = applyCampaignAction(career, action);
      /* A refused action moves nothing and notifies nobody: a redraw over an unchanged record
         would repaint a screen mid-interaction for no reason a player could see. */
      if (next === career) return;
      career = next;
      notifyCampaign();
    },
    runCampaignDay: (towerId) => {
      const tower = towerById(career, towerId);
      if (tower === undefined) return;
      if (!b.resources.buildings.some((building) => building.id === tower.buildingId)) return;
      b.applyPatch({ buildingId: tower.buildingId, dispatcherId: tower.dispatcherId });
      b.openRunTab();
      b.startRun();
    },
    applyBuildingSpec: (spec) => {
      const state = b.state();
      const saved = savedBuildingFrom(spec, state, b.resources);
      const next = stateRunningSaved(state, b.resources, saved);
      /*
       * The whole derived state as the patch, rather than a hand-picked field list.
       * `stateRunningSaved` goes through `withBuilding`, which touches the week, the parked weeks
       * and both editor working copies under their own pristine guards — a list here would be a
       * second opinion about which of those matter, and would go stale the next time that function
       * learns to carry one more thing. It is a patch over the same `state` this call read, so
       * nothing else can have moved underneath it.
       */
      b.applyPatch({ ...next });
      return saved.id;
    },
    applyPatternSpec: (spec) => {
      const state = b.state();
      const id = nextSavedId('pat', [
        ...state.savedPatterns.map((entry) => entry.id),
        ...b.resources.trafficProfiles.profiles.map((profile) => profile.id),
      ]);
      const named: PatternSpec = {
        ...spec,
        name: spec.name.trim() === '' ? 'My pattern' : spec.name.trim(),
      };
      b.applyPatch({
        savedPatterns: [...state.savedPatterns, { id, spec: named }],
        pattern: id,
        patternSpec: named,
      });
      return id;
    },
    setDoorDwell: (choice) => {
      b.applyPatch({ levers: { ...b.state().levers, dwell: choice } });
    },
    /*
     * The campaign arm of this is the merge's, not either branch's: the career lives beside
     * `b.state()` rather than in it, so a listener has to be on both or a campaign screen never
     * redraws. The lane that added the three writers above carried the plain `b.onChange` form,
     * which was correct on its own branch and would have unsubscribed every campaign screen here.
     */
    subscribe: (listener) => {
      const stopState = b.onChange(listener);
      campaignListeners.add(listener);
      return () => {
        campaignListeners.delete(listener);
        stopState();
      };
    },
  };
}

/**
 * The sentence the shell draws when a registered screen is entered before `dev/main.ts` has
 * published the host — a state only reachable in the first instants of a cold load, and drawn
 * rather than blanked because a blank region is a control that silently did nothing.
 */
export const HOST_PENDING_REASON =
  'the simulation host has not finished booting — this screen draws the moment it does';

/**
 * Where the host is handed across — `dev/main.ts` publishes, `everyday/boot.ts` passes the slot
 * into the shell's mount options, and the shell asks it for the current host and subscribes for
 * the one that arrives.
 *
 * A slot rather than a direct export of the host, because the two shells boot in the wrong order
 * for anything simpler: `everyday/boot.ts` mounts the shell synchronously while `dev/main.ts`'s
 * async `main()` is still fetching `data/`, so at mount time there is no host yet. And a slot
 * **value** with a `whenReady` rather than a bare mutable `let`, because the arrival is the event
 * the shell needs (to sync § 3.4's run-open latch and to redraw a screen that mounted early), and
 * polling a `let` would need the timer `boundaries.test.ts` forbids.
 */
export interface EverydayHostSlot {
  /** The published host, or `undefined` while `dev/main.ts` is still booting. */
  current(): EverydayHost | undefined;
  /**
   * Publish. Called by `dev/main.ts`'s boot once its closure exists; called again only if the
   * loader retries a failed boot, in which case the fresh host replaces the dead one and every
   * `whenReady` listener hears about it again.
   */
  publish(host: EverydayHost): void;
  /**
   * Hear about the host — immediately when one is already published, and on every publish after.
   * Returns the unsubscribe.
   */
  whenReady(listener: (host: EverydayHost) => void): () => void;
}

/** The one shared slot. Module-level state, written at runtime by boot — never at import time. */
export const EVERYDAY_HOST: EverydayHostSlot = (() => {
  let published: EverydayHost | undefined;
  const listeners = new Set<(host: EverydayHost) => void>();
  return {
    current: () => published,
    publish: (host: EverydayHost) => {
      published = host;
      for (const listener of [...listeners]) listener(host);
    },
    whenReady: (listener: (host: EverydayHost) => void) => {
      listeners.add(listener);
      if (published !== undefined) listener(published);
      return () => {
        listeners.delete(listener);
      };
    },
  };
})();
