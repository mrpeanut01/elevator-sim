/**
 * **The worked answer, and the one component § D529 clause 2 forbids building twice.**
 *
 * *"Screen two is reused as the Rush tutorial when the player later opens Rush. Building it twice
 * is what this clause exists to prevent."* GitHub issue #380 asks for that to be **proved rather
 * than intended**: *"Screen two's component is reused by Rush, driven from both entry points in one
 * test."* The first case below is that test — one set of facts, both entry points, one comparison.
 *
 * The boundary itself (§ D529 clause 4 — *permitted in the tutorial and nowhere else*) is enforced
 * by `boundaries.test.ts`, in the import-allowlist shape that file already uses for `menu/client.js`.
 * This file is about what the component *says*; that one is about who may say it.
 */

import { describe, expect, it } from 'vitest';

import { RUSH_TUTORIAL_WHY, rushTutorialWorkedAnswerOf } from './rushScreenModel.js';
import { TUTORIAL_COPY, tutorialWorkedAnswerOf } from './tutorialModel.js';
import { WORKED_ANSWER_COPY, workedAnswerViewOf, type WorkedAnswerFacts } from './workedAnswer.js';

/**
 * A measured pair, in the shape `tutorialModel.ts#workedAnswerFactsOf` produces.
 *
 * The counts here are illustrative and the guard against that mattering is
 * `tutorialRuns.test.ts`, which builds the same facts from two `recordRun` recordings and drives
 * **both** entry points over them. What this file is for is the wording, which is a function of the
 * facts rather than of where they came from.
 */
const FACTS: WorkedAnswerFacts = {
  diagnosis: 'The standing order always sends the nearest car and never spreads the fleet.',
  reasoning: 'Every long wait began with all three cars standing at the bottom of the run.',
  change: 'Push the idle cars apart',
  effect: 'Parks one idle car per stretch of the building instead of three together.',
  measure: 'waits over a minute starting at the upper flats',
  before: 7,
  after: 1,
  sameCrowd: true,
};

describe('§ D529 clause 2 — one component, two entry points', () => {
  it('says the same thing from the tutorial and from Rush, except why it is saying it', () => {
    /*
     * **The reuse, proved.** Both entry points are driven here, in one case, over one set of facts,
     * and every field but the framing line is compared for equality. That is the strongest form the
     * criterion can take without a browser: a second worked answer written for the rush would differ on
     * a heading, a basis line or a count, and this comparison is what would see it.
     */
    const fromTutorial = tutorialWorkedAnswerOf(FACTS);
    const fromRush = rushTutorialWorkedAnswerOf(FACTS);

    // The one field they are allowed to differ on — and they must, because the reason differs.
    expect(fromTutorial.why).toBe(TUTORIAL_COPY.workedWhy);
    expect(fromRush.why).toBe(RUSH_TUTORIAL_WHY);
    expect(fromTutorial.why).not.toBe(fromRush.why);

    // Everything else is identical, by construction rather than by review.
    const { why: _tutorialWhy, ...tutorialBody } = fromTutorial;
    const { why: _rushWhy, ...rushBody } = fromRush;
    expect(rushBody).toEqual(tutorialBody);

    // And the body is not empty, so the comparison above is a comparison of something.
    expect(Object.keys(tutorialBody).length).toBeGreaterThan(8);
    for (const [field, text] of Object.entries(tutorialBody)) {
      expect(text.trim(), `${field} is blank`).not.toBe('');
    }
  });

  it('carries the boundary on its own face, from either entry point', () => {
    /*
     * § D529 clause 4 is a rule about the product, and a player who meets a worked answer once and
     * never again is owed the sentence that says so. It is on the screen rather than only in a
     * docstring for the same reason every refusal in this build is.
     */
    for (const view of [tutorialWorkedAnswerOf(FACTS), rushTutorialWorkedAnswerOf(FACTS)]) {
      expect(view.boundary).toBe(WORKED_ANSWER_COPY.boundary);
      expect(view.boundary).toContain('the only place the game answers for you');
    }
  });
});

describe('the counts are the runs’, and the wording follows them', () => {
  it('quotes each count with the measure it is a count of', () => {
    const view = tutorialWorkedAnswerOf(FACTS);
    expect(view.before).toBe('7 waits over a minute starting at the upper flats');
    expect(view.after).toBe('1 waits over a minute starting at the upper flats');
  });

  it('rounds a scoped mean to one place rather than printing a float', () => {
    const view = tutorialWorkedAnswerOf({ ...FACTS, before: 48.92, after: 31.147 });
    expect(view.before).toContain('48.9');
    expect(view.after).toContain('31.1');
  });

  it('says a change that moved nothing moved nothing', () => {
    /*
     * The arm that makes the component honest rather than promotional. A worked answer whose own
     * runs did not move is still a worked answer — it is a wrong one — and wording it as a win is
     * the fabrication § D529's *real runs* obligation exists to prevent.
     * `tutorialRuns.test.ts` asserts the shipped tutorial does not reach this arm, which is what
     * makes it a guard rather than decoration.
     */
    expect(tutorialWorkedAnswerOf({ ...FACTS, before: 7, after: 7 }).movement).toContain(
      'moved this count by nothing',
    );
  });

  it('says a change that made it worse made it worse', () => {
    const view = tutorialWorkedAnswerOf({ ...FACTS, before: 3, after: 9 });
    expect(view.movement).toContain('worse');
    expect(view.movement).toContain('3');
    expect(view.movement).toContain('9');
  });

  it('reports the share that went away only when there was something to go away', () => {
    expect(tutorialWorkedAnswerOf(FACTS).movement).toContain('86 %');
    // Nothing to divide by: no share, and no `NaN %` either.
    const fromZero = tutorialWorkedAnswerOf({ ...FACTS, before: 0, after: 0 });
    expect(fromZero.movement).not.toContain('%');
    expect(fromZero.movement).not.toContain('NaN');
  });

  it('changes its basis line when the two runs did not meet the same crowd', () => {
    /*
     * § D350's rule, kept: a pair that shares a crowd is paired and one that does not is not, and
     * the line says which. The tutorial's own repair is a dispatcher setting and never moves who
     * arrives — `tutorialRuns.test.ts` measures that on the legs — so this arm ships unreached and
     * is asserted here rather than assumed away.
     */
    expect(tutorialWorkedAnswerOf(FACTS).basis).toBe(WORKED_ANSWER_COPY.basisSameCrowd);
    expect(tutorialWorkedAnswerOf({ ...FACTS, sameCrowd: false }).basis).toBe(
      WORKED_ANSWER_COPY.basisDifferentCrowd,
    );
  });

  it('authors no figure of its own — every digit on the screen came from the facts', () => {
    for (const text of Object.values(WORKED_ANSWER_COPY)) {
      expect(/\d/u.test(text), `a worked-answer string carries its own figure: "${text}"`).toBe(
        false,
      );
    }
    expect(/\d/u.test(RUSH_TUTORIAL_WHY)).toBe(false);
  });

  it('takes its framing from the caller and nothing else', () => {
    // The seam both entry points go through, driven directly: `why` is the caller's word and every
    // other field is a function of the facts.
    const custom = workedAnswerViewOf(FACTS, 'because a test said so');
    expect(custom.why).toBe('because a test said so');
    const { why: _why, ...body } = custom;
    const { why: _tutorialWhy, ...tutorialBody } = tutorialWorkedAnswerOf(FACTS);
    expect(body).toEqual(tutorialBody);
  });
});
