/**
 * **The pinned action bar, as data** — GAMEPLAY § 3.3's complete table, and § 3.4's confirm strip.
 *
 * ## One table, not per-screen literals
 *
 * The guide says *"Complete bar table — build from this, not from memory"*, and the way this
 * module obeys that is by **being** the table: {@link ACTION_BAR_ROWS} transcribes § 3.3 row for
 * row, `actionBar.test.ts` holds a second transcription of the same table, and the two are
 * compared cell by cell so a drift in either direction fails. The shell consumes the resolved
 * {@link ActionBarModel} and draws it; no screen authors its own bar (§ 3.1 — *"no screen may
 * declare its own footer"*), and a registered screen that needs a state-dependent cell refines
 * the resolved row through its module's `bar()` rather than replacing the shape.
 *
 * ## The placeholder convention: `⟨…⟩`
 *
 * Some of § 3.3's cells are not copy but a description of copy the screen's own state supplies —
 * *the picked option's effect*, `Open <building>`, `Lock it in and run day N`. Those are carried
 * verbatim inside `⟨…⟩` markers so that the table stays faithful to the guide while no reader can
 * mistake a description for a sentence. The frame never draws a `⟨…⟩` cell: today every screen
 * with one is unbuilt (its bar shows the refusal instead), and the lane that builds such a screen
 * substitutes real copy through `bar()`. `actionBar.test.ts` asserts the markers are confined to
 * the cells the guide leaves state-dependent.
 *
 * ## What is deliberately not in the table
 *
 * The guide's § 3.3 table has no row for a **watched report** — § 3.4 says a spectator's exit is
 * `⤺ Stop watching` from the stage, and the prototype's own cells disagree with each other there
 * (a `Your week` label over a play-this-crowd action), so a transcription would have nothing
 * consistent to transcribe. {@link actionBarFor} still answers for `report`/`watch`, because a
 * router that can be asked must answer: it returns the watching stage's row, which keeps the one
 * § 3.4 guarantee that matters (the exit is `⤺ Stop watching` and it never warns). That row is
 * marked `guide: false` so the test can assert it is a defensive answer rather than a claim about
 * the guide.
 */

import type {
  EverydayModePick,
  EverydayScreen,
  EverydayState,
  RunContext,
} from './types.js';
import { MODE_PICKS } from './types.js';

/** The two flows that have a § 3.3 timeline. A rush has none, and a watched run has none. */
export type TimelineFlow = 'daily' | 'campaign';

/** One timeline stop: the § 3.3 label, and the screen a *reached* stop navigates to. */
export interface TimelineStop {
  readonly label: string;
  readonly screen: EverydayScreen;
}

/**
 * § 3.3's two timelines. Daily is four stops, campaign is five — asserted in the test by counting
 * these arrays, never by a literal `4` or `5`, so the totals are derived rather than remembered.
 */
export const TIMELINE_STEPS: Readonly<Record<TimelineFlow, readonly TimelineStop[]>> =
  Object.freeze({
    daily: Object.freeze([
      { label: 'Front door', screen: 'door' as const },
      { label: 'Brief', screen: 'brief' as const },
      { label: 'The day', screen: 'stage' as const },
      { label: 'How it went', screen: 'report' as const },
    ]),
    campaign: Object.freeze([
      { label: 'All buildings', screen: 'towers' as const },
      { label: '⟨building⟩', screen: 'building' as const },
      { label: 'Contract', screen: 'contract' as const },
      { label: 'The day', screen: 'stage' as const },
      { label: 'How it went', screen: 'report' as const },
    ]),
  });

/** The bar's timeline cell: which flow, and the 1-based stop this screen is. */
export interface BarTimeline {
  readonly flow: TimelineFlow;
  readonly step: number;
}

/** The bar's `‹ back` cell — present only where § 3.3 names a linear parent. */
export interface BarBack {
  readonly label: string;
  readonly screen: EverydayScreen;
}

/**
 * The primary cell. `label` is what the frame draws; `variants` is the § 3.3 cell in full, in the
 * guide's own order, for the screen lane whose state picks between them. `dangerVariants` names
 * the variants the guide marks red (`Start the month again`).
 */
export interface BarPrimary {
  readonly label: string;
  readonly variants: readonly string[];
  readonly dangerVariants?: readonly string[];
  /**
   * Resolved-state inertness — **and the reason, in the same field**. Present means the primary
   * genuinely cannot act right now and this sentence says why; absent means pressable.
   *
   * **It carries the reason rather than a `true` because a dead button with no reason is the
   * defect this field kept producing.** GitHub issue #262 measured the Endless rush setup screen
   * on the deployed build: the primary drawn at full amber, `title: null`,
   * `aria-describedby: null`, the note beside it reading *"Nothing to set up. It ends when it
   * ends."* — which next to a dead button reads as confirmation — and the one sentence that
   * explained it 184 px below the fold at 1280 × 720. Four of the eight sites that set this field
   * happened to put a reason in the row's `note`; four did not, and nothing could tell them apart
   * because `true` says nothing. A `string` makes the reasonless state unrepresentable, and
   * `shell.ts#drawBar` draws it in the pinned bar — which is above the fold at every height by
   * construction — and points the control at it with `title` and `aria-describedby`.
   *
   * **Never authored in {@link ACTION_BAR_ROWS}** — § 3.3 has no inert primary cell — it is set
   * only by a screen's `bar()` refinement for a state the table cannot know, e.g. the fixit
   * screen's synchronous pair mid-run (`everyday/fixitScreenModel.ts#fixitBarModel`).
   * `screens.test.ts` asserts over the registry that every resolved inert primary carries a
   * non-empty sentence, so a screen registered tomorrow fails on the commit that registers it.
   */
  readonly inert?: string | undefined;
}

/** The § 3.3 row, resolved for a state and ready to draw. */
export interface ActionBarModel {
  readonly screen: EverydayScreen;
  /** Names what is abandoned (§ 3.4) — never "Back", never "Exit". Inert only on the menu. */
  readonly leave: { readonly label: string; readonly inert: boolean };
  readonly back?: BarBack | undefined;
  readonly timeline?: BarTimeline | undefined;
  readonly primary: BarPrimary;
  /** The honest caveat. `undefined` where the guide's cell is `—`. */
  readonly note?: string | undefined;
  /** The § 3.3 cells that give the note two states, in the guide's order. */
  readonly noteVariants?: readonly string[] | undefined;
  /**
   * § 3.3's emphasis inversion: on the last step of a mode the primary loses its amber fill and
   * {@link wayOut} takes it. True on every report; a solved fix case inverts too, but solvedness
   * is the fix screen's own state, so that inversion arrives through its `bar()` refinement.
   */
  readonly inverted: boolean;
  /** The way out that takes the emphasis when {@link inverted} — `⌂ Return to Main Menu` etc. */
  readonly wayOut?: string | undefined;
}

/** One transcribed row. `ctx` is present only where § 3.3 splits the screen by flow. */
export interface ActionBarRow extends ActionBarModel {
  readonly ctx?: RunContext | undefined;
  /** `false` on the one defensive row the guide's table does not contain (see module docstring). */
  readonly guide: boolean;
}

/**
 * § 3.3's confirm strip (§ 3.4): the question, the consequence, and the two buttons. Replaces the
 * whole bar while a mid-run leave is being decided.
 */
export interface ConfirmStrip {
  readonly question: string;
  readonly consequence: string;
  readonly leaveLabel: string;
  readonly stayLabel: string;
}

/** The menu primary per pick, § 3.3's menu row: *follows the selected card*. */
const MENU_PRIMARY: Readonly<Record<EverydayModePick, string>> = Object.freeze({
  today: "Play today's tower",
  campaign: 'Play the campaign',
  rush: 'Play the rush',
  fixit: 'Play a broken building',
});

const LEAVE_TOWER = "⤺ Leave today's tower";
const LEAVE_CAMPAIGN = '⤺ Leave the campaign';
const LEAVE_RUSH = '⤺ Leave the rush';
const STOP_WATCHING = '⤺ Stop watching';
const MODES = '⌂ Modes';

/**
 * § 3.3's `stage · watching` note **as the guide wrote it**, kept so the deviation below can be
 * read against it rather than asserted.
 *
 * It is transcribed and deliberately never drawn. See {@link WATCHING_NOTE}.
 */
export const GUIDE_WATCHING_NOTE =
  'Their record, replayed. Nothing here is scored, and your own day is untouched.';

/**
 * The note this build draws instead, and the one cell of § 3.3 it does not follow to the letter.
 *
 * ## Why the guide's own sentence may not ship here
 *
 * § 3.3's cell says *"…and your own day is untouched"*. § 14.1 says, in terms:
 *
 * > **No first-person copy anywhere in the mode.** Not `you`, not `your run`, not `your best`. The
 * > word `you` on a watched run is a defect.
 *
 * The two are the same document disagreeing with itself, on the same screen: this note is drawn in
 * the § 3.3 bar **under the § 14.1 stage**, so shipping the cell verbatim would draw the word § 14.1
 * calls a defect on the surface § 14.1 is about. The rule wins over the cell, because § 14.1 states
 * a *defect condition* — something a test can fail — while § 3.3 states copy, and `docs/12`'s
 * documented-deviation pattern is what a build does when the handoff contradicts itself.
 * `watch/view.ts#REPLAY_PILL_VERB` is the same substitution one directory over, made for the same
 * reason and recorded the same way.
 *
 * ## What is preserved, which is the whole of the cell except its pronoun
 *
 * Three claims, all three kept: the run is **their record**, it is **replayed**, and **nothing here
 * is scored**. The fourth — that the spectator's own day survives — is kept as a claim about the
 * device rather than about the reader, which is `watch/shell.ts#RAIL_EYEBROW_WATCHING`'s own move
 * (*The week on this device*) and is true for the reason that module states: `watchingStateOf`
 * carries `week`, `report`, `tomorrow` and `interventions` by reference and moves none of them.
 *
 * `actionBar.test.ts` holds the guide's cell in its second transcription and asserts the deviation
 * in **both** directions — that the guide's sentence is first-person and this one is not — so a
 * future guide revision that drops the pronoun makes this substitution unnecessary and says so,
 * rather than leaving a deviation nobody re-reads. [§ D435](../../../../DECISIONS.md).
 */
export const WATCHING_NOTE =
  'Their record, replayed. Nothing here is scored, and the day on this device is untouched.';

const row = (r: Omit<ActionBarRow, 'guide'> & { readonly guide?: boolean }): ActionBarRow => ({
  guide: true,
  ...r,
});

const leave = (label: string): ActionBarModel['leave'] => ({ label, inert: false });
const primary = (variants: readonly string[], dangerVariants?: readonly string[]): BarPrimary => ({
  label: variants[0] ?? '',
  variants,
  ...(dangerVariants === undefined ? {} : { dangerVariants }),
});

/**
 * § 3.3's table, row for row and in the guide's order. The one addition — `report`/`watch` — sits
 * last and carries `guide: false`; everything else is transcription, checked against a second
 * transcription in `actionBar.test.ts`.
 *
 * **One cell is a documented deviation rather than a transcription** — the two `watch` rows' note.
 * {@link WATCHING_NOTE} carries the argument and {@link GUIDE_WATCHING_NOTE} carries the sentence it
 * departs from, so the departure is readable in both directions instead of being a difference
 * somebody has to notice.
 */
export const ACTION_BAR_ROWS: readonly ActionBarRow[] = Object.freeze([
  row({
    screen: 'menu',
    leave: { label: MODES, inert: true },
    primary: primary(MODE_PICKS.map((pick) => MENU_PRIMARY[pick])),
    note: 'Pick a mode above, then play it.',
    inverted: false,
  }),
  row({
    screen: 'door',
    leave: leave(LEAVE_TOWER),
    timeline: { flow: 'daily', step: 1 },
    primary: primary(['Set up today', 'Set up the replay']),
    note: 'Pick who drives, then run it.',
    inverted: false,
  }),
  row({
    screen: 'brief',
    leave: leave(LEAVE_TOWER),
    back: { label: 'Front door', screen: 'door' },
    timeline: { flow: 'daily', step: 2 },
    primary: primary(['Start the day']),
    note: 'Running the lifts: ⟨style⟩',
    inverted: false,
  }),
  row({
    screen: 'stage',
    ctx: 'daily',
    leave: leave(LEAVE_TOWER),
    back: { label: 'Brief', screen: 'brief' },
    timeline: { flow: 'daily', step: 3 },
    primary: primary(['Close the day']),
    note: 'Stops the clock and writes the report.',
    inverted: false,
  }),
  row({
    screen: 'stage',
    ctx: 'campaign',
    leave: leave(LEAVE_CAMPAIGN),
    back: { label: '⟨building⟩', screen: 'building' },
    timeline: { flow: 'campaign', step: 4 },
    primary: primary(['Close the day']),
    note: 'Stops the clock and writes the report.',
    inverted: false,
  }),
  row({
    screen: 'stage',
    ctx: 'rush',
    leave: leave(LEAVE_RUSH),
    back: { label: 'Endless rush', screen: 'rush' },
    primary: primary(['End the rush']),
    note: 'Stops the climb and counts the waves.',
    inverted: false,
  }),
  row({
    screen: 'report',
    ctx: 'daily',
    leave: leave(LEAVE_TOWER),
    back: { label: 'The day', screen: 'stage' },
    timeline: { flow: 'daily', step: 4 },
    primary: primary(['Your week']),
    note: 'Seven days, and where the world landed.',
    inverted: true,
    wayOut: '⌂ Return to Main Menu',
  }),
  row({
    screen: 'report',
    ctx: 'campaign',
    leave: leave(LEAVE_CAMPAIGN),
    back: { label: 'The day', screen: 'stage' },
    timeline: { flow: 'campaign', step: 5 },
    primary: primary(['Back to ⟨building⟩']),
    inverted: true,
    wayOut: '⤺ All buildings',
  }),
  row({
    screen: 'report',
    ctx: 'rush',
    leave: leave(LEAVE_RUSH),
    back: { label: 'The day', screen: 'stage' },
    primary: primary(['Run the rush again']),
    note: 'Waves are identical for everyone.',
    inverted: true,
    wayOut: LEAVE_RUSH,
  }),
  row({
    screen: 'towers',
    leave: leave(LEAVE_CAMPAIGN),
    timeline: { flow: 'campaign', step: 1 },
    primary: primary(['Open ⟨building⟩']),
    note: '⟨N⟩ buildings want a decision.',
    inverted: false,
  }),
  row({
    screen: 'building',
    leave: leave(LEAVE_CAMPAIGN),
    back: { label: 'All buildings', screen: 'towers' },
    timeline: { flow: 'campaign', step: 2 },
    primary: primary([
      'Run the day and decide as it goes',
      'Run the day with that',
      'Send your answer',
      'Choose an option first',
      'Watch a day here',
    ]),
    noteVariants: [
      "⟨the picked option's effect⟩",
      'The options travel with you — you can answer while the day plays.',
    ],
    inverted: false,
  }),
  row({
    screen: 'contract',
    leave: leave(LEAVE_CAMPAIGN),
    back: { label: 'All buildings', screen: 'towers' },
    timeline: { flow: 'campaign', step: 3 },
    primary: primary(
      ['Lock it in and run day ⟨N⟩', 'Start the month again'],
      ['Start the month again'],
    ),
    noteVariants: ['⟨nights of works ahead⟩', '⟨the month-over sentence⟩'],
    inverted: false,
  }),
  row({
    screen: 'rush',
    leave: leave(LEAVE_RUSH),
    primary: primary(['Start the rush']),
    note: 'Nothing to set up. It ends when it ends.',
    inverted: false,
  }),
  row({
    screen: 'fixit',
    leave: leave('⤺ Leave this building'),
    primary: primary(['Run the day', 'Run it again', 'Next building']),
    note: '⟨what the run will measure⟩',
    inverted: false,
    /*
     * § 3.3: a *solved* fix case is a last step and inverts, with the way out taking the fill.
     * Solvedness is the fix screen's state, so the row ships uninverted and carries the way out
     * for the refinement that flips it — see {@link ActionBarModel.inverted}.
     */
    wayOut: '⌂ Return to Main Menu',
  }),
  row({
    screen: 'workshop',
    leave: leave(MODES),
    primary: primary(['Run a day with this']),
    noteVariants: ['Unsaved changes travel with the run.', 'Nothing changed yet.'],
    inverted: false,
  }),
  row({
    screen: 'bench',
    leave: leave(MODES),
    primary: primary(['Run the suite', 'Run the suite again']),
    note: 'Matched crowds for every dispatcher in the field.',
    inverted: false,
  }),
  row({
    screen: 'tuner',
    leave: leave(MODES),
    primary: primary(['Run it and watch']),
    noteVariants: [
      'Sandbox — this run will not be scored.',
      'Scored day — three things are fixed.',
    ],
    inverted: false,
  }),
  row({
    screen: 'designer',
    leave: leave(MODES),
    primary: primary(['Run a day in it']),
    note: 'Nothing here is scored. It is a drawing board.',
    inverted: false,
  }),
  /* § 3.3 writes `week · board` as one row; two screens, so it is transcribed twice. */
  row({
    screen: 'week',
    leave: leave(MODES),
    primary: primary(["Play today's tower", "Replay today's tower"]),
    inverted: false,
  }),
  row({
    screen: 'board',
    leave: leave(MODES),
    primary: primary(["Play today's tower", "Replay today's tower"]),
    inverted: false,
  }),
  row({
    screen: 'settings',
    leave: leave(MODES),
    primary: primary(['Back to the modes']),
    inverted: false,
  }),
  row({
    screen: 'stage',
    ctx: 'watch',
    leave: leave(STOP_WATCHING),
    primary: primary(['Play this crowd yourself']),
    note: WATCHING_NOTE,
    inverted: false,
  }),
  /* The one row § 3.3 does not contain — see the module docstring for why it exists anyway. */
  row({
    screen: 'report',
    ctx: 'watch',
    guide: false,
    leave: leave(STOP_WATCHING),
    primary: primary(['Play this crowd yourself']),
    note: WATCHING_NOTE,
    inverted: false,
  }),
]);

/**
 * The § 3.3 row for this state, resolved.
 *
 * Total over every screen × context: rows keyed by `ctx` win where the table splits a screen by
 * flow, the screen's flow-free row answers everywhere else, and the two `watch` rows close the
 * remainder. The menu's primary follows `state.modePick` (§ 3.3 — *"follows the selected card"*),
 * defaulting to `today`, the card the menu highlights first.
 */
export function actionBarFor(state: EverydayState): ActionBarModel {
  const matched =
    ACTION_BAR_ROWS.find((r) => r.screen === state.screen && r.ctx === state.ctx) ??
    ACTION_BAR_ROWS.find((r) => r.screen === state.screen && r.ctx === undefined);
  if (matched === undefined) {
    /*
     * Unreachable while the test's totality case passes — every screen key has a flow-free row or
     * a full set of flow rows. Thrown rather than defaulted because a bar invented here would be
     * a § 3.3 row the table never contained.
     */
    throw new Error(`no § 3.3 row for ${state.screen} in ctx ${state.ctx}`);
  }
  if (matched.screen !== 'menu') return matched;
  const pick = state.modePick ?? 'today';
  return { ...matched, primary: { ...matched.primary, label: MENU_PRIMARY[pick] } };
}

/**
 * § 3.4's confirm strip for a mid-run leave, or `undefined` where leaving never warns.
 *
 * `watch` returns `undefined` **by rule, not by absence**: *"A watched run never warns. It is
 * somebody else's record; there is nothing of yours to lose."* Daily and campaign share the
 * day-shaped question; the rush has its own pair. The strip only ever applies on the stage with
 * the day not yet closed — everywhere else the bar's left button leaves immediately, because *"a
 * report is already after the fact; warning about it would be theatre."*
 */
export function confirmStripFor(ctx: RunContext): ConfirmStrip | undefined {
  if (ctx === 'watch') return undefined;
  if (ctx === 'rush') {
    return {
      question: 'Leave the rush?',
      consequence: 'The climb is not saved, and a stopped rush has no wave to post.',
      leaveLabel: 'Leave it',
      stayLabel: 'Stay',
    };
  }
  return {
    question: 'Leave the day unfinished?',
    consequence: "Today's run will not be scored, and the board keeps whatever you posted before.",
    leaveLabel: 'Leave it',
    stayLabel: 'Stay',
  };
}
