/**
 * **Turning a run into a record, and a record back into a run.**
 *
 * GAMEPLAY § 14.1, ENGINE_CONTRACT § 1.5. Recorded here rather than in `DECISIONS.md`, under
 * § D405; the directory's one ruling is § D407.
 *
 * ## The one question this module answers twice
 *
 * *Can this run be re-asked from its own record?* — which is `scope/runIdentity.ts`'s question with
 * a different artefact in it, and that is why this module **calls** `runIdentityIssues` rather than
 * enumerating refusals of its own. That module's docstring says what a second answer costs:
 *
 * > Two answers to this question is not a tidiness problem; it is the one disagreement a
 * > replay-verified leaderboard cannot survive.
 *
 * The same sentence points here. A record that is *looser* than the truth writes a row whose
 * `Watch it` button replays a different run and calls it somebody's day; a record that is
 * *stricter* silently drops days that would have replayed perfectly. Both are worse than the gate
 * being visible, so the gate is `runIdentityIssues` plus {@link WATCH_RECORD_CARRIES}, which is a
 * table of exactly what this artefact carries that a submission does not.
 *
 * ## Why the record carries three things a submission cannot
 *
 * `EXPRESSIBLE_IN_A_SELECTION` is *what the wire holds*. This record is not the wire — it is a
 * local file and a local slot — so it can hold what the wire cannot, and each of the three is a
 * field `runIdentityIssues` refuses for the leaderboard **naming the wire as the reason**:
 *
 * - `interventions` — refused there because *"no selection or submission carries an intervention
 *   log"*. Contract § 1.4 makes the log part of the run, and § 1.5 makes it part of what a
 *   spectator watches; a record without it is the *"replay without it is a different run"* the
 *   refusal itself names.
 * - `outOfServiceCarIds` — refused there because *"nothing in a selection holds one"*.
 * - `week` — refused there because growth and the day's event *"do not travel with a selection"*.
 *   The record carries `day` and `dayIdx`, from which `growth.ts` re-derives the growth and
 *   `events.ts#eventFor` re-derives the event.
 *
 * Nothing else is added, and the three that are added are added **as a table a test can read**
 * rather than as three `filter` clauses, so a fourth cannot be smuggled in by a one-line edit.
 *
 * ## The one refusal this module adds that `runIdentityIssues` does not make
 *
 * A **calendar period that books the day's event**. `scope/runIdentity.ts`'s `calendar` arm refuses
 * on `calendarAsks`, whose vocabulary is derived from `CalendarShift`'s *demand* fields —
 * `populationFactor`, `splitBias`, `demandTemplateId`, `goodsCars` — and `eventId` is not among
 * them. It did not need to be: the `week` arm catches a booked event through `scheduledEventFor`,
 * which consults the period. This module removes the `week` arm — because the record carries the
 * day pair — and removing it would take that catch with it. So the catch is restated here, on the
 * period rather than on the week, which is also where issue #129's own argument says a
 * calendar-caused refusal belongs.
 *
 * That is the whole of the subtraction's cost, it is stated rather than discovered, and
 * `record.test.ts` drives a booked-event period through both functions to prove the arm is load
 * bearing rather than decorative.
 */

import {
  isInterventionKind,
  RULE_ACTIONS,
  RULE_CONDITIONS,
  SERVICE_MODES,
  type RunInterventionConfig,
  type SimulationConfig,
} from '@elevator-sim/core/browser';

// `dispatcherSpec.ts` and `selectorSpec.ts` both export a `specFromProfile`, over different
// shapes. They are aliased at every site that needs both — `selectorSpec.ts`'s own naming hazard.
import {
  specFromProfile as selectorSpecFromProfile,
  selectorContextFrom,
} from '../authoring/selectorSpec.js';
import { DEFAULT_LEVERS, specFromProfile } from '../authoring/dispatcherSpec.js';
import { specFromTrafficProfile } from '../authoring/patternSpec.js';
import { specFromBuilding } from '../authoring/buildingSpec.js';
import type { BrowserResources } from '../dev/data.js';
import {
  buildingConfigOf,
  profileById,
  shiftRunConfigOf,
  type ViewerState,
} from '../dev/state.js';
import { runIdentityIssues } from '../scope/runIdentity.js';
import type { ScopeIssue } from '../scope/types.js';
import { calendarDayFor } from '../shift/calendar.js';

import { WATCH_RECORD_VERSION, type WatchRecord } from './types.js';

/**
 * The `viewer.` fields a {@link WatchRecord} carries that a selection does not, and the field of
 * the record that carries each.
 *
 * The sibling of `scope/runIdentity.ts#EXPRESSIBLE_IN_A_SELECTION`, and deliberately the same
 * shape: a row with no field behind it is the premise that produced issue #129's bug, so every
 * value here names the field of {@link WatchRecord} that holds it. `record.test.ts` asserts the key
 * set against `WatchRecord`'s own keys, in both directions, so a row added without a field is red.
 *
 * Keyed by `SurfaceKey` — `viewer.week`, not `week` — because that is what a {@link ScopeIssue}
 * carries and matching on the issue's own key is what makes the subtraction checkable rather than
 * string-sliced.
 */
export const WATCH_RECORD_CARRIES: Readonly<Record<string, string>> = Object.freeze({
  'viewer.week': 'WatchRecord.day and .dayIdx — growth.ts re-derives the growth, events.ts#eventFor the event',
  'viewer.interventions': 'WatchRecord.interventions, in press order — contract § 1.4',
  'viewer.outOfServiceCarIds': 'WatchRecord.outOfServiceCarIds',
  /*
   * The fourth, added by `docs/20` defect 1 — and it is the row that shows why this table is a
   * table rather than three `filter` clauses.
   *
   * `runIdentityIssues` refuses a rule list **naming the wire as the reason**: *"no selection or
   * submission carries a rule list"*. That is true of the wire and says nothing about the rules,
   * which are four scalars per row that `localStorage` already round-trips. Meanwhile the refusal's
   * effect here was total: one rule made every day filed afterwards unwatchable, under a message
   * blaming the file format, because the rule row is session state and survives the run that wrote
   * it. Carrying them is cheap, exact and reversible; declining to was neither honest nor free.
   */
  'viewer.ruleRows': 'WatchRecord.ruleRows, in first-match order — authoring/ruleSpec.ts#RuleRow',
});

/** Why a period that books today's event is refused — one sentence, so a test can match it. */
export const PERIOD_BOOKS_THE_EVENT =
  'a calendar period books this day’s event, and a record carries the week’s own day rather than ' +
  'a period — replayed without it, the day would run the event the ordinary schedule gives it';

/**
 * Everything about this state that stops the run being re-askable from a record, or an empty array.
 *
 * All of them, never the first — `runIdentityIssues`' rule, inherited with its derivation.
 */
export function watchRecordIssues(
  state: ViewerState,
  resources: BrowserResources,
): readonly ScopeIssue[] {
  const issues = runIdentityIssues(state, resources, 'ranked').filter(
    (issue) => WATCH_RECORD_CARRIES[issue.key] === undefined,
  );
  /*
   * The arm the subtraction above would otherwise have removed. See the module docstring: the
   * period's booked event is caught by `runIdentityIssues`' **week** arm, through
   * `scheduledEventFor`, and `calendarAsks` has no vocabulary for it.
   */
  const booked = calendarDayFor(state.calendar, state.week.day, state.week.dayIdx)?.shift.eventId;
  if (booked != null) {
    issues.push({ key: 'viewer.calendar', scope: 'between-games', message: PERIOD_BOOKS_THE_EVENT });
  }
  return Object.freeze(issues);
}

/**
 * The record for this state, or `undefined` when {@link watchRecordIssues} has anything to say.
 *
 * **`undefined` rather than a record with a caveat**, and that is § 1.5's own rule pointed at the
 * write side: a record that cannot be replayed exactly is not a weaker record, it is not a record.
 * The row a day like that produces says `no-record` and says why, which is the honest outcome and
 * the one `watch/library.ts` renders.
 */
export function watchRecordOf(
  state: ViewerState,
  resources: BrowserResources,
): WatchRecord | undefined {
  if (watchRecordIssues(state, resources).length > 0) return undefined;
  return {
    version: WATCH_RECORD_VERSION,
    seed: state.seed.toString(),
    buildingId: state.buildingId,
    dispatcherId: state.dispatcherId,
    pattern: state.pattern,
    demandTemplateId: state.freePlay?.demandTemplateId ?? null,
    arrivalRatePctPop5min: state.freePlay?.arrivalRatePctPop5min ?? null,
    shiftLengthS: state.shiftLengthS,
    windowStartS: state.windowStartS,
    day: state.week.day,
    dayIdx: state.week.dayIdx,
    outOfServiceCarIds: [...state.outOfServiceCarIds],
    interventions: state.interventions.map((entry) => ({ atS: entry.atS, change: entry.change })),
    /*
     * The rows as the player wrote them, never the profile they make — see
     * `types.ts#WatchRecord.ruleRows`. Copied field by field rather than spread, so a `RuleRow`
     * that grows a key does not silently enter a persisted record without a version to say so.
     */
    ruleRows: state.ruleRows.map((row) => ({
      when: row.when,
      ...(row.whenValue === undefined ? {} : { whenValue: row.whenValue }),
      then: row.then,
      ...(row.thenValue === undefined ? {} : { thenValue: row.thenValue }),
    })),
  };
}

/**
 * **Why this day cannot be re-asked, in the words of the issue that fired** — or `null` when it can.
 *
 * `docs/20` defect 1's first half, and the defect was as much in the *sentence* as in the gate. A
 * day whose record was refused produced a picker row reading *"this day was filed without the
 * record of what it ran, so there is nothing to re-simulate — days closed from here on carry one"*.
 * Both clauses misled: the file format was not the reason, and *from here on* was false, because
 * whatever refused this day refuses the next one identically — the audit re-ran and re-filed the
 * same day on a shipped dispatcher and watched it stay unwatchable.
 *
 * `watchRecordIssues` has always known which issue fired. This is that knowledge, kept, so the row
 * can say *what to change* instead of describing a gap in a file.
 *
 * ## Why it is a string rather than the issues
 *
 * Because it is **persisted**, on the day outcome, beside the `null` record it explains — a day
 * outlives the state that produced it, and nothing can re-derive an old day's refusal from a state
 * nobody kept. A `ScopeIssue[]` in `localStorage` would be a second copy of a shape `scope/` owns,
 * versioned by this package, going stale on the day a key is renamed. The sentence is the part a
 * reader needs and the only part that survives being stored.
 *
 * All of them, joined, never the first — `runIdentityIssues`' own rule, inherited with its reason:
 * a reader told about one and then about the next has been made to guess how many there are.
 */
export function recordRefusalFor(
  state: ViewerState,
  resources: BrowserResources,
): string | null {
  const issues = watchRecordIssues(state, resources);
  if (issues.length === 0) return null;
  return issues.map((issue) => issue.message).join('; ');
}

/** Why a record cannot be turned back into a run here, or `null`. */
export function recordUnreadableReason(
  record: WatchRecord,
  resources: BrowserResources,
): string | null {
  if (record.version !== WATCH_RECORD_VERSION) {
    return (
      `this record was written to shape ${String(record.version)} and this build reads shape ` +
      `${String(WATCH_RECORD_VERSION)}, so re-simulating it would be a guess at what changed`
    );
  }
  if (!resources.entries.some((entry) => entry.config.id === record.buildingId)) {
    return `this build does not ship the building “${record.buildingId}”`;
  }
  if (!resources.dispatcherProfiles.profiles.some((p) => p.id === record.dispatcherId)) {
    return `this build does not ship the dispatcher “${record.dispatcherId}”`;
  }
  if (
    record.pattern !== 'building' &&
    !resources.trafficProfiles.profiles.some((p) => p.id === record.pattern)
  ) {
    return `this build does not ship the arrival pattern “${record.pattern}”`;
  }
  /*
   * The intervention log, kind and payload — on the ids' footing, and on the promise
   * `persist/validate.ts` and `watch/reference.ts` both make in as many words: the log is
   * *"passed through as data; `core` owns what an `InterventionChange` may be and refuses what
   * it does not recognise"*. `core` keeps that promise with a throw at scheduling time; a stored
   * record deserves the same refusal as a **row** rather than a mid-replay exception, so each
   * entry is checked here through the guard and the vocabularies `core` exports — one source,
   * two refusal surfaces, never a second copy of the union's cases.
   *
   * The payload checks exist because these are the first arms **with** payloads (review
   * finding 5): the persisted shape check is deliberately shallow (*"a list of objects and no
   * further"*), so a corrupt `switch-dispatcher` profile would otherwise reach `resolveWeights`
   * as a raw `TypeError` mid-replay, and an `answer-incident` effect with an out-of-vocabulary
   * mode would be applied silently — `Car.setMode` stores any string — which is § 1.5's
   * *approximate replay*, the one outcome this gate exists to forbid. `core` refuses both
   * loudly at scheduling time; this is the same refusal wearing a picker row.
   */
  for (const [index, entry] of record.interventions.entries()) {
    const reason = interventionUnreadableReason(entry, index);
    if (reason !== null) return reason;
  }
  /*
   * The rule vocabulary, on exactly the footing the three ids above sit on — `docs/20` defect 1. A
   * record naming a condition or an action this build no longer declares cannot be re-asked, and
   * the honest answer is the same sentence shape rather than a row that replays the run with the
   * unknown rule quietly dropped. `profileWithRules` would accept the row and
   * `selection.policy: 'rules'` would then decide by a rule nothing implements, which is a replay
   * that is *approximate* — § 1.5's own forbidden outcome.
   */
  for (const row of record.ruleRows) {
    if (!(RULE_CONDITIONS as readonly string[]).includes(row.when)) {
      return `this build does not ship the rule condition “${row.when}”`;
    }
    if (!(RULE_ACTIONS as readonly string[]).includes(row.then)) {
      return `this build does not ship the rule action “${row.then}”`;
    }
  }
  return null;
}

/**
 * Why one stored intervention entry cannot be re-asked, or `null` — {@link recordUnreadableReason}'s
 * per-entry half. The types say the entry is well-shaped; a record off `localStorage` or a
 * fixture file can lie, so every read below is a runtime question about untrusted data, and the
 * answers keep the file's sentence shape: *this build does not ship X* for a vocabulary miss,
 * *would be a guess* for a payload the shape check cannot vouch for.
 */
function interventionUnreadableReason(
  entry: RunInterventionConfig,
  index: number,
): string | null {
  const guess = (what: string): string =>
    `this record’s intervention ${String(index + 1)} ${what}, so re-simulating it would be a guess at what it changed`;
  const raw = entry as unknown as { readonly atS?: unknown; readonly change?: unknown };
  if (typeof raw.atS !== 'number' || !Number.isFinite(raw.atS)) {
    return guess('carries no simulated second');
  }
  const change = raw.change as
    | { readonly kind?: unknown; readonly [key: string]: unknown }
    | null
    | undefined;
  if (change === null || typeof change !== 'object' || typeof change['kind'] !== 'string') {
    return guess('carries no change kind');
  }
  if (!isInterventionKind(change['kind'])) {
    return `this build does not ship the intervention kind “${change['kind']}”`;
  }
  if (change['kind'] === 'switch-dispatcher') {
    const profile = change['profile'] as
      | { readonly id?: unknown; readonly name?: unknown; readonly weights?: unknown }
      | null
      | undefined;
    const weights = profile?.weights;
    const weightsAreARecord =
      typeof weights === 'object' &&
      weights !== null &&
      !Array.isArray(weights) &&
      Object.values(weights).every((value) => typeof value === 'number' && Number.isFinite(value));
    if (
      profile === null ||
      typeof profile !== 'object' ||
      typeof profile.id !== 'string' ||
      profile.id.length === 0 ||
      typeof profile.name !== 'string' ||
      !weightsAreARecord
    ) {
      return guess('switches to a dispatcher whose profile is not shaped like one');
    }
  }
  if (change['kind'] === 'answer-incident') {
    if (typeof change['option'] !== 'string' || change['option'].length === 0) {
      return guess('answers an incident with no option words');
    }
    const effects = change['serviceEvents'];
    if (!Array.isArray(effects)) {
      return guess('answers an incident with no effect list');
    }
    for (const effect of effects as readonly {
      readonly atS?: unknown;
      readonly bankId?: unknown;
      readonly carId?: unknown;
      readonly mode?: unknown;
    }[]) {
      if (
        effect === null ||
        typeof effect !== 'object' ||
        typeof effect.atS !== 'number' ||
        !Number.isFinite(effect.atS) ||
        typeof effect.bankId !== 'string' ||
        effect.bankId.length === 0 ||
        typeof effect.carId !== 'string' ||
        effect.carId.length === 0
      ) {
        return guess('answers an incident with an effect that names no car and no second');
      }
      if (
        typeof effect.mode !== 'string' ||
        !(SERVICE_MODES as readonly string[]).includes(effect.mode)
      ) {
        return `this build does not ship the service mode “${String(effect.mode)}”`;
      }
    }
  }
  return null;
}

/**
 * The `ViewerState` a record describes — the input `shiftRunConfigOf` turns back into the run.
 *
 * ## Why a whole state rather than a `SimulationConfig` built here
 *
 * Because `dev/state.ts` says so in its own words: *"**nothing outside this module decides what a
 * run is**"*. A `SimulationConfig` assembled in this file would be a second answer to that, and it
 * would be the answer that goes stale — the composition order in `shiftRunConfigOf` is five steps
 * long and every one of them is load bearing. So this builds the *question* and hands it to the one
 * function that turns questions into runs.
 *
 * ## Why every unrecorded field is written explicitly rather than inherited from `base`
 *
 * `base` supplies the shape and nothing else. Every field the record does not carry is set here to
 * the value the record's own existence asserts it had — because `watchRecordOf` refused to write
 * the record otherwise. Inheriting them from a live `ViewerState` would let the *spectator's* own
 * levers, patience curve or commissioned fabric leak into somebody else's day, which is the exact
 * failure the whole module exists to prevent, arriving through the reconstruction rather than
 * through the storage.
 *
 * `dispatcherSpec`, `selectorSpec` and `ruleRows` are re-seeded from the **record's** dispatcher
 * rather than from `base`'s, for the same reason and one step further in: `initialState` seeds them
 * from whatever profile the page opened on, and a selector spec belonging to a different profile is
 * what `runIdentityIssues`' `selectorSpec` arm refuses by name.
 */
export function stateFromWatchRecord(
  base: ViewerState,
  resources: BrowserResources,
  record: WatchRecord,
): ViewerState {
  const profile = profileById(resources, [], record.dispatcherId);
  const building = buildingConfigOf(resources, [], record.buildingId);
  return {
    ...base,
    /*
     * `free-play`, and it is a statement about ownership rather than a convenience. `advancesTheWeek`
     * is false for it, so nothing this state reaches can close a day into a week — the second lock
     * behind `bankingRefusalFor`'s identity gate, and the one that holds even if a future caller
     * forgets to keep the watched recording out of `simulatedRecording`.
     */
    playMode: 'free-play',
    calendar: null,
    commissioning: [],
    buildingId: record.buildingId,
    dispatcherId: record.dispatcherId,
    pattern: record.pattern,
    shiftLengthS: record.shiftLengthS,
    windowStartS: record.windowStartS,
    freePlay:
      record.demandTemplateId === null
        ? undefined
        : {
            demandTemplateId: record.demandTemplateId,
            arrivalRatePctPop5min: record.arrivalRatePctPop5min,
          },
    seed: BigInt(record.seed),
    outOfServiceCarIds: [...record.outOfServiceCarIds],
    interventions: record.interventions.map((entry) => ({ atS: entry.atS, change: entry.change })),
    levers: DEFAULT_LEVERS,
    selectorSpec: selectorSpecFromProfile(profile, selectorContextFrom(resources.dispatcherProfiles)),
    /*
     * **The record's rows, not the profile's** — `docs/20` defect 1. It was `rulesFromProfile`,
     * which was the only honest answer while the record carried none: the rows a shipped profile
     * declares are the rows its id already implies. Now that the record carries what the *player*
     * wrote, reading the profile instead would replay a rules run with the rules taken out — the
     * exact *"replay without them is a different run"* `runIdentityIssues` refuses by name.
     */
    ruleRows: record.ruleRows.map((row) => ({ ...row })),
    patience: null,
    week: { ...base.week, day: record.day, dayIdx: record.dayIdx },
    savedDispatchers: [],
    savedPatterns: [],
    savedClasses: [],
    savedBuildings: [],
    dispatcherSpec: specFromProfile(profile, profile.name),
    editingDispatcherId: record.dispatcherId,
    patternSpec: specFromTrafficProfile(resources.trafficProfiles, building?.trafficProfile),
    editingPatternId: 'building',
    buildingSpec:
      building === undefined ? base.buildingSpec : specFromBuilding(building, record.buildingId),
    editingBuildingId: record.buildingId,
    recording: undefined,
    report: undefined,
    withheld: [],
    tomorrow: undefined,
  };
}

/**
 * The simulator's question for a record — {@link stateFromWatchRecord} through the one function that
 * decides what a run is.
 *
 * A thin wrapper with a real job: it is the single place a caller can reach a watched run's config,
 * so `dev/main.ts` and the reproduction gate cannot assemble it two ways. The `building`
 * round-trip below it is `shiftRunConfigOf`'s own and is not repeated here.
 */
export function watchRunConfigOf(
  base: ViewerState,
  resources: BrowserResources,
  record: WatchRecord,
): SimulationConfig {
  return shiftRunConfigOf(resources, stateFromWatchRecord(base, resources, record)).config;
}
