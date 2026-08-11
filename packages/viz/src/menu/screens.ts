/**
 * What each menu screen offers, as data — the decision half of `dev/menuPanel.ts`.
 *
 * ## Why this exists when `menu.ts` already does
 *
 * `menu.ts` is the reducer: it answers *what does this state become*. It has never answered *what
 * does this screen offer*, and that question was being answered inside click handlers — five rows
 * built from a literal in `mainScreen`, a Start whose enabled-ness was recomputed inside its own
 * listener, a campaign row whose handler was the only statement anywhere of what picking Campaign
 * means.
 *
 * That is the defect § D214 § 2 created `menu/` to avoid, one layer over: *a decision made inside a
 * click handler needs a document, a canvas and a click to reach, so it cannot be tested and it
 * drifts.* It is also **why** `docs/16` § 5 clauses 2, 3 and 6 shipped — no test could reach the
 * decision, so no test could notice that Start did not start, that it left the week where it was, or
 * that the campaign row selected nothing.
 *
 * ## The intent union is the mechanism, not the tests
 *
 * {@link MenuIntent} is a **value**, not a closure. A closure is unwalkable and uncomparable; a
 * tagged value can be enumerated, compared, and replayed by `playthrough`, and — the half that
 * matters most — it makes the shell's handler an **exhaustive switch**.
 *
 * That is how {@link MenuIntent} `submit-score` earns its place. `menu/client.ts#submit` has existed
 * with **no non-test caller at all**, so the leaderboard could be read and never posted to and the
 * Account row's own subtitle described something no player could do. A test would have found that
 * eventually. A member of this union does better: the shell does not compile until something handles
 * it.
 *
 * ## Every affordance carries its scope
 *
 * {@link MenuAffordance.scope} is required — `docs/16` S1. A control that appears on a screen without
 * anybody having decided when it may move will not typecheck, which is the whole of why the field is
 * not optional.
 */

import type { ChangeScope } from '../scope/types.js';

import {
  FREE_PLAY_RATES,
  back,
  canStart,
  freePlayIssues,
  navigate,
  openingPart,
  partsFor,
  SEED_MAX_DIGITS,
  updateChallenge,
  updateFreePlay,
  updateSettings,
} from './menu.js';
import { partIdOf } from './partsOfDay.js';
import { CALENDAR_PERIODS, CALENDAR_PERIOD_IDS } from '../shift/calendar.js';
import {
  CONSTRAINTS,
  DIMENSION_LABELS,
  constraintById,
  type CommissioningChoices,
} from '../commissioning/types.js';
import { refusalsBeside, type CommissioningReview } from '../commissioning/refusals.js';
import { movedChoiceText } from '../commissioning/choices.js';

import type { ChallengeBoardPage, ChallengeView } from './challenge.js';
import type { BoardPage, RunSubmission } from './client.js';
import {
  BEATING_NOTE,
  BEAT_LABEL,
  beatDetailOf,
  beatRefusalOf,
  boardConfigurationOf,
  boardRevealOf,
  boardRevealRefusalOf,
  selectionFromRun,
} from './boardRun.js';
import {
  MENU_SCREENS,
  PLAYBACK_SPEEDS,
  type CatalogueEntry,
  type ChallengeSelection,
  type FreePlaySelection,
  type MenuCatalogue,
  type MenuScreen,
  type MenuState,
  type Settings,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Intents
 * -------------------------------------------------------------------------- */

/**
 * Everything a player can ask the menu to do.
 *
 * Deliberately flat and deliberately total. Two members name things that reach outside the menu
 * entirely — {@link MenuIntent} `start` and `submit-score` — and they are here rather than in the
 * panel because *"what did the player ask for"* and *"who does it"* are different questions, and
 * only the first one is testable without a browser.
 */
export type MenuIntent =
  | { readonly kind: 'navigate'; readonly to: MenuScreen }
  | { readonly kind: 'back' }
  /** Re-open the menu over a running game. `docs/16` § 5 clause 5: nothing could, before. */
  | { readonly kind: 'reopen' }
  /**
   * Leave the menu without choosing anything — GitHub issues #40, #33 and #68.
   *
   * ## Why this is not `back`
   *
   * `back` pops a screen and the root has nothing to pop, so a player who pressed **Menu** over a
   * running shift and then changed their mind had no way out that was not *start something*: the
   * root offered six navigations and no exit. That is the one-way door #40 reports, and it is also
   * the whole of Escape's problem. § D249 § 3 considered binding Escape to `back` and refused it —
   * *"it would work on five screens and do nothing on the root, which is exactly where #40's
   * reporter is standing"* — so the key means **close**, on every screen, and that needs a member
   * of its own.
   *
   * ## And it is a member rather than a call, for this union's founding reason
   *
   * `dispatchMenu` returns `void` and has no `never` arm, so a member nothing handles compiles and
   * ships a dead control — the defect this package has shipped eleven times. Adding the intent and
   * its arm is one change for exactly that reason: the shell does not compile until something
   * performs it, and `menu/screens.test.ts` requires the row to be reachable.
   *
   * It carries nothing. *What was running* is the shell's and stays the shell's: this says only
   * that the player is done with the menu, and `dev/main.ts#closeMenu` is what that means.
   */
  | { readonly kind: 'close' }
  /*
   * A **field and a value**, never a prepared patch and never a closure.
   *
   * A closure cannot be walked, compared or replayed, and a prepared patch is already the answer to
   * a question the player has not asked yet — a select's affordance is built before anybody picks an
   * option. Naming the field lets the panel and `playthrough` both build the intent from whichever
   * option was chosen, and lets {@link applyIntent} stay the one place that parses a string into a
   * rate, a duration or a speed.
   */
  | { readonly kind: 'set-free-play'; readonly field: keyof FreePlaySelection; readonly value: string }
  | { readonly kind: 'set-setting'; readonly field: keyof Settings; readonly value: string }
  /** Commit the Free Play selection. The shell resets the week and runs it. */
  | { readonly kind: 'start' }
  | { readonly kind: 'open-campaign' }
  /**
   * Open a week with no assignment — the *endless mode* `c5` and `c8` promise in their rewards and
   * nothing implemented. `menu/enterEndless.ts` is the decision; this member is what makes the
   * shell's switch fail to compile until something performs it.
   */
  | { readonly kind: 'start-endless' }
  | { readonly kind: 'open-board'; readonly configHash: string }
  /**
   * Take a board row's own configuration and run it — GitHub issue #93 § 1.
   *
   * **The run travels on the intent rather than an index into the page**, and the difference is not
   * stylistic. The board is refetched on arrival and after every accepted post, so an index would
   * name whichever row happens to be in that slot when the shell gets round to it — and a player who
   * pressed the fourth row and ran the fifth would have no way to tell, because both are real rows
   * with real figures. A tagged **value** cannot drift out from under its own press, which is this
   * union's founding argument applied to the one member whose subject is not the state.
   *
   * It is the menu's to apply, unlike its neighbours: {@link applyIntent} writes the selection into
   * `MenuState.freePlay`, so the Free play screen afterwards shows exactly the configuration that
   * ran rather than the one the player had before. The shell's arm then performs it through
   * `enterFreePlay`, which is the same path **Start** takes — deliberately, because two ways to
   * begin a free-play run is two ways for one of them to stop resetting the week.
   */
  | { readonly kind: 'beat-score'; readonly run: RunSubmission }
  | { readonly kind: 'account-form'; readonly patch: Record<string, string> }
  /**
   * Send the form. **One member for two questions**, because there are two and they never overlap.
   *
   * Signed out it asks for a link; signed in and still unnamed (`account.ts#namingStage`) it saves
   * the display name. A second member would have needed the panel to decide which question is being
   * asked, and *which field is live is a fact about the session* — the split that let issue #31's
   * screen print a sign-in error under a registration form.
   *
   * There is no `account-mode` beside it any more. § D241 § 7 collapsed sign-in and register into
   * one request, because asking for a display name **only when the address is new** tells the person
   * filling in the form whether the address is new — the account-enumeration oracle the server's
   * identical-bytes 202 exists to close. A member whose control no longer exists is a member nothing
   * dispatches, so it is deleted rather than left with an arm explaining itself.
   */
  | { readonly kind: 'account-submit' }
  | { readonly kind: 'sign-out' }
  /** Post the run on screen to the leaderboard. The member with no handler until this wave. */
  | { readonly kind: 'submit-score' }
  /* ---------------------------------------------------------------- challenge */
  /**
   * The one axis a challenge leaves open. Everything else about the run is the server's.
   *
   * A `field` and a value, like the other two setters — see the note on `set-free-play` for why a
   * prepared patch would be the answer to a question the player has not asked yet.
   */
  | { readonly kind: 'set-challenge'; readonly field: keyof ChallengeSelection; readonly value: string }
  /** Simulate every seed the challenge names, in the order it names them. */
  | { readonly kind: 'run-challenge' }
  /** Put a calendar period over the week, or take it off. `''` is *an ordinary week*. */
  | { readonly kind: 'set-calendar'; readonly periodId: string }
  /** Move one dimension of one bank's fabric. The value is the option's own id. */
  | {
      readonly kind: 'set-commissioning';
      readonly bankId: string;
      readonly dimension: 'shafts' | 'machineClass' | 'ratedSpeed';
      readonly value: string;
    }
  /** Choose which capital constraint the week is commissioned under. */
  | { readonly kind: 'set-constraint'; readonly constraintId: string }
  /**
   * Take the fabric on screen into the week — GitHub issue #48.
   *
   * ## Why a screen whose controls already worked still needed this
   *
   * `set-commissioning` writes `ViewerState.commissioning` on every pick, so the choices were
   * *already* live. What the screen had no way to say was **I am done**: no commit, no cancel, and
   * nothing that took the player anywhere afterwards. A design phase you cannot leave deliberately
   * is a design phase whose result arrives by accident, on whichever run happens next.
   *
   * So this is the moment the fabric stops being a draft, and it is also the only moment the screen
   * has to refuse: `CommissioningReview.admissible` is false whenever anything is over budget or out
   * of the constraint's scope, and a commit is where that refusal belongs — beside the verb, not
   * scattered over three selects that are each individually fine.
   *
   * It carries nothing. *Which choices* is `ViewerState.commissioning`, which the shell already
   * holds; putting them on the intent would be a second copy that could disagree with the screen
   * the player is looking at.
   */
  | { readonly kind: 'commit-commissioning' }
  /**
   * Put the fabric back to what the building already has — issue #48's other half.
   *
   * **Not an undo stack.** It resets to *as built*, which is `ViewerState.commissioning`'s empty
   * value and is byte-identical to the authored building: one step, no history, and the same value
   * `withBuilding` writes when the building changes (§ D269). A per-pick undo would be a second
   * model of the choices beside the one the reducer holds.
   *
   * It is offered **only when something has moved**, because a cancel that is always available on a
   * screen where nothing has changed is a control whose press changes nothing — `docs/16` S7, and
   * the defect this repository counts.
   */
  | { readonly kind: 'reset-commissioning' }
  /** Post the whole seed set. Never a partial one — see `challengeSubmissionOf`. */
  | { readonly kind: 'post-challenge' };

/* -------------------------------------------------------------------------- *
 * Choosing an option — the transport, and the one line that broke three screens
 * -------------------------------------------------------------------------- */

/**
 * The intent a control dispatches **once the player has chosen** — {@link MenuAffordance.intent}
 * rewritten to carry the option they picked instead of the one already showing.
 *
 * ## Why an affordance's own intent is not the one to dispatch
 *
 * A `select` is built before anybody picks anything, so its intent has to be built out of the value
 * the row is *currently* showing — that is what puts the right option in the box. Dispatching that
 * same intent on `change` therefore writes back the value that was already there: **a no-op by
 * construction**, and a control the player can move that changes nothing.
 *
 * `dev/menuPanel.ts` did that rewrite itself, in one expression, for exactly two of the six intents
 * that carry a chosen value:
 *
 * ```ts
 * row.intent.kind === 'set-free-play' || row.intent.kind === 'set-setting'
 *   ? { ...row.intent, value }
 *   : row.intent
 * ```
 *
 * The other four were dispatched unrewritten. That is GitHub issue #44 (the Calendar dropdown
 * "reverts to An ordinary week" — measured: `''` before the pick and `''` after it), issue #42
 * (**every** Commissioning dropdown inert — measured: `main — shafts` at 2, picked 1, back at 2),
 * and it was latent on `set-challenge` and `set-constraint` besides. Nothing downstream of the
 * transport was broken: `state.calendar` reaches `shiftRunConfigOf`, `calendarDayFor` and
 * `calendarPatch`, and the shell's arm calls `runShift()`. **One line in the middle of a live chain
 * is not a dead seam — it is a live chain with a rewrite missing from it.**
 *
 * ## Why this is a function here rather than an expression there
 *
 * Two reasons, and the second is the load-bearing one.
 *
 * It is a **decision** — *where does the chosen value go on this intent* — and a decision written
 * inside a render call needs a document and a click to reach, which is § D214 § 2's founding
 * argument for this whole directory and the reason `menu.ts` and this file are separate from the
 * panel at all.
 *
 * And it is **exhaustive over {@link MenuIntent}**, which the expression it replaces could not be. A
 * seventh intent carrying a chosen value cannot be added without an arm here, because the switch has
 * no `default` and this function returns a `MenuIntent`: `noImplicitReturns` refuses it. The
 * expression's `: row.intent` fallback was a silent default over the same union, which is why four
 * members could join it without anything noticing.
 *
 * The pass-through list below is still hand-written, and that is the shape of list this repository
 * keeps finding stale — so it is not what the tests trust. `menu/screens.test.ts` derives every
 * `select`, `toggle` and `text` row from `screenOf` over the whole graph and requires that choosing
 * a *different* option produces a *different* intent. A new row filed into the pass-through arm
 * fails there, on the screen it was added to.
 */
export function withChosenValue(intent: MenuIntent, value: string): MenuIntent {
  switch (intent.kind) {
    case 'set-free-play':
      return { ...intent, value };
    case 'set-setting':
      return { ...intent, value };
    case 'set-challenge':
      return { ...intent, value };
    case 'set-commissioning':
      return { ...intent, value };
    // The two whose value field is named after what it is rather than `value`. Spelled out rather
    // than reached through a shared key, because `periodId` and `constraintId` are the ids of two
    // different vocabularies and a generic `value` would have made them look interchangeable.
    case 'set-calendar':
      return { ...intent, periodId: value };
    case 'set-constraint':
      return { ...intent, constraintId: value };
    /*
     * Everything a button presses. None of these is built from a value a player picks, so the
     * chosen string has nowhere to go and the intent travels as it was authored — a `navigate` that
     * quietly acquired the label of whatever row was beside it would be worse than an inert one.
     */
    case 'navigate':
    case 'back':
    case 'reopen':
    case 'close':
    case 'start':
    case 'open-campaign':
    case 'start-endless':
    case 'open-board':
    case 'beat-score':
    case 'account-form':
    case 'account-submit':
    case 'sign-out':
    case 'submit-score':
    case 'run-challenge':
    case 'post-challenge':
    case 'commit-commissioning':
    case 'reset-commissioning':
      return intent;
  }
}

/* -------------------------------------------------------------------------- *
 * Affordances
 * -------------------------------------------------------------------------- */

export type AffordanceKind = 'navigate' | 'select' | 'toggle' | 'text' | 'commit' | 'back';

/** One thing on a screen a player can act on. */
export interface MenuAffordance {
  /** Stable, and unique within a screen. `free-play.building`, `main.campaign`. */
  readonly id: string;
  readonly label: string;
  readonly detail?: string | undefined;
  readonly kind: AffordanceKind;
  /** `docs/16` S1. Required, so a control nobody scoped will not compile. */
  readonly scope: ChangeScope;
  readonly enabled: boolean;
  /**
   * Why it is disabled, when it is.
   *
   * Disabled **and explained**, always. A Start that refuses in silence moves an explainable error
   * to the one moment with no words for it — `menuPanel.ts` has said so since it landed, and this
   * field is that rule made structural rather than remembered.
   */
  readonly disabledWhy?: string | undefined;
  readonly options?: readonly CatalogueEntry[] | undefined;
  readonly value?: string | undefined;
  /**
   * What an empty `text` field should read as. `text` rows only — GitHub issue #111(c).
   *
   * Decided here rather than in the panel for this module's founding reason: *what a blank box means*
   * is a claim about the field, and the two seed fields in this product mean **different** things by
   * blank. The transport's is always showing the seed that is running, so a blank there is a gesture
   * — *draw me another* — and its placeholder says `random`. This one is naming a run that does not
   * exist yet and has no generator to answer with; a placeholder reading `random` here would promise
   * a draw nothing performs. So it states the shape instead.
   */
  readonly placeholder?: string | undefined;
  /**
   * The keyboard a phone should offer a `text` row. `text` rows only.
   *
   * The same class of fact as `type: 'email'` on the account field, and it is here rather than keyed
   * on an id in the panel because `dev/dom.ts`'s rule is that no renderer keys on an id — a panel
   * that wrote `row.id === 'free-play.seed' ? 'numeric' : undefined` would be the first one to.
   */
  readonly inputMode?: 'numeric' | undefined;
  /**
   * The one row this screen recommends — GitHub issue #90, and at most one per screen.
   *
   * ## Why the recommendation is a field here rather than a class over there
   *
   * *Which row a new player should press* is a decision, and a decision written inside a render call
   * needs a document, a canvas and a click to reach — this module's founding argument (§ D214 § 2).
   * A panel that styled `rows[0]` differently would be that decision, taken by an index, and it would
   * go silently wrong the first time a screen grew a row above its recommendation.
   *
   * ## What it may and may not carry — KB-15
   *
   * It earns a **modifier** class, never a replacement one, on `menu-board-you`'s precedent. The
   * recommendation is carried by the row's own words first — the label reads *Start here* — and by
   * the tint second, so a reader on a screen reader, a monochrome display or a photocopy is told the
   * same thing the stylesheet says. A row that were recommended *only* by colour would be the signal
   * KB-15 forbids.
   *
   * `menu/screens.test.ts` asserts at most one per screen, over every screen and every state: two
   * recommendations is no recommendation, which is the defect #90 reports about six equal rows.
   */
  readonly primary?: boolean | undefined;
  readonly intent: MenuIntent;
}

/** One screen, as everything a renderer needs and nothing it could decide with. */
export interface MenuScreenView {
  readonly screen: MenuScreen;
  readonly title: string;
  /** Sentences shown above the rows. Never a refusal — those are {@link issues}. */
  readonly notices: readonly string[];
  /** Everything wrong with the current selection, in words a player can act on. */
  readonly issues: readonly string[];
  readonly rows: readonly MenuAffordance[];
  /**
   * The how-to-play guide, on the root screen and `undefined` on every other.
   *
   * Carried on the view rather than authored in the panel for this module's founding reason: what
   * the product *says it is* is a decision, and a decision written inside a render call needs a
   * document and a click to reach. Here it is a value, so `menu/howToPlay.test.ts` can hold every
   * sentence of it against the configuration it describes — the dispatchers `data/` ships, the
   * axes {@link freePlayBody} offers, and the bars `shift/goals.ts` computes.
   *
   * It is **not** a {@link MenuAffordance}, and that is deliberate rather than an omission. An
   * affordance carries a {@link MenuIntent}, every intent is performed by the shell's switch, and
   * a row whose intent nothing performs is the dead control this directory keeps finding. The
   * guide asks nothing of the shell: the panel discloses it in place.
   */
  readonly guide: MenuGuide | undefined;
}

/** One headed run of paragraphs in {@link MenuGuide}. */
export interface GuideSection {
  readonly heading: string;
  readonly body: readonly string[];
}

/** The whole of the how-to-play guide: the entry a player presses, and what is under it. */
export interface MenuGuide {
  /** The label on the menu entry itself. */
  readonly title: string;
  /** The line under the label, before anything is opened. */
  readonly summary: string;
  readonly sections: readonly GuideSection[];
}

/** What `screenOf` needs from the shell to answer for every screen. */
export interface MenuViewInput {
  readonly state: MenuState;
  readonly catalogue: MenuCatalogue;
  /** Whether somebody is signed in and may post. Decided by `account.ts`, not here. */
  readonly canPost: boolean;
  /** Why posting is refused, when it is — the server's own wording, carried unrewritten. */
  readonly postingRefusal?: string | undefined;
  /** Whether a finished run is on screen at all. */
  readonly hasRun: boolean;
  /**
   * Why the run on screen may not be ranked — `scope/runIdentity.ts`'s reasons, joined.
   *
   * Supplied rather than computed, because deciding it needs a `ViewerState` and the loaded
   * resources, and this module has neither. One derivation, two consumers (`docs/16` S5): the same
   * predicate `provenanceLineOf` asks.
   */
  readonly rankingRefusal?: string | undefined;
  readonly boards?: readonly { readonly configHash: string; readonly entries: number }[] | undefined;
  /**
   * The board a player has opened, or `undefined` when none is — GitHub issue #93.
   *
   * The **page**, not a row and not a list of rows, because the two things this screen has to say
   * about a board are claims about the board: what every row on it ran, and whether the rows agree
   * that they ran it. `boardRun.ts#boardConfigurationOf` decides both, and it cannot be asked from
   * one entry.
   *
   * `dev/menuPanel.ts` already held this — `LeaderboardView.page` has carried it since the board
   * table was drawn — and it reached the panel and stopped. That is why the rows built from it are
   * here rather than there: a per-row control decided inside `boardTable` would be a decision no
   * test can reach without a document, and it would sit outside the honesty sweep, which drives
   * `screenOf` and not the panel.
   */
  readonly boardPage?: BoardPage | undefined;
  /**
   * Everything the challenge screen needs, and **nothing it could decide with**.
   *
   * § D218 § 3 is the rule this shape enforces: *the client never decides which challenge is
   * current*. So there is no clock here, no window arithmetic and no `state` this module computes —
   * `view.state`, `view.opensInMs` and `view.closesInMs` are the server's answers, carried. A
   * countdown built by differencing two clocks would be that decision arriving one subtraction
   * later.
   */
  readonly challenge?: ChallengeScreenInput | undefined;
  /**
   * The fabric screen's state — the choices, the constraint's verdict, and the options each bank
   * may take. Supplied rather than computed: deciding it needs a `BuildingConfig` and the loaded
   * `ElevatorSpecs`, and this module has neither. One derivation, two consumers (`docs/16` S5).
   */
  readonly commissioning?: CommissioningScreenInput | undefined;
  /** Which calendar period is over the week, or `''` for an ordinary one. */
  readonly calendarPeriodId?: string | undefined;
  /**
   * The reader's disclosure level — `mode/types.ts`'s `ViewMode`, taken as a string so this module
   * does not depend on the disclosure layer to draw a menu.
   *
   * Needed for exactly one row, and the reason is `docs/16` S7. `mode/disclosure.ts`'s `BASIC_HIDES`
   * already withholds the energy figures from a Basic reader — a disclosure decision, because R11's
   * axis *may* be shown and is never required to be. So a Basic reader who flipped *Show the energy
   * axis* would see nothing move: a control offered and unable to be honoured, which is the state
   * this whole directory exists to end.
   *
   * S7's answer is that such a control is **not offered**, rather than offered and refused. Defaults
   * to `advanced`, so a caller that does not care gets the whole settings screen.
   */
  readonly viewMode?: 'basic' | 'advanced' | undefined;
  /**
   * Whether this player is signed in and still owes the boards a name — `account.ts#namingStage`.
   *
   * Supplied rather than derived, for the reason every other supplied field here is: deciding it
   * needs an `AccountState`, and this module does not depend on the account layer to draw a menu.
   * `docs/16` S5's one-derivation-two-consumers rule — the panel asks `namingStage` once and both
   * the rows and the form are built from that one answer.
   *
   * § D241 § 7 is why it is a *stage* rather than a mode. There is one door: type an address, get a
   * link. The name is asked for **afterwards**, over a session that already proves the address —
   * asking for it beforehand, only when the address is new, would be the enumeration oracle.
   */
  readonly naming?: boolean | undefined;
  /**
   * Whether this deployment has a server behind it, or `undefined` for *nobody has said*.
   *
   * GitHub issue #28: three of the six root rows are the whole competitive offer, and in a bundle
   * served with no server beside it all three dead-end — *"the main menu gives no hint of this. The
   * rows are styled exactly like the working ones and carry confident subtitles."* The signal has to
   * be on the root, because that is where the player chooses, and the root is the one screen that
   * knows nothing about any of them.
   *
   * **`undefined` makes no claim**, and that is deliberate rather than a default. A menu that
   * asserted *needs a server* on a build that has one would be a worse lie than the silence it
   * replaced, and this module cannot tell: the origin comes from a `<meta>` tag `dev/main.ts` reads
   * at run time (§ D215 § 4, § D243). So the shell says or nothing is said, and the shell saying it
   * is one line — see `dev/menuPanel.ts`'s {@link MenuPanelHost.hasServer}.
   */
  readonly hasServer?: boolean | undefined;
  /**
   * Whether this page loaded with nothing restored — GitHub issues #90 and #98, and `undefined` for
   * *nobody has said*, on {@link MenuViewInput.hasServer}'s precedent.
   *
   * ## Why the shell has to answer it, and why this module could not
   *
   * `persist/types.ts`'s failure union has carried a dedicated `absent` arm since it was written,
   * with a docstring saying why — *"nothing stored yet is an ordinary first visit … collapsing them
   * would tell a first-time player their browser is broken"*. It had exactly two readers and
   * **neither of them is a screen**: `persist/notice.ts#restoreNoticeFor` returns `undefined` for it,
   * and `dev/main.ts` declines to clear the slot. So the product knew it was somebody's first visit,
   * at one instant, and dropped the answer before anything could be drawn differently.
   *
   * This module cannot recover it: deciding it needs a `SessionStore`, and `menu/` does not depend on
   * the persistence layer to draw a menu. `docs/16` S5 — one derivation, two consumers: the shell
   * reads `loadSession` once during boot and hands the same answer here.
   *
   * ## It is a fact about the **load**, not about the store, and the copy says so
   *
   * A first visit stops being one the moment anything is saved, and `saveSessionNow` runs on the
   * first setting a player touches. A flag re-read per draw would therefore make the notice vanish
   * mid-session — the menu changing shape under somebody reading it — so the shell latches it at boot
   * and {@link FIRST_VISIT_NOTE} is worded about what was **restored** rather than about what is
   * stored. A sentence claiming *nothing is saved* would be false one keystroke later; a sentence
   * claiming *nothing was restored when this page loaded* stays true for the life of the page.
   */
  readonly firstVisit?: boolean | undefined;
}

/** What the shell knows about this week's challenge, and how far the player has got with it. */
export interface ChallengeScreenInput {
  /** The server's answer, or `undefined` before it has answered — or when there is no server. */
  readonly view?: ChallengeView | undefined;
  /** Loading, or the server's own refusal, carried unrewritten. */
  readonly notice?: string | undefined;
  /** How many of the challenge's seeds this browser has simulated. Never a fraction of one. */
  readonly runsDone: number;
  /** Why the seed set cannot be posted, when it cannot. `runIdentity`'s idiom, one layer over. */
  readonly postRefusal?: string | undefined;
  readonly board?: ChallengeBoardPage | undefined;
}

/** What the shell knows about the fabric, and what the constraint says about it. */
export interface CommissioningScreenInput {
  readonly buildingName: string;
  readonly constraintId: string;
  readonly choices: CommissioningChoices;
  readonly review: CommissioningReview;
  /** Per bank, what each dimension may be set to. Derived from the loaded specs, never listed. */
  readonly optionsFor: (bankId: string) => {
    readonly shafts: readonly CatalogueEntry[];
    readonly machineClass: readonly CatalogueEntry[];
    readonly ratedSpeed: readonly CatalogueEntry[];
  };
}

/* -------------------------------------------------------------------------- *
 * Titles
 * -------------------------------------------------------------------------- */

export function titleOf(screen: MenuScreen): string {
  switch (screen) {
    case 'main':
      return 'Elevator Sim';
    case 'campaign':
      // The screen's title follows the row that reaches it and the tab it selects. The `campaign`
      // *id* is unchanged, so every deep link, test and `MENU_SCREENS` row still names it.
      return 'Scenarios';
    case 'free-play':
      return 'Free play';
    case 'settings':
      return 'Settings';
    case 'leaderboard':
      return 'Leaderboard';
    case 'challenge':
      return 'This week’s challenge';
    case 'commissioning':
      return 'Commissioning';
    case 'account':
      return 'Account';
  }
}

/* -------------------------------------------------------------------------- *
 * The screens
 * -------------------------------------------------------------------------- */

const BACK: MenuAffordance = Object.freeze({
  id: 'back',
  label: 'Back',
  kind: 'back' as const,
  scope: 'presentation' as const,
  enabled: true,
  intent: { kind: 'back' as const },
});

/**
 * What this screen offers, given the state.
 *
 * Total over {@link MENU_SCREENS} — an exhaustive switch, so a seventh screen is a compile error
 * rather than a screen that silently renders a placeholder. `campaign` **was** that placeholder, and
 * it is `docs/16` § 5 clause 6.
 */
export function screenOf(input: MenuViewInput): MenuScreenView {
  const screen = input.state.screen;
  const view = bodyOf(input, screen);
  return Object.freeze({
    screen,
    title: titleOf(screen),
    notices: view.notices,
    issues: view.issues,
    rows: screen === 'main' ? view.rows : Object.freeze([...view.rows, BACK]),
    /*
     * The root only. A guide repeated under every screen would be six copies of one explanation
     * competing with the screen the player already chose, and the one place a player who does not
     * yet know what any of it means is standing is the screen they land on.
     */
    guide: screen === 'main' ? HOW_TO_PLAY : undefined,
  });
}

interface Body {
  readonly rows: readonly MenuAffordance[];
  readonly notices: readonly string[];
  readonly issues: readonly string[];
}

const empty = { notices: Object.freeze([]), issues: Object.freeze([]) };

function bodyOf(input: MenuViewInput, screen: MenuScreen): Body {
  switch (screen) {
    case 'main':
      return {
        ...empty,
        rows: mainRows(input.hasServer, input.hasRun, input.viewMode ?? 'advanced'),
        // `=== true`, so *nobody has said* is silence rather than a welcome. See
        // {@link MenuViewInput.firstVisit}.
        notices: input.firstVisit === true ? [FIRST_VISIT_NOTE] : empty.notices,
      };
    case 'free-play':
      return freePlayBody(input);
    case 'settings':
      return {
        ...empty,
        rows: settingsRows(input.state.settings, input.viewMode ?? 'advanced'),
        notices: [SETTINGS_NOTE],
      };
    case 'campaign':
      return {
        ...empty,
        rows: campaignRows(input.calendarPeriodId ?? ''),
        notices: [CAMPAIGN_NOTE],
      };
    case 'leaderboard':
      return leaderboardBody(input);
    case 'challenge':
      return challengeBody(input);
    case 'commissioning':
      return commissioningBody(input);
    case 'account':
      return accountBody(input);
  }
}

/* ------------------------------------------------------------------- main */

/**
 * What the three social rows say when there is no server behind them — GitHub issue #28.
 *
 * Appended to the row's own subtitle rather than replacing it, and the rows stay **enabled**. All
 * three screens now teach their subject with the server off — the challenge screen explains what a
 * challenge is and what the same seeds buys, the leaderboard explains what a board is and draws an
 * example of one — so disabling them would hide the only thing they can still do. #28 offers three
 * remedies (hide, disable with the reason, or ship a read-only demo); this is the third with the
 * second's honesty, which is the combination that keeps the teaching and ends the dead end.
 */
const NEEDS_A_SERVER = ' · needs a server, and this one has none';

/**
 * The way out — GitHub issue #40, and the row Escape presses.
 *
 * The root is the one screen with no `back`, so before this it offered six navigations and no exit:
 * a player who pressed **Menu** over a running shift to check a setting had to *start something* to
 * get back to the shift they were already watching. Every other way out of the overlay commits the
 * player to something — Start and Keep going enter a mode, Pick a scenario opens the board they
 * choose one from — which is a complete set of *choices* and an empty set of *changes of mind*.
 *
 * **Disabled and explained when there is nothing behind the menu**, which is `docs/16` S7's rule and
 * not a courtesy: a *Resume* that closed the overlay onto an empty shell would be a button that
 * takes the screen away and gives nothing back. The shell runs a shift on boot, so this is the cold
 * state a `hasRun: false` caller describes rather than a state a player normally reaches — and
 * saying so is cheaper than the one time they do.
 *
 * ## It is **last**, and the docstring that said otherwise is GitHub issue #97's second half
 *
 * This paragraph read *"It is first because it is the only row that does not commit the player to
 * anything, and last is where a reader looks for cancel"* — an argument for both positions, over
 * code that has only ever emitted it last. The refusal below then said *"pick a scenario or a
 * free-play selection **below**"*, and there is nothing below this row: {@link mainRows} ends with
 * it, and the only thing the panel appends after it is the how-to-play disclosure. So a reader who
 * did as they were told looked at the bottom of the screen and found the guide.
 *
 * The word moved rather than the row, and the reason is not taste. The two rows the sentence names
 * — Scenarios and Free play — are the **first two** on the list, so *above* is true of them and
 * *below* was never true of anything. And Resume is disabled on a cold boot, so putting it first
 * would open the product on a greyed control; last is where a reader looks for the way out, which
 * is the half of the old sentence that was always right.
 */
function resumeRow(hasRun: boolean): MenuAffordance {
  return {
    id: 'main.resume',
    label: 'Resume',
    detail: 'Back to the shift on screen — nothing here is changed by leaving',
    kind: 'commit',
    // Closing an overlay moves no leg. `presentation` is the honest scope and it is what lets this
    // row appear under every play mode, which a way out has to.
    scope: 'presentation',
    enabled: hasRun,
    ...(hasRun
      ? {}
      : {
          disabledWhy:
            'There is no shift on screen to go back to yet. Pick a scenario or a free-play ' +
            'selection above and the menu closes onto it.',
        }),
    intent: { kind: 'close' },
  };
}

/**
 * The one sentence a player who has never been here reads first — GitHub issues #90 and #98.
 *
 * ## What it is allowed to claim, and every clause is checked
 *
 * *"Nothing was restored when this page loaded"* is `persist/types.ts`'s `absent` arm in the words a
 * player has, and it is a claim about the **load** rather than about the store — see
 * {@link MenuViewInput.firstVisit} for why that distinction is the difference between a sentence that
 * stays true and one that is false a keystroke later.
 *
 * *"the row above the rest"* and *"How to play, directly under it"* are claims about the **layout**,
 * which is exactly the kind of sentence this repository has shipped stale — `dev/rightRail.ts` spent
 * a wave telling readers to open *Menu → Campaign* after the row had been renamed **Scenarios**. So
 * both are pinned by a test rather than by care: `menu/screens.test.ts` requires the recommended row
 * to be first in `mainRows`, and `dev/menuPanel.test.ts` requires the guide entry to be drawn
 * immediately after it, on the rendered page rather than in an argument.
 *
 * ## What it does not claim
 *
 * **No duration.** #90 proposes *"it takes about 5 minutes"*; nothing here measures how long a player
 * takes, playback speed is a setting, and a shift's drain is an outcome rather than a prediction
 * (`partsOfDay.ts`'s own rule about end times). An invented number would be this repository's
 * most-tracked defect on the one screen a new player trusts most.
 *
 * **No promise about what a scenario or a run will show.** It says where to press and what the guide
 * is for, and stops.
 */
const FIRST_VISIT_NOTE =
  'Nothing was restored when this page loaded, so this is a first run. Start here is the row above ' +
  'the rest, and How to play, directly under it, says what a dispatcher is before anything asks you ' +
  'to pick one.';

/**
 * The recommended path — GitHub issue #90, and **one door per product** ([§ D299](../../../../DECISIONS.md)).
 *
 * ## Why there are two of these rather than one
 *
 * § D299 settled the positioning as *two products over one engine*, so there are two first runs to
 * design and not one. Casual's is the narrative week; Engineer's is the run they set themselves. The
 * row is the same row — same id, same position, same words on the label — and only the destination
 * and the sentence under it differ, because the thing a new player needs is *one* obviously-right
 * press and that is true in both products.
 *
 * ## Why it adds a row and moves none
 *
 * § D299 § 2's constraint is that Casual is *a different door into the same building, not a smaller
 * building* — a first run may **sequence** what a player meets and may not **remove** what they can
 * reach. So Scenarios, Free play, the challenge, the leaderboard, Account and Settings are all still
 * on this screen, in the order they were in, saying what they said. What changed is that one of the
 * six is now also recommended, in words, above them.
 *
 * ## Neither arm invents an intent, and that is deliberate
 *
 * Both dispatch a member the shell's switch already performs. A `start-here` of its own would have
 * been a member nothing handled until somebody wrote an arm — the dead control this package has
 * shipped eleven times — and it would have had to decide *which* scenario or *which* selection, which
 * is § D213's hard-coded list arriving through a new door. `open-campaign` opens the board a player
 * picks from; `navigate` opens the screen a player sets. Neither guesses on their behalf.
 *
 * ## What each arm claims, against what the arm actually does
 *
 * Casual dispatches `open-campaign`, which `dev/main.ts` performs as *select the scenarios tab and
 * close the menu*. It starts **no** week — `campaign.open` says so in its own detail for the same
 * reason (GitHub issue #97, whose whole subject was a row promising a week it never started) — so
 * this sentence says the board opens and the week begins when a scenario is taken.
 *
 * Engineer dispatches `navigate` to `free-play`, and the sentence names what is on that screen: six
 * axes and a Start. Six is `freePlayBody`'s own count — building, dispatcher, traffic shape, arrival
 * rate, part of the day, seed — and it is the same six {@link HOW_TO_PLAY}'s *The six things Free
 * play lets you set* enumerates, asserted against the rows in `menu/screens.test.ts` rather than
 * counted by hand here.
 */
function startHereRow(viewMode: 'basic' | 'advanced'): MenuAffordance {
  const casual = viewMode === 'basic';
  return {
    id: 'main.start-here',
    label: 'Start here',
    detail: casual
      ? 'The one to press if you are new: it opens the scenarios board, and the week begins when ' +
        'you take one.'
      : 'The one to press if you are new: Free play is a single run you set yourself — six axes, ' +
        'then Start.',
    /*
     * `commit` for Casual because it leaves the menu, `navigate` for Engineer because it goes a
     * screen deeper. The kind names what the row *does*, and the two doors genuinely do different
     * things — `campaign.open` carries the same `commit` for the same reason. The recommendation is
     * {@link MenuAffordance.primary} and is carried separately, so the two arms look alike on screen
     * without either lying about what pressing it costs.
     */
    kind: casual ? 'commit' : 'navigate',
    /*
     * Casual's arm enters a mode, so `between-games`; Engineer's only opens a screen, so
     * `presentation`. Scoping both as the stronger of the two would claim this row destroys a day on
     * a build where it does not, and `docs/16` S1 is about the scope being the honest one rather than
     * the safe one.
     */
    scope: casual ? 'between-games' : 'presentation',
    enabled: true,
    primary: true,
    intent: casual ? { kind: 'open-campaign' } : { kind: 'navigate', to: 'free-play' },
  };
}

function mainRows(
  hasServer: boolean | undefined,
  hasRun: boolean,
  viewMode: 'basic' | 'advanced',
): readonly MenuAffordance[] {
  // `undefined` says nothing. See `MenuViewInput.hasServer`: asserting *needs a server* on a build
  // that has one would be a worse claim than the silence it replaces, and this module cannot tell.
  const note = hasServer === false ? NEEDS_A_SERVER : '';
  const to = (
    id: string,
    label: string,
    detail: string,
    target: MenuScreen,
  ): MenuAffordance => ({
    id,
    label,
    detail,
    kind: 'navigate',
    scope: 'presentation',
    enabled: true,
    intent: { kind: 'navigate', to: target },
  });
  const social = (id: string, label: string, detail: string, target: MenuScreen): MenuAffordance =>
    to(id, label, `${detail}${note}`, target);
  return Object.freeze([
    /*
     * **First, and it is the whole of GitHub issue #90.** The six rows below are a complete set of
     * *choices* and were an empty set of *recommendations*: every option looked like the right answer,
     * so none of them was. See {@link startHereRow}.
     */
    startHereRow(viewMode),
    /*
     * **Scenarios**, not *Campaign* — `docs/17` § 5 clause 2's residue, settled by the handoff's own
     * rule rather than by taste.
     *
     * Pressing a word and landing somewhere with a different word on it was the one concrete
     * confusion left after the batch tab became **Lab**. Two names, one destination, and the rule
     * that decides which moves is `docs/12`'s: *the handoff wins every disagreement about what the
     * screen looks like.* It drew the **Scenarios** tab; it drew no menu at all (§ 4.8). So the tab
     * keeps its word and the row — ours entirely — takes it.
     *
     * *Campaign* survives in exactly one place now: the shift layer's own prose, where it means the
     * contract week and nothing competes for it.
     */
    to('main.campaign', 'Scenarios', 'A week on one building — it grows, and the bar rises', 'campaign'),
    to('main.free-play', 'Free play', 'Any building, any dispatcher, any traffic', 'free-play'),
    social(
      'main.challenge',
      'This week’s challenge',
      'Everyone on the same seeds — the dispatcher is what varies',
      'challenge',
    ),
    social('main.leaderboard', 'Leaderboard', 'Verified scores, by configuration', 'leaderboard'),
    // *Sign in to post a score* and no password — the second half is the thing a player decides on,
    // and it is now true (§ D241): an address, a link in the inbox, and nothing to choose or forget.
    social('main.account', 'Account', 'An emailed link, no password — sign in to post a score', 'account'),
    to('main.settings', 'Settings', 'Presentation only — nothing here changes a run', 'settings'),
    resumeRow(hasRun),
  ]);
}

/* ----------------------------------------------------------- how to play */

/**
 * What the game is, before it asks anybody to run it — GitHub issue #13.
 *
 * ## Why it is here and not in a module of its own
 *
 * Because of what `honesty/derive.test.ts` does with a new exported text producer: it derives the
 * set from the source tree and fails on one that is in neither a surface adapter nor a stated
 * exclusion. A `menu/guide.ts` exporting these sentences would be exactly that — a new surface,
 * unchecked, and red. Authored here they travel out through `screenOf`, which the `MENU` adapter
 * already covers, and they are held against the configuration they describe by
 * `menu/howToPlay.test.ts` beside this file.
 *
 * ## The three sentences this copy is not allowed to write, and it does not
 *
 * 1. **No dispatcher is ranked.** CLAUDE.md: *never declare one dispatcher better than another
 *    without a paired-t confidence interval that excludes zero*. So every dispatcher below is
 *    described by **what it does** — which terms it weights, which constraint it holds, where it
 *    parks — and the paragraph that would have said which to pick says instead that one run cannot
 *    answer it and names the surface that can. `nearest-car` is called a baseline because
 *    `data/dispatcher-profiles.json` gives it `role: "baseline"`, and because it sits on the
 *    Pareto front at six of eight matrix cells ([§ D106](../../../../DECISIONS.md)); *baseline* is
 *    a description here, never a verdict.
 * 2. **No unmeasured mechanism.** No sentence explains *why* one configuration performs better
 *    than another, because this repository has measured exactly one such sentence and found it
 *    false — and `packages/experiments/src/validation/documentation.test.ts` is what stops it
 *    coming back. Statements of mechanism below are statements about **what the code does** (a
 *    car does not reverse direction; a term is normalised before it is weighted), never about what
 *    that buys.
 * 3. **No figure is graded.** Energy is an axis and never a score (§ D106), and the withheld mean
 *    is described as the run declining to be summarised rather than as a penalty.
 *
 * Every number quoted below — the goal ceilings, the wake-up threshold, the run lengths, the seed
 * bounds — is asserted against the code that produces it in `howToPlay.test.ts`, because a
 * published number that nothing re-derives is how three of them went stale in this repository
 * already.
 */
const HOW_TO_PLAY: MenuGuide = Object.freeze({
  title: 'How to play',
  /*
   * It says that it opens **in words**, and that is not decoration.
   *
   * The panel draws this entry with the menu's own row card, which sets `display: grid` on the
   * `summary` and therefore takes away the disclosure triangle a browser would otherwise draw. The
   * six rows above it navigate; this one expands. Saying so in the line the reader is already
   * reading is cheaper than a glyph and survives KB-15, which forbids a signal carried by shape or
   * colour alone.
   */
  summary:
    'Opens here, and starts nothing: what the game is, what a shift is, and what each control does.',
  sections: Object.freeze([
    Object.freeze({
      heading: 'What you are actually doing',
      body: Object.freeze([
        'A building has more people wanting to move than it has cars to move them. Every time ' +
          'somebody presses a button at a landing, something has to decide which car goes, and ' +
          'in what order it goes there. That decision is called dispatching, and it is the thing ' +
          'this simulator is about.',
        'You do not drive the cars. You choose the rule that answers the calls, point a stretch ' +
          'of real traffic at it, and read what happened to the people who turned up.',
      ]),
    }),
    Object.freeze({
      heading: 'The three ways in',
      body: Object.freeze([
        'Scenarios is a week on one building. Each day the tenants grow, something is booked ' +
          'against the day, and the bars you are read against harden. A day that meets every bar ' +
          'is a clean shift, and clean shifts bank toward clearing the scenario. Every scenario ' +
          'is open from the start — they teach, they do not gate.',
        'Free play is one run on day one: the building as it ships, with no tenant growth and ' +
          'nothing scheduled against it. You set all six axes yourself, and Start opens a fresh ' +
          'week — no streak, no banked shifts and no history carried in from a scenario. That is ' +
          'also what makes it the run a leaderboard can replay.',
        'This week’s challenge fixes the building, the traffic, the run length and the seeds — ' +
          'the server issues them — and leaves the dispatcher as the one thing that varies. A ' +
          'set is scored over all of its seeds. A partial set is not a smaller score; it is a ' +
          'different question.',
        'Leaderboard, Account and Settings are not modes. A board is one configuration across ' +
          'seeds, ordered on one named metric, so picking a different dispatcher moves you to a ' +
          'different board rather than up an existing one. An account is what lets a score be ' +
          'posted. Settings change how a run is drawn and never what it computes.',
      ]),
    }),
    Object.freeze({
      heading: 'What a shift is',
      body: Object.freeze([
        'A shift is one day in one building. Passengers arrive, cars answer, and the day is read ' +
          'against four goals, all four every day: carry a share of the people who turned up, ' +
          'get a share of riders away inside a minute, hold the deepest landing queue under a ' +
          'number, and keep the worst wait inside a ceiling. The four are in tension — a group ' +
          'that chases the shares cannot also park a car for the landing that stacks, and the ' +
          'worst wait is the bar that slips when you serve the average rider first. That ' +
          'tension is the day’s actual puzzle.',
        'The bars harden as the week goes on, and then they stop. Away-inside-a-minute tops out ' +
          'at 84 %, carried tops out at 96 %, the queue bar bottoms out at 12 people, and the ' +
          'worst-wait ceiling bottoms out at 150 seconds. There is no losing here. There is a ' +
          'line you are trying to bend upward.',
        'Nothing is graded before the building wakes up: under 20 arrivals every goal reads a ' +
          'dash instead of a verdict, because a carried share over three riders is arithmetic ' +
          'rather than competence. Every goal is read from counts — never from an average — so a ' +
          'day cannot be graded on a figure the run itself declines to publish.',
      ]),
    }),
    Object.freeze({
      heading: 'The six things Free play lets you set',
      body: Object.freeze([
        'Building — which tower you are running. Each one ships with its own floors, its ' +
          'population, its banks and the machines in them, and the menu prints those counts ' +
          'beside the name. The building decides how far a car has to travel, how many people it ' +
          'can be asked to carry, and which floors each bank is allowed to serve at all.',
        'Dispatcher — the rule that answers a call, and the axis this whole simulator exists to ' +
          'study. Every one of them is a set of weights rather than a program; the next section ' +
          'takes them one at a time.',
        'Traffic shape — which demand template the run is drawn from. The shipped set is a rise ' +
          'and fall, a lunch two-way peak, an office down peak, a shift change, an evening ' +
          'egress, and a constant ISO load. Each template declares its own period, and each is ' +
          'marked either recommended — its shape supports a confidence interval across ' +
          'replications — or cross-checking, which is there to test a result against a ' +
          'differently shaped day.',
        'The office down peak and the evening egress are the end of a day twice over, and the ' +
          'difference is the leading edge. An office empties on a ramp: the working day ends, the ' +
          'landings fill over a few minutes, and the flow tails off. A venue steps — the doors ' +
          'open and the whole room is waiting at once, which is the case a ballroom or a cinema ' +
          'poses and no other shape here produces.',
        'Arrival rate — how much demand, as a share of the building’s population arriving every ' +
          'five minutes. Left at this building’s own profile it uses whatever the building ' +
          'declares, which is the choice that does not pin a number the reference data is free ' +
          'to change. The ladder spans the shipped buildings’ operating points, so a rate that ' +
          'is comfortable in one building will swamp another — and a run whose queue never ' +
          'settles has its average wait withheld rather than reported.',
        'Part of the day — which stretch of the traffic shape you run, and the same control the ' +
          'campaign uses. A shape that is one period offers that period; the working day offers ' +
          'each of its busy parts and the whole of itself, so the morning rush, the lunch two-way ' +
          'and the evening down-peak are three different problems rather than three lengths of ' +
          'one. Every option says how much demand it schedules and between which clock times.',
        'What no option says is when the run ends. The demand schedule stops at the time on the ' +
          'label and the run keeps going until the building has cleared, which is the part worth ' +
          'watching and is an outcome rather than a prediction — how long a backlog takes to drain ' +
          'is what the dispatcher is being judged on.',
        'Seed — 1 to 20 digits naming the passengers. With the building and the traffic held ' +
          'still, the same seed produces the same arrivals, the same decisions and the same ' +
          'numbers every time. That is what lets a leaderboard verify a posted score by replaying ' +
          'it, and what lets two dispatchers meet identical traffic instead of different luck. A ' +
          'seed names a run rather than measuring one: changing it changes who turns up, not how ' +
          'hard the configuration is.',
      ]),
    }),
    Object.freeze({
      heading: 'The dispatchers, and what each one does',
      body: Object.freeze([
        'A dispatcher here is data rather than code: a set of weights over one shared library of ' +
          'cost terms. A term measures something about sending a particular car — the new ' +
          'passenger’s wait, their ride time, the delay added to the people already aboard, the ' +
          'delay added to other assigned calls, a reversal of direction, how full the car is, ' +
          'stops added, metres travelled, how long the oldest call has stood, how far a car ' +
          'strays from its zone, and the queue already standing at the pickup floor. Every term ' +
          'is normalised to a common scale before it is weighted, so a weight means the same ' +
          'kind of thing wherever it appears.',
        'Three carry the role baseline, which means a reference every study holds fixed. Nearest ' +
          'car weights the metres a car would travel and nothing else. Minimum estimated wait ' +
          'weights the new passenger’s wait and nothing else. Conventional collective weights ' +
          'that same wait and adds the constraint a collective controller actually has: a car ' +
          'does not reverse direction to take a call, it answers in passing.',
        'Conventional collective, en-route pickup is that controller allowed to stop for a ' +
          'landing it passes, carrying a weight that prices what the extra stop costs the people ' +
          'already aboard.',
        'Energy aware spreads its weight across wait, stops added and metres travelled, holds ' +
          'doors adaptively, and leaves an idle car where it stands. Fairness first splits its ' +
          'weight between wait and the longest-standing call, and keeps a call reassignable for ' +
          'as long as it can. Capacity aware weights how full the car is and how many people are ' +
          'already waiting at the floor, and splits a heavy landing across two cars rather than ' +
          'serving it twice with one.',
        'Predictive balanced carries ten weighted terms at once, waits a moment before committing ' +
          'each assignment, and parks idle cars where it forecasts the next calls.',
        'Contract-net auction, sealed bid and Contract-net auction, multi-round let every car ' +
          'price the call from its own estimate and let the group allocate from the bids. The ' +
          'sealed-bid arm runs a single round; the multi-round arm runs three and lets a ' +
          'provisional winner hand the contract back on its own reserve price.',
        'Operational zoning, up-peak splits the bank into one contiguous band per in-service car, ' +
          'prices how far a car strays from its band, and parks each car in the middle of its own.',
        'Destination disclosure, credential-aware and Destination dispatch, landing panel both ' +
          'know where the passenger is going before the car is chosen rather than after. The ' +
          'first discloses the destination to the dispatcher and leaves boarding alone; the ' +
          'second assigns the passenger to a named car at the landing.',
        'Which one to run is not a question this screen answers, and it is not a question one run ' +
          'answers either. Saying that one dispatcher beat another needs the same passengers fed ' +
          'to both, 50 to 200 times over, and a paired interval that excludes zero — the Compare ' +
          'tab is the one surface in this product allowed to say it. Nothing is hidden from you ' +
          'for scoring badly: a profile that does not beat a baseline is a result about that ' +
          'profile, and finding that out is what Free play is for.',
      ]),
    }),
    Object.freeze({
      heading: 'What the numbers will and will not say',
      body: Object.freeze([
        /*
         * Three states, because § D223 made it three the day before this landed. Saying *two* here
         * would have been the shape of staleness this whole section is written against, so the
         * pair of titles is pinned to `dev/reportPanel.ts` in `howToPlay.test.ts`.
         */
        'The Day report is a statement about a whole day, so it waits for one. Before anything has ' +
          'run it says nothing has been filed. While the playhead is short of the end of the run ' +
          'it says the day is still running and names the clock time you are watching, because a ' +
          'finished day’s figures beside a clock reading half past nine would be two answers to ' +
          'one question. Play the day through and the sheet fills in. The surface that reads a ' +
          'shift while it runs is the left rail.',
        'Average wait is withheld rather than printed whenever the run cannot support one, on ' +
          'five grounds: an empty measurement window, a queue still growing when the run ends, ' +
          'too many arrivals never served, a wait past the 15-minute abandonment horizon, and ' +
          'more than 2 % of riders giving up. The reason is printed where the figure would have ' +
          'been. A withheld mean is the run declining to be summarised by one number — not a ' +
          'fault, and not a low score.',
        'Energy sits beside the wait figures and is never folded into them. A dispatcher that ' +
          'drives less carries fewer people, so a configuration that spends less by serving ' +
          'fewer people has not saved anything; the work per served leg is printed next to the ' +
          'raw figure for that reason.',
        'Riders who give up, and riders who take the stairs, are published beside the average ' +
          'wait rather than inside it. They are the longest waits in the sample, so dropping ' +
          'them moves the average down by construction.',
      ]),
    }),
    Object.freeze({
      heading: 'A first run',
      body: Object.freeze([
        'If you would rather not choose, Start here is the first row on the menu and it is this ' +
          'paragraph as a button: it opens the scenarios board in Casual and Free play in Engineer, ' +
          'which are the two shortest routes to watching one.',
        /*
         * **The number here is pinned and was right; the control it named was not.**
         *
         * It read *"…and the run to 30 minutes"*. The *thirty* is derived and asserted —
         * `howToPlay.test.ts § recommends a first run the menu would actually let you start` resolves
         * the shortest part the default traffic shape offers and requires this sentence to name its
         * length in minutes, so the figure moves when `data/` does. Checking that assumption is what
         * stopped this paragraph being rewritten around a staleness it did not have.
         *
         * What was stale is the **control**. § D286 deleted the run-length ladder and replaced it
         * with *Part of the day*, so *"set the run to"* named a control that has not existed since
         * issue #81 — the reader still met the number, in the option's own detail line
         * (`partsOfDay.ts#detailOf` writes `30 min of demand — 08:30 to 09:00, then however long it
         * takes to clear`), but had to work out which box it was in. So the control is named, the
         * pinned figure is kept, and the tail is described the way `detailOf` describes it rather
         * than as an end time this module is not allowed to predict.
         */
        'Open Free play and set the building to Garden Apartments and the dispatcher to ' +
          'Conventional collective. Leave the arrival rate on this building’s own profile, and ' +
          'leave Part of the day on the option it opens with — the shortest the traffic shape ' +
          'offers, 30 minutes of demand and then however long the building takes to clear. Watch ' +
          'one call appear at a landing, one car answer it, and one wait end — those three things ' +
          'are what every dispatcher here is made of.',
        'Then move one axis and run it again, keeping the seed. With the building and the traffic ' +
          'held still the same seed brings the same passengers, so what moved in the numbers is ' +
          'what you moved. That is how the feel of it is learned. It is not how a difference is ' +
          'demonstrated, which is the Compare tab’s job and takes a great many more runs.',
      ]),
    }),
  ]),
});

/* -------------------------------------------------------------- free play */

const RATE_OPTIONS: readonly CatalogueEntry[] = Object.freeze(
  FREE_PLAY_RATES.map((rate) => ({
    id: String(rate),
    name: rate === null ? 'This building’s own profile' : `${String(rate)} % of population / 5 min`,
  })),
);

/**
 * The parts of the selected template's period, as menu rows. § D286.
 *
 * Derived per render from the catalogue rather than held in a module constant, because the option
 * list depends on *which template is selected* — a `lunch-two-way` has no morning in it — and a
 * constant could not. That dependency is the whole reason this replaced a fixed ladder: a length
 * was offered identically under every template and meant something different under each.
 */
function partOptions(catalogue: MenuCatalogue, demandTemplateId: string): readonly CatalogueEntry[] {
  return Object.freeze(
    partsFor(catalogue, demandTemplateId).map((part) => ({
      id: part.id,
      name: part.label,
      // The sentence issue #80 asked for: what is simulated, and that the tail is a tail. No end
      // time — the drain is an outcome of the run, not a prediction the menu may make.
      detail: part.detail,
    })),
  );
}

function freePlayBody(input: MenuViewInput): Body {
  const selection = input.state.freePlay;
  const issues = freePlayIssues(selection, input.catalogue);
  const ready = canStart(selection, input.catalogue);

  const select = (
    id: string,
    label: string,
    field: keyof FreePlaySelection,
    value: string,
    options: readonly CatalogueEntry[],
  ): MenuAffordance => ({
    id,
    label,
    kind: 'select',
    // Every Free Play axis is the run's own identity: fixed when a game starts, hashed into the
    // board a score belongs to. `docs/16` § 3.
    scope: 'between-games',
    enabled: true,
    options,
    value,
    intent: { kind: 'set-free-play', field, value },
  });

  const rows: MenuAffordance[] = [
    select('free-play.building', 'Building', 'buildingId', selection.buildingId, input.catalogue.buildings),
    select(
      'free-play.dispatcher',
      'Dispatcher',
      'dispatcherProfileId',
      selection.dispatcherProfileId,
      input.catalogue.dispatchers,
    ),
    select(
      'free-play.template',
      'Traffic shape',
      'demandTemplateId',
      selection.demandTemplateId,
      input.catalogue.demandTemplates,
    ),
    select(
      'free-play.rate',
      'Arrival rate',
      'arrivalRatePctPop5min',
      String(selection.arrivalRatePctPop5min),
      RATE_OPTIONS,
    ),
    select(
      'free-play.part',
      // One name, in both modes. The campaign called this *shift length* and offered four narrative
      // options; Free play called it *Run length* and offered five numeric ones; they wrote the same
      // field (issue #82). This is that control, named for what it actually chooses.
      'Part of the day',
      'windowStartS',
      partIdOf(selection.windowStartS, selection.durationS),
      partOptions(input.catalogue, selection.demandTemplateId),
    ),
    {
      id: 'free-play.seed',
      label: 'Seed',
      /*
       * **Said before it is broken, not after** — GitHub issue #111(c).
       *
       * The rule reached the screen only as a refusal: type a letter, lose Start, and read *"A seed
       * is 1–20 digits"* in the issue list. A player who has not typed anything wrong has been told
       * nothing, and a player who has is being taught the rule by breaking it. The line is short
       * enough to sit under the box permanently, so the refusal is a reminder rather than a lesson.
       *
       * The second sentence is the one that says what the field is *for*, and it is the same claim
       * `HOW_TO_PLAY`'s *A first run* makes: with the building and the traffic held still, the same
       * seed brings the same passengers. That is invariant 5 in the words a player has.
       */
      detail:
        `Digits only, up to ${String(SEED_MAX_DIGITS)}. It names the run rather than measuring it — ` +
        'the same seed brings the same passengers.',
      kind: 'text',
      scope: 'between-games',
      enabled: true,
      value: selection.seed,
      // Not `random`. The transport's field says that and can honour it; this one has no generator
      // behind it, and a placeholder promising a draw nothing performs is the inert control with its
      // polarity reversed. See {@link MenuAffordance.placeholder}.
      placeholder: `1–${String(SEED_MAX_DIGITS)} digits`,
      inputMode: 'numeric',
      intent: { kind: 'set-free-play', field: 'seed', value: selection.seed },
    },
    {
      id: 'free-play.start',
      label: 'Start',
      kind: 'commit',
      scope: 'between-games',
      enabled: ready,
      ...(ready ? {} : { disabledWhy: issues.map((issue) => issue.message).join(' ') }),
      intent: { kind: 'start' },
    },
  ];

  return {
    rows: Object.freeze(rows),
    notices: Object.freeze([FREE_PLAY_NOTE]),
    issues: Object.freeze(issues.map((issue) => issue.message)),
  };
}

/**
 * Said on the screen rather than only in a decision.
 *
 * Free play is one run. It has no week, so it has no growth and no scheduled event — and before
 * `docs/16` § 5 clause 3 was fixed it silently had both, on whatever day the campaign happened to
 * be sitting on. A sentence that describes what the run is costs nothing and is the difference
 * between a player who trusts the figure and one who should not have.
 */
const FREE_PLAY_NOTE =
  'One run, on day one: the building as it ships, with no tenant growth and nothing scheduled ' +
  'against it. That is what makes it the run a leaderboard can replay.';

/* ---------------------------------------------------------------- settings */

const SETTINGS_NOTE =
  'These change how the simulation is drawn, never what it computes — so they cannot move a score ' +
  'or make two runs incomparable.';

function settingsRows(settings: Settings, viewMode: 'basic' | 'advanced'): readonly MenuAffordance[] {
  const toggle = (id: string, label: string, field: keyof Settings, value: boolean): MenuAffordance => ({
    id,
    label,
    kind: 'toggle',
    scope: 'presentation',
    enabled: true,
    value: value ? 'on' : 'off',
    // The value carried is the one a press would produce, so a walk can press it without knowing
    // that a toggle inverts.
    intent: { kind: 'set-setting', field, value: value ? 'off' : 'on' },
  });
  return Object.freeze([
    toggle('settings.reduce-motion', 'Reduce motion', 'reduceMotion', settings.reduceMotion),
    /*
     * Absent in Basic — S7, and see {@link MenuViewInput.viewMode}. Basic withholds the energy
     * figures already, so this row could not be honoured there, and a control that cannot be
     * honoured is not offered.
     */
    ...(viewMode === 'basic'
      ? []
      : [toggle('settings.energy-axis', 'Show the energy axis', 'showEnergyAxis', settings.showEnergyAxis)]),
    {
      id: 'settings.playback-speed',
      label: 'Playback speed',
      kind: 'select',
      scope: 'presentation',
      enabled: true,
      value: String(settings.playbackSpeed),
      options: PLAYBACK_SPEEDS.map((speed) => ({ id: String(speed), name: `${String(speed)}×` })),
      intent: { kind: 'set-setting', field: 'playbackSpeed', value: String(settings.playbackSpeed) },
    },
    {
      id: 'settings.theme',
      label: 'Theme',
      kind: 'select',
      scope: 'presentation',
      enabled: true,
      value: settings.theme,
      options: (['system', 'dark', 'light'] as const).map((id) => ({ id, name: id })),
      intent: { kind: 'set-setting', field: 'theme', value: settings.theme },
    },
  ]);
}

/* ---------------------------------------------------------------- campaign */

/**
 * The campaign screen's own words, and the disambiguation they exist to make.
 *
 * `docs/16` § 5 clause 6: this screen rendered a placeholder reading *"the campaign surface is open
 * behind this menu"*, and the row that reached it called `closeMenu()` and selected nothing. Two
 * unrelated surfaces are also called Campaign — the contract week in `shift/` and the batch-judged
 * stages in `campaign/` — so the screen says which one this is instead of leaving a player to find
 * out by pressing it.
 */
const CAMPAIGN_NOTE =
  'A week on one building: each day the tenants grow, something is booked against you, and the ' +
  'bars rise. Clean shifts bank toward clearing the scenario. The Lab tab is a different thing — ' +
  'it judges a dispatcher over a batch of replications rather than over a day.';

/*
 * The note stays even though the row and the tab now share a word, because it disambiguates the
 * thing that is still ambiguous: **Lab** is a different mode with a different verb, and a reader
 * needs telling once. What it no longer has to explain is which Campaign this is.
 */

/**
 * The periods, plus *an ordinary week*.
 *
 * Derived from `CALENDAR_PERIODS` rather than listed — § D213's rule — so a sixth period is on the
 * menu the day it lands rather than the day somebody remembers this file. The empty id is the
 * no-period selection and is offered **first**, because it is what the week is unless somebody
 * chooses otherwise.
 */
const CALENDAR_OPTIONS: readonly CatalogueEntry[] = Object.freeze([
  { id: '', name: 'An ordinary week' },
  ...CALENDAR_PERIOD_IDS.map((id) => ({
    id,
    name: CALENDAR_PERIODS[id].name,
    detail: CALENDAR_PERIODS[id].note,
  })),
]);

function campaignRows(calendarPeriodId: string): readonly MenuAffordance[] {
  return Object.freeze([
    {
      /*
       * **The label names what the arm does, which is open a screen** — GitHub issue #97.
       *
       * It read *"Open the doors — Take the current scenario and start the week"*, and
       * `dev/main.ts`'s `open-campaign` arm sets `tab: 'scenarios'` and closes the menu. No week is
       * started, nothing is taken, and there is no *current scenario* in `ViewerState` for it to
       * take: a scenario becomes current by being pressed on the Scenarios surface, which is where
       * `scenariosPanel.ts#take` restarts the week.
       *
       * The **copy** moved rather than the behaviour, and the choice is forced rather than
       * preferred. Making the row start a week would need it to decide *which* scenario, on a screen
       * that offers no scenario control — so the row would either invent a default (a sixth
       * hard-coded list, § D213) or start whichever week the shell happened to be sitting on, which
       * is the *"dropped the player on whatever tab the shell happened to be on"* defect § 5 clause
       * 6 already fixed here once, wearing a different hat.
       *
       * `kind` stays `commit` because it is still the row that leaves the menu, and `Keep going`
       * below it — which really does start something — keeps its own words.
       */
      id: 'campaign.open',
      label: 'Pick a scenario',
      detail: 'Opens the Scenarios board behind this menu — the week starts when you take one',
      kind: 'commit',
      scope: 'between-games',
      enabled: true,
      intent: { kind: 'open-campaign' },
    },
    {
      id: 'campaign.calendar',
      label: 'Calendar',
      detail: 'A season over the week — it changes who is in the building, not how you are judged',
      kind: 'select',
      /*
       * `between-games`. A period holds across a stretch of days and sets the premise the days
       * already closed were judged against, so moving it mid-week would rewrite what those days
       * meant — which is the difference between a different *game* and a different *day*.
       */
      scope: 'between-games',
      enabled: true,
      value: calendarPeriodId,
      options: CALENDAR_OPTIONS,
      intent: { kind: 'set-calendar', periodId: calendarPeriodId },
    },
    {
      id: 'campaign.commissioning',
      label: 'Commission the building',
      detail: 'Choose the shafts, the machines and their speeds — then live with them',
      kind: 'navigate',
      scope: 'presentation',
      enabled: true,
      intent: { kind: 'navigate', to: 'commissioning' },
    },
    {
      id: 'campaign.endless',
      label: 'Keep going',
      detail: 'The same week with no assignment: it grows, nothing is banked, nothing clears',
      kind: 'commit',
      /*
       * `between-games`, because it starts one. It sits on this screen rather than on `main` because
       * it is the contract week minus its contract, and offering it as a peer of Campaign would put
       * two rows on the root that differ in one field a player cannot see from there.
       */
      scope: 'between-games',
      enabled: true,
      intent: { kind: 'start-endless' },
    },
  ]);
}

/* --------------------------------------------------------------- challenge */

/**
 * This week's challenge — the surface that makes the leaderboard's competitive axis the dispatcher.
 *
 * ## What this screen is allowed to say, and what it may not
 *
 * `docs/10` § 5.5 bans *"a leaderboard ranking dispatchers from single runs"*, and this screen
 * points straight at that ban: the whole design is that the dispatcher varies. § D218's answer is
 * that a challenge is scored over a **seed set** with its `n` shown, and that Compare remains the
 * only surface allowed to say one dispatcher beat another. Both halves arrive from the server in the
 * response body — `note` and `compare` — rather than being something this module is trusted to
 * remember, and they are rendered rather than paraphrased.
 *
 * ## The window is drawn and never computed
 *
 * § D218 § 3. Every sentence about when the challenge opens and closes comes from `view.state`,
 * `view.opensInMs`, `view.closesInMs` and `view.clockNote`, all of which the server measured on its
 * own clock. This module has no `Date`, and the shape it is handed gives it nothing to make one out
 * of — which is the point: a client that worked out which challenge was current would be a second
 * answer to a question the server has already answered.
 */
function challengeBody(input: MenuViewInput): Body {
  const challenge = input.challenge;
  const view = challenge?.view;

  if (view === undefined) {
    /*
     * No server, or no answer yet. A row is still offered — `docs/16` § 5 clause 6 is a screen that
     * offered nothing but Back — and it is the one row that is always honest here: go and read the
     * boards that do exist.
     */
    return {
      rows: Object.freeze([
        {
          id: 'challenge.leaderboard',
          /*
           * The subtitle no longer presupposes its own distinction — GitHub issue #32: *"a sentence
           * that presupposes the reader already understands a distinction between challenge boards
           * and non-challenge boards that has never been introduced."* It now says what is through
           * the door rather than what is not.
           */
          label: 'Open the leaderboard',
          detail: 'What a posted run looks like, and what orders one board against another',
          kind: 'navigate' as const,
          scope: 'presentation' as const,
          enabled: true,
          intent: { kind: 'navigate' as const, to: 'leaderboard' as const },
        },
      ]),
      /*
       * The shell's sentence, carried. It is the shell's rather than this module's because *which*
       * challenge is current is the server's answer (§ D218 § 3) and *whether there is a server at
       * all* is read from a `<meta>` tag at run time — neither is knowable here. The fallback below
       * is for a caller that supplied a challenge input and no words, and it answers issue #32's
       * four server-independent questions rather than apologising: what is scored, what the same
       * seeds buys, when a week ends, and how a set is submitted.
       */
      notices: Object.freeze([challenge?.notice ?? CHALLENGE_WITHOUT_ONE]),
      issues: Object.freeze([]),
    };
  }

  const seeds = view.seedCount;
  const ran = challenge?.runsDone ?? 0;
  const complete = ran >= seeds;
  const open = view.state === 'open';

  const rows: MenuAffordance[] = [
    {
      id: 'challenge.dispatcher',
      label: 'Dispatcher',
      /*
       * The only axis, and it is `between-games` for the same reason every Free Play axis is: it is
       * the run's identity, fixed when the attempt starts and hashed into what the score is a score
       * of. Changing it after running the seeds does not adjust a figure — it means the runs on this
       * browser are of a different configuration, which is why picking one resets the count.
       */
      kind: 'select',
      scope: 'between-games',
      enabled: true,
      options: input.catalogue.dispatchers,
      value: input.state.challenge.dispatcherProfileId,
      intent: {
        kind: 'set-challenge',
        field: 'dispatcherProfileId',
        value: input.state.challenge.dispatcherProfileId,
      },
    },
    {
      id: 'challenge.run',
      label: `Run all ${String(seeds)} seeds`,
      detail:
        ran === 0
          ? 'The same passengers everybody else gets'
          : `${String(ran)} of ${String(seeds)} run on this browser`,
      kind: 'commit',
      scope: 'between-games',
      enabled: true,
      intent: { kind: 'run-challenge' },
    },
    {
      id: 'challenge.post',
      label: 'Post the set',
      kind: 'commit',
      scope: 'between-games',
      enabled: open && complete && input.canPost && challenge?.postRefusal === undefined,
      ...postRefusalFor(input, view, ran, seeds),
      intent: { kind: 'post-challenge' },
    },
    {
      id: 'challenge.metric',
      label: 'Order the board on',
      // Presentation: it re-orders rows that are already published and changes no figure on any of
      // them. § D106 — the four metrics sit beside one another and are never combined.
      kind: 'select',
      scope: 'presentation',
      enabled: true,
      options: BOARD_METRIC_OPTIONS,
      value: input.state.challenge.metric,
      intent: { kind: 'set-challenge', field: 'metric', value: input.state.challenge.metric },
    },
  ];

  /*
   * The board's honesty obligations, carried from the body rather than composed here. `note` is
   * § D218 § 5 clause 2 — the count each row was computed over, the four metrics never blended, and
   * the statement that an order here is a fact about submissions. `compare.note` is clause 5.
   */
  const board = challenge?.board;
  const notices = [
    view.challenge.brief,
    windowLineFor(view),
    view.clockNote,
    ...(board === undefined ? [] : [board.note]),
    ...(board?.otherDataNote === undefined ? [] : [board.otherDataNote]),
    view.compare.note,
  ];

  return {
    rows: Object.freeze(rows),
    notices: Object.freeze(notices),
    issues: Object.freeze(challenge?.notice === undefined ? [] : [challenge.notice]),
  };
}

/**
 * What a challenge is, for a screen that has none — GitHub issue #32's four other questions.
 *
 * *"Four of them have nothing to do with the missing server. What the scoring metric is, what
 * 'everyone on the same seeds' means, how long a challenge week runs, and how a finished run gets
 * submitted are all properties of the game design, not of this week's data."* So they are answered
 * here, where the answer does not depend on anything being fetched.
 *
 * The comparability claim is the one to keep honest. Common random numbers make two runs comparable
 * **as runs**; they do not license the sentence *this dispatcher is better*, which needs 50–200
 * replications and a paired interval that excludes zero. Compare is the only surface allowed to say
 * it, and this paragraph says so rather than implying otherwise by omission.
 */
const CHALLENGE_WITHOUT_ONE =
  'There is no challenge loaded. Here is what one is. Everybody gets the same building, the same ' +
  'run length and the same numbered seeds — a seed generates the same passengers arriving at the ' +
  'same moments, so the only thing that differs between two players is the dispatcher they chose. ' +
  'A set is scored over all of its seeds rather than a lucky single run, and it is submitted whole ' +
  'or not at all: a partial set is a different question, not a smaller score. A challenge opens ' +
  'and closes on the server’s clock, and its board stays readable afterwards. Ordering that board ' +
  'on one metric is a fact about what was posted and never a claim that one dispatcher beats ' +
  'another — Compare is the only screen allowed to say that, and only with an interval that ' +
  'excludes zero.';

/**
 * The four the server declares, and no fifth.
 *
 * Written out because they are a **wire vocabulary** rather than a catalogue: `/api/challenge-board`
 * 400s `no-such-metric` on anything else, so a fifth invented here would be a control that always
 * fails. The names are the player's, the ids are the server's.
 */
const BOARD_METRIC_OPTIONS: readonly CatalogueEntry[] = Object.freeze([
  { id: 'awtS', name: 'Average wait' },
  { id: 'wt95S', name: '95th-percentile wait' },
  { id: 'ttdMeanS', name: 'Mean time to destination' },
  { id: 'pctOverLongWait', name: 'Share waiting over a minute' },
]);

/**
 * When the window opens or closes, in the server's own measurement of *how long from now*.
 *
 * Rounded to whole hours and never to a date. A date would be rendered in the reader's timezone from
 * a timestamp, which is the client doing clock arithmetic about a window it does not own — and a
 * player two timezones away would read a different sentence about the same instant.
 */
function windowLineFor(view: ChallengeView): string {
  const hours = (ms: number): string => {
    const whole = Math.max(0, Math.round(ms / 3_600_000));
    return whole === 1 ? '1 hour' : `${String(whole)} hours`;
  };
  switch (view.state) {
    case 'open':
      return view.closesInMs === null
        ? 'Open now.'
        : `Open now — about ${hours(view.closesInMs)} left to post.`;
    case 'upcoming':
      return view.opensInMs === null
        ? 'Not open yet.'
        : `Opens in about ${hours(view.opensInMs)}. You can run it now; you cannot post it yet.`;
    case 'closed':
      return 'Closed. The board stays readable, and nothing further can be posted to it.';
  }
}

/**
 * Why the set cannot be posted — one reason at a time, in the order a player would hit them.
 *
 * Four distinct refusals and never a collapsed one. *Nobody is signed in* is about the player;
 * *the window is shut* is about the challenge; *you have run three of five* is about this browser;
 * and the server's own refusal is about the submission. Showing one sentence for all four would tell
 * a signed-in player to sign in, which is the failure `leaderboardBody` already argues about.
 */
function postRefusalFor(
  input: MenuViewInput,
  view: ChallengeView,
  ran: number,
  seeds: number,
): { readonly disabledWhy?: string } {
  const supplied = input.challenge?.postRefusal;
  if (supplied !== undefined) return { disabledWhy: supplied };
  if (view.state !== 'open') return { disabledWhy: windowLineFor(view) };
  if (ran < seeds) {
    return {
      disabledWhy:
        `A challenge is scored over all ${String(seeds)} seeds, and this browser has run ` +
        `${String(ran)}. Run the set — a partial one is not a smaller score, it is a different ` +
        'question.',
    };
  }
  if (!input.canPost) return { disabledWhy: input.postingRefusal ?? 'Sign in to post a score.' };
  return {};
}

/* ---------------------------------------------------------------- commissioning */

/**
 * The pre-week design phase — `docs/17` § 4.4.
 *
 * ## What this screen is, and the one thing it is careful about
 *
 * Three dimensions per bank: shafts, machine class, rated speed. All `between-games`, and
 * `scope/permits.ts` forbids `within-day` for this mode outright, with the reason that a
 * commissioning screen letting a player move a dispatcher weight would be the shift week with a
 * different title.
 *
 * **The capital figure is a limit and never a metric.** `docs/10` § 5.5 bans grade letters,
 * efficiency scores and energy scores; it does not ban a budget you build against. The distinction
 * matters because the failure mode is a currency that quietly becomes a score — and it would be a
 * bad one, in the § D106 way: the cheapest building is the one with the fewest shafts, so a capital
 * score would rank the towers that serve fewest people highest. So the number appears in exactly
 * one sentence, the constraint's own, and it never travels to a report — `commissioning/`'s own
 * suite asserts that four ways, including an import scan denying this module's own reporting layer.
 *
 * Refusals go **beside the control**, which is why the input carries `refusalsBeside` rather than a
 * flat list: a sentence about `main`'s machine class shown under `service`'s speed is a sentence a
 * player cannot act on.
 */
function commissioningBody(input: MenuViewInput): Body {
  const state = input.commissioning;
  if (state === undefined) {
    return {
      rows: Object.freeze([
        {
          id: 'commissioning.back-to-campaign',
          label: 'Open the scenarios',
          kind: 'navigate' as const,
          scope: 'presentation' as const,
          enabled: true,
          intent: { kind: 'navigate' as const, to: 'campaign' as const },
        },
      ]),
      notices: Object.freeze(['There is no building loaded to commission yet.']),
      issues: Object.freeze([]),
    };
  }

  const rows: MenuAffordance[] = [
    {
      id: 'commissioning.constraint',
      label: 'Under',
      detail: constraintById(state.constraintId)?.note ?? '',
      kind: 'select',
      scope: 'between-games',
      enabled: true,
      value: state.constraintId,
      options: CONSTRAINTS.map((entry) => ({ id: entry.id, name: entry.label, detail: entry.note })),
      intent: { kind: 'set-constraint', constraintId: state.constraintId },
    },
  ];

  for (const choice of state.choices) {
    const options = state.optionsFor(choice.bankId);
    const dimension = (
      id: 'shafts' | 'machineClass' | 'ratedSpeed',
      label: string,
      value: string,
      list: readonly CatalogueEntry[],
    ): MenuAffordance => {
      // The refusal site *is* the dimension — `RefusalSite` is `CommissioningDimension | 'constraint'`.
      // Naming a second vocabulary here would be a second place a dimension has to be spelled.
      const refusals = refusalsBeside(state.review, choice.bankId, id);
      const enabled = refusals.length === 0;
      return {
        id: `commissioning.${choice.bankId}.${id}`,
        label: `${choice.bankId} — ${label}`,
        kind: 'select',
        scope: 'between-games',
        enabled,
        ...(enabled ? {} : { disabledWhy: refusals.map((refusal) => refusal.message).join(' ') }),
        value,
        options: list,
        intent: { kind: 'set-commissioning', bankId: choice.bankId, dimension: id, value },
      };
    };
    rows.push(dimension('shafts', DIMENSION_LABELS.shafts, String(choice.shafts), options.shafts));
    rows.push(
      dimension('machineClass', DIMENSION_LABELS.machineClass, choice.machineClassId, options.machineClass),
    );
    rows.push(
      dimension('ratedSpeed', DIMENSION_LABELS.ratedSpeed, String(choice.ratedSpeedMps), options.ratedSpeed),
    );
  }

  /*
   * The whole-configuration refusals — the ones with no bank to sit beside. They are `issues`
   * rather than a disabled row's `disabledWhy` for the reason `freePlayIssues` is: a refusal about
   * the configuration is not about any one control, and attaching it to one would send a player to
   * change the axis that was already right.
   */
  const whole = state.review.refusals
    .filter((refusal) => refusal.bankId === null)
    .map((refusal) => refusal.message);

  /*
   * **The two verbs the screen did not have** — issue #48.
   *
   * Every dropdown above already wrote `ViewerState.commissioning` on the pick (§ D248), so the
   * fabric was live and the screen still had no way to say *I am done* or *put it back*. Commit
   * last, cancel above it: the order is *the thing you came to do, then the way out of it*, which
   * is the order every other screen in this file puts its commit in.
   */
  const moved = state.review.moved.length > 0;
  rows.push({
    id: 'commissioning.reset',
    label: 'Put it back as built',
    detail: moved
      ? `Undo all ${String(state.review.moved.length)} ${
          state.review.moved.length === 1 ? 'change' : 'changes'
        } and return to the building as it stands.`
      : 'The fabric is what the building already has.',
    kind: 'commit',
    scope: 'between-games',
    // Offered only when something has moved. A cancel that is always available on a screen where
    // nothing has changed is a control whose press changes nothing — `docs/16` S7.
    enabled: moved,
    ...(moved
      ? {}
      : { disabledWhy: 'Nothing has been changed yet, so there is nothing to put back.' }),
    intent: { kind: 'reset-commissioning' },
  });
  rows.push({
    id: 'commissioning.commit',
    label: 'Commission it',
    detail: 'Take this fabric into the week. Nothing here moves again once the doors do.',
    kind: 'commit',
    scope: 'between-games',
    enabled: state.review.admissible,
    /*
     * The refusal beside the **verb**, and it is a different sentence from the ones beside the
     * controls. Each select's own `disabledWhy` says what is wrong with that dimension; this says
     * why the configuration as a whole may not open a week, which is a claim no single select can
     * make. `refusals` is the review's, joined and not rewritten — a refusal is pinned by the run
     * that produced it, never by a second sentence about it.
     */
    ...(state.review.admissible
      ? {}
      : {
          disabledWhy: state.review.refusals.map((refusal) => refusal.message).join(' '),
        }),
    intent: { kind: 'commit-commissioning' },
  });

  return {
    rows: Object.freeze(rows),
    notices: Object.freeze([
      // The brief first: *what am I choosing* before *what the number is not*. A player who does
      // not yet know what a machine class is cannot act on a sentence about capital units.
      COMMISSIONING_BRIEF,
      COMMISSIONING_NOTE,
      state.buildingName,
      state.review.sentence,
      ...previewLines(state.review),
    ]),
    issues: Object.freeze(whole),
  };
}

/**
 * What this configuration would be, before it is committed — issue #48's preview.
 *
 * ## Every word of it is `commissioning/`'s own
 *
 * `CommissioningReview.moved` is the diff `movedChoices` computed, and `movedChoiceText` is the
 * sentence that module already writes for one moved dimension. Nothing is re-derived here: a
 * preview that recomputed *what changed* would be a second answer to a question `refusals.ts` has
 * already answered, and the two would disagree on the day a fourth dimension lands.
 *
 * ## What it may not say, and does not
 *
 * **What the change will buy.** Every line is a statement of *what the hardware would be* — `2 → 4`
 * shafts, `hydraulic → gearless-traction` — and not one of them says faster, better or worth it.
 * That is `docs/10` R2 and CLAUDE.md's paired-t rule at the same time: this screen has run nothing,
 * so it has measured nothing, and a preview that ranked two fabrics off no replications would be
 * the confident nonsense this project exists to avoid. The capital figure is not restated either —
 * it appears in `review.sentence` above, in exactly one place, because a limit shown twice starts
 * reading like a score.
 *
 * Empty when nothing has moved, which is the honest answer rather than *"no changes"*: the notice
 * slot is not a place to say that a section has nothing in it.
 */
function previewLines(review: CommissioningReview): readonly string[] {
  if (review.moved.length === 0) return [];
  const changes = review.moved
    .map((moved) => `${moved.bankId} ${DIMENSION_LABELS[moved.dimension]} ${movedChoiceText(moved)}`)
    .join('; ');
  return [
    `What you would be commissioning, against what the building has now: ${changes}. This says ` +
      'what the hardware would be, and nothing about what it would buy — nothing has been ' +
      'simulated yet.',
  ];
}

/**
 * Said on the screen, because the alternative is a player inferring it from a number.
 *
 * The second sentence is the one that earns its place: it names what the capital figure is **not**,
 * in a product whose whole discipline is that a figure beside a wait figure gets read as comparable
 * to it.
 */
const COMMISSIONING_NOTE =
  'Choose the fabric before the week opens, then live with it — nothing here moves once the doors ' +
  'do. The capital figure is a limit on what you may build, not a score: it is never compared ' +
  'between players, never shown beside a wait, and never enters a verdict.';

/**
 * What this screen is *for* — GitHub issue #48's design brief.
 *
 * ## Why one more paragraph on a screen that already had a note
 *
 * {@link COMMISSIONING_NOTE} says what the capital figure is **not**, which is the sentence this
 * module could not do without. What no sentence said is what a player is being asked to *decide*:
 * #24 reported three questions this screen knew the answers to and printed none of, and this is the
 * fourth — *what am I choosing between, and when does it stop being changeable?*
 *
 * ## The three things it may not say, and does not
 *
 * 1. **No ranking, and no recommendation.** It names the three dimensions and the constraint; it
 *    does not say which choice is better, because nothing has been simulated and one replication
 *    could not settle it anyway (CLAUDE.md's paired-t rule, and `docs/10` R2).
 * 2. **No unmeasured mechanism.** Every clause is a fact about **what the code does** — the fabric
 *    is fixed for the week, the constraint decides what may move — never about what a choice buys.
 *    The one sentence that would need a measurement is the one about geometry beating dispatch, and
 *    it is absent for exactly that reason.
 * 3. **No second copy of the capital rule.** The limit is stated once, in the note above. Said
 *    twice it starts reading like the thing being optimised, which is `commissioning/types.ts`'s
 *    whole argument about a currency that quietly becomes a score.
 */
const COMMISSIONING_BRIEF =
  'Three things per bank: how many shafts it has, which machine class goes in them, and what ' +
  'speed those are rated for. What you may move is the constraint’s to decide — retrofit freezes ' +
  'the fabric entirely, refurbishment keeps the shafts you have, and a new build opens all three. ' +
  'Change what you want, then commission it: from that point the week runs on this building, and ' +
  'the only thing left to move is how the cars are dispatched.';

/* ------------------------------------------------------------- leaderboard */

function leaderboardBody(input: MenuViewInput): Body {
  const boards = input.boards ?? [];
  const rows: MenuAffordance[] = boards.map((board) => ({
    id: `leaderboard.${board.configHash}`,
    label: `${board.configHash.slice(0, 8)}…`,
    detail: `${String(board.entries)} posted`,
    kind: 'navigate' as const,
    scope: 'presentation' as const,
    enabled: true,
    intent: { kind: 'open-board' as const, configHash: board.configHash },
  }));

  /*
   * The open board's own rows — GitHub issue #93 § 1, and the whole of what makes a board a thing to
   * come back to rather than a table to read once.
   *
   * One control per entry rather than one for the board, because the **seed** is the only thing that
   * differs between two rows here and it is on the row. A single *run this board* control would have
   * had to pick a seed, and picking one on the player's behalf is picking which run they are
   * compared against.
   *
   * The refusal is per row for the same reason it is per row on the Free play screen: a build that
   * cannot resolve the dispatcher cannot run *any* of them, but a build whose `data/` moved a
   * template's parts can fail on one and not another, and a control disabled for a reason that is
   * true of a different row is worse than no reason at all.
   */
  const page = input.boardPage;
  const pageRuns = (page?.entries ?? []).map((entry) => entry.run);
  const configuration = boardConfigurationOf(pageRuns, input.catalogue);
  const beatRows: MenuAffordance[] = (page?.entries ?? []).map((entry, index) => {
    const why = beatRefusalOf(entry.run, input.catalogue, (selection) =>
      freePlayIssues(selection, input.catalogue),
    );
    return {
      // Indexed by position on the board, which is what the reader is looking at. The entry's own id
      // is a uuid and would put a database key in a DOM id for no reader's benefit.
      id: `leaderboard.beat.${String(index)}`,
      label: `${BEAT_LABEL} — ${entry.displayName}`,
      detail: beatDetailOf(entry.run),
      kind: 'commit' as const,
      // Every field of the row is the run's identity, hashed into the board it came from. Same scope
      // as **Start**, because it is the same six axes arriving from somewhere else. `docs/16` § 3.
      scope: 'between-games' as const,
      enabled: why === undefined,
      ...(why === undefined ? {} : { disabledWhy: why }),
      intent: { kind: 'beat-score' as const, run: entry.run },
    };
  });
  rows.push(...beatRows);

  /*
   * Posting is refused for two entirely different reasons and they are never collapsed.
   *
   * *Nobody is signed in* is about the player. *This run cannot be ranked* is about the run — day 2,
   * a held car, a moved lever — and it is `scope/runIdentity.ts`'s answer, the same one
   * `provenanceLineOf` gives (`docs/16` S5). Showing one sentence for both would tell a signed-in
   * player to sign in.
   */
  const refusal = !input.hasRun
    ? 'There is no finished run to post yet.'
    : (input.rankingRefusal ?? input.postingRefusal);

  rows.push({
    id: 'leaderboard.submit',
    label: 'Post this run',
    kind: 'commit',
    // The submission *is* the run's identity, and nothing outside it may travel with the score.
    scope: 'between-games',
    enabled: input.canPost && input.hasRun && input.rankingRefusal === undefined,
    ...(refusal === undefined ? {} : { disabledWhy: refusal }),
    intent: { kind: 'submit-score' },
  });

  /*
   * The way to the surface that answers the question this one cannot — #93 § 4.
   *
   * Offered only with a board open, because that is the moment the reader has just been told the
   * dispatcher is in the board's key and has nowhere to take the thought. `challengeBody` has had
   * the mirror row (*Open the leaderboard*) since it was written; this is the return leg, and its
   * absence is why the two screens read as rivals rather than as two questions.
   */
  if (page !== undefined) {
    rows.push({
      id: 'leaderboard.challenge',
      label: 'This week’s challenge',
      detail: 'The same seeds for everybody, and the dispatcher left free — the other question',
      kind: 'navigate',
      scope: 'presentation',
      enabled: true,
      intent: { kind: 'navigate', to: 'challenge' },
    });
  }

  /*
   * Order matters: what the board *is* comes before what a reader may do about it. The refusal is
   * printed beside the reveal rather than instead of it, because a configuration line carrying
   * `predictive-x — not in this build` needs the sentence that says what that dash means.
   */
  const reveal = page === undefined ? undefined : boardRevealOf(configuration);
  const revealRefusal = page === undefined ? undefined : boardRevealRefusalOf(configuration);

  return {
    rows: Object.freeze(rows),
    notices: Object.freeze([
      LEADERBOARD_NOTE,
      ...(reveal === undefined ? [] : [reveal]),
      ...(revealRefusal === undefined ? [] : [revealRefusal]),
      // Gated with the reveal rather than with the page, because its subject sentence — *every one
      // of them is that same dispatcher* — is a claim about a board whose rows agree.
      ...(reveal === undefined ? [] : [BEATING_NOTE]),
    ]),
    issues: Object.freeze([]),
  };
}

/**
 * What a board actually is, said where a player reads it.
 *
 * A board is keyed by a digest over the building, the dispatcher, the template, the rate, the
 * duration and the loaded `data/` — **everything except the seed**. So the entries on one board are
 * the same configuration played on different seeds, and picking a different dispatcher does not beat
 * anybody: it moves you to a different board.
 *
 * That is worth saying plainly rather than letting the word *leaderboard* imply a skill ranking it
 * is not. `docs/10` § 5.5 bans *"a leaderboard ranking dispatchers from single runs"*, and the
 * honest way to keep both the board and the ban is to describe the board correctly.
 */
const LEADERBOARD_NOTE =
  'Each board is one configuration across seeds, ranked on the named metric alone. A different ' +
  'dispatcher is a different board rather than a better score. A configuration is the building, ' +
  'the dispatcher, the traffic template, the arrival rate and the run length together; a seed is ' +
  'the number the passengers are generated from, so the same seed brings the same people at the ' +
  'same moments.';

/* ------------------------------------------------------------------ account */

/**
 * One door, and — once through it — one question.
 *
 * ## Three states, and the middle one is the reason this stopped being a row list
 *
 * **Signed out**: the address, and a button that says what pressing it does. *Sign in* was the
 * label and it named a mechanism that no longer exists; **Email me a link** names the thing that
 * actually happens, which matters most on the one screen where a player is deciding whether to hand
 * over an address at all (§ D241).
 *
 * **Signed in and unnamed** — `account.ts#namingStage`, and § D241 § 7's whole design. The name is
 * asked for *after* the link is redeemed rather than beside the address, because asking for it only
 * when the address is new would tell the person filling in the form whether the address is new.
 * Redeeming proves the address, so by this point the question costs nothing.
 *
 * **Signed in and named**: nothing left to ask.
 *
 * ## And the name is asked for, never demanded
 *
 * `postingRefusal` deliberately does not refuse an unnamed player — `player-a1b2c3…` on a board is
 * ugly and honest, and a run that could not be posted until a form was filled in would be a gate.
 * So **Sign out** stays offered beside the naming prompt: a player who does not want to be named can
 * simply not answer, and nothing is withheld from them for it.
 */
function accountBody(input: MenuViewInput): Body {
  const signOut: MenuAffordance = {
    id: 'account.sign-out',
    label: 'Sign out',
    kind: 'commit',
    scope: 'presentation',
    enabled: true,
    intent: { kind: 'sign-out' },
  };

  if (input.naming === true) {
    return {
      ...empty,
      rows: Object.freeze([
        {
          id: 'account.submit',
          label: 'Save this name',
          detail: 'It is what appears on a board beside your figures',
          kind: 'commit' as const,
          scope: 'presentation' as const,
          enabled: true,
          intent: { kind: 'account-submit' as const },
        },
        signOut,
      ]),
      notices: Object.freeze([NAMING_NOTE]),
    };
  }

  if (input.canPost) return { ...empty, rows: Object.freeze([signOut]) };

  return {
    ...empty,
    rows: Object.freeze([
      {
        id: 'account.submit',
        label: 'Email me a link',
        detail: 'Opening it signs you in. If the address is new, it creates the account.',
        kind: 'commit' as const,
        scope: 'presentation' as const,
        enabled: true,
        ...(input.postingRefusal === undefined ? {} : { disabledWhy: input.postingRefusal }),
        intent: { kind: 'account-submit' as const },
      },
    ]),
  };
}

/**
 * Why the name is being asked for now and not earlier, said on the screen that asks.
 *
 * A form that appears *after* somebody thought they were finished reads as a bait-and-switch unless
 * it says why it waited. It waited because asking earlier would have leaked whether the address was
 * already known — which is the whole of § D241 § 7 — and because it is genuinely optional.
 */
const NAMING_NOTE =
  'You are signed in. The boards need a name to put beside your figures, and this is the first ' +
  'moment it can be asked for without telling anyone whether your address was already known. Skip ' +
  'it if you would rather: a generated name works everywhere, and nothing is withheld for it.';

/* -------------------------------------------------------------------------- *
 * Applying an intent — the pure half
 * -------------------------------------------------------------------------- */

/**
 * The part of an intent the menu can answer on its own.
 *
 * Navigation and the two setters. Everything else — `start`, `open-campaign`, `submit-score`, the
 * account calls — needs the shell, and is returned unchanged so the shell's switch is the only place
 * that decides what those mean. A reducer that quietly handled half of `start` would be the drift
 * this module exists to stop.
 *
 * **The string parsing lives here and only here.** A select hands back the option's id, and turning
 * `"null"` into *the building's own profile*, `"1800"` into a duration and `"on"` into `true` is one
 * decision each. Spread across the panel it would be three copies, and the one that matters —
 * `null` meaning a real selection rather than a missing one — has already been argued for twice in
 * this directory.
 *
 * ## Why it takes the catalogue — GitHub issue #111(b)
 *
 * Because one field's new value decides another field's, and this is the only layer that may know
 * it. Changing the template changes **which parts exist**, and the part held from the old template
 * is then a value the new select cannot represent: the box falls back to its first option and the
 * model keeps the old pair, permanently, because a `<select>` fires no `change` for the option it is
 * already on. `menu.ts#openingPart` already knew the right answer and needed a catalogue to give it,
 * so the catalogue is threaded here rather than the answer being written a second time.
 *
 * **Required, not optional.** An optional catalogue would let a caller silently opt out of the fix
 * and keep the defect, which is exactly the shape of the *"barrel re-export looks like a caller"*
 * mistake CLAUDE.md's standing requirement is about.
 */
export function applyIntent(
  state: MenuState,
  intent: MenuIntent,
  catalogue: MenuCatalogue,
): MenuState {
  switch (intent.kind) {
    case 'navigate':
      return navigate(state, intent.to);
    case 'back':
      return back(state);
    case 'set-free-play':
      return updateFreePlay(state, freePlayPatch(intent.field, intent.value, catalogue));
    case 'set-setting':
      return updateSettings(state, settingsPatch(intent.field, intent.value));
    case 'set-challenge':
      return updateChallenge(state, { [intent.field]: intent.value });
    /*
     * **The menu's, unlike its neighbours below** — the row's configuration *is* a Free Play
     * selection (`boardRun.ts#selectionFromRun`), so writing it here is the same operation
     * `set-free-play` performs six fields at a time.
     *
     * Written even when it cannot start. `freePlayIssues` is what refuses an unresolvable row, and
     * it refuses it *on the Free play screen with the offending field named* — which is a better
     * place to be told than a leaderboard row that silently did nothing. The shell's arm asks
     * `enterFreePlay`, which returns `undefined` for exactly that case, so nothing runs.
     */
    case 'beat-score':
      return updateFreePlay(state, selectionFromRun(intent.run));
    case 'set-calendar':
    case 'set-commissioning':
    case 'set-constraint':
    case 'commit-commissioning':
    case 'reset-commissioning':
      // The shell's, because each writes `ViewerState` rather than `MenuState` — the fabric and the
      // calendar are facts about the run, not about which screen is showing.
      return state;
    case 'reopen':
    case 'close':
    case 'start':
    case 'open-campaign':
    case 'start-endless':
    case 'open-board':
    case 'account-form':
    case 'account-submit':
    case 'sign-out':
    case 'submit-score':
    case 'run-challenge':
    case 'post-challenge':
      // Not the menu's to answer. Returned unchanged rather than thrown: a render path that threw
      // on an intent it did not own would turn a mis-wired button into a blank screen.
      //
      // `close` is here rather than beside `back` on purpose. Hiding the overlay is the shell's,
      // and a reducer that also navigated would decide *which screen the menu re-opens on* — which
      // is `reopen`'s answer (the root) and not this one's to give twice.
      return state;
  }
}

function freePlayPatch(
  field: keyof FreePlaySelection,
  value: string,
  catalogue: MenuCatalogue,
): Partial<FreePlaySelection> {
  switch (field) {
    case 'buildingId':
      return { buildingId: value };
    case 'dispatcherProfileId':
      return { dispatcherProfileId: value };
    case 'demandTemplateId':
      /*
       * **Two fields, because the second cannot survive the first** — GitHub issue #111(b).
       *
       * This arm wrote `demandTemplateId` alone. `freePlayBody` then rebuilt the *Part of the day*
       * select with the new template's options and the old template's value, no option matched, and
       * the browser selected index 0 — so the box read `Morning rush` while `windowStartS`/`durationS`
       * still held `rise-and-fall`'s whole thirty minutes. Not a lag: a state a select **cannot
       * represent**, and one it cannot get out of either, since re-picking the option already shown
       * fires no `change`.
       *
       * `openingPart` is the answer a fresh player gets, and it is the same question — the shortest
       * part of this template that fits inside a single run. Deriving it here rather than clamping in
       * the panel keeps the reducer the one place a selection is decided, and keeps the refusal in
       * {@link freePlayIssues} reachable for the case that *is* still reachable: a restored or
       * persisted selection whose part belongs to a template `data/` has since changed.
       */
      return { demandTemplateId: value, ...openingPart(catalogue, value) };
    case 'arrivalRatePctPop5min':
      // `"null"` is *this building's own profile*, which is a distinct selection and has to survive
      // as one — resolving it to a number here would pin a rate `data/` is free to change.
      return { arrivalRatePctPop5min: value === 'null' ? null : Number(value) };
    case 'windowStartS': {
      // One control writing two fields, because it is one selection: *which part of the day* is a
      // start and a length, and a patch that set one without the other would leave a run covering a
      // period nobody named. The option's id carries both, because `applyIntent` is a pure reducer
      // with no catalogue to look a part up in — see `DayPart.id`.
      const [startText, durationText] = value.split(':');
      return {
        windowStartS: startText === 'null' || startText === undefined ? null : Number(startText),
        durationS: Number(durationText ?? '0'),
      };
    }
    case 'durationS':
      // Not written by any control. `windowStartS` above writes both halves of the selection, and
      // this arm exists so the exhaustive switch still covers the key rather than being narrowed to
      // the fields that happen to have a row today.
      return { durationS: Number(value) };
    case 'seed':
      // Not parsed. A seed is an identity rather than a quantity, and `freePlayIssues` is what says
      // so in words when it is not digits.
      return { seed: value };
  }
}

function settingsPatch(field: keyof Settings, value: string): Partial<Settings> {
  switch (field) {
    case 'reduceMotion':
      return { reduceMotion: value === 'on' };
    case 'showEnergyAxis':
      return { showEnergyAxis: value === 'on' };
    case 'playbackSpeed':
      return { playbackSpeed: Number(value) };
    case 'theme':
      return { theme: value === 'dark' || value === 'light' ? value : 'system' };
  }
}
