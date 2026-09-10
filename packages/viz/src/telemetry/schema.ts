/**
 * **The events this client may emit** — GitHub issue #340, and the viewer's half of
 * `docs/26-telemetry-and-privacy.md` § 7.
 *
 * There are two halves to this schema and both exist on purpose. `packages/server/src/telemetry/`
 * bounds what may be *stored*; this bounds what may be *sent*, and it does it with types rather
 * than with a validator, so an emitter that composes a bad event does not compile. The two are
 * checked against one another by `schema.test.ts`, which reads the server's source — the same
 * mechanism `menu/client.test.ts` already uses to keep the wire's two ends honest.
 *
 * ## P-5, and why almost nothing here is authored
 *
 * *"The client records; it never judges."* Every classification an event carries is read from the
 * shipped surface's own classification, not recomputed — so every vocabulary below is **derived
 * from a type the product already declares**, with a compile-time check in both directions:
 *
 * | Vocabulary | Declared by |
 * |---|---|
 * | `screenKey`, `entryScreenKey`, `fromScreenKey` | `everyday/types.ts#EVERYDAY_SCREENS` |
 * | `verdictKind` | `shift/types.ts#DayReport.verdict` and `batch/report.ts#BatchVerdict` |
 * | `refusalKind` | `shift/types.ts#FigureTone` and `render/runSummary.ts#SummaryFigureKind` |
 * | `refusalGround` | `core`'s `AWT_INVALID_GROUNDS` |
 * | `run` | `menu/client.ts#RunSubmission` — the wire's own run pointer, § 2.1 |
 *
 * `Exhaustive` is how *derived* is made to mean something: each tuple below is checked against its
 * source union in **both** directions at compile time, so a value added to `FigureTone` or a screen
 * added to `EVERYDAY_SCREENS` fails `tsc` here until somebody decides what it means. The tuples
 * are also read at run time — `recorder.ts#outOfVocabulary` — so they are not type scaffolding.
 *
 * **`controlKey` is the exception and it is declared here**, because there is no control registry
 * in the tree to derive one from — `docs/26` § 7.4 says one is owed with M2's controls. What is
 * declared is a registry of control **kinds** rather than of individual controls, and
 * {@link CONTROL_KEYS}' own note says what that costs.
 *
 * ## What this module may not do
 *
 * It is **pure**: no DOM, no `localStorage`, no clock, no `fetch`, no timer. `boundaries.test.ts`
 * enforces the clock and the timers over the whole package; `everyday/telemetryPort.ts` is the DOM
 * half and is a declared shell-tier file. And nothing here imports `packages/core` in a way that
 * could run inside a simulation — § 10 non-goal 10, *no telemetry inside `packages/core/`*: the one
 * import from `core` is a frozen array of five strings.
 */

import { AWT_INVALID_GROUNDS, type AwtInvalidGround } from '@elevator-sim/core/browser';

import type { BatchVerdict } from '../batch/report.js';
import { EVERYDAY_SCREENS, type EverydayScreen } from '../everyday/types.js';
import type { RunSubmission } from '../menu/client.js';
import type { SummaryFigureKind } from '../render/runSummary.js';
import type { DayReport, FigureTone } from '../shift/types.js';

/* -------------------------------------------------------------------------- *
 * The both-directions compile-time check
 * -------------------------------------------------------------------------- */

/**
 * A tuple that is exactly a union — every member present, and nothing that is not a member.
 *
 * Both directions, which is the whole value. `readonly Member[]` alone would accept a tuple missing
 * half the union, and that is precisely the failure this repository keeps recording about
 * hand-written lists: correct on the day it is written and silent every day after. Here the second
 * clause makes the *union* exhaustive against the tuple, so a member added upstream is a type error
 * at this line rather than a value that quietly stops being collectable.
 *
 * A type rather than a runtime assertion because there is nothing to assert at runtime: the union
 * does not exist by then. `schema.test.ts` carries the runtime half against the server's copy.
 */
type Exhaustive<Union extends string, Tuple extends readonly Union[]> = [
  Exclude<Union, Tuple[number]>,
] extends [never]
  ? Tuple
  : never;

/* -------------------------------------------------------------------------- *
 * The constants § 7 fixes
 * -------------------------------------------------------------------------- */

/** § 7.1. The server refuses any other value rather than guessing at it. */
export const TELEMETRY_SCHEMA_VERSION = 1;

/** § 7.1's cap on one batch. Over it the client flushes rather than growing the array. */
export const MAX_EVENTS_PER_BATCH = 64;

/**
 * § 7.1's cap on what one **session** may queue before events are dropped.
 *
 * *"Over the batch cap for a session, events are dropped rather than queued — `FixedWindowLimiter`'s
 * fail-closed choice, applied to memory on the client."* Sixteen batches' worth, which is far more
 * than the ten-event first session § 7.5 draws and still a bound on a page that is left open.
 *
 * Dropping rather than queueing is the honest direction: § 9.2 already says a lost event can only
 * subtract from a KPI and never add to one, so the estimator degrades in the direction that makes a
 * gate harder to pass. An unbounded queue would trade that for a tab that grows.
 */
export const MAX_EVENTS_PER_SESSION = MAX_EVENTS_PER_BATCH * 16;

/** § 7.1's `atMs` resolution. The recorder rounds; the server refuses anything unrounded. */
export const AT_MS_RESOLUTION_MS = 100;

/** The bound the server puts on `atMs`. Past it the recorder stops rather than sending a refusal. */
export const MAX_SESSION_ELAPSED_MS = 24 * 60 * 60 * 1000;

/* -------------------------------------------------------------------------- *
 * The vocabularies — every one derived
 * -------------------------------------------------------------------------- */

/** `everyday/types.ts#EVERYDAY_SCREENS`, unchanged. A screen key is a screen the product has. */
export const SCREEN_KEYS: Exhaustive<EverydayScreen, typeof EVERYDAY_SCREENS> = EVERYDAY_SCREENS;

/**
 * `shift/types.ts#DayReport.verdict` — the verdict the daily loop's report screen draws.
 *
 * This is beat 5 of `docs/26 K2`'s chain, and it is **not** the vocabulary § 7.4 names. That
 * section says `BatchComparisonRow.verdict`, which is a real classification drawn on a different
 * screen; `packages/server/src/telemetry/schema.ts` carries the argument for accepting both.
 */
export const DAY_VERDICT_KINDS: Exhaustive<
  DayReport['verdict'],
  readonly ['cleared', 'missed', 'ungraded']
> = ['cleared', 'missed', 'ungraded'] as const;

/** `batch/report.ts#BatchVerdict` — the § 12 bench's comparison row, which § 7.4 names. */
export const BATCH_VERDICT_KINDS: Exhaustive<
  BatchVerdict,
  readonly ['resolved', 'under-budget', 'unresolved', 'shown', 'suppressed', 'unmeasured']
> = ['resolved', 'under-budget', 'unresolved', 'shown', 'suppressed', 'unmeasured'] as const;

/** Either shipped verdict classification. `screenKey` is what says which surface drew it. */
export type TelemetryVerdictKind = DayReport['verdict'] | BatchVerdict;

/** `shift/types.ts#FigureTone` — how the daily report classifies one of its own figures. */
export const FIGURE_TONES: Exhaustive<
  FigureTone,
  readonly ['plain', 'good', 'caution', 'hot', 'bad', 'withheld', 'unranked']
> = ['plain', 'good', 'caution', 'hot', 'bad', 'withheld', 'unranked'] as const;

/** `render/runSummary.ts#SummaryFigureKind` — the Engineer run summary's, which § 7.4 names. */
export const SUMMARY_FIGURE_KINDS: Exhaustive<
  SummaryFigureKind,
  readonly ['observation', 'estimate', 'suppressed', 'absent']
> = ['observation', 'estimate', 'suppressed', 'absent'] as const;

/**
 * Either shipped figure classification.
 *
 * **Three members are not refusals and the field takes them anyway** — `plain`, `observation` and
 * § D106's `unranked`, which is *may not be ranked* rather than *withheld*. Narrowing this to the
 * ones that read like refusals would be the client deciding what a refusal is, and P-5 gives that
 * decision to the surface that drew the figure.
 */
export type TelemetryRefusalKind = FigureTone | SummaryFigureKind;

/** `core`'s own table of the grounds on which a run refuses its mean. Imported, never listed. */
export const REFUSAL_GROUNDS: readonly AwtInvalidGround[] = AWT_INVALID_GROUNDS;

/** § 7.4's `endReason`. Three values, closed. */
export const END_REASONS = ['hidden', 'navigated', 'unknown'] as const;
export type TelemetryEndReason = (typeof END_REASONS)[number];

/**
 * § 7.4's `controlKey` — **a registry of control *kinds*, and the only vocabulary here that is
 * authored rather than derived.**
 *
 * § 7.4 says this is *"a declared control registry, owed by M2 with the controls themselves"*, and
 * that registry does not exist in the tree: the fix-it screen's controls carry a case id, a
 * repair id, an extra id and a stepper key, and no module collects them. So this is the narrower
 * thing that can be honest today — the **kind** of control the player moved, one entry per press
 * the shipped screen actually offers.
 *
 * **What that costs, stated rather than left to be discovered.** The schema cannot answer *which
 * repair* a player bought, only *that they bought one*. § 2.3 already refuses `controlValueBefore`
 * and `controlValueAfter` on exactly this ground — where the changed control is part of a run
 * pointer, the next run's pointer carries the new value; where it is not, no KPI in § 6 reads it —
 * and `docs/26 K2` asks only whether beat 3 happened.
 *
 * **The half of § 7.4 that does still bind**: *"A control that changes a run and is not in the
 * registry is a finding, not a silent omission."* `telemetry/schema.test.ts` holds that as far as a
 * test can — every key here is emitted by a shipped press, and every emitter uses a key from here.
 */
export const CONTROL_KEYS = [
  /** The fix-it screen's case picker — choosing which building to work on. */
  'fixit-case',
  /** A repair bought or sold back. */
  'fixit-repair',
  /** An extra bought or sold back. */
  'fixit-extra',
  /** The lift-speed stepper. */
  'fixit-speed',
  /** The car-capacity stepper. */
  'fixit-capacity',
] as const;
export type TelemetryControlKey = (typeof CONTROL_KEYS)[number];

/* -------------------------------------------------------------------------- *
 * The events — § 7.2 and § 7.3
 * -------------------------------------------------------------------------- */

/** The two fields every event carries. `atMs` is filled by the recorder, never by an emitter. */
interface EventBase {
  /** Session-elapsed milliseconds, rounded to {@link AT_MS_RESOLUTION_MS}. Never a wall clock. */
  readonly atMs: number;
}

/** § 7.2 E1. Denominator of every KPI in § 6. */
export interface SessionStartEvent extends EventBase {
  readonly name: 'session_start';
  readonly entryScreenKey: EverydayScreen;
}

/** § 7.2 E2, beat 1. */
export interface RunObservedEvent extends EventBase {
  readonly name: 'run_observed';
  readonly run: TelemetryRunPointer;
  readonly reachedEndedAt: boolean;
}

/** § 7.2 E3 — `charter S1`, exactly. Two clocks, and both are needed. */
export interface TroubleVisibleEvent extends EventBase {
  readonly name: 'trouble_visible';
  readonly run: TelemetryRunPointer;
  /** Where in the *simulated* day it happened. `atMs` is the player's ninety seconds. */
  readonly atRunS: number;
}

/** § 7.2 E4, beat 3. */
export interface ChangeMadeEvent extends EventBase {
  readonly name: 'change_made';
  readonly controlKey: TelemetryControlKey;
  readonly screenKey: EverydayScreen;
}

/** § 7.2 E5, beat 4. `crowdHeld` is derived by the recorder and never asserted by a caller. */
export interface RerunSameCrowdEvent extends EventBase {
  readonly name: 'rerun_same_crowd';
  readonly run: TelemetryRunPointer;
  readonly crowdHeld: boolean;
}

/** § 7.2 E6, beat 5. `verdict_shown`, not `verdict_read` — see § 9.1. */
export interface VerdictShownEvent extends EventBase {
  readonly name: 'verdict_shown';
  readonly verdictKind: TelemetryVerdictKind;
  readonly refusalGround: AwtInvalidGround | null;
  readonly screenKey: EverydayScreen;
}

/** § 7.2 E7. Best-effort; `docs/26 K3` does **not** depend on it. */
export interface SessionEndEvent extends EventBase {
  readonly name: 'session_end';
  readonly endReason: TelemetryEndReason;
}

/** § 7.3 E8 — the beat-drop profile. */
export interface ScreenEnteredEvent extends EventBase {
  readonly name: 'screen_entered';
  readonly screenKey: EverydayScreen;
  readonly fromScreenKey: EverydayScreen | null;
}

/** § 7.3 E9 — refusal encounters. **Never** `charter S6`: it counts refusals drawn, not understood. */
export interface RefusalShownEvent extends EventBase {
  readonly name: 'refusal_shown';
  readonly refusalKind: TelemetryRefusalKind;
  readonly screenKey: EverydayScreen;
}

/** § 7.3 E10 — field cold load. **Never** `charter S9`, which is a CI budget that fails a build. */
export interface ColdLoadEvent extends EventBase {
  readonly name: 'cold_load';
  readonly msToInteractive: number;
}

/**
 * § 2.1's run pointer, which is `menu/client.ts#RunSubmission` **less its two Everyday spreads**.
 *
 * *"The pointer's type already exists and a second one may not be invented"* — so this is a
 * projection of that type rather than a new one, and `Omit` is what makes it a projection: a field
 * renamed on `RunSubmission` fails to compile here. `ruleRows` and `interventions` are dropped
 * because they are arrays of objects, they answer no question in § 6, and the server refuses them
 * (§ 2.3's rule: a field that answers no stated question does not ship).
 */
export type TelemetryRunPointer = Omit<RunSubmission, 'ruleRows' | 'interventions'>;

/**
 * Project a submission's run onto the pointer telemetry carries.
 *
 * **Field by field rather than by spreading and deleting**, and that is the whole reason this is a
 * function. `{ ...run }` minus two keys would carry any *third* field `RunSubmission` gains, on the
 * commit it gains it and with nobody deciding — which is § 2.3's rule inverted: a field that
 * answers no stated question does not ship, and the way to hold that is to name what does. A new
 * field on the submission is a compile error here only if it is required, so this listing is also
 * where a reader learns which seven are collected.
 */
export function telemetryRunPointerOf(run: RunSubmission): TelemetryRunPointer {
  return {
    buildingId: run.buildingId,
    dispatcherProfileId: run.dispatcherProfileId,
    demandTemplateId: run.demandTemplateId,
    arrivalRatePctPop5min: run.arrivalRatePctPop5min,
    durationS: run.durationS,
    windowStartS: run.windowStartS,
    seed: run.seed,
  };
}

/** Every event, as the discriminated union an emitter composes. */
export type TelemetryEvent =
  | SessionStartEvent
  | RunObservedEvent
  | TroubleVisibleEvent
  | ChangeMadeEvent
  | RerunSameCrowdEvent
  | VerdictShownEvent
  | SessionEndEvent
  | ScreenEnteredEvent
  | RefusalShownEvent
  | ColdLoadEvent;

export type TelemetryEventName = TelemetryEvent['name'];

/** An event as an emitter hands it over: everything but the clock, which the recorder owns. */
export type UnstampedEvent = {
  [Event in TelemetryEvent as Event['name']]: Omit<Event, 'atMs'>;
}[TelemetryEventName];

/**
 * § 7's table, in the table's own order — the allowlist, and both directions of it.
 *
 * The union above is what a compiler checks; this is what a *test* checks, because § 7.6's first
 * requirement is a claim about the world rather than about types: *"every event name the client can
 * emit is in § 7's table with a question and a KPI beside it; and every entry in the table has a
 * non-test emitter in shipped code."*
 */
export const TELEMETRY_EVENT_NAMES: Exhaustive<
  TelemetryEventName,
  readonly [
    'session_start',
    'run_observed',
    'trouble_visible',
    'change_made',
    'rerun_same_crowd',
    'verdict_shown',
    'session_end',
    'screen_entered',
    'refusal_shown',
    'cold_load',
  ]
> = [
  'session_start',
  'run_observed',
  'trouble_visible',
  'change_made',
  'rerun_same_crowd',
  'verdict_shown',
  'session_end',
  'screen_entered',
  'refusal_shown',
  'cold_load',
] as const;

/** § 7.1's envelope, as the recorder builds it. The identity is on the batch, never on an event. */
export interface TelemetryBatch {
  readonly schemaVersion: number;
  readonly buildId: string;
  readonly playerId: string;
  readonly sessionId: string;
  readonly events: readonly TelemetryEvent[];
}

/* -------------------------------------------------------------------------- *
 * What is emitted today, and what is not
 * -------------------------------------------------------------------------- */

/**
 * **Events this build declares and does not yet emit, each with what is blocking it.**
 *
 * § 7.6's first test has two directions and this constant is what keeps the second one honest. An
 * event in § 7's table with no shipped emitter is a dead seam — the defect `CLAUDE.md` opens with,
 * eleven times in code and twice in `data/` — and the only thing worse than one is one nobody has
 * written down. So the register is here, it is asserted **in both directions** by
 * `telemetry/schema.test.ts` (every name in it has no emitter; every name not in it has one), and
 * an entry leaves it on the commit that wires the event rather than on the commit somebody notices.
 *
 * **Empty is the goal and an empty table is a state that must keep being checked**, exactly as
 * `everyday/screens.ts#UNBUILT_REASONS` is: the constant and its test stay when the last row goes.
 */
export const UNEMITTED_EVENTS: Readonly<Partial<Record<TelemetryEventName, string>>> = Object.freeze(
  {
    rerun_same_crowd:
      'Beat 4 of the chain, and the blocker is a missing pointer rather than a missing press. ' +
      'The fix-it screen does offer that press — its primary reads “Run it again” once a case has ' +
      'run this session, and a second press after a repair toggle re-runs the same case with the ' +
      'crowd held. What is missing is a run pointer to attach: the shell answers one only for runs ' +
      'it simulated itself, and the fix-it pair runs on a worker outside that state, so an event ' +
      'here would carry no way to say which run it was about. It becomes emittable when that pair ' +
      'is reachable as a pointer. This reason was wrong once and the correction is worth keeping: ' +
      'it said no screen offers the press at all, which review refuted by reading the shipped ' +
      'action bar — and a register that names the wrong blocker sends the next reader to build ' +
      'something that already exists.',
  },
);
