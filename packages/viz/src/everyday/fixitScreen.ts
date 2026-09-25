/**
 * **The Fix-a-building screen** — GAMEPLAY § 10, mounted in the Everyday shell's scroll region.
 * The fourth mode tile's real destination: a screen, not `dev/fixitPanel.ts`'s dark overlay, so
 * there is no `Escape`-to-close and no way out except the § 3.3 bar's `⤺ Leave this building`.
 *
 * ## What this file decides: nothing
 *
 * `dev/fixitPanel.ts`'s rule, kept whole: every decision — spend, affordability, the four
 * outcomes, the measured rows, the four figures — is `fixit/engine.ts`'s and `fixit/run.ts`'s,
 * and every worded substitution — the § 3.3 cells, the rail's `{fixed}/{total}`, the price lines
 * — is `fixitScreenModel.ts`'s, where the honesty sweep drives it. This file draws their answers
 * in § 19's tokens and forwards presses. Its own literals are the load-failure line, the
 * run-failed line and the measuring line the figures grid stands in with while a run is in flight
 * — all three mount status text on the same footing as every excluded mount's, and all three
 * about a state of the *mount* rather than about a `FixitCase` or a `FixitState`, which is the
 * whole of what the driven model is over.
 *
 * ## Two surfaces over one machinery, and where they are allowed to differ
 *
 * `dev/fixitPanel.ts` draws the same engine inside the Engineer shell. The two agree on
 * everything the machinery decides — the same `classifyOutcome`, the same judge
 * (`fixit/judge.ts#pressThroughTheJudge`, [§ D1020](../../../../DECISIONS.md)), the same
 * `fixedBadgeAfter` rule (the badge follows the latest run; see the press handler) — and on the
 * accessibility contract `docs/20` defect 16 set: a toggle says its state in `aria-pressed`
 * **and** in a visible mark, because a background colour alone was neither.
 *
 * They differ on palette, and that is correct rather than a drift: the Engineer panel reads the
 * Engineer theme's CSS variables (`var(--card)`, `var(--ok)` — so it follows a theme the player
 * flipped), and this screen reads GAMEPLAY § 19's paper-and-ink tokens, because it is drawn
 * inside the Everyday shell and the handoff is canonical for what that screen looks like. Each
 * reads its own product's tokens; neither hardcodes a palette of its own.
 *
 * ## The § 10.3 subset drawn, and why it is still a subset — narrowed by GitHub issue #422
 *
 * § 10.1 item 6 asks for the full building editor — elevation grid, zones, shafts, parking,
 * who-drives. **Zones and parking are drawn**, because the engine prices them:
 * `FixitState.zoneOverlapFloors` writes `building.banks[]` at the schedule's `rezone-bank`, and
 * `FixitState.parkingStrategy` writes `dispatcher.idle.parkingStrategy` at `idle-parking`. Both are
 * proved on the legs in `fixit/cases.test.ts` — every rung of the stepper and every strategy the
 * select offers — which is the only thing that makes drawing them different from miming them.
 *
 * **A third is drawn now too, narrower than what it closes is named after.** `FixitState.topFloorRaiseM`
 * raises the building's topmost floor and writes `building.floors[]` at the schedule's new
 * `raise-a-floor` (`fixit/types.ts#BuildingPatch.floors`, GitHub issue #422) — the field `FixitPatch`
 * had none of before, so a repair or the editor can now move a floor at all. It is **not** § 10.1
 * item 6's elevation grid — a per-shaft, per-floor-band click-to-set control — which stays exactly
 * as refused as it was; see the next bullet. What is drawn is the one floor move that can never
 * break `heightM`'s strict-increasing-with-`index` rule, whatever else the building holds:
 * `fixit/run.ts#topFloorRaiseCeilingOf` reports `0` and the row is not drawn where the topmost floor
 * is served by no bank or is one half of a double-deck pair, exactly the shape of refusal zoning's
 * ceiling already uses.
 *
 * **What is still refused, and why each one is refused for its own reason.** A control that writes
 * no field of the state it claims to edit is this repository's signature defect (§ D219 — *move the
 * control and require the run to change*), and these three would each be one:
 *
 * - **The elevation grid.** One row per floor band, one column per shaft, click any cell to change
 *   what it does there (§ 10.3's own words) — a stopping-pattern control distinct from the one metre
 *   this build now moves. No field of `FixitPatch` expresses *which shaft stops at which band*:
 *   `BuildingPatch` carries populations, banks (a whole zone boundary, not one cell), cars, bank
 *   equipment, added cars and now one floor's elevation, and nothing that names a cell of that grid.
 *   A grid drawn over that would edit a document the run never reads.
 * - **Shafts.** A new shaft is `building.addCars[]` and *is* priced (`new-car`, 34 u) — but it is
 *   already sold as each case's fourth repair, at a price no shipped budget can take. A second
 *   control for the same purchase would be one act at two places, which is what #366 abolished.
 * - **Who-drives — per-shaft duty, the goods car and the bed car.** `core` carries the concept now
 *   — `CarConfig.duty`, a rider's duty and the `dutyMismatch` term (GitHub issue #481, § D549) —
 *   but nothing on this screen writes a duty, so the refusal stands as a refusal of the *control*,
 *   the one step of `data/buildings/README.md` § *Duty* not yet built. `CarConfig.mode` is still not
 *   the same concept, and `everyday/designerModel.ts` names the same absence from the other side,
 *   so it is one control two screens want rather than a gap in this one.
 *
 *   **This row used to end *"the one out of service"*, and that was over-scoped.** A car out of
 *   service is `CarConfig.mode: 'out-of-service'` — authorable today, and a `ServiceEventConfig`
 *   can put it back mid-run. Claiming it here made the refusal wider than the gap, which is § D227
 *   pointed the other way: a refusal may not claim more is missing than is.
 *
 * **And zoning and elevation are each drawn only where they can bind, on two different splits.**
 * Eight of the eighteen shipped cases run a single-bank building, where every floor a bank could
 * grow into it already serves; `fixit/run.ts#zoneOverlapCeilingOf` reports 0 there and the zoning
 * row is not drawn at all. **Elevation's refusal is a different four, found by running it rather
 * than by reasoning about it**: `topFloorRaiseCeilingOf` reports 0 on `vertical-city` and
 * `mixed-use-high-rise` — two of the eighteen cases' six buildings — because both declare their
 * topmost floor as a compact `floorRanges` entry rather than an explicit one, which is the one shape
 * `fixit/run.ts#applyBuildingPatch` cannot look a floor up by id in (`topFloorIdOf`'s docstring says
 * why). A refusal that survives what it refuses is the defect class this file states against itself
 * below, so both rows say their own ceiling rather than assuming one.
 *
 * ## The runs are on a worker — GitHub issue #165
 *
 * A press's pair and the as-built run a case opens by taking both go through
 * `dev/offThreadRuns.ts` to `dev/shiftWorker.ts`. This screen used to state a cost here instead —
 * `dev/fixitPanel.ts`'s, carried over verbatim — and the sentence is deleted rather than reworded,
 * because a stated cost that has been paid is § D227's stale refusal.
 *
 * It was also the **most exposed** of the three surfaces the issue named: this is the default
 * shell's screen, and its open run had no busy state at all. Measured before the move
 * (`dev/measure.surfaceRuns.test.ts`), opening a case blocked the painting thread for 11–474 ms
 * across the eighteen shipped cases and a press for 24–846 ms — the open half with nothing on
 * screen to say why.
 *
 * The § 3.3 primary still relabels to `Running the day…` and goes inert, which is
 * `fixitScreenModel.ts#fixitBarModel`'s decision and unchanged. The figures grid says it is
 * measuring while the as-built run is in flight. What went with the block is `afterPaint` — a
 * `requestAnimationFrame` wrapping a `setTimeout`, whose entire subject was getting the relabel
 * painted **before** a task that would seize the thread for a second. There is no such task now.
 *
 * ## FIXED survives the tab now, and the rest of the session does not
 *
 * This section used to name an absence: *no solved-cases seam exists in `persist/`… the solved set
 * ends with the tab*. GitHub issue #224 closed it, and the slot that grew the key is the one that
 * sentence pointed at — **not** `persist/`'s envelope but the Everyday one,
 * `everyday/profile.ts` ([§ D433](../../../../DECISIONS.md)), which is where an Everyday screen's
 * earnings belong.
 *
 * So the split inside this module is now three ways rather than two:
 *
 * - **The solved set is durable.** {@link solvedIds} is still read off `sessions`, and `sessions`
 *   is seeded once per tab from the store by {@link ensureRestored}. Every press that changes a
 *   case's badge writes the whole set back.
 * - **The per-case selections and the cached as-built runs are still session-local**, and
 *   deliberately: a `FixitState` is a working draft a player is in the middle of, and a
 *   `RecordedRun` is megabytes of legs. Neither is progress; both end with the tab, as before.
 * - **The badge still follows the latest run in both directions** (`fixit/engine.ts#fixedBadgeAfter`,
 *   `docs/20` defect 16). A restored case arrives badged and is re-badged by the next run it has,
 *   including out of FIXED — restoring the badge does not make it a high-water mark.
 *
 * ## Data, loaded through the same doors
 *
 * The Everyday shell hands a screen no resources, so this screen fetches its own on first open —
 * `dev/data.ts#loadBrowserResources` and `#loadFixitCases`, the exact loaders the Engineer shell
 * uses, cached in module scope so the fetch happens once per tab. The cost is one duplicate
 * fetch-and-parse of `data/` beside the Engineer boot's own (~210 kB revalidated, not re-sent),
 * and the alternative — reaching into `dev/main.ts`'s closure for its copy — couples the two
 * shells the way `boot.ts` deliberately refuses to.
 */

import { loadBrowserResources, loadFixitCases, type BrowserResources } from '../dev/data.js';
import {
  affordabilityOf,
  classifyOutcome,
  editorPricingFrom,
  emptyFixitState,
  fixedBadgeAfter,
  budgetNoteOf,
  parkingPriceUnits,
  setParkingStrategy,
  spendOf,
  stepCapacity,
  stepSpeed,
  stepTopFloorRaise,
  stepZoneOverlap,
  topFloorRaisePriceUnits,
  zonePriceUnits,
  sameOrder,
  verdictIsStale,
  witnessStateOf,
  type FixitOutcome,
} from '../fixit/engine.js';
import { sameLegs } from '../record/crowd.js';
import {
  FIXIT_RUN_SWITCHES,
  assertPairMatchesRepairs,
  figureValuesOf,
  fixitPlanRefusalOf,
  fixitRunPlanOf,
  measuredOf,
  standingParkingOf,
  topFloorRaiseCeilingOf,
  zoneOverlapCeilingOf,
} from '../fixit/run.js';
import {
  createFixitJudge,
  markTitleOf,
  pressThroughTheJudge,
  progressLineOf,
  type MorningMark,
  type MorningProgress,
} from '../fixit/judge.js';
import { shippedAsBuiltMorningsOf } from '../fixit/asBuiltMornings.js';
import { opensWithDiagnosis, routeCensusOf } from '../fixit/routeCensus.js';
import { heldReasonOf, isOffered } from '../fixit/held.js';
import { createOffThreadMornings, morningWorkerCountOf } from '../dev/offThreadMornings.js';
import type {
  EditorParkingStrategy,
  FixitCase,
  FixitCases,
  FixitState,
} from '../fixit/types.js';
import type { PriceSchedule } from '../pricing/types.js';
import type { VizRecording } from '../contract/types.js';
import { mountCaseStage, type CaseStage, type CaseStageBank } from './caseStage.js';
import { keyedBankIdOf, keyedBankNameOf } from '../fixit/families.js';
import { STAGE_CAMERAS } from './stageScreenModel.js';

/** The bank view's first option — the stage camera's own word for the whole picture. */
const WHOLE_TOWER = STAGE_CAMERAS[0].label;
import { DEFAULT_DOOR_TARGET, mountFixitFamilies } from './fixitFamilies.js';
import { editorInputsOf, withPrunedDials } from '../fixit/editorInputs.js';
import { createOffThreadRunner } from '../dev/offThreadRuns.js';
import { actionBarFor } from './actionBar.js';
import { sideBySide } from './screenDom.js';
import type { ActionBarModel } from './actionBar.js';
import {
  buildingLineOf,
  checkStoppedLineOf,
  FIXIT_SCREEN_COPY as COPY,
  fixitBarModel,
  fixitDiagnosisView,
  fixitBudgetRungRow,
  fixitCaseRailModel,
  fixitElevationRow,
  fixitMachineryRows,
  fixitParkingRow,
  fixitSpendSummary,
  fixitVerdictContextOf,
  fixitZoneRow,
  type FixitElevationRow,
  type FixitSpendSummary,
  type FixitZoneRow,
} from './fixitScreenModel.js';
import { caseAtRung, nextBudgetStepOf } from '../fixit/budgetRungs.js';
import { everydayDeviceChimeStore } from './chimeStore.js';
import { CHIME_PRICES } from './chimesPanel.js';
import { boughtStepIdOf } from './deviceChimes.js';
import { diagnosisShownSetOf, progressWithDiagnosisShown, progressWithSolvedCases, solvedCaseSetOf } from './profile.js';
import { everydayProfileStore } from './profileStore.js';
import type { EverydayScreenModule } from './screens.js';
/* GitHub issue #340: beat 3, from the four presses this screen offers. A no-op without consent. */
import { everydayTelemetry } from './telemetryPort.js';
import type { TelemetryControlKey } from '../telemetry/schema.js';
import type { EverydayScreenShellContext, MountedEverydayScreen } from './shell.js';
import {
  EVERYDAY_COLORS as C,
  EVERYDAY_GAPS as GAP,
  EVERYDAY_RADII as R,
  EVERYDAY_TYPE as TYPE,
} from './tokens.js';
import type { EverydayState } from './types.js';

/**
 * Two values the prototype's fixit markup uses that § 19's block does not name — carried as
 * prototype-sourced literals on `tokens.ts`'s own precedent for `EVERYDAY_RAIL_SURFACES`:
 * the mid reading's warm brown (the `OPEN` tag, the mid figures) and the diagnosis card's edge.
 */
const PROTO = Object.freeze({
  mid: '#8D6A2F',
  diagnosisEdge: '#C9BBA4',
  /** The passed outcome card's tints — the prototype's own rgba forms of § 19's moss. */
  passedEdge: 'rgba(79,138,91,.5)',
  passedWash: 'rgba(79,138,91,.09)',
} as const);

/**
 * The two stage blocks' DOM classes, one constant each — GitHub issue #556, § D644.
 *
 * Named rather than inlined at the two mount sites because the browser tier addresses both blocks by
 * these strings and asserts one is **absent** where the other may be present: the as-built block is
 * gone once skipped, and a pair block wearing its class would make that assertion pass for the wrong
 * reason. The as-built set is exactly what `asBuiltStage.ts` hard-coded before the module was
 * widened, so no selector in the tier moved when it was.
 */
const AS_BUILT_STAGE_CLASSES = Object.freeze({
  root: 'everyday-fixit-stage',
  canvas: 'everyday-fixit-stage-canvas',
  skip: 'everyday-fixit-skip',
});

const PAIR_STAGE_CLASSES = Object.freeze({
  root: 'everyday-fixit-pair',
  canvas: 'everyday-fixit-pair-canvas',
  skip: 'everyday-fixit-pair-skip',
});

interface CaseSession {
  state: FixitState;
  fixed: boolean;
  outcome: FixitOutcome | undefined;
  /** The as-built run the four figures are measurements of — cached per case, once it lands. */
  asBuilt: VizRecording | undefined;
  /**
   * Whether the player has watched the as-built run to its end or skipped it — GitHub issue #348.
   * The four figures are stated only after; a case re-opened later opens on the figures, because
   * the sight was seen once and a mode that replayed it on every visit would be a toll.
   */
  asBuiltSeen: boolean;
  /** The mounted as-built stage, kept across redraws so a toggled repair does not restart it. */
  asBuiltStage: CaseStage | undefined;
  /**
   * **The run the player's own change produced** — [§ D644](../../../../DECISIONS.md).
   *
   * Until that entry this object existed for the length of one statement: `primary`'s `onDone` bound
   * `([before, after])`, read `after` twice — once to hold the pair's claim to its legs, once to
   * measure the outcome — and let it go out of scope. A full recording of the day the player bought,
   * simulated and thrown away unseen, on the one press this mode exists for.
   *
   * Held beside {@link CaseSession.asBuilt} rather than as a `{ before, after }` record, because
   * `onDone` assigns both in the same statement and `asBuilt` **is** the before half: a record would
   * hold one recording twice and give the screen two places to disagree about which run the verdict
   * was measured from. Session-local and per case, exactly as `asBuilt` is and for the reason this
   * file's docstring already gives — a recording is megabytes of legs, and it is not progress.
   */
  asRepaired: VizRecording | undefined;
  /**
   * Whether the player has watched the pair to its end or skipped it.
   *
   * {@link CaseSession.asBuiltSeen}'s rule pointed at the other end of the turn, with one deliberate
   * difference: the opening sight is offered **once per case**, and this one **once per run**,
   * because the next press produces a different day. A verdict is never withheld behind it — see the
   * mount site.
   */
  pairSeen: boolean;
  /** The mounted pair stage, kept across redraws so a toggled repair does not restart it. */
  pairStage: CaseStage | undefined;
  /** Which door-hold target the door selects edit — view state, § D1000. */
  doorTarget: string;
  /**
   * **The order {@link CaseSession.outcome} was measured on** — [§ D1011](../../../../DECISIONS.md),
   * assessor C's D6. A verdict is a function of the order it was measured on; once
   * {@link CaseSession.state} moves away from this, the verdict is drawn as stale and the Run press
   * comes back, including on a fixed case, so a cheaper route can be tried. A restored FIXED case
   * carries the empty order it was restored with, so its first edit gives the press back too.
   */
  verdictState: FixitState | undefined;
  /**
   * **The diagnosed repair's own run on the case seed**, once a fixed verdict has asked for it —
   * § D1011. Requested only after a press clears both bars, never before, so it can say nothing a
   * player could use before they have solved the case ([§ D869](../../../../DECISIONS.md)).
   * Session-local and per case for {@link CaseSession.asBuilt}'s reason.
   */
  witness: VizRecording | undefined;
  /**
   * The line a stopped check leaves — [§ D1120](../../../../DECISIONS.md) clause 4: a press made while
   * the last order was still being checked stops that check, and this says where it stopped and that
   * it has no verdict. Cleared when the next verdict lands.
   */
  stoppedLine: string | undefined;
  /**
   * Whether this case's as-built mornings were held the moment it opened — shipped with the build, or
   * run earlier this sitting (§ D1120 clause 4). Drawn as a data attribute for the browser tier, which
   * is the only place that can tell a shipped reading from one that happened to finish quickly.
   */
  mornings: 'held' | 'running' | undefined;
  /**
   * *Show the diagnosis* was pressed on this case in this sitting — § D1120 clause 1. The card reads
   * this or the profile's kept set; only a press on a case that is **not** already fixed is kept,
   * because a mark is about how a clear was reached, and a case fixed on the player's own that they
   * then look up stays fixed on their own.
   */
  asked: boolean;
}

/**
 * Whether the case stands settled for **this** order — FIXED by the latest run, and the order on
 * screen is still the one that run measured. The § 3.3 bar's `Next building` and the primary's
 * advance both read this rather than `fixed` alone, which is what gives a fixed case its Run press
 * back after an edit (§ D1011).
 */
function settledNow(session: CaseSession): boolean {
  return session.fixed && !verdictIsStale(session.verdictState ?? emptyFixitState(), session.state);
}

interface LoadedFixit {
  readonly resources: BrowserResources;
  readonly cases: FixitCases;
}

/* ------------------------------------------------------------------------- *
 * The module-scope store — seeded from the slot, see the docstring's
 * FIXED-survives-the-tab note for which of these outlive it and which do not.
 * ------------------------------------------------------------------------- */

let loaded: LoadedFixit | undefined;
let loadFailure: string | undefined;
let loadPromise: Promise<void> | undefined;
const sessions = new Map<string, CaseSession>();
let selectedId: string | undefined;
let running = false;
/** What the bar was last told about each case's {@link settledNow}, so a redraw that moves it can ask for the bar. */
const lastSettled = new Map<string, string>();

/**
 * The price schedule these cases were loaded with — GitHub issue **#366**.
 *
 * Read off {@link loaded} rather than fetched again, so this screen and the parser that priced its
 * repairs cannot disagree about what anything costs. It throws rather than defaulting: a screen
 * drawing prices before its data arrived would draw zeroes, and a free repair is a worse lie than
 * a crash.
 */
function scheduleNow(): PriceSchedule {
  const schedule = loaded?.cases.schedule;
  if (schedule === undefined) {
    throw new Error('the fix-a-building screen asked for a price before its cases had loaded.');
  }
  return schedule;
}

/**
 * The runner every fixit run crosses on — module-scope, so its worker stays warm across mounts.
 *
 * `dev/shiftRunner.ts` measured what respawning costs: every spawn re-imports `recordRun` and the
 * whole of `core`. This screen is left and re-entered by the § 3.3 bar, so a runner that died with
 * the mount would pay that toll on every visit. `createOffThreadRunner` spawns lazily, so holding
 * one at module scope starts no worker at import time.
 *
 * `new Worker(new URL(…))` is written out here rather than injected through the shell, on
 * `everyday/boardScreen.ts`' and `everyday/benchScreen.ts`' established ground: the shell hands a
 * screen no worker, the expression is a bundler seam Vite rewrites in place, and this file is
 * DOM-bound and outside the honesty search's driven corpus either way.
 */
const runner = createOffThreadRunner({
  spawn: () => new Worker(new URL('../dev/shiftWorker.ts', import.meta.url), { type: 'module' }),
});

/**
 * **The judge's mornings, on their own small pool** — [§ D1020](../../../../DECISIONS.md).
 *
 * A second runner rather than `runner` above, because the forty-nine as-built mornings a case opens
 * with are asked while the as-built day is still playing, and `offThreadRuns` answers one ask at a
 * time: sharing it would make the stage wait on the judge or the judge on the stage. Module-scope
 * for `runner`'s reason, and lazy for the same one — no worker starts until a case asks.
 */
const judge = createFixitJudge(
  createOffThreadMornings({
    spawn: () => new Worker(new URL('../dev/morningWorker.ts', import.meta.url), { type: 'module' }),
    workers: morningWorkerCountOf(typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency),
  }),
  /* § D1120 clause 4: the as-built mornings ship with the build, so a press asks only for its own. */
  { shipped: shippedAsBuiltMorningsOf },
);

/**
 * Whether the letter's morning cleared and the other mornings are running — the § 3.3 relabel.
 *
 * **Since [§ D1120](../../../../DECISIONS.md) this is no longer `running`.** `running` is the pair
 * in flight, and it holds every control still; `checking` is the mornings, and the order's controls
 * stay editable through it — an edit makes the pending verdict stale, and the press it gives back
 * stops the check. The rail and the budget stay held while checking, because a verdict landing on a
 * case the player has left, or against a budget they have since widened, is two claims on one screen.
 */
let checking = false;
/** The case the running check is about, and how far it has got — counts and marks, never an interval. */
let checkingCaseId: string | undefined;
let checkProgress: MorningProgress | undefined;
/** Repaint the live mount's progress block in place — assigned by the mount. */
let paintProgress: () => void = () => {};

/**
 * Whether a check is running on an order the player has since edited — § D1120 clause 4's stale
 * pending verdict. Then the press comes back, and pressing it stops the check.
 */
function supersedesNow(): boolean {
  if (!checking || checkingCaseId === undefined) return false;
  const session = sessions.get(checkingCaseId);
  return session !== undefined && verdictIsStale(session.verdictState, session.state);
}

/**
 * The cases whose diagnosis is on screen for the player: asked for (kept in the profile), or opened
 * shown by the route census — § D1120 clause 1. What the rail's mark reads.
 */
function diagnosisShownOf(caseId: string): boolean {
  return diagnosisShownSetOf(everydayProfileStore().progress()).has(caseId) || opensWithDiagnosis(caseId);
}

/**
 * *Show the diagnosis*, pressed — § D1120 clause 1. Free: it spends nothing and posts nothing. It
 * records the case in the profile's kept set, so the row's mark survives a reload; a mark a reload
 * dropped would turn *with the diagnosis* into *on your own*.
 */
function askDiagnosis(entry: FixitCase, session: CaseSession): void {
  session.asked = true;
  if (session.fixed) return;
  const store = everydayProfileStore();
  const next = progressWithDiagnosisShown(store.progress(), entry.id);
  if (next !== store.progress()) store.setProgress(next);
}

/**
 * What the runner is currently doing, as `caseId:open` or `caseId:press` — or `undefined`.
 *
 * One field rather than a per-session busy flag, because `dev/offThreadRuns.ts` answers exactly
 * one ask and a second `start` abandons the first **silently**: a flag left on the abandoned case
 * would leave it measuring forever. Keyed on the ask, the next draw of that case sees an ask that
 * is not its own and starts a fresh one.
 */
let ask: string | undefined;
/** A run that threw, said where the reader is. Cleared by the next ask. */
let runFailure: string | undefined;

/**
 * The mount a landed run should redraw — the live one, not the one that asked.
 *
 * **An asynchronous run outlives its mount, and that is a bug an asynchronous run creates.** The
 * callbacks used to close over the mounting `render`, which refuses on `alive === false`; so a
 * player who pressed `Run the day` and left through the § 3.3 bar before it landed came back to a
 * screen that never drew the outcome, on a case that had run. It self-healed on the next press of
 * anything, which is the worst version of a defect: intermittent and invisible.
 *
 * The store this screen already keeps is module-scope for the same reason — a run's answer belongs
 * to the case, not to the sitting — so the *drawing* of it is held the same way. `undefined` while
 * no mount is up, which is honest: a run that lands with the screen closed writes its answer into
 * the session and draws nothing, and the next mount reads the session.
 */
let live: { readonly redraw: () => void; readonly refreshBar: () => void; readonly root: HTMLElement } | undefined;

/** Whether {@link ensureRestored} has already run. Once per tab, like the case file's own load. */
let restored = false;

/**
 * Seed the solved set from what the last sitting earned — GitHub issue #224.
 *
 * Materialised into `sessions` rather than held as a second set beside it, and that is the whole of
 * why the badge rule survives: `solvedIds`, `selectFirstUnsolved` and `fixitBar` all read
 * `sessions` and are untouched, and the next run of a restored case overwrites its `fixed` exactly
 * as it overwrites a case solved a minute ago. A separate *restored* set would have had to be
 * consulted beside the session's answer at three sites, and the day one of them forgot, a case
 * would stay badged FIXED beside an outcome card saying it is not — `docs/20` defect 16, rebuilt.
 *
 * The restored session carries **no outcome and no cached run**: `outcome: undefined` is true — this
 * sitting has not run this case — and it is what makes the § 3.3 primary read `Run the day` rather
 * than `Run it again` on a case whose verdict this tab has never seen.
 */
function ensureRestored(): void {
  if (restored) return;
  restored = true;
  for (const id of solvedCaseSetOf(everydayProfileStore().progress())) {
    sessions.set(id, {
      state: emptyFixitState(),
      fixed: true,
      outcome: undefined,
      asBuilt: undefined,
      asBuiltSeen: false,
      asBuiltStage: undefined,
      asRepaired: undefined,
      pairSeen: false,
      pairStage: undefined,
      doorTarget: DEFAULT_DOOR_TARGET,
      verdictState: emptyFixitState(),
      witness: undefined,
      stoppedLine: undefined,
      mornings: undefined,
      asked: false,
    });
  }
}

/**
 * Write the solved set back.
 *
 * The whole set on every change rather than one id, because the slot holds one value and `write`
 * replaces it whole — and because the set shrinks as well as grows: a case that stops being FIXED
 * has to stop being stored, which an append-only write could not express.
 *
 * Spread over the store's current progress rather than built fresh, so the ratings beside it are
 * carried through: two payloads in one value, and a writer that supplied only its own half would
 * delete the other's on every press.
 *
 * Returns nothing, and does not check the answer. Whether the write survived the tab is
 * `progressNotice()`'s to say and the rail draws it on the very next render, which this caller
 * always performs — so a second reading here would be the same fact told twice.
 */
function keepSolved(): void {
  const store = everydayProfileStore();
  /* § D1120: the kept diagnoses are frozen as they stood, so a new clear is not read as a helped one. */
  store.setProgress(progressWithSolvedCases(store.progress(), [...solvedIds()]));
}

function sessionOf(entry: FixitCase): CaseSession {
  let session = sessions.get(entry.id);
  if (session === undefined) {
    session = {
      state: emptyFixitState(),
      fixed: false,
      outcome: undefined,
      asBuilt: undefined,
      asBuiltSeen: false,
      asBuiltStage: undefined,
      asRepaired: undefined,
      pairSeen: false,
      pairStage: undefined,
      doorTarget: DEFAULT_DOOR_TARGET,
      verdictState: undefined,
      witness: undefined,
      stoppedLine: undefined,
      mornings: undefined,
      asked: false,
    };
    sessions.set(entry.id, session);
  }
  return session;
}

/**
 * The case the player is on, **as they meet it** — including a budget rung they have bought.
 *
 * GitHub issue **#579**, [§ D911](../../../../DECISIONS.md). `fixit/budgetRungs.ts#caseAtRung`
 * returns the same case with a bigger `budgetUnits`, and widening it *here* is the whole of the
 * wiring: every consumer on this screen already reads that field through `affordabilityOf`,
 * `spendOf`, `budgetNoteOf`, `fixitSpendSummary` and `classifyOutcome`, so a bought rung reaches
 * all of them at once and none of them learns a new concept. A `FixitState` field would have been
 * the other design and would have needed every one of those call sites to consult it — or to go on
 * quietly charging against the base, which is the defect rather than the alternative.
 *
 * The rung comes off **this device's** ledger rather than a session variable, so it survives a
 * reload exactly as the solved set does, and the whole ladder is the case file's.
 */
function currentEntry(): FixitCase | undefined {
  if (loaded === undefined) return undefined;
  const entry =
    loaded.cases.cases.find((candidate) => candidate.id === selectedId && isOffered(candidate.id)) ??
    loaded.cases.cases.find((candidate) => isOffered(candidate.id));
  if (entry === undefined) return undefined;
  return caseAtRung(
    entry,
    loaded.cases.budgetSteps,
    boughtStepIdOf(everydayDeviceChimeStore().record(), entry.id),
  );
}

function solvedIds(): ReadonlySet<string> {
  return new Set([...sessions.entries()].filter(([, s]) => s.fixed).map(([id]) => id));
}

/** The prototype's menu-entry rule: entering fix-it starts at the first unsolved case. */
function selectFirstUnsolved(): void {
  if (loaded === undefined) return;
  const solved = solvedIds();
  /* A held case is never opened — § D1020. */
  const offered = loaded.cases.cases.filter((entry) => isOffered(entry.id));
  const first = offered.find((entry) => !solved.has(entry.id));
  selectedId = (first ?? offered[0])?.id;
}

/**
 * Ask for the as-built run the four figures are measurements of (§ 10.6).
 *
 * Started from the draw that notices the absence, and guarded twice. An ask already running for
 * this case is left alone; an ask running for a **press** is never superseded, because the press
 * produces the as-built run anyway and stealing the runner from it would abandon the pair
 * mid-flight — the § 3.3 primary would stay inert with nothing coming.
 *
 * An open ask *may* supersede another open ask, which is what makes switching cases mid-measure
 * work: the abandoned case is silent, and the next draw of it starts a fresh ask rather than
 * finding a flag that says it is already measuring.
 *
 * The redraw goes through {@link live} rather than through the mount that asked, because an ask
 * can outlive its mount — see that field.
 */
function measureAsBuilt(loadedFixit: LoadedFixit, entry: FixitCase): void {
  const key = `${entry.id}:open`;
  if (ask === key || ask?.endsWith(':press') === true) return;
  ask = key;
  runFailure = undefined;
  const plan = fixitRunPlanOf(entry, emptyFixitState(), loadedFixit.resources);
  /*
   * The judge's forty-nine as-built mornings — § D1020 — which ship with the build since § D1120, so
   * `prepare` finds them held and asks no worker; a case whose shipped row no longer matches its
   * inputs asks for them here, while the as-built day plays.
   */
  judge.prepare(entry, plan.asBuilt);
  sessionOf(entry).mornings ??= judge.prepared(entry) ? 'held' : 'running';
  runner.start({
    runs: [{ config: plan.asBuilt, ...FIXIT_RUN_SWITCHES }],
    onDone: ([asBuilt]) => {
      ask = undefined;
      if (asBuilt !== undefined) sessionOf(entry).asBuilt = asBuilt;
      live?.redraw();
    },
    onFailed: (message) => {
      ask = undefined;
      runFailure = message;
      live?.redraw();
    },
  });
}

function ensureLoaded(): Promise<void> {
  loadPromise ??= (async () => {
    try {
      const resources = await loadBrowserResources();
      const cases = await loadFixitCases(resources);
      loaded = { resources, cases };
    } catch (error) {
      loadFailure = error instanceof Error ? error.message : String(error);
    }
  })();
  return loadPromise;
}

/* ------------------------------------------------------------------------- *
 * DOM helpers — the shell's own idiom, inline styles from § 19's tokens.
 * ------------------------------------------------------------------------- */

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const EYEBROW = `font:500 10.5px ${TYPE.mono};letter-spacing:.14em;color:${C.label}`;
const MONO = (size: number, color: string): string =>
  `font:500 ${String(size)}px ${TYPE.mono};color:${color}`;

/* ------------------------------------------------------------------------- *
 * The mount
 * ------------------------------------------------------------------------- */

/**
 * § 10.1's case rail, in pixels — the width the prototype gives the list of cases beside the file.
 *
 * A constant rather than a literal because `screenDom.ts#sideBySide` takes it as an argument now,
 * so the number appears once and the width at which the row stacks is derived from it (GitHub
 * issue #240). It was inline in a `grid-template-columns` before, which is why nothing could stack.
 */
const CASE_RAIL_PX = 288;

function mountFixit(
  host: HTMLElement,
  context: EverydayScreenShellContext,
): MountedEverydayScreen {
  const doc = host.ownerDocument;
  let alive = true;
  // Before anything reads `sessions` — the rail, `selectFirstUnsolved` and the § 3.3 bar all do.
  ensureRestored();

  const root = el(doc, 'div', 'everyday-fixit');
  /*
   * The two columns' widths are `screenDom.ts#sideBySide`'s from here — GitHub issue #240. This
   * read `grid-template-columns:288px minmax(0,1fr)`, a fixed track with no breakpoint, which at
   * 360 px left the main column **16 px** wide and clipped 125 px out of the machinery card.
   *
   * `render` writes the row itself on every draw that has two columns to draw, beside the two
   * children it sizes. This is the shape before the first one and for the three single-child
   * states — a plain column, which is what a lone status line wants anyway.
   */
  root.style.cssText = 'display:flex;flex-direction:column;min-width:0';
  host.append(root);

  /*
   * This mount becomes the one a landed run redraws — see {@link live}. Registered here rather
   * than at the end so a run that lands during the case file's own fetch already has somewhere to
   * draw; `render` refuses while `alive` is false either way, so the two guards agree.
   */
  live = {
    redraw: () => {
      render();
    },
    refreshBar: () => {
      context.refreshBar();
    },
    root,
  };

  function render(): void {
    if (!alive) return;
    root.replaceChildren();
    if (loadFailure !== undefined) {
      // Mount status text, the one sentence this file authors — see the module docstring.
      const failed = el(doc, 'p', 'everyday-fixit-failure');
      failed.textContent = `The case file could not be loaded: ${loadFailure}`;
      failed.style.cssText = `color:${C.alarm};font-size:13px;max-width:70ch`;
      root.append(failed);
      return;
    }
    if (loaded === undefined) {
      const loading = el(doc, 'p', 'everyday-fixit-loading', COPY.loading);
      loading.style.cssText = `color:${C.warmGrey};font-size:13px`;
      root.append(loading);
      return;
    }
    const entry = currentEntry();
    if (entry === undefined) {
      const empty = el(doc, 'p', 'everyday-fixit-empty', COPY.emptyFile);
      empty.style.cssText = `color:${C.warmGrey};font-size:13px`;
      root.append(empty);
      return;
    }
    const rail = caseRail(loaded, entry);
    const main = mainColumn(loaded, entry);
    root.append(rail, main);
    sideBySide(root, { fixed: rail, fluid: main, fixedPx: CASE_RAIL_PX, gapPx: GAP.wide });
  }

  /**
   * The banks the played blocks may show one at a time — `caseStage.ts#CaseStageInput.banks`. Named
   * as the building names them, and a car the player keyed to a bank of its own under
   * `fixit/families.ts#keyedBankNameOf`, the name the editor already prints for it.
   */
  function stageBanksOf(
    loadedFixit: LoadedFixit,
    entry: FixitCase,
    recordings: readonly VizRecording[],
  ): readonly CaseStageBank[] {
    const building = loadedFixit.resources.buildings.find((b) => b.id === entry.buildingId);
    const named = new Map<string, string>();
    for (const bank of building?.banks ?? []) if (bank.name !== undefined) named.set(bank.id, bank.name);
    for (const recording of recordings) {
      for (const shaft of recording.shafts) {
        if (shaft.bankId === keyedBankIdOf(shaft.carId)) named.set(shaft.bankId, keyedBankNameOf(shaft.carId));
      }
    }
    return [...named].map(([id, name]) => ({ id, name }));
  }

  function towerLineOf(loadedFixit: LoadedFixit) {
    return (entry: FixitCase): string => {
      const building = loadedFixit.resources.buildings.find((b) => b.id === entry.buildingId);
      return building === undefined
        ? entry.buildingId
        : buildingLineOf(building.name, building.floors.length);
    };
  }

  /* ---- § 10.1's left rail: the case list, `{fixed}/{total} fixed` above it ---- */

  function caseRail(loadedFixit: LoadedFixit, current: FixitCase): HTMLElement {
    const model = fixitCaseRailModel(
      loadedFixit.cases.cases,
      solvedIds(),
      current.id,
      towerLineOf(loadedFixit),
      heldReasonOf,
      diagnosisShownOf,
    );
    const rail = el(doc, 'div', 'everyday-fixit-rail');
    rail.style.cssText = [
      `background:${C.card}`,
      `border:1px solid ${C.ruleMid}`,
      `border-radius:${String(R.card)}px`,
      'padding:18px 16px',
    ].join(';');

    const head = el(doc, 'div');
    head.style.cssText = 'display:flex;align-items:baseline;gap:8px';
    const heading = el(doc, 'span', undefined, model.heading);
    heading.style.cssText = EYEBROW;
    const count = el(doc, 'span', 'everyday-fixit-count', model.count);
    count.style.cssText = `margin-left:auto;${MONO(10.5, C.terracotta)};flex:none`;
    head.append(heading, count);
    rail.append(head);

    /*
     * What the player is owed about their kept progress — GitHub issue #224.
     *
     * Drawn under the `{fixed}/{total}` count on purpose: the count is exactly the figure a refused
     * restore makes wrong, and a `0/3 fixed` on a player who solved two yesterday is the silent
     * empty state the notice exists to stop. The sentence is `everyday/profile.ts`'s, so the ladder
     * says the same thing about the same store rather than wording it a second time.
     */
    const notice = everydayProfileStore().progressNotice();
    if (notice !== null) {
      const line = el(doc, 'p', 'everyday-fixit-progress-notice', notice);
      line.style.cssText = `margin:8px 0 0;font-size:12px;line-height:1.5;color:${C.terracotta}`;
      rail.append(line);
    }

    const list = el(doc, 'div');
    list.style.cssText = `display:grid;gap:${String(GAP.row)}px;margin-top:12px`;
    for (const row of model.rows) {
      const held = row.heldReason !== undefined;
      const button = el(doc, 'button', held ? 'everyday-fixit-case everyday-fixit-case-held' : 'everyday-fixit-case');
      button.type = 'button';
      if (row.active) button.setAttribute('aria-current', 'true');
      /*
       * A held case is drawn, with its reason, and cannot be opened — § D1020. A row that vanished
       * would be the list quietly shrinking; a row that opened would be a letter nobody can answer.
       */
      button.disabled = held;
      button.style.cssText = [
        'text-align:left',
        `cursor:${held ? 'not-allowed' : 'pointer'}`,
        `opacity:${held ? '.7' : '1'}`,
        `border:1.5px solid ${row.active ? C.ink : C.ruleLight}`,
        `background:${row.active ? C.cardSunkDeep : C.paper}`,
        `border-radius:${String(R.tile)}px`,
        'padding:12px 13px',
        `color:${C.ink}`,
        'display:flex',
        'flex-direction:column',
        'gap:4px',
        'width:100%',
        'box-sizing:border-box',
      ].join(';');
      const top = el(doc, 'span');
      top.style.cssText = 'display:flex;align-items:baseline;gap:8px';
      const name = el(doc, 'span', undefined, row.name);
      name.style.cssText = 'font-size:14px;font-weight:600;min-width:0';
      const tag = el(doc, 'span', 'everyday-fixit-tag', row.tag);
      tag.style.cssText = `margin-left:auto;${MONO(10, row.solved ? C.moss : PROTO.mid)};flex:none`;
      top.append(name, tag);
      const tower = el(doc, 'span', undefined, row.towerLine);
      tower.style.cssText = `font-size:12px;line-height:1.4;color:${C.warmGrey}`;
      button.append(top, tower);
      /* § D1120 clause 1: whether the diagnosis played a part, said on the row. */
      if (row.mark !== undefined) {
        const mark = el(doc, 'span', 'everyday-fixit-case-mark', row.mark);
        mark.style.cssText = `${MONO(10, C.warmGrey)}`;
        button.append(mark);
      }
      if (row.heldReason !== undefined) {
        const reason = el(doc, 'span', 'everyday-fixit-held-reason', row.heldReason);
        reason.style.cssText = `font-size:12px;line-height:1.45;color:${C.inkSoft}`;
        button.append(reason);
        button.title = row.heldReason;
      }
      button.addEventListener('click', () => {
        if (running || checking || held) return;
        /*
         * A case that is already open is not a change. Guarded rather than emitted unconditionally,
         * because a player re-pressing the row they are on would otherwise be filed as beat 3 and
         * `docs/26 K2` would count a chain nobody completed.
         */
        const moved = selectedId !== row.id;
        selectedId = row.id;
        if (moved) {
          everydayTelemetry().record({
            name: 'change_made',
            controlKey: 'fixit-case',
            screenKey: 'fixit',
          });
        }
        render();
        context.refreshBar();
      });
      list.append(button);
    }
    rail.append(list);

    const hint = el(doc, 'p', undefined, model.hint);
    hint.style.cssText = `font-size:12px;line-height:1.5;color:${C.warmGrey};margin:14px 0 0`;
    rail.append(hint);
    return rail;
  }

  /* ---- the main column, § 10.1's order ---- */

  function mainColumn(loadedFixit: LoadedFixit, entry: FixitCase): HTMLElement {
    const session = sessionOf(entry);
    if (session.asBuilt === undefined) measureAsBuilt(loadedFixit, entry);
    /*
     * A case whose as-built mornings were superseded by another case's — the player moved on before
     * they landed — asks again when it is opened again. `judge.prepare` is a no-op while they are
     * held or in flight, and never supersedes a press's replication.
     */
    else if (!judge.prepared(entry) && !judge.replicating()) {
      judge.prepare(entry, fixitRunPlanOf(entry, emptyFixitState(), loadedFixit.resources).asBuilt);
    }
    const spend = spendOf(entry, session.state, loadedFixit.cases.schedule);
    const summary = fixitSpendSummary(entry, spend);

    const main = el(doc, 'div', 'everyday-fixit-main');
    main.style.cssText = 'min-width:0';
    /* Whether the as-built mornings were held when the case opened — § D1120, for the browser tier. */
    if (session.mornings !== undefined) main.dataset['mornings'] = session.mornings;

    /* -- the heading: case name, tower line beside it -- */
    const headRow = el(doc, 'div');
    headRow.style.cssText = 'display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap';
    const h1 = el(doc, 'h1', undefined, entry.name);
    h1.style.cssText = `font:700 30px ${TYPE.heading};line-height:1.15;letter-spacing:-.02em;margin:0`;
    const tower = el(doc, 'span', undefined, towerLineOf(loadedFixit)(entry));
    tower.style.cssText = MONO(11.5, C.label);
    headRow.append(h1, tower);
    main.append(headRow);

    /* -- 1. the complaint, in the tenant's words -- */
    const complaint = el(doc, 'div', 'everyday-fixit-complaint');
    complaint.style.cssText = [
      'margin-top:16px',
      `border-left:3px solid ${C.alarm}`,
      `background:${C.card}`,
      `border-radius:0 ${String(R.tile)}px ${String(R.tile)}px 0`,
      'padding:14px 17px',
      'max-width:74ch',
    ].join(';');
    const cEyebrow = el(doc, 'div', undefined, COPY.complaintEyebrow);
    cEyebrow.style.cssText = EYEBROW;
    const cText = el(doc, 'p', undefined, `“${entry.complaint.text}”`);
    cText.style.cssText = `font-size:15.5px;line-height:1.55;color:${C.ink};margin:6px 0 0;font-style:italic`;
    const cWho = el(doc, 'div', undefined, `— ${entry.complaint.complainer}`);
    cWho.style.cssText = `font-size:12.5px;color:${C.warmGrey};margin-top:7px`;
    complaint.append(cEyebrow, cText, cWho);
    main.append(complaint);

    /* -- 2. the building as it stands, the symptom flagged in terracotta -- */
    const asBuilt = el(doc, 'div', 'everyday-fixit-asbuilt');
    asBuilt.style.cssText = [
      'margin-top:14px',
      `border:1px solid ${C.rule}`,
      `border-radius:${String(R.card)}px`,
      `background:${C.card}`,
      'padding:14px 17px',
      'max-width:80ch',
    ].join(';');
    const aEyebrow = el(doc, 'div', undefined, COPY.asBuiltEyebrow);
    aEyebrow.style.cssText = EYEBROW;
    const aNote = el(doc, 'p', undefined, entry.asBuilt.note);
    aNote.style.cssText = `font-size:13.5px;line-height:1.55;color:${C.inkSoft};margin:6px 0 0`;
    const aSymptom = el(doc, 'div', 'everyday-fixit-symptom', entry.symptom);
    aSymptom.style.cssText = `${MONO(11.5, C.terracotta)};margin-top:7px`;
    asBuilt.append(aEyebrow, aNote, aSymptom);
    /*
     * § D478's declaration, on the case's own face — beside the note that describes the building
     * as it stands, because that is the sentence a reader is calibrating the four figures against.
     * Derived by `fixit/parse.ts#demandDisclosureOf`, so a case inside its band has no element
     * here rather than an empty one.
     */
    if (entry.demandDisclosure !== undefined) {
      const aDemand = el(doc, 'p', 'everyday-fixit-demand', entry.demandDisclosure);
      aDemand.style.cssText = `font-size:12.5px;line-height:1.5;color:${C.warmGrey};margin:8px 0 0`;
      asBuilt.append(aDemand);
    }
    main.append(asBuilt);

    /*
     * -- 2b. the as-built run, played, before the figures are stated — GitHub issue #348, PM-FB1.
     * Mounted once per case on the recording the figures are read from, re-appended on every
     * redraw so a toggled repair does not restart it, and gone once watched or skipped.
     */
    if (session.asBuilt !== undefined && !session.asBuiltSeen) {
      const recording = session.asBuilt;
      session.asBuiltStage ??= mountCaseStage(doc, {
        panes: [{ recording }],
        speedSimPerRealS: everydayProfileStore().defaultSpeed(),
        copy: {
          eyebrow: COPY.asBuiltStageEyebrow,
          note: COPY.asBuiltStageNote,
          skip: COPY.asBuiltStageSkip,
          bankView: COPY.stageBankView,
          bankViewWhole: WHOLE_TOWER,
        },
        wide: true,
        banks: stageBanksOf(loadedFixit, entry, [recording]),
        classes: AS_BUILT_STAGE_CLASSES,
        onDone: () => {
          const current = sessionOf(entry);
          current.asBuiltSeen = true;
          current.asBuiltStage?.dispose();
          current.asBuiltStage = undefined;
          live?.redraw();
        },
      });
      main.append(session.asBuiltStage.root);
    }

    /* -- 3. the four figures, measured on the as-built run — stated after the run is seen -- */
    const figures = el(doc, 'div', 'everyday-fixit-figures');
    figures.style.cssText = [
      'display:grid',
      'grid-template-columns:repeat(auto-fit,minmax(150px,1fr))',
      'gap:11px',
      'margin-top:16px',
      'max-width:80ch',
    ].join(';');
    if (session.asBuilt === undefined) {
      /*
       * The four figures are measurements of a run that is happening on a worker, so the grid says
       * so rather than drawing four blanks or four zeros — a figure the screen does not have is
       * named as absent and never estimated.
       *
       * Written here rather than added to `fixitScreenModel.ts#FIXIT_SCREEN_COPY`, which is the
       * corpus-driven half. *Is a run in flight* is not a fact about a `FixitCase` or a
       * `FixitState`, which is all that model is over; and this file's own literal is exactly this
       * class — mount status text, on the footing the load-failure line above sits on and every
       * excluded mount's does.
       */
      const measuring = el(
        doc,
        'p',
        'everyday-fixit-measuring',
        'Measuring the building as it stands…',
      );
      measuring.style.cssText = `grid-column:1/-1;font-size:13px;color:${C.warmGrey};margin:0`;
      figures.append(measuring);
    }
    for (const figure of
      session.asBuilt === undefined || !session.asBuiltSeen ? [] : figureValuesOf(entry, session.asBuilt)) {
      const card = el(doc, 'div', 'everyday-fixit-figure');
      card.style.cssText = [
        `border:1px solid ${C.rule}`,
        `border-radius:${String(R.tile)}px`,
        `background:${C.card}`,
        'padding:12px 14px',
      ].join(';');
      const tint =
        figure.reading === 'bad' ? C.alarm : figure.reading === 'healthy' ? C.moss : PROTO.mid;
      const value = el(doc, 'div', undefined, figure.text);
      value.style.cssText = `${MONO(15, tint)};letter-spacing:-.02em`;
      const label = el(doc, 'div', undefined, figure.label);
      label.style.cssText = 'font-size:12.5px;font-weight:600;margin-top:4px';
      card.append(value, label);
      figures.append(card);
    }
    main.append(figures);
    if (runFailure !== undefined) {
      const failed = el(doc, 'p', 'everyday-fixit-run-failed');
      failed.textContent = `The day could not be run: ${runFailure}`;
      failed.style.cssText = `color:${C.alarm};font-size:13px;max-width:70ch;margin:10px 0 0`;
      main.append(failed);
    }

    /*
     * -- 4. the diagnosis — withheld until asked, since [§ D1120](../../../../DECISIONS.md) clause 1.
     * The words are `fixitScreenModel.ts#fixitDiagnosisView`'s; this draws its three states. A case
     * whose route census shows fewer than two ways through opens shown, and says why.
     */
    const view = fixitDiagnosisView({
      entry,
      schedule: loadedFixit.cases.schedule,
      asked: session.asked || diagnosisShownSetOf(everydayProfileStore().progress()).has(entry.id),
      census: routeCensusOf(entry.id),
      explained:
        settledNow(session) && session.outcome?.kind === 'fixed' && session.outcome.attribution === 'diagnosis',
    });
    const diagnosis = el(doc, 'div', 'everyday-fixit-diagnosis');
    diagnosis.dataset['state'] = view.state;
    diagnosis.style.cssText = [
      'margin-top:16px',
      `border:1px solid ${PROTO.diagnosisEdge}`,
      'border-radius:13px',
      `background:${C.cardSunkDeep}`,
      'padding:15px 18px',
      'max-width:80ch',
    ].join(';');
    const dEyebrow = el(doc, 'div', undefined, view.eyebrow);
    dEyebrow.style.cssText = EYEBROW;
    diagnosis.append(dEyebrow);
    if (view.text !== undefined) {
      const dText = el(doc, 'div', 'everyday-fixit-diagnosis-text', view.text);
      dText.style.cssText = `font:600 ${view.state === 'explained' ? '19px' : '16px'} ${TYPE.heading};line-height:1.3;margin-top:4px`;
      diagnosis.append(dText);
    }
    const dNote = el(doc, 'p', 'everyday-fixit-diagnosis-note', view.note);
    dNote.style.cssText = `font-size:13.5px;line-height:1.55;color:${C.inkSoft};margin:6px 0 0`;
    diagnosis.append(dNote);
    if (view.because !== undefined) {
      const because = el(doc, 'p', 'everyday-fixit-diagnosis-because', view.because);
      because.style.cssText = `font-size:12.5px;line-height:1.5;color:${C.warmGrey};margin:6px 0 0`;
      diagnosis.append(because);
    }
    if (view.press !== undefined) {
      const show = el(doc, 'button', 'everyday-fixit-diagnosis-show', view.press);
      show.type = 'button';
      show.style.cssText = [
        'margin-top:10px',
        `border:1px solid ${C.rule}`,
        `border-radius:${String(R.control)}px`,
        `background:${C.paper}`,
        `color:${C.ink}`,
        'font-size:13px',
        'padding:5px 12px',
        'cursor:pointer',
      ].join(';');
      show.addEventListener('click', () => {
        askDiagnosis(entry, session);
        everydayTelemetry().record({ name: 'change_made', controlKey: 'fixit-case', screenKey: 'fixit' });
        render();
      });
      diagnosis.append(show);
    }
    main.append(diagnosis);

    /*
     * -- 5. the repair menu used to stand here — § 10.2's four repairs and five extras as toggles.
     * It retired on [§ D1020](../../../../DECISIONS.md)'s commit, under § D706 clause 6: the editor
     * below writes every answer, and a verdict now means fifty mornings rather than one. The
     * repairs stay in `data/fixit-cases.json` as the witness and the priced negative controls;
     * nothing draws them.
     */

    /* -- 6. the § 10.3 subset the engine prices: machinery, zones and parking -- */
    main.append(machinesCard(loadedFixit, entry, session, summary));

    /*
     * -- 7. the pair, played — [§ D644](../../../../DECISIONS.md), the payoff this mode was missing.
     *
     * Mounted once per run on the two recordings the verdict is measured from, re-appended on every
     * redraw so a toggled repair does not restart it, and gone once watched or skipped.
     *
     * **It withholds nothing, and that is the whole of why it sits here rather than in front of the
     * card.** GitHub issue #348 gates the four figures behind the opening watch, and the symmetric
     * move — gate the verdict behind this one — was considered and refused. The verdict is not only
     * a card: `session.fixed` badges the case in the rail, `keepSolved` writes it to the profile and
     * `bankScenarioClear` files the chime, all in the statement that lands the run. Deferring the
     * card alone would put a FIXED badge over a case whose card had not said so, which is `docs/20`
     * defect 16 — *two verdicts about one case on one screen* — rebuilt on purpose; and deferring
     * the rest would make watching a toll on the one loop this mode is made of, which is iterating.
     * So the sight comes **first in reading order** and the press below it goes to the verdict,
     * neither of which costs the player a fact they already have.
     */
    if (session.asBuilt !== undefined && session.asRepaired !== undefined && !session.pairSeen) {
      const before = session.asBuilt;
      const after = session.asRepaired;
      session.pairStage ??= mountCaseStage(doc, {
        panes: [
          { recording: before, caption: COPY.pairStageBeforeCaption },
          { recording: after, caption: COPY.pairStageAfterCaption },
        ],
        speedSimPerRealS: everydayProfileStore().defaultSpeed(),
        copy: {
          eyebrow: COPY.pairStageEyebrow,
          note: COPY.pairStageNote,
          skip: COPY.pairStageSkip,
          bankView: COPY.stageBankView,
          bankViewWhole: WHOLE_TOWER,
        },
        wide: true,
        banks: stageBanksOf(loadedFixit, entry, [before, after]),
        classes: PAIR_STAGE_CLASSES,
        onDone: () => {
          const current = sessionOf(entry);
          current.pairSeen = true;
          current.pairStage?.dispose();
          current.pairStage = undefined;
          live?.redraw();
          live?.root.querySelector('.everyday-fixit-outcome')?.scrollIntoView({ block: 'nearest' });
        },
      });
      main.append(session.pairStage.root);
    }

    /* -- 8. the result, once run (§ 10.4) -- */
    if (session.stoppedLine !== undefined) {
      const stopped = el(doc, 'p', 'everyday-fixit-check-stopped', session.stoppedLine);
      stopped.style.cssText = `margin:18px 0 0;font-size:13px;line-height:1.5;color:${C.warmGrey};max-width:80ch`;
      main.append(stopped);
    }
    if (session.outcome !== undefined) {
      /*
       * Stale over the card rather than instead of it — § D1011. The verdict is still true of the
       * order that was run, and the sentence says it is not about the one on screen.
       */
      if (verdictIsStale(session.verdictState, session.state)) {
        const stale = el(doc, 'p', 'everyday-fixit-verdict-stale', COPY.verdictStale);
        stale.style.cssText = `margin:18px 0 0;font-size:13px;line-height:1.5;color:${C.alarm};max-width:80ch`;
        main.append(stale);
      }
      const card = outcomeCard(session.outcome);
      /* § D1120 clause 4: the live count and the marks, under the checking card and nowhere else. */
      if (session.outcome.kind === 'checking' && checking && checkingCaseId === entry.id) card.append(progressBlock());
      main.append(card);
    }
    /*
     * The bar reads {@link settledNow}, and an edit only redraws the screen — so a redraw that moved
     * the case in or out of *settled* asks the shell to redraw the bar too, or `Next building` would
     * stay pressable over a stale verdict until something else refreshed it.
     */
    const nowSettled = settledNow(session);
    /* The press also comes back when a check is running on an order since edited — § D1120. */
    const barKey = `${String(nowSettled)}|${String(supersedesNow())}`;
    if (lastSettled.get(entry.id) !== barKey) {
      lastSettled.set(entry.id, barKey);
      context.refreshBar();
    }

    return main;
  }

  /**
   * **The wider budget, bought with chimes** — GitHub issue **#579**,
   * [§ D911](../../../../DECISIONS.md), `docs/38` § 2.1.
   *
   * ## What the press does, in the order it does it
   *
   * It asks `everyday/chimeStore.ts` to spend, and the **store** decides: it holds the balance, it
   * refuses a second purchase of the same rung, and it refuses a shortfall. Nothing here subtracts
   * anything or checks anything a second time — that would be the second arithmetic
   * `chimesPanel.ts` keeps out of the Settings panel for `docs/22` non-goal 3's reason, arriving on
   * a different screen. A refused press redraws and the row says which refusal it met.
   *
   * ## Why the row is not disabled when it is unaffordable but still drawn
   *
   * GAMEPLAY § 20.12: an unavailable thing is a row with a reason and never a dead button. The
   * button is out of the tab order on every arm but `buy` and carries the row's own sentence as its
   * `title`, which is the shape the two steppers above it already take (GitHub issue #262 — three
   * of this screen's forty-one buttons shipped disabled with no sentence).
   *
   * ## `null` where the case file authors no rung
   *
   * `fixitZoneRow`'s precedent: a control over a ladder that does not exist is a press that writes
   * nothing, and an empty `budgetSteps` is a statement the screen honours by drawing nothing.
   */
  function budgetRungLine(entry: FixitCase): HTMLElement | null {
    if (loaded === undefined) return null;
    const steps = loaded.cases.budgetSteps;
    const store = everydayDeviceChimeStore();
    const bought = boughtStepIdOf(store.record(), entry.id);
    const next = nextBudgetStepOf(steps, bought);
    const row = fixitBudgetRungRow({
      unitsNow: entry.budgetUnits,
      nextChimes: next?.chimes,
      balanceChimes: store.balance(),
      laddered: steps.length > 0,
      currency: CHIME_PRICES.currency,
    });
    if (row === null) return null;
    const line = el(doc, 'div', 'everyday-fixit-budget-rung');
    line.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap';
    const buy = el(doc, 'button', 'everyday-fixit-budget-buy', '+');
    buy.type = 'button';
    buy.disabled = row.offer !== 'buy';
    buy.setAttribute('aria-label', `${row.label} — ${row.priced ?? row.note}`);
    if (row.offer !== 'buy') buy.title = row.note;
    buy.style.cssText = [
      'width:26px',
      'height:24px',
      'padding:0',
      `border:1px solid ${C.rule}`,
      `border-radius:${String(R.control)}px`,
      `background:${C.paper}`,
      `color:${row.offer === 'buy' ? C.ink : C.faint}`,
      `cursor:${row.offer === 'buy' ? 'pointer' : 'not-allowed'}`,
      'font-size:14px',
      'line-height:1',
    ].join(';');
    buy.addEventListener('click', () => {
      if (running || checking || next === undefined) return;
      const outcome = store.spend({ scenarioId: entry.id, stepId: next.id, chimes: next.chimes });
      if (outcome.kind === 'bought') {
        everydayTelemetry().record({ name: 'change_made', controlKey: 'fixit-budget', screenKey: 'fixit' });
      }
      render();
    });
    const label = el(doc, 'span', undefined, row.label);
    label.style.cssText = 'font-size:13px;font-weight:600';
    const readout = el(doc, 'span', 'everyday-fixit-budget-readout', row.readout);
    readout.style.cssText = MONO(12, C.terracotta);
    const priced = el(doc, 'span', 'everyday-fixit-budget-priced', row.priced ?? row.note);
    priced.style.cssText = `margin-left:auto;${MONO(10, C.label)}`;
    line.append(buy, label, readout, priced);
    return line;
  }

  function machinesCard(
    loadedFixit: LoadedFixit,
    entry: FixitCase,
    session: CaseSession,
    summary: FixitSpendSummary,
  ): HTMLElement {
    const card = el(doc, 'div', 'everyday-fixit-machines');
    card.style.cssText = [
      'margin-top:14px',
      `border:1px solid ${C.rule}`,
      `border-radius:${String(R.card)}px`,
      `background:${C.card}`,
      'overflow:hidden',
      'max-width:80ch',
    ].join(';');

    const head = el(doc, 'div');
    head.style.cssText = [
      'display:flex',
      'align-items:baseline',
      'gap:10px',
      'padding:11px 16px',
      `border-bottom:1px solid ${C.ruleLight}`,
      `background:${C.cardSunk}`,
      'flex-wrap:wrap',
    ].join(';');
    const eyebrow = el(doc, 'span', undefined, COPY.machinesEyebrow);
    eyebrow.style.cssText = EYEBROW;
    const capital = el(doc, 'span', 'everyday-fixit-capital', summary.capitalLine);
    capital.style.cssText = `margin-left:auto;${MONO(11, summary.overBudget ? C.alarm : summary.capitalLine === COPY.noCapital ? C.moss : PROTO.mid)};flex:none`;
    const committed = el(doc, 'span', 'everyday-fixit-committed', summary.committedLine);
    committed.style.cssText = `${MONO(11, summary.overBudget ? C.alarm : C.warmGrey)};flex:none`;
    head.append(eyebrow, capital, committed);
    card.append(head);

    const body = el(doc, 'div');
    body.style.cssText = `display:grid;gap:${String(GAP.block)}px;padding:14px 16px`;
    /* The one row on this card priced in chimes — GitHub issue #579, § D911. First, because it is
     * what the rest of the card is spent against. */
    const rung = budgetRungLine(entry);
    if (rung !== null) body.append(rung);
    const pricing = editorPricingFrom(scheduleNow());
    const rows = fixitMachineryRows(
      session.state,
      affordabilityOf(entry, session.state, pricing.speedUnitsPerHalfMps, scheduleNow()).selectable,
      affordabilityOf(entry, session.state, pricing.capacityUnitsPerTwoPlaces, scheduleNow()).selectable,
      pricing,
    );
    for (const row of rows) {
      const line = el(doc, 'div', `everyday-fixit-stepper everyday-fixit-stepper-${row.key}`);
      line.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap';
      const minus = el(doc, 'button', 'everyday-fixit-step-down', '−');
      const plus = el(doc, 'button', 'everyday-fixit-step-up', '+');
      /*
       * The fourth cell is **why the step refuses**, and it is separate from the third on purpose:
       * `aria-label` names what the control would do (*Rated speed — return one step*) and a
       * player looking at a grey button is asking why it will not. Before GitHub issue #262's
       * sweep both `−` buttons shipped dead with the first sentence and not the second — measured
       * on the shipped build, three of this screen's forty-one buttons were disabled and none of
       * them said why. The budget cap has a sentence on the row already (§ 10.3's `at the budget`);
       * this puts it on the control too, which is where it is pressed.
       */
      for (const [button, enabled, label, why] of [
        [minus, row.canStepDown, COPY.stepDown, COPY.nothingToReturn],
        [plus, !row.atBudget, COPY.stepUp, COPY.noBudgetLeft],
      ] as const) {
        button.type = 'button';
        button.setAttribute('aria-label', `${row.label} — ${label}`);
        button.disabled = !enabled;
        if (!enabled) button.title = why;
        button.style.cssText = [
          'width:26px',
          'height:24px',
          'padding:0',
          `border:1px solid ${C.rule}`,
          `border-radius:${String(R.control)}px`,
          `background:${C.paper}`,
          `color:${enabled ? C.ink : C.faint}`,
          `cursor:${enabled ? 'pointer' : 'not-allowed'}`,
          'font-size:14px',
          'line-height:1',
        ].join(';');
      }
      /*
       * § 7.2 E4 on both steppers — GitHub issue #340. The key is `FixitMachineryRow.key`, which is
       * the row's own `'speed' | 'capacity'`, so the vocabulary is the product's rather than this
       * handler's; the direction is deliberately not carried, on § 2.3's rule that a field which
       * answers no question in § 6 does not ship — `docs/26 K2` asks whether beat 3 happened.
       */
      const steppedKey: TelemetryControlKey = row.key === 'speed' ? 'fixit-speed' : 'fixit-capacity';
      minus.addEventListener('click', () => {
        if (running) return;
        session.state =
          row.key === 'speed'
            ? stepSpeed(entry, session.state, -1, scheduleNow())
            : stepCapacity(entry, session.state, -1, scheduleNow());
        everydayTelemetry().record({ name: 'change_made', controlKey: steppedKey, screenKey: 'fixit' });
        render();
      });
      plus.addEventListener('click', () => {
        if (running) return;
        session.state =
          row.key === 'speed'
            ? stepSpeed(entry, session.state, 1, scheduleNow())
            : stepCapacity(entry, session.state, 1, scheduleNow());
        everydayTelemetry().record({ name: 'change_made', controlKey: steppedKey, screenKey: 'fixit' });
        render();
      });
      const label = el(doc, 'span', undefined, row.label);
      label.style.cssText = 'font-size:13px;font-weight:600';
      const readout = el(doc, 'span', 'everyday-fixit-readout', row.readout);
      readout.style.cssText = MONO(12, C.terracotta);
      const priced = el(doc, 'span', undefined, row.priced);
      priced.style.cssText = `margin-left:auto;${MONO(10, C.label)}`;
      line.append(minus, plus, label, readout, priced);
      body.append(line);
    }

    /* § 10.3's zones and parking — GitHub issue #422, on the same card and the same budget. */
    const fabric = editorFabricOf(loadedFixit, entry);
    const zone = fixitZoneRow(
      session.state,
      fabric.ceiling,
      affordabilityOf(entry, session.state, zonePriceUnits(scheduleNow()), scheduleNow()).selectable,
      zonePriceUnits(scheduleNow()),
    );
    if (zone !== null) body.append(zoneLine(entry, session, zone, fabric.ceiling));
    /* The parking select is drawn beside its floor, inside the families card below — § D1020. */
    const elevation = fixitElevationRow(
      session.state,
      fabric.elevationCeiling,
      affordabilityOf(entry, session.state, topFloorRaisePriceUnits(scheduleNow()), scheduleNow())
        .selectable,
      topFloorRaisePriceUnits(scheduleNow()),
    );
    if (elevation !== null) body.append(elevationLine(entry, session, elevation, fabric.elevationCeiling));
    /*
     * § D1000's five families — the dials, the door hold and the banks — on the same card and the
     * same budget. `everyday/fixitFamilies.ts` is the mount both fix-it surfaces share.
     */
    body.append(
      mountFixitFamilies({
        doc,
        entry,
        state: session.state,
        resources: loadedFixit.resources,
        schedule: scheduleNow(),
        running,
        doorTarget: session.doorTarget,
        setDoorTarget: (target) => {
          session.doorTarget = target;
          render();
        },
        commit: (next, key) => {
          if (running) return;
          session.state = next;
          everydayTelemetry().record({ name: 'change_made', controlKey: key, screenKey: 'fixit' });
          render();
        },
        palette: {
          ink: C.ink,
          soft: C.inkSoft,
          faint: C.faint,
          rule: C.rule,
          paper: C.paper,
          label: C.label,
          alarm: C.alarm,
          accent: C.terracotta,
          radius: R.control,
          mono: TYPE.mono,
        },
        prefix: 'everyday-fixit',
        parkingRow: parkingLine(entry, session, fabric.standing),
      }),
    );
    card.append(body);

    const note = el(doc, 'div', 'everyday-fixit-budget-note', budgetNoteOf(entry, spendOf(entry, session.state, scheduleNow())));
    note.style.cssText = [
      'padding:10px 16px',
      `border-top:1px solid ${C.ruleLight}`,
      `background:${C.cardSunk}`,
      'font-size:12.5px',
      `color:${C.inkSoft}`,
      'line-height:1.5',
    ].join(';');
    card.append(note);
    return card;
  }

  /**
   * **What this case's fabric allows**, computed once per case rather than once per render.
   *
   * Both answers come off the as-built `SimulationConfig` — the zoning ceiling from its resolved
   * building, the standing parking rule from its dispatcher profile — so this screen holds no second
   * opinion about either, exactly as it holds none about a price or an affordability. Memoised
   * because building that config parses and resolves the whole tower and `render()` runs on every
   * press; keyed by case id, and a case's fabric cannot change inside a session because the as-built
   * patch is authored.
   */
  const fabricByCase = new Map<
    string,
    { readonly ceiling: number; readonly standing: string; readonly elevationCeiling: number }
  >();
  function editorFabricOf(
    loadedFixit: LoadedFixit,
    entry: FixitCase,
  ): { readonly ceiling: number; readonly standing: string; readonly elevationCeiling: number } {
    const cached = fabricByCase.get(entry.id);
    if (cached !== undefined) return cached;
    const asBuilt = fixitRunPlanOf(entry, emptyFixitState(), loadedFixit.resources).asBuilt;
    const fabric = {
      ceiling: zoneOverlapCeilingOf(asBuilt.building),
      standing: standingParkingOf(asBuilt),
      elevationCeiling: topFloorRaiseCeilingOf(asBuilt.building),
    };
    fabricByCase.set(entry.id, fabric);
    return fabric;
  }

  /**
   * § 10.3's zoning stepper — issue **#422**, drawn on `fixitScreenModel.ts#fixitZoneRow`'s words.
   *
   * The `+` button's `title` is the row's **own** refusal rather than a constant, which is the whole
   * point of `FixitZoneRow.stepUpRefusal` being a string and not a boolean: at the building's ceiling
   * with budget in hand, *the repair budget will not stretch* would be false. `docs/20` defect 8 is
   * that mistake made once already, and GitHub issue #262's sweep is why a grey button says why.
   */
  function zoneLine(
    entry: FixitCase,
    session: CaseSession,
    row: FixitZoneRow,
    ceiling: number,
  ): HTMLElement {
    const line = el(doc, 'div', 'everyday-fixit-stepper everyday-fixit-stepper-zones');
    line.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap';
    const minus = el(doc, 'button', 'everyday-fixit-step-down', '−');
    const plus = el(doc, 'button', 'everyday-fixit-step-up', '+');
    for (const [button, enabled, label, why] of [
      [minus, row.canStepDown, COPY.stepDown, COPY.nothingToReturn],
      [plus, row.stepUpRefusal === undefined, COPY.stepUp, row.stepUpRefusal ?? ''],
    ] as const) {
      button.type = 'button';
      button.setAttribute('aria-label', `${row.label} — ${label}`);
      button.disabled = !enabled;
      if (!enabled && why !== '') button.title = why;
      button.style.cssText = [
        'width:26px',
        'height:24px',
        'padding:0',
        `border:1px solid ${C.rule}`,
        `border-radius:${String(R.control)}px`,
        `background:${C.paper}`,
        `color:${enabled ? C.ink : C.faint}`,
        `cursor:${enabled ? 'pointer' : 'not-allowed'}`,
        'font-size:14px',
        'line-height:1',
      ].join(';');
    }
    for (const [button, delta] of [
      [minus, -1],
      [plus, 1],
    ] as const) {
      button.addEventListener('click', () => {
        if (running) return;
        session.state = stepZoneOverlap(entry, session.state, delta, ceiling, scheduleNow());
        everydayTelemetry().record({ name: 'change_made', controlKey: 'fixit-zones', screenKey: 'fixit' });
        render();
      });
    }
    const label = el(doc, 'span', undefined, row.label);
    label.style.cssText = 'font-size:13px;font-weight:600';
    const readout = el(doc, 'span', 'everyday-fixit-readout', row.readout);
    readout.style.cssText = MONO(12, C.terracotta);
    const priced = el(doc, 'span', undefined, row.priced);
    priced.style.cssText = `margin-left:auto;${MONO(10, C.label)}`;
    line.append(minus, plus, label, readout, priced);
    return line;
  }

  /**
   * § 10.3's parking select — issue **#422**.
   *
   * A `<select>` rather than the steppers' `+`/`−`, because the five strategies are not a ladder and
   * a stepper over them would imply an ordering the engine does not have. The options are
   * `fixitScreenModel.ts#fixitParkingRow`'s, which is where the strategy the case already runs is
   * dropped — offering it would be a press that writes the value the run already carries.
   */
  function parkingLine(entry: FixitCase, session: CaseSession, standing: string): HTMLElement {
    const row = fixitParkingRow(session.state, standing, parkingPriceUnits(scheduleNow()));
    const line = el(doc, 'div', 'everyday-fixit-parking');
    line.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap';
    const select = el(doc, 'select', 'everyday-fixit-parking-select') as HTMLSelectElement;
    select.setAttribute('aria-label', row.label);
    select.disabled = running;
    select.style.cssText = [
      `border:1px solid ${C.rule}`,
      `border-radius:${String(R.control)}px`,
      `background:${C.paper}`,
      `color:${C.ink}`,
      'font-size:12.5px',
      'padding:3px 6px',
      `cursor:${running ? 'not-allowed' : 'pointer'}`,
    ].join(';');
    for (const option of row.options) {
      const node = doc.createElement('option');
      node.value = option.value ?? '';
      node.textContent = option.label;
      node.selected = option.selected;
      select.append(node);
    }
    select.addEventListener('change', () => {
      if (running) return;
      const picked = select.value === '' ? null : (select.value as EditorParkingStrategy);
      const parked = setParkingStrategy(entry, session.state, picked, scheduleNow());
      /* A dial this strategy's gate no longer admits leaves the order with it — § D1000. */
      session.state = loaded === undefined ? parked : withPrunedDials(entry, parked, loaded.resources);
      everydayTelemetry().record({ name: 'change_made', controlKey: 'fixit-parking', screenKey: 'fixit' });
      render();
    });
    const label = el(doc, 'span', undefined, row.label);
    label.style.cssText = 'font-size:13px;font-weight:600';
    const priced = el(doc, 'span', undefined, row.priced);
    priced.style.cssText = `margin-left:auto;${MONO(10, C.label)}`;
    line.append(select, label, priced);
    return line;
  }

  /**
   * § 10.3's elevation stepper — issue **#422**, `zoneLine`'s own shape pointed at
   * `fixitScreenModel.ts#fixitElevationRow`'s words: the `+` button's `title` is the row's own
   * refusal, never a restated constant, for `docs/20` defect 8's reason.
   */
  function elevationLine(
    entry: FixitCase,
    session: CaseSession,
    row: FixitElevationRow,
    ceiling: number,
  ): HTMLElement {
    const line = el(doc, 'div', 'everyday-fixit-stepper everyday-fixit-stepper-elevation');
    line.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap';
    const minus = el(doc, 'button', 'everyday-fixit-step-down', '−');
    const plus = el(doc, 'button', 'everyday-fixit-step-up', '+');
    for (const [button, enabled, label, why] of [
      [minus, row.canStepDown, COPY.stepDown, COPY.nothingToReturn],
      [plus, row.stepUpRefusal === undefined, COPY.stepUp, row.stepUpRefusal ?? ''],
    ] as const) {
      button.type = 'button';
      button.setAttribute('aria-label', `${row.label} — ${label}`);
      button.disabled = !enabled;
      if (!enabled && why !== '') button.title = why;
      button.style.cssText = [
        'width:26px',
        'height:24px',
        'padding:0',
        `border:1px solid ${C.rule}`,
        `border-radius:${String(R.control)}px`,
        `background:${C.paper}`,
        `color:${enabled ? C.ink : C.faint}`,
        `cursor:${enabled ? 'pointer' : 'not-allowed'}`,
        'font-size:14px',
        'line-height:1',
      ].join(';');
    }
    for (const [button, delta] of [
      [minus, -1],
      [plus, 1],
    ] as const) {
      button.addEventListener('click', () => {
        if (running) return;
        session.state = stepTopFloorRaise(entry, session.state, delta, ceiling, scheduleNow());
        everydayTelemetry().record({ name: 'change_made', controlKey: 'fixit-elevation', screenKey: 'fixit' });
        render();
      });
    }
    const label = el(doc, 'span', undefined, row.label);
    label.style.cssText = 'font-size:13px;font-weight:600';
    const readout = el(doc, 'span', 'everyday-fixit-readout', row.readout);
    readout.style.cssText = MONO(12, C.terracotta);
    const priced = el(doc, 'span', undefined, row.priced);
    priced.style.cssText = `margin-left:auto;${MONO(10, C.label)}`;
    line.append(minus, plus, label, readout, priced);
    return line;
  }

  /**
   * **The check as it runs** — [§ D1120](../../../../DECISIONS.md) clause 4: *N of 49 mornings in*,
   * one mark a morning as it lands, and a line saying the order stays editable. No running mean, no
   * running interval and no word like *holding*: each mark is a fact about one named morning, which
   * its title says, and nothing on it pools them. Updated in place by {@link paintProgress}, so an
   * open select is not torn down under the player's pointer forty-nine times.
   */
  function progressBlock(): HTMLElement {
    const block = el(doc, 'div', 'everyday-fixit-check-progress');
    block.style.cssText = 'margin-top:12px';
    fillProgress(block);
    return block;
  }

  function fillProgress(block: HTMLElement): void {
    const progress = checkProgress;
    block.replaceChildren();
    const counter = el(doc, 'div', 'everyday-fixit-check-count', progress === undefined ? '' : progressLineOf(progress));
    counter.style.cssText = `${MONO(12, C.ink)}`;
    const marks = el(doc, 'div', 'everyday-fixit-check-marks');
    marks.setAttribute('role', 'list');
    marks.style.cssText = 'display:flex;flex-wrap:wrap;gap:3px;margin-top:6px;max-width:60ch';
    for (const [index, mark] of (progress?.marks ?? []).entries()) {
      const cell = el(doc, 'span', `everyday-fixit-check-mark everyday-fixit-check-mark-${mark ?? 'pending'}`);
      cell.setAttribute('role', 'listitem');
      cell.title = markTitleOf(index, mark);
      cell.setAttribute('aria-label', cell.title);
      cell.style.cssText = `width:9px;height:9px;border-radius:2px;display:inline-block;${markStyleOf(mark)}`;
      marks.append(cell);
    }
    const editable = el(doc, 'p', 'everyday-fixit-check-editable', COPY.checkingEditable);
    editable.style.cssText = `font-size:12px;line-height:1.5;color:${C.warmGrey};margin:6px 0 0`;
    block.append(counter, marks, editable);
  }

  function markStyleOf(mark: MorningMark | undefined): string {
    if (mark === 'lower') return `background:${C.moss}`;
    if (mark === 'higher') return `background:${C.alarm}`;
    if (mark === 'same') return `background:${C.warmGrey}`;
    if (mark === 'unread') return `border:1px dashed ${C.warmGrey}`;
    return `border:1px solid ${C.ruleMid}`;
  }

  /** The progress block of the mount that is live, repainted where it stands — never a full redraw. */
  paintProgress = (): void => {
    const block = live?.root.querySelector<HTMLElement>('.everyday-fixit-check-progress');
    if (block !== null && block !== undefined) fillProgress(block);
  };

  /** § 10.4's result card — head, body, the three measured rows, the basis line. All engine. */
  function outcomeCard(outcome: FixitOutcome): HTMLElement {
    const passed = outcome.kind === 'fixed';
    const card = el(doc, 'div', 'everyday-fixit-outcome');
    card.style.cssText = [
      'margin-top:18px',
      `border:1px solid ${passed ? PROTO.passedEdge : C.amberEdge}`,
      'border-radius:13px',
      `background:${passed ? PROTO.passedWash : C.amberWash}`,
      'padding:16px 18px',
      'max-width:80ch',
    ].join(';');
    const head = el(doc, 'div', 'everyday-fixit-outcome-head', outcome.head);
    head.style.cssText = `font:600 19px ${TYPE.heading}`;
    const body = el(doc, 'p', undefined, outcome.body);
    body.style.cssText = `font-size:14px;line-height:1.55;color:${C.inkSoft};margin:6px 0 0`;
    card.append(head, body);

    const rows = el(doc, 'div');
    rows.style.cssText = 'display:grid;gap:10px;margin-top:14px';
    for (const row of outcome.rows) {
      const block = el(doc, 'div', 'everyday-fixit-outcome-row');
      const top = el(doc, 'div');
      top.style.cssText = 'display:flex;align-items:baseline;gap:9px;flex-wrap:wrap';
      const label = el(doc, 'span', undefined, row.label);
      label.style.cssText = 'font-size:13px;font-weight:600;min-width:0';
      const verdict = el(doc, 'span', undefined, row.passed ? 'holds' : 'does not hold');
      verdict.style.cssText = `${MONO(11.5, row.passed ? C.moss : C.alarm)};flex:none`;
      top.append(label, verdict);
      const detail = el(doc, 'div', undefined, `${row.before} → ${row.after} · ${row.verdict}`);
      detail.style.cssText = `font-size:12px;line-height:1.5;color:${C.warmGrey};margin-top:3px`;
      block.append(top, detail);
      rows.append(block);
    }
    card.append(rows);

    const basis = el(doc, 'p', undefined, outcome.basis);
    basis.style.cssText = `font-size:12.5px;line-height:1.5;color:${C.warmGrey};margin:12px 0 0`;
    card.append(basis);
    return card;
  }

  /* ---- the § 3.3 primary, forwarded by the shell through the handle ---- */

  function primary(): void {
    if (running || loaded === undefined) return;
    /* A check on the order on screen is not interrupted by its own press — the bar draws it inert. */
    if (checking && !supersedesNow()) return;
    /* Bound here rather than read inside the callback: the run's resources are the ones the press
     * was made against, and a narrowed local is also what makes the callback body total. */
    const resources = loaded.resources;
    /*
     * The host, bound here for the resources' reason — GitHub issue #499. The run can land after this
     * mount is gone, and the host is the shell's, so it outlives every mount that could ask.
     */
    const scenarioHost = context.host;
    const entry = currentEntry();
    if (entry === undefined) return;
    const session = sessionOf(entry);

    if (settledNow(session)) {
      /*
       * `Next building` — the prototype's advance: the next case, wrapping. Only while the order on
       * screen is the one the FIXED verdict measured; an edit gives the Run press back (§ D1011).
       */
      const cases = loaded.cases.cases;
      const index = cases.findIndex((candidate) => candidate.id === entry.id);
      selectedId = cases[(index + 1) % cases.length]?.id;
      render();
      context.refreshBar();
      return;
    }

    /*
     * The pair, on a worker — GitHub issue #165. `running` is what the § 3.3 bar reads, and it is
     * set before the ask so the relabel is drawn by the very next `refreshBar` rather than after a
     * deferred task. There is nothing left to defer past: the click handler returns immediately
     * and the thread is free while the worker runs. The `afterPaint` wrapper that used to stand
     * here — a `requestAnimationFrame` around a `setTimeout`, whose whole subject was getting the
     * relabel painted before a blocking task — went with the block it was working around.
     *
     * The spend is bound here for the same reason the resources are: the outcome is classified
     * against the state the press was made in, never one the player edited while it ran.
     */
    /*
     * An order the loader or core would refuse — a rezone that leaves a bank with no car, § D1000 —
     * is said where the reader is and never thrown from a click. The families card already draws
     * the same sentence above the controls that could put it right.
     */
    if (fixitPlanRefusalOf(entry, session.state, resources) !== undefined) {
      runFailure = COPY.planRefused;
      render();
      return;
    }
    /*
     * The order the verdict will be measured on, bound here for the spend's reason: the outcome is
     * classified against the order the press was made with, and it is kept as
     * {@link CaseSession.verdictState} so an edit made while the pair ran is drawn as stale the moment
     * the verdict lands rather than silently adopted by it (§ D1011).
     */
    const pressed = session.state;
    const schedule = scheduleNow();
    const plan = fixitRunPlanOf(entry, pressed, resources);
    const spend = spendOf(entry, pressed, schedule);
    /*
     * **A press made while the last order is still being checked stops that check** — § D1120 clause
     * 4, the latest ask wins. The stopped check has no verdict and says so, with the count it reached;
     * the card it was drawing goes, because it described an order that is no longer being judged.
     */
    if (checking) {
      judge.cancel();
      session.stoppedLine = checkStoppedLineOf(checkProgress?.landed ?? 0, checkProgress?.planned ?? 0);
      session.outcome = undefined;
      checking = false;
      checkingCaseId = undefined;
      checkProgress = undefined;
    }
    ask = `${entry.id}:press`;
    runFailure = undefined;
    running = true;
    context.refreshBar();
    render();
    /*
     * The press goes through the judge — [§ D1020](../../../../DECISIONS.md). One pair, classified
     * exactly as before; a gate that clears draws the `checking` state at once and asks for the
     * forty-nine after-runs, and only the fifty-morning verdict may badge the case or bank a clear.
     * `running` stays up through the checking, so the rail and the controls hold still under a
     * verdict that is about to land on the order they show.
     */
    const landed = (outcome: FixitOutcome): void => {
      session.outcome = outcome;
      // The order this verdict is about, so an edit after it is drawn as stale (§ D1011).
      session.verdictState = pressed;
      /*
       * The FIXED badge follows the **latest** verdict, in both directions — never a high-water
       * mark. `docs/20` defect 16 is the argument: the Engineer panel latched on the first fixed
       * outcome and nothing cleared it, so a case stayed badged FIXED beside an outcome card reading
       * *"9 waits → 9 waits · 0 % of it went away"* — two verdicts about one case on one screen.
       * The badge, the § 3.3 primary and the outcome card all read this one verdict.
       *
       * The rule itself lives in `fixit/engine.ts#fixedBadgeAfter`, which both this screen and the
       * Engineer panel consume, so the two surfaces cannot come to disagree about what FIXED means.
       * Only a fifty-morning `fixed` wears it; `checking` and `cleared-once` do not.
       */
      session.fixed = fixedBadgeAfter(outcome);
      // In both directions — see `keepSolved`. A case that has just stopped being FIXED stops
      // being kept, or a reload would restore a badge this run has already taken away.
      keepSolved();
      /*
       * **And the ledger hears about a case this verdict fixed** — GitHub issue #499. A fix case is
       * Scenario content (`docs/38` § 2.1, § D525), and the badge is the clear being filed:
       * `keepSolved` wrote it one line up. A verdict that did not fix the case — `cleared-once`
       * included — files no clear and posts nothing, and the server pays a scenario once per
       * account however often one case is fixed again. Nothing is awaited, on
       * `host.ts#closeDay`'s ground.
       *
       * **The second half of that sentence used to read *"nothing is drawn"*, and it was the
       * whole of the defect** ([§ D673](../../../../DECISIONS.md)): a player could clear all
       * eighteen cases and never learn a currency existed, because the only surface drawing a
       * balance was Settings. Something is drawn now, and **it is not drawn here** — the
       * acknowledgement lands on the rail's `PLAYING AS` card, as `docs/32` § 3.4's tally of
       * completed turns, and `docs/32` GD13 clause 2's *never on a results page* is why this
       * screen is still the wrong place for it. `everyday/rail.ts#bankedLineOf` carries the
       * argument; this call answers nothing to this closure.
       */
      if (session.fixed) scenarioHost.bankScenarioClear(entry.id);
    };
    pressThroughTheJudge({
      entry,
      plan,
      switches: FIXIT_RUN_SWITCHES,
      pairRunner: runner,
      judge,
      /*
       * The gate's classification, and the seam § D1011's witness run lives in — the judge takes
       * `classify` as a continuation precisely so a verdict that needs one more run can take it
       * before answering.
       */
      classify: (before, after, done) => {
        // GitHub issue #350: the claim the basis line will make, checked on the legs first.
        assertPairMatchesRepairs(entry, pressed, before, after);
        const measurement = measuredOf(entry, before, after);
        const answer = (witnessRun: boolean): void => {
          done(
            classifyOutcome(
              entry,
              measurement,
              spend,
              fixitVerdictContextOf({
                entry,
                state: pressed,
                inputs: editorInputsOf(entry, pressed, resources, schedule),
                schedule,
                witnessRun,
              }),
            ),
          );
        };
        /*
         * **Whose words the verdict may use** — [§ D1011](../../../../DECISIONS.md). The authored
         * result is a sentence about the diagnosed repair's run, so it is printed only over a run
         * that is that run, leg for leg. The diagnosed run is asked for **only once a press has
         * cleared both bars** — a pair that did not clear takes no authored words whatever it is,
         * so the question is never asked of it, and the witness can say nothing before a solve
         * ([§ D869](../../../../DECISIONS.md)). A press of the diagnosed repair alone *is* the
         * witness's run by construction, so it is kept rather than simulated twice. A witness that
         * could not be run leaves the verdict composed from the order, which is true of every run:
         * the authored words need evidence, and a failure is not evidence. The witness is asked
         * before the mornings, so the `checking` and `cleared-once` states carry the same
         * attribution the fifty-morning verdict will.
         */
        if (classifyOutcome(entry, measurement, spend).kind !== 'fixed') {
          answer(false);
          return;
        }
        if (sameOrder(pressed, witnessStateOf(entry))) session.witness ??= after;
        if (session.witness !== undefined) {
          answer(sameLegs(after, session.witness));
          return;
        }
        runner.start({
          runs: [{ config: fixitRunPlanOf(entry, witnessStateOf(entry), resources).asRepaired, ...FIXIT_RUN_SWITCHES }],
          onDone: ([witness]) => {
            if (witness === undefined) {
              answer(false);
              return;
            }
            session.witness = witness;
            answer(sameLegs(after, witness));
          },
          onFailed: () => {
            answer(false);
          },
        });
      },
      onGate: (outcome, before, after) => {
        ask = undefined;
        session.asBuilt = before;
        /*
         * **And the repaired run is kept** — [§ D644](../../../../DECISIONS.md). The pair block plays
         * it beside `before` at one playhead. A previous run's block is disposed and its watched flag
         * cleared in the same statement, so the pair on screen is always the pair the card under it
         * was measured from.
         */
        session.asRepaired = after;
        session.pairStage?.dispose();
        session.pairStage = undefined;
        session.pairSeen = false;
        checking = outcome.kind === 'checking';
        /* The pair is in: the controls come back even while the mornings run — § D1120 clause 4. */
        running = false;
        checkingCaseId = checking ? entry.id : undefined;
        checkProgress = undefined;
        if (!checking) session.stoppedLine = undefined;
        landed(outcome);
        // Through `live`, never through this mount: the player may have left and come back, and
        // the screen that must draw this outcome is the one on the page now.
        live?.redraw();
        live?.refreshBar();
        /*
         * The sight, not the card — `docs/38` § 1's *watching is the point*. The pair block is what
         * the redraw above has just built, so it is what a landed run scrolls to; the card is the
         * next thing under it and the block's own press goes there. Falls back to the card, because
         * a run whose pair block did not mount must still land the player on its verdict.
         */
        const landOn =
          live?.root.querySelector('.everyday-fixit-pair') ??
          live?.root.querySelector('.everyday-fixit-outcome');
        landOn?.scrollIntoView({ block: 'nearest' });
      },
      onProgress: (progress) => {
        checkProgress = progress;
        paintProgress();
      },
      onVerdict: (outcome) => {
        checking = false;
        running = false;
        checkingCaseId = undefined;
        checkProgress = undefined;
        session.stoppedLine = undefined;
        landed(outcome);
        live?.redraw();
        live?.refreshBar();
      },
      onFailed: (message) => {
        ask = undefined;
        running = false;
        checking = false;
        checkingCaseId = undefined;
        checkProgress = undefined;
        runFailure = message;
        live?.redraw();
        live?.refreshBar();
      },
    });
  }

  if (loaded === undefined && loadFailure === undefined) {
    render(); // the loading line
    void ensureLoaded().then(() => {
      if (!alive) return;
      selectFirstUnsolved();
      render();
      context.refreshBar();
    });
  } else {
    selectFirstUnsolved();
    render();
    context.refreshBar();
  }

  return {
    unmount: () => {
      alive = false;
      /*
       * Cleared only if this mount is still the live one. A shell that mounted the replacement
       * before unmounting the outgoing screen would otherwise have the old mount's teardown
       * delete the new mount's registration, and a landed run would draw nowhere — the same
       * defect one layer up.
       */
      if (live?.root === root) live = undefined;
    },
    primary,
  };
}

/**
 * The § 3.3 refinement — pure over the module store, worded by
 * `fixitScreenModel.ts#fixitBarModel`. The shell calls it on every bar draw, and the screen asks
 * for a redraw (`refreshBar`) whenever a press changes one of the four flags.
 */
function fixitBar(state: EverydayState): ActionBarModel {
  // The shell draws the bar independently of the mount, so this reader seeds the set too — a
  // restored FIXED case must reach § 3.3's `Next building` on the first draw, not the second.
  ensureRestored();
  const base = actionBarFor(state);
  const entry = currentEntry();
  const session = entry === undefined ? undefined : sessions.get(entry.id);
  const supersedes = supersedesNow();
  return fixitBarModel(base, {
    ready: entry !== undefined,
    /* A check on the order on screen holds the press; one on an order since edited gives it back. */
    running: running || (checking && !supersedes),
    checking: checking && !supersedes,
    supersedes,
    ran: session?.outcome !== undefined || session?.stoppedLine !== undefined,
    /* Settled for the order on screen, not merely FIXED once — § D1011. */
    solved: session !== undefined && settledNow(session),
  });
}

/** The registry row — GAMEPLAY § 10's screen, mounted by `shell.ts` through `screens.ts`. */
export const FIXIT_SCREEN: EverydayScreenModule = {
  key: 'fixit',
  mount: mountFixit,
  bar: fixitBar,
};
