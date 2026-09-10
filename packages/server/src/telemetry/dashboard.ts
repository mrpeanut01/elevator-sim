/**
 * **The KPI dashboard — R-1's route** (GitHub issue #250,
 * [`docs/26-telemetry-and-privacy.md`](../../../../docs/26-telemetry-and-privacy.md) § 20).
 *
 * PR #453 specified this dashboard and PR #468 built the instrument it reads. This module is the
 * thing itself: eight panels, a floor under every cell, and a figure that says `unmeasured` where
 * nobody has measured anything.
 *
 * ## It is the *route*, and that word is load-bearing
 *
 * § 20.3: *"The floor is enforced in the route and not in the reader (§ 18.2, R-1's bound). A cell
 * under it is **refused by name** … rather than being dropped, rounded, or quietly merged into its
 * neighbour. A dashboard that filters small cells in the client is one query away from a dashboard
 * that does not."*
 *
 * That is a structural claim here rather than a discipline. {@link RefusedCell} **has no numeric
 * field at all** — no value, no count, no interval — so the number behind a refused cell never
 * leaves this module and `dashboardRender.ts` could not publish it if it tried. A renderer that
 * wanted to un-suppress a cell would have to be handed one, and there is nothing to hand it.
 *
 * ## What it may not become — § 20.7, and three of the four are mechanical here
 *
 * 1. **No arbitrary date range.** {@link DashboardOptions} carries `nowMs` and nothing else: there
 *    is no `from`, no `to`, no window length. The grain is fixed and pre-declared in
 *    {@link DASHBOARD_PANELS}, which is what § 20.3 ground 2 rests on — a date picker is the one
 *    convenience that would defeat the floor. `dashboardSpec.test.ts` reads this file's own source
 *    and fails if that interface grows a second member.
 * 2. **No drill-through.** Nothing this module returns carries a `playerId`, a `sessionId` or a run
 *    pointer. That reader is R-2 and it is offline (§ 18.2).
 * 3. **No behavioural cohort.** The only axes are the ones § 20.2's grain column declares, and
 *    `dashboardSpec.test.ts` derives them from the document rather than from this file.
 * 4. **Nothing on it is ever shown to a player.** That one is not mechanical here; it is structural
 *    one level up. `packages/viz` does not depend on `@elevator-sim/server` and cannot, so no
 *    player-facing screen can import this module — asserted in `dashboardSpec.test.ts` against
 *    `packages/viz/package.json` rather than left as a promise. **This surface is therefore
 *    deliberately absent from the honesty corpus**: `packages/viz/src/honesty/surfaces.ts` sweeps
 *    player-facing strings, and a string on this dashboard is one no player can reach.
 *
 * ## The panel set is not free, and it is not transcribed either
 *
 * § 18.2 grants R-1 *"§ 6's four KPIs and § 6.3's diagnostics"* — eight panels, and *"a ninth needs
 * § 18.2 to move first"*. {@link DASHBOARD_PANELS} is that set, and `dashboardSpec.test.ts` derives
 * both halves from the sections that **own** the concepts and requires equality in both directions:
 * a fifth KPI in § 6.2 with no panel is red, and a panel reading something § 6 does not define is
 * red. That is the same shape `packages/experiments/src/validation/telemetryDashboard.test.ts`
 * already holds over the document; this extends it to the code.
 *
 * ## Four panels carry a target and four deliberately do not
 *
 * § 6.1: a KPI is a figure the team steers by and may be a gate; a diagnostic explains why a KPI
 * moved and **may not** be. So {@link PanelSpec.target} is `null` on P5–P8, and the asymmetry is
 * asserted rather than left to look like an oversight — a target column on the diagnostics *"would
 * turn four explanations into four gates, which is the single most likely way this dashboard does
 * damage"* (§ 20.2).
 *
 * ## Every baseline reads `unmeasured`
 *
 * § 20.4, and the reason moved on 2026-09-10 without the reading changing: the instrument exists,
 * it collects only from players who have said yes, and nobody has been recruited or measured. A
 * number here would be invented. {@link Baseline} has **one variant** and it is the refusal; there
 * is no `measured` arm, because an arm nothing can construct is the dead seam `CLAUDE.md` opens
 * with. § 20.4's protocol says how the first number is taken, and taking it is a change to this
 * file made on the day there is something to put in it.
 *
 * ## Three panels are refused whole, and each refusal is derived from the thing that causes it
 *
 * A panel that cannot be computed says so by name and draws nothing, which is the footing a
 * suppressed mean already sits on in this repository. **P1**, because `docs/26 K1`'s dwell constant
 * does not exist ({@link VISIBLE_TROUBLE_DWELL_MS}, § 11). **P2 and P5**, because `docs/26 K2`'s
 * chain carries a beat nothing emits ({@link CHAIN_BEATS_WITHOUT_EMITTER}), so the completion share
 * can only read 0 % — and a 0 % drawn under `charter S2`'s 60 % target is the *instrument's*
 * reading in the *product's* units. Neither refusal is a literal inside a panel: both are computed
 * from a constant that `dashboardSpec.test.ts` holds against the register or the document owning
 * it, in both directions. That is what stops a refusal outliving its cause, which § D227 records as
 * the more dangerous half of a stale sentence — a dead seam merely does nothing, while a stale
 * refusal tells a reader not to look at a panel that works.
 */

import { AWT_INVALID_GROUNDS } from '@elevator-sim/core';

import type { TelemetryEventRow } from '../store/store.js';

/* -------------------------------------------------------------------------- *
 * The constants § 20 fixes
 * -------------------------------------------------------------------------- */

/**
 * § 20.3's floor: **20 people**, and it counts distinct `playerId`s rather than events.
 *
 * *"A floor stated in people and applied to events would be a floor of one person twenty times
 * over, which is the disclosure it exists to prevent wearing the arithmetic of the thing that
 * prevents it."* P6 and P8 count encounters, so their cells publish an event count **and** clear
 * the floor on {@link CellCounts.people}.
 *
 * Declared once. `dashboardSpec.test.ts` reads § 20.3 and fails if this integer and the document's
 * disagree, so there is no path on which the code quietly runs a looser floor than the posture.
 */
export const MIN_CELL_PEOPLE = 20;

/**
 * The z for a 95 % normal-approximation interval. § 20.3 derives its own half-width from this and
 * {@link MIN_CELL_PEOPLE}, and `telemetryDashboard.test.ts` re-derives the document's figure from
 * the floor rather than trusting the sentence — so the two live on the same constant.
 */
const Z_95 = 1.96;

/**
 * `docs/26 K2`'s chain — § 6.2's five beats, *"not a funnel invented here"*.
 *
 * `docs/23-audiences-and-core-loop.md` § 3.2 numbers the beats **observe, diagnose, change one
 * thing, re-run the same crowd, read a verdict**, and beat 2 has deliberately no event: it happens
 * in the player's head. So a drop can never be attributed to *diagnose*, which is a limit of P5
 * rather than a gap in it, and {@link beatDropOf} says so where a reader will meet it.
 *
 * `dashboardSpec.test.ts` parses this chain out of § 6.2's own blockquote and requires equality, so
 * a sixth beat in the document with no step here is red.
 */
export const K2_CHAIN = [
  'session_start',
  'run_observed',
  'change_made',
  'rerun_same_crowd',
  'verdict_shown',
] as const;

/**
 * The visible-trouble **dwell**, and it does not exist — `null`, deliberately.
 *
 * § 6.2 requires `trouble_visible` to fire on a threshold *and* a declared dwell, because
 * passengers arrive in batches and *"a threshold with no dwell would fire on every session and
 * measure nothing"*. § 11 registers the constant as owed by M2 with the stage, and #340's emitter
 * says the same thing in its own comment: the shipped alarm has a threshold on forty people
 * standing and **no wall-clock dwell**.
 *
 * So P1 is refused today on § 20.2's own second ground — *"the threshold and dwell constant does
 * not yet exist (§ 11)"* — and the refusal is derived from this constant rather than hard-coded in
 * the aggregation.
 *
 * **This is § D227 mechanised rather than promised.** `dashboardSpec.test.ts` requires § 11 to
 * still carry the dwell row *un-struck* for as long as this is `null`, and to have struck it
 * through on the commit that gives it a number. A stale refusal cannot survive here: whichever half
 * moves first, the other one goes red.
 */
export const VISIBLE_TROUBLE_DWELL_MS: number | null = null;

/**
 * The beats of {@link K2_CHAIN} that **no shipped surface emits**, and today it is not empty.
 *
 * ## Why a dashboard has to know this
 *
 * `rerun_same_crowd` is beat 4 and it is registered in
 * `packages/viz/src/telemetry/schema.ts#UNEMITTED_EVENTS` with what blocks it: the fix-it screen
 * *does* offer the press, but `host.runPointer()` answers only for runs the shell simulated itself,
 * so an event there would carry no way to say which run it was about.
 *
 * The consequence is arithmetic rather than opinion. A chain that contains an event nothing emits
 * **cannot close**, so `docs/26 K2`'s completion share can only ever read **0 %** — and it would
 * read it against `charter S2`'s target of 60 %. That is not a measurement of the product; it is a
 * measurement of the instrument, wearing the product's units. The issue's own thread says so before
 * any of this was built: *"a dashboard drawing K2 as a funnel would show a flat zero and look like
 * a bug"*, and `docs/22-charter.md`'s S2 cell had to be corrected to **Partly — the chain cannot
 * close today** for the same reason. This module was the last place in the tree that did not know.
 *
 * So P2 and P5 are refused whole while this is non-empty — **not** re-defined over the beats that
 * do emit, which would be a second definition of a KPI § 6.2 owns and is what `docs/26` P-5
 * forbids. § 20.2's *Refused when* column carries the ground, and the refusal is derived from this
 * constant rather than written into either panel.
 *
 * ## Kept in step with the register rather than promised to match it
 *
 * `dashboardSpec.test.ts` parses `UNEMITTED_EVENTS` **off disk**, intersects it with
 * {@link K2_CHAIN} and requires equality with this array in both directions — the same § D227
 * mechanisation {@link VISIBLE_TROUBLE_DWELL_MS} has against § 11's dwell row. Wire the emitter and
 * this file goes red until the beat leaves; add a beat to the register and it goes red the other
 * way. A stale refusal cannot survive either move, which is the whole point: a refusal that outlives
 * its cause tells a reader not to look at a panel that works.
 *
 * The server may not import `packages/viz`, so the register is read as text rather than as a value.
 * That is why this is a `readonly string[]` of plain names and not a typed event union.
 */
export const CHAIN_BEATS_WITHOUT_EMITTER: readonly string[] = Object.freeze(['rerun_same_crowd']);

/**
 * `docs/26 K3`'s session close: *"an explicit `session_end`, or **30 minutes** with no event"*
 * (§ 6.2). Only the second limb needs a constant; the first is an event.
 */
const SESSION_IDLE_CLOSE_MS = 30 * 60 * 1000;

/** `docs/26 K4`'s return window: a `session_start` in (*D*, *D*+7] (§ 6.2). */
const RETURN_WINDOW_DAYS = 7;

/**
 * `docs/26 K4` is drawn no earlier than *D*+8 (§ 6.2, § 20.2): *"a partial window is not a smaller
 * measurement, it is a different one."*
 */
const COHORT_CLOSES_AFTER_DAYS = RETURN_WINDOW_DAYS + 1;

const DAY_MS = 24 * 60 * 60 * 1000;

/* -------------------------------------------------------------------------- *
 * The panels — § 20.2, as data
 * -------------------------------------------------------------------------- */

/** The eight § 20.2 grants, and there is no ninth without § 18.2 moving first. */
export type PanelId = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8';

/**
 * A target, and it is **the charter's** rather than this document's (§ 20.2).
 *
 * `direction` is what makes #250's fourth criterion mechanical. `charter S1` is a ceiling — a
 * median at or under 90 s passes — so raising it means *lowering the number*; `charter S2` is a
 * floor and raising it means raising the number. A ratchet with no direction could only ever
 * assert equality, which goes red on the commit that raises a criterion and therefore teaches
 * people to edit the gate. See `dashboardSpec.test.ts`'s `TARGET_RATCHET`.
 */
export interface PanelTarget {
  /** The charter criterion this serves, in the id form the rest of the tree cites. */
  readonly criterion: string;
  /** `at-most`: smaller is more demanding. `at-least`: larger is more demanding. */
  readonly direction: 'at-most' | 'at-least';
  readonly value: number;
  readonly unit: 'seconds' | 'minutes' | 'share';
}

/**
 * One panel. `reads` is the subject as the **owning** section names it — `docs/26 K1` for a KPI,
 * § 6.3's own row subject for a diagnostic — so that the derivation test compares like with like
 * rather than comparing two paraphrases.
 */
export interface PanelSpec {
  readonly id: PanelId;
  readonly kind: 'kpi' | 'diagnostic';
  readonly reads: string;
  /** `null` on every diagnostic. § 6.1: a diagnostic may not be a gate. */
  readonly target: PanelTarget | null;
  /** § 20.2's grain column, split on `×`. The only axes this dashboard may be sliced by. */
  readonly axes: readonly string[];
  /**
   * Which axes group a **partition** — the set of cells § 20.3 ground 3's complement rule is
   * applied across. The remaining axes vary within it.
   */
  readonly partitionAxes: readonly string[];
}

/**
 * § 20.2's table, as code.
 *
 * **Ordered as the document orders it**, so a reader can hold the two side by side, and derived
 * against it by `dashboardSpec.test.ts` in both directions — ids, kinds, subjects, the presence or
 * absence of a target, and the grain.
 */
export const DASHBOARD_PANELS: readonly PanelSpec[] = Object.freeze([
  Object.freeze({
    id: 'P1',
    kind: 'kpi',
    reads: 'docs/26 K1',
    target: Object.freeze({
      criterion: 'charter S1',
      direction: 'at-most',
      value: 90,
      unit: 'seconds',
    }),
    axes: Object.freeze(['build', 'UTC month']),
    partitionAxes: Object.freeze(['build', 'UTC month']),
  }),
  Object.freeze({
    id: 'P2',
    kind: 'kpi',
    reads: 'docs/26 K2',
    target: Object.freeze({
      criterion: 'charter S2',
      direction: 'at-least',
      value: 0.6,
      unit: 'share',
    }),
    axes: Object.freeze(['build', 'UTC month']),
    partitionAxes: Object.freeze(['build', 'UTC month']),
  }),
  Object.freeze({
    id: 'P3',
    kind: 'kpi',
    reads: 'docs/26 K3',
    target: Object.freeze({
      criterion: 'charter S3',
      direction: 'at-least',
      value: 10,
      unit: 'minutes',
    }),
    axes: Object.freeze(['build', 'UTC month']),
    partitionAxes: Object.freeze(['build', 'UTC month']),
  }),
  Object.freeze({
    id: 'P4',
    kind: 'kpi',
    reads: 'docs/26 K4',
    target: Object.freeze({
      criterion: 'charter S4',
      direction: 'at-least',
      value: 0.25,
      unit: 'share',
    }),
    axes: Object.freeze(['first-seen UTC day', 'build']),
    partitionAxes: Object.freeze(['first-seen UTC day', 'build']),
  }),
  Object.freeze({
    id: 'P5',
    kind: 'diagnostic',
    reads: 'Beat-drop profile',
    target: null,
    axes: Object.freeze(['build', 'UTC month', 'beat', 'screen key']),
    partitionAxes: Object.freeze(['build', 'UTC month']),
  }),
  Object.freeze({
    id: 'P6',
    kind: 'diagnostic',
    reads: 'Refusal encounters',
    target: null,
    axes: Object.freeze(['build', 'UTC month', 'refusal ground']),
    partitionAxes: Object.freeze(['build', 'UTC month']),
  }),
  Object.freeze({
    id: 'P7',
    kind: 'diagnostic',
    reads: 'Field cold load',
    target: null,
    axes: Object.freeze(['build', 'UTC month']),
    partitionAxes: Object.freeze(['build', 'UTC month']),
  }),
  Object.freeze({
    id: 'P8',
    kind: 'diagnostic',
    reads: 'Screen reach',
    target: null,
    axes: Object.freeze(['build', 'UTC month', 'screen key']),
    partitionAxes: Object.freeze(['build', 'UTC month']),
  }),
]);

/* -------------------------------------------------------------------------- *
 * The baseline — § 20.4
 * -------------------------------------------------------------------------- */

/**
 * A KPI baseline.
 *
 * **One variant, and it is the refusal.** § 20.4: every baseline reads `unmeasured` today, because
 * the instrument exists and no cohort has been measured through it. A `measured` arm would be an
 * arm nothing in this tree can construct — the dead-seam shape `CLAUDE.md` opens with — so the day
 * there is a number is the day this type grows a second member, under § 20.4's protocol: the first
 * complete window after ingest begins, published once, with the counts it was computed over, and
 * never re-based.
 */
export interface Baseline {
  readonly kind: 'unmeasured';
  /** The word the panel publishes. Never blank: *"a refusal states itself"* (§ 20.4). */
  readonly reading: 'unmeasured';
  readonly why: string;
}

/**
 * The one baseline every KPI panel carries.
 *
 * `reading` is a literal type rather than a string, so a lane that wanted to put a number here
 * would have to change the type and meet `dashboardSpec.test.ts`'s positive control on the way
 * past. A baseline that silently became `0` is the failure this constant exists to make loud: zero
 * is a measurement, `unmeasured` is a refusal, and a dashboard that confuses them has published a
 * finding nobody made.
 */
export const BASELINE_UNMEASURED: Baseline = Object.freeze({
  kind: 'unmeasured',
  reading: 'unmeasured',
  why:
    'docs/26 § 20.4 — the instrument exists and no cohort has been measured through it. Telemetry ' +
    'is collected only from players who have consented (§ 4.2), and nobody has been recruited, so ' +
    'no KPI has ever been computed. A number here would be invented.',
});

/* -------------------------------------------------------------------------- *
 * Cells
 * -------------------------------------------------------------------------- */

/** What a figure is, so that a reader never has to infer it from the number's size. */
export type Statistic = 'share' | 'median-seconds' | 'median-milliseconds' | 'count';

/** A 95 % interval. § 6.4: *a difference is reported with an interval and its count, or not at all.* */
export interface Interval {
  readonly lo: number;
  readonly hi: number;
}

/** One published figure. P1 carries two — § 6.2 requires the reach share and the median together. */
export interface Figure {
  readonly label: string;
  readonly statistic: Statistic;
  readonly value: number;
  /** `null` only where the statistic is a raw count, which has no sampling interval of its own. */
  readonly interval: Interval | null;
}

/** The two counts every published cell carries (§ 20.2), and the floor reads the first. */
export interface CellCounts {
  /** Distinct `playerId`s. This is what {@link MIN_CELL_PEOPLE} is measured against. */
  readonly people: number;
  /** Encounters, sessions or events — whatever the panel is counting. Never clears the floor. */
  readonly observations: number;
}

/**
 * A cell this dashboard publishes.
 *
 * Carries its own counts and an interval per figure, which is § 6.4's second bullet and the reason
 * § 20.3's floor *"does not have to do statistical work as well as disclosure work"*.
 */
export interface PublishedCell {
  readonly kind: 'published';
  readonly axes: Readonly<Record<string, string>>;
  readonly figures: readonly Figure[];
  readonly counts: CellCounts;
}

/**
 * A cell this dashboard refuses.
 *
 * **There is no number on this object**, and that is the whole design. § 20.3 puts the floor in the
 * route rather than the reader; a `value` here — even one a renderer promised not to draw — would
 * put it back in the reader, one query away from a dashboard that does not filter at all.
 *
 * `reason` is deliberately the **same sentence** for every refusal inside a partition, floor or
 * complement alike (§ 20.3 ground 3): a cell that announced itself as a complement would announce
 * that it is *not* under the floor, which moves the bound on the cell it was suppressed to protect
 * into a disjoint — and wrong — range. The cost is stated rather than hidden: at cell level a
 * reader cannot tell a quiet month from a suppressed one, and the partition is where that is
 * explained.
 */
export interface RefusedCell {
  readonly kind: 'refused';
  readonly axes: Readonly<Record<string, string>>;
  readonly reason: string;
}

export type Cell = PublishedCell | RefusedCell;

/** A set of cells over one base — what § 20.3 ground 3's complement rule is applied across. */
export interface PartitionView {
  readonly axes: Readonly<Record<string, string>>;
  readonly cells: readonly Cell[];
  /**
   * Why cells in this partition were refused, said once here rather than per cell. `null` when
   * nothing in it was refused.
   */
  readonly refusalNote: string | null;
}

export interface PanelView {
  readonly panel: PanelSpec;
  /** `null` on a diagnostic. § 6.1 — and the asymmetry is asserted, not incidental. */
  readonly baseline: Baseline | null;
  readonly partitions: readonly PartitionView[];
  /**
   * A reason this panel drew nothing at all, in its own words — a window that has not closed, a
   * constant that does not exist (§ 11), or an empty source. `null` when the panel drew cells.
   */
  readonly silence: string | null;
}

export interface DashboardView {
  readonly minCellPeople: number;
  readonly panels: readonly PanelView[];
  /**
   * What the source is, in the sentence the reader needs.
   *
   * #340's own report: *"an empty-state that says nobody has consented yet is a different sentence
   * from nothing happened."* This carries that distinction rather than letting an empty dashboard
   * read as a quiet month.
   */
  readonly source: SourceNote;
}

export interface SourceNote {
  readonly kind: 'empty' | 'populated';
  readonly sentence: string;
  /** Events read. Never a person count: this is a description of the source, not a cell. */
  readonly events: number;
}

/**
 * What {@link dashboardOf} is given, and it is **one field**.
 *
 * § 20.7 item 1 and § 20.3 ground 2: no arbitrary date range. The windows are the fixed,
 * pre-declared calendar grains in {@link DASHBOARD_PANELS}, and `nowMs` exists only so that
 * `docs/26 K4` can tell a cohort whose window has closed from one whose has not. A second member
 * here — `fromMs`, `toMs`, `days` — is the date picker arriving under another name, and
 * `dashboardSpec.test.ts` reads this file's source and fails on one.
 */
export interface DashboardOptions {
  readonly nowMs: number;
}

/* -------------------------------------------------------------------------- *
 * The refusal sentences — one per cause, and identical within a partition
 * -------------------------------------------------------------------------- */

const REFUSED_TOO_SMALL =
  `too small to publish — fewer than ${String(MIN_CELL_PEOPLE)} people, or refused so that a cell ` +
  'that is cannot be recovered by subtraction (docs/26 § 20.3)';

const REFUSED_PARTITION =
  `nothing in this group is published — fewer than two cells could be refused, and a partition ` +
  'with one publishable cell publishes nothing (docs/26 § 20.3 ground 3, rule 2)';

/**
 * The sentence P2 and P5 are silent with while {@link CHAIN_BEATS_WITHOUT_EMITTER} is non-empty.
 *
 * Names the beats rather than describing them, because the reader's next question is *which one*,
 * and the register that carries the answer is one file away. `what` is the clause that differs
 * between the two panels — a KPI that cannot be computed and a diagnostic whose base is that KPI's
 * complement are refused for the same cause and not for the same reason.
 */
function chainCannotCloseNote(what: string): string {
  return (
    `refused — docs/26 K2's chain cannot close. ${CHAIN_BEATS_WITHOUT_EMITTER.join(', ')} ` +
    `${CHAIN_BEATS_WITHOUT_EMITTER.length === 1 ? 'is a beat' : 'are beats'} no shipped surface ` +
    'emits, registered with what blocks it in ' +
    'packages/viz/src/telemetry/schema.ts#UNEMITTED_EVENTS. ' +
    `${what} Either way the panel would be measuring the instrument rather than the product, which ` +
    "is what docs/22-charter.md's S2 cell already says in its own words (“Partly — the chain " +
    'cannot close today”). The chain is not re-defined over the beats that do emit: docs/26 § 6.2 ' +
    'owns K2, and a second definition here is what docs/26 P-5 forbids.'
  );
}

/* -------------------------------------------------------------------------- *
 * Sessions — what the raw rows become before a panel sees them
 * -------------------------------------------------------------------------- */

interface SessionEvent {
  readonly name: string;
  readonly atMs: number;
  readonly receivedAtMs: number;
  readonly fields: Readonly<Record<string, unknown>>;
}

interface Session {
  readonly sessionId: string;
  readonly playerId: string;
  readonly buildId: string;
  readonly events: readonly SessionEvent[];
  /** The server's clock on the earliest event of this session. The only absolute one (§ 7.1). */
  readonly startedAtMs: number;
  /** Session-elapsed milliseconds of the last event — `docs/26 K3`'s own estimator. */
  readonly lastAtMs: number;
  readonly isFirstSession: boolean;
}

/**
 * Group rows into sessions, and mark each player's first one.
 *
 * **A session's month is taken from `receivedAtMs`, never from the client.** § 2.2 keeps a wall
 * clock off the wire on purpose, so the only absolute time here is the server's, and a build ×
 * month cell is a statement about when the server heard rather than when the tab thought it was.
 */
function sessionsOf(events: readonly TelemetryEventRow[]): readonly Session[] {
  const grouped = new Map<string, TelemetryEventRow[]>();
  for (const row of events) {
    const bucket = grouped.get(row.sessionId);
    if (bucket === undefined) grouped.set(row.sessionId, [row]);
    else bucket.push(row);
  }

  const draft = [...grouped.entries()].map(([sessionId, rows]) => {
    const sorted = [...rows].sort((a, b) => a.atMs - b.atMs || a.receivedAtMs - b.receivedAtMs);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    /*
     * Both are present because `grouped` is built by pushing, so no bucket is empty — but
     * `noUncheckedIndexedAccess` is on and coalescing here would let a future refactor produce a
     * session with a zeroed clock rather than a loud one. `deadCode.test.ts`'s own argument about
     * `?? ''`.
     */
    if (first === undefined || last === undefined) {
      throw new Error(`telemetry dashboard: session ${sessionId} grouped to no events`);
    }
    return {
      sessionId,
      playerId: first.playerId,
      buildId: first.buildId,
      events: sorted.map((row) => ({
        name: row.name,
        atMs: row.atMs,
        receivedAtMs: row.receivedAtMs,
        fields: row.fields,
      })),
      startedAtMs: Math.min(...sorted.map((row) => row.receivedAtMs)),
      lastAtMs: last.atMs,
    };
  });

  /*
   * The first session of a player is the earliest one the server heard from, ties broken on the
   * session id so that two batches landing in the same millisecond do not make the answer depend on
   * `Map` iteration order. Determinism here is invariant 4's spirit one package along: a report
   * that changes between two runs over the same rows is not a measurement.
   */
  const firstOf = new Map<string, string>();
  for (const session of [...draft].sort(
    (a, b) => a.startedAtMs - b.startedAtMs || (a.sessionId < b.sessionId ? -1 : 1),
  )) {
    if (!firstOf.has(session.playerId)) firstOf.set(session.playerId, session.sessionId);
  }

  return draft.map((session) => ({
    ...session,
    isFirstSession: firstOf.get(session.playerId) === session.sessionId,
  }));
}

/** `2026-09`, from the server's own clock. */
function utcMonthOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 7);
}

/** `2026-09-10`, from the server's own clock. */
function utcDayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Whether a session completed `docs/26 K2`'s chain, and where it stopped if it did not.
 *
 * A single forward scan in event order, which is § 6.2's definition exactly: *"with each event's
 * `atMs` at or after the previous one's, counted once per session (the first completed chain)"*.
 *
 * **`diagnose` can never be the answer**, and that is a limit rather than a bug: § 6.2 gives beat 2
 * no event because it happens in the player's head, so this returns the first chain **event** that
 * did not arrive. § 6.3 says the same thing about the diagnostic as a whole — *"the screen where a
 * session ends is not the reason it ended"*.
 */
function chainReachOf(session: Session): number {
  let reached = 0;
  for (const event of session.events) {
    if (event.name === K2_CHAIN[reached]) {
      reached += 1;
      if (reached === K2_CHAIN.length) return reached;
    }
  }
  return reached;
}

function beatDropOf(session: Session): string {
  const reached = chainReachOf(session);
  return K2_CHAIN[reached] ?? K2_CHAIN[K2_CHAIN.length - 1] ?? 'session_start';
}

/** The screen a session was last on. Falls back to the entry screen `session_start` declares. */
function lastScreenOf(session: Session): string {
  for (let index = session.events.length - 1; index >= 0; index -= 1) {
    const event = session.events[index];
    if (event === undefined) continue;
    if (event.name === 'screen_entered') {
      const key = event.fields['screenKey'];
      if (typeof key === 'string') return key;
    }
    if (event.name === 'session_start') {
      const key = event.fields['entryScreenKey'];
      if (typeof key === 'string') return key;
    }
  }
  return 'unrecorded';
}

/* -------------------------------------------------------------------------- *
 * Statistics — a share and a median, each with its interval
 * -------------------------------------------------------------------------- */

/**
 * A share with a 95 % normal-approximation interval, clamped to [0, 1].
 *
 * The same arithmetic § 20.3 argues with when it says the floor is not a precision bar: at
 * {@link MIN_CELL_PEOPLE} the widest half-width is 1.96·√(0.25/20) ≈ 0.22, so an observed 60 % runs
 * from 38 % to 82 %. A reader who sees an interval that wide *"has been told the truth rather than
 * protected from it"*.
 */
function shareFigure(label: string, hits: number, n: number): Figure {
  const value = n === 0 ? 0 : hits / n;
  const half = Z_95 * Math.sqrt((value * (1 - value)) / Math.max(n, 1));
  return {
    label,
    statistic: 'share',
    value,
    interval: { lo: Math.max(0, value - half), hi: Math.min(1, value + half) },
  };
}

/**
 * A median with a distribution-free order-statistic interval.
 *
 * The rank bounds are the standard normal approximation to the binomial — ⌊n/2 − z√n/2⌋ and
 * ⌈n/2 + z√n/2⌉ — rather than a bootstrap, because a bootstrap here would need a seeded stream and
 * `core`'s invariant 2 exists precisely so that nobody reaches for an unnamed one. Non-parametric
 * on purpose: a session-length distribution is not symmetric and a normal interval around a median
 * would claim a shape the data does not have.
 */
function medianFigure(label: string, statistic: Statistic, values: readonly number[]): Figure {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const at = (index: number): number => sorted[Math.min(Math.max(index, 0), n - 1)] ?? 0;
  const middle = n % 2 === 1 ? at((n - 1) / 2) : (at(n / 2 - 1) + at(n / 2)) / 2;
  const spread = (Z_95 * Math.sqrt(n)) / 2;
  return {
    label,
    statistic,
    value: middle,
    interval: { lo: at(Math.floor(n / 2 - spread)), hi: at(Math.ceil(n / 2 + spread) - 1) },
  };
}

/* -------------------------------------------------------------------------- *
 * The floor, and § 20.3 ground 3's complement rule
 * -------------------------------------------------------------------------- */

/** A cell before the floor has looked at it. Never leaves this module in this shape. */
interface CandidateCell {
  readonly axes: Readonly<Record<string, string>>;
  readonly figures: readonly Figure[];
  readonly counts: CellCounts;
}

/**
 * Apply § 20.3 to one partition.
 *
 * Three rules, in the document's own order:
 *
 * 1. Every cell under {@link MIN_CELL_PEOPLE} is refused, on the count of **people**.
 * 2. If any cell is refused, **at least one further cell is refused** — otherwise a single refused
 *    value is the published total less its published siblings, which is ground 3's whole point. The
 *    complement is the smallest publishable cell, so that what a reader recovers is the *sum* of
 *    the two smallest rather than either of them.
 * 3. If that leaves fewer than two refusals possible, or one publishable cell standing, the whole
 *    partition is refused.
 *
 * Every refusal reads identically (ground 3's third clause), so nothing in the output distinguishes
 * a floor refusal from a complement one.
 */
function applyFloor(
  partitionAxes: Readonly<Record<string, string>>,
  candidates: readonly CandidateCell[],
): PartitionView {
  const refused = new Set<number>();
  candidates.forEach((candidate, index) => {
    if (candidate.counts.people < MIN_CELL_PEOPLE) refused.add(index);
  });

  if (refused.size === 0) {
    return {
      axes: partitionAxes,
      refusalNote: null,
      cells: candidates.map((candidate) => ({ kind: 'published', ...candidate }) as PublishedCell),
    };
  }

  // Rule 1's second half: a lone refusal is recoverable, so refuse the smallest publishable cell.
  if (refused.size === 1) {
    const complement = candidates
      .map((candidate, index) => ({ index, people: candidate.counts.people }))
      .filter((entry) => !refused.has(entry.index))
      .sort((a, b) => a.people - b.people || a.index - b.index)[0];
    if (complement !== undefined) refused.add(complement.index);
  }

  /*
   * Rule 2: *"If fewer than two cells can be refused, the whole partition is refused. A partition
   * with one publishable cell publishes nothing."*
   *
   * Read as a bound on how many cells **can** be refused rather than on how many survive, which is
   * the reading the first sentence carries and the second one describes the outcome of: a partition
   * of one cell has no second cell to refuse, and a partition of two ends with both refused, so in
   * either case nothing publishes. A partition of three with one small cell keeps its largest — the
   * standard complementary-suppression outcome, where what a reader recovers from a published total
   * is the *sum* of the two refused cells and never either of them.
   */
  const publishable = candidates.length - refused.size;
  if (refused.size < 2 || publishable <= 0) {
    return {
      axes: partitionAxes,
      refusalNote: REFUSED_PARTITION,
      cells: candidates.map((candidate) => ({
        kind: 'refused',
        axes: candidate.axes,
        reason: REFUSED_PARTITION,
      })),
    };
  }

  return {
    axes: partitionAxes,
    refusalNote: REFUSED_TOO_SMALL,
    cells: candidates.map((candidate, index) =>
      refused.has(index)
        ? ({ kind: 'refused', axes: candidate.axes, reason: REFUSED_TOO_SMALL } as RefusedCell)
        : ({ kind: 'published', ...candidate } as PublishedCell),
    ),
  };
}

/* -------------------------------------------------------------------------- *
 * Grouping helpers
 * -------------------------------------------------------------------------- */

function groupBy<T>(items: readonly T[], key: (item: T) => string): ReadonlyMap<string, readonly T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const bucket = out.get(key(item));
    if (bucket === undefined) out.set(key(item), [item]);
    else bucket.push(item);
  }
  return out;
}

function buildMonthAxes(session: Session): Readonly<Record<string, string>> {
  return { build: session.buildId, 'UTC month': utcMonthOf(session.startedAtMs) };
}

function axisKey(axes: Readonly<Record<string, string>>): string {
  return Object.entries(axes)
    .map(([name, value]) => `${name}=${value}`)
    .join(' × ');
}

function distinct(values: readonly string[]): number {
  return new Set(values).size;
}

/* -------------------------------------------------------------------------- *
 * The panels
 * -------------------------------------------------------------------------- */

function panelSpec(id: PanelId): PanelSpec {
  const found = DASHBOARD_PANELS.find((panel) => panel.id === id);
  if (found === undefined) throw new Error(`telemetry dashboard: no panel ${id}`);
  return found;
}

/**
 * P1 — `docs/26 K1`, and it is refused whole today.
 *
 * § 20.2's refusal column gives two grounds and the **second** is the one that binds:
 * *"the threshold and dwell constant does not yet exist (§ 11)"*. It does not
 * ({@link VISIBLE_TROUBLE_DWELL_MS}), so the reach share and the median would be computed over an
 * event that fires on a threshold with no dwell — which § 6.2 says *"would fire on every session
 * and measure nothing"*. Publishing that pair under `charter S1`'s target would be exactly the
 * confident nonsense `CLAUDE.md` opens against.
 *
 * The refusal is derived from the constant, so the panel starts drawing on the commit that declares
 * a dwell and not before.
 */
function panel1(sessions: readonly Session[]): PanelView {
  const spec = panelSpec('P1');
  if (VISIBLE_TROUBLE_DWELL_MS === null) {
    return {
      panel: spec,
      baseline: BASELINE_UNMEASURED,
      partitions: [],
      silence:
        'refused — docs/26 § 6.2 requires a visible-trouble threshold **and** a declared dwell, ' +
        'and the dwell does not exist yet (§ 11, owed by M2 with the stage). The shipped alarm has ' +
        'a threshold and no wall-clock dwell, so a median over trouble_visible would be a figure ' +
        'about an event that fires on an instantaneous crossing.',
    };
  }
  const firsts = sessions.filter((session) => session.isFirstSession);
  const partitions = [...groupBy(firsts, (session) => axisKey(buildMonthAxes(session))).values()].map(
    (group) => {
      const axes = buildMonthAxes(group[0] as Session);
      const reached = group.filter((session) =>
        session.events.some((event) => event.name === 'trouble_visible'),
      );
      const seconds = reached.map(
        (session) =>
          (session.events.find((event) => event.name === 'trouble_visible')?.atMs ?? 0) / 1000,
      );
      return applyFloor(axes, [
        {
          axes,
          figures: [
            shareFigure('reach — first sessions that saw visible trouble', reached.length, group.length),
            medianFigure('median time to visible trouble', 'median-seconds', seconds),
          ],
          counts: {
            people: distinct(group.map((session) => session.playerId)),
            observations: group.length,
          },
        },
      ]);
    },
  );
  return { panel: spec, baseline: BASELINE_UNMEASURED, partitions, silence: null };
}

/**
 * P2 — `docs/26 K2`. The share of first sessions completing the five-beat chain.
 *
 * **Refused whole today**, and the ground is {@link CHAIN_BEATS_WITHOUT_EMITTER} rather than
 * anything about the data: a chain carrying an event nothing emits can only read 0 %, and a 0 %
 * drawn under `charter S2`'s 60 % target would read as a product that fails its criterion
 * catastrophically when what has actually happened is that beat 4 has no emitter.
 */
function panel2(sessions: readonly Session[]): PanelView {
  const spec = panelSpec('P2');
  if (CHAIN_BEATS_WITHOUT_EMITTER.length > 0) {
    return {
      panel: spec,
      baseline: BASELINE_UNMEASURED,
      partitions: [],
      silence: chainCannotCloseNote(
        'So the completion share can only read 0 %, and it would read it directly under charter ' +
          'S2’s target of 60 % — a figure that is zero by construction, drawn where a reader looks ' +
          'for a product failing its criterion.',
      ),
    };
  }
  const firsts = sessions.filter((session) => session.isFirstSession);
  const partitions = [...groupBy(firsts, (session) => axisKey(buildMonthAxes(session))).values()].map(
    (group) => {
      const axes = buildMonthAxes(group[0] as Session);
      const completed = group.filter((session) => chainReachOf(session) === K2_CHAIN.length);
      return applyFloor(axes, [
        {
          axes,
          figures: [
            /*
             * § 6.2: *"Reported as a lower bound, always"* — a lost `verdict_shown` subtracts a
             * completion and can never add one (§ 9.2), so the estimator can only make the gate
             * harder to pass. Said in the label rather than in a note a renderer might drop.
             */
            shareFigure('completion (a lower bound — § 9.2)', completed.length, group.length),
          ],
          counts: {
            people: distinct(group.map((session) => session.playerId)),
            observations: group.length,
          },
        },
      ]);
    },
  );
  return { panel: spec, baseline: BASELINE_UNMEASURED, partitions, silence: null };
}

/** P3 — `docs/26 K3`. The median, over first sessions, of the last event's session-elapsed time. */
function panel3(sessions: readonly Session[]): PanelView {
  const spec = panelSpec('P3');
  const firsts = sessions.filter((session) => session.isFirstSession);
  const partitions = [...groupBy(firsts, (session) => axisKey(buildMonthAxes(session))).values()].map(
    (group) => {
      const axes = buildMonthAxes(group[0] as Session);
      return applyFloor(axes, [
        {
          axes,
          figures: [
            /*
             * § 6.2's own estimator and its own direction of error: the interval between the last
             * event and the moment the player actually left is never counted, so this under-reports
             * and `charter S3` is harder to pass than reality. {@link SESSION_IDLE_CLOSE_MS} is the
             * definition's other limb and is not applied to the figure — a session is *closed* by
             * thirty idle minutes, and closing it does not add time to it.
             */
            medianFigure(
              `median first-session length (under-reports — § 6.2; sessions close after ${String(
                SESSION_IDLE_CLOSE_MS / 60000,
              )} idle minutes)`,
              'median-milliseconds',
              group.map((session) => session.lastAtMs),
            ),
          ],
          counts: {
            people: distinct(group.map((session) => session.playerId)),
            observations: group.length,
          },
        },
      ]);
    },
  );
  return { panel: spec, baseline: BASELINE_UNMEASURED, partitions, silence: null };
}

/**
 * P4 — `docs/26 K4`. Day-one to seven-day return, by first-seen UTC day.
 *
 * A cohort is drawn no earlier than *D*+8 (§ 6.2), and a cohort whose window has not closed is
 * refused by name rather than drawn small: *"a partial window is not a smaller measurement, it is a
 * different one."*
 */
function panel4(sessions: readonly Session[], nowMs: number): PanelView {
  const spec = panelSpec('P4');
  const firsts = sessions.filter((session) => session.isFirstSession);
  const partitions: PartitionView[] = [];

  for (const group of groupBy(firsts, (session) =>
    axisKey({ 'first-seen UTC day': utcDayOf(session.startedAtMs), build: session.buildId }),
  ).values()) {
    const head = group[0] as Session;
    const axes = {
      'first-seen UTC day': utcDayOf(head.startedAtMs),
      build: head.buildId,
    };
    const dayStartMs = Date.parse(`${axes['first-seen UTC day']}T00:00:00.000Z`);
    if (nowMs < dayStartMs + COHORT_CLOSES_AFTER_DAYS * DAY_MS) {
      partitions.push({
        axes,
        refusalNote:
          `the window has not closed — docs/26 § 6.2 draws no cohort before D+${String(
            COHORT_CLOSES_AFTER_DAYS,
          )}, because a partial window is a different measurement rather than a smaller one`,
        cells: [
          {
            kind: 'refused',
            axes,
            reason: `the window has not closed — no cohort is drawn before D+${String(
              COHORT_CLOSES_AFTER_DAYS,
            )} (docs/26 § 6.2)`,
          },
        ],
      });
      continue;
    }

    const cohort = new Set(group.map((session) => session.playerId));
    const returners = new Set(
      sessions
        .filter((session) => {
          if (!cohort.has(session.playerId)) return false;
          if (!session.events.some((event) => event.name === 'session_start')) return false;
          const since = session.startedAtMs - dayStartMs;
          return since > DAY_MS - 1 && since <= RETURN_WINDOW_DAYS * DAY_MS + DAY_MS - 1;
        })
        .map((session) => session.playerId),
    );

    partitions.push(
      applyFloor(axes, [
        {
          axes,
          figures: [
            /*
             * § 6.2: *"It is the KPI most damaged by § 3's identity choices, in both directions:
             * cleared storage and a second device both look like a player who never came back. It
             * under-reports, and it is published with that sentence attached."*
             */
            shareFigure(
              `return within ${String(RETURN_WINDOW_DAYS)} days (under-reports — cleared storage ` +
                'and a second device both look like a player who never came back, § 6.2)',
              returners.size,
              cohort.size,
            ),
          ],
          counts: { people: cohort.size, observations: group.length },
        },
      ]),
    );
  }

  return { panel: spec, baseline: BASELINE_UNMEASURED, partitions, silence: null };
}

/**
 * P5 — the beat-drop profile, and it is the panel § 20.3 ground 3 was written about.
 *
 * The base is the first sessions that did **not** complete `docs/26 K2` for a build and a month —
 * which P2 publishes as a count and a share — and the cells partition exactly those sessions by the
 * beat they stopped at and the screen they were on. Refuse one cell for holding three people and
 * its value is P2's total less the published siblings, so the complement rule is not optional here.
 *
 * **Refused whole today for P2's cause and not for P2's reason.** This panel's base is *the first
 * sessions that did not complete `docs/26 K2`* — so while a beat has no emitter, that base is every
 * first session, and every one of them is attributed a drop at a beat no player can be observed
 * reaching. The largest cell on the panel would be an artefact of the missing emitter rather than a
 * place players stop, which inverts the one question § 6.3 asks it.
 */
function panel5(sessions: readonly Session[]): PanelView {
  const spec = panelSpec('P5');
  if (CHAIN_BEATS_WITHOUT_EMITTER.length > 0) {
    return {
      panel: spec,
      baseline: null,
      partitions: [],
      silence: chainCannotCloseNote(
        'So this panel’s base — the first sessions that did not complete the chain — is every ' +
          'first session, and every one of them is attributed a drop at a beat no player can be ' +
          'observed reaching. The largest cell would be an artefact of the missing emitter rather ' +
          'than a place players stop, which inverts the one question § 6.3 asks this panel.',
      ),
    };
  }
  const stalled = sessions.filter(
    (session) => session.isFirstSession && chainReachOf(session) < K2_CHAIN.length,
  );
  const partitions = [...groupBy(stalled, (session) => axisKey(buildMonthAxes(session))).values()].map(
    (group) => {
      const partitionAxes = buildMonthAxes(group[0] as Session);
      const cells = [
        ...groupBy(group, (session) => `${beatDropOf(session)}|${lastScreenOf(session)}`).values(),
      ].map((cell) => {
        const head = cell[0] as Session;
        const axes = {
          ...partitionAxes,
          beat: beatDropOf(head),
          'screen key': lastScreenOf(head),
        };
        return {
          axes,
          figures: [
            {
              label: 'first sessions that stopped here',
              statistic: 'count' as const,
              value: cell.length,
              interval: null,
            },
          ],
          counts: {
            people: distinct(cell.map((session) => session.playerId)),
            observations: cell.length,
          },
        };
      });
      return applyFloor(partitionAxes, cells);
    },
  );
  return { panel: spec, baseline: null, partitions, silence: null };
}

/**
 * P6 — refusal encounters, keyed by the ground or kind the surface itself drew.
 *
 * **Two vocabularies under one axis, and they are disjoint.** `verdict_shown.refusalGround` is
 * `core`'s `AWT_INVALID_GROUNDS`; `refusal_shown.refusalKind` is the report's own figure
 * classification. § 6.3's question is *"which of the five `awtIsValid` grounds, **and which other
 * refusals**, do players actually meet?"*, so both belong on the panel, and
 * {@link assertGroundsAreDisjoint} refuses to run if the two sets ever overlap — an axis whose
 * values meant two things depending on which event produced them is the second-definition defect
 * `docs/26` P-5 forbids.
 *
 * **Some kinds are not refusals and travel anyway.** The emitter ships every figure's tone,
 * including `plain` and § D106's `unranked`, because *"a `withheld` count with no `plain` count
 * beside it is a rate with no denominator"*. Deciding which of them is a refusal is the analysis's
 * job at the review, not this module's — P-5 again, from the other side.
 */
function panel6(sessions: readonly Session[]): PanelView {
  const spec = panelSpec('P6');
  assertGroundsAreDisjoint();
  const encounters = sessions.flatMap((session) =>
    session.events.flatMap((event) => {
      const ground =
        event.name === 'verdict_shown'
          ? event.fields['refusalGround']
          : event.name === 'refusal_shown'
            ? event.fields['refusalKind']
            : null;
      return typeof ground === 'string'
        ? [{ session, ground, axes: { ...buildMonthAxes(session), 'refusal ground': ground } }]
        : [];
    }),
  );
  const partitions = [...groupBy(encounters, (item) => axisKey(buildMonthAxes(item.session))).values()].map(
    (group) => {
      const partitionAxes = buildMonthAxes((group[0] as (typeof group)[number]).session);
      const cells = [...groupBy(group, (item) => item.ground).values()].map((cell) => {
        const head = cell[0] as (typeof cell)[number];
        return {
          axes: head.axes,
          figures: [
            {
              label: 'refusals drawn (never refusals understood — § 6.3)',
              statistic: 'count' as const,
              value: cell.length,
              interval: null,
            },
          ],
          counts: {
            /*
             * § 20.3: *"What the floor counts is distinct `playerId`s, never events."* One person
             * can meet twenty refusals in a session, and a floor of one person twenty times over is
             * the disclosure the floor exists to prevent.
             */
            people: distinct(cell.map((item) => item.session.playerId)),
            observations: cell.length,
          },
        };
      });
      return applyFloor(partitionAxes, cells);
    },
  );
  return { panel: spec, baseline: null, partitions, silence: null };
}

/**
 * P7 — field cold load.
 *
 * § 6.3: *"not the `charter S9` instrument. `charter S9`'s instrument is a CI budget that fails the
 * build; a field distribution can **refute** the budget's representativeness and can never satisfy
 * the criterion."* Which is why {@link PanelSpec.target} is `null` here even though `charter S9`
 * names a number: a target column would make this a gate, and § 6.1 forbids that.
 */
function panel7(sessions: readonly Session[]): PanelView {
  const spec = panelSpec('P7');
  const loads = sessions.flatMap((session) =>
    session.events
      .filter((event) => event.name === 'cold_load')
      .flatMap((event) => {
        const ms = event.fields['msToInteractive'];
        return typeof ms === 'number' ? [{ session, ms }] : [];
      }),
  );
  const partitions = [...groupBy(loads, (item) => axisKey(buildMonthAxes(item.session))).values()].map(
    (group) => {
      const axes = buildMonthAxes((group[0] as (typeof group)[number]).session);
      return applyFloor(axes, [
        {
          axes,
          figures: [
            medianFigure(
              'median time to interactive (may refute the CI budget — never satisfies charter S9)',
              'median-milliseconds',
              group.map((item) => item.ms),
            ),
          ],
          counts: {
            people: distinct(group.map((item) => item.session.playerId)),
            observations: group.length,
          },
        },
      ]);
    },
  );
  return { panel: spec, baseline: null, partitions, silence: null };
}

/**
 * P8 — screen reach.
 *
 * § 6.3: *"not a `charter S10` instrument — that is the twenty-one journey rows in
 * `TEST_MATRIX.md`."* It answers which registered screen keys are reached **at all** in a real
 * session, and a screen missing from this panel is a screen no consenting player reached, which
 * § 9.2 says is not evidence that nobody wanted to.
 */
function panel8(sessions: readonly Session[]): PanelView {
  const spec = panelSpec('P8');
  const entries = sessions.flatMap((session) =>
    session.events
      .filter((event) => event.name === 'screen_entered')
      .flatMap((event) => {
        const key = event.fields['screenKey'];
        return typeof key === 'string' ? [{ session, key }] : [];
      }),
  );
  const partitions = [...groupBy(entries, (item) => axisKey(buildMonthAxes(item.session))).values()].map(
    (group) => {
      const partitionAxes = buildMonthAxes((group[0] as (typeof group)[number]).session);
      const cells = [...groupBy(group, (item) => item.key).values()].map((cell) => {
        const head = cell[0] as (typeof cell)[number];
        return {
          axes: { ...partitionAxes, 'screen key': head.key },
          figures: [
            {
              label: 'screen entries',
              statistic: 'count' as const,
              value: cell.length,
              interval: null,
            },
          ],
          counts: {
            people: distinct(cell.map((item) => item.session.playerId)),
            observations: cell.length,
          },
        };
      });
      return applyFloor(partitionAxes, cells);
    },
  );
  return { panel: spec, baseline: null, partitions, silence: null };
}

/**
 * The two vocabularies P6's axis carries must not overlap.
 *
 * `telemetry/schema.ts` makes the same check about `verdictKind`'s two halves and for the same
 * reason. If a sixth `awtIsValid` ground were ever named `suppressed`, a cell on this panel would
 * mean *the run refused its mean* and *the report drew a withheld figure* at once, and no reader
 * could tell which. Loud rather than silent: the panel refuses to build.
 */
function assertGroundsAreDisjoint(): void {
  const kinds = new Set([
    'observation',
    'estimate',
    'suppressed',
    'absent',
    'plain',
    'good',
    'caution',
    'hot',
    'bad',
    'withheld',
    'unranked',
  ]);
  const overlap = AWT_INVALID_GROUNDS.filter((ground) => kinds.has(ground));
  if (overlap.length > 0) {
    throw new Error(
      `telemetry dashboard: P6's axis carries two vocabularies and they now overlap on ` +
        `${overlap.join(', ')}. One cell would mean two different things — docs/26 P-5.`,
    );
  }
}

/* -------------------------------------------------------------------------- *
 * The route
 * -------------------------------------------------------------------------- */

/**
 * Build R-1's view over stored events.
 *
 * **Aggregates out, rows in.** § 18.2 bounds the *reader* to aggregates; the route is where the
 * rows are, and this is the route. Nothing this function returns carries a `playerId`, a
 * `sessionId` or a run pointer, so there is no drill-through to build (§ 20.7 item 2) and no
 * behavioural cohort to slice (§ 18.3 item 3).
 *
 * `nowMs` is the only input beside the rows, and it exists for `docs/26 K4` alone.
 */
export function dashboardOf(
  events: readonly TelemetryEventRow[],
  options: DashboardOptions,
): DashboardView {
  const sessions = sessionsOf(events);
  return {
    minCellPeople: MIN_CELL_PEOPLE,
    source:
      events.length === 0
        ? {
            kind: 'empty',
            events: 0,
            sentence:
              'No telemetry has been received. That is not the same sentence as nothing happened: ' +
              'docs/26 § 4.2 collects only from players who have consented and consent fails ' +
              'closed, and § 11 records that the consent surface may not be shown to anyone until ' +
              'Part B has had its legal review. Until then the consenting subset is empty by ' +
              'construction, and every panel below is correct and blank.',
          }
        : {
            kind: 'populated',
            events: events.length,
            sentence:
              `${String(events.length)} events, from the consenting subset only (docs/26 § 4.2). ` +
              'Every rate below has that subset as its denominator.',
          },
    panels: [
      panel1(sessions),
      panel2(sessions),
      panel3(sessions),
      panel4(sessions, options.nowMs),
      panel5(sessions),
      panel6(sessions),
      panel7(sessions),
      panel8(sessions),
    ],
  };
}
