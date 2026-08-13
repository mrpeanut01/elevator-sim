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
 * - **no building setter** — the door screen's *pick where you are* writes through
 *   `dev/state.ts#withBuilding`, and the lane that builds that screen adds the action beside its
 *   control. There **is** a dispatcher setter now ({@link EverydayHost.startFromDispatcher}), added
 *   with the workshop screen that presses it; the sentence is corrected rather than left standing,
 *   because a stated absence that has stopped being true is § D227's defect with the polarity
 *   reversed — a refusal telling a reader not to look for something that is there;
 * - **no campaign works booking, no contract acceptance** — the campaign lane's, with its screens;
 * - **no transport control** (pause, speed, seek) and no `playing` flag — the § 7 Everyday stage's,
 *   when it exists; the handed-off Engineer stage owns its own transport today;
 * - **no watch entry** — § 14's spectator flow has no Everyday surface yet;
 * - **no saved-pattern or saved-building shelves** — no listed screen reads them.
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
  TrafficProfile,
} from '@elevator-sim/core/browser';

import {
  specFromProfile,
  type DispatcherSpec,
  type GroupLevers,
} from '../authoring/dispatcherSpec.js';
import { templateHasClock, type RuleRow } from '../authoring/ruleSpec.js';
import {
  selectorContextFrom,
  type SelectorContext,
  type SelectorSpec,
} from '../authoring/selectorSpec.js';
import type { BrowserResources } from '../dev/data.js';
import {
  allBuildingIds,
  allDispatchers,
  buildingConfigOf,
  shiftDemandTemplateId,
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
import { contractById } from '../shift/contracts.js';
import { goalsForDay, readGoals } from '../shift/goals.js';
import { shiftObservationsOf } from '../shift/observations.js';
import type { ShapedDayReport } from '../shift/report.js';
import type {
  DayOutcome,
  GoalObservations,
  GoalReading,
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

  /** The dispatchers the reader saved, id and profile. Read-only. */
  savedDispatchers(): readonly SavedDispatcher[];

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
   * Write one plain lever — `mode/plainLevers.ts`'s seam, the identical route the Engineer
   * editor's `pullPlainLever` takes, so the two drawers stay two renderings of one vector. Takes
   * effect on the next run, exactly as the editor's levers do.
   */
  setPlainLever(id: PlainLeverId, value: number | boolean): void;

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
  /** The latching run press — `MountContext.runShift`. */
  startRun(): void;
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

/**
 * Build the host over the closure's bindings. Pure over its input: every derivation reads
 * `bindings.state()` fresh, so the host never holds a stale copy of anything.
 */
export function createEverydayHost(bindings: EverydayHostBindings): EverydayHost {
  const b = bindings;
  return {
    week: () => b.state().week,
    contract: () => contractById(b.state().week.contractId),
    goalsToday: () => {
      const state = b.state();
      const observations =
        state.recording === undefined
          ? NO_RUN_OBSERVATIONS
          : shiftObservationsOf(observationsAt(state.recording, b.playheadS()));
      return readGoals(goalsForDay(state.week.day), observations);
    },
    lastReport: () => b.state().report,
    lastOutcome: () => b.state().week.history.at(-1),
    selection: () => {
      const state = b.state();
      return { buildingId: state.buildingId, dispatcherId: state.dispatcherId };
    },
    buildingIds: () => allBuildingIds(b.resources, b.state().savedBuildings),
    buildingById: (id) => buildingConfigOf(b.resources, b.state().savedBuildings, id),
    dispatchers: () => allDispatchers(b.resources, b.state().savedDispatchers),
    dispatcherById: (id) =>
      allDispatchers(b.resources, b.state().savedDispatchers).find((profile) => profile.id === id),
    trafficProfileById: (id) =>
      b.resources.trafficProfiles.profiles.find((profile) => profile.id === id),
    savedDispatchers: () => b.state().savedDispatchers,
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
      b.startRun();
    },
    closeDay: () => {
      b.closeDay();
    },
    openTomorrow: () => {
      const state = b.state();
      // Nothing to advance from — see the interface docstring. The screen gates its primary on
      // the same fact, so this early return is the API refusing what the control never offers.
      if (state.report === undefined) return;
      b.applyPatch(openTomorrowPatch(state.week));
      b.openRunTab();
      b.startRun();
    },
    setPlainLever: (id, value) => {
      const state = b.state();
      const applied = applyPlainLever(state.dispatcherSpec, state.levers, id, value);
      b.applyPatch({ dispatcherSpec: applied.spec, levers: applied.levers });
    },
    subscribe: (listener) => b.onChange(listener),
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
