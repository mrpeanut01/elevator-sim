/**
 * **The shell's own surfaces while somebody else's run is on the stage** — § 14.1's differentiation
 * table, applied to the four places the table does not name.
 *
 * A decision number is owed; the argument is here.
 *
 * ## Why this module exists at all, which is the finding rather than the feature
 *
 * `watch/view.ts` models every cell § 14.1 tabulates and `view.test.ts` greps the whole of it for
 * the word the section calls a defect. Both were green while a player watching a shipped reference
 * run read, on one screen (`docs/20` defect 7):
 *
 * - a race-strip lane keyed **`you`**;
 * - a footer reading `paused · 363 arrived, 363 carried · **lobby holder** · seed **20260804**` —
 *   the *spectator's* dispatcher and the *spectator's* seed — directly under the strip's own
 *   `THEIR DISPATCHER Conventional collective`;
 * - a left rail headed **`Your run`** over a note about bending *your* line upward;
 * - and the Day report tab quietly showing the spectator's own last filed sheet, with nothing on it
 *   saying it is not the run being watched.
 *
 * Every one of those is § 14.1's stated defect condition, and every one was **outside the module the
 * test greps**. That is the whole lesson: the rule *the word `you` on a watched run is a defect* was
 * enforced over the panel and the player reads the screen. So the surfaces the shell owns get the
 * same treatment the strip already had — a value, with both arms in it, greppable in Node — and
 * `watch/view.test.ts` walks this corpus beside `view.ts#watchingStrings`'s.
 *
 * ## Why both arms are here rather than in `index.html`
 *
 * Three of these four strings were **static markup**, which is why they never branched: nothing
 * writes them, so nothing could stop writing them. Moving a string into code so it can have two
 * arms is `dev/main.ts#drawRaceStrip`'s own arrangement — *"the footer is `RACE_FOOTER`, § 7.4's
 * permanent sentence, written from code so the string has one author and the honesty sweep drives
 * it"* — and the player's arm is authored here rather than left in the page precisely so the two
 * cannot drift: a spectator arm beside a markup original is two authors for one sentence.
 *
 * ## What is deliberately **not** here, and the limit it leaves
 *
 * The footer's identity clause is composed by `dev/main.ts#drawFooter` from counts that move every
 * frame, so its two arms are two constants here and the composition stays where the counts are —
 * one writer per element, which is the property `drawWatching` exists to keep.
 *
 * And the rule is enforced over **the surfaces that describe the run on screen**, not over every
 * pixel of the page. A spectator can still open the dispatcher editor and read *Write your own
 * rules*; that copy addresses the player about their own next run and is correct where it stands.
 * The line is drawn at *does this surface describe, identify or attribute the day on the stage?* —
 * and it is drawn in writing here rather than left to whoever adds the next surface.
 */

import type { WatchRecord } from './types.js';
import type { WatchingView } from './view.js';

/* -------------------------------------------------------------------------- *
 * The race strip — § 14.1's *"their name … and no verdict — you are not in this comparison"*
 * -------------------------------------------------------------------------- */

/** The lane key over a player's own run. `index.html`'s original word, now with one author. */
export const RACE_KEY_PLAYER = 'you';

/* -------------------------------------------------------------------------- *
 * The left rail's L4 block
 * -------------------------------------------------------------------------- */

/** L4's eyebrow over a player's own run — design `:90`, and the markup's own words. */
export const RAIL_EYEBROW_PLAYER = 'Your run';

/**
 * L4's eyebrow while watching.
 *
 * It does **not** become *the run on screen*, and that is the correction rather than a wording
 * preference: the figures under this eyebrow — best day so far, banked this scenario, the streak,
 * the seven history bars — are the **player's week** and stay the player's week while a stranger's
 * day plays (`dev/leftRail.ts#todayShareFor` already withholds only today's share). Re-labelling
 * them as the watched run would swap one false claim for a worse one. What is wrong with *Your run*
 * here is not that it is inaccurate but that it sits six centimetres from somebody else's day with
 * nothing saying which is which, so the eyebrow says **what these figures are** instead.
 */
export const RAIL_EYEBROW_WATCHING = 'The week on this device';

/** L4's note over a player's own run — `index.html`'s original sentence, now with one author. */
export const RAIL_NOTE_PLAYER =
  'Share of riders away within a minute. No losing — just a line you are trying to bend upward.';

/** L4's note while watching — the same figures, told apart from the day on the stage. */
export const RAIL_NOTE_WATCHING =
  'Share of riders away within a minute, day by day. The day on the stage is a replay of a record ' +
  'filed elsewhere, and it is not one of these.';

/* -------------------------------------------------------------------------- *
 * The Day report tab
 * -------------------------------------------------------------------------- */

/**
 * What the Day report says while a replay is on the stage.
 *
 * The sheet itself is left exactly as it was — § 14.1's *"the sheet the player left open is theirs
 * and is still theirs when they come back"*, which `watch/session.ts` keeps by object identity. The
 * defect was never that the wrong sheet is drawn; it is that a reader who presses **Day report**
 * while watching is shown a sheet with no statement of what it is *of*, next to a stage playing a
 * different run.
 *
 * So the note claims exactly two things and neither is a guess: the stage is a replay, and nothing
 * on this sheet was read from it. It stops short of *this is a different run* — a filed day from
 * this very device is a watchable row, so the two can legitimately be the same day, and asserting
 * otherwise would be this repository's own named defect with the polarity flipped.
 */
export function reportNoteWhileWatching(name: string): string {
  return (
    `The stage is replaying ${name} from its record. This sheet is the last day filed on this ` +
    'device — a watched run files nothing, so no figure here was read from the run on screen.'
  );
}

/* -------------------------------------------------------------------------- *
 * The value
 * -------------------------------------------------------------------------- */

/** Every shell string that has a spectator arm, for one state of the shell. */
export interface ShellWatchingCopy {
  /** The race strip's lane key. */
  readonly raceKey: string;
  /** L4's eyebrow. */
  readonly railEyebrow: string;
  /** L4's note. */
  readonly railNote: string;
  /** The Day report's note, or `''` when there is nothing to say — a player's own sheet. */
  readonly reportNote: string;
  /**
   * The footer's identity clause — *whose dispatcher and whose seed the footer is naming*.
   *
   * `''` on a player's own run, where the footer names the state's own selection and needs no
   * clause. While watching it is the sentence that stops `seed 20260804` reading as the
   * spectator's, which is what the audit found it doing.
   */
  readonly footerNote: string;
}

/** The copy for a player looking at their own run. */
export const PLAYER_SHELL_COPY: ShellWatchingCopy = Object.freeze({
  raceKey: RACE_KEY_PLAYER,
  railEyebrow: RAIL_EYEBROW_PLAYER,
  railNote: RAIL_NOTE_PLAYER,
  reportNote: '',
  footerNote: '',
});

/**
 * The copy for a spectator, from the same {@link WatchingView} the strip is drawn from.
 *
 * `view.name` rather than a second derivation of whose run it is: the strip's pill, its eyebrow and
 * its rail subline all read that field, and a lane key that named the run some other way would be
 * the second answer this directory has a rule about.
 */
export function shellWatchingCopyOf(view: WatchingView): ShellWatchingCopy {
  return Object.freeze({
    raceKey: view.name,
    railEyebrow: RAIL_EYEBROW_WATCHING,
    railNote: RAIL_NOTE_WATCHING,
    reportNote: reportNoteWhileWatching(view.name),
    footerNote: 'the dispatcher and seed above are the record’s, not this device’s',
  });
}

/**
 * The footer's seed line — the one shell string that is composed from a record rather than chosen.
 *
 * While watching it must read the **record's** seed and day. It read `state.seed` and
 * `state.week.day` unconditionally, which is why a spectator's own seed appeared under a heading
 * saying `THEIR DISPATCHER`: `watch/session.ts#watchingStateOf` deliberately leaves everything but
 * `recording` alone, so the state a footer reads while watching is still entirely the player's.
 *
 * `record` is `null` for a row whose record could not be read — a state the shell cannot reach,
 * because a row with no record has no `Watch it` button, and it is handled rather than asserted
 * away for `types.ts#WatchBlocked`'s reason: an absence indistinguishable from an oversight is not a
 * declaration.
 */
export function footerSeedLineOf(record: WatchRecord | null): string {
  if (record === null) return 'the record on screen names no seed';
  return `seed ${record.seed} · day ${String(record.day)} of that record`;
}

/**
 * Every string this module can put on a shell surface — the corpus § 14.1's no-first-person rule is
 * checked over, on the half of the screen `view.ts#watchingStrings` cannot see.
 *
 * A function of the value, for `watchingStrings`' stated reason: `view.test.ts` asserts it
 * covers every string-valued field of {@link ShellWatchingCopy} in both directions, so a surface
 * added to the value without a line here is red rather than unchecked.
 */
export function shellWatchingStrings(copy: ShellWatchingCopy): readonly string[] {
  return [copy.raceKey, copy.railEyebrow, copy.railNote, copy.reportNote, copy.footerNote];
}
