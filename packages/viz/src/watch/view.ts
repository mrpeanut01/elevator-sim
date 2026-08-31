/**
 * **What the shell looks like while somebody else's run is on it — GAMEPLAY § 14.1's table, as a
 * value.**
 *
 * Recorded here rather than in `DECISIONS.md`, under § D405. The pill's verb is § D407's, and this
 * module owns its wording.
 *
 * ## Why this is a view model and not eight strings in `dev/main.ts`
 *
 * § 14.1's rule is that the differentiation is **structural, not a caption**:
 *
 * > A spectator who cannot tell whose day they are looking at will read the figures as their own
 * > and the whole board becomes untrustworthy.
 *
 * A rule of that shape is only kept if something can *check* it, and nothing can check eight
 * strings assembled inside a click handler — `dev/state.ts` makes the same argument about what a
 * run is. So every cell of the table is a field here, the mount is a function of the value, and
 * the two properties § 14.1 states as defect conditions are asserted over the value:
 *
 * 1. **No first-person copy.** {@link watchingStrings} walks every string this module can produce,
 *    and `view.test.ts` requires none to contain `you` or `your` as a word. § 14.1 calls the word
 *    `you` on a watched run *a defect*, and it is greppable, so it is grepped.
 * 2. **No timeline, no close, no post, no score.** {@link WatchingView.actions} is the whole of
 *    what the action bar may offer, and it is a closed list of two.
 *
 * ## The pill's wording, which is the one place this build may not follow the handoff
 *
 * § 14.1's canvas cell reads `REPLAY · <name> · VERIFIED BY THE SERVER`. **There is no server**, and
 * `watch/types.ts` argues the substitution at length: this build re-simulated the record on the
 * player's own machine, which refuses staleness and says nothing about forgery. The pill therefore
 * reads `REPLAY · <name> · VERIFIED BY RE-SIMULATION`, and `docs/12`'s documented-deviation pattern
 * is what this paragraph is. Every other cell of the table is followed as written.
 *
 * ## The identity cells, and the two the shipped data cannot fill
 *
 * § 14.1 asks for an avatar disc with their initial, their name at 19 px, `#2 on today's board`, and
 * `THEIR DISPATCHER` beside it. Three of the four are here. **The rank is not**, and it is omitted
 * rather than stubbed: a rank is a fact about a board, there is no board, and `#—` drawn where a
 * position goes is `docs/10` R3's blank-where-a-number-should-be. What stands in its place is the
 * thing that *is* true of the row — its source line, which for a reference run is § 14.1's own
 * `reference run · not a player`.
 */

import type { PostedResult, WatchableRun } from './types.js';

/* -------------------------------------------------------------------------- *
 * The words
 * -------------------------------------------------------------------------- */

/** The pill's verb. See the module docstring for why it is not *the server*. */
export const REPLAY_PILL_VERB = 'VERIFIED BY RE-SIMULATION';

/**
 * What a reference run says where a rank would go — § 14.1's sentence, verbatim, and § 20.11's
 * rule made a value.
 *
 * § 20.11: *"World figures must never be presented as players when they are reference runs."* This
 * is the sentence that keeps that promise on the one surface where a reader would otherwise assume
 * a person, and it is derived from `WatchableRun.source` rather than typed into the fixture file —
 * a fixture that could omit its own disclaimer is a fixture that will.
 */
export const REFERENCE_RUN_LINE = 'reference run · not a player';

/** What a day this device filed says in the same slot. Not first-person — § 14.1. */
export const FILED_DAY_LINE = 'a day filed on this device · replayed from its record';

/** The action that puts the shell back exactly as it was. § 14.1's `⤺ Stop watching`. */
export const STOP_WATCHING_LABEL = '⤺ Stop watching';

/** § 14.1's primary — *"the whole reason watching exists"*. */
export const PLAY_THIS_CROWD_LABEL = 'Play this crowd yourself';

/**
 * The note under the figures, and it is the caveat rather than a caption.
 *
 * Every claim carries its basis (§ 16 rule 2). The figures beside it are **the record's**, not a
 * live reading of the replay, and a reader who is watching a run play could reasonably think
 * otherwise — so the note says which.
 */
export const POSTED_FIGURES_NOTE =
  'the figures above are what this record was filed with, and this replay reproduced them';

/* -------------------------------------------------------------------------- *
 * The view
 * -------------------------------------------------------------------------- */

/** One of the two things the action bar may offer while watching. A closed list — § 14.1. */
export interface WatchAction {
  readonly id: 'stop-watching' | 'play-this-crowd';
  readonly label: string;
  /** `true` for § 14.1's primary; the shell draws it as such. */
  readonly primary: boolean;
}

/** One figure of the posted result, as the header prints it. */
export interface PostedFigure {
  readonly id: string;
  readonly value: string;
  readonly label: string;
}

/** Every cell of § 14.1's differentiation table, for one watched run. */
export interface WatchingView {
  /**
   * `'ink'`, always — the table's *"the single strongest signal"*.
   *
   * A field rather than a constant because the shell reads it, and a shell reading a field cannot
   * quietly stop applying the treatment: `main.test.ts` asserts the header carries the inverted
   * class exactly while this view exists. A boolean would say the same thing and would not name
   * the thing being said.
   */
  readonly headerTone: 'ink';
  /** The disc's letter — the label's first character, upper-cased. */
  readonly initial: string;
  /** Whose day this is, in the words the row carried. */
  readonly name: string;
  /** § 14.1's `THEIR DISPATCHER` cell, and the dispatcher named beside it. */
  readonly dispatcherEyebrow: string;
  readonly dispatcherName: string;
  /** The source line, where § 14.1 puts a board rank. See the module docstring. */
  readonly sourceLine: string;
  /** The building and the day, one line. */
  readonly subtitle: string;
  /** § 14.1's *"their posted result"* — read against what the replay achieved. */
  readonly figures: readonly PostedFigure[];
  readonly figuresNote: string;
  /** The canvas pill, top left. */
  readonly pill: string;
  /** § 14.1's `<NAME> VS THE WORLD'S MIDDLE`, with the half this build has. */
  readonly eyebrow: string;
  /** § 14.1's rail subline, `WATCHING · <NAME>`. */
  readonly railSubline: string;
  /** The action bar. Two entries, and never a timeline, a close, a post or a score. */
  readonly actions: readonly WatchAction[];
}

/**
 * The view for a run being watched.
 *
 * `dispatcherName` is passed in rather than resolved here because a display name is
 * `data/dispatcher-profiles.json`'s and this module loads nothing — the same split every pure
 * module in `live/` keeps.
 */
export function watchingViewOf(
  run: WatchableRun,
  dispatcherName: string,
): WatchingView {
  const name = run.label;
  return {
    headerTone: 'ink',
    initial: (name.trim()[0] ?? '·').toUpperCase(),
    name,
    dispatcherEyebrow: 'THEIR DISPATCHER',
    dispatcherName,
    sourceLine: run.source === 'reference' ? REFERENCE_RUN_LINE : FILED_DAY_LINE,
    subtitle: `${run.buildingName} · ${run.subtitle}`,
    figures: postedFiguresOf(run.posted),
    figuresNote: POSTED_FIGURES_NOTE,
    pill: `REPLAY · ${name} · ${REPLAY_PILL_VERB}`,
    /*
     * § 14.1's eyebrow is `<NAME> VS THE WORLD'S MIDDLE`. **The rival half is dropped, not
     * stubbed** — slice 4d's race strip already refused the world arm for want of posting
     * infrastructure (*"the handoff's world/previous-day arms are omitted, not stubbed"*), and an
     * eyebrow naming a comparison that is not drawn would be a caption for an absent thing.
     * What is left is the true half: whose run is on the scale.
     */
    eyebrow: `${name.toUpperCase()} · REPLAY`,
    railSubline: `WATCHING · ${name.toUpperCase()}`,
    actions: [
      { id: 'stop-watching', label: STOP_WATCHING_LABEL, primary: false },
      { id: 'play-this-crowd', label: PLAY_THIS_CROWD_LABEL, primary: true },
    ],
  };
}

/**
 * § 14.1's two header figures, plus the two that make them readable.
 *
 * The table names `86% they posted, away in a minute` and `94 s their longest wait`. The arrival
 * and carry counts are here beside them because a percentage without its denominator is R13's own
 * defect — the same rule that put a count beside every paired mean on the Day report — and because
 * these four are exactly the four the reproduction gate compares, so the header and the gate cannot
 * come to describe different runs.
 */
export function postedFiguresOf(posted: PostedResult): readonly PostedFigure[] {
  return [
    {
      id: 'minutePct',
      value: `${String(posted.minutePct)}%`,
      label: `posted, away in a minute — of ${String(posted.carried)} carried`,
    },
    {
      id: 'worstWaitS',
      value: `${String(posted.worstWaitS)} s`,
      label: 'the longest wait on that record',
    },
    {
      id: 'arrived',
      value: String(posted.arrived),
      label: 'people turned up',
    },
  ];
}

/**
 * Every string this module can put on a watching surface — the corpus § 14.1's no-first-person rule
 * is checked over.
 *
 * A **function of the view** rather than a list maintained beside it, so a field added to
 * {@link WatchingView} without a line here is caught: `view.test.ts` asserts this covers every
 * string-valued field of the view, both ways, which is `surface.ts#SCOPE_OF`'s arrangement at this
 * scale. A hand-kept list of what to check is a list that stops being read.
 */
export function watchingStrings(view: WatchingView): readonly string[] {
  return [
    view.initial,
    view.name,
    view.dispatcherEyebrow,
    view.dispatcherName,
    view.sourceLine,
    view.subtitle,
    ...view.figures.flatMap((figure) => [figure.value, figure.label]),
    view.figuresNote,
    view.pill,
    view.eyebrow,
    view.railSubline,
    ...view.actions.map((action) => action.label),
  ];
}

/**
 * The words § 14.1 forbids on a watching surface, and the matcher for them.
 *
 * A word-boundary match rather than `includes`, because *your* is forbidden and *yourself* is
 * § 14.1's own primary button — `Play this crowd yourself`. The two differ by one boundary, and a
 * substring test would fail the handoff's own copy. That is not a loophole: *yourself* in that
 * label addresses the spectator about **leaving**, which is exactly the conversion the rule exists
 * to permit, where *your* would address them about the run they are watching.
 */
export const FIRST_PERSON_WORDS: readonly string[] = Object.freeze(['you', 'your', 'yours', 'yourown']);

/** Every forbidden word in `text`, or `[]`. Exported so a test names what it found. */
export function firstPersonWordsIn(text: string): readonly string[] {
  const found = new Set<string>();
  for (const word of text.toLowerCase().match(/[a-z']+/g) ?? []) {
    if (FIRST_PERSON_WORDS.includes(word)) found.add(word);
  }
  return [...found];
}
