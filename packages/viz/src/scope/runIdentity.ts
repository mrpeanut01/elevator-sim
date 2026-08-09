/**
 * *Can this run be reproduced elsewhere from its own selection?* — S5, derived once.
 *
 * ## The two consumers, and why one derivation
 *
 * 1. **`dev/main.ts#provenanceLineOf`** — the *copy a CLI line* control, which refuses rather than
 *    emitting a line the CLI would honour and turn into a **different** run (`UX.md` TP-13).
 * 2. **The leaderboard submit path** — because `packages/server` re-runs a submission from its ids
 *    and accepts the score only if it reproduces (§ D214 § 3).
 *
 * Those are the same question. They were not the same code: `provenanceLineOf` already enumerates
 * the refusals by hand — an unshipped building, an unshipped dispatcher, a saved pattern, a `week.day`
 * that is not 1, an event that changes anything, a held car, a moved lever — and the submit path
 * was about to enumerate them again.
 *
 * **Two answers to this question is not a tidiness problem; it is the one disagreement a
 * replay-verified leaderboard cannot survive.** A client that is *stricter* than the server refuses
 * something the server would have taken and nobody ever finds out. A client that is *looser* posts a
 * run the server cannot reproduce, and the server rejects it as a forgery — so the punishment for
 * the client's bug lands on an honest player, in the one place the product accuses somebody of
 * cheating. `menu/client.test.ts` makes the same argument about password bounds and calls the risk
 * one-directional; here it points both ways and the second direction is worse.
 *
 * ## Why the predicate is the scope table rather than a list
 *
 * The set of state a run may not carry is exactly *"everything outside `between-games`"*, which
 * `surface.ts` already declares and `scope.test.ts` already decides by running both arms. So this
 * module walks `SCOPE_OF` instead of naming fields, and a field added tomorrow with a `within-day`
 * scope is refused here on the day it lands rather than on the day somebody remembers.
 *
 * The three *"yours alone"* refusals are the exception and are kept explicit, because they are not
 * about a scope at all: `buildingId` is `between-games` and perfectly legal to move, and it is still
 * unreproducible when it names a building `data/buildings/` does not ship. That is a question about
 * the **value**, not the field, and only `resources` can answer it.
 */

import { DEFAULT_LEVERS } from '../authoring/dispatcherSpec.js';
import type { BrowserResources } from '../dev/data.js';
import { buildingConfigOf, calendarAskInputOf, type ViewerState } from '../dev/state.js';
import {
  calendarAsks,
  calendarDayFor,
  scheduledEventFor,
  type CalendarAsk,
  type CalendarShift,
} from '../shift/calendar.js';

import { permits } from './permits.js';
import { SCOPE_OF } from './surface.js';
import type { PlayMode, ScopeIssue, SurfaceKey } from './types.js';

/**
 * The `ViewerState` fields this module knows how to inspect, and the scope each is declared at.
 *
 * Derived from {@link SCOPE_OF} rather than listed — the whole point of the module docstring — but
 * *narrowed* to `viewer.` keys, because a `settings.` or `free-play.` key is not a field of the
 * state this predicate is given.
 */
function viewerControls(): readonly { readonly key: SurfaceKey; readonly field: string }[] {
  return Object.entries(SCOPE_OF)
    .filter(([key, entry]) => key.startsWith('viewer.') && entry.kind === 'control')
    .map(([key]) => ({ key: key as SurfaceKey, field: key.slice('viewer.'.length) }))
    .sort((a, b) => a.field.localeCompare(b.field));
}

/**
 * Whether a field is at its reproducible-from-selection value.
 *
 * Only the fields a scope forbids need an answer, so this is a `switch` over those and not over the
 * whole state. A field the table declares a control and this function does not know is a **red
 * test**, not a silent pass — `runIdentity.test.ts` asserts the two agree, which is what stops this
 * switch quietly shrinking as `ViewerState` grows.
 */
function carriesState(
  state: ViewerState,
  resources: BrowserResources,
  field: string,
): string | undefined {
  switch (field) {
    case 'week':
      return weekCarries(state, resources);
    case 'outOfServiceCarIds':
      return state.outOfServiceCarIds.length === 0
        ? undefined
        : `${String(state.outOfServiceCarIds.length)} car(s) are held out of service, and nothing in a selection holds one`;
    case 'levers':
      return state.levers.parking === DEFAULT_LEVERS.parking &&
        state.levers.express === DEFAULT_LEVERS.express &&
        state.levers.dwell === DEFAULT_LEVERS.dwell
        ? undefined
        : 'the group levers are moved off their defaults, and a selection carries no levers';
    case 'savedClasses':
      return state.savedClasses.length === 0
        ? undefined
        : 'a saved machine class widens the specs this building resolves against, and only this browser has it';
    default:
      return undefined;
  }
}

/**
 * **Whether the artefacts that reproduce a run can express the calendar period a day is under.**
 *
 * `false`, and it is a fact about the **artefacts** rather than about the calendar. All three
 * enumerate their fields and none of them has one for a period:
 *
 * | artefact | what it carries | a period? |
 * |---|---|---|
 * | `menu/client.ts#RunSubmission` | building, dispatcher, template, rate, duration, window, seed | no |
 * | `dev/main.ts#deepLinkSearchOf` | those, plus `tab`, `rail`, `mode` | no |
 * | `provenanceLineOf`'s CLI line | `--building --dispatcher --traffic --template --seed --duration --part` | no |
 *
 * The subtlety worth writing down is the **one axis that looks carried and is not**. A period may
 * impose a demand template, and `RunSubmission` has a `demandTemplateId` field — but the value put
 * in it comes from `dev/state.ts#shiftDemandTemplateId`, which *deliberately does not consult the
 * calendar*. So the submission would name the template the run would have used and the server would
 * replay a different one. A field existing is not the same as the value reaching it.
 *
 * ## Why a constant and not a derivation
 *
 * There is no runtime source of truth to read this from: `RunSubmission` is a TypeScript interface
 * and `deepLinkSearchOf` writes its parameters inline. Deriving it would mean a fourth expression
 * that has to agree with three places by hand, which is the shape this repository keeps paying for.
 * So it is one named fact with one reader and the enumeration beside it.
 *
 * ## It is also the seam for GitHub issue #129, which is open and being worked
 *
 * #129 asks whether a deliberately calendared or commissioned run should be **refused** here or
 * **carried** by `RunSubmission`, and warns that answering it in one consumer and not the other is
 * the two-answer state a replay-verified board cannot survive. Both answers land on this line:
 *
 * - **carry** — `RunSubmission` grows the field, `configHashOf` digests it and the replay honours
 *   it. Then this becomes `true`, {@link weekCarries}'s period clause goes quiet on its own, and
 *   the product stops refusing a run the board can now reproduce. One line, and the assertions in
 *   `runIdentity.test.ts` that pin today's refusals turn red — which is the right noise, because
 *   they are the record of a decision that would have been reversed.
 * - **refuse** — `viewer.calendar` acquires a refusal of its own. Then the clause below is a
 *   *second* reason for one fact and belongs in that arm instead; the merge is a deletion here
 *   rather than an edit, and the sentence {@link askClause} builds is the thing that moves.
 *
 * What may not happen is this line quietly disagreeing with `RunSubmission`. That is why the table
 * above names the three artefacts rather than asserting the conclusion.
 */
const SELECTION_CARRIES_A_CALENDAR_PERIOD: boolean = false;

/**
 * What today carries that a selection does not — the week's arm, and the longest of them.
 *
 * ## Three facts, each with its own subject, because the wrong subject is the defect
 *
 * A day can be un-reproducible for three independent reasons and this sentence has to attribute
 * each to the thing that caused it:
 *
 * | fact | caused by | expressed by |
 * |---|---|---|
 * | the building has grown | `week.day` | `growth.ts`'s 11 %/day, day 1 excepted |
 * | the calendar edited today | `state.calendar` | `shift/calendar.ts#calendarAsks` |
 * | the day schedules an event | the week, **or** the period | `shift/calendar.ts#scheduledEventFor` |
 *
 * They are joined rather than merged, and each keeps its subject — *"the calendar's “Vacation
 * week” …"*, *"the day schedules …"* — because a period does not necessarily book the day's event:
 * a fire drill inside a vacation week is the **week's** drill, and a sentence reading *"Vacation
 * week … and schedules “Fire drill”"* would attribute it to the calendar. That is the same class
 * of mistake as the one this function was fixed for, one clause over.
 *
 * ## What changed, and why the old gate was wrong — GitHub issue #140
 *
 * The gate was `day === 1 && event.effect.changesNothing`, and the sentence named the day number
 * and the event. Both halves were wrong for a *period*:
 *
 * - **The gate.** Four of the five shipped periods change the run on day 1 while naming no event
 *   (`shift/calendar.ts#calendarAsks` tabulates them), so a run on a quarter of the building was
 *   published as reproducible. Issue #135 found this and deliberately did not fix it, because —
 *   - **the sentence.** It could only say *"day 1 … schedules “Ordinary day”"*, which is a refusal
 *     giving the wrong reason: the run moved because of a population factor and the player would be
 *     told it was an event. § D227 rates that below the gap itself, and `runIdentity` is the one
 *     derivation the leaderboard submit path and `copy run` share — the surface that must never
 *     accuse somebody of something they did not do.
 *
 * The growth clause is also **gone on day 1**, and that was a live falsehood rather than a tidy-up:
 * under `moving-week` the shipped product printed *"day 1 grows the building by 0 % and schedules
 * “Move-in day”"*, offering a reader a 0 % growth as a reason their run could not be posted.
 *
 * ## Why the clauses are authored here and the decision is taken in `shift/calendar.ts`
 *
 * The decision — *which of the period's asks reached the run* — is `calendarPatch`'s, and
 * `calendarAsks` shares its two conditional branches rather than restating them, so a mix bias the
 * engine withheld cannot appear in a refusal. The **prose** is here because this is where the
 * product's refusals are written and read; a second sentence built in `shift/` would be a second
 * description of one period, which is the drift `calendarLine` exists to prevent.
 *
 * ## Two questions, and only one of them is this function's
 *
 * *Did the calendar change the run?* is `calendarAsks`'. *Is that something a selection cannot
 * carry?* is {@link SELECTION_CARRIES_A_CALENDAR_PERIOD}'s, and it is a fact about the sharing
 * artefacts rather than about the calendar — the difference matters because GitHub issue #129 is
 * currently deciding it. Splitting them is what stops this arm from asserting *"a calendar means
 * unreproducible"*, which would be true today and false the day a submission grows the field.
 */
function weekCarries(state: ViewerState, resources: BrowserResources): string | undefined {
  const facts: string[] = [];

  if (state.week.day > 1) {
    facts.push(
      `day ${String(state.week.day)} grows the building by ` +
        `${String(Math.round((state.week.day - 1) * 11))} %`,
    );
  }

  /*
   * The period's asks, decided against the same four inputs `shiftRunConfigOf` hands
   * `calendarPatch` — `calendarAskInputOf` is that one value, and this is its second caller.
   *
   * The building is looked up through `buildingConfigOf`, which answers `undefined` rather than
   * throwing, because this predicate exists to describe states naming a building `data/buildings/`
   * does not ship. `shiftRunConfigOf` throws on exactly those, which is why the run plan is not
   * consulted here even though it knows the answer for a shipped building.
   */
  const today = calendarDayFor(state.calendar, state.week.day, state.week.dayIdx);
  if (today !== null && !SELECTION_CARRIES_A_CALENDAR_PERIOD) {
    const clauses = calendarAsks({
      day: today,
      ...calendarAskInputOf(
        resources,
        state,
        buildingConfigOf(resources, state.savedBuildings, state.buildingId),
      ),
    })
      .map((ask) => askClause(ask, today.shift))
      .filter((clause): clause is string => clause !== null);
    if (clauses.length > 0) facts.push(`the calendar’s “${today.name}” ${listOf(clauses)}`);
  }

  /*
   * The event, through `scheduledEventFor` — GitHub issue #135's **fourth** caller, and the one
   * where the wrong event does more than misname something. On `eventFor` alone, day 1 of a
   * `moving-week` was `ordinary` and this returned `undefined`, declaring a day the calendar had
   * made a move-in reproducible.
   */
  const event = scheduledEventFor(state.calendar, state.week.day, state.week.dayIdx);
  if (!event.effect.changesNothing) facts.push(`the day schedules “${event.name}”`);

  if (facts.length === 0) return undefined;
  return `${facts.join(', ')}, and none of that travels with a selection`;
}

/**
 * The clause naming one of the period's asks, read off the shift the ask came from.
 *
 * Exhaustive over {@link CalendarAsk}, which is derived from `CalendarShift`'s own keys — so a
 * sixth field of a period is a **compile error here** rather than an ask with no sentence. That is
 * the half of issue #140's fix a test cannot supply: a test asserts what exists, and this asserts
 * what must be written before the next field can ship.
 *
 * `null` where the shift's own value is absent. Unreachable by construction — `calendarAsks` names
 * a field only when it reached the run, and the two nullable fields reach it only when set — and
 * expressed as a filtered `null` rather than a non-null assertion or a throw, because the one thing
 * this function may not do is put a placeholder in a refusal.
 */
function askClause(ask: CalendarAsk, shift: CalendarShift): string | null {
  switch (ask) {
    case 'populationFactor':
      // The factor, not the head count: the count `calendarLine` quotes is `expandFloors`' own on
      // the edited building, and this function has no building. A percentage is true of the ask
      // without claiming to be a measurement of the result.
      return `scales the building’s population to ${String(Math.round(shift.populationFactor * 100))} %`;
    case 'splitBias':
      return shift.splitBias === null ? null : `pulls the mix ${shift.splitBias.label}`;
    case 'demandTemplateId':
      return shift.demandTemplateId === null
        ? null
        : `runs on the ${shift.demandTemplateId} demand template`;
    case 'goodsCars':
      /*
       * **No count, and the omission is the accurate half.** A period asks for a number of cars and
       * `calendarPatch`'s `reserveCars` may reserve fewer — it never empties a bank, so
       * `moving-week`'s Saturday asks Garden Apartments' two-car bank for two and gets one. This
       * function has no building and cannot know which happened, and *"reserves 2 cars"* on a day
       * that reserved one is a refusal with a false number in it. *At least one* is true of every
       * case a shipped building can produce, and `shift/calendar.ts#calendarAsks` names the single
       * case it would not be true of, with the assertion that pins it.
       */
      return 'reserves at least one car out of passenger service';
  }
}

/** `a`, `a and b`, `a, b and c`. The list a reader would write, for a list of any length. */
function listOf(items: readonly string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
}

/**
 * Everything about this state that stops the run being reproducible in `mode`, or an empty array.
 *
 * **All** the reasons, never the first. A reader told about one and then about the next has been
 * made to guess how many there are — `freePlayIssues`' rule, and the same argument.
 */
export function runIdentityIssues(
  state: ViewerState,
  resources: BrowserResources,
  mode: PlayMode = 'ranked',
): readonly ScopeIssue[] {
  const issues: ScopeIssue[] = [];

  /*
   * The value questions. `between-games` and still unreproducible: these three fields are legal to
   * move in every mode and name something only this browser has.
   */
  if (!resources.entries.some((entry) => entry.config.id === state.buildingId)) {
    issues.push({
      key: 'viewer.buildingId',
      scope: 'between-games',
      message: `the building “${state.buildingId}” is yours alone and data/buildings/ does not ship it`,
    });
  }
  if (!resources.dispatcherProfiles.profiles.some((profile) => profile.id === state.dispatcherId)) {
    issues.push({
      key: 'viewer.dispatcherId',
      scope: 'between-games',
      message: `the dispatcher “${state.dispatcherId}” is yours alone and data/dispatcher-profiles.json does not ship it`,
    });
  }
  if (
    state.pattern !== 'building' &&
    !resources.trafficProfiles.profiles.some((profile) => profile.id === state.pattern)
  ) {
    issues.push({
      key: 'viewer.pattern',
      scope: 'between-games',
      message: `the arrival pattern “${state.pattern}” is yours alone and no selection names a saved pattern`,
    });
  }

  /*
   * There is deliberately **no refusal for `windowStartS` here any more**, and the absence is the
   * record of one.
   *
   * § D288 refused a windowed run outright, because `RunSubmission` was six fields — building,
   * dispatcher, template, rate, `durationS`, seed — and the window was in none of them. That was
   * not a mislabelling worry: the board **re-simulates the seed for itself** (§ D214 § 3), so a
   * lunch peak would have been replayed over the whole day and come back either as a 422 the
   * player reads as an accusation, or as a different and entirely correct answer to a different
   * question.
   *
   * The refusal named its own fix — *"one field on `RunSubmission`, one line in `configHashOf`, and
   * the replay honouring it"* — and all three have landed. The window now travels, digests into the
   * board identity so a morning and a lunch are ranked apart, and is passed to the replay as
   * `windowStartS`/`windowEndS`. `submission.test.ts` and `verify.test.ts` hold the three halves.
   *
   * Left as a comment rather than deleted because a reader looking for *why is a windowed run
   * allowed to post* should find the answer where the refusal used to be, not in a commit.
   */

  /* The scope questions, walked from the table rather than listed. */
  for (const { key, field } of viewerControls()) {
    const entry = SCOPE_OF[key];
    if (entry === undefined || entry.kind !== 'control') continue;
    if (permits(mode, entry.scope)) continue;
    const carried = carriesState(state, resources, field);
    if (carried !== undefined) issues.push({ key, scope: entry.scope, message: carried });
  }

  return Object.freeze(issues);
}

/*
 * A `reproducesFromSelection` boolean wrapper was written here and deleted before this file landed:
 * `viz/deadCode.test.ts` reported it as an export with no non-test caller, which is the defect this
 * directory exists to catch, caught on its own first run. Its caller is the submit path, and the
 * submit path does not exist yet — `menu/client.ts#submit` has none either, which is `docs/16` § 5
 * clause 8. Both arrive together or neither does; a caller is the fix, not an allowlist entry.
 */
