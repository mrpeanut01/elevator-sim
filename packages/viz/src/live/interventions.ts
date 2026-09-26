/**
 * The intervention control's words — Everyday Mode slice 3 (contract § 1.4, gameplay § 7.6).
 *
 * A run is the record `{ seed, config, interventions[] }`, and the stage owes the player two
 * sentences about it: the verb on the control (*Park the cars in the lobby*) and the stamp under
 * the header once it has been pressed (`09:14 · parked the cars in the lobby`). Both live here,
 * pure and DOM-free, so the honesty sweep can drive them and `dev/main.ts` only decides which
 * element they go in — the split every panel in `dev/` keeps.
 *
 * ## The stamp is temporal by construction
 *
 * {@link interventionStampOf} answers for a **playhead**, not for the log: it names the latest
 * entry at or before `simTimeS` and nothing later. A player who scrubs back past their own
 * intervention sees the stamp disappear, because at that instant on the stage the intervention
 * has not happened yet — the same rule § D307's temporal axis holds every other surface to, met
 * here by the shape of the function rather than by a guard in the caller.
 *
 * The clock format is {@link clockAt} — the shell's own `hh:mm`, fed the same `dayStartS` the
 * header's clock reads — so the stamp and the clock above it can never disagree about what 09:14
 * means.
 */

import {
  aggregationOf,
  bankRangeIsFixed,
  DISPATCH_DEFAULTS,
  isServiceRangeEvent,
  POLICY_DEFAULTS,
  resolveDispatchConfig,
  RULE_ACTION_WORDS,
  type DispatcherProfile,
  type InterventionChange,
  type ResolvedBuilding,
  type ResolvedServiceEvent,
  type RunInterventionConfig,
} from '@elevator-sim/core/browser';

import { purchaseUnits } from '../pricing/parse.js';
import type { PriceSchedule, PricedChange } from '../pricing/types.js';

import { clockAt } from './timeline.js';

/**
 * The control's label, imperative because it is a button and not a caption. One label per
 * intervention control; {@link switchDispatcherLabelOf} is the second, beside this one.
 */
export const PARK_CARS_LOBBY_LABEL = 'Park the cars in the lobby';

/**
 * The fourth kind's words, **derived from the rules vocabulary rather than authored beside it** —
 * GitHub issue #352. `core`'s `RULE_ACTION_WORDS['spread-out']` is the player's own sentence for
 * `idle.parkingStrategy: 'zone-center'` (*spread the other cars across the tower*), and the
 * intervention writes the same setting, so the button says the same thing: the rule's *other* is
 * relative to the car the rule is about, and an intervention is about the whole fleet, which is
 * the one word that changes. Two vocabularies for one mechanism is how a label and a rule row drift
 * into disagreeing about what *spread* means; deriving one from the other is what stops it.
 */
const SPREAD_SENTENCE = RULE_ACTION_WORDS['spread-out'].template.replace('the other cars', 'the cars');

/** The control's label — imperative, capitalised, the rule's own sentence. */
export const SPREAD_CARS_LABEL = SPREAD_SENTENCE.charAt(0).toUpperCase() + SPREAD_SENTENCE.slice(1);

/**
 * The dispatcher-switch control's label — parametric over the *name*, never the id, because the
 * button says what pressing it does and a player is handing the day to *somebody*, not to a key
 * in a data file (gameplay § 16 rule 11: no engine identifiers in the Casual register).
 *
 * `Switch to …`, the imperative of the handoff's own stamp (§ 7.6: `09:14 · switched to Lobby
 * anchor`) — the handoff wins every disagreement about copy, and the label/stamp pair keeps the
 * park control's verb-and-past-tense shape.
 */
export function switchDispatcherLabelOf(name: string): string {
  return `Switch to ${name}`;
}

/**
 * What a switch does, said out loud — review finding 3, § D227's rule that a behaviour nothing
 * states is a refusal waiting to go stale, and **rewritten by [§ D1048](../../../../DECISIONS.md)**
 * because the press now does more than it used to say.
 *
 * It read *"from this moment the day runs on this dispatcher’s weights alone"*, which was true of
 * `switch-dispatcher` and made the button's own label false: *Switch to Fairness first* handed the
 * day collective's no-turning rule and collective's reassignment with Fairness first's two weights.
 * Both shells now emit `adopt-dispatcher`, which hands over the whole dispatcher less the landing
 * panels and the bidding (`dispatch/policy.ts#adoptProfile`), so the sentence names what that is in
 * the player's words: whether a car may turn round for a call, whether a call it holds can be
 * handed on, and where an idle car waits. Two further clauses are the parts that do **not** change
 * hands, and both are mechanisms rather than advice: an assignment already made stands
 * (`Simulation#onIntervention`), and the player's own rules or pattern switching stand down
 * because the adopted weights are pinned. What a particular target cannot bring with it is its
 * row's note, {@link switchNoteOf}, rather than a clause here, because it is not true of every row.
 */
export const SWITCH_PINS_NOTE =
  'from this moment the day runs as this dispatcher would run it, including when a car may turn ' +
  'round, hand a call on or park — calls already given a car keep it, and any rules or pattern ' +
  'switching stand down for the rest of the day';

/**
 * **Why a handover to this dispatcher cannot be carried at all** — [§ D1048](../../../../DECISIONS.md).
 *
 * Two things about a dispatcher are fixed for the whole of a run and no handover can reach them,
 * and a row whose target differs from the day's in either is refused with the reason on it rather
 * than offered. Before this, both destination rows were **enabled and inert**: a handover to
 * *Destination disclosure* or *Destination dispatch* moved 0 of 14 pinned-day legs, because the
 * run keeps the landing it opened with and a destination term reads nothing at an up-and-down
 * button. That is § D177's inert control, drawn as pressable. `everyday/stageHandover.test.ts` is
 * the run that pins each refusal.
 *
 * - **The landing panels.** `dispatch.callType` and `dispatch.passengerAssignment` decide what a
 *   rider tells the building and whether a panel names their car — the passenger model, which
 *   `dispatch/selector.ts` § *Why only the weights switch* holds fixed for a run so its metrics stay
 *   comparable with themselves. A target whose pair differs from the driver's is refused.
 * - **The bidding.** `auction.aggregation` names a different kind of controller rather than a
 *   setting of this one, and a run cannot change controller part-way. A target that bids where the
 *   day does not, or does not where the day does, or bids under other rules, is refused.
 *
 * Both compared as **data**, off the fields the engine resolves them from (invariant 7): no profile
 * id is named here, and a saved dispatcher with a panel is refused on the same ground as a shipped
 * one.
 */
export const SWITCH_NEEDS_OTHER_PANELS =
  'cannot take over part-way through the day: it needs different landing panels from the ones ' +
  'today opened with, and how riders call a lift is fixed for the whole day';

/** The bidding refusal, where the day does not bid and the target does. See {@link SWITCH_NEEDS_OTHER_PANELS}. */
export const SWITCH_NEEDS_BIDDING =
  'cannot take over part-way through the day: its cars bid for every call, and bidding cannot ' +
  'start once the day is running';

/** The bidding refusal, where the day bids and the target does not, or bids another way. */
export const SWITCH_STOPS_BIDDING =
  'cannot take over part-way through the day: today’s cars bid for every call, and the bidding ' +
  'cannot stop or change once the day is running';

/**
 * The refusal a handover row carries on its target's own ground, or `undefined` when a handover
 * can reach it. See {@link SWITCH_NEEDS_OTHER_PANELS} for the two grounds.
 */
export function switchRefusalOf(
  target: DispatcherProfile,
  driving: DispatcherProfile,
): string | undefined {
  if (landingModelOf(target) !== landingModelOf(driving)) return SWITCH_NEEDS_OTHER_PANELS;
  const biddingNow = biddingOf(driving);
  const biddingThen = biddingOf(target);
  if (biddingNow === biddingThen) return undefined;
  return biddingNow === undefined ? SWITCH_NEEDS_BIDDING : SWITCH_STOPS_BIDDING;
}

/** The pair that decides the passenger model, with the engine's own defaults applied. */
function landingModelOf(profile: DispatcherProfile): string {
  return `${profile.dispatch?.callType ?? DISPATCH_DEFAULTS.callType}\u0000${
    profile.dispatch?.passengerAssignment ?? DISPATCH_DEFAULTS.passengerAssignment
  }`;
}

/** The auction section, canonically, or `undefined` for the central argmin — which bids nothing. */
function biddingOf(profile: DispatcherProfile): string | undefined {
  if (aggregationOf(profile) === POLICY_DEFAULTS.aggregation) return undefined;
  return canonicalOf(profile.auction ?? {});
}

/** A plain object with its keys sorted — key order is authoring noise rather than a difference. */
function canonicalOf(value: object): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))),
  );
}

/**
 * Whether handing the day to `target` would genuinely change nothing.
 *
 * ## Why this is here rather than in either shell
 *
 * The Engineer strip has carried this arm since Everyday slice 3 and worked out the shape the hard
 * way (`dev/main.ts`, review finding 2): the **old** check compared base *ids*, and the profile that
 * actually drives a run is derived — levers, the weight-set selector, the rule rows and the campaign
 * kit are all folded in by `dev/state.ts#drivingProfileOf` — so an id comparison disabled the control
 * at exactly the moment pressing it would have changed the run, a lever-moved player handing the day
 * back to the plain baseline. That is § D177's inert-control class with its polarity reversed, and it
 * is not a thing worth discovering twice.
 *
 * So when § 7's Everyday stage grew the same arm (GitHub issue **#171**) the predicate moved here
 * rather than being written a second time. One implementation, two callers, and the pure/DOM split
 * every module in `live/` keeps: this file already owns the control's *words*, and *whether the
 * control can act* is the same kind of fact about the same control.
 *
 * ## The three grounds, in the order they are decided
 *
 * What is compared on every ground is **the whole dispatcher a handover carries** — the target
 * resolved as `Simulation#resolveAdoption` resolves it, less what a handover holds — rather than the
 * weight vector, which is [§ D1048](../../../../DECISIONS.md)'s correction: *Minimum estimated wait*
 * and collective share a vector and differ by a hard constraint, and the vector check refused the
 * one handover the brief said clears the day. Key order is authoring noise, so every side is
 * serialised with its keys sorted, and an authored default is the default.
 *
 * 1. **An `adopt-dispatcher` already on the log pins the answer.** From the stamped instant the run
 *    obeys that dispatcher (`dispatch/policy.ts#adoptProfile`, and {@link SWITCH_PINS_NOTE} is the
 *    sentence a player reads), so a second handover changes nothing exactly when the two targets
 *    carry the same dispatcher. No driving profile is consulted.
 * 2. **A weights-only `switch-dispatcher` on the log** — a stored record, since no shell emits one
 *    now — leaves the driver's stages standing under that handover's weights, and that is what is
 *    in force.
 * 3. **Otherwise the driver is in force, and a live chooser is itself a difference.** On a rules or
 *    selector profile the handover also stands the chooser down for the rest of the run, which is a
 *    change even at an equal dispatcher.
 *
 * {@link SwitchNoopInput.driving} is a thunk and not a value, which is the one shape decision in
 * this signature. Ground 1 answers without it, and deriving the driving profile means walking the
 * whole spec chain; both callers draw on frames, so a value parameter would run that walk on every
 * frame of every run that already carries a handover. The thunk is called at most once.
 */
export interface SwitchNoopInput {
  /** Today's log, in press order — the same array the stamp reads. */
  readonly interventions: readonly RunInterventionConfig[];
  /** The profile the control would hand the day to. */
  readonly target: DispatcherProfile;
  /** The vector **actually driving**, derived — see the docstring for why it is a thunk. */
  readonly driving: () => DispatcherProfile;
}

export function switchChangesNothing(input: SwitchNoopInput): boolean {
  let latest: InterventionChange | undefined;
  for (const entry of input.interventions) {
    const kind = entry.change.kind;
    if (kind === 'switch-dispatcher' || kind === 'adopt-dispatcher') latest = entry.change;
  }
  const target = adoptedOf(input.target);
  if (latest?.kind === 'adopt-dispatcher') return adoptedOf(latest.profile) === target;
  const driving = input.driving();
  /*
   * A weights-only handover already on the log — a stored or replayed record, since no shell emits
   * one now — leaves the driver's stages standing under that handover's weights, pinned.
   */
  if (latest?.kind === 'switch-dispatcher') {
    return adoptedOf({ ...driving, weights: latest.profile.weights }) === target;
  }
  return adoptedOf(driving) === target && (driving.selection?.policy ?? 'off') === 'off';
}

/**
 * Everything an `adopt-dispatcher` hands over, canonically — the target resolved exactly as
 * `Simulation#resolveAdoption` resolves it (its chooser off, no rows), less the fields a handover
 * holds: the id and name, the landing pair, and the chooser. Memoised per profile object, because
 * both shells ask on frames and the host's driving profile is itself memoised by identity.
 *
 * **The resolved config and not the authored one**, which is [§ D1048](../../../../DECISIONS.md)'s
 * correction to this function. It compared weight vectors, so collective and *Minimum estimated
 * wait* — the same `waitTime: 1`, and one hard constraint apart — were *"already running"* each
 * other, and the stage refused the one handover the brief said clears a pinned day.
 */
function adoptedOf(profile: DispatcherProfile): string {
  const known = adoptedCache.get(profile);
  if (known !== undefined) return known;
  const resolved = resolveDispatchConfig({
    ...profile,
    selection: { ...(profile.selection ?? {}), policy: 'off' },
    rules: undefined,
  });
  const { callType: _callType, passengerAssignment: _assignment, ...dispatch } = resolved.dispatch;
  const key = JSON.stringify({
    weights: [...resolved.weights.entries()],
    constraints: resolved.declaredHardConstraints,
    normalization: canonicalOf(resolved.normalization),
    dispatch: canonicalOf(dispatch),
    eligibility: canonicalOf(resolved.eligibility),
    answer: canonicalOf(resolved.answer),
    idle: canonicalOf(resolved.idle),
  });
  adoptedCache.set(profile, key);
  return key;
}
const adoptedCache = new WeakMap<DispatcherProfile, string>();

/**
 * **What a handover to this target leaves as the day opened it**, or `undefined` when nothing —
 * [§ D1048](../../../../DECISIONS.md). Drawn as the row's note, beside an enabled button.
 *
 * Two parts of a dispatcher are built with the day rather than read at each decision, so an
 * `adopt-dispatcher` takes the rest and cannot take these; `everyday/stageHandover.test.ts` pins
 * both by a run (a handover at 0:00 to a target with either differs from picking it before the day,
 * and to a target with neither does not):
 *
 * - **the answer stage's car-level half** — how long doors wait, how often they reopen, and how
 *   full a car is before it passes a landing are set on each car when it is built
 *   (`model/car/car.ts`), so every `answer` field but the group-level sole-car override;
 * - **the demand forecast's settings** — the arrival model a predicted-demand park reads is built
 *   per bank from the opening profile's `idle.predictor*` fields.
 *
 * Compared as data against the day's own dispatcher, so the note appears only when the target
 * would differ there, and never names a field.
 */
export function switchNoteOf(target: DispatcherProfile, driving: DispatcherProfile): string | undefined {
  const notes: string[] = [];
  if (carLevelAnswerOf(target) !== carLevelAnswerOf(driving)) notes.push(SWITCH_KEEPS_DOORS);
  if (forecastOf(target) !== forecastOf(driving)) notes.push(SWITCH_KEEPS_FORECAST);
  return notes.length === 0 ? undefined : notes.join('; ');
}

/** {@link switchNoteOf}'s door half. */
export const SWITCH_KEEPS_DOORS =
  'the cars keep the door timing they started the day with, and the load at which a full car ' +
  'passes a landing — both are fixed when the day starts';

/** {@link switchNoteOf}'s forecast half. */
export const SWITCH_KEEPS_FORECAST =
  'the cars keep the forecast of where people will call from that they started the day with — ' +
  'it is set up when the day starts';

function carLevelAnswerOf(profile: DispatcherProfile): string {
  const { allowBypassIfSoleEligibleCar: _groupLevel, ...carLevel } = profile.answer ?? {};
  return canonicalOf(carLevel);
}

function forecastOf(profile: DispatcherProfile): string {
  return canonicalOf(
    Object.fromEntries(
      Object.entries(profile.idle ?? {}).filter(([key]) => key.startsWith('predictor')),
    ),
  );
}

/**
 * The stage's `recomputing` beat — contract § 1.4's own requirement, verbatim in intent: a
 * re-simulation above ~400 ms shows this rather than freezing. One sentence, here with the other
 * intervention words so the honesty sweep drives it, and shown by `dev/main.ts` only once the
 * round trip has actually outlived the threshold — a 181 ms building must not flash it.
 */
export const RECOMPUTING_BEAT = 'recomputing the day…';

/**
 * What the stage says a change *did*, past tense, per change kind. A `switch` with no default, so
 * a fourth `InterventionChange` arm is a compile error here rather than a stamp that renders
 * `undefined` — the exhaustiveness the old `Record<kind, string>` bought, kept across the two arms
 * whose words are parametric: `switch-dispatcher` names the profile's display name (never its id),
 * and `answer-incident` quotes the chosen option's own authored words, so a spectator replaying the
 * record reads the same sentence the player did (§ 20.16 — `atS` is `runIncidentClock`, and the
 * clock beside this verb is how it appears on the report).
 *
 * ## Why it is exported now, when its own docstring used to argue it must not be
 *
 * It read *"Not exported: the sentence a player reads is the stamp, and two exports for one
 * sentence would be two places for it to drift apart."* The argument was about **two sentences**,
 * and it still holds — what has changed is that a third surface needs the *same* sentence in a
 * different clock. A rush round is measured in held time (`everyday/rush.ts#heldClock`), not in the
 * building's hour, so {@link interventionStampOf} and {@link interventionLogOf} — both of which
 * take `dayStartS` and format through {@link clockAt} — cannot serve it. GitHub issue **#565**'s
 * third defect is the rush sheet saying *"1 change while it played"* and naming neither the change
 * nor its clock; `everyday/rushPost.ts` now draws one line per press, and it draws **this** verb.
 * Exporting the producer is what keeps the Day report's *switched to Predictive balanced* and the
 * rush sheet's identical, which is the drift the old sentence was protecting against — a second
 * past-tense vocabulary for one press would be the thing it forbade.
 */
export function stampVerbOf(change: InterventionChange): string {
  switch (change.kind) {
    case 'park-cars-lobby':
      return 'parked the cars in the lobby';
    case 'spread-cars':
      // The rule's sentence in the past tense — one vocabulary, see `SPREAD_CARS_LABEL`.
      return SPREAD_SENTENCE.replace(/^spread /u, 'spread ');
    case 'switch-dispatcher':
    case 'adopt-dispatcher':
      // The handoff's own worked example, verbatim in shape: `09:14 · switched to Lobby anchor`
      // (§ 7.6). The handoff wins every disagreement about copy. One past tense for both handover
      // kinds (§ D1048): the stamp names who took over, and the pins note says how much.
      return `switched to ${change.profile.name}`;
    case 'answer-incident':
      return `answered the incident — ${change.option}`;
    case 'equipment-change':
      // GitHub issue #370. The schedule's own tier word (*Equipment*) in the player's register, and
      // the change's own authored name after it — never `changeId`, which is a key in a data file
      // and is exactly what gameplay § 16 rule 11 forbids on this surface.
      return `fitted new equipment — ${change.name}`;
    case 'building-change':
      return `changed the building — ${change.name}`;
  }
}

/**
 * **Who drove which stretch of the day** — wave AL, lane AL-A, the post-AK panel's seats B and C.
 *
 * A handover (`adopt-dispatcher`, or a stored weights-only `switch-dispatcher`) is an entry on the
 * run's intervention log; the recording's `dispatcherProfileId` keeps naming the dispatcher the
 * day was **configured** with. So the stage header kept reading *DRIVING Minimum estimated wait*
 * until 18:00 after the player handed the day to *Fairness first* at 08:48, and the report's title
 * named the configured dispatcher above its own log line reading *08:48 · switched to Fairness
 * first*. Every surface that names the driver reads this list instead: the stage and the Engineer
 * canvas at the playhead ({@link driverNameAt}), and the report over the whole day
 * ({@link driversLineOf}).
 *
 * The first stretch starts with the day (`fromS` `undefined`) under `startName`, the configured
 * dispatcher's display name. A handover that names the dispatcher already driving opens no
 * stretch, because nothing changed hands. Entries are read in time order, and two at one instant
 * resolve the way {@link interventionStampOf} resolves them: the later entry wins.
 */
export interface DriverStretch {
  /** The simulated second this driver took over, or `undefined` for the one the day began with. */
  readonly fromS: number | undefined;
  readonly name: string;
}

export function driverStretchesOf(
  interventions: readonly RunInterventionConfig[],
  startName: string,
): readonly DriverStretch[] {
  const stretches: DriverStretch[] = [{ fromS: undefined, name: startName }];
  const inTime = interventions
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.atS - b.entry.atS || a.index - b.index);
  for (const { entry } of inTime) {
    const change = entry.change;
    if (change.kind !== 'adopt-dispatcher' && change.kind !== 'switch-dispatcher') continue;
    const name = change.profile.name;
    const last = stretches[stretches.length - 1];
    if (last !== undefined && last.name === name) continue;
    if (last !== undefined && last.fromS === entry.atS) {
      stretches[stretches.length - 1] = { fromS: entry.atS, name };
      continue;
    }
    stretches.push({ fromS: entry.atS, name });
  }
  return stretches;
}

/** The dispatcher driving at `simTimeS` — the stage header's `DRIVING` cell. */
export function driverNameAt(
  interventions: readonly RunInterventionConfig[],
  simTimeS: number,
  startName: string,
): string {
  let name = startName;
  for (const stretch of driverStretchesOf(interventions, startName)) {
    if (stretch.fromS === undefined || stretch.fromS <= simTimeS) name = stretch.name;
  }
  return name;
}

/**
 * Who drove the whole day, in one line — `Conventional collective`, or `Conventional collective,
 * then Fairness first from 08:48`. The report's title line reads it, so the sheet names who drove
 * when rather than only who the day was configured with.
 */
export function driversLineOf(
  interventions: readonly RunInterventionConfig[],
  startName: string,
  dayStartS?: number | undefined,
): string {
  return driverStretchesOf(interventions, startName)
    .map((stretch) => (stretch.fromS === undefined ? stretch.name : `then ${stretch.name} from ${clockAt(stretch.fromS, dayStartS)}`))
    .join(', ');
}

/**
 * The most recent intervention **as of the playhead**, stamped — `09:14 · parked the cars in the
 * lobby` — or `''` when none has taken effect yet.
 *
 * `''` rather than a placeholder sentence, because an empty log is not a state that needs
 * narrating: the control's own label already says what pressing it would do, and a stamp reading
 * *no interventions yet* would be a caption over nothing (`docs/10` R3's blank, inverted).
 *
 * `dayStartS` follows {@link clockAt}'s contract — the run's own hour, `undefined` falling back
 * to the shared `DAY_START_S` — so a caller holding `trace.startOfDayS` passes it through.
 */
export function interventionStampOf(
  interventions: readonly RunInterventionConfig[],
  simTimeS: number,
  dayStartS?: number | undefined,
): string {
  let latest: RunInterventionConfig | undefined;
  // The log is authored in press order, which is time order for a control that always appends
  // at the playhead; the scan keeps the *last* qualifying entry so two presses at one instant
  // resolve the way the kernel resolves them — the later entry wins (invariant 4's tie rule,
  // read back out).
  for (const entry of interventions) {
    if (entry.atS <= simTimeS) latest = entry;
  }
  if (latest === undefined) return '';
  return `${clockAt(latest.atS, dayStartS)} · ${stampVerbOf(latest.change)}`;
}

/**
 * The whole log, one stamped line per intervention in time order — the filed sheet's record of
 * what the player changed mid-run (`docs/19` defect 10).
 *
 * ## Why this exists beside {@link interventionStampOf} rather than inside it
 *
 * The stamp answers for a **playhead** and deliberately names one entry; the Day report is an
 * account of the **whole day** (§ D223 — a reader who paused at 09:00 has not made the afternoon
 * not happen), so its lines are the whole log and no playhead enters the signature. The two are
 * different claims — *what has taken effect on the stage* against *what this day's record holds* —
 * and folding them into one function would put a playhead parameter on a surface that must not
 * consult one.
 *
 * Each line is the stage's own stamp, verbatim (`09:14 · parked the cars in the lobby`): shared
 * {@link stampVerbOf}, shared {@link clockAt}, so the sheet and the stage can never disagree about
 * what a press was called or when it landed. The sort is a defensive copy in time order — the log
 * is authored in press order, which is time order for a control that appends at the playhead, but
 * the sheet's claim is *in time order* and it holds that claim itself rather than inheriting it.
 *
 * `[]` for an empty log, never a placeholder line: a day the player did not touch reads exactly as
 * it always did, and *"no interventions"* would be a caption over nothing (`docs/10` R3's blank,
 * inverted — {@link interventionStampOf}'s own rule, kept).
 *
 * ## `runIncidentClock` is one of these lines — § 20.16, discharged by unification
 *
 * A campaign incident's answer is an `answer-incident` entry on the same log, stamped with the
 * simulated second it was given, so *"`runIncidentClock` must … appear on the report"* is met by
 * this function doing for that entry exactly what it does for every other: one line, the answer's
 * own clock, the chosen option's own words. There is no second clock and no second renderer to
 * drift from this one.
 */
export function interventionLogOf(
  interventions: readonly RunInterventionConfig[],
  dayStartS?: number | undefined,
): readonly string[] {
  return [...interventions]
    .sort((a, b) => a.atS - b.atS)
    .map((entry) => `${clockAt(entry.atS, dayStartS)} · ${stampVerbOf(entry.change)}`);
}

/* -------------------------------------------------------------------------- *
 * The bought kinds — GitHub issue #370, `docs/38` § 2.3, § D525 clause 4
 * -------------------------------------------------------------------------- */

/**
 * Which tier of `data/price-schedule.json` records which intervention kind.
 *
 * **The map is the whole of the distinction between the two kinds**, and it lives here rather than
 * in `core` because a tier is a *pricing* fact: `core` reads no schedule, carries `changeId` as an
 * opaque string, and would have to learn the ladder to check this. Read off the shipped tier ids,
 * never off a tier's `order` — `pricing/types.ts` makes the order data so that nothing branches on
 * a name, and this table branches on the name deliberately, because a *record kind* is a wire
 * vocabulary and re-keying it to a position would make a re-ordered ladder rewrite history.
 *
 * The `dispatcher` tier is deliberately absent and its absence is a decision: a dispatcher change
 * mid-run is already a kind (`switch-dispatcher`, § 7.6), so a third kind meaning the same press
 * would be two records for one act. A schedule that grows a fourth tier is refused by name at
 * {@link worksKindOfTier} rather than guessed at.
 */
export const WORKS_KIND_BY_TIER: Readonly<
  Record<string, 'equipment-change' | 'building-change'>
> = Object.freeze({
  equipment: 'equipment-change',
  building: 'building-change',
});

/** The kind a tier's purchases are recorded as, or `undefined` for a tier no kind records. */
export function worksKindOfTier(tierId: string): 'equipment-change' | 'building-change' | undefined {
  return WORKS_KIND_BY_TIER[tierId];
}

/**
 * The control's label for a purchase — the schedule's own name for the change, imperative because
 * it is a button, with what it costs beside it.
 *
 * The price is **read from the schedule and never authored here**, which is #366's founding rule
 * and the reason `data/fixit-cases.json` stopped carrying a `costUnits` per repair: two price lists
 * is how the same change comes to cost three different things on three screens.
 */
export function worksLabelOf(change: PricedChange): string {
  // A rated row carries its rate on its face rather than a total, because this control holds no
  // quantity to multiply by — § D619, and `admitWorks` refuses such a change for the same reason.
  if (change.rate !== undefined) {
    return `${change.name} · ${String(change.rate.unitsPer)} units per ${change.rate.quantity.unit}`;
  }
  return `${change.name} · ${String(purchaseUnits(change))} units`;
}

/**
 * What pressing a purchase does to the record, in one sentence — the parking arm's own shape, with
 * the two facts that are this kind's alone: the day's fabric moves from this moment, and the crowd
 * does not move at all.
 *
 * The second half is a **promise about the mechanism** and is pinned by a run rather than by this
 * sentence (`core/src/sim/interventions.test.ts`, *holds the crowd across the press*), which is
 * § D227's rule read the way it is meant: a control that states what it does owes a measurement,
 * not a second sentence.
 */
export const WORKS_ARM_EXPLAINS =
  'appends to today’s record at the playhead and re-simulates the day from the start — the ' +
  'building changes from this moment on, everything before it is unchanged, and the same people ' +
  'arrive at the same seconds either side of the press';

/*
 * **What a bought change costs the live path, measured — and it is not what GitHub issue #370
 * assumed.**
 *
 * The issue reads *"a building change re-simulates more than a dispatcher switch"*, and it does
 * not. Measured on this tree with `runSimulation` over the default 30-minute CIBSE template under
 * `collective` at seed 20 260 726 — one warm-up then five timed runs, median of five, on an Apple
 * M1 Max (10 cores, 32 GB, Node v26.5.0), which is the machine clause [§ D483](../../../../DECISIONS.md)
 * requires of any test-cost figure:
 *
 * | building | no log | `switch-dispatcher` | `building-change` (a rezone) |
 * |---|---|---|---|
 * | `garden-apartments` | 3.8 ms | 2.6 ms | **1.8 ms** |
 * | `midtown-office` | 97.0 ms | 94.6 ms | **80.6 ms** |
 * | `vertical-city` | 357.2 ms | 354.5 ms | **325.2 ms** |
 *
 * **A bought change is the cheapest of the three at every size**, and the reason is structural
 * rather than lucky: the whole day is re-simulated from t = 0 on *every* intervention (contract
 * § 1.4), so the log's contents cannot change the number of simulations, and a narrowed bank then
 * serves fewer legs than the same day served without it. There is no arm of this kind that costs
 * more than a switch, because there is no arm of it that runs anything a switch does not.
 *
 * **The top of the range is bounded by § D527's second measurement rather than by this table.**
 * That figure is **1.33–1.38 s** per 3 600 s replication at the Burj-class reference on the same
 * machine (`record/burjReference.test.ts`), and it bounds the live path for every kind at once for
 * the reason above. So the beat's ~400 ms threshold ({@link RECOMPUTING_BEAT}) is crossed by the
 * *building*, never by what was bought on it: `vertical-city` is under it and the reference is over
 * it, whichever kind the press was.
 *
 * Stated here and not asserted as a bound in a test, deliberately: a wall-clock assertion is a
 * claim about a machine, and this repository's own rule is that such a figure is dated and named
 * rather than turned into a gate that goes red on a loaded box. Measured 2026-09-10.
 */

/** What a rung learns about one mid-run purchase **before** anything is appended to the record. */
export interface WorksAdmission {
  readonly admitted: boolean;
  /** What the schedule prices this change at. `0` when the schedule prices nothing for it. */
  readonly priceUnits: number;
  /** What this day's record has already committed — see {@link spentOnWorks}. */
  readonly spentUnits: number;
  /** The rung in force. */
  readonly budgetUnits: number;
  /** Why it is refused. Never `undefined` when {@link WorksAdmission.admitted} is `false`. */
  readonly reason: string | undefined;
}

/**
 * What a day's record has already spent on mid-run purchases, priced from the schedule.
 *
 * **Distinct by change id**, on `pricing/repairPrice.ts#changesBought`'s stated rule: a patch that
 * trims both dwell settings has bought *one* change, and charging twice would invent a price the
 * ladder does not hold. The same reading applies down the time axis — a player who re-zones a bank
 * at 09:00 and re-zones it again at 11:00 has bought the rezone once and used it twice — and saying
 * so here rather than assuming it is the point, because the opposite reading is equally arguable and
 * only one of them can be the shipped one.
 *
 * An id the schedule does not price contributes **nothing** and is not guessed at, which is
 * `admitPurchase`'s own treatment of an unpriced dimension; {@link admitWorks} is where an unknown
 * id is refused, because a refusal belongs at the press and not in an arithmetic helper.
 */
export function spentOnWorks(
  schedule: PriceSchedule,
  interventions: readonly RunInterventionConfig[],
): number {
  const bought = new Map<string, number>();
  for (const entry of interventions) {
    const change = entry.change;
    if (change.kind !== 'equipment-change' && change.kind !== 'building-change') continue;
    const priced = schedule.changes.find((row) => row.id === change.changeId);
    if (priced !== undefined) bought.set(priced.id, purchaseUnits(priced));
  }
  return [...bought.values()].reduce((sum, units) => sum + units, 0);
}

/** Everything {@link admitWorks} needs. */
export interface WorksAdmissionInput {
  /** The shipped ladder — `data/price-schedule.json`, parsed. */
  readonly schedule: PriceSchedule;
  /** The rung in force: the scenario's base plus whatever chimes have bought (`scenario/budget.ts`). */
  readonly budgetUnits: number;
  /** Today's record, so a second purchase is priced against what the first already spent. */
  readonly interventions: readonly RunInterventionConfig[];
  /** The change being bought — a `PricedChange.id`. */
  readonly changeId: string;
  /** Which kind the press would record, so a tier the id does not sit in is refused by name. */
  readonly kind: 'equipment-change' | 'building-change';
  /**
   * **The tower the day is running on** — GitHub issue #477.
   *
   * Required rather than optional, and that is the decision. A purchase is admitted against what
   * it would *do*, and a caller allowed to omit the building would be admitted without anybody
   * having asked whether the change can land — which is how a shipped `rezone-bank` came to be
   * offered on a bank whose range cannot move at all.
   */
  readonly building: ResolvedBuilding;
  /**
   * **What buying it would do to that tower**, at or after the press — `StageWorksOffer`'s own
   * field, handed here so the ground below can read it. `[]` is legal and means *the stamp is the
   * point*, exactly as it does on the record.
   */
  readonly serviceEvents: readonly ResolvedServiceEvent[];
}

/**
 * Why this build cannot carry a purchase's effects, in the player's own register, or `undefined`
 * when it can — GitHub issue **#477**.
 *
 * ## The one ground it has, and why it is a refusal rather than a crash
 *
 * A range effect aimed at a **double-deck** bank. `core`'s `Bank.setServesFloors` refuses such a
 * bank on § D131's first model rule — the decks are bolted together and open on one interlock, so
 * a pair of floors is a single stop position and a served-floor list cannot split one — and before
 * #477 that refusal arrived as a `ModelError` **out of the running day**, mid-afternoon, from a
 * `rezone-bank` row the shipped schedule offers over `building.banks[]`. `vertical-city` ships
 * eight such cars across four pairs, so the tower it would happen on is one this project ships.
 *
 * The engine now warns and declines to schedule such an effect, so the day survives it. That alone
 * would be the worse half of the bargain — a priced change that takes the money and does nothing —
 * which is why the press is refused **here**, before anything is appended to the record. Nothing is
 * appended, so `spentOnWorks` counts nothing: the sentence and the money move together.
 *
 * ## Register
 *
 * The bank is named by its **display name** and never its id (gameplay § 16 rule 11), falling back
 * to the id only for a bank whose author left it unnamed — a missing name is worse read as an empty
 * quotation than as an engine identifier. `bankRangeIsFixed` is `core`'s, so this sentence and the
 * engine's warning cannot come to disagree about which banks they describe; only their wording
 * differs, because only one of the two has a player reading it.
 */
function unbuildableReasonOf(
  building: ResolvedBuilding,
  changeName: string,
  serviceEvents: readonly ResolvedServiceEvent[],
): string | undefined {
  for (const effect of serviceEvents) {
    if (!isServiceRangeEvent(effect)) continue;
    const bank = building.banks.find((candidate) => candidate.id === effect.bankId);
    if (bank === undefined || !bankRangeIsFixed(bank)) continue;
    return (
      `“${changeName}” would re-zone ${bank.name ?? bank.id}, whose cars are double-deck — the two ` +
      'decks are bolted together and open as one stop, so the pair of floors they serve cannot be ' +
      'split and this bank keeps the range it was built with. Nothing has been bought.'
    );
  }
  return undefined;
}

/**
 * May this budget pay for this mid-run change? — answered before anything is appended, and
 * **naming the price and the budget** when it cannot.
 *
 * `scenario/budget.ts#admitPurchase` is the same question one substrate over — it prices a set of
 * moved *search-space dimensions* against a rung — and this is deliberately not folded into it: the
 * inputs are different (one change id against a running total, rather than a set of dials), the
 * refusal has to name a running total that does not exist there, and § D528 clause 3 makes the
 * budget a substrate of its own rather than a second opinion about dials. What is shared is the
 * arithmetic that matters: both read every price from the schedule and neither writes one down.
 *
 * ## The four refusals, in the order they are decided
 *
 * 1. **An id the schedule does not price.** Refused rather than charged nothing, because a change
 *    the ladder has never heard of is a record this build cannot re-derive a spend from — and
 *    silently free is the worst of the answers, since it would let a stored record buy the
 *    tower for nothing. `pricing/parse.ts#priceOf` throws for the same reason; this returns the
 *    sentence instead, because the caller is a screen.
 * 2. **A change priced on a tier this kind does not record.** `equipment-change` says *this was
 *    bought on the equipment rung*, and a record claiming a 20-unit building change was bought there
 *    is a record whose spend does not reconcile. Refused by name.
 * 3. **A change whose effects this tower cannot carry** — GitHub issue **#477**,
 *    {@link unbuildableReasonOf}. Decided **before** the purse, and the order is the decision: a
 *    change the building could never take must not be refused for money, or a player reads *save up
 *    and try again* about something no budget will ever buy.
 * 4. **A rung that cannot cover it beside what the day has already spent.** The sentence names the
 *    price, the budget and the amount already committed, because a refusal that says only *you
 *    cannot afford this* leaves a player unable to tell a dear change from an exhausted purse.
 *
 * Every one of them returns before anything is appended to the record, which is what makes
 * {@link spentOnWorks} the honest account of a day: a refused press is a press that did not happen,
 * so the sentence a player reads and the units they are charged move together.
 */
export function admitWorks(input: WorksAdmissionInput): WorksAdmission {
  const { schedule, budgetUnits, changeId, kind } = input;
  const spentUnits = spentOnWorks(schedule, input.interventions);
  const priced = schedule.changes.find((row) => row.id === changeId);
  if (priced === undefined) {
    return {
      admitted: false,
      priceUnits: 0,
      spentUnits,
      budgetUnits,
      reason:
        `this build has no price for “${changeId}”, so there is no way to say what it would cost ` +
        'today — and a change nobody can price is one nobody can be billed for honestly',
    };
  }
  /*
   * **A change priced per unit is refused rather than priced at one** — GitHub issue #437,
   * [§ D619](../../../../DECISIONS.md), on [§ D552](../../../../DECISIONS.md)'s ruling.
   *
   * This control buys *a whole change* and holds no quantity, so `purchaseUnits` would throw here
   * rather than return a number — and a throw out of an admission function is a crashed stage
   * screen where the contract above promises a refusal with a reason on it. No shipped offer names
   * a rated change today (`landing-panels` is the only one, and `StageWorksOffer`s are authored
   * rather than enumerated from the schedule), so this is reachable only by authoring one; it is
   * written now because the alternative to a refusal here is not *nothing*, it is a stack trace.
   */
  if (priced.rate !== undefined) {
    return {
      admitted: false,
      priceUnits: 0,
      spentUnits,
      budgetUnits,
      reason:
        `“${priced.name}” is priced at ${String(priced.rate.unitsPer)} units per ` +
        `${priced.rate.quantity.unit}, and this control buys a whole change rather than a number ` +
        'of them — so there is no honest figure to bill today, and choosing one would be choosing ' +
        'how many for you',
    };
  }
  const priceUnits = purchaseUnits(priced);
  const recordedAs = worksKindOfTier(priced.tier);
  if (recordedAs !== kind) {
    return {
      admitted: false,
      priceUnits,
      spentUnits,
      budgetUnits,
      reason:
        `“${priced.name}” is priced on the ${priced.tier} rung of the ladder, and this control buys ` +
        `on the ${kind === 'equipment-change' ? 'equipment' : 'building'} rung — the day’s record ` +
        'would say it was paid for somewhere it was not',
    };
  }
  const unbuildable = unbuildableReasonOf(input.building, priced.name, input.serviceEvents);
  if (unbuildable !== undefined) {
    return {
      admitted: false,
      priceUnits,
      spentUnits,
      budgetUnits,
      reason: unbuildable,
    };
  }
  const alreadyBought = input.interventions.some(
    (entry) =>
      (entry.change.kind === 'equipment-change' || entry.change.kind === 'building-change') &&
      entry.change.changeId === changeId,
  );
  // A change already on today's record costs nothing to repeat — {@link spentOnWorks}' distinct-by-id
  // rule, read at the press so the two cannot disagree about what a second rezone costs.
  const owed = alreadyBought ? 0 : priceUnits;
  if (spentUnits + owed <= budgetUnits) {
    return { admitted: true, priceUnits, spentUnits, budgetUnits, reason: undefined };
  }
  return {
    admitted: false,
    priceUnits,
    spentUnits,
    budgetUnits,
    reason:
      `“${priced.name}” costs ${String(priceUnits)} units and today’s budget holds ` +
      `${String(budgetUnits)}, with ${String(spentUnits)} already spent on this day’s changes. ` +
      'A wider budget is bought with chimes; the bar the day is judged against does not move with it.',
  };
}
