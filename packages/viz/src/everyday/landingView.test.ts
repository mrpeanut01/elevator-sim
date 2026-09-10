/**
 * **The landing page's words, held to the four things about them that can be checked** — GitHub
 * issue #244.
 *
 * The issue asks for five things and **one of them is not test-decidable**: *"it shows the game in
 * motion rather than describing it"* is a judgement about a canvas, and no assertion in this file
 * claims to have made it. `landingScreen.browser.test.ts` drives the block that carries the motion
 * and asserts what a machine can see — that a run is asked for, that pixels move, and that the page
 * says so honestly when neither happens. Whether the result is *compelling* is a person's call, and
 * saying that plainly here is cheaper for the next reader than a test whose name implies otherwise.
 *
 * What this file does hold:
 *
 * 1. **The hero fits fifteen seconds — by a proxy whose arithmetic is in the open.** A word ceiling.
 *    It is a chosen number and not a measured reading rate, and it is written down as chosen. It
 *    fails on the defect it exists for: a hero that grows into three paragraphs.
 * 2. **Exactly one call to action.** The acceptance criterion, as an assertion over the shipped
 *    constant rather than over a screenshot.
 * 3. **Every claim is supported and none of them carries a figure.** The second half is the one
 *    that keeps this page from going stale: a landing page with a measured number on it is wrong on
 *    the next commit that moves the number, and this repository has recorded that failure often
 *    enough not to volunteer for it again.
 * 4. **Every word declared is drawn.** Wave T's lesson one directory over: a constant in a copy
 *    table that no arm of the view reads is a string nothing sweeps and nobody sees.
 */

import { describe, expect, it } from 'vitest';

import { probabilityWordIn } from '../campaign/words.js';
import {
  LANDING_CALL_TO_ACTION,
  LANDING_CLAIMS,
  LANDING_COPY,
  LANDING_FIRST_SESSION_CALL_TO_ACTION,
  landingViewOf,
  type LandingMotionState,
  type LandingView,
} from './landingView.js';
import { EVERYDAY_SCREENS_BUILT } from './screens.js';

const MOTION_STATES: readonly LandingMotionState[] = ['pending', 'playing', 'unavailable'];
const BUILDING = 'Midtown Office';

/**
 * **The fifteen-second proxy, and it is a chosen number.**
 *
 * The issue's first criterion is *"a landing page that communicates the game in fifteen seconds"*.
 * Nothing in this container can measure that. What can be measured is how much there is to read
 * before anything else, so the hero — the eyebrow, the headline and the lede, the three things
 * drawn above the fold — is bounded at forty-five words.
 *
 * **Forty-five is chosen, not derived**, and the honest form of that is to say so rather than to
 * cite a reading rate this repository has not measured and cannot check. The shipped hero is
 * thirty-two words, so there is room; the ceiling exists to fail the growth, not to sit on the
 * current value. Raising it is a visible edit a reviewer can refuse, which is the only mechanism
 * this repository trusts for a bound nobody can measure — the bundle budget one file over is the
 * same shape for the same reason.
 */
const HERO_WORD_CEILING = 45;

/**
 * The hero, as the words a reader meets before anything else.
 *
 * Here rather than beside the view, and the dead-code audit is what moved it: an exported helper
 * whose only caller is this file is the defect this repository has shipped eleven times in code,
 * and a word count is a thing a test wants rather than a thing the product does. What *is* in the
 * view is the three fields it reads, so this cannot drift away from the page without failing to
 * compile.
 */
function heroWords(view: LandingView): readonly string[] {
  return [view.eyebrow, view.headline, view.lede]
    .join(' ')
    .split(/\s+/u)
    .filter((word) => word !== '');
}

/** Every string the page draws, in every arm, with the field that produced it. */
function drawnStrings(view: LandingView): readonly (readonly [string, string])[] {
  return [
    ['eyebrow', view.eyebrow],
    ['headline', view.headline],
    ['lede', view.lede],
    ['motion.eyebrow', view.motion.eyebrow],
    ['motion.note', view.motion.note],
    ['hook', view.hook],
    ['claimsHeading', view.claimsHeading],
    ...view.claims.flatMap(
      (claim) =>
        [
          [`claim.${claim.id}.claim`, claim.claim],
          [`claim.${claim.id}.because`, claim.because],
        ] as const,
    ),
    ['callToAction.label', view.callToAction.label],
    ['callToAction.note', view.callToAction.note],
    ['closing', view.closing],
  ];
}

/**
 * Every state the page distinguishes — the three motion arms crossed with both visitors.
 *
 * Crossed rather than sampled, because the two axes decide different halves of the page and a
 * sweep over one of them would leave the other's second value asserted by nothing. It is also the
 * exact set `honesty/surfaces.ts` seeds, so a state that stops being checked here stops being
 * swept there on the same commit.
 */
const everyArm = (): readonly LandingView[] =>
  MOTION_STATES.flatMap((motion) =>
    [true, false].map((firstSession) =>
      landingViewOf({ motion, buildingName: BUILDING, firstSession }),
    ),
  );

const playing = (firstSession = false): LandingView =>
  landingViewOf({ motion: 'playing', buildingName: BUILDING, firstSession });

describe('the landing page communicates the game in fifteen seconds — GitHub issue #244', () => {
  it(`draws a hero of at most ${String(HERO_WORD_CEILING)} words`, () => {
    for (const view of everyArm()) {
      const words = heroWords(view);
      expect(
        words.length,
        `the hero is ${String(words.length)} words against a ceiling of ${String(
          HERO_WORD_CEILING,
        )}. The ceiling is chosen rather than measured and says so; raising it is the visible edit ` +
          'a reviewer can refuse. Cutting the lede is the other option, and it is usually the right one.',
      ).toBeLessThanOrEqual(HERO_WORD_CEILING);
    }
  });

  it('says nothing above the fold that needs a second sentence to make sense', () => {
    /*
     * The other half of *fifteen seconds*, and it is a shape rather than a length: the eyebrow
     * names the thing, the headline is one sentence, and the lede is at most two. A headline that
     * had become a paragraph would pass the word ceiling on its own and fail this.
     */
    const view = playing();
    const sentences = (text: string): number => text.split(/[.!?]+\s|[.!?]+$/u).filter((part) => part.trim() !== '').length;
    expect(sentences(view.headline), 'the headline is more than one sentence').toBeLessThanOrEqual(1);
    expect(sentences(view.lede), 'the lede is more than two sentences').toBeLessThanOrEqual(2);
  });
});

describe('one primary call to action — GitHub issue #244', () => {
  it('offers exactly one, and it goes to a screen the registry builds', () => {
    const view = playing();
    /*
     * The shape carries the count: `callToAction` is one field rather than a list, so a second way
     * in cannot be added without changing the type — which is the edit this case makes visible.
     * The way *back* to the mode picker is the shell's leave row, drawn by the action bar under
     * every screen, so it is not this page's and is not counted here.
     */
    expect(Object.keys(view).filter((key) => key.toLowerCase().includes('call'))).toEqual([
      'callToAction',
    ]);
    expect(view.callToAction.label.trim()).not.toEqual('');
    expect(view.callToAction.note.trim()).not.toEqual('');
    expect(
      EVERYDAY_SCREENS_BUILT,
      'the one way in points at a screen the registry does not build, so the only button on the ' +
        'landing page would open a refusal.',
    ).toContain(view.callToAction.screen);
  });

  it('opens the walkthrough on a first visit and Scenario afterwards, and says which', () => {
    /*
     * Two rulings meet here and neither bends: Scenario is the first mode, and the two-screen
     * walkthrough sits before Scenario rather than inside it. So the one button changes where it
     * goes, and the assertion that matters is that it changes what it **says** at the same time —
     * a button reading *play a scenario* that opened a walkthrough would be the small lie this
     * page can least afford.
     */
    expect(LANDING_FIRST_SESSION_CALL_TO_ACTION.screen).toBe('tutorial');
    expect(LANDING_CALL_TO_ACTION.screen).toBe('scenario');
    expect(playing(true).callToAction).toEqual(LANDING_FIRST_SESSION_CALL_TO_ACTION);
    expect(playing(false).callToAction).toEqual(LANDING_CALL_TO_ACTION);
    expect(
      LANDING_FIRST_SESSION_CALL_TO_ACTION.label,
      'both arms of the one button read the same, so the label says nothing about where it goes',
    ).not.toEqual(LANDING_CALL_TO_ACTION.label);
    for (const cta of [LANDING_CALL_TO_ACTION, LANDING_FIRST_SESSION_CALL_TO_ACTION]) {
      expect(EVERYDAY_SCREENS_BUILT, cta.label).toContain(cta.screen);
    }
  });
});

describe('the credibility argument is present and plain — GitHub issue #244', () => {
  it('states every claim with the mechanism under it', () => {
    expect(LANDING_CLAIMS.length).toBeGreaterThanOrEqual(4);
    for (const claim of LANDING_CLAIMS) {
      expect(claim.id.trim(), 'a claim with no id cannot be addressed by a test or by the search').not.toEqual('');
      expect(claim.claim.trim().length, claim.id).toBeGreaterThan(20);
      expect(
        claim.because.trim().length,
        `the claim "${claim.id}" is asserted and not supported. The route to the detail is the ` +
          'whole of what this page offers the audience that came for it.',
      ).toBeGreaterThan(60);
    }
    expect(
      [...new Set(LANDING_CLAIMS.map((claim) => claim.id))].length,
      'two claims share an id',
    ).toBe(LANDING_CLAIMS.length);
  });

  it('publishes no figure anywhere on the page', () => {
    /*
     * **The rule that keeps this page cheap to keep true.** A landing page carrying a measured
     * number is wrong on the next commit that moves the number, and nothing in this repository
     * would notice — the honesty search checks whether a figure is *licensed*, not whether it is
     * *current*. So the page carries none: every quantity it names is spelled as a word, and a
     * digit anywhere in a drawn string fails here.
     *
     * It is deliberately cruder than it needs to be. A year, a version or a percentage would all
     * be refused too, and all three would be the same maintenance problem in a different hat.
     */
    for (const view of everyArm()) {
      for (const [field, text] of drawnStrings(view)) {
        expect(
          /\d/u.test(text),
          `${field} carries a digit: "${text}". A figure on this page is a figure nothing ` +
            're-derives. Spell the quantity as a word, or move the sentence to a screen that ' +
            'draws the number from the run that produced it.',
        ).toBe(false);
      }
    }
  });

  it('uses no word for how sure something is', () => {
    /*
     * The shipped gate rather than a second copy of the list — `campaign/words.ts` says in as many
     * words that two test-local copies already exist and that quietly adding a third is how a
     * guard's meaning erodes. The honesty search checks this too, over the whole corpus; this case
     * fails in under a second and names the field, which is worth having on the surface most
     * likely to attract a hedge.
     */
    for (const view of everyArm()) {
      for (const [field, text] of drawnStrings(view)) {
        expect(probabilityWordIn(text), `${field}: "${text}"`).toBeNull();
      }
    }
  });
});

describe('the block that shows the game in motion says what it is doing', () => {
  it('draws a different eyebrow and note in each of the three arms', () => {
    const arms = everyArm();
    const eyebrows = arms.map((view) => view.motion.eyebrow);
    const notes = arms.map((view) => view.motion.note);
    expect(new Set(eyebrows).size, 'two arms of the block read the same').toBe(MOTION_STATES.length);
    expect(new Set(notes).size, 'two arms of the block read the same').toBe(MOTION_STATES.length);
    /* The block is the same in both visitors' arms — it is the button that moves, not the canvas. */
    expect(playing(true).motion).toEqual(playing(false).motion);
    for (const text of [...eyebrows, ...notes]) expect(text.trim()).not.toEqual('');
  });

  it('names the building it is actually running, and names none when it is running nothing', () => {
    /*
     * The one thing on this page that could disagree with what is on screen. The caption is
     * composed from the run's own building rather than authored, so a page that started running a
     * different tower cannot go on captioning the old one.
     */
    expect(
      landingViewOf({ motion: 'playing', buildingName: 'Crown Hotel', firstSession: false }).motion
        .note,
    ).toContain('Crown Hotel');
    expect(playing().motion.note).toContain(BUILDING);
    for (const motion of ['pending', 'unavailable'] as const) {
      expect(
        landingViewOf({ motion, buildingName: BUILDING, firstSession: false }).motion.note,
        'a block that is running nothing names a building anyway',
      ).not.toContain(BUILDING);
    }
  });
});

describe('every word the page declares is a word the page draws', () => {
  it('reads every entry in the copy table in some arm of the view', () => {
    /*
     * Wave T's finding, one directory over: three keys sat in a copy table classified as covered
     * and were reached by nothing. **Being declared is not being drawn.** Every value here is
     * matched against the union of the three arms' strings, so a key that stops being read fails
     * rather than becoming an unswept string nobody sees.
     */
    const drawn = new Set(everyArm().flatMap((view) => drawnStrings(view).map(([, text]) => text)));
    for (const [key, text] of Object.entries(LANDING_COPY)) {
      const isDrawn = drawn.has(text) || [...drawn].some((one) => one.includes(text));
      expect(
        isDrawn,
        `the copy entry "${key}" is declared and drawn by no arm of the view. Either the view ` +
          'stopped reading it or it was never wired — both are a string the search cannot reach.',
      ).toBe(true);
    }
  });
});
