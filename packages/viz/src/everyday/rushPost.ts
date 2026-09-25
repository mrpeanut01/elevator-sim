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
  /**
   * Who drove it — **every** dispatcher that drove some part of it, in order.
   *
   * It took one name and read `driven by Conventional collective` over a round that had run on
   * *Predictive balanced* since 0:00, because the name it took was the one the round **opened** on
   * (GitHub issue **#565**, third defect, § D859). A sitting handed over part-way through has no
   * single driver, and a line that names one is not a shorter truth: it credits the run to a
   * dispatcher that did not produce it, which is the one thing `docs/43` P3 says a player must be
   * able to work out from the sheet.
   *
   * One name reads exactly as it always did, which is every round nobody handed over.
   */
  drivenBy: (names: readonly string[]): string =>
    names.length <= 1 ? `driven by ${names[0] ?? ''}` : `driven by ${names.slice(0, -1).join(', ')}, then ${String(names.at(-1))}`,
  heldTo: (held: string, wave: number): string => `held ${held}, into wave ${String(wave)}`,
  stoppedAt: (held: string, wave: number): string => `ended by hand at ${held}, in wave ${String(wave)}`,
  presses: (count: number): string => `${String(count)} ${count === 1 ? 'change' : 'changes'} while it played`,
  noPresses: 'nothing changed while it played',
  /**
   * One press, with its clock and what it was — `4:21 · switched to Predictive balanced`.
   *
   * The shape is the Day report's intervention log line verbatim
   * (`live/interventions.ts#interventionLogOf`), which is the pattern this repository already had
   * for *what a change was and when*; the clock is the only thing that differs, and it differs
   * because a rush is measured in held time and a day in the building's hour.
   */
  change: (clock: string, verb: string): string => `${clock} · ${verb}`,
  /**
   * What a press was followed by, and deliberately not what it caused.
   *
   * A player wants *what did it do*, and the honest answer this sheet can give is what the round
   * went on to do after it: this build has no counterfactual round to subtract. Saying *it cost you
   * two minutes* would need the same crowd played without the press, and § D256 refuses a plausible
   * sentence in place of a measurement. So the line is an observation with its clock attached, and
   * {@link RUSH_POST_COPY.changesNote} says out loud that the comparison was not made.
   *
   * `restOfS` is the time from the press to the end of the round — a subtraction over two moments
   * the round already carries, not a second reading of anything.
   */
  changeHeld: (rest: string, wave: number): string => `drove the remaining ${rest}, to wave ${String(wave)}`,
  /**
   * Under a round that recorded a press — the sentence that keeps the lines above observations.
   *
   * `CLAUDE.md`: *if you write a sentence about why something performs better, either measure it or
   * say it is unmeasured.* Nothing here plays the round again without the press, so nothing here
   * knows what the press was worth, and the sheet says so rather than letting the reader infer a
   * comparison from two figures on adjacent lines.
   */
  changesNote:
    'Each change is shown with the clock it landed on and what the round did after it. What it was ' +
    'worth is not measured — that would take the same waves played again without it, and this ' +
    'sitting has only the round you played.',
  /*
   * **The same note once the sitting holds more than one round** — wave AJ, § D1099. The line above
   * says *this sitting has only the round you played*, and it stayed on round 1 after round 2 was
   * listed under it (the post-AI panel's seat A, defect 7). Three arms, chosen by
   * `roundLinesOf` from {@link RushRoundRecord.startKey}: no other round started where this one
   * did; one did and pressed nothing, so the gap between the two is measured; or one did and was
   * ended by hand, which crossed no line and so holds no figure to set beside this one.
   */
  changesNoteNoTwin:
    'Each change is shown with the clock it landed on and what the round did after it. What it was ' +
    'worth is not measured — that would take the same waves played again from the same start with ' +
    'nothing changed, and no other round of this sitting is that.',
  changesNoteTwinByHand: (label: string): string =>
    `Each change is shown with the clock it landed on and what the round did after it. ${label} met ` +
    'the same waves from the same start with nothing changed, but one of the two was ended by hand, ' +
    'so the two holds are not set side by side.',
  /**
   * The measured arm. Both rounds met this sitting's crowd from one start and the rush is simulated
   * deterministically, so the round with no press **is** this round without its changes, and the
   * difference is exact for this crowd. It is said to be about this crowd and no other, because one
   * crowd is one sample of the building's rushes.
   */
  changesNoteTwin: (label: string, twinHeld: string, twinWave: number, gap: string): string =>
    `Each change is shown with the clock it landed on and what the round did after it. ${label} met ` +
    `the same waves from the same start with nothing changed and held ${twinHeld}, into wave ` +
    `${String(twinWave)}; with the changes this round ${gap}. That is one crowd, and another rush's ` +
    'waves could answer differently.',
  /** The gap in {@link RUSH_POST_COPY.changesNoteTwin}'s own words, signed from this round's side. */
  twinGap: (deltaS: number, clock: string): string =>
    deltaS > 0 ? `held ${clock} longer` : deltaS < 0 ? `held ${clock} less` : 'held exactly as long',
  /*
   * **The unit is named on both figures**, which is § D530's rule about a price said in the
   * currency's own words applied to the money inside a mode: `data/rush-purse.json` declares
   * `unit: 'units'`, and a bare integer beside the word *purse* is a figure a player has to guess
   * the denomination of. Never chimes, which buy a top-up and are not one.
   */
  earned: (waves: number, paid: number, after: number): string =>
    `outlasted ${String(waves)} ${waves === 1 ? 'wave' : 'waves'}, which paid ${String(paid)} ` +
    `${paid === 1 ? 'unit' : 'units'} into a purse of ${String(after)}`,
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
  /**
   * One line per press: its clock, what it was, and what the round did after it — GitHub issue
   * #565, § D859. Empty on a round nobody touched, where {@link RushRoundLineView.presses} has
   * already said so.
   */
  readonly changes: readonly string[];
  /**
   * {@link RUSH_POST_COPY.changesNote}, or one of its three arms for a sitting of more than one round
   * ({@link changesNoteOf}, § D1099), where {@link RushRoundLineView.changes} has entries;
   * `undefined` otherwise — a caption over an empty list is a caption over nothing.
   */
  readonly changesNote: string | undefined;
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
 * One line per press — its clock, what it was, and what the round did after it.
 *
 * GitHub issue **#565**, § D859. `heldS` is where the round *ended* as the player saw it, which is
 * the right end for this subtraction precisely because it is the one the player watched: a press at
 * 26:31 on a round that stopped at 41:02 drove the last 14:31 of what was on screen. The round's
 * own `holdS` is a different quantity and is the server's (see {@link RushRoundRecord.holdS}); using
 * it here would describe a stretch the player did not see.
 *
 * A press stamped after the end draws its clock and no *what followed* clause rather than a
 * negative one — `RunInterventionConfig`'s own deadline case, which `core` warns about and this
 * sheet must not render as `0:-9`.
 */
function changeLinesOf(round: RushRoundRecord): readonly string[] {
  return round.changes.map((change) => {
    const stamped = RUSH_POST_COPY.change(heldClock(change.atS), change.verb);
    const restS = round.outcome.heldS - change.atS;
    if (restS <= 0) return stamped;
    return `${stamped} — ${RUSH_POST_COPY.changeHeld(heldClock(restS), round.outcome.wave)}`;
  });
}

/**
 * The round list, with the server's own figures on it where there are any.
 *
 * `replayed` is the `posted` outcome's rounds, in the same order the sitting was posted in. It is
 * matched **by position and only by position**, which is the server's own contract —
 * `replayRushSitting` answers for every round it verified, in order — and a list that matched on a
 * held time would be inventing an identity the wire does not carry.
 */
/**
 * The note under a round's changes — {@link RUSH_POST_COPY.changesNote} and its three arms for a
 * sitting of more than one round (wave AJ, § D1099). `undefined` on a round with no changes.
 *
 * The comparison round is the first other round that started from the same
 * {@link RushRoundRecord.startKey} and recorded no press. Nothing else qualifies: a round that
 * started elsewhere is a different experiment, and a round with presses of its own is not *nothing
 * changed*.
 */
function changesNoteOf(rounds: readonly RushRoundRecord[], index: number): string | undefined {
  const round = rounds[index];
  if (round === undefined || round.changes.length === 0) return undefined;
  if (rounds.length <= 1) return RUSH_POST_COPY.changesNote;
  const twinIndex =
    round.startKey === undefined
      ? -1
      : rounds.findIndex(
          (other, at) => at !== index && other.interventionCount === 0 && other.startKey === round.startKey,
        );
  const twin = rounds[twinIndex];
  if (twin === undefined) return RUSH_POST_COPY.changesNoteNoTwin;
  const label = RUSH_POST_COPY.roundLabel(twinIndex + 1);
  if (twin.outcome.kind !== 'broke' || round.outcome.kind !== 'broke') {
    return RUSH_POST_COPY.changesNoteTwinByHand(label);
  }
  const deltaS = round.outcome.heldS - twin.outcome.heldS;
  return RUSH_POST_COPY.changesNoteTwin(
    label,
    heldClock(twin.outcome.heldS),
    twin.outcome.wave,
    RUSH_POST_COPY.twinGap(deltaS, heldClock(Math.abs(deltaS))),
  );
}

function roundLinesOf(
  rounds: readonly RushRoundRecord[],
  replayed: readonly RushPostedRound[] | undefined,
): readonly RushRoundLineView[] {
  return rounds.map((round, index) => {
    const answered = replayed?.[index];
    return {
      label: RUSH_POST_COPY.roundLabel(index + 1),
      /*
       * `drivers`, not `dispatcherName` — GitHub issue #565, § D859. The fallback is the opening
       * name rather than the empty string, because a record written before this field existed is
       * a record whose round genuinely had one driver.
       */
      driver: RUSH_POST_COPY.drivenBy(round.drivers.length === 0 ? [round.dispatcherName] : round.drivers),
      held: heldLineOf(round.outcome),
      presses:
        round.interventionCount === 0
          ? RUSH_POST_COPY.noPresses
          : RUSH_POST_COPY.presses(round.interventionCount),
      changes: changeLinesOf(round),
      changesNote: changesNoteOf(rounds, index),
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
