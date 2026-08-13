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
 * - **Locked for score** — shipped as a statement, with its button refusing. The three fixed
 *   things are real (the tower, the machines and the crowd are the day's), and *Take it to the
 *   sandbox* points at `tuner`, which `screens.ts` refuses in its own words. The refusal is read
 *   from there rather than re-worded, so the two surfaces refuse once.
 *
 * ## What today asks, which § 6.2 does not list and this screen draws anyway
 *
 * The four bars are what the day will be graded on, they are already computed for the rail, and a
 * brief that did not name them would send a player into a scored day without saying what the score
 * is. They are drawn as the day's **questions** rather than as readings: before a run every
 * reading is `pending` (`host.goalsToday`'s own docstring — zero arrivals sits under the wake-up
 * gate), so this card prints `ShiftGoal.label` and never a value.
 */

import { UNBUILT_REASONS } from './screens.js';
import type { TodayRecord } from './today.js';

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

/** A card § 6.2 asks for that this build does not offer, with the reason it does not. */
export interface BriefRefusalCard {
  readonly heading: string;
  /** What the card would have been, so a reader learns what is missing rather than that it is. */
  readonly what: string;
  /** Why it is not here. One clause, checkable. */
  readonly why: string;
  /** The caveat § 6.2 attaches, kept because it is true whenever the thing exists. */
  readonly caveat: string;
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
});

/**
 * § 6.2's *Locked for score*. The statement is true; the button is not offered, in `screens.ts`'s
 * own words for the screen it would have opened.
 *
 * **A function rather than a frozen constant, and that is a fix rather than a style.** The import
 * graph closes — `screens.ts` imports this screen's module, which imports this file, which imports
 * `screens.ts` — so a module-level read of `UNBUILT_REASONS` resolves at init time on whichever
 * file the cycle is entered second, and the card would draw *"Take it to the sandbox: undefined"*.
 * That is `types.ts#ENGINEER_SWAP_REFUSAL`'s own history, one directory over and already paid for
 * once. Read at call time, the table is initialised and the two surfaces refuse in one wording.
 */
export function lockedForScore(): BriefRefusalCard {
  return {
    heading: 'LOCKED FOR SCORE',
    what:
      'The tower, the machines and the crowd are the same for everyone today. You can change all ' +
      'of them — the run just stops counting.',
    why: `Take it to the sandbox: ${UNBUILT_REASONS.tuner ?? 'the tuner screen is not built'}.`,
    caveat: 'Everything you can change from here changes the dispatcher, and nothing else.',
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
    barNote: `Running the lifts: ${today.driver}`,
  };
}
