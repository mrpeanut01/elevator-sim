/**
 * The generated parameter form, mounted — `docs/10-experience-layer-contract.md` § 11 **W4**'s
 * named non-test caller.
 *
 * This is the only file in W4 that touches the DOM, which is `src/boundaries.test.ts` rule 3, and
 * it is deliberately thin: it instantiates the {@link ControlNode} trees `controls/render.ts`
 * produces, routes three events back through `controls/controls.ts`, and draws whatever comes
 * back. Every decision about *what* a control is, whether it is live and whether an edit is
 * admissible is made in the pure half, where it can be asserted against a schema the product does
 * not ship.
 *
 * ## What this closes
 *
 * `DECISIONS.md` § D121 shipped `packages/experiments`' browser barrel and stated, in the file
 * itself: *"**This barrel has no non-test caller today**, and that is said plainly rather than
 * dressed up. It cannot have one: the consumer it exists for is W4."* Tracked as **C34**. This is
 * that consumer: `controls/controls.ts` imports `collectSearchSpace`, `isActive`, `readerFor`,
 * `activeParameters`, `activeWhenSatisfied`, `isActiveWhenRange`, `defaultCandidate` and
 * `parameterOf` from `@elevator-sim/experiments/browser`, and this file is what calls it from a
 * shipped path. Counted with the repository's own scanner, not asserted.
 *
 * ## The schema picker, and why it is not a list
 *
 * The form is pointed at a *source*, and the sources are **discovered**:
 * `discoverParameterSchemas()` returns every `*_PARAMETERS` export `core` declares, and each one
 * becomes an entry. No schema is named in this file. docs/10 § 9.2 wanted one generator serving
 * both U6 (`collectSearchSpace()`) and U7 (`TRAFFIC_PARAMETERS`); discovering the list gives all
 * ten and the day an eleventh is declared it appears here with no edit.
 *
 * **All ten collect, and four rows inside one of them still cannot be searched.** § D134 measured
 * two schemas refusing outright and drew the refusal rather than hiding the schema; T75 fixed what
 * each refusal was about, and they turned out to be different kinds of thing:
 *
 * - `SIM_PARAMETERS` was a **defect** — `sim.drainGraceS` and `sim.queueSampleCount` declared a
 *   `log` scale over a range starting at zero, which no sampler can draw from. Zero is a named
 *   mode in both, so the scale was wrong and the bound was right. Fixed in `core`; the schema
 *   collects whole.
 * - `TRAFFIC_PARAMETERS` was **not** a defect. `traffic.arrivalRatePctPop5min` and the three
 *   `traffic.directionalSplit.*` shares declare `default: null` on purpose — the *"only honest
 *   default"* docs/10 § 9.3 quotes approvingly, because any number named there is imposed on every
 *   profile in every building. Honest and unsearchable at the same time. So the form asks for
 *   `nullDefault: 'exclude'`: the other thirteen rows draw controls, and the four are drawn as
 *   named refusals beside them, in `collectSearchSpace`'s own words.
 *
 * The register is unchanged from § D134's: what cannot be searched is **said**, never dropped.
 * A surface that looks complete because the incomplete parts are invisible is this repository's
 * signature defect pointed at a schema. What moved is the granularity — one bad row used to take
 * sixteen good ones off the screen with it.
 *
 * ## What this form does to a run — the UI readiness audit's **B4**
 *
 * For most of its life: **nothing.** `mountParameterForm` returned a handle whose `candidate()` was
 * *"the only route from that form to a value"*, `dev/main.ts` discarded it, and
 * `grep '\.candidate()'` over `packages/viz/src` and `packages/cli/src` returned zero hits. The
 * audit counted the cost — **12 schemas, 130 declared rows, 114 live controls and 16 named
 * refusals** — and named the shape: a player sets `sim.patience.meanS` to 120, presses Run, and gets
 * the same day back byte for byte, under a status line that reads like a configurator. It was
 * declared honestly in `docs/10` § 11 and **in a document**, which is CLAUDE.md's *a stated refusal
 * is pinned by a run, never by another sentence* pointed at the wrong medium.
 *
 * Both halves are closed here, and they are different repairs:
 *
 * - **The screen says so.** {@link appliedNoteFor} draws one sentence per source, as the form's
 *   first child, naming the button and what pressing it will do.
 * - **One schema is genuinely wired.** {@link ParameterFormOptions.onCandidate} replaces the
 *   discarded getter, and `dev/main.ts` routes `PATIENCE_PARAMETERS` into `ViewerState.patience`.
 *   The getter is **deleted** rather than left beside it: a route nothing takes is what the audit
 *   found, and keeping it would be two answers to *how does a value leave this form*.
 *
 * The rest of the picker still binds nothing, and that is now a sentence a reader meets rather than
 * one they would have to go looking for.
 */

import {
  collectSearchSpace,
  discoverParameterSchemas,
} from '@elevator-sim/experiments/browser';
import type { ParameterValue, SearchSpace } from '@elevator-sim/experiments/browser';
import {
  CREDENTIAL_ASSIGNMENTS,
  DEMAND_LEVELS,
  INTERFLOOR_WEIGHTINGS,
} from '@elevator-sim/core/browser';
import type {
  CredentialAssignment,
  DemandLevel,
  DoorCrowdingConfig,
  InterfloorWeighting,
  PatienceConfig,
  SimulationDemandOptions,
} from '@elevator-sim/core/browser';

import {
  applyControlEdit,
  candidateOf,
  controlsFor,
  defaultValues,
  resetControl,
} from '../controls/controls.js';
import { renderControls, renderUnsearchable, valueAtSliderPosition } from '../controls/render.js';
import type { ControlNode } from '../controls/render.js';
import type { Control, ControlEdit, ControlValues } from '../controls/types.js';
import { glossaryFor } from '../mode/glossary.js';

/** The id the picker uses for the profile-authorable space, which is not one declared schema. */
const SEARCH_SPACE_SOURCE = '<dispatcher search space>';

/**
 * The discovered schemas the Run button reads — `core`'s own export names, which is what
 * `discoverParameterSchemas()` keys by.
 *
 * ## Why this is a set and was a string
 *
 * It was `APPLIED_SCHEMA = 'PATIENCE_PARAMETERS'`: one name, and eleven schemas drawn under
 * {@link appliedNoteFor}'s *NOT APPLIED* sentence. A panel assessment counted what that cost —
 * **49 of the engine's 117 declared tunables reached no run from any screen** — and named the
 * repair as one constant wide. It is wider than one constant, because each schema needs a decoder
 * and a field on `ViewerState` to land in, but the routing seam is the one `patience`
 * already proved: the mount publishes a candidate with its source's name, the shell matches on
 * this set, and `dev/state.ts#shiftRunConfigOf` puts the result on the config.
 *
 * Exported because **`dev/main.ts` decides what to do with each name and this file decides
 * nothing**. One set, read in both places, so the sentence {@link appliedNoteFor} prints and the
 * branch that applies it cannot disagree — which is the failure mode this whole tab was an
 * instance of, and which § D227 says is the more dangerous half: a control described as inert that
 * is live tells the reader not to touch something that works.
 *
 * **Four of the twelve, not twelve.** What keeps the other eight off this list is written down
 * rather than left to be inferred — see {@link appliedNoteFor}, which prints the reason per source,
 * and § D761–§ D764.
 */
export const APPLIED_SCHEMAS: readonly string[] = Object.freeze([
  'CROWDING_PARAMETERS',
  'PATIENCE_PARAMETERS',
  'SIM_PARAMETERS',
  'TRAFFIC_PARAMETERS',
]);

/** Whether a picker source is one the Run button reads. */
export function isAppliedSchema(sourceName: string): boolean {
  return APPLIED_SCHEMAS.includes(sourceName);
}

/**
 * The ids of one schema whose candidate value is **not** its declared default — the absent-key
 * discipline, expressed once and derived from the schema rather than from literals here.
 *
 * ## Why this exists at all
 *
 * `candidateOf` returns every *active* row, defaulted rows included, so a form nobody has touched
 * still produces a full map. Writing that map onto the config would turn every default into a
 * **pinned** value: `traffic.interfloorWeighting` would stop meaning *whatever the profile says*
 * and start meaning *population, because a screen the player never opened said so*. `core` is
 * explicit that the two are different claims — `traceConfigFor` spreads every one of these
 * fields or omits it, never `?? <a default of its own>` — and this is how the viewer inherits
 * that discipline instead of restating it.
 *
 * Compared against `discoverParameterSchemas()`' own `default`, which is the same array
 * {@link collectFormSource} builds the controls from. A literal table here would be a second
 * source of truth for a number `core` already states, and it would go stale silently, which is
 * the defect class this file is an instance of.
 *
 * `null` defaults are deliberately not special-cased: `collectFormSource` asks for
 * `nullDefault: 'exclude'`, so a row declaring one draws no control and cannot be in a candidate.
 */
export function movedFromDefault(
  sourceName: string,
  candidate: ReadonlyMap<string, ParameterValue>,
): ReadonlyMap<string, ParameterValue> {
  const rows = discoverParameterSchemas().get(sourceName);
  const moved = new Map<string, ParameterValue>();
  if (rows === undefined) return moved;
  const declared = new Map(rows.map((row) => [row.id, row.default as unknown]));
  for (const [id, value] of candidate) {
    if (!declared.has(id)) continue;
    if (Object.is(declared.get(id), value)) continue;
    moved.set(id, value);
  }
  return moved;
}

/**
 * What this schema does to the next run, in the reader's register — the audit's **B4**.
 *
 * ## Why a sentence per schema rather than one banner
 *
 * Because the true statement differs, and a banner that said *"nothing here is applied"* would be
 * wrong on the screens where it matters. Four of the twelve discovered schemas reach a run; eight
 * and the dispatcher space do not. Saying so per source is the difference between a disclaimer and
 * a fact — and, since § D227, the difference between a refusal that is pinned by a run and one
 * pinned by another sentence.
 *
 * **The four applied sources have four different sentences and the eight share one, and that
 * asymmetry is honest rather than lazy.** What an applied source owes the reader is *which of its
 * rows travel and which do not*, and that differs per schema; what an unapplied source owes is one
 * claim, *nothing here reaches the run*, which is the same claim for all eight. Two of the eight —
 * `METRICS_PARAMETERS` and `ANALYTICAL_PARAMETERS` — are refused on the charter rather than merely
 * unbuilt, and that argument is § D764's rather than this screen's, because it is a ruling about
 * what the product may ship and not a fact about today's wiring.
 *
 * ## Why the refusal says what the tab *is* rather than only what it is not
 *
 * A control that is drawn as live and binds nothing is unacceptable, and the honest repair is not
 * only *"this does nothing"* — it is *what is this, then*. These controls are the search space a
 * generic optimizer would be handed (CLAUDE.md invariant 8), rendered from the schemas `core`
 * declares; reading them tells you what is tunable and what each range is. That is a real thing to
 * be, and a reader who knows it will stop expecting the Run button to move.
 */
export function appliedNoteFor(sourceName: string): string {
  switch (sourceName) {
    case 'PATIENCE_PARAMETERS':
      return (
        'APPLIED — these four reach the next shift. What you set here is written onto the run as ' +
        'sim.patience, so riders give up and leave. Abandonment improves the average wait by ' +
        'construction, because it removes the longest waits from the sample: read the abandoned ' +
        'count beside the mean, never instead of it, and above 2 % the mean is suppressed ' +
        'outright. Press Run this shift to see it.'
      );
    case 'TRAFFIC_PARAMETERS':
      return (
        'APPLIED, in part — eight of these rows reach the next shift as the run’s demand options: ' +
        'the demand level, whether a group shares a destination, how an interfloor floor is ' +
        'picked, whether riders carry a credential, the leg ceiling, and the peak window, ' +
        'baseline and mix amplitude of whichever template is running. A row you have not moved ' +
        'writes nothing at all, so a default stays the profile’s rather than becoming this ' +
        'screen’s. Seven rows are NOT applied, in three groups, each refused for its own reason: ' +
        'the template and the ' +
        'three template durations are owned by the pattern and shift-length controls, and writing ' +
        'them here would be a second hand on one dial; the entrance weight is one number for ' +
        'however many entrances a building has, and relative weights that all move together ' +
        'normalize back to the mix they already were; and the two constant-template discards have ' +
        'no field on SimulationDemandOptions to travel in. The nineteen rows listed as not ' +
        'searchable draw no control here at all. Press Run this shift to see the rest.'
      );
    case 'CROWDING_PARAMETERS':
      return (
        'APPLIED — all three reach the next shift as sim.lobbyCrowding, the feedback loop behind ' +
        'real up-peak collapse: slow boarding lengthens the queue and a longer queue slows ' +
        'boarding. Leave all three where they are and the run carries no crowding block at all, ' +
        'which is what every figure this project has published was measured under; move any one ' +
        'and all three travel together, because core takes the term whole. It can destabilise a ' +
        'run that was stable — that is a finding to read off the saturation verdict, not a ' +
        'defect. Press Run this shift to see it.'
      );
    case 'SIM_PARAMETERS':
      return (
        'APPLIED — four of these six reach the next shift as the runner’s own tunables: the sky- ' +
        'lobby transfer walk, the re-offer interval for a call no car could take, the drain grace ' +
        'past the end of demand, and how often a door close is interrupted by the photo-eye. A ' +
        'row you have not moved writes nothing. Two are NOT applied, each for its own reason: the ' +
        'walk from a destination panel to its named car is gated off here because its activeWhen ' +
        'names two dispatcher rows this picker is not showing; and the queue sample count is the ' +
        'saturation detector’s own input, so moving it would change whether this run’s average is ' +
        'suppressed without changing a single leg of the run — a difficulty setting that moves a ' +
        'measurement, which this project does not ship. The first two can also be quiet on a ' +
        'building that has no sky lobby and no run that outlives its demand. Press Run this shift ' +
        'to see them.'
      );
    default:
      return (
        `NOT APPLIED — nothing the Run button does reads ${sourceName}. Move a control here, press ` +
        'Run this shift, and the day that comes back is byte for byte the day you would have got ' +
        'without touching it. What this is instead: the search space a generic optimizer would be ' +
        'handed — every tunable core declares, with its type, its range and the gates that decide ' +
        `when it is live. ${APPLIED_SCHEMAS.join(', ')} are the sources on this picker that do ` +
        'reach a run.'
      );
  }
}

/**
 * The demand options a `TRAFFIC_PARAMETERS` candidate describes, or `null` for *the profiles
 * decide everything*, which is what every run this repository has published was measured under.
 *
 * ## Eight ids, and the other twenty-six named rather than dropped
 *
 * Three groups, and the reason differs by group, which is why {@link appliedNoteFor} prints them
 * rather than a count:
 *
 * 1. **Nineteen rows declare `default: null`** and {@link collectFormSource} asks for
 *    `nullDefault: 'exclude'`, so they draw no control and cannot appear in a candidate at all.
 *    These are the ones a player would most want — body mass, day-to-day variation, the group-size
 *    curve, the duty shares, the directional split. Routing cannot reach them because there is
 *    nothing to route: the repair is a control, not a wire. Recorded as a finding rather than
 *    fixed here (§ D765).
 * 2. **Four rows have another shipped writer.** `traffic.template` is `config.demandTemplate`,
 *    which the pattern editor and Free Play's template select already own, and the three
 *    `*.durationS` rows are `config.durationS`, which the shift-length control owns. A second hand
 *    on one dial is how a screen comes to disagree with itself about what it set.
 * 3. **Three rows cannot travel.** `traffic.entranceWeight` is declared `perMemberOf
 *    'building.entranceFloors'` and collapses to one scalar in a building-free space; the weights
 *    are relative and normalized across entrances, so one number moving every entrance together
 *    is the mix it already was. `traffic.constant.discardFirstS` and `.discardLastS` have no field
 *    on `SimulationDemandOptions` for `traceConfigFor` to spread. Both are findings (§ D765).
 *
 * ## Spread-or-omit, per field
 *
 * {@link movedFromDefault} is what makes that true: a row at its declared default contributes no
 * key, so an untouched form returns `null` and the run is the run before this field existed.
 */
export function demandFromCandidate(
  candidate: ReadonlyMap<string, ParameterValue>,
): SimulationDemandOptions | null {
  const moved = movedFromDefault('TRAFFIC_PARAMETERS', candidate);
  if (moved.size === 0) return null;
  const demandLevel = oneOf(moved, 'traffic.demandLevel', DEMAND_LEVELS);
  const interfloorWeighting = oneOf(
    moved,
    'traffic.interfloorWeighting',
    INTERFLOOR_WEIGHTINGS,
  );
  const credentialAssignment = oneOf(
    moved,
    'traffic.credentialAssignment',
    CREDENTIAL_ASSIGNMENTS,
  );
  const batchSharesDestination = moved.get('traffic.batchSharesDestination');
  const maxLegs = numberIn(moved, 'traffic.maxLegs');
  const peakWindowS = numberIn(moved, 'traffic.riseAndFall.peakWindowS');
  const baselineFraction = numberIn(moved, 'traffic.riseAndFall.baselineFraction');
  const mixAmplitude = numberIn(moved, 'traffic.lunchTwoWay.mixAmplitude');
  const options: SimulationDemandOptions = {
    ...(demandLevel === undefined ? {} : { demandLevel: demandLevel as DemandLevel }),
    ...(typeof batchSharesDestination === 'boolean' ? { batchSharesDestination } : {}),
    ...(interfloorWeighting === undefined
      ? {}
      : { interfloorWeighting: interfloorWeighting as InterfloorWeighting }),
    ...(credentialAssignment === undefined
      ? {}
      : { credentialAssignment: credentialAssignment as CredentialAssignment }),
    ...(maxLegs === undefined ? {} : { maxLegs }),
    ...(peakWindowS === undefined ? {} : { peakWindowS }),
    ...(baselineFraction === undefined ? {} : { baselineFraction }),
    ...(mixAmplitude === undefined ? {} : { mixAmplitude }),
  };
  return Object.keys(options).length === 0 ? null : options;
}

/**
 * The lobby-crowding term a `CROWDING_PARAMETERS` candidate describes, or `null` for *a lobby's
 * size does not affect how fast it loads*.
 *
 * **All three or none, and that is `core`'s rule rather than a choice made here.**
 * `DoorCrowdingConfig` requires every field and `CROWDING_PARAMETERS`' own docstring says why the
 * block has no default: *"absent means no crowding at all, which is what keeps every published
 * stop length the number it already was. The defaults exist so a generic sampler has a floor to
 * start from, not so a run silently acquires one."* So the block is emitted whole the moment any
 * one row leaves its declared default, and not at all before — which is the same absent-key
 * discipline `patience` keeps, expressed over three fields instead of one.
 *
 * The untouched values travel with it rather than being substituted: each declared default is the
 * value that makes its own term inert, so a block built from two moved rows and one default is the
 * term the player asked for and nothing more.
 */
export function crowdingFromCandidate(
  candidate: ReadonlyMap<string, ParameterValue>,
): DoorCrowdingConfig | null {
  if (movedFromDefault('CROWDING_PARAMETERS', candidate).size === 0) return null;
  const thresholdPersons = numberIn(candidate, 'sim.lobbyCrowding.thresholdPersons');
  const factorPerPerson = numberIn(candidate, 'sim.lobbyCrowding.factorPerPerson');
  const maxFactor = numberIn(candidate, 'sim.lobbyCrowding.maxFactor');
  if (thresholdPersons === undefined || factorPerPerson === undefined || maxFactor === undefined) {
    return null;
  }
  // `resolveDoorConfig` refuses a ceiling below 1 — *"a crowded lobby that boards faster than an
  // empty one inverts the loop this exists to model"* — and the schema's range starts at 1, so no
  // control can produce one. This is the guard that keeps that true of a schema change rather than
  // of today's schema, which is `patienceFromCandidate`'s own argument one axis over.
  if (maxFactor < 1) return null;
  return { thresholdPersons, factorPerPerson, maxFactor };
}

/**
 * The four runner tunables a `SIM_PARAMETERS` candidate describes, or `null` for *the runner's own
 * defaults*.
 *
 * Spread-or-omit per field through {@link movedFromDefault}, for {@link demandFromCandidate}'s
 * reason: `SIM_DEFAULTS` is where these numbers live and a screen that pinned one would be a
 * second source of truth for it.
 *
 * **Four of the schema's six rows, and each of the two omissions is refused for its own reason.**
 *
 * `sim.assignedWalkS`'s `activeWhen` names `dispatch.passengerAssignment` and `dispatch.callType`,
 * which are `DISPATCH_PARAMETERS` rows and are not in this single-schema space, so the row is
 * drawn disabled and `candidateOf` omits it — the schema's own statement that the field is inert
 * here, which is exactly the statement `patienceFromCandidate` declines to override for `spreadS`.
 *
 * **`sim.queueSampleCount` is refused on the charter, and the refusal is measured rather than
 * argued** (§ D764). It is *"the direct input to saturation detection"*, and moving it moves
 * whether a run is declared saturated — which is whether its mean is suppressed — without moving
 * the run. Measured on five shipped buildings at 1 800 s, `queueSampleCount: 3` against the
 * default produces a **byte-identical set of legs on every one of them**. A control that changes
 * a verdict about a run and not the run is a difficulty setting that moves a measurement, which is
 * charter non-goal 6, and it is the same objection that keeps `METRICS_PARAMETERS` off
 * {@link APPLIED_SCHEMAS} entirely. The measurement is what distinguishes this from an oversight:
 * it is the one `SIM_PARAMETERS` row that cannot pass § D177 by construction rather than by
 * building.
 */
export interface RunnerTunables {
  readonly transferWalkS?: number | undefined;
  readonly dispatchRetryS?: number | undefined;
  readonly drainGraceS?: number | undefined;
  readonly doorObstructionProbability?: number | undefined;
}

/** See {@link RunnerTunables}. */
export function runnerTunablesFromCandidate(
  candidate: ReadonlyMap<string, ParameterValue>,
): RunnerTunables | null {
  const moved = movedFromDefault('SIM_PARAMETERS', candidate);
  if (moved.size === 0) return null;
  const transferWalkS = numberIn(moved, 'sim.transferWalkS');
  const dispatchRetryS = numberIn(moved, 'sim.dispatchRetryS');
  const drainGraceS = numberIn(moved, 'sim.drainGraceS');
  const doorObstructionProbability = numberIn(moved, 'sim.doorObstructionProbability');
  const tunables: RunnerTunables = {
    ...(transferWalkS === undefined ? {} : { transferWalkS }),
    ...(dispatchRetryS === undefined ? {} : { dispatchRetryS }),
    ...(drainGraceS === undefined ? {} : { drainGraceS }),
    ...(doorObstructionProbability === undefined ? {} : { doorObstructionProbability }),
  };
  return Object.keys(tunables).length === 0 ? null : tunables;
}

/** One candidate value, if it is one of a declared set. Never a cast over an arbitrary string. */
function oneOf(
  candidate: ReadonlyMap<string, ParameterValue>,
  id: string,
  allowed: readonly string[],
): string | undefined {
  const value = candidate.get(id);
  return typeof value === 'string' && allowed.includes(value) ? value : undefined;
}

/**
 * The patience curve a candidate describes, or `null` for *nobody leaves*.
 *
 * `null` rather than a default curve, and that is `core`'s own rule rather than a choice made here:
 * `sim/patience.ts` says an absent block means every run is byte-identical to one produced before
 * patience existed, and `sim.patience.distribution` declares `'none'` as its default for exactly
 * that reason. A default patience would put an unstated behaviour into every run in the product.
 *
 * The three numbers are read out of the candidate rather than defaulted here, because
 * `candidateOf` has already applied each row's `activeWhen`: under `exponential` there is no
 * `spreadS` in the map at all, which is the schema's own statement that the field is inert there.
 * Substituting a number for it would be this file inventing a value `core` refuses to read.
 */
export function patienceFromCandidate(
  candidate: ReadonlyMap<string, ParameterValue>,
): PatienceConfig | null {
  const distribution = candidate.get('sim.patience.distribution');
  if (distribution !== 'exponential' && distribution !== 'uniform') return null;
  const meanS = numberIn(candidate, 'sim.patience.meanS');
  // `requireValidPatience` throws on a non-positive mean — *"a mean patience of zero abandons every
  // rider at the instant they arrive and reports an AWT over nobody"*. The schema's range starts at
  // 1 so no control can produce one, and this is the guard that keeps that true of a schema change
  // rather than of today's schema.
  if (meanS === undefined || meanS <= 0) return null;
  const spreadS = numberIn(candidate, 'sim.patience.spreadS');
  const minS = numberIn(candidate, 'sim.patience.minS');
  return {
    distribution,
    meanS,
    ...(spreadS === undefined ? {} : { spreadS }),
    ...(minS === undefined ? {} : { minS }),
  };
}

function numberIn(
  candidate: ReadonlyMap<string, ParameterValue>,
  id: string,
): number | undefined {
  const value = candidate.get(id);
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export interface ParameterFormOptions {
  /** Where the controls are drawn. Emptied and refilled on every render. */
  readonly container: HTMLElement;
  /** Which schema the form is pointed at. Populated here from discovery. */
  readonly picker: HTMLSelectElement;
  /** One line: how many dimensions, how many live, and the authorability verdict. */
  readonly status: HTMLElement;
  /** Refusals, in the reader's register. `role="alert"` in the markup. */
  readonly refusal: HTMLElement;
  /**
   * The live point, whenever it moves — the seam the UI readiness audit's **B4** found missing.
   *
   * ## What was wrong
   *
   * This mount used to hand back a `ParameterFormHandle` whose `candidate()` was *"the only route
   * from that form to a value"*, `dev/main.ts` **discarded the handle**, and `grep '\.candidate()'`
   * over `packages/viz/src` and `packages/cli/src` returned **zero hits**. So 114 live controls
   * over 12 schemas drew, accepted edits, cascaded their gates, refused bad values and reported
   * *"41 dimensions, 41 live — authorable as a dispatcher profile"* — and a player could set
   * `sim.patience.meanS` to 120, press Run, and get the same day back byte for byte.
   *
   * A callback rather than a getter, because a getter is what was there: the difference between a
   * value that *can* be read and a value that *is* read is the whole of the standing requirement,
   * and the second one is harder to leave unwired by accident.
   *
   * ## It fires on every accepted edit and on every source change
   *
   * On the source change too, so what the receiver holds is always the point the picker is
   * currently showing rather than the last one it was told about — the two would drift the moment
   * a player moved the picker, and a stale value the screen has stopped displaying is exactly the
   * disagreement this seam existed to avoid.
   *
   * Called with the source's name, because **the receiver decides what is applied**. This file
   * knows what the controls hold; it does not know what a run reads.
   */
  readonly onCandidate?: ((sourceName: string, candidate: ReadonlyMap<string, ParameterValue>) => void) | undefined;
}

/** A schema that collected, or the reason it did not. Never a silently missing entry. */
export type Source =
  | { readonly ok: true; readonly space: SearchSpace }
  | { readonly ok: false; readonly reason: string };

/**
 * Point the form at one discovered schema, or at the dispatcher space.
 *
 * **Exported so the acceptance test calls the function the form calls.** `DECISIONS.md` § D159
 * names *a fixture routing the test past its subject* as one of five ways a test can fail to be
 * able to fail, and a test that rebuilt these options itself would be exactly that: it would go on
 * passing while the mount asked `collectSearchSpace` for something else entirely.
 */
export function collectFormSource(name: string): Source {
  try {
    // The dispatcher space keeps the shipped rule — `nullDefault` defaults to `'refuse'` — because
    // a *dispatcher* dimension with no origin is a defect and must not shrink the space quietly.
    if (name === SEARCH_SPACE_SOURCE) return { ok: true, space: collectSearchSpace() };
    const rows = discoverParameterSchemas().get(name);
    if (rows === undefined) return { ok: false, reason: `${name} is no longer declared.` };
    return {
      ok: true,
      space: collectSearchSpace({
        source: { [name]: rows },
        include: () => true,
        nullDefault: 'exclude',
      }),
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The one line under the picker: how many dimensions, how many live, how many cannot be searched,
 * and the authorability verdict.
 *
 * **Pure, and exported, because `space.unsearchable` has two readers** — this sentence and
 * `renderUnsearchable`'s list — and [`DECISIONS.md`](../../../../DECISIONS.md) § D154 records the
 * mutation that came back green for exactly that reason: *"that value has two independent readers
 * … and freezing one leaves the other live."* A count drawn in one place and not the other is a
 * form that says thirteen dimensions and lists four refusals, or the reverse, and nothing red.
 */
export function formStatusLine(
  space: SearchSpace,
  controls: readonly Control[],
  values: ControlValues,
): string {
  const live = controls.filter((control) => control.enabled).length;
  let verdict: string;
  try {
    const why = space.validate(candidateOf(space, values));
    verdict =
      why === undefined
        ? 'authorable as a dispatcher profile, and it has no dead gate'
        : `not authorable: ${why}`;
  } catch (error) {
    // `validate` decodes into a dispatcher profile, which is only a meaningful question for a
    // space whose ids are profile paths. For the other nine schemas the answer is legitimately
    // "no", and saying so is better than not asking.
    verdict = `not authorable: ${error instanceof Error ? error.message : String(error)}`;
  }
  const withheld =
    space.unsearchable.size === 0
      ? ''
      : `, ${String(space.unsearchable.size)} declared but not searchable`;
  return `${String(controls.length)} dimensions, ${String(live)} live${withheld} — ${verdict}. Authorability is a schema check: docs/10 § 8.2 says a profile that passes it is authorable and has no dead gate, not that it is sound.`;
}

/**
 * One {@link ControlNode} tree, instantiated. The only DOM construction in W4.
 *
 * **Exported** since W6: `dev/campaignPanel.ts` mounts the same controls, restricted to the
 * dimensions a stage declares editable, and a second `createElement` walk there would be a second
 * answer to *"what does a control look like in the DOM"* — the shape `campaign/stageRun.ts` was
 * extracted to avoid one layer down.
 */
export function instantiateControlNode(doc: Document, node: ControlNode): HTMLElement {
  const element = doc.createElement(node.tag);
  for (const [name, value] of Object.entries(node.attrs)) element.setAttribute(name, value);
  if (node.text !== undefined) element.textContent = node.text;
  for (const child of node.children) element.append(instantiateControlNode(doc, child));
  return element;
}

/**
 * Read one input back as the value its control declares.
 *
 * Keyed on the control's own `kind`, never on the element's type, so the two cannot disagree
 * about what a control holds. A slider reports a position and is converted through the
 * declaration's own scale; everything else reports its value directly.
 */
function valueFrom(control: Control, input: HTMLInputElement | HTMLSelectElement): ParameterValue {
  const role = input.dataset['role'];
  switch (control.kind) {
    case 'slider':
      return role === 'slider'
        ? valueAtSliderPosition(control, Number(input.value))
        : Number(input.value);
    case 'stepper':
      return Number(input.value);
    case 'checkbox':
      return (input as HTMLInputElement).checked;
    case 'select':
      return input.value;
  }
}

export function mountParameterForm(options: ParameterFormOptions): void {
  const { container, picker, status, refusal, onCandidate } = options;
  const doc = container.ownerDocument;

  for (const name of [SEARCH_SPACE_SOURCE, ...discoverParameterSchemas().keys()]) {
    picker.append(new Option(name, name));
  }

  let sourceName = picker.value;
  let source = collectFormSource(sourceName);
  /**
   * What each source was left holding, so the picker is a **view** and not a reset.
   *
   * It was one `values` map re-seeded from `defaultValues` on every picker change, which meant
   * looking at a second schema silently discarded whatever had been set on the first. That was
   * harmless while nothing read the form; it stops being harmless the moment a source is applied to
   * the run, because *the screen and the run must not disagree* — and a value the run still holds
   * while the control that set it has snapped back to its default is precisely that disagreement.
   */
  const valuesBySource = new Map<string, ControlValues>();

  function valuesFor(name: string, from: Source): ControlValues {
    const held = valuesBySource.get(name);
    if (held !== undefined) return held;
    const seeded: ControlValues = from.ok ? defaultValues(from.space) : new Map();
    valuesBySource.set(name, seeded);
    return seeded;
  }

  let values: ControlValues = valuesFor(sourceName, source);

  function say(reason: string): void {
    refusal.textContent = reason;
  }

  /** Tell the receiver what the picker is showing now. See {@link ParameterFormOptions.onCandidate}. */
  function publish(): void {
    if (onCandidate === undefined) return;
    onCandidate(sourceName, source.ok ? candidateOf(source.space, values) : new Map());
  }

  function draw(): void {
    container.replaceChildren();
    if (!source.ok) {
      status.textContent = `${sourceName} does not collect into a search space.`;
      const reason = doc.createElement('p');
      reason.className = 'control-inactive';
      reason.textContent = source.reason;
      container.append(reason);
      return;
    }

    const space = source.space;
    const controls = controlsFor(space, values);
    /*
     * **What this schema does to the next run, said above the controls it draws** — the audit's B4.
     *
     * First child of the form rather than a footnote, because it is the thing a reader has to know
     * before they touch anything, and because the tab's own status line reads like a configurator:
     * *"41 dimensions, 41 live — authorable as a dispatcher profile"* is a true sentence about a
     * search space and was being read as a claim about the Run button. `docs/10` § 11 declared the
     * gap honestly and declared it **in a document**, which is CLAUDE.md's *a stated refusal is
     * pinned by a run, never by another sentence* pointed at the wrong medium.
     */
    const applied = doc.createElement('p');
    applied.className = 'control-inactive';
    applied.textContent = appliedNoteFor(sourceName);
    container.append(applied);
    container.append(instantiateControlNode(doc, renderControls(controls)));
    const unsearchable = renderUnsearchable(space.unsearchable);
    if (unsearchable !== undefined) container.append(instantiateControlNode(doc, unsearchable));

    const line = formStatusLine(space, controls, values);
    status.textContent = line;
    /*
     * **The two terms nothing else defines** — GitHub issue #22, and this is the wiring that
     * matters most of the three.
     *
     * `formStatusLine` above and `controls/editedProfile.ts` are the *only* producers in the tree
     * of **dead gate** and **authorable**. `mode/glossary.ts` defines both and holds them to its
     * *attached to something real* clause, so neither can rot silently — but until this call they
     * were definitions no player could reach, which is the shape this repository counts.
     *
     * `glossaryFor` is called on the line this function just built rather than on a field, because
     * unlike the batch and campaign reports there is no report object here to carry one. It is pure
     * and it reads nothing but the string it is handed, so what comes back is exactly what this
     * sentence says — which is the same *derived, never listed* property the other two surfaces get
     * from their `glossary` fields, reached one step more directly.
     *
     * The status line itself is **untouched**: the definitions go in a block beneath it, and
     * `parameterForm.test.ts` asserts the sentence is byte-identical to what `formStatusLine`
     * returned. The plain language leads; it never replaces.
     */
    const terms = glossaryFor([line]);
    if (terms.length === 0) return;
    const list = doc.createElement('div');
    list.className = 'control-glossary';
    for (const entry of terms) {
      const item = doc.createElement('p');
      item.className = 'control-inactive';
      item.textContent = `${entry.term} — ${entry.plain}`;
      list.append(item);
    }
    container.append(list);
  }

  function apply(edit: ControlEdit): void {
    if (edit.accepted) {
      values = edit.values;
      valuesBySource.set(sourceName, values);
      say('');
      // Only on acceptance. A refused edit changed nothing, and telling the receiver about it would
      // make the run and the screen agree on a value neither of them is showing.
      publish();
    } else {
      say(edit.reason);
    }
    // Redraw either way: on acceptance a gate may have cascaded, and on refusal the input has to
    // go back to what the model says it holds rather than keeping the value that was refused.
    draw();
  }

  picker.addEventListener('change', () => {
    sourceName = picker.value;
    source = collectFormSource(sourceName);
    values = valuesFor(sourceName, source);
    say('');
    publish();
    draw();
  });

  container.addEventListener('change', (event) => {
    if (!source.ok) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) return;
    const id = target.dataset['parameter'];
    if (id === undefined) return;
    const control = controlsFor(source.space, values).find((candidate) => candidate.id === id);
    if (control === undefined) return;
    apply(applyControlEdit(source.space, values, id, valueFrom(control, target)));
  });

  container.addEventListener('click', (event) => {
    if (!source.ok) return;
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const id = target.dataset['reset'];
    if (id === undefined) return;
    apply(resetControl(source.space, values, id));
  });

  draw();
}
