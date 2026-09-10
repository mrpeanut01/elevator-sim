/**
 * **The telemetry wire, and the gate in front of it** — GitHub issue #340, building the schema
 * `docs/26-telemetry-and-privacy.md` § 7 designed and nothing implemented.
 *
 * This module is the server's half. It knows what a batch looks like, what an event may be called,
 * and what each event may carry; it knows nothing about who sent it, because there is nothing on
 * the wire that could say. `store.ts` writes the rows and `http/api.ts` answers the routes.
 *
 * ## P-3: the schema is the allowlist, and it is one in code rather than in prose
 *
 * § 7's table is {@link TELEMETRY_EVENT_NAMES} and {@link FIELDS_OF} together — the ten names, and
 * for each one exactly the fields § 7.2 and § 7.3 give it. {@link batchIssues} refuses a name that
 * is not in the first, a field that is not in the second, **and an event missing a field the table
 * gives it**. An event with a surplus field is refused rather than trimmed: trimming would let a
 * client ship a field nobody agreed to and never find out, which is the direction P-3 exists to
 * close.
 *
 * ## P-4: no unbounded string reaches a row
 *
 * § 7.4's last paragraph, expressed as a type rather than as a rule. Every string field here is
 * either a member of a closed list declared below, or a {@link isVocabularyToken} — lower-case,
 * hyphenated, at most {@link MAX_TOKEN_CHARS} characters, drawn from a vocabulary the *product*
 * declares. The three exceptions § 7.1 names are the two random ids and `buildId`, and each is
 * bounded here too: the ids by {@link ID_PATTERN}, the build by {@link MAX_BUILD_ID_CHARS}.
 *
 * A player-authored string cannot reach a field in this schema, because there is no field in this
 * schema shaped to take one. That is P-4's second half and it survives the 2026-09-09 rewrite
 * unchanged: what that rewrite permits is text a player **composed for a destination they were
 * shown**, and nobody composes a telemetry event.
 *
 * ## What is deliberately not here
 *
 * No wall clock from the client (§ 2.2). `atMs` is **session-elapsed** milliseconds from a
 * monotonic source, rounded to 100 ms by the client, and this module refuses one that is negative,
 * fractional or absurd. The only absolute clock is the server's own receive time, which
 * `http/api.ts` stamps and this module never sees.
 *
 * No account id and no bearer token (§ 3.2). The route is unauthenticated on purpose, and a batch
 * carrying either would be creating the join the whole design exists to make impossible — so
 * neither has a field here to arrive in.
 *
 * ## Why the vocabularies are three different shapes
 *
 * P-5 says the client records and never judges: every classification an event carries is read from
 * the shipped surface's own classification rather than recomputed. Three of them can be *derived*
 * here and one cannot:
 *
 * - {@link REFUSAL_GROUNDS} is `core`'s own `AWT_INVALID_GROUNDS`, imported. A sixth ground added
 *   to `metrics/awtValidity.ts`'s table widens this with no edit here, which is the whole point of
 *   that table.
 * - {@link VERDICT_KINDS} and {@link REFUSAL_KINDS} belong to `packages/viz` — `BatchVerdict` and
 *   `SummaryFigureKind` — and this package may not import that one. They are declared here and
 *   **asserted against the viewer's own types** by `packages/viz/src/telemetry/schema.test.ts`,
 *   which reads this file's source and compares both directions. A copy nobody checks is what
 *   `docs/26` P-5 forbids; a copy a run checks is a mirror.
 * - `screenKey` and `controlKey` are open-ended by construction — the viewer's screen registry
 *   grows, and `docs/26` § 7.4 says the control registry is owed with the controls. Those are
 *   bounded tokens here and closed lists in the client, which is the honest division: the server
 *   bounds what can be stored, and the product decides what it means.
 */

import { AWT_INVALID_GROUNDS } from '@elevator-sim/core';

/* -------------------------------------------------------------------------- *
 * The constants § 7 fixes
 * -------------------------------------------------------------------------- */

/**
 * § 7.1. An unknown version is **refused**, never guessed at — the both-directions refusal
 * `persist/types.ts` and `everyday/profile.ts` already make about their own envelopes.
 */
export const TELEMETRY_SCHEMA_VERSION = 1;

/** § 7.1's cap on one batch. Over it, the client flushes; over the session cap, it drops. */
export const MAX_EVENTS_PER_BATCH = 64;

/**
 * § 5.1's horizon for a raw event: **90 days from receipt**.
 *
 * Derived there rather than chosen: `docs/26 K4` needs a 7-day return window plus the cohort's own
 * day, and a KPI is read as a trend, so a quarter is the shortest horizon over which a
 * build-to-build movement can be seen with the previous build's cohort still present.
 *
 * It is enforced by {@link Store}'s sweep rather than documented — § 5.2 — which is the difference
 * between a horizon and an intention.
 */
export const RAW_EVENT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * The longest session this schema will accept an `atMs` inside: **24 hours**.
 *
 * Not a play-length claim. It is the bound that stops `atMs` being an unbounded integer, and it is
 * far above `docs/26 K3`'s ten minutes and above any session a tab survives. A batch carrying a
 * larger one is a batch whose clock is not the monotonic session clock § 7.1 specifies.
 */
export const MAX_SESSION_ELAPSED_MS = 24 * 60 * 60 * 1000;

/** § 7.1's `atMs` resolution. A value that is not a multiple of this is refused, not rounded. */
export const AT_MS_RESOLUTION_MS = 100;

/** The two random ids of § 3.1 and § 3.4: 128 bits, lower-case hex, exactly 32 characters. */
export const ID_PATTERN = /^[0-9a-f]{32}$/u;

/**
 * `buildId`'s bound. `packages/viz/src/release/version.ts` produces a ten-character commit or the
 * word it uses for a tree that was never bundled, so 64 is generous and still a bound.
 */
export const MAX_BUILD_ID_CHARS = 64;

/** The bound on a vocabulary token — a screen key, a control key. */
export const MAX_TOKEN_CHARS = 64;

/**
 * What a vocabulary token may look like.
 *
 * Lower-case letters, digits and hyphens. That is the shape every key the viewer declares already
 * has — screen keys, dispatcher ids, refusal grounds — and it is narrow enough that a sentence, a
 * name, an address or a URL cannot be spelled in it. P-4 as a character class.
 */
const TOKEN_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;

function isVocabularyToken(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_TOKEN_CHARS && TOKEN_PATTERN.test(value);
}

/* -------------------------------------------------------------------------- *
 * The vocabularies
 * -------------------------------------------------------------------------- */

/**
 * § 7.2 and § 7.3's ten events, in the table's own order.
 *
 * **This tuple is the allowlist and there is no second one.** An eleventh event is a row in
 * `docs/26` § 7 with a question and a KPI beside it, an entry here, an entry in {@link FIELDS_OF},
 * and a non-test emitter in the client — and `packages/viz/src/telemetry/schema.test.ts` asserts
 * every one of those, in both directions.
 */
export const TELEMETRY_EVENT_NAMES = [
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

export type TelemetryEventName = (typeof TELEMETRY_EVENT_NAMES)[number];

/**
 * § 7.4's `refusalGround`: the grounds on which a run refuses its own mean.
 *
 * **Imported rather than listed.** `core`'s `metrics/awtValidity.ts` makes a ground *be* its entry
 * in one table, precisely so a list-driven consumer cannot go on reporting four when there are
 * five. This is such a consumer, and a hand-written tuple here would be that defect one package
 * along.
 */
export const REFUSAL_GROUNDS: readonly string[] = AWT_INVALID_GROUNDS;

/**
 * § 7.4's `verdictKind` — **and it is two shipped classifications rather than the one § 7.4 names,
 * which is a deviation from the specification and is deliberate.**
 *
 * § 7.4 says this vocabulary is *"the shipped comparison row's own classification —
 * `BatchComparisonRow.verdict` and `favours`"*. That is a real classification and it is the wrong
 * one for the event that matters: `docs/26 K2`'s chain is the five beats of `docs/23` § 3.2 — the
 * **daily loop** — and beat 5's verdict on the daily report screen is
 * `packages/viz/src/shift/types.ts#ShapedDayReport.verdict`, `cleared | missed | ungraded`.
 * `BatchVerdict` is drawn on a different screen, the § 12 bench.
 *
 * Both are shipped classifications read from the surface that drew them, so P-5 is satisfied by
 * either; taking only § 7.4's would have left `docs/26 K2` unmeasurable on the loop it is a claim
 * about, and taking only the daily one would have left the bench's verdict uncountable. The
 * accepted set is therefore the union, the two are declared separately with their sources, and
 * every event carries `screenKey`, so an analyst can always say which surface a verdict came from.
 * The two sets are disjoint, which is checked rather than assumed.
 *
 * `favours` is **not** carried, and that is § 2.3's rule rather than an oversight: no KPI in § 6
 * reads which arm won, and a field that answers no stated question does not ship.
 *
 * **A `DECISIONS.md` number is owed for this and is not taken here.** [§ D405](../../../../DECISIONS.md)
 * says an entry is owed when a decision reaches past the module that took it, and this one does: it
 * departs from `docs/26` § 7.4, a document this module does not own. GitHub issue #340's lane holds
 * no allocated block, and § D404 forbids taking a number from `CHARTER_PROGRAMME.md`'s next-free
 * row — two lanes reading that row both computed § D336. So the argument lives here in full and the
 * allocation is named in the lane's report, which is the honest order: a number nobody reserved is
 * worse than a number not yet assigned.
 */
export const DAY_VERDICT_KINDS = ['cleared', 'missed', 'ungraded'] as const;

/** `packages/viz/src/batch/report.ts#BatchVerdict` — the § 12 bench's comparison row. */
export const BATCH_VERDICT_KINDS = [
  'resolved',
  'under-budget',
  'unresolved',
  'shown',
  'suppressed',
  'unmeasured',
] as const;

/** The union {@link DAY_VERDICT_KINDS} and {@link BATCH_VERDICT_KINDS} form. */
export const VERDICT_KINDS: readonly string[] = Object.freeze([
  ...DAY_VERDICT_KINDS,
  ...BATCH_VERDICT_KINDS,
]);

/**
 * § 7.4's `refusalKind` — **and the same deviation, for the same reason.**
 *
 * § 7.4 names `SummaryFigure.kind` (`packages/viz/src/render/runSummary.ts`), which is the
 * *Engineer* run-summary's classification. The figure a player meets in the daily loop is a
 * `ReportFigure`, and what classifies it is `packages/viz/src/shift/types.ts#FigureTone`. Both
 * ship, both are read off the surface that drew them, and the accepted set is the union.
 *
 * **Two members of each are not refusals**, and the field takes them anyway. `observation` and
 * `plain` are ordinary figures; `unranked` is § D106's *may-not-be-ranked* energy pair, which is a
 * different thing from a refusal and must not be counted as one. Narrowing the field to the members
 * that *look* like refusals would be the client deciding what a refusal is, which is exactly what
 * P-5 forbids — so the vocabulary is the surface's whole classification and the analysis reads
 * which member arrived.
 */
export const SUMMARY_FIGURE_KINDS = ['observation', 'estimate', 'suppressed', 'absent'] as const;

/** `packages/viz/src/shift/types.ts#FigureTone` — the daily report's own figure classification. */
export const FIGURE_TONES = [
  'plain',
  'good',
  'caution',
  'hot',
  'bad',
  'withheld',
  'unranked',
] as const;

/** The union {@link SUMMARY_FIGURE_KINDS} and {@link FIGURE_TONES} form. */
export const REFUSAL_KINDS: readonly string[] = Object.freeze([
  ...SUMMARY_FIGURE_KINDS,
  ...FIGURE_TONES,
]);

/** § 7.4's `endReason`. Three values, closed. */
export const END_REASONS = ['hidden', 'navigated', 'unknown'] as const;

/* -------------------------------------------------------------------------- *
 * The field table — § 7.2 and § 7.3, as code
 * -------------------------------------------------------------------------- */

/** How one field of one event is checked. */
type FieldCheck = (value: unknown) => boolean;

const isRunPointer: FieldCheck = (value) => runPointerIssues(value).length === 0;

const oneOf =
  (allowed: readonly string[]): FieldCheck =>
  (value) =>
    typeof value === 'string' && allowed.includes(value);

const nullable =
  (check: FieldCheck): FieldCheck =>
  (value) =>
    value === null || check(value);

const isBoolean: FieldCheck = (value) => typeof value === 'boolean';

/** A count of milliseconds a client measured about itself: a non-negative, bounded integer. */
const isElapsedMs: FieldCheck = (value) =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= MAX_SESSION_ELAPSED_MS;

/** A moment inside a simulated day, in simulated seconds. Bounded by the day. */
const isRunSecond: FieldCheck = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 86_400;

/**
 * Every event's fields, and **exactly** its fields.
 *
 * Read in both directions by {@link eventIssues}: a field named here and absent is a refusal, and
 * a field present and not named here is a refusal. `docs/26` § 7's table is the source, and the
 * ordering matches it so a reader can hold the two side by side.
 */
const FIELDS_OF: Readonly<Record<TelemetryEventName, Readonly<Record<string, FieldCheck>>>> =
  Object.freeze({
    session_start: Object.freeze({ entryScreenKey: isVocabularyToken }),
    run_observed: Object.freeze({ run: isRunPointer, reachedEndedAt: isBoolean }),
    trouble_visible: Object.freeze({ run: isRunPointer, atRunS: isRunSecond }),
    change_made: Object.freeze({ controlKey: isVocabularyToken, screenKey: isVocabularyToken }),
    rerun_same_crowd: Object.freeze({ run: isRunPointer, crowdHeld: isBoolean }),
    verdict_shown: Object.freeze({
      verdictKind: oneOf(VERDICT_KINDS),
      refusalGround: nullable(oneOf(REFUSAL_GROUNDS)),
      screenKey: isVocabularyToken,
    }),
    session_end: Object.freeze({ endReason: oneOf(END_REASONS) }),
    screen_entered: Object.freeze({
      screenKey: isVocabularyToken,
      fromScreenKey: nullable(isVocabularyToken),
    }),
    refusal_shown: Object.freeze({
      refusalKind: oneOf(REFUSAL_KINDS),
      screenKey: isVocabularyToken,
    }),
    cold_load: Object.freeze({ msToInteractive: isElapsedMs }),
  });

/*
 * **There is deliberately no `fieldsOf(name)` accessor here**, and the absence is worth a sentence
 * because writing one was the first thing that occurred to this module.
 *
 * It would have had exactly one caller — a test asserting that each event's field set matches
 * `docs/26` § 7's table — which is the dead-seam shape `CLAUDE.md` opens with, and it would have
 * tested a *mirror* of {@link FIELDS_OF} rather than the gate anyone actually meets. The test that
 * replaces it drives {@link eventIssues} instead: for every name, an event missing each field in
 * turn is refused, and an event carrying a surplus one is refused. That exercises the same table
 * through the code that reads it in production.
 */

/* -------------------------------------------------------------------------- *
 * The run pointer — § 2.1, and the type is not reinvented
 * -------------------------------------------------------------------------- */

/**
 * The run pointer a telemetry event carries, checked against the **submission**'s own shape.
 *
 * `docs/26` § 2.1: *"The pointer's type already exists and a second one may not be invented."* It
 * is `leaderboard/submission.ts#SubmittedRun`, and this function is deliberately a *shape* check
 * over the same seven fields rather than a second type: `submissionIssues` bounds a submission
 * because a submission commands a simulation, and a telemetry row commands nothing, so the two
 * gates are sized for different threats and must not be confused.
 *
 * What they share is what a pointer **is**, and that is asserted rather than described:
 * `telemetry/schema.test.ts` builds a valid `SubmittedRun` and requires this to accept it, and
 * requires the field set here to equal the pointer's own required fields.
 *
 * The two Everyday fields `SubmittedRun` gained at § D440 — `ruleRows` and `interventions` — are
 * **not** accepted here and their absence is the decision. They are arrays of objects; accepting
 * them would put an unbounded structure on an unauthenticated route for a question no KPI in § 6
 * asks, and § 2.3's own rule is that a field which answers no stated question does not ship. A
 * pointer that reaches a replay without them is a pointer to the run as the dispatcher profile
 * alone drove it, which is what every KPI here reads.
 */
export function runPointerIssues(value: unknown): readonly string[] {
  const issues: string[] = [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return Object.freeze(['run must be an object']);
  }
  const run = value as Record<string, unknown>;
  const surplus = Object.keys(run).filter((key) => !RUN_POINTER_FIELDS.includes(key));
  if (surplus.length > 0) issues.push(`run carries fields this schema does not accept: ${surplus.join(', ')}`);

  /*
   * **Bounded as vocabulary tokens, which is narrower than `submissionIssues` bounds them**, and
   * the difference is P-4 rather than an inconsistency.
   *
   * There the rule is *a non-empty id under 64 characters*, which is the right bound for a route
   * whose next step is a simulation: it is guarding CPU, and a 55-character id that resolves to
   * nothing simply fails to resolve. Here the row is **stored**, so the question is not *can this
   * be resolved* but *can a person's words arrive in it* — and a length bound alone lets a whole
   * sentence through, which is what this file's own test found.
   *
   * The narrowing costs nothing: every id `data/` ships is token-shaped (35 of 35, checked when
   * this was written), and a reader's saved building or dispatcher takes its id from
   * `dev/dispatcherEditor.ts#nextSavedId`, which composes `<prefix>-<n>` and cannot produce
   * anything else. What a player *types* is a saved thing's **name**, which is not this field.
   */
  for (const key of ['buildingId', 'dispatcherProfileId', 'demandTemplateId'] as const) {
    if (!isVocabularyToken(run[key])) {
      issues.push(
        `run.${key} must be a lower-case id of at most ${String(MAX_TOKEN_CHARS)} characters`,
      );
    }
  }
  if (typeof run['seed'] !== 'string' || !/^\d{1,20}$/u.test(run['seed'])) {
    issues.push('run.seed must be 1–20 decimal digits');
  }
  const duration = run['durationS'];
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0 || duration > 86_400) {
    issues.push('run.durationS must be a positive number of seconds within a day');
  }
  const rate = run['arrivalRatePctPop5min'];
  if (rate !== null && (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0 || rate > 100)) {
    issues.push('run.arrivalRatePctPop5min must be null or a percentage in (0, 100]');
  }
  const windowStartS = run['windowStartS'];
  if (
    windowStartS !== null &&
    (typeof windowStartS !== 'number' || !Number.isFinite(windowStartS) || windowStartS < 0 || windowStartS >= 86_400)
  ) {
    issues.push('run.windowStartS must be null or a second within a day');
  }
  return Object.freeze(issues);
}

/** The seven fields of § 2.1's pointer, in `SubmittedRun`'s own order. */
export const RUN_POINTER_FIELDS: readonly string[] = Object.freeze([
  'buildingId',
  'dispatcherProfileId',
  'demandTemplateId',
  'arrivalRatePctPop5min',
  'durationS',
  'windowStartS',
  'seed',
]);

/* -------------------------------------------------------------------------- *
 * The batch
 * -------------------------------------------------------------------------- */

/** One event, as it arrives. The fields beyond the two common ones are {@link FIELDS_OF}'s. */
export interface TelemetryEvent {
  readonly name: TelemetryEventName;
  /** Session-elapsed milliseconds, rounded to {@link AT_MS_RESOLUTION_MS}. Never a wall clock. */
  readonly atMs: number;
  readonly [field: string]: unknown;
}

/** § 7.1's envelope. The identity is on the batch, so a single event has none of its own. */
export interface TelemetryBatch {
  readonly schemaVersion: number;
  readonly buildId: string;
  readonly playerId: string;
  readonly sessionId: string;
  readonly events: readonly TelemetryEvent[];
}

/**
 * Everything wrong with a batch, or an empty list.
 *
 * A list rather than a throw, and rather than a boolean, for `submissionIssues`' reason: the route
 * answers `400` with the issues in the body, so a client that is one field out is told which field
 * instead of being told *no*.
 *
 * **It never mutates and never trims.** A batch with one bad event is refused whole. Accepting the
 * good half would make the client's own idea of the schema and the server's diverge silently,
 * which is the state P-3's both-directions test exists to prevent — and a client cannot fix a
 * defect it is never told about.
 */
export function batchIssues(value: unknown): readonly string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return Object.freeze(['a telemetry batch must be an object']);
  }
  const batch = value as Record<string, unknown>;
  const issues: string[] = [];

  if (batch['schemaVersion'] !== TELEMETRY_SCHEMA_VERSION) {
    issues.push(`schemaVersion must be ${String(TELEMETRY_SCHEMA_VERSION)}`);
  }
  const buildId = batch['buildId'];
  if (typeof buildId !== 'string' || buildId.length === 0 || buildId.length > MAX_BUILD_ID_CHARS) {
    issues.push(`buildId must be a non-empty string under ${String(MAX_BUILD_ID_CHARS)} characters`);
  }
  for (const key of ['playerId', 'sessionId'] as const) {
    const id = batch[key];
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
      issues.push(`${key} must be 32 lower-case hexadecimal characters`);
    }
  }
  const events = batch['events'];
  if (!Array.isArray(events)) {
    issues.push('events must be an array');
    return Object.freeze(issues);
  }
  if (events.length === 0) issues.push('events must not be empty');
  if (events.length > MAX_EVENTS_PER_BATCH) {
    issues.push(`events must not exceed ${String(MAX_EVENTS_PER_BATCH)} entries`);
  }
  for (const [index, event] of events.entries()) {
    for (const issue of eventIssues(event)) issues.push(`events[${String(index)}]: ${issue}`);
  }
  return Object.freeze(issues);
}

/** Everything wrong with one event. Exported for the test that drives each name in turn. */
export function eventIssues(value: unknown): readonly string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return Object.freeze(['an event must be an object']);
  }
  const event = value as Record<string, unknown>;
  const name = event['name'];
  if (typeof name !== 'string' || !(TELEMETRY_EVENT_NAMES as readonly string[]).includes(name)) {
    return Object.freeze([`name must be one of ${TELEMETRY_EVENT_NAMES.join(', ')}`]);
  }
  const issues: string[] = [];
  const atMs = event['atMs'];
  if (
    typeof atMs !== 'number' ||
    !Number.isInteger(atMs) ||
    atMs < 0 ||
    atMs > MAX_SESSION_ELAPSED_MS ||
    atMs % AT_MS_RESOLUTION_MS !== 0
  ) {
    issues.push(
      `atMs must be a whole number of milliseconds since the session began, ` +
        `a multiple of ${String(AT_MS_RESOLUTION_MS)}, at most ${String(MAX_SESSION_ELAPSED_MS)}`,
    );
  }
  const fields = FIELDS_OF[name as TelemetryEventName];
  for (const [field, check] of Object.entries(fields)) {
    if (!(field in event)) {
      issues.push(`${name} must carry ${field}`);
      continue;
    }
    if (!check(event[field])) issues.push(`${name}.${field} is not a value this schema accepts`);
  }
  const surplus = Object.keys(event).filter((key) => key !== 'name' && key !== 'atMs' && !(key in fields));
  if (surplus.length > 0) {
    issues.push(`${name} carries fields this schema does not accept: ${surplus.join(', ')}`);
  }
  return Object.freeze(issues);
}
