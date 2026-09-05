/**
 * **The Everyday settings screen, as words** — GAMEPLAY § 15.1, transcribed from the prototype
 * (`docs/design/elevator-sim-casual.dc.html`, the `isSettings` region), decided here and drawn by
 * `settingsScreen.ts`. Pure for `rail.ts`'s reason: the copy and the refusals are testable
 * without a document, and drivable by the honesty sweep the day it adopts this screen.
 *
 * ## Which of the prototype's rows shipped, and which were refused — with the evidence
 *
 * § 20.12's rule decides the roster: *a toggle that toggles nothing is a lie in a settings
 * panel* — either there is a seam behind a row or the row is not drawn. Applied to § 15.1's
 * *Playing* five and *This device* set, against this tree:
 *
 * - **Motion — shipped, wired to the Engineer's own switch.** The seam is real and singular:
 *   `menu/screens.ts`'s `settings.reduce-motion` toggle over `dev/main.ts`'s
 *   `menuState.settings.reduceMotion`, applied by `dev/motion.ts#shouldAutoplayWith` and the
 *   immediate pause in `dispatchMenu`, persisted by `persist/validate.ts`'s `SETTINGS_CHECKS`.
 *   This row reads and writes that value through `everyday/engineerBridge.ts` — the same
 *   `set-setting` intent, so the two surfaces cannot disagree. While the Engineer surface is
 *   still booting the bridge is absent and the row is **absent too**, with a sentence in its
 *   place: a toggle whose write would land nowhere is § 20.12's lie with a race for an excuse.
 * - **Sound — not drawn, and now not drawn *yet*.** `grep -rn "mute\|Audio\|chime"
 *   packages/viz/src --include='*.ts'` finds no audio machinery anywhere in the tree; the
 *   prototype's own build note (§ 15.1) says this row had nothing behind it *there* either. Named
 *   in {@link SETTINGS_ABSENCES} instead. **§ 20.12 offered two ways out and the choice has been
 *   made**: [§ D344](../../../../DECISIONS.md) is a product-owner ruling that audio **ships**,
 *   speed-tiered, overruling the written cut `docs/29-audio-direction.md` recommended — so this
 *   row gains a consumer rather than losing its label. What was blocking it was the speed ladder
 *   having no 1:1 rung for a discrete cue to play at, and § D354 closed that. The entry below is
 *   therefore a **queue item with an owner** (`buildNotes.test.ts#ABSENCE_TRIAGE`, § D370) rather
 *   than a holding position, and it is deleted on the commit that makes a sound play and not
 *   before. [§ D447](../../../../DECISIONS.md) records that reading and the correction it owed the
 *   design guide, whose § 20.12 and § 15.1 both still put the choice as open.
 * - **Default speed — not drawn.** The prototype's row writes `st.speed`, § 18's Everyday
 *   `run.speed(1..5)` — state this build does not have: the day a player runs is the Engineer
 *   stage (§ D335's hand-off), whose ×-chips and `settings.playbackSpeed` multiplier belong to
 *   that surface and mean *how fast to watch a recording*, not *how fast a day starts*. Wiring
 *   this label to that mechanism would be a control doing something other than what it says.
 * - **Units — shipped, and it is the newest of the two wired rows.** It used to be refused, and the
 *   refusal's own evidence was the grep: `grep -rin "imperial" packages/viz/src --include='*.ts'`
 *   found **no non-test occurrence**, so a row would have persisted a bit nothing consults.
 *   **The consumer is built** — `everyday/units.ts`, ENGINE_CONTRACT § 13's *metres by default; the
 *   `Units` setting switches machine specs to feet and must convert, not relabel* — and the row
 *   goes up on the same commit that makes the refusal false ([§ D448](../../../../DECISIONS.md),
 *   GitHub issue #170). It reaches the drawing board's rating plate and machine panel, the tuner's
 *   machine card, and the daily loop's *Rated speed* fact; what it deliberately does not reach is
 *   enumerated and asserted in `units.ts` rather than described here, and the row's own note says
 *   *machine specifications* rather than *everything* so that the promise matches the scope.
 *   **This row holds its own value**, unlike Motion: there is no Engineer switch to be a second
 *   answer to, because nothing on that surface reads the preference. It lives in the Everyday slot
 *   beside the profile rather than on it — identity travels with a posted run and a display
 *   preference must not — and so it is drawn whether or not the Engineer bridge has arrived, which
 *   is why the *Playing* section can be non-empty while the Motion row is still absent.
 * - **Post runs to the board — not drawn.** `honesty/generate.ts` says it outright: *"There is
 *   no `settings.noPost` flag in this tree"* — the real gates are `menu/account.ts#postingRefusal`
 *   and `shift/banking.ts#bankingRefusalFor`, and neither reads a switch. **The row's stated reason
 *   changed under it and the row did not**: it used to add *"the boards need a server this build
 *   has none of"*, which was false on every served build — the server injects the API tag into the
 *   page it serves — and became visibly false when GitHub issue #221 made the board read. What is
 *   actually absent is the posting path, so that is what it says now.
 * - **This device's two statements shipped; one of its two actions now does too.** *Where progress lives* and
 *   *Replay verification* are statements of fact with real seams (`persist/session.ts` and this
 *   screen's own `profileStore.ts`; the server's replay-before-board, which `dev/main.ts` reports
 *   as *"The server replayed your seed and it reproduced."*). *Clear saved progress* is refused
 *   because it would lie: `dev/main.ts` saves the running session on every state change, so a
 *   cleared slot is rewritten moments later and the button's claim does not survive its own
 *   click. *Switch to Engineer* used to be refused here in the rail's own words, and is now not
 *   named at all: the rail's § 3.2 footer row opens the Engineer surface, so the entry went with
 *   the refusal rather than being reworded — see the note where it stood. **A *Sign out* refusal
 *   stood beside it and is deleted on this commit rather than reworded** (GitHub issue #332,
 *   [§ D489](../../../../DECISIONS.md)). It read: *"Sign out is refused because nothing on this
 *   surface is signed in — `menu/account.ts`'s session is the Engineer screen's, token in memory,
 *   and a button ending a session this screen never shows would be § 20.12's lie in reverse."*
 *   Every clause of it is false now: this screen shows that session ({@link SIGN_IN_COPY}), the
 *   session is reached through `everyday/accountPort.ts`, and *Sign out* is one of its controls. A
 *   refusal standing over a control that works is § D227's defect in the direction that costs the
 *   player — it tells them not to press something that does something.
 *
 * ## The account is a **state** of the *You* section, not a row of this roster
 *
 * GitHub issue #332, [§ D489](../../../../DECISIONS.md). § 4's screen inventory lists seventeen keys
 * and none of them is a sign-in, so an eighteenth would have been a deviation from the one part of
 * this that *is* specified, taken in order to build something the inventory does not contain. What
 * § 15.1 does specify is the signed-in line and *Sign out*, which this file withheld — see the
 * second deviation below — and that withholding is discharged here rather than overridden: the
 * session is drawn from a real one ({@link SettingsSignInView}), and the *asking* half in front of
 * it is the six states {@link SIGN_IN_COPY} words. The roster above is untouched by it, because a
 * state is not a row.
 *
 * ## Two copy deviations from the prototype, each with its constraint
 *
 * - The progress row's note drops *"campaign purses"* (no campaign purse exists in this tree).
 *   **Its second half was a deviation and is not one any more**: it read *"says *playing* rather
 *   than *signing in* elsewhere starts a separate career (Everyday Mode has no sign-in)"*, and the
 *   parenthetical is false on this commit. The row's own sentence is unchanged and still true —
 *   progress is this device's and an account carries identity, not a career — so what is deleted
 *   is the *reason given for wording it that way*, and what is added is the clause a signed-in
 *   reader now needs: signing in on another device does not bring it. § 16 rule 5: derive, never
 *   assert — a stored-things list is a claim.
 * - **The prototype's signed-in line is drawn for real, and the sentence that stood in for it is
 *   deleted** — GitHub issue #332, [§ D489](../../../../DECISIONS.md). `SettingsYouView.home` read:
 *   *"Nothing on this screen is signed in — your name and picture live on this device."* It was
 *   put there because § 15.1's `Nadia R.` / `signed in · progress saved on this device` is an
 *   authored fixture and *"an authored fixture presented as a player is § 20.11's own example"*.
 *   That is discharged rather than overridden: the field is gone and {@link SettingsYouView.signIn}
 *   stands where it stood, drawing a real session or asking for one. § D489's own reading of the
 *   handoff is that the signed-in half was never missing from § 15.1 — it was missing from the
 *   build, deliberately, and this is the commit that stops it being missing.
 */

import { displayNameIssueOf, namingStage, type AccountState } from '../menu/account.js';
import {
  AVATAR_SWATCHES,
  avatarInitialOf,
  DEFAULT_EVERYDAY_PROFILE,
  effectiveNameOf,
  type EverydayProfile,
} from './profile.js';
/*
 * Imported for its **length**, which is the whole of GitHub issue #286's first half: the
 * `Default speed` entry below counts the stage's rungs, and a count written down beside a
 * structure is stale as of the next commit that moves the structure. `stageScreenModel.ts` is the
 * stage's *pure* half — no document, no canvas, no clock — so this import costs this file nothing
 * it was keeping, and the arrow runs one way: that module has never imported this one.
 */
import { STAGE_SPEEDS } from './stageScreenModel.js';
import {
  DEFAULT_EVERYDAY_UNITS,
  UNITS_ROW_COPY,
  type EverydayUnits,
} from './units.js';

/** One avatar swatch, drawable: § 15.1's six, with the picked one carrying the ink edge. */
export interface SettingsSwatchView {
  readonly id: string;
  readonly color: string;
  readonly selected: boolean;
}

/** § 15.1's *You* section. */
export interface SettingsYouView {
  readonly heading: 'YOU';
  readonly nameLabel: 'DISPLAY NAME';
  /** What the field shows — the uncommitted draft while one exists, the stored name otherwise. */
  readonly nameValue: string;
  /** `menu/account.ts`'s refusal for {@link nameValue}, drawn beside the field — or nothing. */
  readonly nameIssue: string | undefined;
  readonly pictureLabel: 'PICTURE';
  /** The disc: committed identity, so a refused draft never changes the letter on it. */
  readonly initial: string;
  readonly avatarColor: string;
  readonly swatches: readonly SettingsSwatchView[];
  /**
   * The prototype's `nameNote` — where the name shows up, and it says a **different** thing
   * signed in from signed out.
   *
   * [§ D490](../../../../DECISIONS.md) is why it had to split rather than stay one sentence. It
   * read *"This is the name on the daily board, on the ladder, and on any run somebody else
   * watches"* in both states, which was a claim about the device-local name that nothing could
   * falsify while nothing on this side had an account — § D227's shape, aimed at the one parameter
   * § 15.1 makes load-bearing. Measured against this tree, the device-local name is read by exactly
   * one surface: `everyday/shell.ts#drawRail`'s `PLAYING AS` card. Nothing else. So the signed-out
   * arm says that and stops, and the signed-in arm is about the account, which is the thing a board
   * row genuinely carries.
   */
  readonly note: string;
  /**
   * § 15.1's account state, drawn for real — GitHub issue #332,
   * [§ D489](../../../../DECISIONS.md).
   *
   * A `home` field stood here and held one sentence saying nothing on this screen was signed in.
   * It is deleted rather than reworded; the module docstring quotes it where it stood and says why.
   */
  readonly signIn: SettingsSignInView;
  /** Said when a write did not survive the tab — a memory-only store or a refusing one. */
  readonly saveNotice: string | undefined;
}

/* -------------------------------------------------------------------------- *
 * § 15.1's account state — the asking half, GitHub issue #332 and § D489
 * -------------------------------------------------------------------------- */

/**
 * Which of the six states the YOU section's account block is in.
 *
 * A value rather than six booleans, on `everyday/signInLink.ts#SIGN_IN_LINK_STAGES`' own precedent
 * and for its reason: *"a hand-written list of contexts in `honesty/surfaces.ts` went quietly stale
 * the day a fourth one landed, and the fix was to make the loop read the constant."*
 *
 * - `booting` — the Engineer surface has not published an account yet. A real window: this shell
 *   mounts immediately and `dev/main.ts` boots asynchronously.
 * - `no-server` — the page was served with no API origin, so there is nowhere to sign in. Said
 *   **before anything is typed**, which is GitHub issue #30's own stated fix ordering: a form with
 *   no stated destination is a privacy problem rather than a layout one.
 * - `signed-out` — the address, and the press that mails a link.
 * - `link-sent` — the server took it. Its own 202 is the sentence, carried.
 * - `naming` — signed in and still carrying the server's mint (`menu/account.ts#namingStage`).
 * - `signed-in` — signed in and named.
 */
/*
 * **Module-private, and the type is what is exported** — which is a departure from
 * `SIGN_IN_LINK_STAGES` next door and is worth the sentence.
 *
 * That constant is exported and is registered in `honesty/derive.test.ts#NOT_PLAYER_FACING` as *an
 * id, key or glyph table*, because the scanner admits any two adjacent words and `signed-in` reads
 * as two. This one would need the same entry, in a file this lane may not write. Keeping the value
 * here and exporting only the union costs nothing a reader can see and buys something stronger than
 * the register would have: `settingsView.test.ts` builds a `Record<SettingsSignInStage, …>`, so a
 * seventh stage that nothing drives fails to **compile** rather than failing a scan.
 */
const SIGN_IN_STAGES = [
  'booting',
  'no-server',
  'signed-out',
  'link-sent',
  'naming',
  'signed-in',
] as const;

export type SettingsSignInStage = (typeof SIGN_IN_STAGES)[number];

/**
 * The account block, as data.
 *
 * ## Every failure is a state here, and every sentence in one is somebody else's
 *
 * #332's third criterion is that each failure is *designed, labelled, and carries the server's own
 * sentence rather than a paraphrase*. {@link notice} is that field and it is never composed: it is
 * the server's 202, its `link-expired` / `link-spent` / `too-many-link-requests` refusal, its new
 * mail-not-sent refusal ([§ D491](../../../../DECISIONS.md)), or `menu/client.ts`'s own transport
 * sentence when the request never arrived. `menu/client.ts` states the rule this obeys — *"a
 * rejection is not an accusation and the server is the one place that decides how one is worded"* —
 * and `CLIENT_FAILURES.unreachable` is deliberately **not** reached for here, because it says
 * *"Your run is not lost"* and a player who has just typed an address has no run in flight.
 *
 * ## Nothing is greyed without a sentence beside it
 *
 * [§ D488](../../../../DECISIONS.md): *a reason a player cannot see is not a reason*, and a
 * `title` is not a declaration. So {@link actionOffered} is false in exactly two situations, and
 * both of them already have the words: a request in flight, where {@link notice} is
 * `dev/main.ts`'s escalating wait rung, and § D242's 429 gate, where it is the server's own
 * refusal naming the wait. Everything a *form* can get wrong — an empty address, a shape that is
 * not an address — leaves the press offered, and `menu/account.ts#formIssues`' sentences come back
 * as the notice, which is what the Engineer panel has always done. A button that greys before the
 * reader has typed anything would be § D488's defect manufactured on purpose.
 */
export interface SettingsSignInView {
  readonly stage: SettingsSignInStage;
  /** Always {@link SIGN_IN_COPY.heading} — the block's own eyebrow, so the section is findable. */
  readonly heading: string;
  /** What this state **is**, in the product's own words. Always present. */
  readonly note: string;
  /** The address field's label, on the one arm that asks for one. */
  readonly fieldLabel?: string | undefined;
  /**
   * What is in the box — `menu/account.ts`'s shared form, never a second copy.
   *
   * Deliberately **not** seeded by the honesty corpus, unlike {@link SettingsYouView.nameValue}: a
   * display name can be a default the product chose (`'you'`) and is therefore the product's
   * string, and an address never is.
   */
  readonly fieldValue?: string | undefined;
  /** The press, where there is one. */
  readonly action?: string | undefined;
  /** Whether pressing it will do anything — see the interface docstring's second section. */
  readonly actionOffered?: boolean | undefined;
  /** The last thing the server or the client said, carried verbatim. */
  readonly notice?: string | undefined;
  /** Offered on both signed-in arms, including the unnamed one — `menu/account.ts` argues why. */
  readonly signOut?: string | undefined;
}

/**
 * Every word the account block authors, in one table.
 *
 * **Twelve strings is the whole of what GitHub issue #332 writes**, and § D489 is why it is that
 * small: sign-in is the *signed-out state of an already-specified surface* rather than an
 * eighteenth screen, so what a builder authors is an address field, a link-sent state and the
 * refusals, and everything after the redemption is § 15.1's, drawn from a real session. A screen's
 * worth of invented copy against a handoff that specifies no sign-in screen is what the ruling
 * exists to prevent.
 *
 * A table rather than literals inside {@link signInViewOf}, for `menu/client.ts#CLIENT_FAILURES`'
 * reason: *"a sentence buried in a `catch` is a sentence no property ever looks at"*. It is swept
 * through this module's own surface — `honesty/surfaces.ts#EVERYDAY_SETTINGS` drives all six arms.
 */
export const SIGN_IN_COPY = Object.freeze({
  heading: 'ACCOUNT',
  /*
   * The booting window, worded like the Motion row's own — same shape, same cause, one screen. A
   * second wording for one window is how two sentences about one fact start disagreeing.
   */
  booting:
    'Signing in is the simulator’s own, and the simulator is still loading — this appears when it has.',
  /*
   * Said in this screen's words rather than carried from `dev/main.ts`'s `NO_SERVER_SIGN_IN`,
   * which is the Engineer menu's sentence about the same fact. `everyday/world.ts` already sets
   * that precedent — it states the absent-server case for the Everyday screens in its own words —
   * and the alternative is worse: the Engineer sentence is cleared from the shared state by any
   * commit in that panel's form, so carrying it would give this arm a blank half the time.
   */
  noServer:
    'This page has no account server behind it, so there is nowhere to sign in. Nothing typed here would be sent anywhere, and every other part of the game is unaffected.',
  signedOut:
    'An account is only for putting a run on a board. The day, the week, the towers, the fix-it cases and the ladder all work signed out, and stay on this device. There is no password: a link is emailed to you, and opening it signs you in.',
  emailLabel: 'EMAIL ADDRESS',
  request: 'Email me a link',
  linkSent:
    'Open the link on this device and it signs you in here. Nothing else has to happen on this screen.',
  otherAddress: 'Use a different address',
  /*
   * § D241 § 7's *why now*, said where the question is asked. The Engineer panel's `NAMING_NOTE`
   * says the same thing at length on a screen whose whole subject is the account; this screen has
   * a name field two centimetres above, so what it owes the reader is the *offer* — § D490's
   * adoption — rather than the argument.
   */
  naming:
    'The name above is this device’s own, offered as it stands rather than the one the server minted for you. Change it if you would rather, then save it to your account.',
  saveName: 'Save this name',
  signedIn: 'Signed in. Your progress is still kept on this device, and only a run you post leaves it.',
  signOut: 'Sign out',
} as const);

/**
 * What the DISPLAY NAME field's note says, and it is two sentences because it is about two
 * different names — [§ D490](../../../../DECISIONS.md). See {@link SettingsYouView.note}.
 */
export const NAME_NOTE = Object.freeze({
  device:
    'This name is kept on this device and drawn on the rail beside you. It reaches no board, and nothing sends it anywhere.',
  account:
    'This is your account’s name. It is what a board row carries, and changing it here changes it everywhere you are signed in.',
} as const);

/**
 * The account block for a state — total, and every arm is reachable from a page a player can load.
 *
 * The order of the tests is the order the states nest, and the first two are ahead of the session
 * on purpose: a build with no account server must say so before it draws a field, which is issue
 * #30's ordering, and a shell that has not been handed an account yet must not draw *signed out*,
 * because that is a claim it cannot support.
 */
function signInViewOf(input: SettingsScreenInput): SettingsSignInView {
  const heading = SIGN_IN_COPY.heading;
  const account = input.account;
  if (account === undefined) return { stage: 'booting', heading, note: SIGN_IN_COPY.booting };
  if (input.accountServer !== true) {
    return { stage: 'no-server', heading, note: SIGN_IN_COPY.noServer };
  }
  /*
   * `busy` and the 429 gate are the only two states in which the press does nothing, and both
   * carry their own sentence in `notice` already — see {@link SettingsSignInView}'s second section.
   */
  const offered = !account.busy && account.retryInMs === undefined;
  if (account.token !== undefined && account.user !== undefined) {
    return {
      stage: namingStage(account) ? 'naming' : 'signed-in',
      heading,
      note: namingStage(account) ? SIGN_IN_COPY.naming : SIGN_IN_COPY.signedIn,
      action: SIGN_IN_COPY.saveName,
      actionOffered: offered,
      notice: account.notice,
      signOut: SIGN_IN_COPY.signOut,
    };
  }
  if (account.linkSent) {
    return {
      stage: 'link-sent',
      heading,
      note: SIGN_IN_COPY.linkSent,
      action: SIGN_IN_COPY.otherAddress,
      actionOffered: offered,
      notice: account.notice,
    };
  }
  return {
    stage: 'signed-out',
    heading,
    note: SIGN_IN_COPY.signedOut,
    fieldLabel: SIGN_IN_COPY.emailLabel,
    fieldValue: account.form.email,
    action: SIGN_IN_COPY.request,
    actionOffered: offered,
    notice: account.notice,
  };
}

/** One shipped toggle row — label, one-clause effect, and the pill's two faces. */
export interface SettingsToggleView {
  readonly id: 'motion' | 'units';
  readonly label: string;
  /** § 16's register: what the row does, in one clause. */
  readonly note: string;
  /** The pill's text — the prototype's `full`/`reduced`. */
  readonly value: string;
  /** Whether the pill draws filled (the prototype's `on` arm). */
  readonly on: boolean;
}

/** One statement of fact in *This device* — never a control. */
export interface SettingsFactView {
  readonly label: string;
  readonly value: string;
  readonly note: string;
}

/** The whole screen, as data. */
export interface SettingsScreenView {
  readonly eyebrow: string;
  readonly title: string;
  readonly lede: string;
  readonly you: SettingsYouView;
  readonly playing: {
    readonly heading: 'PLAYING';
    readonly rows: readonly SettingsToggleView[];
    /** The Motion row's honest stand-in while the Engineer bridge is absent — or nothing. */
    readonly absentNote: string | undefined;
  };
  readonly device: {
    readonly heading: 'THIS DEVICE';
    readonly facts: readonly SettingsFactView[];
  };
}

/**
 * The rows this screen does not draw, each with its reason in one clause.
 *
 * **Declared here and drawn on the build-information panel** (`everyday/buildNotes.ts`), which is
 * itself reached from this screen. It lives beside the roster it is the complement of — the
 * evidence for each row is in the module docstring above, and a register that drifted away from
 * that evidence is a register that goes stale — while the *drawing* of it happens once, in one
 * place, with the other five (GitHub issue #207). A refusal only a docstring carries is still read
 * by nobody who owns a mouse, which is why the panel exists rather than the register simply going
 * quiet.
 *
 * **The `Default speed` entry counts the stage's rungs, and it counts them rather than saying a
 * number** — GitHub issue #286, `RISKS.md` R38. It read *"its own **five** speeds"* from the day it
 * was written until [§ D354](../../../../DECISIONS.md) made the ladder seven, and then went on
 * reading *five* on a player's screen for two waves, because nothing in this repository re-derives a
 * count written in prose. The corpus could see the sentence the whole time — this array is seeded on
 * `honesty/surfaces.ts#EVERYDAY_BUILD_NOTES` — and none of the ten properties compares a written
 * count against the structure it is about, so *being swept* was never going to catch it. The
 * durable form is the one `dev/rightRail.ts` reached for the same reason: interpolate
 * `STAGE_SPEEDS.length` and let the sentence move when the ladder does. Writing *seven* would have
 * been this defect again with a fresher number.
 */
export const SETTINGS_ABSENCES: readonly string[] = Object.freeze([
  'Sound — nothing in this build plays a sound, and a toggle that toggles nothing is a lie in a settings panel',
  `Default speed — the stage has its own ${String(STAGE_SPEEDS.length)} speeds and resets to the same one on every run, so the preference this row would set is buildable now and is not built`,
  /*
   * **`Units` was the third entry and it is deleted, not reworded** — GitHub issue #170,
   * [§ D448](../../../../DECISIONS.md).
   *
   * It read *"Units — nothing in the viewer reads a metres-or-feet preference, so there is nothing
   * for the switch to switch"*, and that was true of every build until this one: the refusal's own
   * evidence was a grep that found no non-test reader. `everyday/units.ts` is that reader, the row
   * is drawn above, and a register still refusing it would be § D227's defect in the direction that
   * bites *after* a lane lands — a refusal standing over a seam that works, telling a player not to
   * press a control that does something. The triage row that owned it goes on the same commit
   * (`buildNotes.test.ts#ABSENCE_TRIAGE`, § D370), which is what that table's second assertion is
   * for.
   */
  'Post runs to the board — nothing in this build posts a run yet, so there is no path for a switch to turn off',
  /*
   * **`Sign out` was the fourth entry and it is deleted, not reworded** — GitHub issue #332,
   * [§ D489](../../../../DECISIONS.md).
   *
   * It read *"Sign out — nothing on this surface is signed in; the name and picture above live on
   * this device"*. Both halves are false on this commit: the YOU section holds the session
   * ({@link SettingsSignInView}) and *Sign out* is a control on it. A register still refusing a row
   * that is drawn two centimetres above is § D227's stale refusal in the more dangerous direction —
   * a sentence telling a player not to press something that works — and it is the direction
   * `everyday/buildNotes.ts` has now recorded three times. The triage row that owned it
   * (`buildNotes.test.ts#ABSENCE_TRIAGE`) goes on the same commit, which is what that table's
   * second assertion is for.
   *
   * **The `Post runs to the board` row above deliberately does not move with it.** It refuses a
   * *switch* over a capability that still does not exist, sign-in does not make it false, and
   * § D460 corrected that exact confusion once already. Posting is GitHub issue #221's.
   */
  'Clear saved progress — not offered yet: the running session would write itself straight back on its next save',
  /*
   * **`Switch to Engineer` was the seventh entry and it is deleted, not reworded.**
   *
   * It read *"Switch to Engineer — not built yet, Everyday Mode is the only play style in this
   * build"*, and the rail's § 3.2 footer row now opens the Engineer surface. A register that went on
   * refusing it would be § D227's defect in the more dangerous direction: a refusal standing over a
   * seam that works, telling a reader not to press a control that does something.
   *
   * It is not replaced by a *statement* either, tempting as that is. This section is § 15.1's `THIS
   * DEVICE` register, whose contract is rows this screen does not draw; the swap is drawn — on the
   * rail, two centimetres to the left — and duplicating a live control's description here would be
   * the two-wordings defect this array's own entries exist to prevent.
   */
]);

/** What the view is computed from — the store's profile, the field's draft, and the two seams. */
export interface SettingsScreenInput {
  /** `everydayProfileStore().current()` — `undefined` before anything was stored. */
  readonly profile: EverydayProfile | undefined;
  /** The field's uncommitted text, while it differs from the committed name. */
  readonly draftName?: string | undefined;
  /** The last `set()`'s answer — `false` means the profile lasts only as long as this tab. */
  readonly durable?: boolean | undefined;
  /** `engineerSettings()?.reduceMotion()` — `undefined` while the Engineer surface is booting. */
  readonly reduceMotion?: boolean | undefined;
  /**
   * `everydayProfileStore().units()` — how machine specifications read (GitHub issue #170).
   *
   * Optional, and it is the **only** optional field here whose absence is not a state a player can
   * be in: the store is total in this value, so `undefined` means *a caller did not pass it* rather
   * than *nothing is stored*, and § 13's default is what it falls back to. That asymmetry with
   * {@link reduceMotion} is the point — a missing bridge is a real window a player can meet and is
   * drawn as one, while a missing preference is not, so this row never has an absent arm.
   */
  readonly units?: EverydayUnits | undefined;
  /**
   * `everyday/accountPort.ts#everydayAccount()` — `undefined` while the Engineer surface is
   * booting, which is a state a player can reach and is drawn as one.
   *
   * The state itself rather than a projection of it, because `menu/account.ts` is the state machine
   * both shells render and a second projection is a second machine. `boundaries.test.ts` permits
   * this: it forbids `everyday/` a **value** import of `menu/client.js` and names nothing else, and
   * `menu/account.ts` imports client types only.
   */
  readonly account?: AccountState | undefined;
  /**
   * Whether there is an account server behind this page — `everyday/host.ts#accountActions()`.
   *
   * Separate from {@link account} because the two absences are different states with different
   * sentences, exactly as `EverydayDailyBoard` separates *no API origin* from *the server did not
   * answer*: one is a property of the page decided once at boot, and the other is a moment.
   * `undefined` is read as *not yet*, so a caller that forgets it draws the booting arm rather than
   * a form pointed at nothing.
   */
  readonly accountServer?: boolean | undefined;
}

/** § 15.1's screen for this state. Total; every sentence a player can meet starts here. */
export function settingsScreenViewOf(input: SettingsScreenInput): SettingsScreenView {
  const committed = input.profile ?? DEFAULT_EVERYDAY_PROFILE;
  /*
   * **One display name** — [§ D490](../../../../DECISIONS.md). Signed in, the field edits the
   * account's; signed out, this device's. `effectiveNameOf` is the one expression, and
   * `everyday/rail.ts#railFooter` asks it too — `honesty/agreement.ts`'s `display-name` pair is
   * what catches the next reader that stops asking.
   */
  /*
   * **Named** rather than merely signed in, because {@link effectiveNameOf} offers the device-local
   * name while the account is still carrying the mint — so on the naming arm the field is showing
   * *this device's* name and {@link NAME_NOTE.account} would be a claim about the wrong one.
   */
  const account = input.account;
  const signedIn =
    account?.user !== undefined && !namingStage(account);
  const nameValue = input.draftName ?? effectiveNameOf(input.profile, input.account);
  const bridgeAbsent = input.reduceMotion === undefined;
  const units = input.units ?? DEFAULT_EVERYDAY_UNITS;
  return {
    eyebrow: 'ELEVATOR SIM · EVERYDAY MODE',
    title: 'Settings',
    lede:
      'Your name and picture travel with every run you post, so somebody watching your Friday ' +
      'sees them. Everything else here only changes how the game looks and sounds to you.',
    you: {
      heading: 'YOU',
      nameLabel: 'DISPLAY NAME',
      nameValue,
      nameIssue: displayNameIssueOf(nameValue),
      pictureLabel: 'PICTURE',
      /*
       * The disc follows the **committed** identity, so a refused draft never changes the letter on
       * it — and it follows the same one the field shows, which signed in is the account's.
       */
      initial: avatarInitialOf(effectiveNameOf(input.profile, input.account)),
      avatarColor: committed.avatarColor,
      swatches: AVATAR_SWATCHES.map((swatch) => ({
        id: swatch.id,
        color: swatch.color,
        selected: swatch.color === committed.avatarColor,
      })),
      note: signedIn ? NAME_NOTE.account : NAME_NOTE.device,
      signIn: signInViewOf(input),
      saveNotice:
        input.durable === false
          ? 'This device is not keeping storage, so the name, the picture and the Units choice ' +
            'below last until this tab closes.'
          : undefined,
    },
    playing: {
      heading: 'PLAYING',
      rows: [
        /*
         * Motion first, § 15.1's own order — and **absent** rather than dead while the Engineer
         * surface is still booting, because that row holds no value of its own and a press would
         * land nowhere. Units is below it and does not share that window: it holds its own value in
         * this device's own slot, so it is drawable from the first paint.
         */
        ...(bridgeAbsent
          ? []
          : ([
              {
                id: 'motion',
                label: 'Motion',
                note: 'cars and figures animate',
                value: input.reduceMotion === true ? 'reduced' : 'full',
                on: input.reduceMotion !== true,
              },
            ] as const)),
        {
          id: 'units',
          label: UNITS_ROW_COPY.label,
          note: UNITS_ROW_COPY.note,
          value: UNITS_ROW_COPY.face[units],
          /*
           * `on` is the pill's *filled* face rather than a claim about which unit is right, and it
           * is the non-default one here for the reason the Motion pill fills on `full`: the filled
           * face is the state a player chose, and metres is § 13's default rather than a choice.
           */
          on: units === 'imperial',
        },
      ],
      absentNote: bridgeAbsent
        ? 'The Motion switch is the simulator’s own, and the simulator is still loading — the row appears when it has.'
        : undefined,
    },
    device: {
      heading: 'THIS DEVICE',
      facts: [
        {
          label: 'Where your progress lives',
          value: 'this device',
          note:
            'Days, dispatchers, saved buildings and this screen’s name and picture are stored ' +
            'locally. Playing on another device starts a separate career, and signing in does not ' +
            'bring this one with you — an account carries who you are, not what you have done.',
        },
        {
          label: 'Replay verification',
          value: 'always on',
          note:
            'Every run you post is re-simulated by the server before it appears on a board. It ' +
            'cannot be turned off, and it is why the boards are worth reading.',
        },
      ],
    },
  };
}
