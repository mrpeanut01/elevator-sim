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
 * - **Sound — not drawn.** `grep -rn "mute\|Audio\|chime" packages/viz/src --include='*.ts'`
 *   finds no audio machinery anywhere in the tree; the prototype's own build note (§ 15.1) says
 *   this row had nothing behind it *there* either. Named in {@link SETTINGS_ABSENCES} instead.
 * - **Default speed — not drawn.** The prototype's row writes `st.speed`, § 18's Everyday
 *   `run.speed(1..5)` — state this build does not have: the day a player runs is the Engineer
 *   stage (§ D335's hand-off), whose ×-chips and `settings.playbackSpeed` multiplier belong to
 *   that surface and mean *how fast to watch a recording*, not *how fast a day starts*. Wiring
 *   this label to that mechanism would be a control doing something other than what it says.
 * - **Units — not drawn.** `grep -rin "imperial" packages/viz/src --include='*.ts'` finds **no
 *   non-test occurrence**: no field of `menu/types.ts`'s `Settings`, no display formatter, reads
 *   a metres-or-feet preference (`ratedLoadLb` and friends are reference-data identifiers, not a
 *   preference — CLAUDE.md's units convention). A row would persist a bit nothing consults.
 * - **Post runs to the board — not drawn.** `honesty/generate.ts` says it outright: *"There is
 *   no `settings.noPost` flag in this tree"* — the real gates are `menu/account.ts#postingRefusal`
 *   and `shift/banking.ts#bankingRefusalFor`, and neither reads a switch. The Everyday boards
 *   themselves are unbuilt (`screens.ts`: *needs a server to post and rank runs, and this build
 *   has none*).
 * - **This device's two statements shipped; its two actions did not.** *Where progress lives* and
 *   *Replay verification* are statements of fact with real seams (`persist/session.ts` and this
 *   screen's own `profileStore.ts`; the server's replay-before-board, which `dev/main.ts` reports
 *   as *"The server replayed your seed and it reproduced."*). *Clear saved progress* is refused
 *   because it would lie: `dev/main.ts` saves the running session on every state change, so a
 *   cleared slot is rewritten moments later and the button's claim does not survive its own
 *   click. *Switch to Engineer* used to be refused here in the rail's own words, and is now not
 *   named at all: the rail's § 3.2 footer row opens the Engineer surface, so the entry went with
 *   the refusal rather than being reworded — see the note where it stood. *Sign out* is refused
 *   because nothing on this surface is
 *   signed in — `menu/account.ts`'s session is the Engineer screen's, token in memory, and a
 *   button ending a session this screen never shows would be § 20.12's lie in reverse.
 *
 * ## Two copy deviations from the prototype, each with its constraint
 *
 * - The progress row's note drops *"campaign purses"* (no campaign purse exists in this tree) and
 *   says *playing* rather than *signing in* elsewhere starts a separate career (Everyday Mode has
 *   no sign-in). § 16 rule 5: derive, never assert — a stored-things list is a claim.
 * - The prototype's signed-in line (`Nadia R.` / `signed in · progress saved on this device`) and
 *   its no-op Sign out button are replaced by one honest sentence ({@link SettingsYouView.home}):
 *   an authored fixture presented as a player is § 20.11's own example.
 */

import { displayNameIssueOf } from '../menu/account.js';
import {
  AVATAR_SWATCHES,
  avatarInitialOf,
  DEFAULT_EVERYDAY_PROFILE,
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
  /** The prototype's `nameNote` — where the name shows up. */
  readonly note: string;
  /** The honest replacement for the prototype's signed-in line — see the module docstring. */
  readonly home: string;
  /** Said when a write did not survive the tab — a memory-only store or a refusing one. */
  readonly saveNotice: string | undefined;
}

/** One shipped toggle row — label, one-clause effect, and the pill's two faces. */
export interface SettingsToggleView {
  readonly id: 'motion';
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
  'Units — nothing in the viewer reads a metres-or-feet preference, so there is nothing for the switch to switch',
  'Post runs to the board — the boards need a server this build has none of, and no posting path reads such a switch',
  'Sign out — nothing on this surface is signed in; the name and picture above live on this device',
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
}

/** § 15.1's screen for this state. Total; every sentence a player can meet starts here. */
export function settingsScreenViewOf(input: SettingsScreenInput): SettingsScreenView {
  const committed = input.profile ?? DEFAULT_EVERYDAY_PROFILE;
  const nameValue = input.draftName ?? committed.name;
  const bridgeAbsent = input.reduceMotion === undefined;
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
      initial: avatarInitialOf(committed.name),
      avatarColor: committed.avatarColor,
      swatches: AVATAR_SWATCHES.map((swatch) => ({
        id: swatch.id,
        color: swatch.color,
        selected: swatch.color === committed.avatarColor,
      })),
      note:
        'This is the name on the daily board, on the ladder, and on any run somebody else watches.',
      home: 'Nothing on this screen is signed in — your name and picture live on this device.',
      saveNotice:
        input.durable === false
          ? 'This device is not keeping storage, so the name and picture last until this tab closes.'
          : undefined,
    },
    playing: {
      heading: 'PLAYING',
      rows: bridgeAbsent
        ? []
        : [
            {
              id: 'motion',
              label: 'Motion',
              note: 'cars and figures animate',
              value: input.reduceMotion === true ? 'reduced' : 'full',
              on: input.reduceMotion !== true,
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
            'locally. Playing on another device starts a separate career.',
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
