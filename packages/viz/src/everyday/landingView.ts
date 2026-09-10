/**
 * **The landing page, as words** — GitHub issue #244.
 *
 * The game used to begin at the game. Somebody arriving from a link met the mode picker and the
 * pointer to a register of what the build does not do yet, and nothing anywhere said what this is
 * or why its numbers are worth anything. This module is the page that says it, and
 * `landingScreen.ts` is the mount that draws it.
 *
 * ## Where the copy comes from, and why none of it is new marketing
 *
 * Every sentence here is either the product owner's own adopted statement of what the game is, or
 * a plain-language restatement of a claim the engine already delivers and the repository already
 * has evidence for. Nothing on this page is written to sell something that is not built. That
 * constraint is not decoration: a project whose whole character is refusing to say things it
 * cannot support would be worst betrayed on the one screen a stranger reads first.
 *
 * - The eyebrow, the headline's promise and {@link LANDING_COPY}'s `hook` come from the owner's
 *   one-page statement of the game, adopted 2026-09-06 — *"It does not round in your favour … When
 *   this game tells you your change worked, it worked"*, and that statement says in terms that it
 *   is the hook rather than the small print.
 * - The five entries in {@link LANDING_CLAIMS} are the repository's own front-page account of how
 *   much the numbers can be trusted, cut down to one sentence each with the mechanism underneath.
 *   Each `because` is a fact about shipped code: the five grounds for refusing a mean, common
 *   random numbers, the measured resolution limit, the closed-form check, and the seed on every
 *   record.
 * - The single call to action points at Scenario because the owner's ruling makes Scenario first
 *   on the menu and *"the only mode a first-time player should meet"*.
 *
 * ## What this page deliberately does not carry
 *
 * **The register of honest absences.** Every other screen in this product publishes what it cannot
 * do, and this one does not — which looks like the exact defect the rest of the tree exists to
 * prevent, so it is stated rather than left to be noticed. The issue that asked for this page names
 * the absence list as the *wrong* first impression: a stranger who arrives from a link and is
 * handed a list of what is missing has been told what the build is not before being told what it
 * is. The registers are unchanged, still complete, and still one press away in Settings. Nothing is
 * hidden; the order is different, and only on this one screen.
 *
 * **A figure of any kind.** No average, no percentile, no count of anything a run produced. That is
 * not caution — it is what makes the page cheap to keep true. A landing page carrying a measured
 * number is a landing page that goes stale on the next commit that moves it, and this repository
 * has recorded that failure often enough to stop volunteering for it.
 *
 * Pure. No DOM, no host, no reference-data read — the mount draws what this returns, and the
 * honesty search sweeps every arm of it without a document.
 */

import type { EverydayScreen } from './types.js';

/* -------------------------------------------------------------------------- *
 * What the page is made of
 * -------------------------------------------------------------------------- */

/**
 * One reason to believe the numbers, in two registers.
 *
 * `claim` is the half a player with no statistics reads and understands on its own. `because` is
 * the route to the detail the issue asks for, for the audience that wants it — the mechanism,
 * still in plain words, still carrying no figure. Both are drawn; the page does not fold the
 * second away, because a claim whose support is behind a press is a claim most readers meet
 * unsupported.
 */
export interface LandingClaim {
  /** Stable id — the search and the tests address rows by this, never by their position. */
  readonly id: string;
  /** The claim, in one sentence a reader can check against the product. */
  readonly claim: string;
  /** How the product delivers it. The detail, for whoever wants it. */
  readonly because: string;
}

/** The one way in. There is exactly one, and the tests hold that. */
export interface LandingCallToAction {
  readonly label: string;
  /** What pressing it gets you, so the button is a promise rather than a dare. */
  readonly note: string;
  /** Where it goes. A registered screen, asserted against the registry rather than against this. */
  readonly screen: EverydayScreen;
}

/**
 * What the block above the claims is doing right now.
 *
 * Three arms, all three drawn and all three swept. `playing` is the one the page is built for; the
 * other two exist because a page that showed a still frame and said nothing when its run had not
 * arrived — or could not — would be describing a thing it was failing to show.
 */
export type LandingMotionState = 'pending' | 'playing' | 'unavailable';

export interface LandingMotionView {
  readonly eyebrow: string;
  readonly note: string;
}

export interface LandingView {
  readonly eyebrow: string;
  readonly headline: string;
  readonly lede: string;
  readonly motion: LandingMotionView;
  readonly hook: string;
  readonly claimsHeading: string;
  readonly claims: readonly LandingClaim[];
  readonly callToAction: LandingCallToAction;
  readonly closing: string;
}

export interface LandingViewInput {
  readonly motion: LandingMotionState;
  /**
   * Whether this visitor has played nothing at all yet — the same derivation the walkthrough's own
   * gate uses, passed in rather than recomputed, so the two cannot disagree about who is new.
   *
   * It decides which of the two calls to action is drawn. There is still exactly one; what changes
   * is where it honestly goes, because the ruling that puts a two-screen walkthrough before
   * Scenario means a first visitor pressing a button labelled *play a scenario* would not get one.
   */
  readonly firstSession: boolean;
  /**
   * The tower the block is running, in the player's words.
   *
   * Passed rather than named in the copy, so a caption cannot go on naming a building the mount
   * stopped running. Empty when there is nothing running — the two arms that draw no building read
   * a sentence that mentions none.
   */
  readonly buildingName: string;
}

/* -------------------------------------------------------------------------- *
 * The copy
 * -------------------------------------------------------------------------- */

/**
 * Everything the page says that is not a claim or a button.
 *
 * ## The hero is bounded on purpose
 *
 * The issue asks for a page that communicates the game in fifteen seconds. That is not a
 * test-decidable sentence, so what is tested is a **proxy with its arithmetic in the open**:
 * `landingView.test.ts` holds the eyebrow, the headline and the lede to a word ceiling and states
 * plainly that the ceiling is chosen rather than measured. It fails on the defect it is written
 * for — a hero that grows into three paragraphs — and it claims nothing about how long anybody
 * actually takes to read it. Raising it is a visible edit a reviewer can refuse, which is the only
 * mechanism this repository trusts for a bound nobody can measure.
 */
export const LANDING_COPY = Object.freeze({
  eyebrow: 'Elevator Sim',
  headline: 'Run the lifts and find out whether it helped.',
  lede: 'A building full of people trying to get somewhere. Watch it struggle, change something, and see whether the people got there.',
  /** The owner's own statement of the game, and the reason the page can make the claims below. */
  hook: 'The engine underneath is a real lift simulator. It does not round in your favour. It will not give you an average for a queue that never cleared, and it will not call a fix a win from one lucky run. When this game tells you your change worked, it worked.',
  claimsHeading: 'It plays like a game and it measures like an instrument.',
  closing: 'That is the whole of the pitch. What this build cannot do yet is written down in full and checked for staleness, and it lives in Settings rather than here.',
  motionPendingEyebrow: 'Starting a building',
  motionPendingNote: 'Working out a morning, one person at a time. Nothing here is a recording, so it takes a moment to arrive.',
  motionUnavailableEyebrow: 'Nothing running',
  motionUnavailableNote: 'The building would not start on this device, so there is nothing to watch here. It is the only thing on this page that needs one, and everything else is unaffected.',
  motionPlayingEyebrow: 'Running now',
});

/**
 * The caption over a running block, composed rather than authored.
 *
 * The building's name comes from the run rather than from a sentence, so the one thing on this page
 * that could disagree with what is on screen cannot.
 */
function playingNote(buildingName: string): string {
  return `One morning at ${buildingName}, simulated here and played back at speed. It is the same engine every mode runs, and every person on it is going somewhere.`;
}

/**
 * The five reasons, in plain language, each one a thing the product does.
 *
 * Ordered by how easily a reader can check it: the refusal is the one they will meet in their first
 * session, and the closed-form check is the one that matters most to the audience that came for it.
 *
 * **Not on this list, deliberately.** The learned controller, which was measured three times and
 * refused three times; the double-deck verdict, which is true on a narrower base than its word
 * suggests; and every figure. The first two are honest results and belong where results are
 * published, not where a stranger is being told what the game is. The third would go stale.
 */
export const LANDING_CLAIMS: readonly LandingClaim[] = Object.freeze([
  Object.freeze({
    id: 'refuses',
    claim: 'It will not print an average for a queue that never cleared.',
    because:
      'A building the lifts never caught up with still has an average waiting time, arithmetically. That number tells you when you stopped watching, not how the building performs. There are five separate grounds on which the average is withheld, and when one of them bites the screen prints the reason where the number would have been.',
  }),
  Object.freeze({
    id: 'same-crowd',
    claim: 'Two ways of running the building race the same crowd, to the second.',
    because:
      'The same people arriving at the same second on the same floors wanting the same destinations, so a difference in the result is the change you made and not the luck of the draw. The pairing is checked on every run rather than assumed, and a race whose pairing has broken reports nothing at all.',
  }),
  Object.freeze({
    id: 'too-small',
    claim: 'Some differences are too small to see, and it tells you which.',
    because:
      'Below some size a difference cannot be told apart from noise at any sensible number of runs. That floor is measured rather than assumed, and it is measured again for each thing being compared. Anything underneath it is reported as too small to resolve — never as a win.',
  }),
  Object.freeze({
    id: 'closed-form',
    claim: 'The physics is checked against the answer a lift engineer would work out by hand.',
    because:
      'Under a morning rush the round trip, the interval and the handling capacity are checked against the standard hand calculation on every building that ships. Where the two disagree, the working assumption is that the simulator is wrong until somebody proves otherwise.',
  }),
  Object.freeze({
    id: 'replay',
    claim: 'Every run keeps the number it was drawn from, so any day can be run again exactly.',
    because:
      'Nothing in a run comes from the clock or from a shared source of randomness, so the same day replays the same way on any machine. A result you cannot reproduce is a result nobody has to take seriously, including us.',
  }),
]);

/**
 * The one way in for somebody who has played before — the owner's ruling, drawn as a button.
 *
 * **Exactly one is drawn, and that is the acceptance criterion rather than a preference.** The way
 * back to the mode picker is the shell's own leave row, drawn by the action bar under every screen,
 * so this page authors no second route and cannot acquire one without a test going red.
 */
export const LANDING_CALL_TO_ACTION: LandingCallToAction = Object.freeze({
  label: 'Play a scenario',
  note: 'A building with something wrong with it, a budget, and a verdict on whether you fixed it.',
  screen: 'scenario',
});

/**
 * The one way in for somebody who has played nothing — the same button, pointed where it goes.
 *
 * Two rulings meet on this page and neither bends. Scenario is the first mode and the only one a
 * first-time player should meet; and the first session is a two-screen walkthrough that sits
 * **before** Scenario rather than inside it. So on a first visit the one button opens the
 * walkthrough, and it **says** it opens the walkthrough. A button reading *play a scenario* that
 * handed a stranger a walkthrough would be a small lie told on the one screen this page exists to
 * be trusted on, which is a bad place to start.
 */
export const LANDING_FIRST_SESSION_CALL_TO_ACTION: LandingCallToAction = Object.freeze({
  label: 'Show me how it plays',
  note: 'Two screens on how a building fails and what to change, and then you are into it.',
  screen: 'tutorial',
});

/* -------------------------------------------------------------------------- *
 * The view
 * -------------------------------------------------------------------------- */

function motionViewOf(input: LandingViewInput): LandingMotionView {
  if (input.motion === 'playing') {
    return Object.freeze({
      eyebrow: LANDING_COPY.motionPlayingEyebrow,
      note: playingNote(input.buildingName),
    });
  }
  if (input.motion === 'unavailable') {
    return Object.freeze({
      eyebrow: LANDING_COPY.motionUnavailableEyebrow,
      note: LANDING_COPY.motionUnavailableNote,
    });
  }
  return Object.freeze({
    eyebrow: LANDING_COPY.motionPendingEyebrow,
    note: LANDING_COPY.motionPendingNote,
  });
}

/** The page, computed. */
export function landingViewOf(input: LandingViewInput): LandingView {
  return Object.freeze({
    eyebrow: LANDING_COPY.eyebrow,
    headline: LANDING_COPY.headline,
    lede: LANDING_COPY.lede,
    motion: motionViewOf(input),
    hook: LANDING_COPY.hook,
    claimsHeading: LANDING_COPY.claimsHeading,
    claims: LANDING_CLAIMS,
    callToAction: input.firstSession
      ? LANDING_FIRST_SESSION_CALL_TO_ACTION
      : LANDING_CALL_TO_ACTION,
    closing: LANDING_COPY.closing,
  });
}
