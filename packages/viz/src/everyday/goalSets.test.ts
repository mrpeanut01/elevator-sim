/**
 * **The career flow's two goal sets, and the one thing a player must be able to tell about them**
 * — GitHub issue **#567**.
 *
 * ## What was observed
 *
 * A playability assessor driving the built bundle read four bars on the building desk under
 * `WHAT DAY 1 ASKS`, pressed the primary, and met five different bars one click later under
 * `WHAT TODAY ASKS`. No shared value, four against five, two headings differing by one word. It
 * could not tell which decided the day, and named this first among the things holding Legibility
 * down.
 *
 * ## What is actually true, which is not what the issue assumed
 *
 * The issue says *only the second is graded*. It is not: **both** are graded, and they grade
 * different things.
 *
 * | | `campaignModel.ts#campaignTestGoals` | `shift/goals.ts#goalsForDay` |
 * |---|---|---|
 * | bars | `economy.ts#DIFFICULTIES[tier].tests`, fixed for the tier | `GOAL_BARS`, a ladder that hardens with the week's day |
 * | decides | `campaignDayVerdict` → `career.ts#fileDay`: the day is filed **cleared** or **missed** against the contract | `week.ts#outcomeOf`: the report's verdict, the streak, the banked clean day |
 * | drawn on | the building desk and the contract sheet | the brief, the § 7 stage strip, the report |
 *
 * Neither can be deleted without losing a grading rule, so § 567's second acceptance arm is the one
 * taken: **two sets, visibly distinct in what they are, each saying which it is.** No bar moved in
 * either set — reconciling them by choosing numbers would need a derivation pinned to a run, and
 * lowering either to make them agree is weakening a goal to make a day pass.
 *
 * ## What this file is for
 *
 * The acceptance criterion is *"asserted by a test that fails when the two sets' bars diverge
 * without the screen saying so, rather than by inspection"*. So the divergence is **measured here**
 * rather than assumed, and the obligation on the copy is conditional on it: if the two sets ever
 * become one set, the headings may converge and this file stops demanding two sentences. While they
 * differ, every screen that draws one of them has to say which it is and name the other.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { openingCareer } from '../campaign/career.js';
import { DIFFICULTIES } from '../campaign/economy.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import { TODAY_ASKS_DECIDES, TODAY_ASKS_HEADING, goalsForDay } from '../shift/goals.js';
import type { GoalObservations, ShiftGoal } from '../shift/types.js';

import {
  BUILDING_COPY,
  CONTRACT_ASKS_DECIDES,
  CONTRACT_ASKS_HEADING,
  buildingView,
  campaignTestGoals,
  contractAsksEyebrow,
  contractView,
  type CampaignInput,
} from './campaignModel.js';
import { STAGE_GOALS_COPY, stageGoalsOf } from './stageScreenModel.js';

/** Below the wake-up gate, so every reading is `pending` and nothing here is a stand-in figure. */
const NO_RUN: GoalObservations = Object.freeze({
  arrived: 0,
  carryPct: 100,
  minutePct: 100,
  peakQueue: 0,
  abandoned: 0,
  abandonedCarried: 0,
  horizonS: 0,
  worstWaitS: 0,
  worstWaitIsCensored: false,
});

const BUILDINGS = new Map([
  ['garden-apartments', { name: 'Garden Apartments', spec: '7 floors · 2 cars · 0.63 m/s · 240 people' }],
]);

function inputOf(): CampaignInput {
  return {
    schedule: shippedPriceSchedule(),
    career: openingCareer('eta'),
    buildings: BUILDINGS,
    dispatchers: [{ id: 'eta', name: 'Minimum estimated wait', note: undefined, saved: false }],
    observations: undefined,
    observationsBasis: 'whole-run',
    history: [],
  };
}

/** A bar's identity for this comparison: what it reads, which way, and against what. */
const barOf = (goal: ShiftGoal): string =>
  `${goal.reads}:${goal.compare}:${String(goal.bar)}${goal.unit}`;

/**
 * Whether the two sets are the same set of bars.
 *
 * Compared on what a goal **is** rather than on its label, because two identical bars worded
 * differently are still one question and would not confuse anybody; and as a **set**, because the
 * order a screen lists them in is not what the player was confused by.
 */
function setsAgree(): boolean {
  const contract = new Set(campaignTestGoals(DIFFICULTIES.standard).map(barOf));
  /* Every rung of the ladder, not one: the daily set hardens and the contract set does not, so a
     single day could coincide while the two sets are still different questions. */
  return [...Array(20).keys()].every((index) => {
    const today = new Set(goalsForDay(index + 1).map(barOf));
    return (
      today.size === contract.size && [...today].every((entry) => contract.has(entry))
    );
  });
}

describe('§ 567 — the two goal sets a career player meets one click apart', () => {
  /**
   * The premise, measured.
   *
   * Everything below is conditional on this, so it is asserted rather than assumed: if a later wave
   * reconciles the two sets, this case fails first and says so, and the obligations below relax on
   * the same commit rather than becoming ceremony over one set of bars.
   */
  it('are genuinely two different sets of bars, on every day of the contract', () => {
    expect(setsAgree()).toBe(false);
    /* And the shape the assessor met: four against five. Derived, never written down twice. */
    expect(campaignTestGoals(DIFFICULTIES.standard)).toHaveLength(4);
    expect(goalsForDay(1)).toHaveLength(5);
  });

  it('carry headings that cannot be read as the same promise', () => {
    if (setsAgree()) return;
    expect(CONTRACT_ASKS_HEADING).not.toBe(TODAY_ASKS_HEADING);
    /*
     * Not merely different: neither may contain the other, which is what `WHAT DAY 1 ASKS` against
     * `WHAT TODAY ASKS` failed by. Both directions, over the whole contract's days, because the
     * contract's eyebrow carries a day number and a later rewording could reintroduce the overlap
     * on one day only.
     */
    for (let day = 1; day <= 20; day += 1) {
      const eyebrow = contractAsksEyebrow(day);
      expect(eyebrow).toContain(CONTRACT_ASKS_HEADING);
      expect(eyebrow).not.toContain(TODAY_ASKS_HEADING);
      expect(TODAY_ASKS_HEADING).not.toContain(eyebrow);
    }
  });

  /**
   * § 567's third arm: *if both sets stay, the ungraded one states on its own face that it is not
   * what the day is scored on.* Neither is ungraded, so the obligation is taken in the stronger
   * form that survives the correction — **each** says what it decides and names the other.
   */
  it('each say what they decide, and each name the other set', () => {
    if (setsAgree()) return;
    expect(CONTRACT_ASKS_DECIDES).toContain(TODAY_ASKS_HEADING);
    expect(CONTRACT_ASKS_DECIDES).toMatch(/cleared|missed/u);
    expect(TODAY_ASKS_DECIDES).toContain(CONTRACT_ASKS_HEADING);
    expect(TODAY_ASKS_DECIDES).toMatch(/report|streak/u);
  });

  it('draw those sentences on the three screens that draw the bars', () => {
    if (setsAgree()) return;
    const desk = buildingView(inputOf());
    expect(desk?.tests.eyebrow).toBe(contractAsksEyebrow(1));
    expect(desk?.tests.decides).toBe(CONTRACT_ASKS_DECIDES);

    const sheet = contractView(inputOf());
    expect(sheet?.tests.eyebrow).toBe(contractAsksEyebrow(1));
    expect(sheet?.tests.decides).toBe(CONTRACT_ASKS_DECIDES);

    /*
     * And the stage, which is where the five are read while the four are one click behind. Only on
     * a career run: outside one there is no second set, and a screen disclaiming a rival the player
     * has never seen would be an absence dressed as a warning.
     */
    const strip = (contract: boolean) =>
      stageGoalsOf({
        readings: [],
        observations: NO_RUN,
        simTimeS: 0,
        endedAt: 600,
        history: [],
        day: 1,
        contract,
      });
    expect(strip(true).heading).toBe(TODAY_ASKS_HEADING);
    expect(strip(true).contract).toBe(STAGE_GOALS_COPY.contract);
    expect(strip(true).contract).toBe(TODAY_ASKS_DECIDES);
    expect(strip(false).contract).toBe('');
  });

  /**
   * **One heading, one owner, one reader per surface** — § 567's second acceptance arm, and the
   * three-literal problem `stageScreenModel.ts` named and left for the next lane.
   *
   * Asserted at the source because that is the only place the claim is checkable: a constant three
   * modules import is indistinguishable at run time from three identical literals, and it was three
   * identical literals until this commit — one of which, `BUILDING_COPY.testsEyebrow`, no screen
   * read at all.
   *
   * The scan is over **single-quoted** occurrences, which is what an authored string literal looks
   * like in this tree; the phrase appears in several docstrings in backticks and those are prose
   * about the constant rather than copies of it.
   */
  it('state each heading exactly once in the tree, beside the goals it heads', () => {
    const root = new URL('../', import.meta.url);
    const sources = ['shift/goals.ts', 'everyday/campaignModel.ts', 'everyday/stageScreenModel.ts', 'everyday/briefView.ts'];
    const counts = new Map<string, number>();
    for (const relative of sources) {
      const text = readFileSync(fileURLToPath(new URL(relative, root)), 'utf8');
      for (const phrase of [TODAY_ASKS_HEADING, CONTRACT_ASKS_HEADING]) {
        const literal = `'${phrase}'`;
        counts.set(literal, (counts.get(literal) ?? 0) + text.split(literal).length - 1);
      }
    }
    expect(counts.get(`'${TODAY_ASKS_HEADING}'`)).toBe(1);
    expect(counts.get(`'${CONTRACT_ASKS_HEADING}'`)).toBe(1);
    /* And the heading this replaced is gone rather than left beside its replacement. */
    const campaign = readFileSync(fileURLToPath(new URL('everyday/campaignModel.ts', root)), 'utf8');
    expect(campaign).not.toContain('`WHAT DAY ${String(tower.day)} ASKS`');
    expect(campaign).not.toContain('testsEyebrow:');
    /*
     * The dead copy is deleted and not merely unread: `BUILDING_COPY` is iterated generically by
     * `honesty/surfaces.ts`, so a key left behind would keep being swept as a heading no screen
     * draws — a string in the corpus that no player can meet.
     */
    expect(Object.keys(BUILDING_COPY)).not.toContain('testsEyebrow');
  });
});
