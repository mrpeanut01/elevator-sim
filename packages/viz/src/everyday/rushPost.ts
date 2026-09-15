/**
 * **The rush's round list and its post block, as words** — GitHub issue **#372**'s fourth criterion,
 * decided here and drawn by `everyday/reportScreen.ts`.
 *
 * `everyday/postRun.ts` is the same block one screen over and this follows it deliberately: the
 * screen owns the DOM, this owns every sentence and every enabled/disabled decision, and a pure
 * function is what lets the honesty corpus drive every state without a document. Two things are
 * different, and both are the rush being a *sitting* rather than a run.
 *
 * ## The round list is the first half, and it is not decoration
 *
 * A sitting is *consecutive runs from an as-shipped start* (the owner's ruling of 2026-09-10), so
 * what a player posts is **not** the run they are looking at — it is every round since they entered
 * the rush, the one on screen last. A block that offered *Post this run* over a four-round sitting
 * would be describing the wrong thing, so the rounds are listed with what each was driven by, how
 * far it got and how many presses it recorded. That list is also the only place a player can see
 * that a round two rounds back is what is holding the post up, which is why a round's own refusal
 * is drawn on its own line rather than pooled into the reasons below.
 *
 * ## The purse is the server's answer and is drawn nowhere else
 *
 * `packages/server`'s `rushSitting.ts` refuses a client-named purse **by name**, and this module is
 * the other side of that rule: there is no arithmetic here, and the only state in which a purse
 * appears at all is {@link RushPostOutcomeView} `posted`, where the figures are the server's own
 * reply to this player's own post. [§ D543](../../../../DECISIONS.md) clause 5 permits exactly that
 * and no more — *a board row shows no purse, and only the poster's own answer carries one* — so
 * nothing here reaches a board row, and `everyday/boardScreen.ts` draws no purse.
 *
 * **And the purse buys nothing yet, which is said where the figure is.** A player who reads *purse
 * 18 units* and goes looking for the shop would be meeting the eleven-times defect
 * (`CLAUDE.md`'s standing requirement) from the other side: not a control that writes nothing, but
 * a figure that promises one. {@link RUSH_POST_COPY.purseNote} is that sentence, and
 * `rushScreenModel.ts#RUSH_ABSENCES` carries the same absence in the register's own shape.
 *
 * Recorded under [§ D405](../../../../DECISIONS.md) — it decides the wording of one block — beside
 * [§ D606](../../../../DECISIONS.md), which is what this lane decided about the half it did not
 * build.
 */

// The type and the two sentences the host owns, on `postRun.ts`'s own import rule: `host.ts`
// imports nothing from here, so the graph stays one-way and this directory's module-init
// `undefined` has no cycle to come back through.
import { POST_RUN_NO_SERVER, type EverydayRushPostOutcome } from './host.js';
// The signed-out sentence, borrowed rather than restated — `postRun.ts`'s arm, same owner.
import { SIGNED_OUT, postingRefusal } from '../menu/account.js';

import type { PostRunLine } from './postRun.js';
import { heldClock, type RushOutcome } from './rush.js';
import type { RushPostedRound, RushRoundRecord, RushSittingCheck } from './rushSitting.js';

/**
 * The block's own chrome and every sentence it authors, frozen so the sweep renders all of them.
 *
 * What is **not** here is every refusal: a round's is owned by whichever module decided it
 * (`everyday/rushSitting.ts` says which), the server's is carried verbatim, and the two states that
 * are properties of the page rather than of the sitting borrow `postRun.ts`'s own strings — so a
 * player meets one wording for *there is no server* and one for *nobody is signed in* wherever they
 * meet it.
 */
export const RUSH_POST_COPY = Object.freeze({
  eyebrow: 'PUT THE SITTING ON THE BOARD',
  roundsHeading: 'THIS SITTING',
  button: 'Post this sitting',
  posting: 'Posting this sitting…',
  /*
   * The standing note. Four claims, each there because a player who did not know it would read the
   * press as something else: what is sent (every round, not the one on screen), what is not sent
   * (the waves, which are everybody's), who checks it (the server, by replaying each round), and
   * what it is ranked on.
   */
  note:
    'Posting sends every round of this sitting — what you drove each one with and every change you ' +
    'made while it played. The waves are not sent: they are the same climb from one seed for ' +
    'everybody, and the server replays each round from its own copy of the reference data. The ' +
    'sitting is ranked on how long its last round held.',
  posted: 'Posted. The server replayed every round of this sitting and they reproduced.',
  /**
   * Where it went, without naming a board. `everyday/postRun.ts#placementLineOf` turns a placement
   * token into prose because the day's server answers one; the rush route answers a `boardKey` and
   * no token, and a key is `rush:<building>:<date>` — a string for a switch rather than for a
   * player. So this says the **consequence**, which is what the player came to find out, and
   * nothing here parses a key or decides which board a sitting belongs on.
   */
  placement:
    'It is ranked against everyone else who played this tower today with the same modifiers. The ' +
    'board resets tomorrow.',
  refusedNote:
    'This is checked here rather than on the server, so nothing was sent. The sitting is still on ' +
    'screen and you can keep playing rounds into it.',
  /** Under the round list once a post has come back — see the module docstring. */
  purseNote:
    'The purse figures are the server’s own, derived from its replay of each round rather than ' +
    'counted here. Nothing spends a purse in this build yet, so what a round earned is a record ' +
    'of how far it got and not a budget you can take into the next one.',
  /* The round list's own small words. Each is a label rather than a sentence. */
  roundLabel: (round: number): string => `Round ${String(round)}`,
  drivenBy: (name: string): string => `driven by ${name}`,
  heldTo: (held: string, wave: number): string => `held ${held}, into wave ${String(wave)}`,
  stoppedAt: (held: string, wave: number): string => `ended by hand at ${held}, in wave ${String(wave)}`,
  presses: (count: number): string => `${String(count)} ${count === 1 ? 'change' : 'changes'} while it played`,
  noPresses: 'nothing changed while it played',
  earned: (waves: number, paid: number, after: number): string =>
    `outlasted ${String(waves)} ${waves === 1 ? 'wave' : 'waves'}, which paid ${String(paid)} into a purse of ${String(after)}`,
  /** The list before a rush has been played at all. Never empty: a list with no words lies. */
  noRounds: 'No round of this sitting has finished yet.',
} as const);

/* -------------------------------------------------------------------------- *
 * The outcome, as a view needs it
 * -------------------------------------------------------------------------- */

/** The shape {@link rushPostViewOf} reads an answer through. See `everyday/host.ts`. */
export type RushPostOutcomeView = EverydayRushPostOutcome;

/* -------------------------------------------------------------------------- *
 * The view
 * -------------------------------------------------------------------------- */

/** One line of the round list. Every field is pre-formatted, so the renderer decides nothing. */
export interface RushRoundLineView {
  readonly label: string;
  readonly driver: string;
  /** How far it got, in the player's own clock. */
  readonly held: string;
  /** What was pressed during it — never absent, because *nothing* is a fact about the round. */
  readonly presses: string;
  /** What the server said this round earned, once it has answered. `undefined` before a post. */
  readonly earned: string | undefined;
  /** Why this round cannot travel, if it cannot — drawn on its own line. */
  readonly refusal: string | undefined;
}

/** What the rush's post block says and offers. */
export interface RushPostView {
  readonly eyebrow: string;
  readonly roundsHeading: string;
  /** The rounds of this sitting, in order. Empty only before the first one finishes. */
  readonly rounds: readonly RushRoundLineView[];
  /** {@link RUSH_POST_COPY.noRounds} when there are none, `undefined` otherwise. */
  readonly roundsEmpty: string | undefined;
  /** {@link RUSH_POST_COPY.purseNote}, once a post has come back with purses. */
  readonly purseNote: string | undefined;
  readonly label: string;
  readonly pressable: boolean;
  /** Prose under the button. Never empty — a state with nothing to say is a state that lies. */
  readonly lines: readonly PostRunLine[];
}

const line = (text: string, className: string, role: 'reason' | 'note' = 'note'): PostRunLine => ({
  text,
  className,
  role,
});

/** How far a round got, in the player's clock — the hand stop and the line told apart. */
function heldLineOf(outcome: RushOutcome): string {
  return outcome.kind === 'broke'
    ? RUSH_POST_COPY.heldTo(heldClock(outcome.heldS), outcome.wave)
    : RUSH_POST_COPY.stoppedAt(heldClock(outcome.heldS), outcome.wave);
}

/**
 * The round list, with the server's own figures on it where there are any.
 *
 * `replayed` is the `posted` outcome's rounds, in the same order the sitting was posted in. It is
 * matched **by position and only by position**, which is the server's own contract —
 * `replayRushSitting` answers for every round it verified, in order — and a list that matched on a
 * held time would be inventing an identity the wire does not carry.
 */
function roundLinesOf(
  rounds: readonly RushRoundRecord[],
  replayed: readonly RushPostedRound[] | undefined,
): readonly RushRoundLineView[] {
  return rounds.map((round, index) => {
    const answered = replayed?.[index];
    return {
      label: RUSH_POST_COPY.roundLabel(index + 1),
      driver: RUSH_POST_COPY.drivenBy(round.dispatcherName),
      held: heldLineOf(round.outcome),
      presses:
        round.interventionCount === 0
          ? RUSH_POST_COPY.noPresses
          : RUSH_POST_COPY.presses(round.interventionCount),
      earned:
        answered === undefined
          ? undefined
          : RUSH_POST_COPY.earned(answered.wavesOutlasted, answered.paidUnits, answered.purseAfterUnits),
      /*
       * The first of a round's refusals rather than all of them, and this is the one place in this
       * lane that shows one of a set. The whole set is below the button, in `check.reasons`, where
       * `runIdentityIssues`' rule about never showing one of several is kept; a list line is a
       * label's worth of space and a line carrying four sentences would push the rounds off the
       * screen the player is reading them on.
       */
      refusal: round.unpostable[0],
    };
  });
}

/**
 * What the rush result screen draws, from the sitting it holds and the last press's answer.
 *
 * `outcome` is `undefined` before any press. `posting` outranks it, because a second press while
 * one is in flight is the double-submit this product has no idempotency key for — and a rush
 * sitting is up to twelve replays, so it is the one post on this product where a double press costs
 * the server something a player would notice.
 */
export function rushPostViewOf(input: {
  /** Every round of the sitting so far, in order. */
  readonly rounds: readonly RushRoundRecord[];
  /** Whether the sitting may travel — `everyday/rushSitting.ts#rushSittingOf`'s answer. */
  readonly check: RushSittingCheck;
  /** Whether this build was served with an API origin — the host's binding, not a guess. */
  readonly hasServer: boolean;
  /** Whether anybody is signed in. `menu/account.ts`'s token, read through the account port. */
  readonly signedIn: boolean;
  /** True between the press and the answer. */
  readonly posting: boolean;
  /** The last press's answer, or `undefined` before the first. */
  readonly outcome: RushPostOutcomeView | undefined;
}): RushPostView {
  const outcome = input.outcome;
  const replayed = outcome?.kind === 'posted' ? outcome.rounds : undefined;
  const base = {
    eyebrow: RUSH_POST_COPY.eyebrow,
    roundsHeading: RUSH_POST_COPY.roundsHeading,
    rounds: roundLinesOf(input.rounds, replayed),
    roundsEmpty: input.rounds.length === 0 ? RUSH_POST_COPY.noRounds : undefined,
    purseNote: replayed === undefined ? undefined : RUSH_POST_COPY.purseNote,
  };

  if (input.posting) {
    return { ...base, label: RUSH_POST_COPY.posting, pressable: false, lines: [line(RUSH_POST_COPY.note, 'everyday-post-note')] };
  }

  /*
   * The three answers known before a press, in the order a player can act on them — `postRun.ts`'s
   * ladder with the sitting in the middle: a property of the build, then of the sitting, then of
   * the player. One sentence for all three would tell a signed-in player holding a hand-stopped
   * sitting to sign in.
   */
  if (!input.hasServer) {
    return {
      ...base,
      label: RUSH_POST_COPY.button,
      pressable: false,
      lines: [line(POST_RUN_NO_SERVER, 'everyday-post-absent', 'reason')],
    };
  }
  if (!input.check.ok) {
    return {
      ...base,
      label: RUSH_POST_COPY.button,
      pressable: false,
      lines: input.check.reasons.map((reason) => line(reason, 'everyday-post-no-run', 'reason')),
    };
  }

  if (outcome === undefined) {
    return {
      ...base,
      label: RUSH_POST_COPY.button,
      pressable: true,
      /*
       * Signed out is a live control with the sentence already under it — `postRun.ts`'s arm and its
       * argument: the press produces `signed-out`, whose detail is this same string, and a greyed
       * button would swallow the one instruction the player needs.
       */
      lines: input.signedIn
        ? [line(RUSH_POST_COPY.note, 'everyday-post-note')]
        : [
            line(postingRefusal(SIGNED_OUT) ?? '', 'everyday-post-signed-out', 'reason'),
            line(RUSH_POST_COPY.note, 'everyday-post-note'),
          ],
    };
  }

  switch (outcome.kind) {
    case 'posted':
      return {
        ...base,
        label: RUSH_POST_COPY.button,
        /*
         * Still pressable, on `postRun.ts`'s ground: whether the same sitting may be posted twice is
         * the server's question — it lists a player once, at their best (§ D215 § 2) — and a button
         * that disabled itself would be this client deciding an answer it does not hold.
         */
        pressable: true,
        lines: [
          line(RUSH_POST_COPY.posted, 'everyday-post-posted'),
          line(RUSH_POST_COPY.placement, 'everyday-post-placement'),
        ],
      };
    case 'no-server':
      return { ...base, label: RUSH_POST_COPY.button, pressable: false, lines: [line(outcome.detail, 'everyday-post-absent', 'reason')] };
    case 'signed-out':
      return { ...base, label: RUSH_POST_COPY.button, pressable: true, lines: [line(outcome.detail, 'everyday-post-signed-out', 'reason')] };
    case 'refused':
      return {
        ...base,
        label: RUSH_POST_COPY.button,
        pressable: true,
        lines: [line(outcome.detail, 'everyday-post-refused', 'reason'), line(RUSH_POST_COPY.refusedNote, 'everyday-post-note')],
      };
    case 'failed':
      return { ...base, label: RUSH_POST_COPY.button, pressable: true, lines: [line(outcome.detail, 'everyday-post-failed', 'reason')] };
  }
}
