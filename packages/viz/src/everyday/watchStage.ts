/**
 * **The Everyday side of § 14.1** — what the § 7 stage says while somebody else's record is on it,
 * and what the picker that gets it there says.
 *
 * GAMEPLAY § 14.1 and § 20.15, ENGINE_CONTRACT § 1.5. Pure, so every word is drivable in the node
 * tier; `everyday/stageScreen.ts` and `everyday/weekScreen.ts` draw it. Recorded here rather than in
 * `DECISIONS.md` under [§ D405](../../../../DECISIONS.md), except the two rulings that reach past
 * this module — [§ D435](../../../../DECISIONS.md) (the § 3.3 note's deviation, which lives in
 * `actionBar.ts`) and [§ D436](../../../../DECISIONS.md) (the route itself).
 *
 * ## Why this file exists rather than more branches inside the stage
 *
 * `watch/view.ts` already models every cell § 14.1 tabulates, and this module does **not** restate
 * one of them: the ink header, the initial, their name, `THEIR DISPATCHER`, the source line, the
 * posted figures, the pill and the two actions are all read off `watch/view.ts`'s `WatchingView`,
 * which `everyday/stageScreen.ts` draws directly rather than re-deriving. What is left
 * over is the handful of decisions the *Everyday* shell has to make and the Engineer shell does not
 * — the § 3.3 row for a watched stage, the one refusal § 20.15 forces, and the picker's own
 * chrome — and those are here rather than in `stageScreen.ts` for that file's own stated reason: a
 * decision made inside a mount cannot be tested, because the mount needs a document.
 *
 * ## The corpus, and the half of it that is deliberately not a list
 *
 * § 14.1's stated defect condition is greppable, so it is grepped: {@link everydayWatchingStrings}
 * walks {@link EverydayWatchingCopy} and `watchStage.test.ts` requires none of it to contain `you`,
 * `your` or `yours` as a word, using `watch/view.ts#firstPersonWordsIn` rather than a second
 * matcher — one boundary rule, or `Play this crowd yourself` fails its own rule.
 *
 * **What that corpus cannot see is the rest of the stage**, and naming it is the point. The clock,
 * the phase pill, the three live figure labels, the legend, the race captions and the status line
 * are `stageScreenModel.ts`', shared with every other run context, and a list of them here would be
 * a second list that goes stale the day somebody adds a fourth figure. So the total check is not
 * here at all: `everyday/watchStage.browser.test.ts` sweeps the rendered text of the shell's own
 * **screen region** and its **action bar** — `.everyday-screen` and `.everyday-bar`, the two boxes
 * § 3.1 gives the shell sole ownership of — so a string drawn anywhere on the watching screen is
 * inside the sweep by construction rather than by anybody remembering to add a selector. That is
 * strictly wider than the Engineer tier's five-selector list (`dev/watch.browser.test.ts`), which is
 * what it has to be: `docs/20` defect 7 is the record of a corpus that was a module while the player
 * read a screen.
 */

import type { ActionBarModel } from './actionBar.js';
import { actionBarFor } from './actionBar.js';
import type { EverydayState } from './types.js';
import type { WatchRecord } from '../watch/types.js';

/* -------------------------------------------------------------------------- *
 * The picker — § 14.1's rows, on the one screen this build can put them
 * -------------------------------------------------------------------------- */

/** The eyebrow over the rows a spectator may open, on § 14's *Your week*. */
export const WATCH_ROWS_HEADING = 'RUNS THAT CAN BE WATCHED';

/**
 * What the block says it is, above the rows — § 16 rule 2's basis line.
 *
 * It states the substitution `watch/types.ts` argues at length, because the pill downstream says
 * *verified by re-simulation* and a reader meeting that on a stage has nowhere to ask what it means.
 * It also says which two sources there are, so the absence of a third — another player's posted run
 * — is a stated absence rather than a reader's guess.
 */
export const WATCH_ROWS_LEDE =
  'A run is a record — a seed, a configuration and the changes made during the day. Pressing ' +
  'Watch it re-simulates that record on this machine and replays what comes back, and a record ' +
  'that no longer reproduces the figures it was filed with is not replayed at all. The rows are ' +
  'the days closed on this device and the reference runs this repository shipped; runs posted by ' +
  'other people would need a server, and there is none.';

/** The affordance, and § 1.5's rule is that a row that cannot be replayed loses it rather than dimming it. */
export const WATCH_IT_LABEL = 'Watch it';

/** What the block says when it holds no row at all. Not first-person — § 14.1. */
export const NOTHING_TO_WATCH =
  'No day has been closed on this device yet, and the reference runs have not loaded.';

/** What the block says while the shipped reference runs are still being fetched. */
export const WATCH_ROWS_LOADING = 'Reading the reference runs…';

/* -------------------------------------------------------------------------- *
 * § 20.15's one refusal
 * -------------------------------------------------------------------------- */

/**
 * Why `Play this crowd yourself` is inert on a row that is not the day standing here — § 20.15.
 *
 * ## The instruction this build cannot carry out
 *
 * § 20.15: *"`Play this crowd yourself` must open the brief for **that day's** fixture, not
 * today's, when the row belongs to an archived day."* A record carries `day` and `dayIdx`, and both
 * are load-bearing: `shift/growth.ts` grows the tower 11 % per day of the week, and
 * `shift/events.ts#eventFor(day, dayIdx)` derives the day's event from the pair. The conversion
 * this build has — `dev/main.ts#playThisCrowd` — deliberately carries **neither**, and says so:
 * *"the day number belongs to the watched week and would grow the spectator's building by somebody
 * else's schedule."*
 *
 * So on a row whose record names a different day, pressing the primary would set up a crowd that is
 * **not** the one on the stage. § D392's rule is that an instruction a control cannot carry out is
 * withdrawn rather than reworded, and § D227's is that a control which writes nothing must say so.
 * The control is therefore inert with this sentence, and the sentence names the mechanism rather
 * than apologising — a refusal that only says no sends a reader hunting a defect.
 *
 * ## Why the day, and not just the building
 *
 * Matching the building and the seed is not enough and it is worth being exact about why: two runs
 * of one seed on one building on **different week days** meet different crowds, because the
 * population the arrivals are drawn against has grown. That is the whole of § 6.1's replay
 * (GitHub issue #177), which this build has not got.
 */
export function playThisCrowdRefusalFor(
  /**
   * The record's day pair, or `null` for a row that carries no record.
   *
   * The **pair** rather than a whole {@link WatchRecord}, and the narrowing is deliberate: these are
   * the only two fields the decision reads, a `WatchRecord` satisfies the shape structurally so no
   * caller has to unpack one, and a parameter that asked for the whole record would make every
   * driver of this rule construct fourteen fields it does not use — which is how a test comes to be
   * written against a cast instead of against a value.
   */
  record: { readonly day: number; readonly dayIdx: number } | null,
  standing: { readonly day: number; readonly dayIdx: number },
): string | undefined {
  if (record === null) {
    return 'this row carries no record, so there is no crowd to set up';
  }
  if (record.day === standing.day && record.dayIdx === standing.dayIdx) return undefined;
  return (
    `this record is day ${String(record.day)} of the week it was played in, and the day standing ` +
    `here is day ${String(standing.day)}. A tower grows through a week, so setting the same ` +
    'building and seed up now would produce a different crowd — and replaying an archived day as ' +
    'the day it was is not built. The replay above is unaffected: it runs the record exactly.'
  );
}

/* -------------------------------------------------------------------------- *
 * The § 3.3 row for a watched stage
 * -------------------------------------------------------------------------- */

/** What {@link watchStageBarOf} needs beyond the shell's state. */
export interface WatchStageBarInput {
  /** The replay on the stage, or `undefined` before the recording has been adopted. */
  readonly hasReplay: boolean;
  /** {@link playThisCrowdRefusalFor}'s answer for the row being watched. */
  readonly playRefusal: string | undefined;
}

/** What the primary says instead of acting while the replay has not arrived. */
export const REPLAY_NOT_ON_STAGE =
  'the replay has not reached the stage yet — nothing is being watched to convert';

/**
 * Why § 7.6's intervention rows refuse while a record is on the stage.
 *
 * § 14.1: *"§ 7.6's intervention machinery is **disabled** while watching. A spectator who could
 * intervene would be playing, not watching."* The sentence says what is happening rather than only
 * *no*, because the record's **own** interventions are being replayed a few centimetres away
 * (contract § 1.5 — *replayed, not offered*) and a bare refusal beside a moving intervention stamp
 * would read as a contradiction.
 *
 * Here rather than as a fourth arm of `stageScreenModel.ts#stageInterventionsOf`, because that
 * function is asked the same question in every run context and *whose run is this* is not one of
 * its inputs.
 */
export const SPECTATOR_MAKES_NO_CHANGES =
  'this is a replay of a record — its own changes are being replayed, and a spectator makes none';

/**
 * § 3.3's `stage · watching` row, refined for what this build can actually do.
 *
 * It starts from {@link actionBarFor} rather than composing a row, on `screens.ts`' rule that a bar
 * built from scratch in a `bar()` is the per-screen footer § 3.1 forbids. The left button, the
 * absent timeline and the note are the table's; the one refinement is the primary, which § 20.15
 * withdraws on an archived row and which cannot act before the replay lands.
 *
 * The refusal replaces the note as well as disabling the button, which is `stageBarModelOf`'s own
 * arrangement and `shell.ts#drawBar`'s requirement: an inert primary's reason is drawn in the pinned
 * bar and bound to the control by `aria-describedby`, so a reason that stayed in a tooltip would be
 * a dead button with the explanation off screen (GitHub issue #262).
 */
export function watchStageBarOf(
  state: EverydayState,
  input: WatchStageBarInput,
): ActionBarModel {
  const base = actionBarFor(state);
  const refusal = !input.hasReplay ? REPLAY_NOT_ON_STAGE : input.playRefusal;
  if (refusal === undefined) return base;
  return { ...base, primary: { ...base.primary, inert: refusal }, note: refusal };
}

/* -------------------------------------------------------------------------- *
 * The corpus § 14.1's rule is checked over
 * -------------------------------------------------------------------------- */

/**
 * Every string this module can put on a watching surface, as one value.
 *
 * A value rather than a list of exports, for `watch/shell.ts#ShellWatchingCopy`'s reason:
 * `watchStage.test.ts` asserts {@link everydayWatchingStrings} covers every string-valued field of
 * it in both directions, so a sentence added here without a line in the walker is red on the commit
 * that adds it rather than unchecked.
 *
 * The two refusals {@link playThisCrowdRefusalFor} composes are **not** fields of it, and that is
 * deliberate: they are a function of a row rather than of a state, so `watchStage.test.ts` drives
 * that function over both of its branches directly — `watch/view.test.ts` treats
 * `reproductionRefusalFor` the same way and for the same reason. A copy value carrying a
 * manufactured example of one would be checking a sentence nobody can reach.
 */
export interface EverydayWatchingCopy {
  readonly rowsHeading: string;
  readonly rowsLede: string;
  readonly watchLabel: string;
  readonly nothingToWatch: string;
  readonly rowsLoading: string;
  /** The § 3.3 row's left button while watching. */
  readonly leaveLabel: string;
  /** The § 3.3 row's primary — § 14.1's conversion. */
  readonly primaryLabel: string;
  /** The § 3.3 row's note. */
  readonly barNote: string;
  /** The primary's refusal, or `''` where it is live. */
  readonly primaryRefusal: string;
  /** Why § 7.6's rows refuse — see {@link SPECTATOR_MAKES_NO_CHANGES}. */
  readonly interventionRefusal: string;
}

/**
 * The copy for one watching state.
 *
 * `state` and `input` are the same two values `watchStageBarOf` resolves the row from, so the corpus
 * cannot describe a bar the shell does not draw.
 */
export function everydayWatchingCopyOf(
  state: EverydayState,
  input: WatchStageBarInput,
): EverydayWatchingCopy {
  const bar = watchStageBarOf(state, input);
  return {
    rowsHeading: WATCH_ROWS_HEADING,
    rowsLede: WATCH_ROWS_LEDE,
    watchLabel: WATCH_IT_LABEL,
    nothingToWatch: NOTHING_TO_WATCH,
    rowsLoading: WATCH_ROWS_LOADING,
    leaveLabel: bar.leave.label,
    primaryLabel: bar.primary.label,
    barNote: bar.note ?? '',
    primaryRefusal: bar.primary.inert ?? '',
    interventionRefusal: SPECTATOR_MAKES_NO_CHANGES,
  };
}

/** Every string {@link EverydayWatchingCopy} carries — the corpus, as a function of the value. */
export function everydayWatchingStrings(copy: EverydayWatchingCopy): readonly string[] {
  return [
    copy.rowsHeading,
    copy.rowsLede,
    copy.watchLabel,
    copy.nothingToWatch,
    copy.rowsLoading,
    copy.leaveLabel,
    copy.primaryLabel,
    copy.barNote,
    copy.primaryRefusal,
    copy.interventionRefusal,
  ];
}

