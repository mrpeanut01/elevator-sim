/**
 * **The brief, as words** — GAMEPLAY § 6.2, decided here and drawn by `briefScreen.ts`.
 *
 * The day card: the wrinkle, the occupancy and what today asks. Every fact on it comes from
 * `today.ts`'s one day record (§ 16 rule 14), so the brief cannot say *nothing booked* over a
 * stage that is running a fire drill.
 *
 * ## § 6.2's two columns, and which of its controls this build can actually offer
 *
 * Left: the elevation (`briefScreen.ts` draws it — it needs a canvas), the out-of-service strip,
 * the five facts, and the load reading. All four are `TodayRecord`'s, unedited.
 *
 * Right, and this is where the roster is decided the way `settingsView.ts` decides its own:
 *
 * - **Today's wrinkle** — shipped. `shift/events.ts`'s event for this day, quoted. The card adds
 *   § 6.2's own clause that everyone playing today gets the same one at the same time, which is
 *   true here for a stronger reason than it is in the prototype: the event is a pure function of
 *   `(day, dayIdx)`, so two players on day 3 meet the same wrinkle by construction.
 * - **Who drives today** — shipped, and it writes. The cards and the dropdown both call
 *   `host.setDispatcher`, which is `dev/state.ts#withDispatcher` — the identical route the
 *   Engineer rail's own picker takes. The count under it is derived from the rendered list
 *   (§ 16 rule 5), never a literal.
 * - **Race against** — **refused**, and the refusal is the whole of what this build owes here.
 *   § 6.2's ghost is a second dispatcher driving a second copy of today's crowd beside yours.
 *   Nothing in this tree runs two dispatchers over one recording: `ViewerState` carries one
 *   `recording`, `dev/shiftRunner.ts` simulates one run, and the only paired-arm machinery in the
 *   repository is `benchmark/`, which is a fifty-replication study rather than a race. A picker
 *   over that would be five radio buttons writing a field no run reads — `patternSwitching`'s
 *   defect exactly (§ D219), which is the one CLAUDE.md tells a lane building a surface to read
 *   first. So the card states what a ghost would be, says it is not built, and keeps § 6.2's
 *   caveat, which is true of a race whenever there is one.
 * - **Locked for score** — shipped as a statement, **and its button now opens**. The three fixed
 *   things are real (the tower, the machines and the crowd are the day's), and *Take it to the
 *   sandbox* points at `tuner`, which § 3.2 names as one of that screen's two doors — the other
 *   being the report's third lever, which this build does not draw. § 3.2 forbids a rail row for it
 *   (*a thing you do to a day, not a place you live*), so this card is the shipped way in.
 *   It refused for as long as the tuner was unbuilt, and how it refused is the thing to read:
 *   {@link lockedForScore}'s docstring has the fuse that arrangement left behind.
 *
 * ## What today asks, which § 6.2 does not list and this screen draws anyway
 *
 * The four bars are what the day will be graded on, they are already computed for the rail, and a
 * brief that did not name them would send a player into a scored day without saying what the score
 * is. They are drawn as the day's **questions** rather than as readings: before a run every
 * reading is `pending` (`host.goalsToday`'s own docstring — zero arrivals sits under the wake-up
 * gate), so this card prints `ShiftGoal.label` and never a value.
 */

import type { ActionBarModel } from './actionBar.js';
import { isScreenBuilt, unbuiltReasonFor } from './screens.js';
import type { TodayRecord } from './today.js';
import type { EverydayScreen } from './types.js';

/** One dispatcher on offer — § 6.2's style card and the dropdown's option are one list. */
export interface BriefDispatcherOption {
  readonly id: string;
  readonly name: string;
  /** The profile's own first sentence, or the empty string when it carries no description. */
  readonly blurb: string;
  /** `driving today` / `tap to choose` — § 6.2's own two words. */
  readonly meta: string;
  readonly selected: boolean;
  /** Whether this is one the reader saved — the dropdown appends *— yours* to those. */
  readonly mine: boolean;
}

/**
 * A card § 6.2 states rather than draws as a live control — what it would be, and either why it is
 * not here or where it is carried out.
 *
 * Two of them, and they are no longer the same shape. {@link GHOST_REFUSAL} refuses: nothing in
 * this tree runs two dispatchers over one crowd, so the card has no {@link door} and `why` says why.
 * {@link lockedForScore} is a **statement with a door**: the three fixed things are real, and the
 * screen that unfixes them exists, so the card carries the route to it. The type covers both
 * because § 6.2 draws them identically and the difference is whether there is somewhere to go.
 */
export interface BriefRefusalCard {
  readonly heading: string;
  /** What the card would have been, so a reader learns what is missing rather than that it is. */
  readonly what: string;
  /** Why it is not here, or — when {@link door} is set — what taking it costs. One clause. */
  readonly why: string;
  /** The caveat § 6.2 attaches, kept because it is true whenever the thing exists. */
  readonly caveat: string;
  /**
   * The screen this card opens, or `undefined` for one that opens nothing.
   *
   * Set only where {@link isScreenBuilt} says the target is built — see {@link lockedForScore} for
   * why that question is asked rather than assumed.
   */
  readonly door: { readonly label: string; readonly screen: EverydayScreen } | undefined;
}

/** The whole screen, as data. */
export interface BriefScreenView {
  readonly eyebrow: string;
  readonly title: string;
  readonly seedLine: string;
  /** § 6.2's strip, or `undefined` on a day that holds no car. */
  readonly outOfService: { readonly badge: string; readonly sentence: string } | undefined;
  readonly facts: readonly { readonly label: string; readonly value: string }[];
  readonly load: { readonly heading: string; readonly word: string; readonly note: string } | undefined;
  readonly wrinkle: {
    readonly heading: string;
    readonly title: string;
    readonly body: string;
    /** § 6.2: everyone playing today gets the same one at the same time. */
    readonly shared: string;
  };
  readonly asks: { readonly heading: string; readonly rows: readonly string[]; readonly note: string };
  readonly drivers: {
    readonly heading: string;
    /** The three § 6.2 recommends — the head of the same list the dropdown carries. */
    readonly cards: readonly BriefDispatcherOption[];
    readonly options: readonly BriefDispatcherOption[];
    /** `6 styles · 2 of yours` — derived from the rendered list, never a literal (§ 16 rule 5). */
    readonly count: string;
  };
  readonly ghost: BriefRefusalCard;
  readonly locked: BriefRefusalCard;
  /** § 3.3's brief note, with this run's dispatcher named: `Running the lifts: ⟨style⟩`. */
  readonly barNote: string;
}

/**
 * § 3.3's brief row, resolved for the run this screen is describing — the `bar()` refinement
 * `screens.ts` contracts, kept pure so the substitution is driven without a mount.
 *
 * ## The marker was reaching the player, and only a deployed page showed it
 *
 * `actionBar.ts` carries the guide's state-dependent cells verbatim inside `⟨…⟩` markers, on the
 * stated rule that **the frame never draws one** — a screen's `bar()` substitutes it. `BRIEF_SCREEN`
 * shipped without a `bar()` at all, so the shell drew the table row unrefined and the brief's note
 * read `Running the lifts: ⟨style⟩` on every day. {@link BriefScreenView.barNote} had computed the
 * right sentence all along; nothing carried it to the bar.
 *
 * It is § 16 rule 11's defect in the shape the rule does not name — not an engine identifier, but a
 * *typesetting mark for one*, which is the same promise broken for the same reader. Every node and
 * browser case passed: they assert the note the view computes, and the view was right.
 *
 * The fallback is a narrower true sentence rather than the marker: a bar asked for before the
 * screen knows its driver says what is running without naming it, which is a smaller claim and not
 * a placeholder.
 */
export function briefBarModel(base: ActionBarModel, driver: string | undefined): ActionBarModel {
  const note =
    driver === undefined ? 'Running the lifts.' : `${BRIEF_NOTE_LEAD}${driver}`;
  return { ...base, note };
}

/** The § 3.3 note's fixed half — one home, so the view and the bar cannot word it differently. */
export const BRIEF_NOTE_LEAD = 'Running the lifts: ';

/** What {@link briefScreenViewOf} is computed from. */
export interface BriefScreenInput {
  readonly today: TodayRecord;
  /** Every dispatcher on offer, shipped first — `host.dispatchers()`, in its own order. */
  readonly dispatchers: readonly {
    readonly id: string;
    readonly name: string;
    readonly description?: string | undefined;
  }[];
  /** The ids the reader saved — `host.savedDispatchers()`, so the list can mark them. */
  readonly savedIds: readonly string[];
  readonly selectedId: string;
}

/** How many style cards § 6.2 puts above the dropdown. */
export const RECOMMENDED_CARDS = 3;

/** The first sentence of a description, which is what § 6.2's card carries. */
function firstSentence(text: string | undefined): string {
  if (text === undefined || text.trim() === '') return '';
  const [first] = text.split('. ');
  if (first === undefined) return '';
  return first.endsWith('.') ? first : `${first}.`;
}

/**
 * § 6.2's *Race against*, refused — see the module docstring for the evidence.
 *
 * The caveat is the guide's own sentence and is kept verbatim, because it is the sentence that
 * makes a race honest and it will be needed unchanged the day one exists.
 */
export const GHOST_REFUSAL: BriefRefusalCard = Object.freeze({
  heading: 'RACE AGAINST',
  what:
    'A second dispatcher driving a second copy of today’s crowd beside yours — the world’s ' +
    'middle, your best, the plain baseline, or nobody.',
  why:
    'Not built: this build simulates one run at a time, so there is no second line to draw. The ' +
    'test bench runs two dispatchers against matched crowds fifty times, which is the question a ' +
    'race only gestures at.',
  caveat: 'One day each is a race, not proof. The test bench settles it properly.',
  door: undefined,
});

/**
 * § 6.2's *Locked for score* — the statement, and the door § 3.2 names.
 *
 * ## It refused until § 3.3's tuner landed, and the way it refused was a fuse
 *
 * The card used to read `` `Take it to the sandbox: ${UNBUILT_REASONS.tuner ?? '…'}` ``, which was
 * correct copy over an unbuilt screen and a **delay fuse** underneath it: `UNBUILT_REASONS` is keyed
 * exactly over the unbuilt keys, so the day `tuner` was registered the key vanished, the `??`
 * fallback took over silently, and this card went on refusing a screen a player can open — § D227's
 * stale refusal, arriving through a merge rather than through an edit. `screens.ts`'s own docstring
 * names the shape and forbids it; this call site is what it was written about.
 *
 * So the question is asked of the registry rather than of the table: {@link isScreenBuilt} first,
 * and {@link unbuiltReasonFor} **only** in the arm where that is `false` — where it throws on a
 * built key, loudly, at the one instant a fallback would have gone quiet. The refusing arm is kept
 * rather than deleted because it is what draws the day the tuner is unregistered.
 *
 * ## And it stays a function rather than a frozen constant
 *
 * The import graph closes — `screens.ts` imports this screen's module, which imports this file,
 * which imports `screens.ts` — so a module-level read resolves at init time on whichever file the
 * cycle is entered second, and the card would draw *"Take it to the sandbox: undefined"* or, worse
 * now, offer no door on a build that has one. That is `types.ts#ENGINEER_SWAP_REFUSAL`'s own
 * history, one directory over and already paid for once. Read at call time, the registry is
 * initialised and the two surfaces agree.
 */
export function lockedForScore(): BriefRefusalCard {
  const built = isScreenBuilt('tuner');
  return {
    heading: 'LOCKED FOR SCORE',
    what:
      'The tower, the machines and the crowd are the same for everyone today. You can change all ' +
      'of them — the run just stops counting.',
    why: built
      ? 'Take it to the sandbox: the day still runs with whatever you change, and it stops ' +
        'counting on today’s board.'
      : `Take it to the sandbox: ${unbuiltReasonFor('tuner')}.`,
    caveat: 'Everything you can change from here changes the dispatcher, and nothing else.',
    door: built ? { label: 'Take it to the sandbox', screen: 'tuner' } : undefined,
  };
}

/** § 6.2, resolved. */
export function briefScreenViewOf(input: BriefScreenInput): BriefScreenView {
  const saved = new Set(input.savedIds);
  const options: readonly BriefDispatcherOption[] = input.dispatchers.map((profile) => ({
    id: profile.id,
    name: profile.name,
    blurb: firstSentence(profile.description),
    meta: profile.id === input.selectedId ? 'driving today' : 'tap to choose',
    selected: profile.id === input.selectedId,
    mine: saved.has(profile.id),
  }));
  const mine = options.filter((option) => option.mine).length;
  const { today } = input;
  return {
    eyebrow: `${today.dayLabel} · ${today.wrinkle.name.toUpperCase()}`,
    title: `Today at ${today.towerName}`,
    seedLine: today.seedLine,
    outOfService: today.outOfService,
    facts: today.facts,
    load:
      today.load === undefined
        ? undefined
        : { heading: 'HOW HARD THIS LOOKS', word: today.load.word, note: today.load.note },
    wrinkle: {
      heading: 'TODAY’S WRINKLE',
      title: today.wrinkle.name,
      body: today.wrinkle.note,
      shared: 'Everyone playing today gets the same one, at the same point in the day.',
    },
    asks: {
      heading: 'WHAT TODAY ASKS',
      rows: today.asks,
      note:
        'Nothing is graded until twenty people have turned up, so a quiet morning is read rather ' +
        'than marked.',
    },
    drivers: {
      heading: 'WHO DRIVES TODAY',
      cards: options.slice(0, RECOMMENDED_CARDS),
      options,
      /*
       * Derived from the rendered list — § 16 rule 5, whose own example is this counter. The
       * prototype hard-codes `STYLES.length`, and the guide's note is that every hardcoded count
       * in it eventually contradicted something.
       */
      count: `${String(options.length)} to choose from · ${String(mine)} of yours`,
    },
    ghost: GHOST_REFUSAL,
    locked: lockedForScore(),
    barNote: `${BRIEF_NOTE_LEAD}${today.driver}`,
  };
}
