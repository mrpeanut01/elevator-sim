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
 * The set of state a run may not carry is *nearly* — and this is GitHub issue #129 — *"everything
 * outside `between-games`"*, which `surface.ts` already declares and `scope.test.ts` already decides
 * by running both arms. So this module walks `SCOPE_OF` instead of naming fields, and a field added
 * tomorrow with a `within-day` scope is refused here on the day it lands rather than on the day
 * somebody remembers.
 *
 * The three *"yours alone"* refusals are the exception and are kept explicit, because they are not
 * about a scope at all: `buildingId` is `between-games` and perfectly legal to move, and it is still
 * unreproducible when it names a building `data/buildings/` does not ship. That is a question about
 * the **value**, not the field, and only `resources` can answer it.
 *
 * ## The unstated premise that sentence had, and the two questions it conflated — issue #129
 *
 * *"Everything outside `between-games`"* assumed that **`between-games` state is expressible in the
 * artefacts that reproduce a run.** For two fields it was not, and the scope table was not the thing
 * that was wrong: `viewer.commissioning` and `viewer.calendar` are correctly `between-games` —
 * commissioning really is *"you choose the building and then live with it for the week"* — and
 * `permits('ranked', 'between-games')` is correctly `true`. Both statements were right and their
 * conjunction was a hole, because *fixed when a game starts* and *carried by the artefacts that
 * reproduce the game* are two different properties and this module read one word for both.
 *
 * So the walk below asks **two** questions per field rather than one:
 *
 * 1. *May this field move at all in this mode?* — {@link permits}, from the scope table. Unchanged.
 * 2. *If it may move, can the artefacts say so?* — {@link EXPRESSIBLE_IN_A_SELECTION}, which names
 *    the `between-games` fields a `RunSubmission` and a deep link actually carry, with the artefact
 *    that carries each one.
 *
 * A `between-games` field missing from that table is asked about exactly as a `within-day` field is.
 * That is not a widening of the scope contract; it is the scope contract plus the fact the contract
 * never had, which is *what the wire holds*.
 *
 * ## Why this is a refusal and not a wider `RunSubmission` — the shape that was rejected
 *
 * Issue #129 offered two shapes and recommended the other one: **carry** both fields, on § D288's
 * precedent for `windowStartS` — *"one field on `RunSubmission`, one line in `configHashOf`"* — with
 * a boundary check deciding it. The boundary check came back **permissive**, and the shape was
 * rejected anyway, so both halves are recorded here rather than only the verdict.
 *
 * **The boundary permits it.** § D214 § 3 says so outright — *"`packages/server` depends on `core`,
 * which is allowed (invariant 6 forbids `core → viz`, nothing else)"* — and the only prohibition
 * anybody wrote down runs the other way: § D215 § 3's *"`viz` may not depend on `server`"*, which is
 * why `menu/client.test.ts` reads the server's source text instead of importing it. It was measured
 * rather than read off: with `@elevator-sim/viz` added to `packages/server/package.json`, `../viz`
 * added to its `tsconfig.json` references and `commissionedBuilding`/`calendarPatch` re-exported
 * from `viz`'s barrel, `tsc -b` exits 0, and `import('@elevator-sim/viz')` from the server's own
 * resolution root loads in 73 ms with both symbols present and no DOM required.
 *
 * **What refuses it is soundness, and that is measured too.** `submission.ts` states the property
 * the whole leaderboard rests on: *"Ids rather than inline objects, deliberately. A submission that
 * carried its own building would let a player invent a two-floor tower with **sixteen cars** and
 * post a superb wait."* A commissioning choice **is** a building edit on the wire — it is literally
 * `{ bankId, shafts, machineClassId, ratedSpeedMps }` — and `commissionedBuilding` is *total by
 * design*: its own docstring says *"It does not decide whether a choice should be run — that is
 * `reviewCommissioning`."* On `midtown-office` / `collective` / `rise-and-fall` at 3 % / 900 s /
 * seed 20 260 804, with nothing in this module objecting to any of the three:
 *
 * | fabric | mean wait |
 * |---|---|
 * | as built — 4 × `geared-traction` at 2.5 m/s | **23.00 s** |
 * | 4 × `gearless-traction` at 8 m/s | **14.76 s** |
 * | **16 shafts**, same class | **6.58 s** |
 *
 * That is `submission.ts`'s own sentence made literal, and the gate that would refuse it is
 * `reviewCommissioning` against a capital constraint — `viewer.commissioningConstraintId`, which
 * issue #129 puts **out of scope** on the correct ground that it is `presentation`. Carrying the
 * constraint would not close it either, because the *player* chooses it and a cheat declares
 * `new-build`; closing it means the **server** deciding which constraint a ranked run sits under,
 * which is a game-design decision nobody has made and this issue did not authorise.
 *
 * The calendar fails a second way, independently. `viewer.calendar` is a whole `CalendarPeriod` —
 * population factor, split bias, template swap, reserved cars — so putting the object on the wire
 * has exactly the shape of putting a building on it. Carrying only `{ periodId, fromDay, toDay }`
 * and resolving the shape server-side avoids that and buys a different defect: `CALENDAR_PERIODS`
 * is a **code table in `shift/calendar.ts`**, not `data/`, so it has no digest and no `data/`
 * provenance — and `configHashOf` digests *"the fully resolved inputs a run depended on"* precisely
 * so a change to one starts a new board rather than breaking re-verification of the old one (§ D214
 * § 4, § D205, § D213). A period edited in `viz` would stop every stored calendared score
 * re-verifying, which is the defect that argument exists to prevent.
 *
 * **The cost of refusing is real and is stated here rather than discovered later**, which is issue
 * #129's own requirement of this shape: a commissioned fabric and a calendar period are shipped
 * features, the game's loop is built around both, and their runs are now **uncopyable and
 * unrankable**. What a player gets instead of a board place is a sentence naming the field. That is
 * the trade, and it is the right way round only because the alternative is a board on which a fabric
 * no screen would have offered outranks every honest run on it.
 */

import { DEFAULT_LEVERS } from '../authoring/dispatcherSpec.js';
// The two are aliased at every site that needs both — `authoring/selectorSpec.ts`'s naming hazard.
import {
  specFromProfile as selectorSpecFromProfile,
  selectorContextFrom,
} from '../authoring/selectorSpec.js';
import { commissionedBuilding } from '../commissioning/building.js';
import { commissionableClasses } from '../commissioning/types.js';
import type { BrowserResources } from '../dev/data.js';
import {
  buildingConfigOf,
  calendarAskInputOf,
  profileById,
  specsWithSaved,
  type ViewerState,
} from '../dev/state.js';
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
 * The `between-games` viewer fields the artefacts actually carry, and which artefact carries each.
 *
 * **This table is the fact `surface.ts` does not hold**, and issue #129 is the whole reason it
 * exists. `SCOPE_OF` answers *when may this move?*; the wire answers *can this be said?*, and until
 * #129 nothing wrote the second answer down, so `permits('ranked', 'between-games')` was read as
 * both. Every row names the field on `menu/client.ts#RunSubmission` or the parameter in
 * `dev/main.ts#deepLinkSearchOf` that carries it, because a row with no artefact behind it is the
 * premise that produced the bug.
 *
 * `runIdentity.test.ts` reads `packages/server/src/leaderboard/submission.ts`'s **source text** and
 * asserts the wire has no field for anything absent from this table — the method `menu/client.test.ts`
 * uses, and for the same reason: § D215 § 3, *`viz` may not depend on `server`*. So a row added here
 * without a wire field to back it is red, and the day the wire grows one the same test says to come
 * back and add the row.
 *
 * `viewer.commissioning` and `viewer.calendar` are **deliberately absent** — see the module
 * docstring for the boundary check that permitted carrying them and the measurement that refused it.
 */
export const EXPRESSIBLE_IN_A_SELECTION: Readonly<Record<string, string>> = Object.freeze({
  buildingId: 'RunSubmission.buildingId, and the link’s ?building',
  dispatcherId: 'RunSubmission.dispatcherProfileId, and the link’s ?dispatcher',
  pattern:
    'reaches the wire as the demand template it implies, through shiftSubmittedSelection; the ' +
    'link carries it verbatim as ?traffic. A *saved* pattern is refused below by value rather ' +
    'than by scope, because no selection names one.',
  freePlay: 'RunSubmission.demandTemplateId and .arrivalRatePctPop5min, and the link’s ?template/?rate',
  shiftLengthS: 'RunSubmission.durationS, and the link’s ?duration',
  windowStartS: 'RunSubmission.windowStartS, and the link’s ?windowStart — § D288',
  seed: 'RunSubmission.seed, and the link’s ?seed',
});

/**
 * Whether a field is at its reproducible-from-selection value.
 *
 * A **table keyed by field** rather than a `switch`, and the change is issue #129's second half.
 * The `switch` had a `default: return undefined`, so a field the scope table declared and this
 * function did not know was a **silent pass** — and the docstring here claimed the opposite, that
 * *"`runIdentity.test.ts` asserts the two agree"*. It did not. No test in this package referred to
 * this function at all, which is why three fields reached a shipped submit button unasked about and
 * why the claim is now a key set a test can compare rather than a sentence.
 *
 * A record makes the key set a **value**. `runIdentity.test.ts` walks every control row the module
 * can be asked about and drives `probes.test-helper.ts`'s own two arms through it: the first arm
 * must be accepted and the second must be refused **naming that key**. Since `scope.test.ts` already
 * proves both arms move the legs, a refusal here is pinned by a run rather than by a sentence
 * (§ D227), and a field added tomorrow is red on the day it lands — a probe is already compulsory
 * (`surface.test.ts`), and an unanswered probe now fails.
 *
 * `resources` is a parameter because three of the seven answers need it: a fabric is *changed* only
 * relative to the authored building, a period is *in effect* only on the day being run, and a
 * selector is *moved* only relative to the profile the submitted id already implies.
 */
type CarryCheck = (state: ViewerState, resources: BrowserResources) => string | undefined;

/**
 * The answers, keyed by field.
 *
 * Exported for the both-directions assertion and consumed **here** — `runIdentityIssues` looks every
 * answer up in it, so a test that compares this key set against {@link fieldsAnsweredFor} is
 * deciding the shipped predicate rather than a restatement of it. `surface.ts#SCOPE_OF` is the same
 * arrangement: the table is exported, the module that needs it consumes it, and the test settles
 * whether the two agree.
 */
export const CARRY_CHECKS: Readonly<Record<string, CarryCheck>> = Object.freeze({
  week: (state) => weekCarries(state),

  outOfServiceCarIds: (state) =>
    state.outOfServiceCarIds.length === 0
      ? undefined
      : `${String(state.outOfServiceCarIds.length)} car(s) are held out of service, and nothing in a selection holds one`,

  levers: (state) =>
    state.levers.parking === DEFAULT_LEVERS.parking &&
    state.levers.express === DEFAULT_LEVERS.express &&
    state.levers.dwell === DEFAULT_LEVERS.dwell
      ? undefined
      : 'the group levers are moved off their defaults, and a selection carries no levers',

  savedClasses: (state) =>
    state.savedClasses.length === 0
      ? undefined
      : 'a saved machine class widens the specs this building resolves against, and only this browser has it',

  /**
   * The patience curve — the field the UI readiness audit's B4 made reachable.
   *
   * `null` is *nobody leaves*, which is every run this repository has ever published and what
   * `shiftRunConfigOf` writes nothing for, so it carries. Anything else does not: neither a CLI line
   * nor a `RunSubmission` has a field for a patience curve, and the consequence is worse here than
   * for most of this table — abandonment **improves** the average wait by construction, so a run
   * that carried a curve the server could not see would re-verify as a slower run and be rejected
   * as a forgery, punishing an honest player for a client that stayed quiet.
   */
  patience: (state) =>
    state.patience === null
      ? undefined
      : `riders abandon after about ${String(state.patience.meanS)} s in this run, and neither a CLI ` +
        'line nor a submission carries a patience curve — a run replayed without it is a different ' +
        'run, and abandonment moves the mean it would be judged on',

  /**
   * The fabric — issue #129's first field.
   *
   * **Asked as *did the building move?*, never as *is the array non-empty?***, and the distinction
   * is the difference between a correct refusal and one that fires on an untouched run. The fabric
   * screen writes `asBuiltChoices(...)` back into the state the moment it is opened
   * (`dev/main.ts#commissioningInput`), so a player who looked at the screen and changed nothing
   * carries a full choice list that commissions the building it already was. An emptiness test
   * would refuse that run, and `commissioning.test.ts` would still be green, because emptiness is
   * not the property anybody cares about.
   *
   * `commissionedBuilding` answers it exactly, through the identity contract its own docstring
   * states: *"The input object comes back — not a copy that happens to be equal — when no bank's
   * choice differs from what the building already stands as."* So `!==` against the authored
   * config is the shipped decision rather than a restatement of it, and *retrofit* — the constraint
   * whose editable set is empty — stays postable, which it has to be.
   *
   * An unshipped building is refused by name a few lines below, by value rather than by scope, and
   * `undefined` here leaves that refusal to say so on its own.
   */
  commissioning: (state, resources) => {
    const authored = buildingConfigOf(resources, state.savedBuildings, state.buildingId);
    if (authored === undefined) return undefined;
    const classes = commissionableClasses(specsWithSaved(resources, state.savedClasses));
    if (commissionedBuilding(authored, state.commissioning, classes) === authored) return undefined;
    return (
      'the fabric was commissioned — shafts, machine class or rated speed differ from the building ' +
      'as authored — and neither a selection nor a submission carries a fabric, so this run would ' +
      'be replayed against the building data/buildings/ ships'
    );
  },

  /**
   * The calendar — issue #129's second field.
   *
   * **Asked as *is a period in effect on the day being run?***, which is `calendarDayFor`'s own
   * question and `null` in all three of its cases: no period, a day outside the window, a weekday
   * the period does not touch. A player who placed a vacation on days 3–5 and is running day 1 has
   * a `calendar` that is not `null` and a run the calendar does not touch — `calendarPatch` is
   * handed `day: null` and returns the building unchanged — so refusing on `state.calendar !== null`
   * would refuse a run the artefacts reproduce perfectly.
   *
   * The message names the period, because *which* period is the thing a reader has to act on and
   * because a refusal that said only *"a calendar is set"* would send them looking at a control
   * that may well be pointed at a different week.
   *
   * ## Which asks reached the run, not which the period declares — GitHub issue #140
   *
   * **Being in effect is the gate; what actually moved is the sentence**, and the two were built by
   * different lanes in the same wave. #129 established the gate — `calendarDayFor`, above. #140
   * established that a refusal naming *"it scales the population and can bias the mix, swap the
   * demand template and reserve a car"* is four claims about a period that may have made one of
   * them: `public-holiday` scales and does nothing else, and a reader sent looking for a mix bias
   * that never happened has been given a wrong reason in the one surface that must never accuse
   * somebody of something they did not do.
   *
   * So the clauses come from {@link calendarAsks}, which shares `calendarPatch`'s **own two
   * conditional branches** rather than restating them — a bias the engine withheld cannot appear
   * here, and #140 measured three ways it can be withheld (a bias under `lunch-two-way`, a template
   * over a player's own choice, a template the shift is too short for). A derivation reading the
   * period's *declaration* would have refused all three with axes that never moved.
   *
   * ## Why this arm and not `week`'s
   *
   * #140 built the clause inside `week`'s arm, because at the time `viewer.calendar` had no arm to
   * put it in. It is here instead: the period is the calendar's fact, and a refusal filed under
   * `viewer.week` for something `viewer.calendar` caused points a reader at the wrong control. The
   * two lanes agreed on this in advance and each named the other's outcome — the merge is this
   * paragraph.
   *
   * `SELECTION_CARRIES_A_CALENDAR_PERIOD`, #140's stand-in for *can the artefacts express a
   * period?*, is **deleted rather than merged**. It was a boolean asserting what
   * {@link EXPRESSIBLE_IN_A_SELECTION} now holds as a table the wire is tested against, and keeping
   * both would be two answers to one question with no test that they agree — the shape this
   * repository keeps paying for, reintroduced by a merge.
   */
  calendar: (state, resources) => {
    const today = calendarDayFor(state.calendar, state.week.day, state.week.dayIdx);
    if (today === null) return undefined;
    /*
     * Decided against the same four inputs `shiftRunConfigOf` hands `calendarPatch` —
     * `calendarAskInputOf` is that one value, and this is its second caller.
     *
     * The building is looked up through `buildingConfigOf`, which answers `undefined` rather than
     * throwing, because this predicate exists to describe states naming a building
     * `data/buildings/` does not ship. `shiftRunConfigOf` throws on exactly those, which is why the
     * run plan is not consulted here even though it knows the answer for a shipped building.
     */
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
    /*
     * A period in effect whose asks all withheld leaves the run reproducible, and saying nothing is
     * the correct answer rather than a missed one. #140 measured it: an all-default period and an
     * out-of-window period produce byte-identical legs.
     */
    if (clauses.length === 0) return undefined;
    return (
      `the calendar’s “${today.name}” ${listOf(clauses)}, and no selection or submission carries ` +
      'a calendar period'
    );
  },

  /**
   * The weight-set selector — **found while fixing #129, and it is the same defect by the other
   * route.**
   *
   * `viewer.selectorSpec` is `within-day`, which `ranked` already forbids, so `permits` was never
   * the thing that let it through: the `switch` this table replaced simply had no arm for it and
   * fell to `default: return undefined`. Measured on the control's own probe cell — `midtown-office`
   * at 900 s, `policy: 'off'` against `policy: 'fuzzy'` — the legs differ and `runIdentityIssues`
   * returned `[]` for both, so a run with the selector on posted and came back
   * `metrics-do-not-reproduce`. Two routes into one accusation; the exhaustiveness assertion is what
   * closes both, because it is indifferent to which route a field arrived by.
   *
   * **The baseline is the profile's own selector, not a constant**, and that is what the server
   * reconstructs: it resolves `dispatcherProfileId` against its own `data/` and gets whatever
   * selector that profile declares. All thirteen shipped profiles resolve to the same spec today
   * (`policy: 'off'` and the defaults), so a plain change of dispatcher does not trip this — but
   * hard-coding `policy === 'off'` would have been true by luck rather than by construction, and
   * would start refusing honest runs the day a profile declares a selector of its own.
   */
  selectorSpec: (state, resources) => {
    const declared = selectorSpecFromProfile(
      profileById(resources, state.savedDispatchers, state.dispatcherId),
      selectorContextFrom(resources.dispatcherProfiles),
    );
    if (JSON.stringify(state.selectorSpec) === JSON.stringify(declared)) return undefined;
    return (
      `the weight-set selector is set to “${state.selectorSpec.policy}”, which is not what the ` +
      `dispatcher “${state.dispatcherId}” declares, and a submission carries a dispatcher id rather ` +
      'than a selector — so the server would replay this seed under the profile’s own policy'
    );
  },
});

/**
 * What today carries that a selection does not — the week's arm.
 *
 * ## Two facts, each with its own subject, because the wrong subject is the defect
 *
 * A day can be un-reproducible for reasons belonging to different controls, and this sentence has
 * to attribute each to the thing that caused it:
 *
 * | fact | caused by | expressed by |
 * |---|---|---|
 * | the building has grown | `week.day` | `growth.ts`'s 11 %/day, day 1 excepted |
 * | the day schedules an event | the week, **or** the period | `shift/calendar.ts#scheduledEventFor` |
 *
 * They are joined rather than merged, and each keeps its subject, because a period does not
 * necessarily book the day's event: a fire drill inside a vacation week is the **week's** drill,
 * and a sentence reading *"Vacation week … and schedules “Fire drill”"* would attribute it to the
 * calendar.
 *
 * **A third fact used to be built here and is not any more.** Issue #140 added the calendar
 * period's clauses to this arm, correctly for the tree it was written against — `viewer.calendar`
 * had no arm of its own at the time. Issue #129 gave it one in the same wave, and the period moved
 * there on the argument both lanes had already agreed: a refusal filed under `viewer.week` for
 * something the calendar caused points a reader at the wrong control. See
 * {@link CARRY_CHECKS}`.calendar`, which now carries #140's derivation and the reasoning for it.
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
 */
function weekCarries(state: ViewerState): string | undefined {
  const facts: string[] = [];

  if (state.week.day > 1) {
    facts.push(
      `day ${String(state.week.day)} grows the building by ` +
        `${String(Math.round((state.week.day - 1) * 11))} %`,
    );
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
  for (const { key, field } of fieldsAnsweredFor(mode)) {
    const entry = SCOPE_OF[key];
    if (entry === undefined || entry.kind !== 'control') continue;
    const check = CARRY_CHECKS[field];
    /*
     * `continue` on a missing check would be the `default: return undefined` this table replaced,
     * restored one layer up. It cannot happen — `runIdentity.test.ts` asserts the key set covers
     * exactly {@link fieldsAnsweredFor}, in both directions — and the branch is here because
     * `noUncheckedIndexedAccess` makes the lookup optional and a `!` would be the same silence.
     */
    if (check === undefined) continue;
    const carried = check(state, resources);
    if (carried !== undefined) issues.push({ key, scope: entry.scope, message: carried });
  }

  return Object.freeze(issues);
}

/**
 * The `viewer.` control fields this module must have an answer for in `mode` — the two questions of
 * the module docstring, as one list.
 *
 * Exported for `runIdentity.test.ts`, and it is a **declaration the module itself walks** rather
 * than a second opinion written for a test: {@link runIdentityIssues} iterates exactly this, so an
 * assertion over it is an assertion over the shipped predicate. That is `surface.ts#SCOPE_OF`'s own
 * arrangement — the table is exported, the module consumes it, the test decides it — and it is the
 * opposite of the `reproducesFromSelection` wrapper deleted at the foot of this file, which was a
 * function nothing but a test would ever have called.
 *
 * The two clauses, in the order a reader should think about them:
 *
 * 1. **the mode forbids the scope** — a `within-day` or `between-days` field under `ranked`;
 * 2. **the mode permits it and the artefacts cannot say it** — a `between-games` field with no row
 *    in {@link EXPRESSIBLE_IN_A_SELECTION}. Issue #129, and the clause that did not exist.
 */
export function fieldsAnsweredFor(
  mode: PlayMode,
): readonly { readonly key: SurfaceKey; readonly field: string }[] {
  return viewerControls().filter(({ key, field }) => {
    const entry = SCOPE_OF[key];
    if (entry === undefined || entry.kind !== 'control') return false;
    if (!permits(mode, entry.scope)) return true;
    return entry.scope === 'between-games' && EXPRESSIBLE_IN_A_SELECTION[field] === undefined;
  });
}

/*
 * A `reproducesFromSelection` boolean wrapper was written here and deleted before this file landed:
 * `viz/deadCode.test.ts` reported it as an export with no non-test caller, which is the defect this
 * directory exists to catch, caught on its own first run. Its caller is the submit path, and the
 * submit path does not exist yet — `menu/client.ts#submit` has none either, which is `docs/16` § 5
 * clause 8. Both arrive together or neither does; a caller is the fix, not an allowlist entry.
 */
