/**
 * **A rush sitting as the viewer keeps it, and what it may put on the wire** — GitHub issue
 * **#372**, `docs/38` § 2.3, under the owner's ruling of 2026-09-10 on that issue:
 *
 * > *"A round is a sitting, posted whole … A sitting is consecutive runs from an as-shipped start.
 * > The posted result carries every round's intervention log, and the server replays the chain and
 * > derives each round's purse from the previous round's hold moment."*
 *
 * `packages/server/src/leaderboard/rushSitting.ts` is the other end and landed first
 * ([§ D542](../../../../DECISIONS.md)); this is the client half the issue's fourth criterion asks
 * for. The split is `everyday/postRun.ts`'s: this module decides **what a sitting is and whether it
 * may travel**, `everyday/rushPost.ts` decides **what the block says**, and
 * `everyday/reportScreen.ts` draws it.
 *
 * ## A round is recorded when it ends, from the state that produced it
 *
 * {@link rushRoundRecordOf} is called from `everyday/host.ts#endRush`, which is the one moment the
 * live `ViewerState`, the recording and the end are all in hand at once. Everything a round can be
 * refused for is decided **there** rather than at the press: a player who hands a round to a
 * hand-tuned dispatcher learns it cannot be posted while they are still playing, which is § D486's
 * fourth criterion applied to a sitting, and `scope/switchWire.ts#switchUnpostableReasonOf` is the
 * sentence it is told in.
 *
 * **Every refusal sentence here is owned by the module that decides the thing.** The two ids come
 * from `scope/runIdentity.ts#runIdentityIssues`, the switch target from `scope/switchWire.ts`, and
 * an intervention kind from `core`'s own `interventionKindRefusal`. This module authors four sentences of
 * its own — a last round ended by hand, one that never broke, a sitting too long to post and one
 * with nothing played yet — and every one is a fact about a *sitting* that no other module has an
 * opinion about.
 *
 * ## Why the identity predicate is asked and then filtered
 *
 * {@link rushRoundRecordOf} calls `runIdentityIssues(state, resources, 'ranked')` and keeps **two**
 * of its answers, the building and the dispatcher. That looks like discarding a gate and is the
 * opposite: a sitting's wire carries a building id, a dispatcher id, rule rows and a log, and
 * `packages/server`'s `verify.ts#rushRoundConfigFor` derives the seed, the stream, the length, the
 * rate and the window **from the building** — so every other question that predicate asks is about
 * a field a sitting cannot carry and the server does not read. Asking them anyway would refuse a
 * round for a field the server itself writes. The two that are kept are exactly the two ids the
 * wire does carry, and they are kept **as that module's sentences** so a player meets one wording
 * for *this is saved on your device alone* wherever they meet it.
 * `rushSitting.test.ts` asserts both keys still exist in that predicate, so a rename goes red here
 * rather than quietly dropping a gate.
 *
 * ## What is deliberately not on the wire, and it is most of it
 *
 * No seed, no stream, no rate, no length, no window — the server derives all five. **And no purse
 * and no amount**: `rushSitting.ts#NEVER_ON_THE_WIRE` refuses a client-named purse by name, so this
 * module has no field that could carry one and computes none. A purse a player reads is the
 * server's own answer to their own post, drawn by {@link everyday/rushPost.ts} and never by this
 * device's arithmetic — which is the whole of § D486's *a submission carries causes and the server
 * derives effects*, on the one figure a client would be tempted to compute.
 *
 * Recorded under [§ D405](../../../../DECISIONS.md) where it binds only this module and the two
 * beside it; the sitting protocol it serves is [§ D542](../../../../DECISIONS.md) and the decision
 * this lane took about the half it cannot build is [§ D606](../../../../DECISIONS.md).
 */

import {
  interventionKindRefusal,
  type DispatcherProfile,
  type RuleRowConfig,
  type RunInterventionConfig,
} from '@elevator-sim/core/browser';

import type { VizRecording } from '../contract/types.js';
import type { BrowserResources } from '../dev/data.js';
import type { ViewerState } from '../dev/state.js';
import { stampVerbOf } from '../live/interventions.js';
import { runIdentityIssues } from '../scope/runIdentity.js';
import { switchUnpostableReasonOf, switchWireOf, type WireIntervention } from '../scope/switchWire.js';

import { rushHoldAt, rushOutcomeOf, type RushOutcome } from './rush.js';

/**
 * The most rounds one sitting may post — `packages/server`'s `rushSitting.ts#MAX_SITTING_ROUNDS`.
 *
 * Restated here rather than imported because `packages/viz` may not depend on `packages/server`
 * (§ D215 § 3), which is the same reason `menu/account.ts` mirrors the password bounds and the same
 * asymmetry makes it safe: a client bound *stricter* than the server's refuses something the server
 * would have taken, so it is the client's bound that has to be the one a player is told about, and
 * `rushSitting.test.ts` asserts this constant against the server's own source text — which is
 * `validation/documentation.test.ts`' method, used here for § D215 § 3's reason.
 */
export const MAX_SITTING_ROUNDS = 12;

/* -------------------------------------------------------------------------- *
 * A round, as this device recorded it
 * -------------------------------------------------------------------------- */

/**
 * One press a round recorded, as the sheet reads it back — GitHub issue **#565**, § D859.
 *
 * Reading only: it never travels. What the server replays is {@link RushRoundRecord.wireInterventions},
 * which carries the change itself; this is the same press turned into the two things a player needs
 * to follow a causal chain (`docs/43` P3) — when it happened and what it was.
 */
export interface RushRoundChange {
  /** Seconds from the round's start — `RunInterventionConfig.atS`, unaltered. */
  readonly atS: number;
  /**
   * What it was, past tense, in the stage stamp's own words — `live/interventions.ts#stampVerbOf`.
   *
   * The producer is shared rather than re-worded here for the reason that function's own docstring
   * now gives: the Day report's *switched to Predictive balanced* and this sheet's have to be the
   * same sentence, or one press acquires two accounts of itself.
   */
  readonly verb: string;
}

/**
 * One finished round of a sitting.
 *
 * Two halves, and they are different things on purpose. The **wire** half — the ids, the rows, the
 * log and {@link RushRoundRecord.holdS} — is what a post carries. The **reading** half — the
 * drivers, the changes, the outcome, the press count — is what the round list draws, and none of it
 * travels: a name is a display string the server neither reads nor trusts, and the outcome is the
 * player's own view of a round the server will replay for itself.
 */
export interface RushRoundRecord {
  /** The dispatcher the round was driven from, by id. */
  readonly dispatcherProfileId: string;
  /**
   * What the round **opened** on, for the round list. Never on the wire.
   *
   * Read {@link RushRoundRecord.drivers} before drawing this on its own: a round that was handed
   * over part-way through did not run on this dispatcher, and a line saying *driven by* over this
   * name alone is GitHub issue **#565**'s third defect.
   */
  readonly dispatcherName: string;
  /**
   * Every dispatcher that drove some part of the round, in the order they drove it — the opening
   * one, then each `switch-dispatcher` press's target. GitHub issue #565, § D859.
   *
   * Never on the wire: a name is a display string, and the server replays the round from the ids
   * and the log rather than from this. One entry on a round nobody handed over, so the ordinary
   * sheet reads exactly as it did.
   */
  readonly drivers: readonly string[];
  /**
   * What the player changed while it played, in time order — one entry per press, whether or not
   * it travels. GitHub issue #565, § D859.
   *
   * Beside {@link interventionCount} rather than instead of it, because the two answer different
   * questions and the sheet draws both: the count is *how much happened*, this is *what happened*.
   * The sheet read `1 change while it played` and said neither what nor when, which is the one
   * thing `docs/43` P3's causal-chain protocol needs from a sitting.
   */
  readonly changes: readonly RushRoundChange[];
  /** The player's rules over it, in first-match order. */
  readonly ruleRows: readonly RuleRowConfig[];
  /**
   * The round's log as the wire carries it, or `undefined` when something on it cannot travel —
   * in which case {@link unpostable} says which press and why.
   */
  readonly wireInterventions: readonly WireIntervention[] | undefined;
  /** How many presses the round recorded, whether or not they travel — the round list's figure. */
  readonly interventionCount: number;
  /**
   * The recording's own hold moment, seconds from the round's start, or `null` when the stream ran
   * out without the line holding.
   *
   * **This and not {@link RushOutcome.heldS}**, and the difference is the one that would have the
   * server refuse an honest player. `heldS` is where the round *ended* — the hold line, or the
   * player's hand, whichever came first. The server replays the whole ninety minutes and reads the
   * hold moment off its own legs (`core`'s `rushHoldAtLegs`), which is this quantity, so a round
   * ended by hand at 8:20 whose recording holds at 13:40 has to claim 13:40 or fail to reproduce.
   * Whether a *hand-stopped* round may post at all is § D515's separate question, answered below.
   */
  readonly holdS: number | null;
  /** The round as the player saw it end — what the result sheet is drawn from. */
  readonly outcome: RushOutcome;
  /**
   * Why this round cannot travel, as sentences, or empty. Each is owned by the module that decides
   * it — see the module docstring.
   */
  readonly unpostable: readonly string[];
}

/**
 * Turn the round that has just ended into a record — `everyday/host.ts#endRush`'s one caller.
 *
 * `state` is the state the round ran under, `recording` the run it produced and `endedAtS` the
 * simulated second it ended at, from the run's start, in the host's own units.
 */
export function rushRoundRecordOf(input: {
  readonly state: ViewerState;
  readonly resources: BrowserResources;
  readonly recording: VizRecording;
  readonly endedAtS: number;
  /** What the driving dispatcher is called — `EverydayHost.dispatcherById`'s answer, or the id. */
  readonly dispatcherName: string;
}): RushRoundRecord {
  const { state, resources, recording } = input;
  const shipped = resources.dispatcherProfiles.profiles;
  const unpostable: string[] = [];

  /* The two ids the wire carries, in that predicate's own words — see the module docstring. */
  for (const issue of runIdentityIssues(state, resources, 'ranked')) {
    if (issue.key === 'viewer.buildingId' || issue.key === 'viewer.dispatcherId') unpostable.push(issue.message);
  }

  const wire = wireRoundInterventions(state.interventions, shipped);
  unpostable.push(...wire.refusals);

  const holdAtS = rushHoldAt(recording);
  /*
   * The changes and the drivers, in time order — GitHub issue #565, § D859. The log is authored in
   * press order, which is time order for a control that appends at the playhead, but the sheet's
   * claim is *in time order* and it holds that claim itself rather than inheriting it, which is
   * `live/interventions.ts#interventionLogOf`'s own defensive copy and its reason.
   */
  const ordered = [...state.interventions].sort((a, b) => a.atS - b.atS);
  const drivers = [
    input.dispatcherName,
    ...ordered.flatMap((entry) => (entry.change.kind === 'switch-dispatcher' ? [entry.change.profile.name] : [])),
  ];
  return Object.freeze({
    dispatcherProfileId: state.dispatcherId,
    dispatcherName: input.dispatcherName,
    drivers: Object.freeze(drivers),
    changes: Object.freeze(ordered.map((entry) => ({ atS: entry.atS, verb: stampVerbOf(entry.change) }))),
    ruleRows: Object.freeze([...state.ruleRows]),
    wireInterventions: wire.log,
    interventionCount: state.interventions.length,
    holdS: holdAtS === undefined ? null : holdAtS - recording.startedAt,
    outcome: rushOutcomeOf(recording, input.endedAtS),
    unpostable: Object.freeze(unpostable),
  });
}

/**
 * The log for the wire, or the refusals that stop it — `scope/switchWire.ts#wireInterventionsOf`
 * made total.
 *
 * That function **throws** on a press the wire cannot carry, because on the day's path
 * `runIdentityIssues` has already refused such a state before a submission is assembled. A rush has
 * no such ordering: a round is recorded the moment it ends, whatever is on it, and the block that
 * would refuse it has not been drawn yet. So the same two questions are asked here and answered
 * with sentences instead of an exception — the kind's own refusal from `core`, and the switch
 * target's from the module that decides expressibility.
 */
function wireRoundInterventions(
  log: readonly RunInterventionConfig[],
  shipped: readonly DispatcherProfile[],
): { readonly log: readonly WireIntervention[] | undefined; readonly refusals: readonly string[] } {
  const refusals: string[] = [];
  const carried: WireIntervention[] = [];
  for (const entry of log) {
    const change = entry.change;
    if (change.kind === 'park-cars-lobby' || change.kind === 'spread-cars') {
      carried.push({ atS: entry.atS, change: { kind: change.kind } });
      continue;
    }
    if (change.kind === 'switch-dispatcher') {
      const target = switchWireOf(change.profile, shipped);
      if (target === undefined) {
        refusals.push(switchUnpostableReasonOf(change.profile, shipped) ?? '');
        continue;
      }
      carried.push({ atS: entry.atS, change: { kind: 'switch-dispatcher', ...target } });
      continue;
    }
    /*
     * `core`'s own reason for the kind, never a sentence of this file's. Three kinds reach here —
     * an incident answer and the two bought changes — and each is refused on its own ground, which
     * is what `interventionWire.ts` built the table for.
     */
    refusals.push(interventionKindRefusal(change.kind) ?? `this build cannot post a “${change.kind}” press`);
  }
  return { log: refusals.length > 0 ? undefined : Object.freeze(carried), refusals: Object.freeze(refusals) };
}

/* -------------------------------------------------------------------------- *
 * The sitting, and whether it may travel
 * -------------------------------------------------------------------------- */

/** One round as `POST /api/rush-sittings` reads it — `packages/server`'s `SubmittedRushRound`. */
export interface RushSittingRoundBody {
  readonly dispatcherProfileId: string;
  readonly ruleRows?: readonly RuleRowConfig[] | undefined;
  readonly interventions?: readonly WireIntervention[] | undefined;
  readonly claimedHeldS: number | null;
}

/**
 * One purchase a sitting claims to have been played with — `packages/server`'s `ClaimedModifier`.
 *
 * Named rather than written inline because three modules now pass one: the press that starts a rush
 * (`everyday/host.ts#startRush`, which gives it to `everyday/rush.ts#rushPatchOf` so a claimed
 * `rush-prefit` reaches the building), the session that holds it, and this body. The steps are the
 * account's, checked against its spends by the server and never here.
 */
export interface ClaimedRushModifier {
  readonly sinkId: string;
  readonly steps: number;
}

/** A sitting as `POST /api/rush-sittings` reads it — `packages/server`'s `SubmittedRushSitting`. */
export interface RushSittingBody {
  readonly buildingId: string;
  readonly rounds: readonly RushSittingRoundBody[];
  readonly modifiers?: readonly ClaimedRushModifier[] | undefined;
}

/**
 * One round as the **server** replayed it — the figures a 201 comes back with.
 *
 * Every field here is the server's own, and the purse three are the only purse figures anywhere in
 * this package: `packages/server`'s `rushSitting.ts` refuses a client-named purse by name, and
 * [§ D543](../../../../DECISIONS.md) clause 5 permits a purse only in *the poster's own answer*.
 * Declared here rather than in `everyday/rushPost.ts` so that `everyday/host.ts`, which carries the
 * answer, and the block, which draws it, read one shape without either importing the other.
 */
export interface RushPostedRound {
  readonly heldS: number | null;
  readonly wavesOutlasted: number;
  readonly purseBeforeUnits: number;
  readonly paidUnits: number;
  readonly purseAfterUnits: number;
}

/** Whether this sitting may be posted, and the body if it may. */
export type RushSittingCheck =
  | { readonly ok: true; readonly body: RushSittingBody }
  | { readonly ok: false; readonly reasons: readonly string[] };

/**
 * The four sentences this module authors, every one of them a fact about a **sitting** rather than
 * about a round: a round's refusals are owned by the modules that decide them, which the module
 * docstring names. Two of these four — the hand stop and the run that never broke — must never
 * share a wording, because a run the player stopped is one they can play out and a run that held
 * every wave is a tower this dispatcher does not break.
 */
export const RUSH_SITTING_COPY = Object.freeze({
  /** § D515's rule, from the client's side: the player ended it, so there is no breaking point. */
  handStopped:
    'This sitting cannot be posted: its last round was ended by hand, so it has no breaking point ' +
    'to rank. Play a round out to the line and the whole sitting goes up with it.',
  /** The stream ran the full ninety minutes and the line never held. */
  neverBroke:
    'This sitting cannot be posted: its last round held every wave to the end of the stream, so ' +
    'there is no moment where it broke. A rush posts how far it got before it stopped draining.',
  tooLong: (rounds: number): string =>
    `This sitting cannot be posted: a sitting carries at most ${String(MAX_SITTING_ROUNDS)} rounds ` +
    `and this one has ${String(rounds)}. Leave the rush and start a new sitting — the next one ` +
    'begins from the building as shipped.',
  /** Nothing has been played yet. Not a refusal a player can act on wrongly: it names the act. */
  noRounds:
    'There is no finished round to post yet. Run the rush and play a round out — a sitting is ' +
    'every round you have played since the building was as shipped.',
});

/**
 * Whether the rounds played so far may be posted, and the body if they may.
 *
 * The order is the order a player can act on: *there is nothing yet*, then *there is too much*,
 * then *the thing you are holding cannot travel*, then *the last round has nothing to rank*. All of
 * the reasons, never the first — `runIdentityIssues`' own rule, and for its reason: a reader told
 * about one and then about the next has been made to guess how many there are.
 *
 * **`modifiers` is a parameter and is still empty in every sitting this build produces**, and that
 * is the issue's third criterion rather than an oversight. Nothing here spends a chime
 * (`everyday/chimesPanel.ts` says so on its own face), so no account holds a rush modifier to
 * claim. **What changed on 2026-09-16 is what one of them would now do**
 * ([§ D640](../../../../DECISIONS.md)): a claimed `rush-prefit` reaches the run —
 * `everyday/host.ts#startRush` passes the sitting's claims to `everyday/rush.ts#rushPatchOf`, which
 * fits the building, and `packages/server`'s replay fits it with the same three effects — so the
 * sink is no longer a purchase that would change nothing. The two `purse-units` top-ups still are,
 * because nothing spends a purse (§ D606 § 2), and selling one now would be the defect
 * `CLAUDE.md`'s standing requirement names. The parameter is unmoved: the day a spend surface
 * exists it passes its claims here rather than teaching this module a second way in.
 */
export function rushSittingOf(input: {
  readonly buildingId: string;
  readonly rounds: readonly RushRoundRecord[];
  readonly modifiers?: readonly ClaimedRushModifier[] | undefined;
}): RushSittingCheck {
  const rounds = input.rounds;
  if (rounds.length === 0) return { ok: false, reasons: Object.freeze([RUSH_SITTING_COPY.noRounds]) };

  const reasons: string[] = [];
  if (rounds.length > MAX_SITTING_ROUNDS) reasons.push(RUSH_SITTING_COPY.tooLong(rounds.length));
  for (const [index, round] of rounds.entries()) {
    for (const reason of round.unpostable) reasons.push(`Round ${String(index + 1)}: ${reason}.`);
  }

  /*
   * The last round is what posts — `packages/server`'s `replayRushSitting` ranks the sitting on it —
   * so it is the one that needs a breaking point. The two arms are told apart because a player can
   * act on one and not the other: a run they stopped is a run they can play out, and a run that
   * held every wave is a tower this dispatcher does not break.
   */
  const last = rounds[rounds.length - 1];
  if (last !== undefined && last.outcome.kind !== 'broke') {
    reasons.push(last.holdS === null ? RUSH_SITTING_COPY.neverBroke : RUSH_SITTING_COPY.handStopped);
  }

  if (reasons.length > 0) return { ok: false, reasons: Object.freeze(reasons) };
  const modifiers = input.modifiers ?? [];
  return {
    ok: true,
    body: Object.freeze({
      buildingId: input.buildingId,
      rounds: Object.freeze(
        rounds.map((round) =>
          Object.freeze({
            dispatcherProfileId: round.dispatcherProfileId,
            ...(round.ruleRows.length === 0 ? {} : { ruleRows: round.ruleRows }),
            /*
             * An empty log carries **no key at all**, which is `verify.ts#rushRoundConfigFor`'s own
             * spread and `core`'s promise that a run with no `interventions` key is byte-identical
             * to one built before the field existed.
             */
            ...(round.wireInterventions === undefined || round.wireInterventions.length === 0
              ? {}
              : { interventions: round.wireInterventions }),
            claimedHeldS: round.holdS,
          }),
        ),
      ),
      ...(modifiers.length === 0 ? {} : { modifiers: Object.freeze([...modifiers]) }),
    }),
  };
}
