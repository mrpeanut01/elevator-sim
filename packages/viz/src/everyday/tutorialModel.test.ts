/**
 * **The tutorial's gate, its lesson, and the boundary it sits outside** — [§ D529](../../../../DECISIONS.md),
 * GitHub issue **#380**.
 *
 * Four of #380's eight criteria are decided in `tutorialModel.ts` rather than on a screen, and this
 * file is where each becomes an assertion rather than a paragraph:
 *
 * | criterion | what is asserted here |
 * |---|---|
 * | conditioned on derived state, never a stored flag | the gate's whole input, and the source of the interface it reads |
 * | skipping advances the derived state | the property over the space, and the exit both ways out call |
 * | one lesson across two screens | the walkthrough's control resolves to the case's own repair |
 * | outside `docs/33`'s difficulty curve | mechanically, and against the document's own sentence |
 *
 * The two that are not here are the reuse (`workedAnswer.test.ts`, which drives both entry points
 * in one case) and the real runs (`tutorialRuns.test.ts`, which runs the engine).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { plainLeversOf } from '../mode/plainLevers.js';
import {
  TUTORIAL_ABSENCES,
  TUTORIAL_CASE_ID,
  TUTORIAL_COPY,
  TUTORIAL_STEPS,
  tutorialCollapseViewOf,
  tutorialIsDue,
  tutorialWalkthroughViewOf,
  type TutorialProgress,
} from './tutorialModel.js';

const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
const read = (path: string): string => readFileSync(join(REPO, path), 'utf8');

const MODEL_SOURCE = read('packages/viz/src/everyday/tutorialModel.ts');
const SCREENS_SOURCE = read('packages/viz/src/everyday/tutorialScreens.ts');
const SHELL_SOURCE = read('packages/viz/src/everyday/shell.ts');

/** A player who has produced nothing. The one state § D476's condition is about. */
const NOTHING_YET: TutorialProgress = { filedDays: 0, solvedCases: 0, ratings: 0 };

describe('the gate is derived state, and § D476 says which kind', () => {
  it('is due for a player who has produced nothing, and for nobody else', () => {
    expect(tutorialIsDue(NOTHING_YET)).toBe(true);
    /*
     * Exhaustive over the three counts at 0 and 1, which is the whole shape of the predicate: any
     * one of them moving closes the gate. Written as a sweep rather than three cases so a fourth
     * count added to `TutorialProgress` without a clause here fails to compile rather than passing
     * silently.
     */
    for (const filedDays of [0, 1]) {
      for (const solvedCases of [0, 1]) {
        for (const ratings of [0, 1]) {
          const progress: TutorialProgress = { filedDays, solvedCases, ratings };
          expect(tutorialIsDue(progress), JSON.stringify(progress)).toBe(
            filedDays === 0 && solvedCases === 0 && ratings === 0,
          );
        }
      }
    }
  });

  it('reads no flag — the interface it is given has no boolean to hide one in', () => {
    /*
     * § D476 turns on the difference between a *stored flag* and *derived state*, and the cheapest
     * mechanical form of that difference is the shape of what the predicate is handed. A
     * `seenTutorial: boolean` is what a stored flag arrives as, so the source of the interface is
     * read and any boolean in it is red.
     *
     * The source rather than the type, because a type test cannot fail on a field that is *added*
     * — it can only fail on one that is used wrongly, and the defect here is a field existing at
     * all.
     */
    const block = /export interface TutorialProgress \{([\s\S]*?)\n\}/u.exec(MODEL_SOURCE)?.[1];
    expect(block, 'TutorialProgress moved or was renamed — this guard is about its shape').toBeTypeOf(
      'string',
    );
    expect(/\bboolean\b/u.test(block ?? ''), block ?? '').toBe(false);
    // And the three fields are counts, which is what makes them re-derivable on every load.
    expect((block ?? '').match(/:\s*number;/gu) ?? []).toHaveLength(3);
  });

  it('touches no storage of its own — nothing in the tutorial writes a key', () => {
    /*
     * The other half of *never on a stored flag*, over the two modules the tutorial owns: the gate
     * is a function of state other subsystems already persist for their own reasons (the week, the
     * profile), and the tutorial must not acquire a slot of its own to remember being seen in.
     */
    for (const [name, source] of [
      ['tutorialModel.ts', MODEL_SOURCE],
      ['tutorialScreens.ts', SCREENS_SOURCE],
    ] as const) {
      expect(/localStorage|sessionStorage|SESSION_KEY|PROFILE_KEY/u.test(source), name).toBe(false);
    }
  });
});

describe('§ D476’s playability condition — skipping advances the state', () => {
  it('closes the gate for every progress that a filed day can reach it from', () => {
    /*
     * The property, not an example: *every* progress this gate answers `true` for answers `false`
     * once a day is filed. There is exactly one such progress — `tutorialIsDue` is a conjunction of
     * three zeroes — and asserting it as a sweep rather than as a literal is what makes a fourth
     * clause added to the gate arrive here rather than pass.
     */
    const due: TutorialProgress[] = [];
    for (const filedDays of [0, 1, 2]) {
      for (const solvedCases of [0, 1]) {
        for (const ratings of [0, 1]) {
          const progress = { filedDays, solvedCases, ratings };
          if (tutorialIsDue(progress)) due.push(progress);
        }
      }
    }
    expect(due.length).toBeGreaterThan(0);
    for (const progress of due) {
      expect(
        tutorialIsDue({ ...progress, filedDays: progress.filedDays + 1 }),
        `a filed day must close the gate, and did not for ${JSON.stringify(progress)}`,
      ).toBe(false);
    }
  });

  it('leaves by the same door on Skip and on Finish, and that door files the day', () => {
    /*
     * The condition is only satisfiable if the skip actually moves the week, so the mount is read
     * off disk: `leave` must be what both the skip button and the § 3.3 primary call, and it must
     * be the one place that runs and files. A skip wired to `go('menu')` on its own would pass
     * every assertion above and hand the screen straight back on the next load, which is the exact
     * defect § D476's condition names.
     */
    const leaveBody = /function leave\(context: EverydayScreenShellContext\): void \{([\s\S]*?)\n\}/u
      .exec(SCREENS_SOURCE)?.[1];
    expect(leaveBody, 'leave() moved or was renamed').toBeTypeOf('string');
    expect(leaveBody ?? '').toContain('host.startRun()');
    expect(leaveBody ?? '').toContain('host.closeDay()');
    /*
     * And the close **waits for the landing**. `startRun` returns before the run lands, so a
     * `closeDay` on the next line meets `closeShift`'s *a run nobody started files nothing* gate
     * and the derived state does not move — § D476's condition failing silently in exactly the way
     * it warns about. The wait is on recording identity, because presence alone would close the
     * run already on the stage, which on a cold load is § D232's boot demo.
     */
    expect(leaveBody ?? '').toContain('host.subscribe(');
    expect(leaveBody ?? '').toContain('=== standing');
    // Two callers and no more: the skip button on screen one, and screen two's primary.
    expect(SCREENS_SOURCE.match(/leave\(context\)/gu) ?? []).toHaveLength(2);
  });

  it('is offered from the shell against the week and the profile, once per load', () => {
    const offer = /function offerTutorial\(host: EverydayHost\): void \{([\s\S]*?)\n  \}/u
      .exec(SHELL_SOURCE)?.[1];
    expect(offer, 'offerTutorial() moved or was renamed').toBeTypeOf('string');
    // Derived, on every load, from the two records the player fills by playing.
    expect(offer ?? '').toContain('host.week().history.length');
    expect(offer ?? '').toContain('profileStore.progress()');
    expect(offer ?? '').toContain('tutorialIsDue');
    // And it only ever moves a player who is standing on the front door.
    expect(offer ?? '').toContain('EVERYDAY_ROOT');
  });
});

describe('one lesson across the two screens', () => {
  it('walks the player through the control the worked answer then uses', () => {
    /*
     * The pin § D529 clause 1 implies and does not state: screen one teaches the editor, screen two
     * shows an answer, and a tutorial in which those are two unrelated demonstrations has a screen
     * count rather than a lesson. The walkthrough's second step is named for a real lever, and that
     * lever's `writes` clause names the field the case's diagnosed repair patches.
     */
    const step = TUTORIAL_STEPS.find((candidate) => candidate.id === 'spread');
    expect(step, 'the walkthrough no longer names a lever step').toBeDefined();

    const levers = plainLeversOf(
      { name: 'baseline', weights: {}, flags: { zone: false } } as never,
      { parking: false } as never,
    );
    const lever = levers.find((candidate) => candidate.id === step?.id);
    expect(lever, `${String(step?.id)} is not one of the shipped plain levers`).toBeDefined();
    expect(lever?.writes).toContain('idle.parkingStrategy');
    // The case's own repair is read in `tutorialRuns.test.ts`, which has the file loaded; here the
    // claim is the half this module can make on its own — the step names a control that writes.
    expect(step?.control).toBe(lever?.label);
  });

  it('never draws a figure it has not been handed', () => {
    /*
     * § D529: *"Both screens are real runs on the real engine, not scripted mocks … a tutorial is
     * exactly where a stand-in figure is most tempting."* So the tutorial's own copy carries no
     * digit at all: every number on either screen arrives from a run through
     * `tutorialWalkthroughViewOf`'s `figures` or the worked answer's counts.
     *
     * The shipped case's copy does carry digits — *7 waits over a minute*, *112 s* — and that is
     * correct and out of scope here: `fixit/cases.test.ts` pins every one of them to a real run of
     * the same case, which is the stronger guarantee and the reason the tutorial quotes the case
     * rather than restating it.
     */
    const authored = [
      ...Object.values(TUTORIAL_COPY),
      ...TUTORIAL_ABSENCES,
      ...TUTORIAL_STEPS.flatMap((step) => [step.control, step.title, step.body]),
    ];
    expect(authored.length).toBeGreaterThan(20);
    for (const text of authored) {
      expect(/\d/u.test(text), `a tutorial string carries its own figure: "${text}"`).toBe(false);
    }
  });

  it('says the run has not landed rather than showing a zero', () => {
    const pending = tutorialWalkthroughViewOf({ figures: [] });
    expect(pending.figures).toEqual([]);
    expect(pending.figuresNote).toBe(TUTORIAL_COPY.figuresPending);

    const landed = tutorialWalkthroughViewOf({
      figures: [{ id: 'f0', label: 'Waits over a minute', value: '7 of 41 journeys', note: 'x' }],
    });
    expect(landed.figuresNote).toBe(TUTORIAL_COPY.figuresLanded);
  });

  it('quotes the letter and the symptom, or leaves them absent rather than filling them in', () => {
    /*
     * The worked answer is not one of this view's fields — it is its own component, because
     * § D529 clause 2 makes it the thing Rush reuses and a copy hanging off this view would be a
     * second place it could be worded. What this view can get wrong is the letter, and the arm
     * that matters is the one before the case file has arrived: absent, never a placeholder.
     */
    const loading = tutorialCollapseViewOf({});
    expect(loading.complaint).toBeUndefined();
    expect(loading.complainer).toBeUndefined();
    expect(loading.symptom).toBeUndefined();
    // The chrome is still there, so the screen is a screen rather than a blank.
    expect(loading.title).toBe(TUTORIAL_COPY.collapseTitle);
    expect(loading.finish).toBe(TUTORIAL_COPY.finish);

    const loaded = tutorialCollapseViewOf({
      complaint: 'all three sit downstairs together',
      complainer: 'resident, floor 4',
      symptom: 'waits over a minute for a car up',
    });
    expect(loaded.complaint).toContain('downstairs together');
    expect(loaded.complainer).toBe('resident, floor 4');
    expect(loaded.symptom).toContain('over a minute');
  });
});

describe('the tutorial is outside `docs/33`’s difficulty curve — § D528', () => {
  it('is not a ladder position: no stage, contract or goal set names it', () => {
    /*
     * The mechanical half. `docs/33`'s rules are about scenarios, and a tutorial scored against
     * DC-1 or a survivor-count budget is a rule applied to something it was not written for. So the
     * three files that define ladder positions are read and none of them may name the tutorial's
     * case or either of its screen keys.
     */
    for (const file of ['data/campaign.json', 'data/scenario-goals.json']) {
      const text = read(file);
      expect(text.includes(TUTORIAL_CASE_ID), `${file} names the tutorial's case`).toBe(false);
      for (const key of ['"tutorial"', '"collapse"']) {
        expect(text.includes(key), `${file} names ${key} as a stage`).toBe(false);
      }
    }
    // And the case the tutorial teaches is a fix case, which is where it is authored.
    expect(read('data/fixit-cases.json')).toContain(TUTORIAL_CASE_ID);
  });

  it('is scored by nothing: the tutorial modules reach no goal, contract or judge', () => {
    for (const [name, source] of [
      ['tutorialModel.ts', MODEL_SOURCE],
      ['tutorialScreens.ts', SCREENS_SOURCE],
      ['workedAnswer.ts', read('packages/viz/src/everyday/workedAnswer.ts')],
    ] as const) {
      for (const forbidden of [
        'shift/goals.js',
        'shift/contracts.js',
        'campaign/judge.js',
        'scenario/goalReport.js',
      ]) {
        expect(source.includes(forbidden), `${name} imports ${forbidden}`).toBe(false);
      }
    }
  });

  it('is stated in `docs/33` § 1.6, live rather than struck', () => {
    /*
     * `stageLadderClaims.test.ts`'s rule, borrowed: a figure or a claim inside `~~…~~` is history
     * and one in a shape is still being asserted. The sentence § D528 obliges this lane to be able
     * to point at must be there and must not be struck, or *asserted to be outside the curve* is a
     * claim resting on a document nobody checked.
     */
    const doc = read('docs/33-difficulty-curve.md')
      .replace(/~~[\s\S]*?~~/gu, (span) => ' '.repeat(span.length))
      // Line wrapping is the document's, not the claim's — the sentence spans two lines today and
      // would span one after any re-wrap, and a guard that broke on that would be about layout.
      .replace(/\s+/gu, ' ');
    expect(doc).toContain('The tutorial is outside the curve.');
    expect(doc).toContain('not a ladder position and is governed by none of DC-1 through DC-9');
    expect(doc).toContain('It is the one place a worked answer is permitted');
  });
});
